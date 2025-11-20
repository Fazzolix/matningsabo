# Repository Guidelines

This repository powers Skövde’s SÄBO – Statistik service: a React frontend and a Flask API, deployed to Cloud Run with Firestore and Azure AD.

## Project Structure & Module Organization
- `backend/`: Flask app (`app.py`), Cosmos DB access (`cosmos_service.py`), auth (`auth_utils*.py`), security and validation utilities (`security*.py`, `validators.py`), Gunicorn config.
- `frontend/`: React app (CRA). Components live in `src/Components/`, utilities in `src/utils/` and API config in `src/config/`. Static assets under `public/`.
- Root: `Dockerfile`, repository docs, and favicons.

## Build, Test, and Development Commands
- Backend setup: `cd backend && python -m venv venv && source venv/bin/activate` (Windows: `venv\Scripts\activate`) then `pip install -r requirements.txt`.
- Run backend locally: `flask run --port 10000` (expects `.env` with `SECRET_KEY`, `FRONTEND_URL`, Azure IDs, and Google credentials).
- Frontend setup: `cd frontend && npm install`.
- Run frontend locally: `npm start` (proxies `/api` to `http://localhost:10000`).
- Frontend build: `npm run build`.
- Docker (full stack): `docker build -t traffpunkt-statistik .` then run with `docker run -p 8080:8080 traffpunkt-statistik`.

## Coding Style & Naming Conventions
- Python: PEP 8, 4‑space indent, `snake_case` for functions/variables, `PascalCase` for classes. Keep routes in `app.py`, move helpers to focused modules.
- JavaScript: Use ES modules and React hooks. Components in `src/Components/` use `PascalCase` files (e.g., `Dashboard.js`, `Registration.css`); utilities in `camelCase` (e.g., `dateHelpers.js`). CRA’s ESLint/Jest config is enabled via `react-scripts`.

## Testing Guidelines
- Frontend: React Testing Library/Jest. Place tests next to code as `*.test.js` (e.g., `App.test.js`). Run with `npm test`.
- Backend: No test suite included yet—prefer `pytest` for new tests. Keep unit tests close to modules (e.g., `backend/tests/test_security.py`).

## Commit & Pull Request Guidelines
- Commits: Use imperative mood and concise subjects (e.g., "Add attendance totals"). Include a brief "why" in the body when relevant and reference issues (e.g., `Closes #123`).
- PRs: Provide a clear summary, linked issues, and screenshots/GIFs for UI changes. Confirm: local run OK, `npm test` passes, and basic manual flows (login, register, dashboard) work.

## Security & Configuration Tips
- Required env (backend `.env`): `SECRET_KEY`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `FRONTEND_URL`, `GOOGLE_APPLICATION_CREDENTIALS`.
- Rate limiting and security headers are enforced in `security.py`; avoid bypassing in new endpoints. Validate and sanitize all inputs using existing helpers.
