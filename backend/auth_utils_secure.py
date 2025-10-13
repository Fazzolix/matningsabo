import os
import jwt
import requests
from functools import wraps
from flask import session, jsonify
from jwt import PyJWKClient
from datetime import datetime, timezone

AZURE_TENANT_ID = os.getenv('AZURE_TENANT_ID')
AZURE_CLIENT_ID = os.getenv('AZURE_CLIENT_ID')

def validate_azure_token(token):
    """Validera Azure AD token med signaturverifiering"""
    try:
        # Hämta Azures publika nycklar
        jwks_uri = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}/discovery/v2.0/keys"
        jwks_client = PyJWKClient(jwks_uri)
        
        # Hämta signeringsnyckel
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        # Validera och dekoda token
        decoded = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=AZURE_CLIENT_ID,
            issuer=f"https://login.microsoftonline.com/{AZURE_TENANT_ID}/v2.0",
            options={"verify_exp": True}
        )
        
        # Kontrollera att token inte är för gammal
        iat = decoded.get('iat', 0)
        current_time = datetime.now(timezone.utc).timestamp()
        if current_time - iat > 3600:  # Token äldre än 1 timme
            raise jwt.InvalidTokenError("Token too old")
            
        return decoded
    except Exception as e:
        print(f"Token validation error: {str(e)}")
        return None

def get_user_info_from_token(token):
    """Hämta användarinfo från validerad token"""
    decoded = validate_azure_token(token)
    if not decoded:
        return None
        
    # Hämta användarinfo från token claims
    return {
        'name': decoded.get('name', 'Unknown'),
        'email': decoded.get('preferred_username', decoded.get('upn', 'unknown@email.com')),
        'oid': decoded.get('oid', 'unknown'),
        'tid': decoded.get('tid', 'unknown')
    }

def require_auth(f):
    """Decorator som kräver autentisering med förbättrad säkerhet"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Kontrollera session
        if 'azure_user' not in session:
            return jsonify({'error': 'Authentication required'}), 401
            
        # Kontrollera session timeout (2 timmar)
        if 'login_time' in session:
            login_time = session['login_time']
            if isinstance(login_time, str):
                login_time = datetime.fromisoformat(login_time)
            
            if (datetime.now() - login_time).total_seconds() > 7200:
                session.clear()
                return jsonify({'error': 'Session expired'}), 401
                
        return f(*args, **kwargs)
    return decorated_function