import os
import secrets
import re
from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from dotenv import load_dotenv
import logging
from datetime import datetime, timedelta
from werkzeug.middleware.proxy_fix import ProxyFix
from auth_utils import require_auth, get_azure_config, get_azure_user, require_admin, require_superadmin
from cosmos_service import CosmosService
from security import (
    init_security_headers, rate_limit, rate_limit_auth, rate_limiter,
    validate_attendance_data, sanitize_string, validate_home_name
)
from azure.cosmos.exceptions import CosmosHttpResponseError

# Konfigurera loggning
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ladda miljövariabler
load_dotenv()

# Initiera Flask. 'static_url_path' är satt till '' för att låta vår catch-all hantera alla routes.
app = Flask(__name__, 
            static_folder='static',
            static_url_path='')
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

# Konfiguration med förbättrad säkerhet (cookie‑baserade signerade sessioner)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', secrets.token_hex(32))
app.config['SESSION_PERMANENT'] = False
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=2)
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('FLASK_ENV') != 'development'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_NAME'] = 'sabo_session'

# CORS med säkerhet – säkerställ att vi aldrig skickar None till Flask-CORS
default_origin = 'http://localhost:3000'
frontend_url = (os.getenv('FRONTEND_URL') or '').strip()
if not frontend_url:
    logger.warning('FRONTEND_URL is not set – falling back to %s for CORS', default_origin)

allowed_origins = [frontend_url or default_origin]
if os.environ.get('FLASK_ENV') != 'production':
    # Utveckling kan acceptera lokalt suffix (handled already ovan)
    pass

CORS(app, 
     origins=allowed_origins,
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization'])

# Initiera Cosmos DB (skapar databas/containers om de saknas)
db_service = CosmosService()

# Initiera säkerhetsheaders
init_security_headers(app)

# Rensa rate limiter periodiskt
@app.before_request
def cleanup_rate_limiter():
    if not hasattr(app, 'last_cleanup'):
        app.last_cleanup = datetime.now()
    
    if (datetime.now() - app.last_cleanup).seconds > 3600:
        rate_limiter.cleanup()
        app.last_cleanup = datetime.now()

# Health check
@app.route('/health')
@rate_limit(max_requests=1000, window_seconds=60)
def health_check():
    return jsonify({'status': 'healthy'}), 200

# Azure AD config endpoint
@app.route('/api/azure-config')
@rate_limit(max_requests=500, window_seconds=60)
def azure_config():
    return get_azure_config()

# Azure AD user endpoint
@app.route('/api/azure-user', methods=['GET', 'POST'])
@rate_limit(max_requests=500, window_seconds=60)  # Hög limit för många samtidiga inloggningar
def azure_user():
    return get_azure_user()

# Hämta alla äldreboenden
@app.route('/api/aldreboenden')
@require_auth
@rate_limit(max_requests=1000, window_seconds=60)
def get_homes():
    try:
        homes = db_service.get_all_homes()
        return jsonify(homes), 200
    except Exception as e:
        logger.error(f"Error fetching äldreboenden: {str(e)}")
        return jsonify({'error': 'Kunde inte hämta äldreboenden'}), 500

# Lägg till ett nytt äldreboende
@app.route('/api/aldreboenden', methods=['POST'])
@require_auth
@require_admin
@rate_limit(max_requests=100, window_seconds=60)
def add_home():
    user_oid = session.get('azure_user', {}).get('oid', 'unknown')
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Ingen data mottogs.'}), 400

        name = data.get('name', '').strip()
        
        # Validera namn
        is_valid, error_msg = validate_home_name(name)
        if not is_valid:
            return jsonify({'error': error_msg}), 400
        
        # Sanitera data
        data['name'] = sanitize_string(name, max_length=50)
        data['address'] = sanitize_string(data.get('address', ''), max_length=200)
        data['description'] = sanitize_string(data.get('description', ''), max_length=500)
        
        home_id = db_service.add_home(data)

        if home_id is None:
            return jsonify({'error': f'Äldreboende med namnet "{name}" finns redan.'}), 409

        logger.info(f"User OID {user_oid} added home with id '{home_id}'.")
        return jsonify({'success': True, 'id': home_id}), 201
        
    except Exception as e:
        logger.error(f"Error adding home: {str(e)}")
        return jsonify({'error': 'Ett fel uppstod vid skapande av äldreboende'}), 500


@app.route('/api/aldreboenden/<home_id>/departments', methods=['POST'])
@require_auth
@require_admin
@rate_limit(max_requests=100, window_seconds=60)
def add_department(home_id):
    try:
        data = request.get_json() or {}
        name = sanitize_string(data.get('name', ''), max_length=80)
        if not name:
            return jsonify({'error': 'Avdelningsnamn krävs'}), 400
        try:
            dept = db_service.add_department(home_id, name)
        except ValueError as exc:
            msg = str(exc)
            if msg == 'max_departments':
                return jsonify({'error': 'Max 20 avdelningar per äldreboende'}), 400
            if msg == 'invalid_department':
                return jsonify({'error': 'Ogiltigt avdelningsnamn'}), 400
            if msg == 'home_not_found':
                return jsonify({'error': 'Äldreboendet hittades inte'}), 404
            raise
        except CosmosHttpResponseError as exc:
            logger.error(f"Cosmos error adding department for home {home_id}: {exc}")
            return jsonify({'error': 'Kunde inte lägga till avdelning', 'detail': str(exc)}), 500
        if dept is None:
            return jsonify({'error': 'Avdelningen finns redan'}), 409
        return jsonify(dept), 201
    except Exception as e:
        logger.error(f"Error adding department: {e}")
        return jsonify({'error': 'Kunde inte lägga till avdelning'}), 500


@app.route('/api/aldreboenden/<home_id>/departments/<department_id>', methods=['PUT'])
@require_auth
@require_admin
@rate_limit(max_requests=100, window_seconds=60)
def update_department(home_id, department_id):
    try:
        data = request.get_json() or {}
        name = data.get('name')
        active = data.get('active')
        sanitized_name = sanitize_string(name, max_length=80) if name else None
        if name is not None and not sanitized_name:
            return jsonify({'error': 'Avdelningsnamn får inte vara tomt'}), 400
        ok = db_service.update_department(home_id, department_id, name=sanitized_name, active=active)
        if not ok:
            return jsonify({'error': 'Avdelningen hittades inte'}), 404
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error updating department: {e}")
        return jsonify({'error': 'Kunde inte uppdatera avdelning'}), 500


@app.route('/api/aldreboenden/<home_id>/departments/<department_id>', methods=['DELETE'])
@require_auth
@require_admin
@rate_limit(max_requests=60, window_seconds=60)
def delete_department(home_id, department_id):
    try:
        ok = db_service.remove_department(home_id, department_id)
        if not ok:
            return jsonify({'error': 'Avdelningen hittades inte'}), 404
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error deleting department: {e}")
        return jsonify({'error': 'Kunde inte ta bort avdelning'}), 500

# Hämta aktiviteter
@app.route('/api/activities')
@require_auth
@rate_limit(max_requests=1000, window_seconds=60)
def get_activities():
    try:
        activities = db_service.get_all_activities()
        return jsonify(activities), 200
    except Exception as e:
        logger.error(f"Error fetching activities: {str(e)}")
        return jsonify({'error': 'Kunde inte hämta aktiviteter'}), 500

# Lägg till en ny aktivitet
@app.route('/api/activities', methods=['POST'])
@require_auth
@require_admin
@rate_limit(max_requests=100, window_seconds=60)
def add_activity():
    user_oid = session.get('azure_user', {}).get('oid', 'unknown')
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Ingen data mottogs.'}), 400

        name = data.get('name', '').strip()
        
        # Validera namn - använd samma validering som för aktivitetsnamn
        if not name:
            return jsonify({'error': 'Aktivitetsnamn måste anges'}), 400
        if len(name) > 100:
            return jsonify({'error': 'Aktivitetsnamn får inte vara längre än 100 tecken'}), 400
        # Tillåt endast bokstäver, siffror, mellanslag, bindestreck och understreck
        if not re.match(r'^[a-zA-ZåäöÅÄÖ0-9\s\-\_]+$', name):
            return jsonify({'error': 'Aktivitetsnamn innehåller ogiltiga tecken'}), 400
        
        # Sanitera data
        data['name'] = sanitize_string(name, max_length=100)
        data['description'] = sanitize_string(data.get('description', ''), max_length=500)
        
        activity_id = db_service.add_activity(data)

        if activity_id is None:
            return jsonify({'error': f'Aktivitet med namnet "{name}" finns redan.'}), 409

        logger.info(f"User OID {user_oid} added activity with id '{activity_id}'.")
        return jsonify({'success': True, 'id': activity_id}), 201
        
    except Exception as e:
        logger.error(f"Error adding activity: {str(e)}")
        return jsonify({'error': 'Ett fel uppstod vid skapande av aktivitet'}), 500

# Uppdatera (byta namn på) en aktivitet
@app.route('/api/activities/<activity_id>', methods=['PUT'])
@require_auth
@require_admin
@rate_limit(max_requests=60, window_seconds=60)
def rename_activity(activity_id):
    try:
        body = request.get_json() or {}
        new_name = (body.get('name') or '').strip()
        if not new_name:
            return jsonify({'error': 'Aktivitetsnamn måste anges'}), 400
        if len(new_name) > 100:
            return jsonify({'error': 'Aktivitetsnamn får inte vara längre än 100 tecken'}), 400
        if not re.match(r'^[a-zA-ZåäöÅÄÖ0-9\s\-\_]+$', new_name):
            return jsonify({'error': 'Aktivitetsnamn innehåller ogiltiga tecken'}), 400

        # Hämta aktivitet
        activity = db_service.get_activity(activity_id)
        if not activity or not activity.get('active', True):
            return jsonify({'error': 'Aktiviteten hittades inte'}), 404

        old_name = activity.get('name')
        new_name_s = sanitize_string(new_name, max_length=100)

        # Unikhetskontroll på namn (tillåt samma dokument)
        existing = db_service.find_activity_by_name(new_name_s)
        if existing and existing.get('id') != activity_id:
            return jsonify({'error': f'Aktivitet med namnet "{new_name_s}" finns redan.'}), 409

        # Uppdatera aktivitetsnamn och synka historiska registreringar
        updated = db_service.update_activity_name(activity_id, new_name_s, old_name)
        if not updated:
            return jsonify({'error': 'Kunde inte uppdatera aktivitet'}), 500
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error renaming activity {activity_id}: {e}")
        return jsonify({'error': 'Ett fel uppstod vid uppdatering av aktivitet'}), 500

# Inaktivera (ta bort) en aktivitet
@app.route('/api/activities/<activity_id>', methods=['DELETE'])
@require_auth
@require_admin
@rate_limit(max_requests=60, window_seconds=60)
def delete_activity(activity_id):
    try:
        ok = db_service.deactivate_activity(activity_id)
        if not ok:
            return jsonify({'error': 'Aktiviteten hittades inte'}), 404
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error deactivating activity {activity_id}: {e}")
        return jsonify({'error': 'Kunde inte ta bort aktiviteten'}), 500


@app.route('/api/companions')
@require_auth
@rate_limit(max_requests=1000, window_seconds=60)
def get_companions():
    try:
        companions = db_service.get_all_companions()
        return jsonify(companions), 200
    except Exception as e:
        logger.error(f"Error fetching companions: {e}")
        return jsonify({'error': 'Kunde inte hämta med vem-lista'}), 500


@app.route('/api/companions', methods=['POST'])
@require_auth
@require_admin
@rate_limit(max_requests=100, window_seconds=60)
def add_companion():
    try:
        body = request.get_json() or {}
        name = sanitize_string((body.get('name') or ''), max_length=100)
        if not name:
            return jsonify({'error': 'Namn krävs'}), 400
        companion_id = db_service.add_companion({'name': name})
        if companion_id is None:
            return jsonify({'error': 'Med vem finns redan'}), 409
        return jsonify({'success': True, 'id': companion_id}), 201
    except Exception as e:
        logger.error(f"Error adding companion: {e}")
        return jsonify({'error': 'Kunde inte lägga till'}), 500


@app.route('/api/companions/<companion_id>', methods=['PUT'])
@require_auth
@require_admin
@rate_limit(max_requests=60, window_seconds=60)
def rename_companion(companion_id):
    try:
        body = request.get_json() or {}
        name = sanitize_string((body.get('name') or ''), max_length=100)
        if not name:
            return jsonify({'error': 'Namn krävs'}), 400
        ok = db_service.update_companion_name(companion_id, name)
        if not ok:
            return jsonify({'error': 'Hittades inte'}), 404
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error renaming companion: {e}")
        return jsonify({'error': 'Kunde inte uppdatera'}), 500


@app.route('/api/companions/<companion_id>', methods=['DELETE'])
@require_auth
@require_admin
@rate_limit(max_requests=60, window_seconds=60)
def delete_companion(companion_id):
    try:
        ok = db_service.deactivate_companion(companion_id)
        if not ok:
            return jsonify({'error': 'Hittades inte'}), 404
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error deleting companion: {e}")
        return jsonify({'error': 'Kunde inte ta bort'}), 500

# Registrera utevistelse
@app.route('/api/visits', methods=['POST'])
@require_auth
@rate_limit(max_requests=500, window_seconds=60)  # Många kan registrera samtidigt
def register_visit():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Ingen data mottogs'}), 400
            
        user_email = session.get('azure_user', {}).get('email', '')
        user_oid = session.get('azure_user', {}).get('oid', 'unknown')

        home_id = (data.get('home_id') or '').strip()
        home_doc = db_service.get_home(home_id)
        if not home_doc:
            return jsonify({'error': 'Äldreboendet hittades inte'}), 400
        data['home_id'] = home_id

        # Validera all data
        is_valid, errors = validate_attendance_data(data, home_doc)
        if not is_valid:
            return jsonify({'errors': errors}), 400

        # Sanitera och normalisera fält
        gender_counts = data.get('gender_counts') or {}
        data['gender_counts'] = {
            'men': int(gender_counts.get('men', 0)),
            'women': int(gender_counts.get('women', 0))
        }

        total = data['gender_counts']['men'] + data['gender_counts']['women']
        data['total_participants'] = total

        offer_status = data.get('offer_status')
        visit_type = data.get('visit_type')
        activity_name = sanitize_string(data.get('activity_name', ''), max_length=100)
        companion_name = sanitize_string(data.get('companion_name', ''), max_length=100)
        data['activity'] = activity_name
        data['activity_name'] = activity_name
        data['companion'] = companion_name
        data['companion_name'] = companion_name
        data['activity_id'] = sanitize_string(data.get('activity_id', ''), max_length=120)
        data['companion_id'] = sanitize_string(data.get('companion_id', ''), max_length=120)
        department_raw = data.get('department_id', '')
        department_id = department_raw if isinstance(department_raw, str) else ('' if department_raw is None else str(department_raw))
        if len(department_id) > 160:
            return jsonify({'error': 'Ogiltigt avdelnings-ID'}), 400
        data['department_id'] = sanitize_string(department_id, max_length=200)

        if offer_status == 'declined':
            data['activity'] = ''
            data['activity_name'] = ''
            data['activity_id'] = ''
            data['companion'] = ''
            data['companion_name'] = ''
            data['companion_id'] = ''
            data['duration_minutes'] = None

        duration_value = data.get('duration_minutes')
        if duration_value is not None:
            try:
                data['duration_minutes'] = int(duration_value)
            except (TypeError, ValueError):
                data['duration_minutes'] = None

        satisfaction_entries = []
        for entry in data.get('satisfaction_entries') or []:
            satisfaction_entries.append({
                'gender': entry.get('gender'),
                'rating': int(entry.get('rating'))
            })
        data['satisfaction_entries'] = satisfaction_entries

        data['visit_type'] = visit_type
        data['offer_status'] = offer_status

        # Lägg till metadata
        data['registered_by'] = user_email
        data['registered_by_oid'] = user_oid
        data['registered_at'] = datetime.utcnow()
        data['last_modified_at'] = data['registered_at']
        data['edit_count'] = 0

        # Lägg till aktiviteten om den är ny
        if data.get('activity'):
            db_service.add_activity_if_not_exists(data.get('activity'))

        # Spara i Cosmos DB
        doc_id = db_service.add_visit(data)
        
        logger.info(f"User OID {user_oid} registered visit for {data['home_id']}")
        return jsonify({'success': True, 'id': doc_id}), 201
        
    except Exception as e:
        logger.error(f"Error registering visit: {str(e)}")
        return jsonify({'error': 'Kunde inte registrera utevistelse'}), 500

# Hämta statistik
@app.route('/api/statistics')
@require_auth
@rate_limit(max_requests=300, window_seconds=60)
def get_statistics():
    try:
        # Query parameters med validering
        home_id = (request.args.get('home') or '').strip() or None
        date_from = request.args.get('from')
        date_to = request.args.get('to')
        department_id = (request.args.get('department') or '').strip() or None
        activity_id = (request.args.get('activity') or '').strip() or None
        companion_id = (request.args.get('companion') or '').strip() or None
        offer_status = (request.args.get('offer_status') or '').strip() or None
        visit_type = (request.args.get('visit_type') or '').strip() or None

        # Validera datum om de finns
        if date_from:
            try:
                datetime.strptime(date_from, '%Y-%m-%d')
            except ValueError:
                return jsonify({'error': 'Ogiltigt from-datum format'}), 400
                
        if date_to:
            try:
                datetime.strptime(date_to, '%Y-%m-%d')
            except ValueError:
                return jsonify({'error': 'Ogiltigt to-datum format'}), 400
        
        stats = db_service.get_statistics(
            home_id=home_id,
            date_from=date_from,
            date_to=date_to,
            department_id=department_id,
            activity_id=activity_id,
            companion_id=companion_id,
            offer_status=offer_status,
            visit_type=visit_type
        )

        # Ta bort PII-relaterade fält men låt övriga statistikfält vara orörda
        redact_keys = {'registered_by', 'registered_by_oid', 'registered_at', 'last_modified_at', 'edit_count'}
        sanitized = []
        for item in stats:
            sanitized.append({k: v for k, v in item.items() if k not in redact_keys})

        return jsonify(sanitized), 200
        
    except Exception as e:
        logger.error(f"Error fetching statistics: {str(e)}")
        return jsonify({'error': 'Kunde inte hämta statistik'}), 500

# ---- Mina utevistelser ----
@app.route('/api/my-visits')
@require_auth
@rate_limit(max_requests=60, window_seconds=60)
def my_visits():
    try:
        azure_user = session.get('azure_user', {})
        oid = azure_user.get('oid')
        email = (azure_user.get('email') or '').strip().lower()
        # Default to last 7 days if not provided
        date_from = request.args.get('from')
        date_to = request.args.get('to')
        if not date_from or not date_to:
            today = datetime.utcnow().date()
            start = today - timedelta(days=6)
            date_from = start.strftime('%Y-%m-%d') if not date_from else date_from
            date_to = today.strftime('%Y-%m-%d') if not date_to else date_to

        # Basic validation of dates
        try:
            datetime.strptime(date_from, '%Y-%m-%d')
            datetime.strptime(date_to, '%Y-%m-%d')
        except ValueError:
            return jsonify({'error': 'Ogiltigt datumformat'}), 400

        records = db_service.list_my_visits(oid, email, date_from, date_to, limit=500)
        summaries = []
        for r in records:
            summaries.append({
                'id': r.get('id'),
                'date': r.get('date'),
                'activity': r.get('activity'),
                'companion': r.get('companion'),
                'home_id': r.get('home_id'),
                'department_id': r.get('department_id'),
                'offer_status': r.get('offer_status'),
                'visit_type': r.get('visit_type'),
                'total_participants': r.get('total_participants', 0),
                'registered_at': r.get('registered_at')
            })
        return jsonify(summaries), 200
    except Exception as e:
        logger.error(f"Error in /api/my-visits: {e}")
        return jsonify({'error': 'Kunde inte hämta registreringar'}), 500


@app.route('/api/visits/<doc_id>')
@require_auth
@rate_limit(max_requests=120, window_seconds=60)
def get_visit(doc_id):
    try:
        azure_user = session.get('azure_user', {})
        oid = azure_user.get('oid')
        email = (azure_user.get('email') or '').strip().lower()
        doc = db_service.get_visit(doc_id)
        if not doc:
            return jsonify({'error': 'Hittades inte'}), 404
        owner_ok = (doc.get('registered_by_oid') == oid) or (doc.get('registered_by', '').strip().lower() == email)
        if not owner_ok:
            return jsonify({'error': 'Förbjudet'}), 403
        return jsonify(doc), 200
    except Exception as e:
        logger.error(f"Error in GET /api/visits/{doc_id}: {e}")
        return jsonify({'error': 'Ett fel uppstod'}), 500


@app.route('/api/visits/<doc_id>', methods=['PUT'])
@require_auth
@rate_limit(max_requests=30, window_seconds=60)
def update_visit(doc_id):
    try:
        azure_user = session.get('azure_user', {})
        oid = azure_user.get('oid')
        email = (azure_user.get('email') or '').strip().lower()
        body = request.get_json() or {}

        # Load and verify ownership
        existing = db_service.get_visit(doc_id)
        if not existing:
            return jsonify({'error': 'Hittades inte'}), 404
        owner_ok = (existing.get('registered_by_oid') == oid) or (existing.get('registered_by', '').strip().lower() == email)
        if not owner_ok:
            return jsonify({'error': 'Förbjudet'}), 403

        body['home_id'] = existing.get('home_id') or existing.get('traffpunkt_id')
        if not body.get('department_id'):
            body['department_id'] = existing.get('department_id')
        home_doc = None
        if body.get('home_id'):
            home_doc = db_service.get_home(body.get('home_id'))
        if not home_doc and existing.get('home_id'):
            home_doc = db_service.get_home(existing.get('home_id'))
        # Legacy fallback: allow editing even if home is missing now

        # Validate incoming data (require full object fields)
        is_valid, errors = validate_attendance_data(body, home_doc, existing_department_id=existing.get('department_id'))
        if not is_valid:
            return jsonify({'errors': errors}), 400

        gender_counts = body.get('gender_counts') or {}
        body['gender_counts'] = {
            'men': int(gender_counts.get('men', 0)),
            'women': int(gender_counts.get('women', 0))
        }
        total = body['gender_counts']['men'] + body['gender_counts']['women']
        body['total_participants'] = total

        offer_status = body.get('offer_status')
        body['activity'] = sanitize_string(body.get('activity_name', ''), max_length=100)
        body['activity_name'] = body['activity']
        body['activity_id'] = sanitize_string(body.get('activity_id', ''), max_length=120)
        body['companion'] = sanitize_string(body.get('companion_name', ''), max_length=100)
        body['companion_name'] = body['companion']
        body['companion_id'] = sanitize_string(body.get('companion_id', ''), max_length=120)
        body['department_id'] = sanitize_string(body.get('department_id', existing.get('department_id') or ''), max_length=120)

        if offer_status == 'declined':
            body['activity'] = ''
            body['activity_name'] = ''
            body['activity_id'] = ''
            body['companion'] = ''
            body['companion_name'] = ''
            body['companion_id'] = ''
            body['duration_minutes'] = None
        else:
            try:
                body['duration_minutes'] = int(body.get('duration_minutes'))
            except (TypeError, ValueError):
                body['duration_minutes'] = None

        satisfaction_entries = []
        for entry in body.get('satisfaction_entries') or []:
            satisfaction_entries.append({
                'gender': entry.get('gender'),
                'rating': int(entry.get('rating'))
            })
        body['satisfaction_entries'] = satisfaction_entries

        if body.get('activity'):
            db_service.add_activity_if_not_exists(body.get('activity'))

        # Preserve immutable fields
        body['id'] = doc_id
        body['registered_by'] = existing.get('registered_by')
        body['registered_by_oid'] = existing.get('registered_by_oid')
        body['registered_at'] = existing.get('registered_at')

        updated = db_service.update_visit(doc_id, body)
        if not updated:
            return jsonify({'error': 'Hittades inte'}), 404

        # Audit
        try:
            changed_fields = [k for k in body.keys() if existing.get(k) != body.get(k)]
            db_service.write_visit_audit('update', oid, email, doc_id, changed_fields)
        except Exception as e:
            logger.error(f"Failed to write visit audit (update): {e}")

        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error in PUT /api/visits/{doc_id}: {e}")
        return jsonify({'error': 'Kunde inte uppdatera'}), 500


@app.route('/api/visits/<doc_id>', methods=['DELETE'])
@require_auth
@rate_limit(max_requests=30, window_seconds=60)
def delete_visit(doc_id):
    try:
        azure_user = session.get('azure_user', {})
        oid = azure_user.get('oid')
        email = (azure_user.get('email') or '').strip().lower()
        existing = db_service.get_visit(doc_id)
        if not existing:
            return jsonify({'error': 'Hittades inte'}), 404
        owner_ok = (existing.get('registered_by_oid') == oid) or (existing.get('registered_by', '').strip().lower() == email)
        if not owner_ok:
            return jsonify({'error': 'Förbjudet'}), 403
        ok = db_service.delete_visit(doc_id)
        if not ok:
            return jsonify({'error': 'Hittades inte'}), 404
        try:
            db_service.write_visit_audit('delete', oid, email, doc_id)
        except Exception as e:
            logger.error(f"Failed to write visit audit (delete): {e}")
        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error in DELETE /api/visits/{doc_id}: {e}")
        return jsonify({'error': 'Kunde inte ta bort'}), 500

# Me endpoint with role flags
@app.route('/api/me')
@require_auth
@rate_limit(max_requests=1000, window_seconds=60)
def me():
    try:
        azure_user = session.get('azure_user', {})
        email = (azure_user.get('email') or '').strip().lower()
        name = azure_user.get('full_name') or azure_user.get('name')
        oid = azure_user.get('oid')
        # Compute roles
        is_superadmin = email == (os.getenv('SUPERADMIN_EMAIL') or '').strip().lower()
        user_doc = db_service.get_user(oid)
        is_admin = bool((user_doc or {}).get('roles', {}).get('admin')) or is_superadmin
        return jsonify({
            'email': email,
            'display_name': name,
            'is_superadmin': is_superadmin,
            'is_admin': is_admin
        }), 200
    except Exception as e:
        logger.error(f"Error in /api/me: {e}")
        return jsonify({'error': 'Kunde inte hämta användarinformation'}), 500

# Admin: list users (superadmin only)
@app.route('/api/admin/users')
@require_auth
@require_superadmin
@rate_limit(max_requests=60, window_seconds=60)
def list_users():
    try:
        q = request.args.get('q')
        try:
            limit = int(request.args.get('limit', '200'))
        except ValueError:
            limit = 200
        users = db_service.list_users(q=q, limit=limit)
        return jsonify(users), 200
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        return jsonify({'error': 'Kunde inte hämta användare'}), 500

# Admin: set user role (superadmin only)
@app.route('/api/admin/users/<user_id>/role', methods=['PUT'])
@require_auth
@require_superadmin
@rate_limit(max_requests=30, window_seconds=60)
def set_user_role(user_id):
    try:
        body = request.get_json() or {}
        admin = body.get('admin')
        if type(admin) is not bool:
            return jsonify({'error': 'Fältet "admin" måste vara boolean'}), 400
        azure_user = session.get('azure_user', {})
        actor_oid = azure_user.get('oid')
        actor_email = azure_user.get('email')
        try:
            result = db_service.set_admin_role(user_id, admin, actor_oid, actor_email)
        except KeyError:
            return jsonify({'error': 'Användare hittades inte'}), 404
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error setting user role: {e}")
        return jsonify({'error': 'Kunde inte uppdatera roll'}), 500

# Serve React App
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    # Om sökvägen pekar på en existerande fil i static-mappen (t.ex. manifest.json, logo.png)
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    
    # Om sökvägen börjar med 'api/', är det ett API-anrop som inte hittades
    if path.startswith('api/'):
        return jsonify({'error': 'API endpoint not found'}), 404
        
    # För alla andra sökvägar (t.ex. /dashboard, /registration), servera React-appens huvudsida
    # React Router kommer sedan att hantera och visa rätt komponent
    return send_from_directory(app.static_folder, 'index.html')

# Error handlers
@app.errorhandler(429)
def rate_limit_handler(e):
    return jsonify({'error': 'För många förfrågningar. Vänta en stund.'}), 429

@app.errorhandler(500)
def internal_error_handler(e):
    logger.error(f"Internal server error: {str(e)}")
    return jsonify({'error': 'Ett serverfel uppstod'}), 500

@app.errorhandler(404)
def not_found_handler(e):
    # API endpoints returnerar JSON
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Endpoint hittades inte'}), 404
    # Annars returnera React-appen
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    # ALDRIG debug=True i produktion!
    app.run(debug=False, port=10000)
