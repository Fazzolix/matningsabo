Komplett Implementeringsplan: Statistikapplikation för Träffpunkter
Version: 2.0
Datum: 2025-07-23
Baserat på: Delegeringsutbildningens arkitektur och designsystem
Executive Summary
En webbapplikation för att digitalisera och standardisera insamlingen av besöksstatistik från Skövde kommuns träffpunkter. Applikationen återanvänder beprövade mönster från delegeringsutbildningen för Azure AD-autentisering, design och teknisk arkitektur, men med förenklad funktionalitet fokuserad på statistikinsamling och visualisering.
Teknisk Specifikation
Arkitektur

Frontend: React SPA med Material-UI, Framer Motion, React Router
Backend: Python/Flask med Gunicorn
Databas: Google Firestore (NoSQL)
Autentisering: Azure AD via MSAL
Hosting: Google Cloud Run (containerbaserad)
Deployment: Docker multi-stage build

Azure AD-konfiguration
Exakt samma implementation som delegeringsutbildningen:
javascript// MSAL-konfiguration
const msalConfig = {
  auth: {
    clientId: config.clientId,
    authority: `https://login.microsoftonline.com/${config.tenantId}`,
    redirectUri: config.redirectUri,
    postLogoutRedirectUri: config.redirectUri,
    navigateToLoginRequestUrl: false
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: true
  }
};
Design & Styling
CSS-variabler från delegeringsutbildningen:
css:root {
  --primary-purple: #831f82;        /* Skövde Aubergine */
  --primary-light: #a94aa8;
  --primary-dark: #5c1659;
  --accent-blue: #007bff;
  --accent-blue-dark: #0069d9;
  --background: #FFFFFF;
  --surface: #F9FAFB;
  --text-primary: #111827;
  --text-secondary: #6B7280;
  --border-light: #E5E7EB;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
Firestore Datastruktur
Collection: traffpunkter
Ett dokument per träffpunkt:
javascript{
  id: "bagaren",  // Lowercase, URL-vänligt ID
  name: "Bagaren",
  active: true,
  created_at: Timestamp,
  address: "Adress 123, Skövde",
  description: "Träffpunkt i centrala Skövde"
}
Collection: attendance_records
javascript{
  id: auto-generated,
  traffpunkt_id: "bagaren",
  date: "2025-07-23",
  time_block: "formiddag", // eller "eftermiddag"
  activity: "Bingo",
  participants: {
    boende: { men: 5, women: 8 },
    externa: { men: 2, women: 3 },
    nya: { men: 1, women: 0 }
  },
  total_participants: 19,
  registered_by: "anna.andersson@skovde.se",
  registered_at: Timestamp,
  comment: "Välbesökt aktivitet"
}
Collection: activities
javascript{
  id: "bingo",
  name: "Bingo",
  category: "spel",
  active: true,
  sort_order: 1
}
Filstruktur
traffpunkt-statistik/
├── backend/
│   ├── app.py                # Huvudapplikation med routes
│   ├── auth_utils.py         # Azure AD autentisering
│   ├── firestore_service.py  # Firestore-operationer
│   ├── requirements.txt      # Python-dependencies
│   ├── gunicorn.conf.py      # Gunicorn-konfiguration
│   └── static/               # För frontend-build
│
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   ├── favicon.ico
│   │   └── skovde-logo-rod.png
│   │
│   └── src/
│       ├── Components/
│       │   ├── Welcome.js          # Inloggningssida
│       │   ├── Welcome.css
│       │   ├── Registration.js     # Registreringsformulär
│       │   ├── Registration.css
│       │   ├── Dashboard.js        # Statistik-dashboard
│       │   ├── Dashboard.css
│       │   └── Layout.js          # App-layout med header
│       │
│       ├── contexts/
│       │   └── AuthContext.js     # MSAL autentisering
│       │
│       ├── config/
│       │   └── api.js            # API endpoints
│       │
│       ├── services/
│       │   └── statisticsService.js  # API-anrop
│       │
│       ├── utils/
│       │   └── dateHelpers.js    # Datum-formatering
│       │
│       ├── App.js
│       ├── App.css
│       ├── index.js
│       └── index.css            # Globala CSS-variabler
│
├── Dockerfile                   # Multi-stage build
├── .dockerignore
├── .gitignore
├── .env.example
└── README.md
Backend Implementation
backend/app.py
pythonimport os
from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from flask_session import Session
from dotenv import load_dotenv
import logging
from datetime import datetime
from auth_utils import require_auth, get_azure_config, get_azure_user
from firestore_service import FirestoreService

# Konfigurera loggning
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ladda miljövariabler
load_dotenv()

# Initiera Flask
app = Flask(__name__, 
            static_folder='static',
            static_url_path='')

# Konfiguration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key-change-in-production')
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = '/tmp/flask_session'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('FLASK_ENV') != 'development'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# Initiera session
Session(app)

# CORS
CORS(app, 
     origins=[os.getenv('FRONTEND_URL', 'http://localhost:3000')],
     supports_credentials=True)

# Initiera Firestore
db_service = FirestoreService()

# Health check
@app.route('/health')
def health_check():
    return jsonify({'status': 'healthy'}), 200

# Azure AD config endpoint
@app.route('/api/azure-config')
def azure_config():
    return get_azure_config()

# Azure AD user endpoint
@app.route('/api/azure-user')
@require_auth
def azure_user():
    return get_azure_user()

# Hämta alla träffpunkter
@app.route('/api/traffpunkter')
@require_auth
def get_traffpunkter():
    try:
        traffpunkter = db_service.get_all_traffpunkter()
        return jsonify(traffpunkter), 200
    except Exception as e:
        logger.error(f"Error fetching traffpunkter: {e}")
        return jsonify({'error': 'Kunde inte hämta träffpunkter'}), 500

# Hämta aktiviteter
@app.route('/api/activities')
@require_auth
def get_activities():
    try:
        activities = db_service.get_all_activities()
        return jsonify(activities), 200
    except Exception as e:
        logger.error(f"Error fetching activities: {e}")
        return jsonify({'error': 'Kunde inte hämta aktiviteter'}), 500

# Registrera närvaro
@app.route('/api/attendance', methods=['POST'])
@require_auth
def register_attendance():
    try:
        data = request.get_json()
        user_email = session.get('azure_user', {}).get('email', '')
        
        # Validera data
        required_fields = ['traffpunkt_id', 'date', 'time_block', 'activity', 'participants']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Fält saknas: {field}'}), 400
        
        # Lägg till metadata
        data['registered_by'] = user_email
        data['registered_at'] = datetime.utcnow()
        
        # Beräkna totalt antal deltagare
        total = 0
        for category in data['participants'].values():
            total += category.get('men', 0) + category.get('women', 0)
        data['total_participants'] = total
        
        # Spara i Firestore
        doc_id = db_service.add_attendance_record(data)
        
        return jsonify({'success': True, 'id': doc_id}), 201
        
    except Exception as e:
        logger.error(f"Error registering attendance: {e}")
        return jsonify({'error': 'Kunde inte registrera närvaro'}), 500

# Hämta statistik
@app.route('/api/statistics')
@require_auth
def get_statistics():
    try:
        # Query parameters
        traffpunkt_id = request.args.get('traffpunkt')
        date_from = request.args.get('from')
        date_to = request.args.get('to')
        
        stats = db_service.get_statistics(
            traffpunkt_id=traffpunkt_id,
            date_from=date_from,
            date_to=date_to
        )
        
        return jsonify(stats), 200
        
    except Exception as e:
        logger.error(f"Error fetching statistics: {e}")
        return jsonify({'error': 'Kunde inte hämta statistik'}), 500

# Serve React app
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    app.run(debug=True, port=10000)
backend/auth_utils.py
pythonimport os
import logging
from functools import wraps
from flask import request, jsonify, session
import requests

logger = logging.getLogger(__name__)

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

def get_azure_user():
    """Hämtar användarinfo från Azure AD token"""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'No authorization token provided'}), 401
    
    token = auth_header.split(' ')[1]
    
    try:
        # Använd Microsoft Graph API
        graph_response = requests.get(
            'https://graph.microsoft.com/v1.0/me',
            headers={'Authorization': f'Bearer {token}'}
        )
        
        if graph_response.status_code != 200:
            logger.error(f"Microsoft Graph API error: {graph_response.status_code}")
            return jsonify({'error': 'Failed to fetch user info'}), 401
        
        user_data = graph_response.json()
        
        # Extrahera användarinfo
        user_info = {
            'name': user_data.get('givenName', user_data.get('displayName', 'Användare')),
            'email': user_data.get('mail') or user_data.get('userPrincipalName', ''),
            'full_name': user_data.get('displayName', '')
        }
        
        # Spara i session
        session['azure_user'] = user_info
        session.modified = True
        
        return jsonify(user_info)
        
    except Exception as e:
        logger.error(f"Error fetching user info: {e}")
        return jsonify({'error': 'Failed to fetch user info'}), 500

def require_auth(f):
    """Decorator som kräver autentisering"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'azure_user' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function
backend/requirements.txt
Flask==3.1.0
Flask-Cors==5.0.0
Flask-Session==0.8.0
python-dotenv==1.0.0
google-cloud-firestore==2.16.0
gunicorn==21.2.0
requests==2.31.0
Frontend Implementation
frontend/src/Components/Welcome.js
javascriptimport React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import './Welcome.css';

const Welcome = () => {
  const navigate = useNavigate();
  const { user, loading, error, login, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, user, navigate]);

  const handleLogin = async () => {
    try {
      await login();
    } catch (err) {
      console.error('Inloggning misslyckades:', err);
    }
  };

  return (
    <div className="welcome-page-wrapper">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <div className="welcome-container">
              <div className="card welcome-card">
                <h1 className="welcome-title">Träffpunktsstatistik</h1>
                <p className="loading-text">Laddar autentisering...</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5, ease: 'ease-out' }}
          >
            <div className="welcome-container">
              <div className="card welcome-card">
                <img
                  src="/skovde-logo-rod.png"
                  alt="Skövde Kommun"
                  className="welcome-logo"
                />
                <h1 className="welcome-title">Träffpunktsstatistik</h1>
                <p className="welcome-subtitle">
                  Logga in med ditt Skövde kommun-konto för att registrera och visa statistik.
                </p>
                <button
                  onClick={handleLogin}
                  className="azure-login-button"
                  disabled={loading}
                >
                  Logga in med Microsoft
                </button>
                {error && (
                  <p className="welcome-error">
                    Fel vid inloggning: {error.message || error}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Welcome;
frontend/src/contexts/AuthContext.js
javascriptimport React, { createContext, useState, useEffect, useContext } from 'react';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import axios from 'axios';
import API_ENDPOINTS from '../config/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [msalInstance, setMsalInstance] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeMsal = async () => {
      try {
        // Hämta Azure AD-konfiguration
        const response = await axios.get(API_ENDPOINTS.AZURE_CONFIG);
        const config = response.data;

        const msalConfig = {
          auth: {
            clientId: config.clientId,
            authority: `https://login.microsoftonline.com/${config.tenantId}`,
            redirectUri: config.redirectUri,
            postLogoutRedirectUri: config.redirectUri,
            navigateToLoginRequestUrl: false
          },
          cache: {
            cacheLocation: 'localStorage',
            storeAuthStateInCookie: true
          }
        };

        const instance = new PublicClientApplication(msalConfig);
        await instance.initialize();

        setMsalInstance(instance);

        // Hantera redirect efter inloggning
        const response = await instance.handleRedirectPromise();
        if (response) {
          await handleLoginResponse(response);
        } else {
          // Försök tyst inloggning
          const accounts = instance.getAllAccounts();
          if (accounts.length > 0) {
            try {
              const silentResponse = await instance.acquireTokenSilent({
                scopes: ['User.Read'],
                account: accounts[0]
              });
              await handleLoginResponse({ 
                account: accounts[0], 
                accessToken: silentResponse.accessToken 
              });
            } catch (err) {
              if (err instanceof InteractionRequiredAuthError) {
                console.log('Tyst inloggning misslyckades');
              }
            }
          }
        }
      } catch (err) {
        console.error('MSAL initialization failed:', err);
        setError('Kunde inte initiera autentisering');
      } finally {
        setLoading(false);
      }
    };

    initializeMsal();
  }, []);

  const handleLoginResponse = async (response) => {
    try {
      const userResponse = await axios.get(API_ENDPOINTS.AZURE_USER, {
        headers: {
          'Authorization': `Bearer ${response.accessToken}`
        }
      });

      setUser({
        ...userResponse.data,
        account: response.account
      });

      localStorage.setItem('userName', userResponse.data.name);
      localStorage.setItem('userEmail', userResponse.data.email);
    } catch (err) {
      console.error('Failed to fetch user info:', err);
      setError('Kunde inte hämta användarinformation');
    }
  };

  const login = async () => {
    if (!msalInstance) {
      throw new Error('MSAL not initialized');
    }

    try {
      const loginResponse = await msalInstance.loginPopup({
        scopes: ['User.Read']
      });
      await handleLoginResponse(loginResponse);
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    if (!msalInstance) return;

    try {
      await msalInstance.logoutPopup({
        postLogoutRedirectUri: window.location.origin
      });
      setUser(null);
      localStorage.removeItem('userName');
      localStorage.removeItem('userEmail');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!user,
    msalInstance
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
Dockerfile
dockerfile# ===== Stage 1: Build React frontend =====
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Kopiera paketfiler
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --only=production

# Installera eventuella saknade dependencies
RUN npm install @babel/plugin-proposal-private-property-in-object@^7.21.11 --save-dev

# Uppdatera browserslist
RUN npx update-browserslist-db@latest

# Kopiera och bygg frontend
COPY frontend/public ./public
COPY frontend/src ./src
RUN npm run build

# ===== Stage 2: Build Python backend =====
FROM python:3.11-slim AS backend-builder
WORKDIR /app

# Skapa virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Installera dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ===== Stage 3: Production image =====
FROM python:3.11-slim
WORKDIR /app

# Kopiera virtual environment
COPY --from=backend-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Kopiera backend-kod
COPY backend ./backend

# Kopiera byggd frontend
COPY --from=frontend-builder /app/frontend/build/* ./backend/static/
COPY --from=frontend-builder /app/frontend/build/static ./backend/static/static

# Skapa nödvändiga kataloger
RUN mkdir -p /tmp/flask_session

# Exponera port
EXPOSE 8080

# Starta applikationen
WORKDIR /app/backend
CMD exec gunicorn --bind :$PORT --workers 2 --timeout 120 --worker-class sync app:app
README.md
markdown# Träffpunktsstatistik - Skövde kommun

Digital plattform för insamling och visualisering av besöksstatistik från kommunens träffpunkter.

## 🎯 Funktioner

- **Enkel registrering** - Snabb inmatning av besöksdata via mobilanpassat formulär
- **Realtidsstatistik** - Dashboard med aktuella nyckeltal och trender
- **Flexibel filtrering** - Analysera data per träffpunkt, tidsperiod och aktivitet
- **Excel-export** - Ladda ner rådata för vidare analys
- **Säker inloggning** - Azure AD-autentisering för kommunanställda

## 🚀 Snabbstart

### Förutsättningar
- Node.js (v18+)
- Python (3.11+)
- Google Cloud projekt med Firestore
- Azure AD app-registrering

### Installation

1. Klona repot:
```bash
git clone <repo-url>
cd traffpunkt-statistik

Installera backend:

bashcd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

Installera frontend:

bashcd ../frontend
npm install

Konfigurera miljövariabler:

bash# backend/.env
SECRET_KEY=<hemlig-nyckel>
AZURE_CLIENT_ID=<azure-app-id>
AZURE_TENANT_ID=<azure-tenant-id>
FRONTEND_URL=http://localhost:3000
GOOGLE_APPLICATION_CREDENTIALS=<sökväg-till-service-account.json>

Starta utvecklingsservrar:

bash# Terminal 1
cd backend
flask run --port 10000

# Terminal 2
cd frontend
npm start
🏗️ Arkitektur

Frontend: React, Material-UI, MSAL
Backend: Flask, Gunicorn, Flask-Session
Databas: Google Firestore
Autentisering: Azure AD
Hosting: Google Cloud Run

📊 Datamodell
Träffpunkter

ID, namn, adress, aktiv status

Närvaroregistreringar

Träffpunkt, datum, tidsblock
Aktivitet
Deltagarantal (boende/externa/nya, män/kvinnor)
Registrerad av och tidpunkt

Aktiviteter

ID, namn, kategori, sorteringsordning

🔐 Säkerhet

Azure AD-autentisering krävs för all åtkomst
Sessionscookies med HttpOnly och Secure flags
CORS konfigurerat för produktions-URL
Firestore-åtkomst via Google IAM

🚢 Deployment
Bygg Docker-image:
bashdocker build -t traffpunkt-statistik .
Deploy till Cloud Run:
bashgcloud run deploy traffpunkt-statistik \
  --image gcr.io/[PROJECT-ID]/traffpunkt-statistik \
  --platform managed \
  --region europe-north1 \
  --allow-unauthenticated
📝 Miljövariabler
VariabelBeskrivningSECRET_KEYFlask session-nyckelAZURE_CLIENT_IDAzure AD app IDAZURE_TENANT_IDAzure AD tenant IDFRONTEND_URLFrontend URL för CORSPORTPort (sätts av Cloud Run)
🤝 Bidra

Skapa en feature branch
Gör dina ändringar
Skapa en pull request

📄 Licens
© 2025 Skövde kommun

## Träffpunkter att lägga in i Firestore

*[Lämna plats här för träffpunktslistan som ska importeras till Firestore]*

---

## Implementeringsordning

1. **Sätt upp projekt och miljö**
   - Skapa Git-repo
   - Initiera frontend och backend
   - Konfigurera miljövariabler

2. **Implementera autentisering**
   - Azure AD-integration (kopiera från delegeringsappen)
   - AuthContext och MSAL-setup
   - Welcome/Login-komponent

3. **Bygg grundläggande backend**
   - Flask-app med routes
   - Firestore-integration
   - API endpoints för träffpunkter och aktiviteter

4. **Skapa registreringsformulär**
   - Responsiv design för mobil/desktop
   - Validering och felhantering
   - Optimera för snabb inmatning

5. **Utveckla dashboard**
   - Statistikvisning med grafer
   - Filtrering och sökning
   - Export-funktionalitet

6. **Deployment**
   - Dockerfile och Cloud Run-konfiguration
   - Sätt upp Firestore-index
   - Konfigurera produktionsmiljö

Denna plan ger en komplett grund för att bygga statistikapplikationen med alla tekniska detaljer från delegeringsutbildningen, men anpassad för det specifika användningsfallet.