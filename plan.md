# Välfärdsrådgivare på akuten – Detaljerad implementationsplan
**Overall Progress:** `0%`

> Plan för en ny AI-agent utan tidigare kontext. Appen byggs om till “Välfärdsrådgivare på akuten – statistik” för pilot på akuten. All legacy (utebesök/homes/departments/activities/companions/satisfaction) ska bort. Ny Cosmos-databas och ny deploy i Azure, men behåll auth/roll/säkerhet.

## Översikt (målsättning)
- Ny app/branding: “Välfärdsrådgivare på akuten – statistik”.
- Behåll: Azure AD-auth, superadmin/admin-roller, sessions, säkerhetsheaders, rate limiting, proxy-setup.
- Ändra: datamodell till “registreringar” för biståndspilot; nya admin-listor för bosättningskommun, aktualisering, åtgärder; nya UI-flöden (registrera, mina registreringar, dashboard); ingen kundnöjdhet/aktiviteter/companions.
- Ny Cosmos DB + containers specifika för pilot (ingen återanvändning av sabo/hgt).

## Backend – datamodell och API
- [ ] 🟥 **Containers/Cosmos (skapas automatiskt)**
  - DB: `akuten` (ny, separat från tidigare).
  - `akuten_registrations` pk `/kommun_id` (bosättningskommun obligatorisk -> stabil partition).
  - `akuten_kommuner` pk `/id`.
  - `akuten_aktualiseringar` pk `/id`.
  - `akuten_atgarder` pk `/id`.
  - `akuten_users` pk `/id`.
  - `akuten_admin_audit`, `akuten_registration_audit` pk `/id`.
- [ ] 🟥 **Registrering-schema (ersätter outdoor_visits)**
  - Fält (kärna): `id`, `date` (eventdatum, default idag), `gender` (`men`/`women`), `birth_year` (4 siffror, required), `age_at_event` (beräknas backend: event_date - birth_year), `kommun_id` (required, från admin-lista), `kommun_name` (denormaliserad).
  - `aktualisering_id` (required, single), `aktualisering_name` (denormaliserad).
  - `atgarder` (array av id+name, minst 1).
  - Bool/enum:
    - `forhindrad_inskrivning` (bool, required).
    - `skriftlig_information` (bool, required).
    - `aktuell_von` (enum: `ja`, `nej`, `vet_ej`, `annan_kommun`, required).
  - Metadata: `registered_by`, `registered_by_oid`, `registered_at`, `last_modified_at`, `edit_count`.
- [ ] 🟥 **Validation**
  - `date` required, ISO `YYYY-MM-DD`.
  - `gender` required, `men|women`.
  - `birth_year` required, 4 siffror, rimligt intervall (t.ex. 1900..current_year).
  - `kommun_id` required och måste finnas aktiv i admin-listan.
  - `aktualisering_id` required, finns aktiv i admin-listan.
  - `atgarder` required, minst 1, varje id aktiv i admin-listan.
  - Bool/enum-fält required (ej null).
  - Beräkna `age_at_event` server-side och spara (använd event-date och birth_year).
- [ ] 🟥 **Endpoints**
  - `/api/registrations` POST/GET(id)/PUT/DELETE (ny resurs, ersätter /visits).
  - `/api/my-registrations` GET (ersätter /my-visits).
  - `/api/statistics` GET -> filter: `from`, `to` (på `date`), `gender`, `kommun_id` (multi?), `aktualisering_id` (multi), `atgard_id` (multi), `forhindrad_inskrivning` (bool), `skriftlig_information` (bool), `aktuell_von` (enum list).
  - Admin:
    - `/api/kommuner` CRUD (add/rename/deactivate, max ~10 st).
    - `/api/aktualiseringar` CRUD (add/rename/deactivate, max ~10 st).
    - `/api/atgarder` CRUD (add/rename/deactivate, max ~30 st).
  - Roll/endpoints för auth/me/users kvar som idag, men pekar mot nya containers.
- [ ] 🟥 **Services**
  - Uppdatera CosmosService: nya container-namn och partitioner; ta bort activities/companions/homes/departments.
  - Lägg CRUD-metoder för kommuner, aktualiseringar, åtgärder inkl. deaktivering och sortering.
  - Registrations: create/read/update/delete med ny schema; age-beräkning; denormalisera namn från masterdata vid create/update.
  - Statistics: nya filter och aggregat på nya fält; inga legacy-fält.
  - Audit: skriv admin_audit för masterdata, registration_audit för update/delete.

## Frontend – generellt
- [ ] 🟥 Branding: byt titlar/texter/logos till “Välfärdsrådgivare på akuten – statistik”; uppdatera landing/welcome, navbar, dokumentation.
- [ ] 🟥 API-konfiguration: ersätt endpoints med `/registrations`, `/my-registrations`, `/kommuner`, `/aktualiseringar`, `/atgarder`; ta bort departments/activities/companions paths.

## Frontend – registrera (ResponsiveRegistration)
- [ ] 🟥 Formfält:
  - Datum (default idag, kan ändras).
  - Kön: man/kvinna (radio).
  - Födelseår: 4-siffrig input, required; visa beräknad ålder inline.
  - Bosättningskommun: single-select (options från `/api/kommuner`, endast aktiva).
  - Aktualisering: single-select (options från `/api/aktualiseringar`).
  - Åtgärder: multi-select (options från `/api/atgarder`, minst 1 måste väljas).
  - Checkboxar/val:
    - Förhindrad inskrivning slutenvård (ja/nej).
    - Skriftlig information lämnad (ja/nej).
    - Aktuell i Vård- och omsorgsnämnden (radio: Ja/Nej/Vet ej/Bor i annan kommun).
  - Ingen aktivitet/med vem/varaktighet/satisfaction/department.
- [ ] 🟥 Validering/UX:
  - Blockera submit vid saknade obligatoriska fält (inkl. min 1 åtgärd).
  - Validera födelseår (4 siffror, rimligt spann) och datum.
  - Felmeddelanden samlat nära CTA (som nuvarande UX).
  - Visa beräknad ålder (read-only) när datum/födelseår finns.
- [ ] 🟥 Data-sändning:
  - Payload med nya nycklar; inga legacy-fält.

## Frontend – Mina registreringar (MyRegistrations)
- [ ] 🟥 Lista: datum, kön, ålder, bosättningskommun, aktualisering, åtgärder, ja/nej/enum-fält.
- [ ] 🟥 Editera: samma fält/validering som registrering; ägar/rollkontroll kvar.
- [ ] 🟥 Ta bort all logik för aktivitet/companion/duration/satisfaction.

## Frontend – Admin
- [ ] 🟥 Sektioner:
  - Bosättningskommun (CRUD, max ~10, aktiv-flagga).
  - Aktualisering (CRUD, max ~10, aktiv-flagga).
  - Åtgärder (CRUD, max ~30, aktiv-flagga).
- [ ] 🟥 Rollhantering oförändrad (superadmin sätter admin).
- [ ] 🟥 Uppdatera UI för de nya listorna; ta bort äldreboenden/avdelningar/aktiviteter/companions.

## Frontend – Dashboard
- [ ] 🟥 Datakälla: nya registration-fält.
- [ ] 🟥 Filter: datumintervall (`date`), kön, bosättningskommun (multi), aktualisering (multi), åtgärder (multi), booleaner (`forhindrad_inskrivning`, `skriftlig_information`), `aktuell_von` (multi).
- [ ] 🟥 Grafer/metrics (förslag):
  - KPI: antal registreringar, andel/antal förhindrad inskrivning, andel/antal skriftlig info, genomsnittsålder (age_at_event).
  - Könsfördelning (pie/bar).
  - Åldersstatistik: medel och ev. histogram/box.
  - Fördelning per bosättningskommun (bar).
  - Fördelning per aktualisering (bar).
  - Topp-åtgärder (bar, multi-select).
  - Utfallsrutor för `aktuell_von` (stacked bar/pie).
  - Tidslinje (line/area) över registreringar per dag (date).
- [ ] 🟥 Ta bort alla komponenter för department/activity/companion/satisfaction.

## Dokumentation
- [ ] 🟥 README: ny appbeskrivning, fält, endpoints, containers, env-vars, nya deploysteg (Azure) och flöden (registrera/mina/dash/admin). Ingen legacy-referens.
- [ ] 🟥 Uppdatera AGENTS/PLAN-noteringar med nya namn/endpoints/containers.

## QA / Snabbtester
- [ ] 🟥 Manuell: skapa registrering (alla obligatoriska fält), redigera/ta bort egen registrering, admin CRUD på kommun/aktualisering/åtgärd, dashboard laddar och filtrerar.
- [ ] 🟥 Frontend: `npm test -- --watch=false`; backend sanity via `flask run`.
