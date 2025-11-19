import os
import logging
from functools import wraps
from flask import request, jsonify, session
import requests
from requests import RequestException
from datetime import datetime, timedelta
import jwt
from jwt import PyJWKClient
from jwt import exceptions as jwt_exceptions
from cosmos_service import CosmosService

logger = logging.getLogger(__name__)

_jwk_client = None


def _get_jwk_client():
    """Return a cached PyJWKClient for the configured Azure tenant."""
    global _jwk_client
    tenant_id = os.getenv('AZURE_TENANT_ID')
    if not tenant_id:
        raise RuntimeError('AZURE_TENANT_ID must be configured for token validation')
    if _jwk_client is None:
        jwk_url = f'https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys'
        _jwk_client = PyJWKClient(jwk_url)
    return _jwk_client


def _validate_graph_token(token: str) -> dict:
    """Validate Microsoft Graph access token signature/audience/tenant/client."""
    jwk_client = _get_jwk_client()
    signing_key = jwk_client.get_signing_key_from_jwt(token)
    audience = 'https://graph.microsoft.com'
    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=['RS256'],
        audience=[audience, f'{audience}/'],
    )

    tenant_id = os.getenv('AZURE_TENANT_ID')
    if tenant_id and claims.get('tid') != tenant_id:
        raise jwt_exceptions.InvalidTokenError('Unexpected tenant in token')

    client_id = os.getenv('AZURE_CLIENT_ID')
    azp = claims.get('azp') or claims.get('appid')
    if client_id and azp != client_id:
        raise jwt_exceptions.InvalidTokenError('Unexpected client/application in token')

    return claims

def get_azure_config():
    """Returnerar Azure AD-konfiguration för MSAL"""
    azure_client_id = os.getenv('AZURE_CLIENT_ID')
    azure_tenant_id = os.getenv('AZURE_TENANT_ID')
    
    if not azure_client_id or not azure_tenant_id:
        logger.error("Azure AD configuration missing")
        return jsonify({'error': 'Azure AD configuration not available'}), 500
    
    # Bestäm redirect URI baserat på request
    scheme = request.headers.get('X-Forwarded-Proto', 'http')
    host = request.headers.get('Host', 'localhost:10000')
    redirect_uri = f"{scheme}://{host}"
    
    config = {
        'clientId': azure_client_id,
        'tenantId': azure_tenant_id,
        'redirectUri': redirect_uri,
        'scopes': ['User.Read', 'profile', 'openid', 'email']
    }
    
    return jsonify(config)

def validate_azure_token(token):
    """Validate Azure AD token cryptographically and fetch profile from Graph."""
    try:
        claims = _validate_graph_token(token)
    except jwt_exceptions.InvalidTokenError as exc:
        logger.warning(f"Azure token rejected: {exc}")
        return None
    except Exception as exc:
        logger.error(f"Failed to validate Azure token: {exc}")
        return None

    try:
        graph_response = requests.get(
            'https://graph.microsoft.com/v1.0/me',
            headers={'Authorization': f'Bearer {token}'},
            timeout=5
        )
    except RequestException as exc:
        logger.error(f"Graph API unreachable: {exc}")
        return None

    if graph_response.status_code != 200:
        logger.error(f"Graph API validation failed: {graph_response.status_code}")
        return None

    user_data = graph_response.json()
    return {
        'name': user_data.get('displayName') or claims.get('name', ''),
        'given_name': user_data.get('givenName') or claims.get('given_name', ''),
        'email': user_data.get('mail') or user_data.get('userPrincipalName') or claims.get('preferred_username', ''),
        'preferred_username': user_data.get('userPrincipalName') or claims.get('preferred_username', ''),
        'upn': user_data.get('userPrincipalName') or claims.get('upn', ''),
        'oid': user_data.get('id') or claims.get('oid', 'unknown'),
        'tid': claims.get('tid', os.getenv('AZURE_TENANT_ID', 'unknown'))
    }

def get_azure_user():
    """Hämtar användarinfo från Azure AD token"""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'No authorization token provided'}), 401
    
    token = auth_header.split(' ')[1]
    
    try:
        # Validera token med Microsoft Graph API
        user_data = validate_azure_token(token)
        if not user_data:
            return jsonify({'error': 'Invalid token'}), 401
        
        # Formatera användarinfo
        user_info = {
            'name': user_data.get('given_name') or user_data.get('name', 'Användare'),
            'email': user_data.get('email', 'unknown@email.com'),
            'full_name': user_data.get('name', ''),
            'oid': user_data.get('oid', 'unknown'),
            'tid': user_data.get('tid', 'unknown')
        }
        
        # Spara i session med tidsstämpel
        session['azure_user'] = user_info
        session['login_time'] = datetime.now().isoformat()
        session.modified = True
        session.permanent = False

        # Upsert user into Cosmos DB users container
        try:
            cs = CosmosService()
            cs.upsert_user(user_info.get('oid'), user_info.get('email'), user_info.get('full_name') or user_info.get('name'))
        except Exception as e:
            logger.error(f"Failed to upsert user in Cosmos DB: {e}")

        logger.info(f"User logged in: OID={user_info['oid']}")
        return jsonify(user_info)
        
    except Exception as e:
        logger.error(f"Error fetching user info: {str(e)}")
        return jsonify({'error': 'Failed to fetch user info'}), 500

def require_auth(f):
    """Decorator som kräver autentisering med förbättrad säkerhet"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Kontrollera session
        if 'azure_user' not in session:
            logger.warning(f"Authentication failed for {request.path}. No user in session.")
            return jsonify({'error': 'Authentication required'}), 401
            
        # Kontrollera session timeout (2 timmar)
        if 'login_time' in session:
            login_time = session['login_time']
            if isinstance(login_time, str):
                login_time = datetime.fromisoformat(login_time)
            
            if (datetime.now() - login_time).total_seconds() > 7200:
                session.clear()
                logger.warning(f"Session expired for user: {session.get('azure_user', {}).get('email', 'unknown')}")
                return jsonify({'error': 'Session expired'}), 401
        
        # Logga utan känslig data
        user_oid = session.get('azure_user', {}).get('oid', 'unknown')
        logger.info(f"Auth successful for user OID: {user_oid} on endpoint: {request.path}")
        
        return f(*args, **kwargs)
    return decorated_function


def require_superadmin(f):
    """Decorator that allows only SUPERADMIN_EMAIL."""
    @wraps(f)
    def decorated(*args, **kwargs):
        azure_user = session.get('azure_user') or {}
        superadmin_email = (os.getenv('SUPERADMIN_EMAIL') or '').strip().lower()
        user_email = (azure_user.get('email') or '').strip().lower()
        if not superadmin_email or user_email != superadmin_email:
            logger.warning(f"Superadmin required for {request.path}. user_email={user_email}")
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    """Decorator that allows SUPERADMIN or users/{oid}.roles.admin == true."""
    @wraps(f)
    def decorated(*args, **kwargs):
        azure_user = session.get('azure_user') or {}
        user_email = (azure_user.get('email') or '').strip().lower()
        superadmin_email = (os.getenv('SUPERADMIN_EMAIL') or '').strip().lower()
        if superadmin_email and user_email == superadmin_email:
            return f(*args, **kwargs)
        # Check Cosmos role
        try:
            cs = CosmosService()
            u = cs.get_user(azure_user.get('oid'))
            if u and isinstance(u.get('roles'), dict) and bool(u['roles'].get('admin')):
                return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"Error checking admin role: {e}")
        logger.warning(f"Admin required for {request.path}. OID={azure_user.get('oid')} email={user_email}")
        return jsonify({'error': 'Forbidden'}), 403
    return decorated
