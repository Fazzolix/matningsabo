# 📊 Rate Limits - Anpassade för arbetsplats

## Nuvarande rate limits (per IP-adress):

### Autentisering & Inloggning
- **Azure Config**: 500 requests/min
- **Azure User (login)**: 500 requests/min
- **Health check**: 1000 requests/min

### API Endpoints (kräver inloggning)
- **Hämta träffpunkter**: 1000 requests/min
- **Lägg till träffpunkt**: 100 requests/min
- **Hämta aktiviteter**: 1000 requests/min
- **Registrera närvaro**: 500 requests/min
- **Hämta statistik**: 300 requests/min

## Varför så höga limits?

Med 40-80 användare från samma arbetsplats (samma IP):
- Vid samtidig inloggning: 80 användare × 2-3 requests = 160-240 requests
- Normal användning: 80 användare × 5-10 requests/min = 400-800 requests/min

## Tekniska detaljer

1. **IP-detection**: Använder `X-Forwarded-For` header (Cloud Run proxy)
2. **Per instans**: Limits gäller per Cloud Run-instans
3. **Tidsfönster**: De flesta limits återställs varje minut

## Om ni får problem

### Alternativ 1: Ta bort rate limiting helt
Kommentera bort alla `@rate_limit` decorators i `app.py`

### Alternativ 2: Öka limits ytterligare
Ändra siffrorna i `@rate_limit(max_requests=XXX)`

### Alternativ 3: Implementera per-användare limits
Byt från IP-baserad till användar-baserad rate limiting

## Monitoring

Håll koll på 429-fel i Cloud Run logs:
```
gcloud logging read "resource.type=cloud_run_revision AND httpRequest.status=429" --limit 50
```