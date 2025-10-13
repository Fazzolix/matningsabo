# Träffpunktsstatistik - Skövde kommun

Digital plattform för insamling och visualisering av besöksstatistik från kommunens träffpunkter.

## 🎯 Funktioner

- **Enkel registrering** – Snabb inmatning av besöksdata via mobilanpassat formulär
- **Mina registreringar** – Se och revidera egna registreringar (senaste veckan som standard), med redigera/ta bort
- **Realtidsstatistik** – Dashboard med aktuella nyckeltal och trender
- **Flexibel filtrering** – Analysera data per träffpunkt, tidsperiod och aktivitet
- **Rollbaserad admin** – Superadmin (via env) kan ge/tar bort admin‑rättigheter; admin kan lägga till, byta namn på och ta bort aktiviteter samt lägga till träffpunkter
- **Säker inloggning** – Azure AD med redirect‑flöde (fungerar på mobil och desktop)

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
```

2. Installera backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. Installera :) frontend:
```bash
cd ../frontend
npm install
```

4. Konfigurera miljövariabler:
```bash
# backend/.env
SECRET_KEY=<hemlig-nyckel>
AZURE_CLIENT_ID=<azure-app-id>
AZURE_TENANT_ID=<azure-tenant-id>
FRONTEND_URL=http://localhost:3000
SUPERADMIN_EMAIL=<din.epost@skovde.se>
GOOGLE_APPLICATION_CREDENTIALS=<sökväg-till-service-account.json>
```

5. Starta utvecklingsservrar:
```bash
# Terminal 1
cd backend
flask run --port 10000

# Terminal 2
cd frontend
npm start
```

## 🏗️ Arkitektur

- **Frontend**: React, Material‑UI, MSAL (redirect‑flow, BrowserRouter)
- **Backend**: Flask, Gunicorn, Flask-Session
- **Databas**: Google Firestore
- **Autentisering**: Azure AD
- **Hosting**: Google Cloud Run

## 📊 Datamodell

### Träffpunkter
- ID, namn, adress, aktiv status

### Närvaroregistreringar (collection `attendance_records`)
- Träffpunkt (`traffpunkt_id`), datum (`date`), tidsblock (`time_block`: `fm`/`em`/`kv`)
- Aktivitet (`activity`)
- Deltagarantal (äldreboende/trygghetsboende/externa/nya, män/kvinnor); beräknad `total_participants`
  - Anm: Äldreboende lagras internt under nyckeln `boende` för bakåtkompatibilitet; Trygghetsboende använder nyckeln `trygghetsboende`.
- Registrerad av (`registered_by` e‑post) och tidpunkt (`registered_at`)
- Ägar‑OID (`registered_by_oid`), senaste ändring (`last_modified_at`), antal redigeringar (`edit_count`)

### Användare och roller
- `Users_traffpunkt`: docID = Azure `oid`, fält: `email`, `display_name`, `roles: { admin: bool }`, `created_at`, `last_login_at`, `id`
- `Admin_audit_traffpunkt`: audit vid rolländringar

### Audit för registreringar
- `Attendance_audit_traffpunkt`: audit för update/delete av närvaroposter

### Aktiviteter
- ID, namn, kategori, sorteringsordning, `active`
- Att ta bort en aktivitet inaktiverar den (soft delete via `active=false`). Historiska registreringar ligger kvar, men aktiviteten visas inte längre för ny registrering.
- Att byta namn på en aktivitet uppdaterar både aktivitetsdokumentet och historiska registreringar så att statistik och filter fortsätter fungera med det nya namnet.

## 🔐 Säkerhet

- Azure AD‑autentisering (redirect‑flöde) krävs för all åtkomst
- Sessionscookies med HttpOnly och Secure flags
- CORS konfigurerat för produktions-URL
- Firestore-åtkomst via Google IAM
- Rollkontroll i backend: `require_admin` skyddar skriv‑endpoints för aktiviteter/träffpunkter, `require_superadmin` skyddar admin‑API för rollhantering
- Ratelimits på API, striktare på admin‑endpoints

## 👥 Roller & Admin

- `SUPERADMIN_EMAIL` anger första superadmin (miljövariabel). Superadmin kan inte ändras via UI.
- Superadmin kan i Admin → “Rollhantering” söka upp användare (via e‑post) och slå på/av admin per användare.
- Admin (och superadmin) kan lägga till nya aktiviteter och träffpunkter.

## 🧑‍💻 Mina registreringar (Revidera)

- Ny flik “Mina registreringar” visar senaste 7 dagarna (bläddra vecka fram/bak).
- Klicka på en registrering för att redigera alla fält; spara uppdaterar samma dokument.
- “Ta bort” finns med bekräftelse. Endast egna registreringar kan ändras/tas bort.

## 🔌 API (nya endpoints)

- `GET /api/me` → `{ email, display_name, is_superadmin, is_admin }`
- `GET /api/admin/users?q=&limit=` (superadmin)
- `PUT /api/admin/users/:id/role` body `{ admin: boolean }` (superadmin)
- `GET /api/my-attendance?from=YYYY-MM-DD&to=YYYY-MM-DD` → egna registreringar (sammanfattning)
- `GET /api/attendance/:id` → full post (endast ägare)
- `PUT /api/attendance/:id` → uppdatera (endast ägare)
- `DELETE /api/attendance/:id` → ta bort (endast ägare)
 - `GET /api/activities` → aktiva aktiviteter (admin krävs ej för läsning, kräver auth)
 - `POST /api/activities` (admin) → lägg till aktivitet
 - `PUT /api/activities/:id` (admin) → byt namn på aktivitet, uppdaterar historiska registreringar
 - `DELETE /api/activities/:id` (admin) → inaktivera aktivitet (soft delete)
## 🚢 Deployment (Azure)

Detta är den nya målmiljön: Azure Container Apps + Cosmos DB.

1. Bygg och tagga image
   ```bash
   docker build -t traffpunkt-statistik .
   docker tag traffpunkt-statistik <registry>/traffpunkt-statistik:latest
   ```

2. Pusha image till registry (ACR eller Docker Hub)
   ```bash
   docker push <registry>/traffpunkt-statistik:latest
   ```

3. Skapa resurser och Container App (exempel via ACR)
   ```bash
   az login
   az account set --subscription <SUBSCRIPTION_ID>
   az group create -n rg-traffpunkt -l westeurope
   az cosmosdb create -g rg-traffpunkt -n traffpunkt-cosmos --kind GlobalDocumentDB
   az cosmosdb sql database create -a traffpunkt-cosmos -g rg-traffpunkt -n traffpunkt
   # Containers (partitioner enligt migrationsplan)
   az cosmosdb sql container create -a traffpunkt-cosmos -g rg-traffpunkt -d traffpunkt -n attendance_records --partition-key-path "/traffpunkt_id" --throughput 400
   az cosmosdb sql container create -a traffpunkt-cosmos -g rg-traffpunkt -d traffpunkt -n activities --partition-key-path "/id" --throughput 400
   az cosmosdb sql container create -a traffpunkt-cosmos -g rg-traffpunkt -d traffpunkt -n traffpunkter --partition-key-path "/id" --throughput 400
   az cosmosdb sql container create -a traffpunkt-cosmos -g rg-traffpunkt -d traffpunkt -n Users_traffpunkt --partition-key-path "/id" --throughput 400
   az cosmosdb sql container create -a traffpunkt-cosmos -g rg-traffpunkt -d traffpunkt -n Admin_audit_traffpunkt --partition-key-path "/id" --throughput 400
   az cosmosdb sql container create -a traffpunkt-cosmos -g rg-traffpunkt -d traffpunkt -n Attendance_audit_traffpunkt --partition-key-path "/id" --throughput 400

   az containerapp env create -g rg-traffpunkt -n traffpunkt-env -l westeurope

   COSMOS_ENDPOINT=$(az cosmosdb show -n traffpunkt-cosmos -g rg-traffpunkt --query documentEndpoint -o tsv)
   COSMOS_KEY=$(az cosmosdb keys list -n traffpunkt-cosmos -g rg-traffpunkt --type keys --query primaryMasterKey -o tsv)

   az containerapp create -g rg-traffpunkt -n traffpunkt-api \
     --environment traffpunkt-env \
     --image <registry>/traffpunkt-statistik:latest \
     --ingress external --target-port 8080 \
     --env-vars \
       SECRET_KEY=generate_me \
       AZURE_CLIENT_ID=<your_azure_app_id> \
       AZURE_TENANT_ID=<your_tenant_id> \
       FRONTEND_URL=https://<your-frontend-host> \
       SUPERADMIN_EMAIL=<email@skovde.se> \
       COSMOS_DATABASE=traffpunkt \
       COSMOS_CONTAINER_ATTENDANCE=attendance_records \
       COSMOS_CONTAINER_ACTIVITIES=activities \
       COSMOS_CONTAINER_TRAFFPUNKTER=traffpunkter \
       COSMOS_CONTAINER_USERS=Users_traffpunkt \
       COSMOS_CONTAINER_ADMIN_AUDIT=Admin_audit_traffpunkt \
       COSMOS_CONTAINER_ATTENDANCE_AUDIT=Attendance_audit_traffpunkt \
     --secrets COSMOS_ENDPOINT=$COSMOS_ENDPOINT COSMOS_KEY=$COSMOS_KEY \
     --env-secret-ref COSMOS_ENDPOINT=COSMOS_ENDPOINT COSMOS_KEY=COSMOS_KEY
   ```

4. Uppdatera revision med ny image vid behov
   ```bash
   az containerapp update -g rg-traffpunkt -n traffpunkt-api --image <registry>/traffpunkt-statistik:latest
   ```

Se även den fullständiga planen i `AZURE_MIGRATIONSPLAN.md`.

## ☁️ Cloud Run (Legacy)

Tidigare deployment till Google Cloud Run (behåll tills Azure‑miljön är verifierad):

1.  Bygg Docker‑image:
    ```bash
    docker build -t traffpunkt-statistik .
    ```

2.  Tagga för GCR:
    ```bash
    docker tag traffpunkt-statistik gcr.io/froga-elin/traffpunkt-statistik
    ```

3.  Pusha image:
    ```bash
    docker push gcr.io/froga-elin/traffpunkt-statistik
    ```

4.  Deploy till Cloud Run:
    ```bash
    gcloud run deploy traffpunkt --image gcr.io/froga-elin/traffpunkt-statistik --platform managed --region europe-west1 --allow-unauthenticated
    ```

## 📝 Miljövariabler

| Variabel | Beskrivning |
|---|---|
| `SECRET_KEY` | Flask session-nyckel |
| `AZURE_CLIENT_ID` | Azure AD app ID |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `FRONTEND_URL` | Frontend URL för CORS |
| `SUPERADMIN_EMAIL` | E‑post för första superadmin |
| `GOOGLE_APPLICATION_CREDENTIALS` | Lokal utveckling mot Firestore (legacy) |
| `COSMOS_ENDPOINT` | Cosmos DB endpoint (hemlighet i Azure) |
| `COSMOS_KEY` | Cosmos DB primär nyckel (hemlighet i Azure) |
| `COSMOS_DATABASE` | Cosmos DB databasnamn, t.ex. `traffpunkt` |
| `COSMOS_CONTAINER_ATTENDANCE` | Container för närvaroposter |
| `COSMOS_CONTAINER_ACTIVITIES` | Container för aktiviteter |
| `COSMOS_CONTAINER_TRAFFPUNKTER` | Container för träffpunkter |
| `COSMOS_CONTAINER_USERS` | Container för användare/roller |
| `COSMOS_CONTAINER_ADMIN_AUDIT` | Container för admin‑audit |
| `COSMOS_CONTAINER_ATTENDANCE_AUDIT` | Container för attendance‑audit |
| `PORT` | Port (sätts av Cloud Run) |

## 🤝 Bidra

1. Skapa en feature branch
2. Gör dina ändringar
3. Skapa en pull request

## 📄 Licens

© 2025 Skövde kommun

---

## Firestore Initial Data

To get the application running, you can add some initial `traffpunkter` (meeting points) via the Admin page in the app. Alternatively, you can add them manually in the Firestore console.

### `traffpunkter` collection

The application provides an Admin page (`/admin`) to add and manage meeting points dynamically.

If you prefer to add them manually, create a document for each meeting point. The document ID should be a URL-friendly version of the name (e.g., "bagaren").

**Example Document:**
- **ID:** `bagaren`
- **Fields:**
    - `name` (String): "Bagaren"
    - `id` (String): "bagaren"
    - `active` (Boolean): `true`
    - `address` (String): ""
    - `description` (String): ""
    - `created_at` (Timestamp): Current time

**Example Träffpunkter:**
- Bagaren
- Aspen
- Ekedal
- Hentorp
- Ryd

### `activities` collection

This collection is now managed automatically. When a user enters a new activity in the registration form, it will be added to this collection. You do not need to add any activities manually.
