# 🔥 HOTFIX - Deploy-kommandon

## Snabbdeploy (kör alla kommandon på en gång):

```bash
docker build -t traffpunkt-statistik . && \
docker tag traffpunkt-statistik gcr.io/froga-elin/traffpunkt-statistik && \
docker push gcr.io/froga-elin/traffpunkt-statistik && \
gcloud run deploy traffpunkt --image gcr.io/froga-elin/traffpunkt-statistik --platform managed --region europe-west1 --allow-unauthenticated
```

## Vad som fixats:

1. **CSP för Google Fonts** - Nu tillåts fonts.googleapis.com och fonts.gstatic.com
2. **Rate limiting** - Justerad från 5 requests/5min till 30 requests/min på azure-user
3. **JWT-validering** - Använder nu Graph API istället för PyJWT (mer kompatibel med Azure AD)

## Om du får problem igen:

### Alternativ 1: Ta bort all rate limiting temporärt
Ta bort `@rate_limit` decorators från app.py

### Alternativ 2: Återställ till original auth
Kopiera tillbaka original auth_utils.py utan JWT-validering

### Alternativ 3: Öka rate limits ytterligare
Ändra alla `@rate_limit(max_requests=X)` till högre värden