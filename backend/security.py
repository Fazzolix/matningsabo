"""
Säkerhetsmodul för Traffpunk - innehåller rate limiting och säkerhetsheaders
"""
import time
import re
from collections import defaultdict, deque
from functools import wraps
from flask import request, jsonify, make_response
from threading import Lock
from datetime import datetime

# ========== RATE LIMITING ==========

class SimpleRateLimiter:
    def __init__(self):
        self.requests = defaultdict(deque)
        self.lock = Lock()
    
    def is_allowed(self, key, max_requests, window_seconds):
        """Kontrollera om request är tillåten"""
        now = time.time()
        cutoff = now - window_seconds
        
        with self.lock:
            # Rensa gamla requests
            while self.requests[key] and self.requests[key][0] < cutoff:
                self.requests[key].popleft()
            
            # Kontrollera antal
            if len(self.requests[key]) >= max_requests:
                return False
            
            # Lägg till ny request
            self.requests[key].append(now)
            return True
    
    def cleanup(self):
        """Rensa gamla entries (kör periodiskt)"""
        cutoff = time.time() - 3600  # Behåll senaste timmen
        
        with self.lock:
            keys_to_delete = []
            for key, times in self.requests.items():
                # Rensa gamla tider
                while times and times[0] < cutoff:
                    times.popleft()
                
                # Ta bort tomma keys
                if not times:
                    keys_to_delete.append(key)
            
            for key in keys_to_delete:
                del self.requests[key]

# Global instans
rate_limiter = SimpleRateLimiter()

def rate_limit(max_requests=60, window_seconds=60):
    """Decorator för rate limiting"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Använd IP-adress som nyckel (tar hänsyn till proxies)
            key = request.headers.get('X-Forwarded-For', request.remote_addr) or 'unknown'
            # Ta första IP om flera (vid proxy-chains)
            if ',' in key:
                key = key.split(',')[0].strip()
            
            if not rate_limiter.is_allowed(key, max_requests, window_seconds):
                return jsonify({
                    'error': 'För många förfrågningar. Vänta en stund och försök igen.'
                }), 429
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def rate_limit_auth(max_requests=100, window_seconds=300):
    """Rate limiting för autentisering - generös för arbetsplatser"""
    return rate_limit(max_requests, window_seconds)

# ========== SÄKERHETSHEADERS ==========

def add_security_headers(response):
    """Lägg till säkerhetsheaders till response"""
    # Förhindra MIME type sniffing
    response.headers['X-Content-Type-Options'] = 'nosniff'
    
    # Förhindra clickjacking
    response.headers['X-Frame-Options'] = 'DENY'
    
    # Aktivera XSS-skydd i äldre webbläsare
    response.headers['X-XSS-Protection'] = '1; mode=block'
    
    # Tvinga HTTPS i produktion
    if request.headers.get('X-Forwarded-Proto') == 'https':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    
    # Content Security Policy
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://login.microsoftonline.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "img-src 'self' data: https:; "
        "font-src 'self' data: https://fonts.gstatic.com; "
        "connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com; "
        "frame-src 'none'; "
        "object-src 'none'"
    )
    response.headers['Content-Security-Policy'] = csp
    
    # Referrer Policy
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    
    # Permissions Policy
    response.headers['Permissions-Policy'] = (
        'accelerometer=(), camera=(), geolocation=(), '
        'gyroscope=(), magnetometer=(), microphone=(), '
        'payment=(), usb=()'
    )
    
    return response

def init_security_headers(app):
    """Initiera säkerhetsheaders för Flask app"""
    @app.after_request
    def set_security_headers(response):
        return add_security_headers(response)

# ========== INPUT VALIDERING ==========

def validate_traffpunkt_id(traffpunkt_id):
    """Validera träffpunkt ID"""
    if not traffpunkt_id or not isinstance(traffpunkt_id, str):
        return False, "Träffpunkt ID saknas"
    
    # Endast alfanumeriska tecken och bindestreck, max 50 tecken
    if not re.match(r'^[a-z0-9-]{1,50}$', traffpunkt_id):
        return False, "Ogiltigt träffpunkt ID format"
    
    return True, None

def validate_date(date_str):
    """Validera datumformat"""
    if not date_str:
        return False, "Datum saknas"
    
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True, None
    except ValueError:
        return False, "Ogiltigt datumformat (använd YYYY-MM-DD)"

def validate_time_block(time_block):
    """Validera tidsblock"""
    valid_blocks = ['fm', 'em', 'kv']  # fm=förmiddag, em=eftermiddag, kv=kväll
    if time_block not in valid_blocks:
        return False, f"Ogiltigt tidsblock. Måste vara en av: {', '.join(valid_blocks)}"
    return True, None

def validate_activity(activity):
    """Validera aktivitet"""
    if not activity or not isinstance(activity, str):
        return False, "Aktivitet saknas"
    
    # Max 100 tecken, inga farliga tecken
    if len(activity) > 100:
        return False, "Aktivitetsnamn för långt (max 100 tecken)"
    
    if not re.match(r'^[a-zA-ZåäöÅÄÖ0-9\s\-\_]+$', activity):
        return False, "Ogiltiga tecken i aktivitetsnamn"
    
    return True, None

def validate_participants(participants):
    """Validera deltagardata"""
    if not isinstance(participants, dict):
        return False, "Deltagardata måste vara ett objekt"

    # Tillåtna och obligatoriska kategorier
    allowed_categories = ['boende', 'externa', 'nya', 'trygghetsboende']
    required_categories = ['boende', 'externa', 'nya']  # trygghetsboende är ny och valfri

    # Okända kategorier ska inte accepteras (förebygger stavfel i payload)
    for category in participants.keys():
        if category not in allowed_categories:
            return False, f"Okänd kategori '{category}'"

    # Kontrollera obligatoriska kategorier och att de är objekt
    for category in required_categories:
        if category not in participants:
            return False, f"Kategori '{category}' saknas"
        if not isinstance(participants[category], dict):
            return False, f"Kategori '{category}' måste vara ett objekt"

    # Validera numeriska värden för de kategorier som finns med
    for category, values in participants.items():
        if not isinstance(values, dict):
            return False, f"Kategori '{category}' måste vara ett objekt"
        for gender in ['men', 'women']:
            if gender in values:
                value = values[gender]
                if not isinstance(value, int) or value < 0 or value > 1000:
                    return False, f"Ogiltigt antal för {category}.{gender} (måste vara 0-1000)"

    return True, None

def validate_attendance_data(data):
    """Validera all närvarodata"""
    errors = []
    
    # Validera träffpunkt
    valid, error = validate_traffpunkt_id(data.get('traffpunkt_id'))
    if not valid:
        errors.append(error)
    
    # Validera datum
    valid, error = validate_date(data.get('date'))
    if not valid:
        errors.append(error)
    
    # Validera tidsblock
    valid, error = validate_time_block(data.get('time_block'))
    if not valid:
        errors.append(error)
    
    # Validera aktivitet
    valid, error = validate_activity(data.get('activity'))
    if not valid:
        errors.append(error)
    
    # Validera deltagare
    valid, error = validate_participants(data.get('participants', {}))
    if not valid:
        errors.append(error)
    
    return len(errors) == 0, errors

def sanitize_string(value, max_length=100):
    """Sanitera sträng för säker lagring"""
    if not value:
        return ""
    
    # Ta bort farliga tecken
    value = re.sub(r'[<>&\'"\\]', '', str(value))
    
    # Begränsa längd
    return value[:max_length].strip()

def validate_traffpunkt_name(name):
    """Validera träffpunktnamn"""
    if not name or not isinstance(name, str):
        return False, "Namn saknas"
    
    name = name.strip()
    if not name:
        return False, "Namn får inte vara tomt"
    
    if len(name) > 50:
        return False, "Namnet är för långt (max 50 tecken)"
    
    # Tillåt svenska bokstäver och grundläggande tecken
    if not re.match(r'^[a-zA-ZåäöÅÄÖ0-9\s\-\_]+$', name):
        return False, "Namnet innehåller ogiltiga tecken"
    
    return True, None
