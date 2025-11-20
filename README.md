# SÄBO – Utevistelser

Digital plattform för att registrera och analysera utevistelser på Skövdes särskilda boenden.

## 🎯 Funktioner
- **Registrera utevistelser** – mobilanpassat formulär med könsfördelning, status (ja/nej), aktivitet, med vem, varaktighet och nöjdhet.
- **Mina utevistelser** – se, ändra och ta bort dina egna poster.
- **Dashboard** – trender, könsfördelning, populära aktiviteter/avdelningar och tidslinje.
- **Admin** – hantera äldreboenden/avdelningar, aktiviteter och “med vem”.
- **Roller** – superadmin sätter admin‑rättigheter; admin hanterar masterdata. Azure AD för inloggning.

## 🚀 Kom igång

### Förutsättningar
- Node.js 18+
- Python 3.11+
- Azure AD app‑registrering (redirect till backend‑URL)
- Azure Cosmos DB for NoSQL (kontot kan vara tomt – appen skapar containers)

### Installation
1) Klona repot
```bash
git clone <repo-url>
cd matningsabo
```
2) Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```
3) Frontend
```bash
cd ../frontend
npm install
```
4) Miljövariabler (backend/.env)
```bash
SECRET_KEY=<hemlig-nyckel>
AZURE_CLIENT_ID=<azure-app-id>
AZURE_TENANT_ID=<azure-tenant-id>
FRONTEND_URL=http://localhost:3000
SUPERADMIN_EMAIL=<din.epost@skovde.se>
COSMOS_ENDPOINT=<https://ditt-cosmos.documents.azure.com:443/>
COSMOS_KEY=<primar-nyckel>
# valfria/har rimliga default-värden:
COSMOS_DATABASE=sabo
COSMOS_CONTAINER_VISITS=outdoor_visits
COSMOS_CONTAINER_ACTIVITIES=activities
COSMOS_CONTAINER_HOMES=homes
COSMOS_CONTAINER_COMPANIONS=companions
COSMOS_CONTAINER_USERS=users_sabo
COSMOS_CONTAINER_ADMIN_AUDIT=admin_audit_sabo
COSMOS_CONTAINER_VISIT_AUDIT=visit_audit_sabo
```
5) Kör lokalt
```bash
# Terminal 1
cd backend
flask run --port 10000

# Terminal 2
cd frontend
npm start
```
Frontend proxar /api till Flask på port 10000.

## 🏗️ Arkitektur
- **Frontend**: React (CRA), Material UI, MSAL (redirect‑flow), Recharts.
- **Backend**: Flask, Gunicorn, säkra cookies för sessioner, rate limiting och säkerhetsheaders.
- **Databas**: Azure Cosmos DB (SQL API). Partitioner:
  - `outdoor_visits`: `/home_id`
  - `activities`, `homes`, `companions`, `users_sabo`, `admin_audit_sabo`, `visit_audit_sabo`: `/id`
- **Auth**: Azure AD (Graph-token valideras i backend).

## 📊 Datamodell (huvuddrag)
- **homes**: `id` (slug), `name`, `address`, `description`, `active`, `departments` (lista med `id`, `slug`, `name`, `active`, `created_at`).
- **activities**: `id`, `name`, `category`, `sort_order`, `description`, `active`, `created_at`.
- **companions**: `id`, `name`, `active`, `created_at`.
- **outdoor_visits**: `id`, `home_id`, `department_id`, `date`, `visit_type` (`group`/`individual`), `offer_status` (`accepted`/`declined`), `gender_counts` {men, women}, `total_participants`, `activity`/`activity_id`, `companion`/`companion_id`, `duration_minutes`, `satisfaction_entries` [{gender, rating 1‑6}], `registered_by`, `registered_by_oid`, `registered_at`, `last_modified_at`, `edit_count`.
- **users_sabo**: `id` (Azure oid), `email`, `display_name`, `roles.admin`, `created_at`, `last_login_at`.
- **Audits**: `admin_audit_sabo` (rolländringar), `visit_audit_sabo` (update/delete av besök).

## 🔌 API (aktuella endpoints)
- Auth/roll: `GET /api/me`, `GET/POST /api/azure-user`, `GET /api/azure-config`
- Homes: `GET /api/aldreboenden`, `POST /api/aldreboenden` (admin)
- Departments: `POST /api/aldreboenden/:id/departments` (admin), `PUT`/`DELETE` för en avdelning
- Aktiviteter: `GET /api/activities`, `POST`/`PUT`/`DELETE` (admin)
- Med vem: `GET /api/companions`, `POST`/`PUT`/`DELETE` (admin)
- Statistik: `GET /api/statistics?home=&from=&to=&department=&activity=&companion=&offer_status=&visit_type=`
- Utevistelser: `POST /api/visits`, `GET /api/visits/:id`, `PUT /api/visits/:id`, `DELETE /api/visits/:id`
- Mina utevistelser: `GET /api/my-visits?from=&to=`
- Admin roller (superadmin): `GET /api/admin/users`, `PUT /api/admin/users/:id/role`

## 🚢 Deploy (Azure Container Apps)
1) Bygg och pusha image (ACR eller Docker Hub)
```bash
docker build -t sabo-utevistelser:latest .
docker tag sabo-utevistelser:latest <registry>/sabo-utevistelser:latest
docker push <registry>/sabo-utevistelser:latest
```
2) Skapa Container App (Portal eller CLI) med env/secrets enligt listan ovan. Appen skapar databasen/containers om de saknas.
3) Ingress: external, port 8080. `FRONTEND_URL` ska matcha den externa URL:en (eller separat frontend‑domän).
4) Ny deploy: uppdatera imagen i Container App.

## ✅ Vad som togs bort
- Firestore‑kod och env beroenden.
- Legacy “träffpunkt”‑navigering/containrar; alla namn matchar nu äldreboende/utebesök.
- Cloud Run‑instruktioner.

## 🤝 Bidra
1. Skapa en feature branch
2. Gör ändringar
3. Skapa en pull request

© 2025 Skövde kommun
