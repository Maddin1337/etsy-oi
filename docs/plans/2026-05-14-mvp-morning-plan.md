# MVP-v1 Morgen-Plan - 2026-05-14

## Ausgangslage

- Der lokale MVP-v1-Slice ist als `Fastify`-API plus `Vite/React`-Web-App funktionsfaehig.
- Shared Contracts, API-Contract-Tests und Playwright-Flows sind vorhanden; der Stand vom 2026-05-13 ist dokumentiert in `docs/plans/2026-05-13-mvp-handoff.md`.
- Der groesste echte Gap bleibt unveraendert: `apps/api/src/server.ts` arbeitet noch mit In-Memory-Maps, waehrend `packages/db` nur Foundation-Schema/Migrations liefert.

## Leitplanken fuer morgen

- MVP-v1 kontrolliert weiterbauen: kein Produkt-Scope-Ausbau, keine neuen User-Flows.
- Bestehenden Stack beibehalten: `TypeScript`, `pnpm`, `Turbo`, `Fastify`, `Vite/React`, `Drizzle/pg`.
- Kein vorgezogener Umbau auf Next.js/NestJS, solange der aktuelle Slice denselben Contract stabil liefern kann.
- MCP-Server nur dort nutzen, wo er schnell verifiziert: vor allem lokale Postgres-/Grafana-Smokes, nicht als neues Arbeitspaket.

## Priorisierte Arbeitsbloecke

### 1) API-Analyseanlage auf Postgres-Persistenz umstellen
- **Ziel:** `POST /v1/analyses/keyword` und `POST /v1/analyses/listing` nicht mehr nur in Memory anlegen, sondern in Postgres persistieren, ohne den Response-Contract zu aendern.
- **Betroffene Pfade/Komponenten:**
  - `apps/api/src/server.ts`
  - `packages/db/src/index.ts`
  - `packages/db/src/schema.ts`
  - `packages/db/migrations/0001_foundation.sql`
- **Verifikation:**
  - API-Tests fuer Create + Idempotency bleiben gruen.
  - `pnpm test` mindestens fuer `apps/api` und `packages/shared-types` gruen.
  - Manuell oder per DB-Query pruefen, dass pro Request genau ein `analyses`-Datensatz entsteht und Idempotency-Key wiederverwendet wird.
- **Risiken/Abhaengigkeiten:**
  - Seed-/Bootstrap-Bedarf fuer `workspace_id` wegen `DEFAULT_WORKSPACE_ID`.
  - Gefahr von Scope-Bloat, wenn schon hier Workflow-/Worker-Logik hineingezogen wird.

### 2) Read-, Refresh- und Cancel-Pfade auf dieselbe Persistenz heben
- **Ziel:** `GET /v1/analyses/:analysis_id`, `GET /v1/analyses`, `POST /refresh`, `POST /cancel` gegen dieselbe Postgres-Quelle laufen lassen; bestehende Semantik fuer `replayed`, `refreshed` und terminales `cancelled` beibehalten.
- **Betroffene Pfade/Komponenten:**
  - `apps/api/src/server.ts`
  - neuer kleiner Repository/Storage-Layer in `apps/api/src/*` oder `packages/db/src/*`
  - `apps/api/test/server.test.ts`
- **Verifikation:**
  - Vorhandene 5 API-Tests weiter gruen.
  - Zusatztest fuer Listen-/Read-Pfad gegen persistierte Analyse.
  - Kurzer manueller Durchlauf im Web: Create -> Detail -> Refresh -> Back -> Cancel.
- **Risiken/Abhaengigkeiten:**
  - Refresh darf keine zweite, unkontrollierte Semantik neben der Create-Idempotency bekommen.
  - Polling-Statusfortschritt ist heute deterministisch; beim Persistenzumbau nicht versehentlich den UI-Fluss brechen.

### 3) Deterministische Demo-Ergebnisse vom Speicherzugriff entkoppeln
- **Ziel:** Die heutige Stub-Resultlogik (`keywordResult`, `listingResult`, Statusfortschritt) hinter eine kleine Service-Grenze ziehen, damit Persistenz jetzt eingebaut werden kann, ohne gleich Collector/Parser/Scoring echt anzubinden.
- **Betroffene Pfade/Komponenten:**
  - `apps/api/src/server.ts`
  - neuer Service/Module-Schnitt in `apps/api/src/*`
  - optional Shared-Helfer in `packages/shared-types`
- **Verifikation:**
  - Playwright-MVP-Flows bleiben gruen.
  - `GET /v1/analyses/:id` liefert fuer `partial`, `completed`, `stale` weiterhin dieselben DTO-Formen wie heute.
- **Risiken/Abhaengigkeiten:**
  - Zu fruehes Generalisieren fuehrt schnell zu unnoetiger Architektur.
  - Wichtig ist eine kleine Extraktion nur fuer Testbarkeit und Persistenzkopplung, nicht fuer kompletten Domain-Umbau.

### 4) Lokales DB-Bootstrap + Readiness ehrlich machen
- **Ziel:** Minimalen lokalen Startpfad fuer Postgres dokumentieren und `readyz` von `stubbed` auf einen ehrlichen Status fuer Postgres anheben; ClickHouse/Redis/Temporal koennen vorerst weiter als nicht angebunden markiert bleiben.
- **Betroffene Pfade/Komponenten:**
  - `README.md`
  - `.env.example`
  - `apps/api/src/server.ts`
  - `packages/db/migrations/0001_foundation.sql`
  - optional `ops/grafana/README.md`
- **Verifikation:**
  - Lokaler API-Start mit gesetztem `DATABASE_URL`.
  - `GET /readyz` unterscheidet zwischen Postgres verfuegbar/nicht verfuegbar.
  - Wenn praktisch verfuegbar: kurzer MCP-/Grafana-Smoke gegen lokale Postgres-Quelle.
- **Risiken/Abhaengigkeiten:**
  - Keine neue Infra-Orchestrierung anfangen; nur den kleinsten dokumentierten Dev-Pfad herstellen.
  - Port-Konflikt zwischen Vite (`3000`) und lokalem Grafana fuer MCP beachten.

### 5) Erst danach: minimaler Capture-Job-Handshake, noch ohne echte Pipeline
- **Ziel:** Beim Anlegen oder Refresh einer Analyse optional einen zugehoerigen `capture_jobs`-Datensatz erzeugen, damit der spaetere Worker-/Temporal-Anschluss vorbereitet ist, ohne schon echte Collection zu bauen.
- **Betroffene Pfade/Komponenten:**
  - `apps/api/src/server.ts`
  - `packages/db/src/schema.ts`
  - `apps/worker-collector/src/index.ts`
  - `docs/plans/2026-05-13-etsy-api-and-workers.md`
- **Verifikation:**
  - Create/Refresh erzeugen konsistente `analyses`- plus `capture_jobs`-Eintraege.
  - API-Responses bleiben unveraendert.
  - Kein Einfluss auf bestehende E2E-Flows.
- **Risiken/Abhaengigkeiten:**
  - Hier strikt stoppen, bevor BullMQ/Redis/Temporal wirklich verkabelt werden.
  - Sonst kippt der Tag von Persistenz-Haertung in Infrastruktur-Scope.

## Empfohlene Reihenfolge morgen frueh

1. Block 1
2. Block 2
3. Block 3
4. Block 4
5. Block 5 nur, wenn 1-4 komplett gruen sind

## Definition of done fuer morgen

- API benutzt fuer den Analyse-Lifecycle mindestens Postgres statt In-Memory-State.
- UI- und API-Contracts bleiben unveraendert.
- `pnpm test` und `pnpm test:e2e` bleiben gruen.
- Keine echte Collector/Parser/Scoring-/Temporal-Integration begonnen, solange die Persistenzbasis nicht stabil sitzt.
