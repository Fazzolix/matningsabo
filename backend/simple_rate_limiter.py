import time
from collections import defaultdict, deque
from functools import wraps
from flask import request, jsonify
from threading import Lock

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
            # Använd IP-adress som nyckel
            key = request.remote_addr
            
            if not rate_limiter.is_allowed(key, max_requests, window_seconds):
                return jsonify({
                    'error': 'För många förfrågningar. Vänta en stund och försök igen.'
                }), 429
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def rate_limit_auth(max_requests=5, window_seconds=300):
    """Striktare rate limiting för autentisering"""
    return rate_limit(max_requests, window_seconds)