# Migrering till Azure Container Apps + Cosmos DB

Denna plan beskriver i detalj hur vi migrerar Träffpunktsstatistik från Google Cloud Run + Firestore till Azure Container Apps + Azure Cosmos DB (NoSQL/SQL‑API). Planen är skriven för att en agent/utvecklare ska kunna följa den steg för steg och bocka av moment efter hand.

Målet är att när planen är genomförd ska vi kunna:
- bygga och publicera containern till Azure Container Apps,
- använda Cosmos DB som datalager,
- fortsätta använda Azure AD för inloggning,
- och få hela stacken att fungera utan kod som refererar till Firestore.


## Översikt

- Körmiljö: Azure Container Apps (extern ingress, port `8080`).
- Databas: Azure Cosmos DB for NoSQL (SQL‑API) via Python‑SDK `azure-cosmos`.
- Autentisering: Oförändrat (Azure AD via MSAL i frontend och Graph‑validering i backend).
- Docker: Befintlig `Dockerfile` används; inga OS‑paket krävs för Cosmos SDK.


## Prerequisites

- Azure‑prenumeration och åtkomst till Azure CLI (`az`).
- Azure AD app‑registrering (redan i bruk).
- Valfritt: Azure Container Registry (ACR) för lagring av images, alternativt Docker Hub.


## Checklista (bocka av under arbetets gång)

- [ ] Skapa Azure‑resurser (RG, Cosmos, ev. ACR, Container Apps miljö)
- [ ] Lägga till Cosmos‑konfiguration i `.env` och Container App‑hemligheter
- [ ] Byta ut Firestore‑beroendet i `backend/requirements.txt`
- [ ] Implementera `backend/cosmos_service.py` (ersätter FirestoreService)
- [ ] Uppdatera imports och instansering i backend till CosmosService
- [ ] Köra lokalt mot Cosmos (eller emulator) och verifiera API
- [ ] (Valfritt) Migrera befintlig data från Firestore till Cosmos
- [ ] Bygga image, pusha till registry och skapa Container App
- [ ] Verifiera end‑to‑end (login, registrering, statistik, admin)
- [ ] Städa bort oanvänd Firestore‑kod efter driftsättning


## 1) Skapa Azure‑resurser

Anpassa namn/region enligt er standard.

```bash
# Bas
az login
az account set --subscription <SUBSCRIPTION_ID>
az group create -n rg-traffpunkt -l westeurope

# Cosmos DB (NoSQL/SQL-API)
az cosmosdb create -g rg-traffpunkt -n traffpunkt-cosmos --kind GlobalDocumentDB
az cosmosdb sql database create -a traffpunkt-cosmos -g rg-traffpunkt -n traffpunkt

# Skapa containers (se partitioneringsnycklar nedan)
az cosmosdb sql container create -a traffpunkt-cosmos -g rg-traffpunkt -d traffpunkt -n attendance_records \
  --partition-key-path "/traffpunkt_id" --throughput 400
az cosmosdb sql container create -a traffpunkt-cosmos -g rg-traffpunkt -d traffpunkt -n activities \
  --partition-key-path "/id" --throughput 400
az cosmosdb sql container create -a traffpunkt-cosmos -g rg-traffpunkt -d traffpunkt -n traffpunkter \
  --partition-key-path "/id" --throughput 400
az cosmosdb sql container create -a traffpunkt-cosmos -g rg-traffpunkt -d traffpunkt -n Users_traffpunkt \
  --partition-key-path "/id" --throughput 400
az cosmosdb sql container create -a traffpunkt-cosmos -g rg-traffpunkt -d traffpunkt -n Admin_audit_traffpunkt \
  --partition-key-path "/id" --throughput 400
az cosmosdb sql container create -a traffpunkt-cosmos -g rg-traffpunkt -d traffpunkt -n Attendance_audit_traffpunkt \
  --partition-key-path "/id" --throughput 400

# Valfritt: ACR
az acr create -g rg-traffpunkt -n traffpunktacr --sku Basic
az acr login -n traffpunktacr
```

Notera: `attendance_records` partitioneras på `/traffpunkt_id` för effektiv filtrering och skalning. Övriga containers på `/id` räcker för vår åtkomstprofil.


## 2) Backend: konfiguration och beroenden

Miljövariabler (lägg till i `backend/.env` och som Container Apps secrets):

- `COSMOS_ENDPOINT` – från Cosmos‑kontots overview
- `COSMOS_KEY` – primär nyckel
- `COSMOS_DATABASE=traffpunkt`
- `COSMOS_CONTAINER_ATTENDANCE=attendance_records`
- `COSMOS_CONTAINER_ACTIVITIES=activities`
- `COSMOS_CONTAINER_TRAFFPUNKTER=traffpunkter`
- `COSMOS_CONTAINER_USERS=Users_traffpunkt`
- `COSMOS_CONTAINER_ADMIN_AUDIT=Admin_audit_traffpunkt`
- `COSMOS_CONTAINER_ATTENDANCE_AUDIT=Attendance_audit_traffpunkt`

Byt Python‑beroende:

- [ ] I `backend/requirements.txt`: ersätt `google-cloud-firestore==2.16.0` med `azure-cosmos==4.*`

Exempel:

```
Flask==3.0.0
Flask-Cors==4.0.0
Flask-Session==0.8.0
python-dotenv==1.0.0
azure-cosmos==4.6.0
gunicorn==22.0.0
requests==2.32.3
```


## 3) Backend: ersätt Firestore med CosmosService

Skapa ny modul `backend/cosmos_service.py` som efterliknar gränssnittet i `FirestoreService`. Den ska exponera motsvarande metoder som används i appen:

- Datainsamling/statistik: `add_attendance_record`, `get_statistics`, `list_my_attendance`, `get_attendance`, `update_attendance`, `delete_attendance`, `write_attendance_audit`
- Aktiviteter: `get_all_activities`, `get_activity`, `find_activity_by_name`, `add_activity_if_not_exists`, `add_activity`, `update_activity_name`, `deactivate_activity`
- Träffpunkter: `get_all_traffpunkter`, `add_traffpunkt`
- Roller/användare: `upsert_user`, `get_user`, `list_users`, `set_admin_role`

Implementationsriktlinjer:

- Använd `from azure.cosmos import CosmosClient` och `client.get_database_client(DB).get_container_client(NAME)`.
- Dokumentets `id` måste explicit finnas i objektet. Generera med `uuid4()` där Firestore tidigare skapade auto‑ID.
- Tidsstämplar: använd `datetime.utcnow().isoformat()` (eller bevara befintliga `datetime` som ISO‑strängar). Ersätt all användning av `firestore.SERVER_TIMESTAMP` i service‑lagret.
- Queries: använd SQL‑syntax, t.ex. `SELECT * FROM c WHERE c.traffpunkt_id = @id AND c.date >= @from AND c.date <= @to`. Sätt `enable_cross_partition_query=True` när partitionen inte specificeras.
- Batch‑uppdateringar/rename (t.ex. `update_activity_name`): iterera via query och uppdatera i mindre batchar (ingen global transaktion krävs).
- Sortering (t.ex. i `list_my_attendance`): sortera i Python efter hämtning om nödvändigt.

Kodändringar i befintliga filer (radnummer från nuvarande branch):

- [ ] Byt import i `backend/app.py:11` från `firestore_service import FirestoreService` till `cosmos_service import CosmosService`.
- [ ] Byt instansiering i `backend/app.py:55` från `FirestoreService()` till `CosmosService()`.
- [ ] Byt import i `backend/auth_utils.py:7` från `FirestoreService` till `CosmosService`.
- [ ] Uppdatera användningar i `backend/auth_utils.py` vid:
  - `upsert_user` efter login (`backend/auth_utils.py:93-99`).
  - `require_admin` roll‑check (`backend/auth_utils.py:158-166`).

Tips: Håll CosmosService API kompatibelt med FirestoreService så att övrig kod kan stå oförändrad.


## 4) Datamodell i Cosmos

- Database: `traffpunkt`
- Containers och partitionering:
  - `attendance_records` – partition `/traffpunkt_id`
  - `activities` – partition `/id`
  - `traffpunkter` – partition `/id`
  - `Users_traffpunkt` – partition `/id`
  - `Admin_audit_traffpunkt` – partition `/id`
  - `Attendance_audit_traffpunkt` – partition `/id`

Index: Cosmos indexerar allt per default. Ingen extra indexkonfiguration krävs för nuvarande queries (likhet + datumintervall på strängdatum). Se över RU om queries blir tunga.


## 5) (Valfritt) Migrera data från Firestore

Skapa ett skript `backend/scripts/migrate_firestore_to_cosmos.py` som:

1. Läser Firestore (kräver lokal `GOOGLE_APPLICATION_CREDENTIALS`).
2. Mappar dokument 1‑till‑1 till Cosmos containers (samma fältnamn; säkerställ att `id` finns och är unik).
3. Skriver in i Cosmos via `CosmosClient` med `upsert=True`.

Kör i små batchar och verifiera counts per collection innan switch.


## 6) Lokal körning mot Cosmos

- Sätt Cosmos‑env i `backend/.env`.
- Starta backend: `flask run --port 10000`.
- Frontend fungerar oförändrat (`npm start`), proxar `/api` till backend.

Tips: Cosmos emulator finns för lokal offline‑körning, men kräver Windows/macOS. Alternativt använd en riktig Cosmos‑instans i test‑RG.


## 7) Bygg och deploy till Azure Container Apps

Bygg och pusha image (ACR‑exempel):

```bash
docker build -t traffpunkt-statistik .
docker tag traffpunkt-statistik traffpunktacr.azurecr.io/traffpunkt-statistik:latest
docker push traffpunktacr.azurecr.io/traffpunkt-statistik:latest
```

Skapa Container Apps miljö och app:

```bash
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App

# Miljö
az containerapp env create -g rg-traffpunkt -n traffpunkt-env -l westeurope

# Secrets (Cosmos)
COSMOS_ENDPOINT=$(az cosmosdb show -n traffpunkt-cosmos -g rg-traffpunkt --query documentEndpoint -o tsv)
COSMOS_KEY=$(az cosmosdb keys list -n traffpunkt-cosmos -g rg-traffpunkt --type keys --query primaryMasterKey -o tsv)

az containerapp create -g rg-traffpunkt -n traffpunkt-api \
  --environment traffpunkt-env \
  --image traffpunktacr.azurecr.io/traffpunkt-statistik:latest \
  --ingress external --target-port 8080 \
  --registry-server traffpunktacr.azurecr.io \
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

# Uppdatering vid nya images
az containerapp update -g rg-traffpunkt -n traffpunkt-api \
  --image traffpunktacr.azurecr.io/traffpunkt-statistik:latest
```

Notera: `FRONTEND_URL` måste sättas till den domän där frontend körs (om frontend och backend körs från samma container är detta Container App:ens URL).


## 8) Verifiering

- [ ] `GET /health` returnerar `{ status: "healthy" }`
- [ ] Login via Azure AD fungerar (MSAL redirect)
- [ ] `GET /api/activities` returnerar 200 (tom lista från ny Cosmos)
- [ ] `POST /api/activities` (admin) skapar aktivitet
- [ ] `POST /api/traffpunkter` (admin) skapar träffpunkt
- [ ] `POST /api/attendance` skapar närvaropost (kontrollera i Cosmos)
- [ ] `GET /api/statistics` ger data enligt filter
- [ ] Adminviews: lista användare och toggla admin‑roll


## 9) Drift & loggar

- Strömma loggar:
  ```bash
  az containerapp logs show -g rg-traffpunkt -n traffpunkt-api --follow
  ```
- Skala (valfritt): `az containerapp revision set-mode`, `az containerapp update --min-replicas 1 --max-replicas 3`
- Sätt ev. liveness/readiness probes via `az containerapp update` om behov uppstår.


## 10) Rollback & städ

- Behåll Cloud Run aktiv tills produktion verifierats i Azure.
- DNS‑switch: peka frontend/backendlänkar till nya URL:er när klart.
- Ta bort Firestore‑beroenden och gamla konfigurationer när migrationen är stabil.


## Appendix: Implementationsskisser (CosmosService)

Pseudokod för `CosmosService` init och enklare metoder:

```python
from azure.cosmos import CosmosClient, PartitionKey
from datetime import datetime
from uuid import uuid4
import os

class CosmosService:
    def __init__(self):
        endpoint = os.getenv('COSMOS_ENDPOINT')
        key = os.getenv('COSMOS_KEY')
        db_name = os.getenv('COSMOS_DATABASE', 'traffpunkt')
        self.client = CosmosClient(endpoint, key)
        self.db = self.client.get_database_client(db_name)
        def c(name):
            return self.db.get_container_client(os.getenv(f'COSMOS_CONTAINER_{name}', name.lower()))
        self.c_att = c('ATTENDANCE')
        self.c_act = c('ACTIVITIES')
        self.c_tp = c('TRAFFPUNKTER')
        self.c_users = c('USERS')
        self.c_admin_audit = c('ADMIN_AUDIT')
        self.c_att_audit = c('ATTENDANCE_AUDIT')

    def add_attendance_record(self, data):
        data = dict(data)
        data['id'] = data.get('id') or str(uuid4())
        data['registered_at'] = data.get('registered_at') or datetime.utcnow().isoformat()
        data['last_modified_at'] = data.get('last_modified_at') or data['registered_at']
        self.c_att.create_item(data)
        return data['id']

    def get_all_activities(self):
        return list(self.c_act.read_all_items())

    # ... (övriga metoder enligt planens lista)
```

Följ planens metodlista och efterlikna Firestore‑API:t där det är möjligt.

