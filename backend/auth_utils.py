import os
import logging
import base64
import json
from functools import wraps
from flask import request, jsonify, session
import requests
from requests import RequestException
from datetime import datetime, timedelta, timezone
from cosmos_service import CosmosService

logger = logging.getLogger(__name__)

def _decode_claims(token: str) -> dict:
    """Decode JWT payload without verifying signature."""
    try:
        _header, payload, _sig = token.split('.')
        payload += '=' * (-len(payload) % 4)
        data = base64.urlsafe_b64decode(payload.encode('utf-8'))
        return json.loads(data.decode('utf-8'))
    except Exception:
        return {}

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
    """Validate Azure AD Graph token using claim inspection + Graph API."""
    claims = _decode_claims(token)
    if not claims:
        logger.warning('Token saknar claims')
        return None

    now = datetime.now(timezone.utc).timestamp()
    try:
        exp = float(claims.get('exp'))
        if now > exp:
            logger.warning('Token har utgått')
            return None
    except Exception:
        logger.warning('Token saknar exp-claim')
        return None

    try:
        nbf = float(claims.get('nbf', 0))
        if now < nbf:
            logger.warning('Token inte giltig ännu (nbf)')
            return None
    except Exception:
        pass

    expected_tid = (os.getenv('AZURE_TENANT_ID') or '').strip().lower()
    token_tid = str(claims.get('tid') or '').strip().lower()
    if expected_tid and token_tid != expected_tid:
        logger.warning('Token tenant mismatch: expected %s got %s', expected_tid, token_tid)
        return None

    aud = str(claims.get('aud') or '').strip().rstrip('/').lower()
    allowed_aud = {'https://graph.microsoft.com', '00000003-0000-0000-c000-000000000000'}
    if aud not in allowed_aud:
        logger.warning('Unexpected token audience: %s', claims.get('aud'))
        return None

    iss = str(claims.get('iss') or '')
    allowed_issuers = (
        'https://login.microsoftonline.com/',
        'https://sts.windows.net/',
    )
    if not any(iss.lower().startswith(prefix) for prefix in allowed_issuers):
        logger.warning('Unexpected issuer: %s', iss)
        return None
    if expected_tid and expected_tid not in iss.lower():
        logger.warning('Issuer tenant mismatch: %s', iss)
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
    token_oid = str(claims.get('oid') or '').strip().lower()
    graph_oid = str(user_data.get('id') or '').strip().lower()
    if token_oid and graph_oid and token_oid != graph_oid:
        logger.warning('OID mismatch mellan token och Graph: %s vs %s', token_oid, graph_oid)
        return None

    return {
        'name': user_data.get('displayName', ''),
        'given_name': user_data.get('givenName', ''),
        'email': user_data.get('mail') or user_data.get('userPrincipalName', ''),
        'preferred_username': user_data.get('userPrincipalName', ''),
        'upn': user_data.get('userPrincipalName', ''),
        'oid': graph_oid or token_oid or 'unknown',
        'tid': token_tid or expected_tid or 'unknown'
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
