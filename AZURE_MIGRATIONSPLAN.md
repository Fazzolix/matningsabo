# Kodmigrering till Azure (Cosmos DB)

Denna plan är enbart för kodändringar i repot så att applikationen fungerar på Azure Container Apps med Azure Cosmos DB. Ingen datamigrering eller Azure‑resursskapande ingår – det hanterar du separat. Bocka av varje steg när det är klart.

Målet är att efter dessa kodsteg ska appen fungera med en tom Cosmos‑databas (ny kula). Du pushar och skapar själv resurser i Azure efteråt.


## Scope och antaganden

- Endast kod i detta repo ändras.
- Backend byter Firestore → Cosmos DB (NoSQL/SQL‑API) via `azure-cosmos`.
- Frontend förblir oförändrad (relativa `/api`‑vägar, MSAL för inloggning).
- Azure AD‑inloggning behålls (Graph‑validering i backend redan på plats).


## Checklista (koden att ändra)

- [x] Uppdatera `backend/requirements.txt` (ta bort Firestore, lägg till `azure-cosmos`)
- [x] Skapa `backend/cosmos_service.py` med API kompatibelt med `FirestoreService`
- [x] Byt import/instans i `backend/app.py` till `CosmosService`
- [x] Byt import/användning i `backend/auth_utils.py` till `CosmosService`
- [x] Lägg till Cosmos‑miljövariabler i `backend/.env.example`
- [x] Sanera eventuella Firestore‑rester (imports/kommentarer)
- [ ] Snabb lokal verifikation (körning) med Cosmos‑env (tom DB)

Markera som klar i denna fil när respektive punkt är genomförd.


## 1) Beroenden

Uppdatera `backend/requirements.txt`:

- Ta bort: `google-cloud-firestore==2.16.0`
- Lägg till: `azure-cosmos==4.6.0` (eller senaste 4.x)

Övriga rader ligger kvar.


## 2) Ny service: `CosmosService`

Lägg till filen `backend/cosmos_service.py` som efterliknar metoderna som används i koden idag. Stöd nedan behövs (matchar anrop i `app.py`/`auth_utils.py`):

- Träffpunkter: `get_all_traffpunkter()`, `add_traffpunkt(data)`
- Aktiviteter: `get_all_activities()`, `get_activity(id)`, `find_activity_by_name(name)`, `add_activity_if_not_exists(name)`, `add_activity(data)`, `update_activity_name(id, new_name, old_name)`, `deactivate_activity(id)`
- Närvaro: `add_attendance_record(data)`, `get_statistics(traffpunkt_id, date_from, date_to)`, `list_my_attendance(oid, email, date_from, date_to, limit)`, `get_attendance(id)`, `update_attendance(id, new_data)`, `delete_attendance(id)`, `write_attendance_audit(action, actor_oid, actor_email, attendance_id, changed_fields=None)`
- Användare/roller: `upsert_user(oid, email, display_name)`, `get_user(oid)`, `list_users(q=None, limit=200)`, `set_admin_role(target_oid, admin, actor_oid, actor_email)`

Riktlinjer och detaljer:

- Initiera klienten med env: `COSMOS_ENDPOINT`, `COSMOS_KEY`, `COSMOS_DATABASE` och container‑namn för respektive logisk samling. Vid init skapar `CosmosService` databasen och alla containers om de saknas (auto‑provisionering).
- Sätt dokumentets `id` explicit (generera `uuid4()` där Firestore hade auto‑ID).
- Datum/tider lagras som ISO‑strängar (`datetime.utcnow().isoformat()`).
- Queries med SQL‑API, t.ex. `SELECT * FROM c WHERE c.traffpunkt_id = @id AND c.date >= @from AND c.date <= @to`, med parametrar och `enable_cross_partition_query=True` när partition ej specificeras.
- Partitioner (rekommenderat i Cosmos):
  - `attendance_records`: `/traffpunkt_id`
  - `activities`, `traffpunkter`, `Users_traffpunkt`, `Admin_audit_traffpunkt`, `Attendance_audit_traffpunkt`: `/id`
- `update_activity_name`: query på attendance records där `activity == old_name`, uppdatera i mindre batchar.
- `list_my_attendance`: hämta på `registered_by_oid == oid` samt fallback via `registered_by == email`; sortera i Python som idag.


## 3) Uppdatera imports/instanser

Gör följande kodändringar (radnummer avser nuvarande repo‑version):

- Byt import i `backend/app.py:11`:
  - från: `from firestore_service import FirestoreService`
  - till: `from cosmos_service import CosmosService`

- Byt instansiering i `backend/app.py:55`:
  - från: `db_service = FirestoreService()`
  - till: `db_service = CosmosService()`

- Byt import i `backend/auth_utils.py:7`:
  - från: `from firestore_service import FirestoreService`
  - till: `from cosmos_service import CosmosService`

- Uppdatera användningsställen i `backend/auth_utils.py`:
  - `upsert_user(...)` efter login (ca `backend/auth_utils.py:93-99`)
  - `get_user(...)` i `require_admin` (ca `backend/auth_utils.py:158-166`)

Övrig kod kan vara oförändrad om `CosmosService` följer samma metodsignaturer som `FirestoreService`.


## 4) Miljövariabler

Uppdatera `backend/.env.example` (lägg till):

```
COSMOS_ENDPOINT="https://<ditt-cosmos>.documents.azure.com:443/"
COSMOS_KEY="<primar-nyckel>"
COSMOS_DATABASE="traffpunkt"
COSMOS_CONTAINER_ATTENDANCE="attendance_records"
COSMOS_CONTAINER_ACTIVITIES="activities"
COSMOS_CONTAINER_TRAFFPUNKTER="traffpunkter"
COSMOS_CONTAINER_USERS="Users_traffpunkt"
COSMOS_CONTAINER_ADMIN_AUDIT="Admin_audit_traffpunkt"
COSMOS_CONTAINER_ATTENDANCE_AUDIT="Attendance_audit_traffpunkt"
```

OBS: `FRONTEND_URL` ska peka på samma ursprung som Container App:ens URL när frontend serveras av backend (vilket vår Dockerfile gör). Annars ange korrekt CORS‑ursprung.


## 5) Sessions (säker cookie‑baserad)

Vi använder nu Flask inbyggda, signerade cookies för session (HttpOnly, Secure, SameSite=Lax). Ingen delad serverlagring krävs och flera repliker stöds utan extra arbete. Inga ytterligare steg behövs när koden i denna plan är genomförd.


## 6) Lokal snabbverifiering

- Sätt Cosmos‑env i `backend/.env` (eller exportera env‑variabler).
- Starta backend: `flask run --port 10000`
- Starta frontend: `npm start` (proxy till `/api`)
- Verifiera: loginflöde, `GET /api/activities` (bör ge 200, ev. tom lista), skapa aktivitet/traffpunkt, registrera närvaro, statistik.


## 7) Klarmarkering

Använd checklistan i början. När alla punkter är bockade är repot redo för att du själv pushar och sätter upp Azure‑resurser.


## Appendix: Skiss för `CosmosService`

```python
from azure.cosmos import CosmosClient
from datetime import datetime
from uuid import uuid4
import os

class CosmosService:
    def __init__(self):
        ep = os.getenv('COSMOS_ENDPOINT')
        key = os.getenv('COSMOS_KEY')
        dbn = os.getenv('COSMOS_DATABASE', 'traffpunkt')
        self.client = CosmosClient(ep, key)
        self.db = self.client.get_database_client(dbn)
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

    # Implementera övriga metoder enligt listan i avsnitt 2
```
