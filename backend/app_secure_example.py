"""
Exempel på hur du integrerar säkerhetsförbättringarna i din app.py
"""

import os
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from flask_session import Session
from datetime import datetime, timedelta
import secrets

# Importera säkerhetsmoduler
from auth_utils_secure import require_auth, get_user_info_from_token
from security import validate_attendance_data, sanitize_string
from simple_rate_limiter import rate_limit, rate_limit_auth, rate_limiter
from security_headers import init_security_headers

app = Flask(__name__)

# Säker secret key
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', secrets.token_hex(32))

# Session config med säkerhet
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = '/tmp/flask_session'
app.config['SESSION_PERMANENT'] = False
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=2)
app.config['SESSION_COOKIE_SECURE'] = True  # HTTPS only
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

Session(app)

# CORS med säkerhet
CORS(app, 
     origins=[os.getenv('FRONTEND_URL', 'http://localhost:3000')],
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization'])

# Initiera säkerhetsheaders
init_security_headers(app)

# Rensa rate limiter periodiskt (kan köras i en separat tråd)
@app.before_request
def cleanup_rate_limiter():
    if not hasattr(app, 'last_cleanup'):
        app.last_cleanup = datetime.now()
    
    if (datetime.now() - app.last_cleanup).seconds > 3600:
        rate_limiter.cleanup()
        app.last_cleanup = datetime.now()

@app.route('/api/login', methods=['POST'])
@rate_limit_auth(max_requests=5, window_seconds=300)  # Max 5 inloggningar per 5 min
def login():
    try:
        data = request.get_json()
        token = data.get('token')
        
        if not token:
            return jsonify({'error': 'Token saknas'}), 400
        
        # Validera token med signaturverifiering
        user_info = get_user_info_from_token(token)
        if not user_info:
            return jsonify({'error': 'Ogiltig token'}), 401
        
        # Skapa session
        session['azure_user'] = user_info
        session['login_time'] = datetime.now()
        session.permanent = False
        
        # Logga inloggning (utan känslig data)
        print(f"User logged in: {user_info.get('oid', 'unknown')}")
        
        return jsonify({
            'success': True,
            'user': {
                'name': user_info['name'],
                'email': user_info['email']
            }
        })
        
    except Exception as e:
        print(f"Login error: {str(e)}")
        return jsonify({'error': 'Inloggning misslyckades'}), 500

@app.route('/api/attendance', methods=['POST'])
@require_auth
@rate_limit(max_requests=100, window_seconds=60)  # Max 100 requests per minut
def create_attendance():
    try:
        data = request.get_json()
        # Dummy home context for validation example; replace with a fetched home doc in real usage
        home_doc = {}
        # Validera all input
        is_valid, errors = validate_attendance_data(data, home_doc)
        if not is_valid:
            return jsonify({'errors': errors}), 400
        
        # Sanitera strings
        data['activity'] = sanitize_string(data['activity'])
        
        # Lägg till metadata
        data['registered_by'] = session['azure_user']['email']
        data['registered_at'] = datetime.now().isoformat()
        
        # Spara till Firestore (din befintliga kod)
        # ...
        
        return jsonify({'success': True, 'message': 'Närvaro registrerad'})
        
    except Exception as e:
        # Logga fel utan att exponera känslig info
        print(f"Error creating attendance: {str(e)}")
        return jsonify({'error': 'Ett fel uppstod vid registrering'}), 500

@app.errorhandler(429)
def rate_limit_handler(e):
    return jsonify({'error': 'För många förfrågningar. Vänta en stund.'}), 429

@app.errorhandler(500)
def internal_error_handler(e):
    # Logga fel internt utan att exponera detaljer
    print(f"Internal error: {str(e)}")
    return jsonify({'error': 'Ett serverfel uppstod'}), 500

if __name__ == '__main__':
    # Kör ALDRIG med debug=True i produktion!
    app.run(debug=False, port=10000)
