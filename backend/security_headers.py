from flask import make_response

def add_security_headers(response):
    """Lägg till säkerhetsheaders till response"""
    # Förhindra MIME type sniffing
    response.headers['X-Content-Type-Options'] = 'nosniff'
    
    # Förhindra clickjacking
    response.headers['X-Frame-Options'] = 'DENY'
    
    # Aktivera XSS-skydd i äldre webbläsare
    response.headers['X-XSS-Protection'] = '1; mode=block'
    
    # Tvinga HTTPS
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    
    # Content Security Policy
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://login.microsoftonline.com; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "font-src 'self' data:; "
        "connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com; "
        "frame-src 'none'; "
        "object-src 'none'"
    )
    response.headers['Content-Security-Policy'] = csp
    
    # Referrer Policy
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    
    # Permissions Policy (ersätter Feature Policy)
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