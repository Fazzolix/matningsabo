# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend Development
```bash
cd frontend
npm install
npm start                # Runs on http://localhost:3000
npm run build           # Creates production build
npm test                # Run tests with Jest
```

### Backend Development
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
flask run --port 10000  # Development server
```

### Docker Deployment
```bash
# Build and deploy to Google Cloud Run
docker build -t traffpunkt-statistik .
docker tag traffpunkt-statistik gcr.io/froga-elin/traffpunkt-statistik
docker push gcr.io/froga-elin/traffpunkt-statistik
gcloud run deploy traffpunkt --image gcr.io/froga-elin/traffpunkt-statistik --platform managed --region europe-west1 --allow-unauthenticated
```

## Architecture

This is a full-stack web application for tracking attendance at municipal meeting points (träffpunkter) in Skövde, Sweden.

### Frontend Structure
- **React SPA** using Material-UI components
- **Azure AD authentication** via MSAL (Microsoft Authentication Library)
- **Context providers** in `src/contexts/` for auth state management
- **API services** in `src/services/` handle all backend communication
- **Proxy configuration** in `setupProxy.js` redirects `/api` to backend during development

### Backend Structure
- **Flask API** serving both the API and static React build in production
- **Firestore** for data persistence with collections: `traffpunkter`, `attendance_records`, `activities`
- **Azure AD validation** in `auth_utils.py` verifies tokens from frontend
- **Session management** using Flask-Session with secure cookies

### Key Design Patterns
1. **Authentication Flow**: Frontend acquires Azure AD token → sends in Authorization header → backend validates token → creates session
2. **Data Flow**: React components → API services → Flask routes → Firestore service → Google Firestore
3. **Error Handling**: Backend returns structured JSON errors, frontend displays user-friendly messages
4. **State Management**: Auth context provides user state globally, components fetch data as needed

### Environment Variables
Required in backend:
- `SECRET_KEY`: Flask session encryption
- `AZURE_CLIENT_ID`: Azure AD app registration
- `AZURE_TENANT_ID`: Azure AD tenant
- `FRONTEND_URL`: For CORS configuration
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to service account JSON (local dev only)

### Development Workflow
1. Frontend runs on port 3000, backend on port 10000
2. Proxy forwards `/api/*` requests to backend
3. Hot reload enabled for both frontend and backend
4. Docker multi-stage build combines both for production

### Security Features
1. **JWT Token Validation**: Azure AD tokens are validated with signature verification using PyJWT
2. **Rate Limiting**: In-memory rate limiting on all endpoints (stricter on auth endpoints)
3. **Input Validation**: All user inputs are validated and sanitized before processing
4. **Security Headers**: CSP, HSTS, X-Frame-Options, etc. are set on all responses
5. **Non-root Docker**: Container runs as unprivileged user (appuser:1001)
6. **Session Security**: 2-hour timeout, HttpOnly cookies, CSRF protection via SameSite

### Important Security Notes
- Always run `npm audit` and `pip check` before deploying
- Never commit secrets or API keys to the repository
- Use strong SECRET_KEY in production (generate with `secrets.token_hex(32)`)
- Rate limiting is per-instance without Redis - consider adding Redis for production
- See PRODUCTION_CHECKLIST.md for deployment security checklist