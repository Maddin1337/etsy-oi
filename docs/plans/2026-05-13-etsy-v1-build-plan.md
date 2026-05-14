# Etsy v1 Build Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Ein morgen direkt ausführbarer Liefer- und Umsetzungsplan für ein v1 Etsy Opportunity Intelligence Produkt, das Keyword- und Listing-Analysen stabil, nachvollziehbar und score-basiert bereitstellt.

**Architecture:** v1 wird als TypeScript-Monorepo mit Next.js-Web-App, NestJS-API, Playwright-Collectoren, Parser-/Validator-/Scoring-Workern sowie PostgreSQL, ClickHouse und S3-kompatiblem Raw Storage umgesetzt. Die Ausführung folgt strikt dem Prinzip `snapshot-first -> validator-first -> normalize -> score -> read model`.

**Tech Stack:** pnpm/Turborepo, Next.js 15, React 19, NestJS + Fastify, Prisma oder Drizzle für Postgres, ClickHouse JS client, Temporal Cloud, BullMQ + Valkey/Redis, Playwright, Zod, OpenTelemetry, Grafana Cloud, Sentry.

---

## 1) Verbindliche Annahmen für v1

Diese Annahmen schließen offene Lücken, damit morgen ohne weitere Architekturarbeit gestartet werden kann:

1. **Repo-Name:** `/root/projects/etsy-opportunity-intelligence`
2. **Monorepo-Struktur:**
   - `apps/web`
   - `apps/api`
   - `apps/worker-collector`
   - `apps/worker-parser`
   - `apps/worker-scoring`
   - `apps/admin`
   - `packages/shared-types`
   - `packages/db`
   - `packages/extractors`
   - `packages/validators`
   - `packages/scoring`
   - `packages/telemetry`
3. **Pflicht-User-Flows in v1:**
   - Keyword-Analyse starten
   - Listing-Analyse starten
   - Analyse-Status pollen
   - Ergebnis mit Score, Confidence und Erklärungen ansehen
   - Refresh eines bestehenden Ergebnisses starten
4. **Pflicht-Analysearten in v1:** `keyword`, `listing`
5. **Pflicht-Locale in v1:** `en-US`
6. **Search-Tiefe in v1:** erste Suchergebnisseite + Detailanalyse der Top 24 Listings pro Keyword
7. **Score-Version in v1:** eine aktive Score-Version `opportunity_v1`
8. **Produktionsziel für v1:** interne/beta-fähige Version, nicht Full-Market-Crawl.

---

## 2) Lieferumfang von v1

## Muss enthalten

- Authentifizierte Web-App mit Eingaben für Keyword und Listing-URL
- API-Endpunkte für Analyseanlage, Status, Ergebnisabruf, Refresh
- Temporal-Workflows für Keyword- und Listing-Analysen
- Playwright-Collector für Search-, Listing- und Shop-Seiten
- Parser mit Reihenfolge JSON-LD -> embedded JSON -> Netzwerkdaten -> DOM-Fallback
- Validatoren pro Seitentyp
- Postgres für kanonische Entitäten und Analysemetadaten
- ClickHouse für Snapshots, Rankings, Trends und Score-Historie
- Object Storage für HTML, Screenshots und Rohblobs
- v1-Scoring mit Opportunity, Demand, Competition, Momentum, Confidence
- Web-UI mit States `loading`, `partial`, `failed`, `stale`, `refreshed`
- interne QA-/Admin-Ansicht für Snapshots, Validator-Fehler und Drift-Indikatoren
- Basis-Observability mit OTel, Grafana, Sentry

## Gehört bewusst nicht in v1

- Browser Extension
- generative AI als Kernfeature
- Vollabdeckung vieler Locales/Kategorien
- aggressives Vollmarkt-Crawling
- komplexes Team-/Seat-Management
- Webhooks/SSE für Live-Updates

---

## 3) Empfohlene Lieferphasen

## Phase 0 – Projektfundament

**Ziel:** baubares Monorepo, gemeinsame Typen, Konfigurationspfade, CI-Grundlage.

**Exit-Kriterien:**
- alle Apps/Packages kompilieren
- lokale Dev-Umgebung startet
- Format/Lint/Typecheck/Test-Befehle existieren

## Phase 1 – Kernverträge und Datenmodell

**Ziel:** stabile Contracts, Tabellen, IDs, Idempotenz, Storage-Split.

**Exit-Kriterien:**
- Postgres-Migrationen für Kernobjekte vorhanden
- ClickHouse-DDL für Snapshot-Tabellen vorhanden
- Zod-Schemas/DTOs für Snapshots und Jobs versioniert

## Phase 2 – Collection und Parsing

**Ziel:** Search- und Listing-Seiten zuverlässig erfassen, Rohartefakte speichern, Snapshots extrahieren.

**Exit-Kriterien:**
- Collector kann mindestens eine Search- und eine Listing-URL erfolgreich verarbeiten
- HTML + Screenshot + Capture-Metadaten werden gespeichert
- Parser liefert strukturierte Snapshot-Payloads

## Phase 3 – Validation, Normalisierung und Persistenz

**Ziel:** nur verwertbare Daten gelangen in Produktpfade.

**Exit-Kriterien:**
- Validatoren klassifizieren `valid`, `partial`, `invalid`
- Listings/Shops/Keywords werden kanonisch angelegt oder upgedatet
- Snapshots landen in ClickHouse, Rohpfade im Storage referenziert

## Phase 4 – Workflows, API und erste End-to-End-Analyse

**Ziel:** User kann Analysen starten und Ergebnisse abrufen.

**Exit-Kriterien:**
- `POST /v1/analyses/keyword`
- `POST /v1/analyses/listing`
- `GET /v1/analyses/:id`
- Temporal-Workflow für beide Analysearten läuft bis terminalen Zustand

## Phase 5 – Scoring, Read Models und UI

**Ziel:** verwertbare Opportunity-Insights in der Web-App.

**Exit-Kriterien:**
- Score Engine schreibt `score_snapshots`
- API liefert aggregierte Ergebnis-DTOs
- Web-App zeigt Scores, Trends, Confidence und Warnings

## Phase 6 – QA, Resilience und Beta-Härtung

**Ziel:** operative Beherrschbarkeit und belastbare Beta.

**Exit-Kriterien:**
- Canary-Crawls aktiv
- Drift-/Block-/Parser-Fehler sichtbar
- Refresh-Scheduler läuft konservativ
- Raw-Storage-Retention und Zugriffsschutz dokumentiert

---

## 4) Umsetzungsreihenfolge mit Prioritäten und Abhängigkeiten

| Priorität | Bereich | Ergebnis | Abhängig von |
|---|---|---|---|
| P0 | Repo/Foundation | Monorepo, CI, App-Skelette | - |
| P0 | Shared Contracts | IDs, DTOs, Schemas, Statusmodelle | Foundation |
| P0 | Postgres/ClickHouse Base | Kernschema + Migrationen | Shared Contracts |
| P0 | API Job Layer | Analyseanlage + Statusmodell | Postgres Base |
| P1 | Collector Base | Playwright Fetch + Raw Storage | Shared Contracts, Storage Config |
| P1 | Parser Base | Search/Listing/Shop Snapshot Parsing | Collector Base |
| P1 | Validators | Seitentyp-spezifische Qualitätsgates | Parser Base |
| P1 | Normalizer/Writers | Upserts nach Postgres + ClickHouse | Validators, DB Base |
| P1 | Temporal Workflows | Keyword/Listing Orchestrierung | API Job Layer, Collector/Parser/Writers |
| P2 | Scoring v1 | ScoreSnapshots + Erklärungen | Snapshot Data |
| P2 | Read Models | Keyword/Listing Ergebnis-DTOs | Scoring, DB |
| P2 | Web UI | Analyseinput + Ergebnisdarstellung | API Contracts |
| P2 | Admin UI | QA, Snapshot-Inspektion | Validator/Telemetry Data |
| P3 | Resilience | Proxy/Rate limit/Budget/Canaries | erste End-to-End-Läufe |
| P3 | Scheduler/Refresh | Stale detection + konservative Refreshes | Workflows, Scoring |

---

## 5) Morgen direkt umsetzbare Task-Liste

Die folgenden Tasks sind absichtlich klein genug, um in Delegation an mehrere Agenten oder an einzelne Entwickler übergeben zu werden.

### Task 1: Repository anlegen und Monorepo-Skelett erzeugen

**Objective:** Eine feste Projektstruktur schaffen, auf der alle weiteren Arbeitspakete aufsetzen.

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `apps/web/package.json`
- Create: `apps/api/package.json`
- Create: `apps/worker-collector/package.json`
- Create: `apps/worker-parser/package.json`
- Create: `apps/worker-scoring/package.json`
- Create: `apps/admin/package.json`
- Create: `packages/shared-types/package.json`
- Create: `packages/db/package.json`
- Create: `packages/extractors/package.json`
- Create: `packages/validators/package.json`
- Create: `packages/scoring/package.json`
- Create: `packages/telemetry/package.json`

**Step 1: Create directory tree**

```bash
mkdir -p /root/projects/etsy-opportunity-intelligence/{apps/{web,api,worker-collector,worker-parser,worker-scoring,admin},packages/{shared-types,db,extractors,validators,scoring,telemetry}}
```

**Step 2: Initialize workspace files**

Run: `pnpm init`
Expected: root `package.json` created

**Step 3: Add workspace config**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

**Step 4: Add turbo pipeline**

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^lint"] },
    "typecheck": { "dependsOn": ["^typecheck"] },
    "test": { "dependsOn": ["^test"], "outputs": ["coverage/**"] }
  }
}
```

**Step 5: Verify workspace**

Run: `pnpm -w exec node -e "console.log('workspace ok')"`
Expected: `workspace ok`

**Step 6: Commit**

```bash
git add .
git commit -m "chore: initialize etsy opportunity monorepo"
```

---

### Task 2: Shared IDs, status enums und DTO-Basis definieren

**Objective:** Alle Schichten auf einen gemeinsamen v1-Vertrag ausrichten.

**Files:**
- Create: `packages/shared-types/src/analysis.ts`
- Create: `packages/shared-types/src/snapshots.ts`
- Create: `packages/shared-types/src/jobs.ts`
- Create: `packages/shared-types/src/scoring.ts`
- Create: `packages/shared-types/src/index.ts`
- Test: `packages/shared-types/src/__tests__/contracts.test.ts`

**Step 1: Write failing contract test**

```ts
import { AnalysisStatusValues, SnapshotValidatorStatusValues } from '../index';

test('v1 status enums include required states', () => {
  expect(AnalysisStatusValues).toContain('queued');
  expect(AnalysisStatusValues).toContain('partial');
  expect(SnapshotValidatorStatusValues).toContain('invalid');
});
```

**Step 2: Run test to verify failure**

Run: `pnpm --filter @etsy/shared-types test`
Expected: FAIL – module/files missing

**Step 3: Write minimal implementation**

Include at least:

```ts
export const AnalysisStatusValues = ['queued', 'running', 'partial', 'completed', 'failed', 'blocked', 'validation_failed', 'stale', 'refreshed', 'cancelled'] as const;
export const SnapshotValidatorStatusValues = ['valid', 'partial', 'invalid', 'blocked', 'parser_drift'] as const;
```

**Step 4: Run test to verify pass**

Run: `pnpm --filter @etsy/shared-types test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared-types
git commit -m "feat: add shared v1 contracts and statuses"
```

---

### Task 3: Postgres-Kernschema anlegen

**Objective:** Kanonische Entitäten und Analysemetadaten persistierbar machen.

**Files:**
- Create: `packages/db/prisma/schema.prisma` oder `packages/db/src/schema.ts`
- Create: `packages/db/migrations/0001_init.sql`
- Test: `packages/db/src/__tests__/postgres-schema.test.ts`

**Pflichttabellen v1:**
- `workspaces`
- `projects`
- `keywords`
- `shops`
- `listings`
- `analyses`
- `capture_jobs`
- `score_versions`
- optional `current_entity_scores`

**Verification command:**

Run: `pnpm --filter @etsy/db test && pnpm --filter @etsy/db build`
Expected: PASS

---

### Task 4: ClickHouse-Snapshottabellen anlegen

**Objective:** Append-only Historie für Search, Listing, Shop und Scores bereitstellen.

**Files:**
- Create: `packages/db/clickhouse/001_search_snapshots.sql`
- Create: `packages/db/clickhouse/002_search_result_impressions.sql`
- Create: `packages/db/clickhouse/003_listing_snapshots.sql`
- Create: `packages/db/clickhouse/004_shop_snapshots.sql`
- Create: `packages/db/clickhouse/005_score_snapshots.sql`
- Create: `packages/db/clickhouse/006_trend_fact_daily.sql`

**Verification command:**

Run: `pnpm --filter @etsy/db test:clickhouse-ddl`
Expected: PASS or schema parse success

---

### Task 5: API-Grundmodul für Analyseanlage bauen

**Objective:** Keyword- und Listing-Analysen per REST anlegen und deduplizieren.

**Files:**
- Create: `apps/api/src/modules/analyses/analyses.controller.ts`
- Create: `apps/api/src/modules/analyses/analyses.service.ts`
- Create: `apps/api/src/modules/analyses/dto/create-keyword-analysis.dto.ts`
- Create: `apps/api/src/modules/analyses/dto/create-listing-analysis.dto.ts`
- Create: `apps/api/src/modules/analyses/dto/analysis-response.dto.ts`
- Test: `apps/api/test/analyses.controller.spec.ts`

**Must support:**
- `POST /v1/analyses/keyword`
- `POST /v1/analyses/listing`
- `GET /v1/analyses/:id`

**Verification command:**

Run: `pnpm --filter @etsy/api test analyses.controller.spec.ts`
Expected: PASS

---

### Task 6: Temporal Workflow-Skelette implementieren

**Objective:** End-to-End-Orchestrierung fachlich sauber definieren.

**Files:**
- Create: `apps/api/src/workflows/keyword-analysis.workflow.ts`
- Create: `apps/api/src/workflows/listing-analysis.workflow.ts`
- Create: `apps/api/src/workflows/refresh-analysis.workflow.ts`
- Create: `apps/api/src/workflows/activities.ts`
- Test: `apps/api/src/workflows/__tests__/workflow-contracts.test.ts`

**Must include steps:**
- mark running
- collect
- parse
- validate
- normalize
- score
- persist result
- mark terminal status

---

### Task 7: Listing Collector zuerst lauffähig machen

**Objective:** Den einfacheren und wertvolleren Detailpfad zuerst stabilisieren.

**Files:**
- Create: `apps/worker-collector/src/listing/listing.collector.ts`
- Create: `apps/worker-collector/src/browser/session-manager.ts`
- Create: `apps/worker-collector/src/storage/raw-storage.client.ts`
- Test: `apps/worker-collector/src/listing/__tests__/listing.collector.test.ts`

**Definition of done:**
- lädt Etsy-Listing-URL
- speichert HTML + Screenshot
- gibt Capture-Metadaten inkl. `blocked`/`captcha` zurück

---

### Task 8: Listing Parser und Validator liefern verwertbaren Snapshot

**Objective:** Aus Listing-Rohdaten einen validierten ListingSnapshot erzeugen.

**Files:**
- Create: `packages/extractors/src/listing/extract-listing.ts`
- Create: `packages/validators/src/listing/validate-listing-snapshot.ts`
- Create: `apps/worker-parser/src/listing/parse-listing.job.ts`
- Test: `packages/validators/src/listing/__tests__/validate-listing-snapshot.test.ts`

**Pflichtfelder v1:**
- listing external ref
- captured_at
- title
- price oder price missing reason
- shop ref oder shop missing reason
- parser_version
- raw_storage_ref

---

### Task 9: Listing-Normalisierung und Writes bauen

**Objective:** Listing, Shop und ListingSnapshot korrekt in Postgres/ClickHouse/Object-Storage-Referenzen verankern.

**Files:**
- Create: `apps/worker-parser/src/writers/upsert-listing.ts`
- Create: `apps/worker-parser/src/writers/upsert-shop.ts`
- Create: `apps/worker-parser/src/writers/write-listing-snapshot.ts`
- Test: `apps/worker-parser/src/writers/__tests__/listing-writer.test.ts`

---

### Task 10: Search Collector/Parser/Validator nachziehen

**Objective:** Keyword-Analysepfad vervollständigen.

**Files:**
- Create: `apps/worker-collector/src/search/search.collector.ts`
- Create: `packages/extractors/src/search/extract-search.ts`
- Create: `packages/validators/src/search/validate-search-snapshot.ts`
- Create: `apps/worker-parser/src/search/parse-search.job.ts`
- Test: `packages/validators/src/search/__tests__/validate-search-snapshot.test.ts`

**v1 Default:** erste Seite, Top 24 Treffer, absolute Rank-Berechnung.

---

### Task 11: Keyword-Workflow E2E integrieren

**Objective:** Keyword-Analyse von API-Request bis Ergebnisstatus ausführbar machen.

**Files:**
- Modify: `apps/api/src/workflows/keyword-analysis.workflow.ts`
- Modify: `apps/api/src/modules/analyses/analyses.service.ts`
- Create: `apps/api/test/keyword-analysis.e2e-spec.ts`

**Verification command:**

Run: `pnpm --filter @etsy/api test keyword-analysis.e2e-spec.ts`
Expected: PASS with mocked collector/parser/scoring pipeline

---

### Task 12: Score Engine v1 implementieren

**Objective:** Demand, Competition, Momentum, Commercial Viability und Confidence berechnen.

**Files:**
- Create: `packages/scoring/src/opportunity-v1.ts`
- Create: `packages/scoring/src/confidence.ts`
- Create: `apps/worker-scoring/src/jobs/compute-score.job.ts`
- Test: `packages/scoring/src/__tests__/opportunity-v1.test.ts`

**v1 weights:**
- demand 35
- competition 25
- momentum 25
- commercial viability 15

**Rule:** fehlende Signale senken Confidence, nicht Opportunity künstlich auf 0.

---

### Task 13: Ergebnis-Read-Models und API-Responses bauen

**Objective:** Frontend-taugliche DTOs aus Postgres + ClickHouse liefern.

**Files:**
- Create: `apps/api/src/modules/results/results.service.ts`
- Create: `apps/api/src/modules/results/results.controller.ts`
- Test: `apps/api/test/results.controller.spec.ts`

**Must support:**
- `GET /v1/keywords/:keywordId/latest-analysis`
- `GET /v1/listings/:listingId/latest-analysis`

---

### Task 14: Web UI für Keyword und Listing Analysis bauen

**Objective:** Hauptnutzerfluss end-to-end abbilden.

**Files:**
- Create: `apps/web/app/(app)/keyword/page.tsx`
- Create: `apps/web/app/(app)/listing/page.tsx`
- Create: `apps/web/components/analysis-status.tsx`
- Create: `apps/web/components/score-cards.tsx`
- Create: `apps/web/components/trend-chart.tsx`
- Test: `apps/web/src/__tests__/analysis-status.test.tsx`

**Must render:**
- loading
- partial
- stale
- failed
- refreshed
- score explanation and warnings

---

### Task 15: QA/Admin-Sicht für Snapshots und Drift bauen

**Objective:** Operative Debugbarkeit früh sicherstellen.

**Files:**
- Create: `apps/admin/app/snapshots/page.tsx`
- Create: `apps/admin/app/drift/page.tsx`
- Create: `apps/api/src/modules/internal/internal.controller.ts`
- Test: `apps/api/test/internal.controller.spec.ts`

---

### Task 16: Collection Resilience härten

**Objective:** Rate Limits, Proxy-Routing, Block-Erkennung und Crawl Budgets kontrollieren.

**Files:**
- Create: `apps/worker-collector/src/runtime/rate-limit-policy.ts`
- Create: `apps/worker-collector/src/runtime/proxy-router.ts`
- Create: `apps/worker-collector/src/runtime/crawl-budget.ts`
- Test: `apps/worker-collector/src/runtime/__tests__/crawl-budget.test.ts`

---

### Task 17: Scheduler und Refresh-Logik aktivieren

**Objective:** konservative Re-Crawls und Ergebnisauffrischung ermöglichen.

**Files:**
- Create: `apps/api/src/scheduler/refresh.scheduler.ts`
- Create: `apps/api/src/modules/analyses/refresh.service.ts`
- Test: `apps/api/test/refresh.scheduler.spec.ts`

**Default refresh rules v1:**
- keyword result stale after 24h
- listing result stale after 12h
- canary keywords daily
- failed analyses not auto-refreshed without manual or capped retry policy

---

### Task 18: Observability und Beta-Checkliste abschließen

**Objective:** produktionsnahe Transparenz und Alarmierung herstellen.

**Files:**
- Create: `packages/telemetry/src/index.ts`
- Create: `ops/grafana/etsy-overview.json`
- Create: `ops/runbooks/parser-drift.md`
- Create: `ops/runbooks/captcha-block.md`
- Create: `ops/runbooks/raw-storage-retention.md`

**Verification command:**

Run: `pnpm -w lint && pnpm -w typecheck && pnpm -w test`
Expected: all green

---

## 6) Parallelisierungsplan für morgen

Diese Splits minimieren Dateikollisionen und passen zur späteren Delegation an Subagenten.

### Split A – Platform/Foundation

**Scope:** Task 1, 3, 4, 18 (ohne finale Dashboards)

**Parallel zu:** niemandem am Anfang, weil Repo- und DB-Basis zuerst stehen müssen.

### Split B – Shared Contracts + API Job Layer

**Scope:** Task 2, 5, 6

**Kann starten sobald:** Task 1 begonnen hat und grundlegende Struktur steht.

### Split C – Collection + Parser

**Scope:** Task 7, 8, 10, 16

**Kann starten sobald:** Task 2 und Storage-/Worker-Skelett vorhanden sind.

### Split D – Normalization + Scoring + Read Models

**Scope:** Task 9, 12, 13, 17

**Kann starten sobald:** erste Snapshot-Contracts und DB-Schemas stehen.

### Split E – Web/Admin UI

**Scope:** Task 14, 15

**Kann starten sobald:** API-DTOs und Mock-Contracts aus Task 2/5/13 definiert sind.

---

## 7) Konkreter Startplan für Tag 1

Wenn morgen mit Delegation gearbeitet wird, ist die sinnvollste Reihenfolge:

1. **Agent 1:** Repo/Foundation + DB-Skelette
2. **Agent 2:** Shared Contracts + API Job Layer
3. **Agent 3:** Listing Collector + Listing Parser/Validator
4. **Agent 4:** Scoring/Read-Model Design parallel als Contract-Arbeit
5. **Agent 5:** UI auf Mock-Contracts vorbereiten

**Wichtig:** Search Collector erst nach funktionierendem Listing-Pfad produktiv priorisieren. Der Listing-Pfad gibt schneller verwertbare E2E-Lernzyklen.

---

## 8) Abnahmekriterien für v1 Beta

Ein v1-Beta-Build ist erst dann „lieferbar“, wenn alle Punkte erfüllt sind:

- mindestens 1 Keyword-Analyse läuft E2E durch
- mindestens 1 Listing-Analyse läuft E2E durch
- Raw HTML + Screenshot + Parser-Version sind pro Snapshot referenzierbar
- `partial`-Ergebnisse werden korrekt in API und UI angezeigt
- Score + Confidence + Explanation werden gemeinsam angezeigt
- Parser-/Block-/Validation-Fehler sind im Admin sichtbar
- Refresh funktioniert für mindestens einen abgeschlossenen Analysefall
- Canary-Crawl kann Fehler früh signalisieren
- Basis-Retention- und Access-Regeln für Raw Storage sind dokumentiert

---

## 9) Empfohlene ersten Git-Meilensteine

1. `chore: initialize monorepo and service skeleton`
2. `feat: add v1 shared contracts and database schemas`
3. `feat: add analysis api and workflow skeletons`
4. `feat: implement listing collection parse validate pipeline`
5. `feat: implement keyword collection and snapshot persistence`
6. `feat: add opportunity scoring and result read models`
7. `feat: ship keyword and listing analysis ui`
8. `feat: add qa admin surface and observability`
9. `feat: add refresh scheduler and collection resilience`

---

## 10) Kurzfazit

Der schnellste belastbare Weg zu v1 ist **nicht** „erst UI, dann irgendwie Daten“, sondern:

1. Monorepo + Contracts
2. Snapshot- und Storage-Basis
3. Listing-Pfad E2E
4. Search-/Keyword-Pfad E2E
5. Score + Read Models
6. UI + QA + Resilience

Damit ist morgen eine echte agentische Parallelisierung möglich, ohne dass mehrere Agenten dieselben Dateien permanent blockieren.