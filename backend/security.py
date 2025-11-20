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

ALLOWED_GENDERS = {'men', 'women'}
ALLOWED_VISIT_TYPES = {'group', 'individual'}
ALLOWED_OFFER_STATUS = {'accepted', 'declined'}
MAX_DURATION_MINUTES = 720
MIN_DURATION_MINUTES = 1
MAX_PARTICIPANTS_PER_ENTRY = 1000
MAX_DEPARTMENTS_PER_HOME = 20

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
            # Använd IP-adress efter ProxyFix (X-Forwarded-For hanteras i WSGI-lagret)
            key = request.remote_addr or 'unknown'
            
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
        "script-src 'self' https://login.microsoftonline.com; "
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

def validate_home_id(home_id):
    """Validera äldreboende-ID."""
    if not home_id or not isinstance(home_id, str):
        return False, "Äldreboende-ID saknas"
    if not re.match(r'^[a-z0-9-]{1,50}$', home_id):
        return False, "Ogiltigt format för äldreboende-ID"
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

def validate_visit_type(visit_type):
    if visit_type not in ALLOWED_VISIT_TYPES:
        return False, f"Ogiltig typ. Måste vara en av: {', '.join(sorted(ALLOWED_VISIT_TYPES))}"
    return True, None


def validate_offer_status(status):
    if status not in ALLOWED_OFFER_STATUS:
        return False, f"Ogiltigt svar. Måste vara en av: {', '.join(sorted(ALLOWED_OFFER_STATUS))}"
    return True, None


def validate_name(value, field='fältet', max_length=100):
    if not value or not isinstance(value, str):
        return False, f"{field} saknas"
    value = value.strip()
    if not value:
        return False, f"{field} får inte vara tomt"
    if len(value) > max_length:
        return False, f"{field} får högst innehålla {max_length} tecken"
    if not re.match(r'^[a-zA-ZåäöÅÄÖ0-9\s\-\_]+$', value):
        return False, f"{field} innehåller ogiltiga tecken"
    return True, None


def validate_gender_counts(gender_counts, visit_type, offer_status=None):
    if not isinstance(gender_counts, dict):
        return False, "Deltagarantal måste vara ett objekt"
    total = 0
    for gender in ALLOWED_GENDERS:
        value = gender_counts.get(gender, 0)
        if not isinstance(value, int) or value < 0 or value > MAX_PARTICIPANTS_PER_ENTRY:
            return False, f"Ogiltigt värde för {gender} (0-{MAX_PARTICIPANTS_PER_ENTRY})"
        total += value
    # Tillåt 0 deltagare om besöket avböjdes
    if offer_status != 'declined' and total <= 0:
        return False, "Minst en deltagare måste anges"
    if visit_type == 'individual' and offer_status != 'declined' and total != 1:
        return False, "Enskild registrering måste avse exakt en person"
    return True, None


def validate_duration_minutes(value):
    if value is None:
        return False, "Varaktighet i minuter krävs"
    if not isinstance(value, int):
        return False, "Varaktighet måste anges i heltal"
    if value < MIN_DURATION_MINUTES or value > MAX_DURATION_MINUTES:
        return False, f"Varaktighet måste vara mellan {MIN_DURATION_MINUTES}-{MAX_DURATION_MINUTES} minuter"
    return True, None


def validate_satisfaction_entries(entries, total_participants):
    if entries is None:
        return True, None
    if not isinstance(entries, list):
        return False, "Nöjdhet måste vara en lista"
    if len(entries) > total_participants:
        return False, "Antalet nöjdhetsnoteringar får inte överstiga antalet deltagare"
    for entry in entries:
        if not isinstance(entry, dict):
            return False, "Nöjdhetsposter måste vara objekt"
        gender = entry.get('gender')
        rating = entry.get('rating')
        if gender not in ALLOWED_GENDERS:
            return False, "Nöjdhet måste kopplas till man eller kvinna"
        if not isinstance(rating, int) or rating < 1 or rating > 6:
            return False, "Nöjdhet måste vara ett heltal mellan 1-6"
    return True, None


def validate_department(home_doc, department_id, existing_department_id=None):
    if not department_id or not isinstance(department_id, str):
        if existing_department_id and department_id == existing_department_id:
            # Allow legacy department to pass through even if missing now
            return True, None
        return False, "Avdelning måste anges"
    departments = (home_doc or {}).get('departments') or []
    for dept in departments:
        if dept.get('id') == department_id:
            if dept.get('active', True):
                return True, None
            break
    if existing_department_id and department_id == existing_department_id:
        # Allow edits to legacy/removed departments
        return True, None
    return False, "Ogiltig avdelning"

def validate_attendance_data(data, home_doc=None, existing_department_id=None):
    """Validera utevistelse-data."""
    errors = []

    valid, error = validate_home_id(data.get('home_id'))
    if not valid:
        errors.append(error)

    valid, error = validate_department(home_doc, data.get('department_id'), existing_department_id=existing_department_id)
    if not valid:
        errors.append(error)

    valid, error = validate_date(data.get('date'))
    if not valid:
        errors.append(error)

    valid, error = validate_visit_type(data.get('visit_type'))
    if not valid:
        errors.append(error)

    valid, error = validate_offer_status(data.get('offer_status'))
    if not valid:
        errors.append(error)

    valid_gc, gc_error = validate_gender_counts(data.get('gender_counts', {}), data.get('visit_type'), data.get('offer_status'))
    if not valid_gc:
        errors.append(gc_error)
    total = 0
    if valid_gc:
        total = sum(int(data.get('gender_counts', {}).get(g, 0)) for g in ALLOWED_GENDERS)

    if data.get('offer_status') == 'accepted':
        valid, error = validate_name(data.get('activity_name'), field='Aktivitet')
        if not valid:
            errors.append(error)
        valid, error = validate_name(data.get('companion_name'), field='Med vem')
        if not valid:
            errors.append(error)
        valid, error = validate_duration_minutes(data.get('duration_minutes'))
        if not valid:
            errors.append(error)

    valid, error = validate_satisfaction_entries(data.get('satisfaction_entries'), total)
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

def validate_home_name(name):
    """Validera namn för äldreboende"""
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
