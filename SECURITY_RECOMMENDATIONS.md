# 🔒 Säkerhetsrekommendationer för Traffpunk

## 🚨 Kritiska åtgärder före produktion

### 1. Token-validering (KRITISK)
**Problem:** Tokens valideras endast via API-anrop, inte kryptografiskt.
**Risk:** Möjlig token-förfalskning och unauthorized access.

**Åtgärd:**
```python
# backend/auth_utils.py - Lägg till:
import jwt
from jwt import PyJWKClient

def validate_azure_token(token):
    jwks_uri = f"https://login.microsoftonline.com/{os.getenv('AZURE_TENANT_ID')}/discovery/v2.0/keys"
    jwks_client = PyJWKClient(jwks_uri)
    
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    decoded = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=os.getenv('AZURE_CLIENT_ID'),
        issuer=f"https://login.microsoftonline.com/{os.getenv('AZURE_TENANT_ID')}/v2.0"
    )
    return decoded
```

### 2. Rate Limiting (KRITISK)
**Problem:** Ingen begränsning av API-anrop.
**Risk:** DoS-attacker, brute force.

**Åtgärd:**
```python
# backend/app.py - Lägg till:
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["100 per hour", "20 per minute"],
    storage_uri="redis://localhost:6379"
)

# På känsliga endpoints:
@app.route('/api/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    # ...
```

### 3. Session-hantering (KRITISK)
**Problem:** Fil-baserade sessioner i /tmp, ingen timeout.
**Risk:** Session hijacking, skalningsproblem.

**Åtgärd:**
```python
# backend/app.py - Ersätt session config:
import redis
from datetime import timedelta

# Redis för sessions
app.config['SESSION_TYPE'] = 'redis'
app.config['SESSION_REDIS'] = redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379'))
app.config['SESSION_PERMANENT'] = False
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=2)
app.config['SESSION_COOKIE_SECURE'] = True  # HTTPS only
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
```

### 4. Input-validering (HÖG)
**Problem:** Minimal validering av användarinput.
**Risk:** XSS, injection-attacker.

**Åtgärd:**
```python
# backend/validators.py - Skapa ny fil:
from marshmallow import Schema, fields, validate, ValidationError

class AttendanceSchema(Schema):
    traffpunkt_id = fields.Str(required=True, validate=validate.Length(min=1, max=50))
    date = fields.Date(required=True)
    time_block = fields.Str(required=True, validate=validate.OneOf(['fm', 'em']))
    activity = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    participants = fields.Dict(required=True)
    
    # Validera participants structure
    @validates('participants')
    def validate_participants(self, value):
        required_keys = ['boende', 'externa', 'nya']
        for key in required_keys:
            if key not in value:
                raise ValidationError(f"Missing required key: {key}")
            # Validera numeriska värden
            for gender in ['man', 'kvinnor']:
                if gender in value[key]:
                    if not isinstance(value[key][gender], int) or value[key][gender] < 0:
                        raise ValidationError(f"Invalid participant count for {key}.{gender}")

# Använd i routes:
@app.route('/api/attendance', methods=['POST'])
@require_auth
def create_attendance():
    schema = AttendanceSchema()
    try:
        validated_data = schema.load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400
```

### 5. Säkerhetsheaders (HÖG)
**Problem:** Saknar viktiga säkerhetsheaders.
**Risk:** XSS, clickjacking, MIME-sniffing.

**Åtgärd:**
```python
# backend/app.py - Lägg till:
from flask_talisman import Talisman

# Konfigurera säkerhetsheaders
csp = {
    'default-src': "'self'",
    'script-src': "'self' 'unsafe-inline' https://login.microsoftonline.com",
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data: https:",
    'connect-src': "'self' https://login.microsoftonline.com https://graph.microsoft.com"
}

Talisman(app, 
    force_https=True,
    strict_transport_security=True,
    content_security_policy=csp,
    content_security_policy_nonce_in=['script-src', 'style-src']
)
```

### 6. Docker-säkerhet (HÖG)
**Problem:** Kör som root, world-writable directories.

**Åtgärd - Uppdatera Dockerfile:**
```dockerfile
# Skapa non-root användare
RUN adduser -D -s /bin/sh -u 1001 appuser

# Sätt rätt permissions
RUN mkdir -p /tmp/flask_session && \
    chown -R appuser:appuser /app /tmp/flask_session && \
    chmod 750 /tmp/flask_session

# Byt till non-root
USER appuser

# Exponera endast nödvändig port
EXPOSE 8080
```

## 📋 Komplett säkerhets-checklista

### Före produktion (MÅSTE):
- [ ] Implementera JWT-validering med signaturverifiering
- [ ] Lägg till rate limiting på alla endpoints
- [ ] Byt till Redis för sessions
- [ ] Implementera input-validering med schema
- [ ] Lägg till säkerhetsheaders (CSP, HSTS, etc.)
- [ ] Kör Docker container som non-root
- [ ] Uppdatera dependencies med säkerhetsfixar
- [ ] Konfigurera HTTPS endast (ta bort HTTP)
- [ ] Implementera CSRF-skydd
- [ ] Sätt upp strukturerad logging utan känslig data

### Rekommenderat (BÖR):
- [ ] Implementera API-nycklar för service-to-service
- [ ] Sätt upp WAF (Web Application Firewall)
- [ ] Aktivera Cloud Armor DDoS-skydd
- [ ] Implementera security scanning i CI/CD
- [ ] Genomför penetrationstest
- [ ] Sätt upp säkerhetsövervakning och alerting
- [ ] Skapa incident response-rutiner
- [ ] Implementera automatisk secret rotation
- [ ] Sätt upp backup och disaster recovery

## 🛠️ Snabbstart för säkerhetsåtgärder

### Steg 1: Uppdatera dependencies
```bash
cd backend
pip install PyJWT==2.9.0 flask-limiter==3.8.0 redis==5.0.8 marshmallow==3.22.0 flask-talisman==1.1.0
pip freeze > requirements.txt
```

### Steg 2: Skapa Redis-instans (Google Cloud Memorystore)
```bash
gcloud redis instances create traffpunkt-redis \
    --size=1 \
    --region=europe-west1 \
    --redis-version=redis_7_0
```

### Steg 3: Uppdatera miljövariabler
```bash
# Lägg till i Cloud Run:
REDIS_URL=redis://10.x.x.x:6379
SESSION_LIFETIME_HOURS=2
ENABLE_RATE_LIMITING=true
```

## 🚦 Riskbedömning

**Nuvarande säkerhetsläge:** 🔴 **MEDIUM-HÖG RISK**

Applikationen har grundläggande säkerhetskontroller men saknar djupgående försvar som krävs för produktion. De mest kritiska problemen är:

1. Avsaknad av korrekt token-validering
2. Ingen rate limiting
3. Svag sessionshantering
4. Minimal input-validering

**Rekommendation:** Åtgärda ALLA kritiska problem innan produktionssättning. Den nuvarande implementationen är lämplig för utveckling/test men kräver betydande härdning för produktion.

## 📞 Support

Vid frågor om säkerhetsimplementering, kontakta:
- Säkerhetsansvarig
- DevOps-teamet
- Externa säkerhetskonsulter för penetrationstest

---
*Senast uppdaterad: 2025-07-24*