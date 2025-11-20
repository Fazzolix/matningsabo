# Enkel guide: Deploy till Azure (Container Apps + Cosmos DB)

Den här guiden är kort och tydlig. Du skapar Resource Group i Portalen, pushar första Docker‑imagen med CLI, och använder Portalen för att skapa Container App, sätta miljövariabler och skapa Cosmos DB.

## Förutsättningar
- Azure Portal‑åtkomst (UI)
- Azure CLI installerad och inloggad (`az login`)
- Docker installerat

## 1) Bygg och pusha Docker‑image (CLI)
Du kan använda Azure Container Registry (ACR) eller Docker Hub. Exemplet nedan utgår från ACR.

1) Logga in och välj subscription
```bash
az login
az account set --subscription <SUBSCRIPTION_ID>
```

2) Hämta ACR login server och logga in
```bash
# Ersätt <ACR_NAME> med ditt ACR (t.ex. saboacr)
ACR_SERVER=$(az acr show -n <ACR_NAME> --query loginServer -o tsv)
az acr login -n <ACR_NAME>
```

3) Bygg och pusha
```bash
# I repo‑roten
docker build -t sabo-utevistelser:latest .

docker tag sabo-utevistelser:latest $ACR_SERVER/sabo-utevistelser:latest

docker push $ACR_SERVER/sabo-utevistelser:latest
```

Tips: Om du använder Docker Hub — tagga till `docker.io/<user>/traffpunkt-statistik:latest` och `docker push` där.

## 2) Skapa Cosmos DB (Portal UI)
- Create a resource → Azure Cosmos DB → Azure Cosmos DB for NoSQL
- Välj din Resource Group
- Skapa kontot (börja med Public network access: Enabled för enklast start)
- Efter skapande, notera:
  - `COSMOS_ENDPOINT` (URI/Endpoint)
  - `COSMOS_KEY` (Primary Key)
- Databas och containers:
  - Appen skapar automatiskt databas och containers vid första körningen
  - Vill du sätta själv: Database `traffpunkt`

## 3) Skapa Container App (Portal UI)
- Create → Container Apps
- Miljö: skapa ny (eller välj befintlig)
- Container image: välj din image från ACR (ex: `$ACR_SERVER/sabo-utevistelser:latest`)
- Ingress: ON (external)
- Target Port: `8080`

### Miljövariabler (Application)
- `SECRET_KEY` = stark hemlighet
- `AZURE_CLIENT_ID` = din App Registration (Client ID)
- `AZURE_TENANT_ID` = din Tenant ID
- `FRONTEND_URL` = `https://<din-containerapp-domän>` (eller extern frontend‑domän)
- `SUPERADMIN_EMAIL` = din admin‑e‑post
- `COSMOS_DATABASE` = `sabo`
- `COSMOS_CONTAINER_VISITS` = `outdoor_visits`
- `COSMOS_CONTAINER_ACTIVITIES` = `activities`
- `COSMOS_CONTAINER_HOMES` = `homes`
- `COSMOS_CONTAINER_COMPANIONS` = `companions`
- `COSMOS_CONTAINER_USERS` = `users_sabo`
- `COSMOS_CONTAINER_ADMIN_AUDIT` = `admin_audit_sabo`
- `COSMOS_CONTAINER_VISIT_AUDIT` = `visit_audit_sabo`

### Secrets (referera som env)
- Secret `COSMOS_ENDPOINT` = din Cosmos endpoint
- Secret `COSMOS_KEY` = din Cosmos primary key
- Lägg sedan till env vars som refererar dessa secrets: `COSMOS_ENDPOINT`, `COSMOS_KEY`

Spara/skapa Container App.

## 4) Verifiera
- Öppna Container App‑URL i webbläsaren
- Hälsa: `https://<din-domän>/health` → `{ "status": "healthy" }`
- Logga in via Azure AD
- Testa i appen:
  - Hämta/Skapa aktivitet
  - Lägg till äldreboende + avdelning (admin)
  - Registrera utevistelse (ny aktivitet auto‑skapas vid behov)
  - Hämta statistik

## 5) Vanliga fel och snabba fixar
- 401/redirect: Ingress = ON (external), `FRONTEND_URL` matchar domänen (inkl. https)
- Cosmos 5xx: kontrollera `COSMOS_ENDPOINT`/`COSMOS_KEY`, och att Cosmos har Public network access: Enabled
- CORS (separat frontend): `FRONTEND_URL` måste matcha din frontend‑domän

## 6) Nya deployer
- Bygg och pusha ny image: `docker build` → `docker tag` → `docker push`
- Uppdatera Container App till ny image i Portal (eller `az containerapp update --image <...>`)

## 7) Notiser
- Appen lyssnar på port `8080`
- Sessioner: säkra cookie‑sessioner (HttpOnly, Secure, SameSite=Lax) — flera repliker stöds
- Cosmos: appen skapar databas/containers automatiskt om de saknas

Klart! Efter detta ska allt fungera utan fler kodändringar.
