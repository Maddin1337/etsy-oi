# MVP-v1 Persistenz-Handoff - 2026-05-15

## Aktueller Stand

- Der MVP-v1-Slice ist jetzt auf Postgres-Persistenz fuer den Analyse-Lifecycle umgestellt.
- `POST /v1/analyses/keyword` und `POST /v1/analyses/listing` persistieren Analysen in Postgres und bleiben idempotent.
- `GET /v1/analyses/:analysis_id`, `GET /v1/analyses`, `POST /refresh` und `POST /cancel` lesen bzw. schreiben gegen dieselbe persistente Quelle.
- Refresh bleibt idempotent, erzeugt eine Ersatzanalyse und markiert die Originalanalyse als `refreshed`.
- Cancel bleibt auch auf spaeteren Reads terminal.
- Beim Create und Refresh wird ein minimaler `capture_jobs`-Datensatz angelegt; die spaetere Worker-Anbindung ist damit vorbereitet, ohne schon echte Collection/Pipeline einzubauen.
- Die Web-UI zeigt diese Capture-Jobs jetzt in der Detailansicht an.
- `GET /readyz` ist nicht mehr nur Stub, sondern meldet Postgres ehrlich als `ready` oder `error`; ClickHouse, Redis und Temporal bleiben bewusst `not_configured`.

## Frisch verifiziert am 2026-05-15

Im Repo `/root/projects/etsy-opportunity-intelligence` wurden frisch erfolgreich ausgefuehrt:

- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`

## Verifikationsresultate

- Build: gruener Turbo-Build fuer alle 12 Workspace-Pakete.
- Typecheck: gruener Turbo-Typecheck fuer alle 12 Workspace-Pakete.
- Unit-/API-Tests: gruen, darunter `apps/api/test/server.test.ts` mit 10/10 Tests und `apps/api/test/analysis-read-model.test.ts` mit 6/6 Tests.
- Shared-Contract-Tests: gruen, `packages/shared-types/test/contracts.test.ts` mit 6/6 Tests.
- Playwright-E2E: gruen, 5/5 Flows in `tests/e2e/mvp-flows.spec.ts`.

## Wesentliche Aenderungen dieser Runde

- Postgres-Store fuer Analyseanlage, Reads, Listen, Refresh und Cancel verankert.
- Read-Model fuer konsistente API-Antworten extrahiert.
- Capture-Job-Handshake im Persistenzpfad eingebaut.
- Dashboard/Detailansicht erweitert, damit Workflow-Capture-Jobs sichtbar sind.
- Lokales Postgres-Bootstrap und ehrlicher `readyz`-Status in `README.md` dokumentiert.

## Relevante Commits

- `1ec58c8` - `feat: persist analyses in postgres`
- `50d088a` - `feat: enqueue capture jobs for persisted analyses`
- `8cf704e` - `feat: harden local db bootstrap and readiness`
- `df86388` - `feat: add recent analyses dashboard history`
- `5c265d4` - `feat: enable external access for local mvp`
- `e287587` - `chore: add focused mvp dev commands`
- `379f829` - `feat: unify analysis read model responses`
- `a2b2cf6` - `feat: surface capture jobs in the mvp ui`

## Bekannte Restpunkte

- Die Ergebnisdaten sind weiterhin deterministisch/demohaft; echte Collector-, Parser-, Scoring- und Temporal-Integration ist noch nicht angebunden.
- `clickhouse`, `redis` und `temporal` sind bewusst noch `not_configured`.
- Turbo meldet fuer `@etsy-oi/api#test` weiterhin nur die harmlose `outputs`-Warnung, weil dort keine Artefaktdateien geschrieben werden.

## Sinnvoller naechster Schritt

- Als naechstes die erste echte Worker-Verarbeitung hinter die bereits angelegten `capture_jobs` haengen, ohne den bestehenden API-/UI-Contract aufzubrechen.

Kurzfazit: Der MVP ist jetzt nicht mehr nur ein In-Memory-Stub, sondern hat einen persistierten Analyse-Lifecycle mit gruen verifizierter Web- und API-Strecke.