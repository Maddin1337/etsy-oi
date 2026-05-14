# MVP-v1 Handoff - 2026-05-13

## Aktueller Stand nach Abschlussverifikation

- Repo ist ein TypeScript/pnpm/Turbo-Monorepo mit den geplanten App- und Package-Grenzen aus `docs/plans/`.
- Der vorhandene MVP-v1-Slice ist lokal funktionsfaehig und frisch verifiziert.
- Implementierter MVP-Slice:
  - Fastify-API-Stubs fuer `/healthz`, `/readyz`, `POST /v1/analyses/keyword`, `POST /v1/analyses/listing`, `GET /v1/analyses/:analysis_id`, Refresh und Cancel.
  - Vite/React-Web-App fuer Keyword- und Listing-Analyse mit Polling, Statusanzeige, Ergebnisansicht, Refresh und Ruecknavigation.
  - Shared Zod-Contracts fuer Requests, Statusmodelle, Snapshots, Scores und Fehlerformen.
  - Postgres-/ClickHouse-Schemafiles sowie Worker-/Domain-Skelette als Foundation.
  - Playwright-E2E-Suite fuer die zentralen MVP-Flows.
- Heute im echten Stand zusaetzlich abgesichert:
  - Listing-Analyse akzeptiert nur Etsy-Listing-URLs.
  - Create-Requests replayen vorhandene Analysen per Idempotency-Key.
  - Refresh-Requests sind ebenfalls idempotent, erzeugen eine Ersatzanalyse und markieren die Originalanalyse als `refreshed`.
  - Cancel bleibt auch nach spaeteren Reads terminal.
  - API-Host defaultet lokal auf `127.0.0.1`.
  - `pnpm test` fuehrt jetzt auch die API-Contract-Tests wirklich mit aus; dafuer wurde eine kleine lokale Vitest-Konfiguration in `apps/api/vitest.config.ts` ergaenzt.

## Frisch ausgefuehrte Pflichtverifikation

Alle Pflichtbefehle wurden im Repo `/root/projects/etsy-opportunity-intelligence` erfolgreich ausgefuehrt.

| Befehl | Ergebnis |
|---|---|
| `pnpm build` | Erfolgreich. Turbo-Build gruen fuer alle 12 Workspace-Pakete. |
| `pnpm typecheck` | Erfolgreich. Turbo-Typecheck gruen fuer alle 12 Workspace-Pakete. |
| `pnpm test` | Erfolgreich. Workspace-Tests gruen; dabei jetzt auch `apps/api/test/server.test.ts` mit 5/5 Tests und `packages/shared-types/test/contracts.test.ts` mit 6/6 Tests. |
| `pnpm exec playwright test` | Erfolgreich. 4/4 E2E-Tests gruen. |

## Getestete Pfade

### Unit-/Contract-/API-Pfade

- `packages/shared-types/test/contracts.test.ts`
  - Shared Contracts und Zod-Modelle.
- `apps/api/test/server.test.ts`
  - Invalid Listing URL liefert zentrale `validation_failed`-Antwort.
  - Idempotentes Replay fuer gleiche Keyword-Create-Requests.
  - Idempotentes Replay fuer Refresh und Markierung des Originals als `refreshed`.
  - Cancel bleibt auf spaeteren Reads terminal.
  - Zentrale `not_found`-Antwort fuer Read/Refresh/Cancel auf unbekannte Analysen.

### E2E-Pfade

- `tests/e2e/mvp-flows.spec.ts`
  - Keyword-Analyse starten, pollen, Completed-Status sehen, Score-/Result-Ansicht rendern.
  - Listing-Analyse starten, URL normalisieren, Snapshot-/Detaildaten rendern.
  - Invalid Listing Input zeigt API-Validierungsfehler in der UI.
  - Detailansicht refreshen und zur Dashboard-/Form-Ansicht zurueck navigieren.

### Statisch gegengepruefte Implementierungspfade

- `apps/api/src/server.ts`
- `apps/web/src/main.tsx`
- `packages/shared-types/src/index.ts`
- `playwright.config.ts`
- `vitest.config.ts`
- `apps/api/vitest.config.ts`
- `README.md`

## Kleine, gezielte Reparatur in dieser Runde

- Problem: `pnpm test` war zwar gruen, hat aber die API-Tests im Package-Lauf faktisch nicht eingesammelt.
- Ursache: Die Root-`vitest.config.ts` referenziert Muster relativ zum Repo-Root; der Package-Lauf in `apps/api` fand dadurch lokal keine Tests.
- Fix mit geringem Risiko: `apps/api/vitest.config.ts` hinzugefuegt und auf `test/**/*.test.ts` begrenzt.
- Ergebnis: `pnpm test` fuehrt die 5 API-Tests jetzt im regulaeren Workspace-Lauf sauber aus.

## Bekannte Restpunkte

- Die API ist weiterhin ein deterministischer In-Memory-Stub; Postgres, ClickHouse, Redis, Temporal und Raw Storage sind noch nicht angebunden.
- Die Worker-Apps und DB-Schemas sind Foundation-Artefakte, keine produktive End-to-End-Datenpipeline.
- Der fachliche MVP-Slice ist fuer Demo- und Anschlussarbeit stabil genug, aber die Persistenz- und Pipeline-Anbindung bleibt das groesste verbliebene Risiko.
- Turbo meldet bei `@etsy-oi/api#test` weiter nur eine harmlose `outputs`-Warnung, weil fuer den Test-Task keine Coverage-Dateien erzeugt werden. Kein Blocker fuer morgen frueh.

## Klare Empfehlung fuer den Start am Morgen

1. Diesen Stand als gueltigen Arbeitsstand fuer MVP-v1 verwenden; die harte Verifikationskette ist aktuell komplett gruen.
2. Fuer einen lokalen Start:
   ```bash
   pnpm --filter @etsy-oi/api dev
   pnpm --filter @etsy-oi/web dev
   ```
3. Danach kurz manuell in `http://127.0.0.1:3000` die beiden Kernflows gegen den Stub durchklicken:
   - Keyword-Analyse
   - Listing-Analyse
   - Refresh aus der Detailansicht
4. Naechstes enges Arbeitspaket ohne Scope-Bloat:
   - API-Stub zuerst auf persistente Analyseanlage gegen Postgres umstellen,
   - dabei den bestehenden UI-/API-Contract unveraendert lassen,
   - erst danach Worker-/Collection-/Parsing-Pfade echt anbinden.

Kurzfazit: MVP-v1 ist fuer morgen frueh startklar, solange klar bleibt, dass es noch ein stub-basierter Slice und keine persistente Produktionspipeline ist.
