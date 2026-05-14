# Etsy v1 – Work Packages für Multi-Agent-Delegation

**Ziel:** Das Etsy-v1-Vorhaben in klar getrennte, technisch delegierbare Arbeitspakete zerlegen, damit morgen mehrere Agenten oder Entwickler parallel arbeiten können, ohne sich gegenseitig zu blockieren.

**Baut auf:**
- `/root/docs/plans/2026-05-13-etsy-systemarchitektur.md`
- `/root/docs/plans/2026-05-13-etsy-v1-build-plan.md`
- `/root/docs/plans/2026-05-13-etsy-data-model.md`
- `/root/docs/plans/2026-05-13-etsy-api-and-workers.md`

---

## 1) Domänen und Parallelisierungslogik

Die Arbeitspakete sind bewusst entlang weitgehend unabhängiger Domänen geschnitten:

- Collection
- Data Pipeline
- Scoring
- API
- Analytics
- UI/Presentation
- Platform/Infra

**Leitregel:** Ein Agent oder Team bearbeitet pro Paket nur einen klar abgegrenzten Verantwortungsbereich und möglichst eigene Dateien/Ordner.

---

## 2) Parallelisierungs-Matrix

| Paket | Parallel bearbeitbar? | Harte Vorbedingungen |
|---|---|---|
| Platform/Infra Foundation | nein, zuerst | - |
| Shared Data Contracts | begrenzt | Foundation |
| Collection | ja, nach Contracts | Shared Contracts, Worker Skeleton |
| Validatoren | ja | Parsed Contracts |
| Persistenz / Data Pipeline | teilweise | Shared Contracts, DB-Schemas |
| Scoring Spec | ja | Shared Contracts, Signalverständnis |
| API Job Layer | ja | Postgres-Schema, Shared Contracts |
| Read Models | teilweise | Persistenzpfade, Scores |
| Analytics | ja | ClickHouse-Schema |
| UI/Presentation | ja | API-DTOs / Mock-Contracts |
| QA/Admin | ja | Internal DTOs, Validator/Telemetry Data |
| Resilience / Scheduler | später | erste E2E-Läufe |

---

## 3) Arbeitspakete

## WP-PLAT-01 – Monorepo- und Delivery-Fundament

**Ziel**
Eine saubere technische Basis schaffen, auf der alle Domänen ohne Strukturkonflikte arbeiten können.

**Scope**
- Monorepo-Skelett
- pnpm/Turbo-Basis
- App- und Package-Ordner
- gemeinsames TypeScript-Setup
- Lint/Test/Typecheck-Skripte
- CI-Grundgerüst

**Betroffene Komponenten**
- root config
- `apps/*`
- `packages/*`
- CI/CD-Dateien

**Inputs**
- Zielstruktur aus Systemarchitektur
- Teamkonventionen für Tooling

**Outputs**
- baubares Monorepo
- standardisierte Projektstruktur
- Startpunkt für parallele Arbeit

**Abhängigkeiten**
- keine

**Risiken**
- spätere Reorganisation blockiert alle anderen Streams
- unklare Package-Grenzen erzeugen Import-Chaos

**Empfohlene Reihenfolge**
- als erstes

**Parallelisierbar**
- nein

---

## WP-DP-01 – Shared Data Contracts, IDs und Idempotenz

**Ziel**
Die gemeinsamen fachlichen Verträge definieren, bevor Worker, API und UI unabhängig implementiert werden.

**Scope**
- Analysis-Status-Enums
- Snapshot-Typen
- DTOs für Keyword-, Listing- und Shop-Snapshots
- Failure-Klassen
- Idempotency-Key-Konventionen
- URL-/Keyword-Kanonisierungskontrakte

**Betroffene Komponenten**
- `packages/shared-types`
- `packages/db`
- `apps/api`
- alle Worker

**Inputs**
- Architekturdatei
- Produkt- und Datenmodellannahmen

**Outputs**
- versionierte TypeScript-Contracts
- Status- und Fehlerkatalog
- gemeinsame Dedupe-/ID-Regeln

**Abhängigkeiten**
- WP-PLAT-01

**Risiken**
- späte Contract-Änderungen brechen mehrere Streams gleichzeitig

**Empfohlene Reihenfolge**
- direkt nach Foundation

**Parallelisierbar**
- nur teilweise; zentrale Contracts zuerst

---

## WP-DB-01 – Postgres- und ClickHouse-Basisschema

**Ziel**
Kanonische Entitäten, Analysemetadaten und Snapshot-Historie korrekt persistierbar machen.

**Scope**
- Postgres-Tabellen für Keywords, Listings, Shops, Analyses, CaptureJobs, ScoreVersions
- ClickHouse-Tabellen für Search/Listing/Shop/Score Snapshots und Trends
- Constraints und Indizes für Dedupe und API-Zugriffe

**Betroffene Komponenten**
- `packages/db`
- DB-Migrationen
- ClickHouse-DDLs

**Inputs**
- Datenmodell
- Shared Contracts

**Outputs**
- Migrationsdateien
- DB-Zugriffsschicht
- initiale Read-/Write-Abstraktionen

**Abhängigkeiten**
- WP-DP-01

**Risiken**
- falsche Verteilung zwischen Postgres und ClickHouse
- zu schwache Unique-Constraints führen zu Doppeldaten

**Empfohlene Reihenfolge**
- sehr früh, parallel zur API-Basis

**Parallelisierbar**
- teilweise; Postgres und ClickHouse getrennt bearbeitbar

---

## WP-COL-01 – Listing Collector MVP

**Ziel**
Den wertvollsten Detailpfad zuerst stabil lauffähig machen.

**Scope**
- Playwright-Navigation für Listing-URLs
- HTML + Screenshot speichern
- Capture-Metadaten schreiben
- Block-/Captcha-Flags
- Session-/Cookie-Basis

**Betroffene Komponenten**
- `apps/worker-collector`
- Raw Storage
- Telemetry Hooks

**Inputs**
- kanonisierte Listing-URL
- Capture-Kontext

**Outputs**
- Raw-Artefakte
- Capture Result DTO

**Abhängigkeiten**
- WP-PLAT-01
- WP-DP-01
- WP-DB-01 teilweise

**Risiken**
- Etsy-spezifische Rendering-Probleme
- instabile Selektoren, wenn zu früh DOM-lastig implementiert wird

**Empfohlene Reihenfolge**
- vor Search Collector

**Parallelisierbar**
- ja, parallel zu API und DB

---

## WP-COL-02 – Search Collector MVP

**Ziel**
Keyword-Analysen mit Search-Snapshot und Top-N-Ranking aufsetzen.

**Scope**
- Playwright-Navigation für Search-URLs
- Erfassung der ersten Results Page
- Storage von HTML/Screenshot
- Ermittlung von Top 24 Listing-Zielen inkl. Rank-Positionen

**Betroffene Komponenten**
- `apps/worker-collector`
- Raw Storage

**Inputs**
- Keyword, locale

**Outputs**
- Search Raw Snapshot
- Listing Target Set für Fan-out

**Abhängigkeiten**
- WP-DP-01
- WP-COL-01-Basis sinnvoll, aber nicht strikt

**Risiken**
- Search-Seiten sind operativ fragiler als Listing-Seiten
- Ad-Rows und organische Ergebnisse müssen sauber getrennt werden

**Empfohlene Reihenfolge**
- nach oder parallel zu WP-COL-01

**Parallelisierbar**
- ja

---

## WP-PARSE-01 – Listing/Search/Shop Parser

**Ziel**
Strukturierte Snapshot-Payloads aus Rohdaten erzeugen.

**Scope**
- Extraktionsreihenfolge: JSON-LD -> embedded JSON -> network -> DOM-Fallback
- Feldherkunft pro extrahiertem Signal
- Parser-Versionierung
- getrennte Parser für Listing, Search, Shop

**Betroffene Komponenten**
- `packages/extractors`
- `apps/worker-parser`

**Inputs**
- Raw HTML
- Netzwerk-/JSON-Blobs
- Seitentyp-Kontext

**Outputs**
- Parsed Snapshots
- Parser Trace / Herkunftsinformationen

**Abhängigkeiten**
- WP-DP-01
- WP-COL-01 / WP-COL-02

**Risiken**
- DOM-Fallback wird zu dominant und fragil
- Parser-Drift bleibt ohne Feldtrace schwer debugbar

**Empfohlene Reihenfolge**
- Listing zuerst, dann Search, dann Shop

**Parallelisierbar**
- ja, pro Seitentyp

---

## WP-VAL-01 – Validatoren und Qualitäts-Gates

**Ziel**
Nur fachlich brauchbare Snapshots in Produktpfade lassen.

**Scope**
- Pflichtfeldregeln pro Seitentyp
- Konsistenzprüfungen
- Status `valid|partial|invalid|blocked|parser_drift`
- Validation Error Codes
- Hard-Fail vs Soft-Fail-Regeln

**Betroffene Komponenten**
- `packages/validators`
- `apps/worker-parser`
- QA/Admin-Datenpfade

**Inputs**
- Parsed Snapshots
- Qualitätsanforderungen aus Architektur

**Outputs**
- Validation Reports
- Gating-Entscheidungen

**Abhängigkeiten**
- WP-PARSE-01
- WP-DP-01

**Risiken**
- zu strenge Validatoren killen Nutzbarkeit
- zu lockere Validatoren vergiften Scores und Trends

**Empfohlene Reihenfolge**
- direkt nach Parsed Contracts

**Parallelisierbar**
- ja

---

## WP-DP-02 – Normalisierung und Persistenz-Writer

**Ziel**
Validierte Snapshots in kanonische Entitäten und historische Fakten überführen.

**Scope**
- Upserts für Keywords, Listings, Shops
- ClickHouse-Writes für Snapshots und Impressions
- Referenzierung von Raw-Artefakten
- Merge-Regeln für kanonische Objekte
- Snapshot-Dedupe

**Betroffene Komponenten**
- `apps/worker-parser`
- `packages/db`
- Postgres
- ClickHouse

**Inputs**
- validierte Snapshots
- Dedupe-/Kanonisierungsregeln

**Outputs**
- aktualisierte kanonische Objekte
- append-only Snapshot-Zeilen

**Abhängigkeiten**
- WP-DB-01
- WP-VAL-01

**Risiken**
- Upsert-Regeln überschreiben gute Daten mit schlechteren Snapshots
- fehlende Snapshot-Dedupe-Regeln führen zu Mehrfachschreibungen

**Empfohlene Reihenfolge**
- nach DB-Schema und Validatoren

**Parallelisierbar**
- teilweise; Listing-/Shop-Writer getrennt, zentrale Merge-Regeln gemeinsam

---

## WP-API-01 – Analyse-API und Jobstatus

**Ziel**
Den zentralen Produkt-Entry-Point für Keyword- und Listing-Analysen liefern.

**Scope**
- `POST /v1/analyses/keyword`
- `POST /v1/analyses/listing`
- `GET /v1/analyses/{id}`
- Idempotency-Key-Behandlung
- Statusmodell und Fehler-DTOs

**Betroffene Komponenten**
- `apps/api`
- Postgres
- Shared DTOs

**Inputs**
- User-Eingaben
- Workspace-Kontext
- Shared Contracts

**Outputs**
- Analyse-Records
- Workflow-Startdaten
- Polling-fähige Statusantworten

**Abhängigkeiten**
- WP-DP-01
- WP-DB-01

**Risiken**
- Duplikate bei schwacher Dedupe-Logik
- API-Status divergiert von Workflow-Realität

**Empfohlene Reihenfolge**
- sehr früh

**Parallelisierbar**
- ja

---

## WP-WF-01 – Temporal Workflows und BullMQ Fan-out

**Ziel**
Kritische Analyseflüsse robust orchestrieren, Side-Jobs entkoppeln.

**Scope**
- KeywordAnalysisWorkflow
- ListingAnalysisWorkflow
- RefreshWorkflow
- BullMQ Queue Contracts für Listing-Detail-Fan-out
- Retry-/Timeout-/terminale Statusregeln

**Betroffene Komponenten**
- `apps/api`
- Temporal
- BullMQ/Redis
- Worker Contracts

**Inputs**
- API-Analyseaufträge
- Capture-/Parse-/Score-Aktivitäten

**Outputs**
- lauffähige Orchestrierung
- robuste Statusübergänge

**Abhängigkeiten**
- WP-API-01
- WP-COL-01/02
- WP-PARSE-01
- WP-VAL-01
- WP-DP-02

**Risiken**
- zu komplexe Workflow-Grenzen in v1
- schlechte Abgrenzung zwischen Temporal und BullMQ

**Empfohlene Reihenfolge**
- nach API Job Layer und ersten Worker-Bausteinen

**Parallelisierbar**
- teilweise

---

## WP-SCORE-01 – Score-Spezifikation und Confidence-Modell

**Ziel**
Eine versionierte, erklärbare Opportunity-Logik definieren.

**Scope**
- Demand, Competition, Momentum, Commercial Viability, Opportunity
- Gewichtung v1: 35/25/25/15
- observed vs estimated Signale
- Confidence-Abschläge
- Explainability-Textbausteine

**Betroffene Komponenten**
- `packages/scoring`
- `apps/worker-scoring`
- API Result DTOs
- Web UI

**Inputs**
- verfügbare Signale aus Snapshots
- Produktannahmen

**Outputs**
- Score-Spec v1
- Explainability-Contract
- Confidence-Regeln

**Abhängigkeiten**
- WP-DP-01
- Snapshot-Signalverständnis

**Risiken**
- Scheingenauigkeit
- zu frühe Komplexität ohne ausreichend Datenbasis

**Empfohlene Reihenfolge**
- fachlich früh, technische Umsetzung nach ersten Datenpfaden

**Parallelisierbar**
- ja

---

## WP-SCORE-02 – Score Engine und ScoreSnapshots

**Ziel**
Versionierte Scores aus validierten Daten berechnen und speichern.

**Scope**
- Score-Worker
- `score_snapshots`
- Rebuild-Pfad pro Score-Version
- `current_entity_scores`
- Berechnungstraces und Evidence-Summaries

**Betroffene Komponenten**
- `apps/worker-scoring`
- `packages/scoring`
- ClickHouse
- Postgres

**Inputs**
- validierte Snapshot-/Trenddaten
- aktive Score-Version

**Outputs**
- historische Scores
- aktuelle Scoresicht
- Explainability-Daten

**Abhängigkeiten**
- WP-SCORE-01
- WP-DP-02

**Risiken**
- Abweichung zwischen Score-Historie und API-Sicht
- Rebuilds werden teuer oder schwer idempotent

**Empfohlene Reihenfolge**
- nach Persistenzpfaden

**Parallelisierbar**
- teilweise

---

## WP-API-02 – Ergebnis-Read-Models

**Ziel**
Produktfähige Keyword- und Listing-Responses aus mehreren Datenquellen zusammensetzen.

**Scope**
- `GET /v1/keywords/{id}/latest-analysis`
- `GET /v1/listings/{id}/latest-analysis`
- Ergebnisaggregation aus Postgres + ClickHouse
- DTOs für Scores, Trends, Warnings, Freshness und partial states

**Betroffene Komponenten**
- `apps/api`
- ClickHouse Queries
- Postgres Repositories

**Inputs**
- aktuelle Analysen
- Snapshot-Historie
- Score-Daten

**Outputs**
- frontendtaugliche Responses
- versionierte Result-Contracts

**Abhängigkeiten**
- WP-SCORE-02
- WP-DP-02

**Risiken**
- langsame Queries ohne vorberechnete Sichten
- DTOs driften von UI-Bedarf weg

**Empfohlene Reihenfolge**
- nach erster lauffähiger Score Engine

**Parallelisierbar**
- teilweise

---

## WP-AN-01 – Analytics und Materialized Views

**Ziel**
Performance-fähige Trend- und Ranking-Abfragen für Produkt und QA sicherstellen.

**Scope**
- Aggregate Tables / Materialized Views
- Daily trend facts
- Top listing / keyword aggregates
- Query-Konventionen für Charts und Tabellen

**Betroffene Komponenten**
- ClickHouse
- `packages/db`
- API Query Layer

**Inputs**
- Snapshot-Writes
- ScoreSnapshots

**Outputs**
- schnelle Trend-Queries
- stabile Analytics-Sichten

**Abhängigkeiten**
- WP-DB-01
- WP-DP-02

**Risiken**
- falsche Sortierung/Partitionierung
- zu spätes Performance-Tuning macht UI/QA zäh

**Empfohlene Reihenfolge**
- parallel zu Read Models

**Parallelisierbar**
- ja

---

## WP-UI-01 – Web-App Hauptflows

**Ziel**
Die v1-Nutzerflüsse für Keyword und Listing mit verständlichen Statuszuständen abbilden.

**Scope**
- Keyword-Eingabe
- Listing-URL-Eingabe
- Status-UI für `loading`, `partial`, `failed`, `stale`, `refreshed`
- Polling
- Retry-/Refresh-Interaktionen

**Betroffene Komponenten**
- `apps/web`
- API DTOs

**Inputs**
- Analyse- und Ergebnis-Contracts
- Produktcopy für Unsicherheitshinweise

**Outputs**
- Keyword Analyzer UI
- Listing Analyzer UI

**Abhängigkeiten**
- WP-API-01
- API-Mocks oder echte DTOs

**Risiken**
- UI versteckt Unsicherheit
- Polling-UX wird bei langen Läufen unerquicklich

**Empfohlene Reihenfolge**
- mit Mock-Contracts früh starten, später an echte API hängen

**Parallelisierbar**
- ja

---

## WP-UI-02 – Ergebnisdarstellung für Scores und Trends

**Ziel**
Nutzer sollen Entscheidungen treffen können, ohne Scores zu überinterpretieren.

**Scope**
- Score Cards
- Confidence-Anzeige
- Explainability-Panel
- Trendcharts
- Ranking-/Competition-Tables
- Kennzeichnung geschätzter Werte

**Betroffene Komponenten**
- `apps/web`
- Charts/Tables

**Inputs**
- API Read Models
- Score-/KPI-Definitionen

**Outputs**
- Ergebnis-Dashboard-Komponenten

**Abhängigkeiten**
- WP-API-02
- WP-SCORE-01

**Risiken**
- visuelle Scheingenauigkeit
- zu viele Metriken ohne Hierarchie

**Empfohlene Reihenfolge**
- nach stabilen Ergebnis-DTOs

**Parallelisierbar**
- ja

---

## WP-UI-03 – QA/Admin-Oberfläche

**Ziel**
Interne Debug- und Drift-Fähigkeit früh absichern.

**Scope**
- Snapshot-Kette anzeigen: raw -> parsed -> validated -> normalized
- Parser-Versionen und Validation Errors anzeigen
- Filter nach Failure-Klassen
- Canary-Resultate sichtbar machen

**Betroffene Komponenten**
- `apps/admin`
- interne API
- Raw-Storage-Referenzen

**Inputs**
- Validator-/Capture-/Telemetry-Daten

**Outputs**
- Admin-/QA-Surface

**Abhängigkeiten**
- WP-VAL-01
- interne DTOs

**Risiken**
- ohne QA-Oberfläche steigt MTTR bei Parser-Problemen drastisch

**Empfohlene Reihenfolge**
- früher bauen als bei normalen CRUD-Produkten

**Parallelisierbar**
- ja

---

## WP-OPS-01 – Observability, Resilience und Scheduler

**Ziel**
v1 operativ beherrschbar machen.

**Scope**
- OTel, Grafana, Sentry
- Crawl success rate, parser failure rate, drift, workflow duration, queue latency
- adaptive rate limits
- block/captcha metrics
- stale detection
- conservative refresh scheduler
- canary keywords

**Betroffene Komponenten**
- `packages/telemetry`
- API
- Worker
- Temporal/BullMQ

**Inputs**
- Status- und Fehlerklassen
- laufende Services

**Outputs**
- Dashboards
- Alerts
- Refresh-Runs
- Canary-Crawl-Signale

**Abhängigkeiten**
- Foundation
- erste E2E-Pfade

**Risiken**
- zu spätes Instrumentieren erschwert root cause analysis massiv

**Empfohlene Reihenfolge**
- Telemetry früh, Scheduler später

**Parallelisierbar**
- teilweise

---

## 4) Empfohlene Reihenfolge der Pakete

### Phase 0 – zuerst
1. WP-PLAT-01
2. WP-DP-01
3. WP-DB-01
4. WP-API-01

### Phase 1 – parallel möglich
5. WP-COL-01
6. WP-COL-02
7. WP-PARSE-01
8. WP-VAL-01

### Phase 2 – Integration
9. WP-DP-02
10. WP-WF-01
11. WP-SCORE-01
12. WP-SCORE-02
13. WP-API-02

### Phase 3 – Produktoberflächen und Härtung
14. WP-AN-01
15. WP-UI-01
16. WP-UI-02
17. WP-UI-03
18. WP-OPS-01

---

## 5) Empfohlene Delegations-Splits für morgen

### Agent Brief 1 – Foundation + Core Contracts

**Ziel:** Baue das Monorepo-Fundament, Shared Contracts und Basisschemata so, dass alle anderen Streams sauber aufsetzen können.

**Scope:**
- WP-PLAT-01
- WP-DP-01
- WP-DB-01

**Nicht ändern:**
- keine fachlichen Parser-/Scoring-Details erfinden
- keine UI bauen

**Beweise zurückgeben:**
- konkrete Dateiliste
- Status-/DTO-Katalog
- Postgres-/ClickHouse-Tabellenliste
- verbleibende Risiken/Entscheidungen

### Agent Brief 2 – Collection + Parser

**Ziel:** Spezifiziere und implementiere den Listing- und Search-Collection-Pfad bis zu Parsed Snapshots.

**Scope:**
- WP-COL-01
- WP-COL-02
- WP-PARSE-01

**Nicht ändern:**
- keine Score-Logik
- keine API-Read-Models

**Beweise zurückgeben:**
- Liste der Seitentypen und Extraktionsquellen
- Capture- und Parsed-Snapshot-Contracts
- Failure-/Block-/Captcha-Klassifikation

### Agent Brief 3 – Validation + Persistence

**Ziel:** Mache aus Parsed Snapshots produktiv verwertbare Daten durch Validatoren, Dedupe und Writer.

**Scope:**
- WP-VAL-01
- WP-DP-02

**Nicht ändern:**
- keine UI
- keine Business-Score-Formeln

**Beweise zurückgeben:**
- Hard-Fail-/Soft-Fail-Regeln
- Merge-/Upsert-Regeln
- Storage-Zuordnung pro Datentyp

### Agent Brief 4 – API + Workflows

**Ziel:** Verbinde User-Requests mit Temporal/BullMQ und liefere stabile Analyse- und Ergebnis-Contracts.

**Scope:**
- WP-API-01
- WP-WF-01
- WP-API-02

**Nicht ändern:**
- keine Collector-Implementierung im Detail
- keine UI-Komponenten

**Beweise zurückgeben:**
- Endpunktliste
- Workflow-Schritte
- Queue-Contracts
- Status-/Retry-Regeln

### Agent Brief 5 – Scoring + UI/QA Surface

**Ziel:** Mache die Ergebnisse nutzbar und erklärbar, inklusive Confidence und interner QA.

**Scope:**
- WP-SCORE-01
- WP-SCORE-02
- WP-UI-01
- WP-UI-02
- WP-UI-03
- WP-AN-01 teilweise

**Nicht ändern:**
- keine grundlegenden DB- oder Contract-Entscheidungen ohne Rückkopplung

**Beweise zurückgeben:**
- Score-Spezifikation
- Ergebnis-DTO-Ansprüche
- Seiten-/Komponentenstruktur
- QA-Oberflächenbedarf

---

## 6) Ticket-Erzeugungsempfehlung

Wenn aus den Paketen GitHub Issues oder Kanban-Tickets gemacht werden, sollte jedes Ticket mindestens enthalten:

- **Titel** im Format `domain: deliverable`
- **Ziel**
- **Warum jetzt**
- **Scope**
- **Out of scope**
- **Betroffene Pfade/Dateien**
- **Inputs/Dependencies**
- **Outputs / Definition of done**
- **Test-/Verifikationsschritte**
- **Risiken / offene Fragen**
- **Parallelisierbar mit**

---

## 7) Kurzfazit

Für morgen ist die beste Schnittlogik:

1. **Foundation/Contracts zuerst stabilisieren**
2. **Listing-Pfad E2E vor Search-Pfad priorisieren**
3. **Validatoren und Persistenz nicht als Nachgedanken behandeln**
4. **Scoring und UI auf expliziten Datenverträgen aufsetzen**
5. **QA/Admin früh mitbauen, nicht erst am Ende**

So lässt sich das Vorhaben mit mehreren Agenten parallel vorantreiben, ohne dass die eigentliche Kernqualität des Produkts verloren geht.