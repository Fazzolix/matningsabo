# agentsazure: Instruktioner till agenten för Azure‑deploy (Container Apps + Cosmos DB)

Syfte
- När användaren skriver “hjälp mig att deploya”, följ denna manual: fråga in nödvändiga detaljer, kör az‑kommandon via Azure‑MCP, och deploya till Azure Container Apps (region alltid swedencentral) med Cosmos DB där det behövs.

Grundregler
- Använd alltid region `swedencentral` (fråga aldrig om region).
- Kör alla `az`‑kommandon via Azure‑MCP‑verktyget (inte direkt shell om MCP finns).
- Visa en kort preamble innan grupper av kommandon körs.
- Skriv aldrig ut hemliga värden (nycklar, lösenord, connection strings).
- Kör inga destruktiva kommandon (t.ex. delete) utan uttrycklig bekräftelse.

Steg 0 – Inloggning och subscription
- Kontrollera inloggning: kör `az account show`.
- Om inte inloggad: Fråga användaren att välja inloggningsmetod och kör en av:
  - Interaktiv: `az login` (alt. `az login --use-device-code`).
  - Service Principal: `az login --service-principal -u <APP_ID> -p <PASSWORD|CERT> --tenant <TENANT_ID>`.
- Fråga: “Vilken subscription (namn eller ID) ska användas?” och kör `az account set --subscription <SUBSCRIPTION>`.
- Säkerställ verktyg/extension: `az extension add --name containerapp --upgrade`.

Steg 1 – Repo‑svep (analysera aktuellt repo)
- Leta `Dockerfile` i repo‑rot (eller tjänstekataloger). Om flera: fråga vilken som ska användas.
- Läs port från `EXPOSE` eller `PORT` i Dockerfile; fallback 8080 om oklart.
- Identifiera backend/stack och env‑behov (t.ex. `SECRET_KEY`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `FRONTEND_URL`, `COSMOS_*`).
- Om ingen Dockerfile hittas: fråga om ett bas‑Dockerfile ska skapas. Om nej: avbryt deploy.

Steg 2 – Fråga in nödvändiga uppgifter
- “Bekräfta Azure‑subscription (namn eller ID): …”
- “Ange Resource Group‑namn (skapas om saknas): …”
- “Välj registry: ACR (standard) eller Docker Hub?”
- “ACR‑namn (om ACR) eller extern image (t.ex. docker.io/user/repo:tag): …”
- “Container Apps Environment‑namn: …”
- “Container App‑namn: …”
- “Cosmos DB: nytt konto eller befintligt? Om befintligt: ge `COSMOS_ENDPOINT` och `COSMOS_KEY`.”
- “FRONTEND_URL som backend ska tillåta (kan sättas till ACA‑FQDN i efterhand): …”
- “Hemligheter/ID:n: `SECRET_KEY` (lämna tomt för att generera), `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, ev. `SUPERADMIN_EMAIL`.”
- “Skalning (min/max replikor; default 1/2) och resurser (t.ex. 0.5 vCPU/1 GiB).”
- “Registry‑åtkomst: Managed identity (rekommenderas) eller ACR admin‑credentials?”
- “Behövs Storage Account? Om ja: namn och ev. blob‑container (t.ex. files).”

Steg 3 – Plan och bekräftelse
- Sammanfatta plan (Dockerfile, port, resursnamn, image‑flöde) och be om bekräftelse innan skapande.

Steg 4 – Provisionera infrastruktur (kör az via MCP)
- Resource Group: `az group create -n <RG> -l swedencentral`.
- ACR (om används):
  - `az acr show -n <ACR_NAME> -g <RG> || az acr create -n <ACR_NAME> -g <RG> -l swedencentral --sku Basic`.
  - `ACR_SERVER=$(az acr show -n <ACR_NAME> -g <RG> --query loginServer -o tsv)`.
- Log Analytics: `az monitor log-analytics workspace create -g <RG> -n <LAW_NAME> -l swedencentral`; hämta `LAW_ID` och `LAW_KEY`.
- ACA‑miljö: `az containerapp env create -g <RG> -n <ENV_NAME> -l swedencentral --logs-destination log-analytics --logs-workspace-id $LAW_ID --logs-workspace-key $LAW_KEY`.
- Cosmos (om nytt): `az cosmosdb create -g <RG> -n <COSMOS_ACCOUNT> --locations regionName=swedencentral`; hämta `COSMOS_ENDPOINT` och `COSMOS_KEY`.
- Storage (om valt): `az storage account create -g <RG> -n <STORAGE_NAME> -l swedencentral --sku Standard_LRS` och ev. `az storage container create …`.

Steg 5 – Bygg och publicera image
- ACR build: `az acr build -r <ACR_NAME> -t <IMAGE_NAME>:<TAG> .` (i katalogen med Dockerfile).
- Fullt bildenamn: `$ACR_SERVER/<IMAGE_NAME>:<TAG>`.
- Alternativ: använd given extern image utan build.

Steg 6 – Skapa Container App
- Välj `--target-port` från repo‑svepet (default 8080).
- Skapa app: `az containerapp create -g <RG> -n <APP_NAME> --environment <ENV_NAME> --image <REGISTRY>/<IMAGE_NAME>:<TAG> --ingress external --target-port <PORT> --min-replicas <MIN> --max-replicas <MAX> --assign-identity [system]`.
- Knyt ACR säkert (om ACR):
  - `az containerapp registry set -g <RG> -n <APP_NAME> --server $ACR_SERVER --identity system`.
  - Ge `AcrPull`: hämta `APP_PRINCIPAL` och `ACR_ID`, kör `az role assignment create --assignee <APP_PRINCIPAL> --scope <ACR_ID> --role AcrPull`.
- Alternativ (mindre säkert): ACR admin‑credentials om användaren väljer det.

Steg 7 – Secrets och env‑variabler
- Sätt secrets, t.ex.: `az containerapp secret set -g <RG> -n <APP_NAME> --secrets COSMOS_ENDPOINT=<...> COSMOS_KEY=<...>`.
- Sätt env (justera efter repo‑svep):
  - `az containerapp update -g <RG> -n <APP_NAME> --set-env-vars SECRET_KEY=<hemlig> AZURE_CLIENT_ID=<appId> AZURE_TENANT_ID=<tenantId> FRONTEND_URL=<https://domän> SUPERADMIN_EMAIL=<mail> COSMOS_DATABASE=traffpunkt COSMOS_CONTAINER_ATTENDANCE=attendance_records COSMOS_CONTAINER_ACTIVITIES=activities COSMOS_CONTAINER_TRAFFPUNKTER=traffpunkter COSMOS_CONTAINER_USERS=Users_traffpunkt COSMOS_CONTAINER_ADMIN_AUDIT=Admin_audit_traffpunkt COSMOS_CONTAINER_ATTENDANCE_AUDIT=Attendance_audit_traffpunkt COSMOS_ENDPOINT=secretref:COSMOS_ENDPOINT COSMOS_KEY=secretref:COSMOS_KEY`.

Steg 8 – Verifiera
- Hämta FQDN: `az containerapp show -g <RG> -n <APP_NAME> --query properties.configuration.ingress.fqdn -o tsv`.
- Testa hälsa: `curl -fsSL https://<FQDN>/health` och rapportera status.
- Följ loggar: `az containerapp logs show -g <RG> -n <APP_NAME> --follow` vid behov.

Steg 9 – Ny deploy/uppdatering
- Bygg ny tagg: `az acr build -r <ACR_NAME> -t <IMAGE_NAME>:<NEW_TAG> .`.
- Uppdatera image: `az containerapp update -g <RG> -n <APP_NAME> --image <REGISTRY>/<IMAGE_NAME>:<NEW_TAG>`.

Felsök snabbt
- 401/CORS: uppdatera `FRONTEND_URL` och skapa ny revision.
- Image‑pull: kontrollera `AcrPull`‑rollen eller registry credentials.
- Cosmos 403/5xx: kontrollera `COSMOS_ENDPOINT`/`COSMOS_KEY`, aktivera Public network access.
- Fel port: justera `--target-port` enligt Dockerfile.

Repo‑varianter
- Monorepo (backend+frontend i samma image): en ACA med port från Dockerfile.
- Separat frontend: sätt `FRONTEND_URL` till frontendens publika URL; backend i ACA.

Vanliga env‑nycklar (exempel Flask)
- `SECRET_KEY`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `FRONTEND_URL`, `SUPERADMIN_EMAIL`.
- `COSMOS_ENDPOINT` (secret), `COSMOS_KEY` (secret), `COSMOS_DATABASE`, `COSMOS_CONTAINER_*`.

Slutbeteende
- När användaren säger “hjälp mig att deploya”: kör steg 0–9. Fråga efter saknade värden, föreslå rimliga default, kör `az` via MCP, och återrapportera FQDN och status.

