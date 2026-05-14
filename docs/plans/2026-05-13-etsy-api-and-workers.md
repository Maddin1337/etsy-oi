# Etsy Opportunity Intelligence v1 – API- und Worker-Vertrag

**Ziel:** Ein konkret implementierbarer v1-Vertrag für API, Temporal-Workflows, BullMQ-Jobs und Worker-Typen des Etsy-Produkts.

**Baut auf:** `/root/docs/plans/2026-05-13-etsy-systemarchitektur.md` und `/root/docs/plans/2026-05-13-etsy-data-model.md`

---

## 1) Verbindliche Annahmen für v1

1. **API-Stil:** REST/JSON unter `/v1`
2. **Asynchrones Modell:** Analyseerstellung ist immer asynchron; direkte Sofortantworten enthalten nur Job-/Analysis-Metadaten.
3. **Auth-Modell:** workspace-gebundene Sessions oder Bearer Tokens; genaue Auth-Implementierung ist austauschbar.
4. **Polling statt Push:** Web-App pollt Status-Endpunkte; Webhooks/SSE sind nicht in v1.
5. **Analysearten:** `keyword`, `listing`, optional intern `shop`, aber kein Shop-zentrierter Endnutzerflow in v1.
6. **Search-Abdeckung:** erste Suchergebnisseite und Top 24 Listings je Keyword.
7. **Temporal-Regel:** End-to-End-Orchestrierung nur für kritische, mehrstufige Flows.
8. **BullMQ-Regel:** nur Side-Jobs, leichte Fan-outs und nachgelagerte Kurzläufer.
9. **Raw-Storage-Zugriff:** niemals direkt an Endnutzer ausgeben.
10. **Idempotenz:** jeder schreibende API-Request und jeder interne Job besitzt einen dedizierten Dedupe-Key.

---

## 2) Zuständigkeiten pro Schicht

## API (NestJS + Fastify)

**Verantwortet:**
- Request-Validierung
- AuthN/AuthZ
- Workspace-Scoping
- Anlage von `analyses` und `capture_jobs`
- Persistenz von Idempotenz-Keys und Fingerprints
- Starten von Temporal-Workflows
- Zusammenbau von Ergebnis-DTOs aus Postgres + ClickHouse
- stabile v1-Contracts für Web und Admin

**Verantwortet nicht:**
- Browser-Automation
- HTML-Parsing
- direkte Langläufer-Logik
- ad-hoc Score-Berechnung außerhalb definierter Services

## Temporal

**Verantwortet:**
- Keyword-Analyse-End-to-End
- Listing-Analyse-End-to-End
- Refresh/Re-Crawl
- Score-Rebuild-orientierte Flows, wenn mehrstufig
- Statusfortschritt auf Analyseebene
- fachlich kontrollierte Retries und Terminalzustände

## BullMQ

**Verantwortet:**
- Listing-Detail-Fan-out aus Keyword-Analysen
- Cache-Warming
- Notification-/Nebenjobs
- Reprocess-Queue für nichtkritische Batch-Arbeit
- DLQ nur für nicht-orchestrierte Side-Jobs

## Worker-Typen

### Collector Worker
- Playwright-Fetches
- Session/Cookie/Proxy-Handhabung
- Block-/Captcha-Erkennung
- Raw-Artefakte + Capture-Metadaten

### Parser Worker
- JSON-LD -> embedded JSON -> network -> DOM-Fallback
- Parsed Search-/Listing-/Shop-Snapshots
- Feldherkunft und Parser-Versionen

### Validator Worker
- Pflichtfeldprüfungen
- semantische Konsistenzregeln
- `valid` / `partial` / `invalid` / `blocked` / `parser_drift`

### Normalizer Writer
- Dedupe/Upsert von Keywords, Listings, Shops
- Snapshot Writes nach ClickHouse
- Mapping externer zu internen IDs

### Scoring Worker
- Demand, Competition, Momentum, Commercial Viability, Opportunity, Confidence
- ScoreSnapshots und Explainability-Blöcke

### Scheduler Worker
- identifiziert stale Kandidaten
- priorisiert Refreshes konservativ
- startet Temporal-Refresh-Workflows

---

## 3) Statusmodell

## Analyse-Status

- `queued`
- `running`
- `partial`
- `completed`
- `failed`
- `stale`
- `refreshed`
- `cancelled`

## Worker-/Job-Status

- `queued`
- `leased`
- `running`
- `succeeded`
- `failed_retryable`
- `failed_terminal`
- `dead_lettered`
- `skipped`

## Snapshot-Validierungsstatus

- `valid`
- `partial`
- `invalid`
- `blocked`
- `parser_drift`

## Failure-Klassen

- `network_error`
- `timeout`
- `blocked_captcha`
- `parser_drift`
- `semantic_gap`
- `validation_failed`
- `rate_limited`
- `dependency_unavailable`
- `budget_exhausted`
- `internal_error`

---

## 4) Externe API-Endpunkte v1

## Health / readiness

### `GET /healthz`

```json
{ "status": "ok" }
```

### `GET /readyz`

```json
{
  "status": "ready",
  "dependencies": {
    "postgres": "ok",
    "clickhouse": "ok",
    "redis": "ok",
    "temporal": "ok"
  }
}
```

## Analyse anlegen

### `POST /v1/analyses/keyword`

**Request:**

```json
{
  "term": "mid century wall art",
  "locale": "en-US",
  "category_hint": null,
  "priority": "normal",
  "refresh_policy": "if_stale",
  "project_id": "prj_01j1..."
}
```

**Pflichtvalidierung:**
- `term` 2–120 Zeichen
- `locale` default `en-US`
- `priority` in `low|normal|high`
- `refresh_policy` in `never|if_stale|force`

**Response `202 Accepted`:**

```json
{
  "analysis": {
    "id": "an_01j1...",
    "type": "keyword",
    "status": "queued",
    "workflow_id": "wf_keyword_an_01j1...",
    "created_at": "2026-05-13T20:00:00Z"
  },
  "idempotency": {
    "key": "idem_abc123",
    "replayed": false
  }
}
```

### `POST /v1/analyses/listing`

**Request:**

```json
{
  "listing_url": "https://www.etsy.com/listing/1234567890/example",
  "priority": "normal",
  "refresh_policy": "if_stale",
  "project_id": "prj_01j1..."
}
```

**Sonderregel:** URL vor Dedupe kanonisieren.

**Response `202 Accepted`:**

```json
{
  "analysis": {
    "id": "an_01j2...",
    "type": "listing",
    "status": "queued",
    "workflow_id": "wf_listing_an_01j2...",
    "created_at": "2026-05-13T20:02:00Z"
  },
  "normalized_input": {
    "listing_url": "https://www.etsy.com/listing/1234567890"
  },
  "idempotency": {
    "key": "idem_def456",
    "replayed": false
  }
}
```

## Analyse abrufen

### `GET /v1/analyses/{analysis_id}`

```json
{
  "analysis": {
    "id": "an_01j1...",
    "type": "keyword",
    "status": "running",
    "progress": {
      "phase": "collect_listing_details",
      "percent": 42,
      "steps_total": 5,
      "steps_completed": 2
    },
    "error_code": null,
    "error_message": null,
    "retry_count": 1,
    "created_at": "2026-05-13T20:00:00Z",
    "started_at": "2026-05-13T20:00:03Z",
    "finished_at": null,
    "stale_at": "2026-05-14T20:00:00Z"
  },
  "result": null
}
```

## Ergebnislisten

### `GET /v1/analyses?type=keyword&status=completed&limit=20&cursor=...`

Liefert paginierte Metadaten für gespeicherte Ergebnisse.

## Direktzugriff auf Ergebnis-Views

### `GET /v1/keywords/{keyword_id}/latest-analysis`

Liefert `keyword result summary`.

### `GET /v1/listings/{listing_id}/latest-analysis`

Liefert `listing result summary`.

## Refresh und Cancel

### `POST /v1/analyses/{analysis_id}/refresh`

```json
{
  "reason": "user_requested",
  "priority": "high"
}
```

**Regel:** erzeugt neue Analyse und verknüpft sie über `refresh_of_analysis_id`.

### `POST /v1/analyses/{analysis_id}/cancel`

Best effort, vor allem für lange laufende Collect-/Refresh-Jobs.

---

## 5) Ergebnis-Contracts

## Keyword Result Summary

```json
{
  "analysis_id": "an_01j1...",
  "type": "keyword",
  "status": "completed",
  "keyword": {
    "id": "kw_01j1...",
    "term": "mid century wall art",
    "locale": "en-US",
    "category_hint": null
  },
  "market_summary": {
    "total_results_estimate": 12453,
    "sampled_listing_count": 24,
    "median_price": { "amount": "24.90", "currency": "USD" },
    "median_review_count": 137,
    "ads_share": 0.18
  },
  "scores": {
    "opportunity_score": 72,
    "demand_score": 78,
    "competition_score": 55,
    "momentum_score": 69,
    "confidence_score": 64,
    "score_version": "opportunity_v1"
  },
  "explanations": [
    "Hohe sichtbare Nachfrage-Signale in den Top-Ergebnissen.",
    "Konkurrenz ist deutlich, aber nicht maximal konzentriert.",
    "Confidence reduziert wegen unvollständiger Favoriten-Abdeckung."
  ],
  "top_listings": [
    {
      "listing_id": "lst_01...",
      "etsy_listing_id": "1234567890",
      "rank_position": 1,
      "title": "Mid Century Wall Art Print",
      "price": { "amount": "28.00", "currency": "USD" },
      "shop_id": "shp_01...",
      "review_count": 214,
      "favorite_count": 921,
      "ad_flag": false
    }
  ],
  "artifacts": {
    "search_snapshot_id": "ss_01...",
    "parser_version": "search_parser_2026_05_13",
    "captured_at": "2026-05-13T20:01:10Z"
  },
  "warnings": [
    {
      "code": "PARTIAL_FAVORITES_COVERAGE",
      "message": "Favorite-Zahlen lagen nur für einen Teil der Stichprobe vor."
    }
  ]
}
```

## Listing Result Summary

```json
{
  "analysis_id": "an_01j2...",
  "type": "listing",
  "status": "partial",
  "listing": {
    "listing_id": "lst_01...",
    "etsy_listing_id": "1234567890",
    "url": "https://www.etsy.com/listing/1234567890/example",
    "title": "Personalized Birth Flower Necklace",
    "shop_id": "shp_01...",
    "category": "Jewelry"
  },
  "snapshot": {
    "captured_at": "2026-05-13T20:03:00Z",
    "price": { "amount": "32.50", "currency": "USD" },
    "review_count": 881,
    "average_rating": 4.8,
    "favorite_count": null,
    "image_count": 7,
    "tags": ["birth flower", "personalized necklace"],
    "attributes": { "made_to_order": true },
    "validator_status": "partial",
    "validation_errors": [
      {
        "code": "MISSING_FAVORITE_COUNT",
        "message": "Favorite Count nicht sicher extrahierbar."
      }
    ]
  },
  "scores": {
    "opportunity_score": 61,
    "demand_score": 74,
    "competition_score": 49,
    "momentum_score": 57,
    "confidence_score": 58,
    "score_version": "opportunity_v1"
  },
  "explanations": [
    "Nachfrage-Signale stark, aber Kategorie ist stark besetzt.",
    "Confidence reduziert wegen unvollständiger Favoriten-Signale."
  ],
  "artifacts": {
    "listing_snapshot_id": "ls_01...",
    "raw_storage_ref_available": true,
    "parser_version": "listing_parser_2026_05_13"
  }
}
```

---

## 6) Interne Workflow-Inputs

## KeywordAnalysisWorkflow input

```json
{
  "analysis_id": "an_01j1...",
  "workspace_id": "ws_01...",
  "keyword": {
    "term": "mid century wall art",
    "locale": "en-US",
    "category_hint": null
  },
  "priority": "normal",
  "requested_at": "2026-05-13T20:00:00Z",
  "idempotency_key": "idem_abc123",
  "contract_version": "v1"
}
```

## ListingAnalysisWorkflow input

```json
{
  "analysis_id": "an_01j2...",
  "workspace_id": "ws_01...",
  "listing_url": "https://www.etsy.com/listing/1234567890",
  "priority": "normal",
  "requested_at": "2026-05-13T20:02:00Z",
  "idempotency_key": "idem_def456",
  "contract_version": "v1"
}
```

## RefreshWorkflow input

```json
{
  "analysis_id": "an_01j3...",
  "refresh_of_analysis_id": "an_01j1...",
  "reason": "user_requested",
  "priority": "high",
  "contract_version": "v1"
}
```

---

## 7) Workflow-Definitionen

## KeywordAnalysisWorkflow

**Ziel:** aus einem Keyword ein verwertbares Marktbild mit Score liefern.

**Schritte:**
1. `mark_analysis_running`
2. `collect_search_page`
3. `persist_raw_search_artifacts`
4. `parse_search_snapshot`
5. `validate_search_snapshot`
6. `extract_top_listing_targets`
7. `fanout_listing_detail_jobs`
8. `await_listing_detail_completion`
9. `normalize_keyword_market_view`
10. `compute_keyword_scores`
11. `persist_result_views`
12. `mark_analysis_completed_or_partial`

**Partial-Regel:**
- Search Snapshot ist verwertbar
- mindestens 60 % der Top-24 Listing-Details liegen verwertbar vor
- Score kann mit reduziertem Confidence berechnet werden

## ListingAnalysisWorkflow

**Schritte:**
1. `mark_analysis_running`
2. `collect_listing_page`
3. `persist_raw_listing_artifacts`
4. `parse_listing_snapshot`
5. `validate_listing_snapshot`
6. `normalize_listing_and_shop`
7. `compute_listing_scores`
8. `persist_result_views`
9. `mark_analysis_completed_or_partial`

**Partial-Regel:**
- Mindestfelder vorhanden
- Nebenfelder wie Favoriten, bestimmte Attribute oder Shop-Zusatzdaten fehlen

## RefreshWorkflow

**Schritte:**
1. Ursprungslauf laden
2. Cooldown/Crawl-Budget prüfen
3. Staleness prüfen
4. passenden Keyword- oder Listing-Workflow erneut starten
5. neue Analyse mit Vorgänger verknüpfen
6. alte Analyse bei Erfolg als `stale` markieren, wenn das Read Model ersetzt wird

---

## 8) BullMQ-Queues und Queue-Verträge

## Queue-Übersicht

1. `listing-detail-collect`
2. `listing-detail-parse`
3. `listing-detail-validate`
4. `cache-warm-analysis`
5. `notify-analysis-status`
6. `reprocess-snapshot`
7. `side-effect-dlq`

## `listing-detail-collect`

**Payload:**

```json
{
  "job_id": "job_01...",
  "analysis_id": "an_01j1...",
  "parent_workflow_id": "wf_keyword_an_01j1...",
  "listing_url": "https://www.etsy.com/listing/1234567890",
  "rank_position": 1,
  "page_number": 1,
  "query_term": "mid century wall art",
  "locale": "en-US",
  "capture_reason": "keyword_analysis",
  "dedupe_key": "collect:an_01j1:listing:1234567890",
  "attempt": 0,
  "contract_version": "v1"
}
```

**Result:**

```json
{
  "job_id": "job_01...",
  "status": "succeeded",
  "raw_storage_ref": "s3://raw/2026/05/13/.../listing.html",
  "screenshot_ref": "s3://raw/2026/05/13/.../listing.png",
  "capture_meta": {
    "http_status": 200,
    "blocked": false,
    "proxy_pool": "residential-a",
    "captured_at": "2026-05-13T20:00:45Z"
  }
}
```

## `listing-detail-parse`

```json
{
  "job_id": "job_02...",
  "analysis_id": "an_01j1...",
  "raw_storage_ref": "s3://raw/.../listing.html",
  "listing_url": "https://www.etsy.com/listing/1234567890",
  "parser_version": "listing_parser_2026_05_13",
  "dedupe_key": "parse:rawsha256:abcd1234",
  "contract_version": "v1"
}
```

## `listing-detail-validate`

```json
{
  "job_id": "job_03...",
  "analysis_id": "an_01j1...",
  "listing_snapshot_id": "ls_01...",
  "validator_version": "validator_2026_05_13",
  "dedupe_key": "validate:ls_01...:validator_2026_05_13",
  "contract_version": "v1"
}
```

## `cache-warm-analysis`

```json
{
  "job_id": "job_04...",
  "analysis_id": "an_01j1...",
  "result_type": "keyword",
  "dedupe_key": "cachewarm:an_01j1",
  "contract_version": "v1"
}
```

## `reprocess-snapshot`

```json
{
  "job_id": "job_05...",
  "snapshot_type": "listing",
  "snapshot_id": "ls_01...",
  "raw_storage_ref": "s3://raw/.../listing.html",
  "target_parser_version": "listing_parser_2026_05_20",
  "reason": "parser_upgrade",
  "dedupe_key": "reprocess:ls_01:listing_parser_2026_05_20",
  "contract_version": "v1"
}
```

---

## 9) Retry- und Failure-Verhalten

## Retry-Grundprinzip

Jeder Schritt klassifiziert in:
- erfolgreich
- retrybar fehlgeschlagen
- terminal fehlgeschlagen
- partial verwertbar

## Konkrete v1-Policies

### Netzwerk-/Timeout-Fehler
- retrybar
- exponentieller Backoff
- max 3 Retries im Collector
- max 5 Retries für kurze Temporal Activities

### `blocked_captcha`
- max 2 neue Versuche mit anderer Session/Proxy-Route
- dann terminal für den konkreten Schritt
- Workflow kann `failed` oder `partial` werden, abhängig vom Analysekontext

### `parser_drift`
- kein aggressiver Retry mit gleicher Parser-Version
- direkt QA-/Alert-Signal
- Analyse nur `partial`, wenn ausreichend Alternativsignale vorhanden sind

### `semantic_gap`
- primär `partial`
- Retry nur, wenn Feld historisch oft transient fehlt und Budget es erlaubt

### `rate_limited`
- retrybar mit längerem Backoff
- Scheduler drosselt Folgeaufträge

### `validation_failed`
- terminal für den Snapshot
- Analyse wird `partial` oder `failed`, abhängig von Mindestabdeckung

### `internal_error`
- retrybar bis Grenzwert
- danach `failed` mit Pflicht-Observability

## Zeitlimits v1

- Search Collect: 45s
- Listing Collect: 45s
- Parse: 15s
- Validate: 10s
- Score-Berechnung pro Analyse: 30s
- Listing-Workflow gesamt: 5min
- Keyword-Workflow gesamt: 15min

## Dead-Letter-Regel

DLQ nur für **nichtkritische Side-Jobs**; kritische Analysepfade müssen über Temporal kontrolliert terminal werden und dürfen nicht still in einer DLQ verschwinden.

---

## 10) Idempotenz und Dedupe

## Externe API

**Header:** `Idempotency-Key`

**Scope:** `workspace_id + route + key`

**Regeln:**
- gleicher Key + gleiche normalisierte Payload => identische Antwort oder Replay-Referenz
- gleicher Key + abweichende Payload => `409 CONFLICT`

## Interne Jobs

Beispiel-Dedupe-Keys:
- `collect:an_01j1:listing:1234567890`
- `parse:rawsha256:abcd1234`
- `validate:ls_01:validator_2026_05_13`
- `score:keyword:kw_01:opportunity_v1:ss_01`

## Datenbankseitig empfohlen

- unique `analyses.idempotency_key`
- unique `capture_jobs.idempotency_key`
- unique `(canonical_term, locale)` bei Keywords
- unique `etsy_listing_id` oder `canonical_listing_url` bei Listings
- unique `etsy_shop_id` oder `canonical_shop_url` bei Shops

---

## 11) Verantwortlichkeiten pro Datenübergang

## API -> Postgres

Schreibt:
- `analyses`
- initiale Statuswerte
- Request-Fingerprint
- Idempotenz-Key

## Collector -> Object Storage

Schreibt:
- HTML
- Screenshot
- JSON-/Network-Blobs
- Capture-Metadaten

**Pflicht-Metadaten:**
- `analysis_id`
- `capture_job_id`
- `source_url`
- `captured_at`
- `collector_version`
- `content_sha256`

## Parser/Validator -> Postgres + ClickHouse

**Postgres:**
- kanonische Listings/Shops/Keywords
- Job-/Analyse-Metadaten

**ClickHouse:**
- Search-/Listing-/Shop-Snapshots
- Search Result Impressions

## Scoring -> ClickHouse + Postgres

**ClickHouse:**
- Score-Historie

**Postgres:**
- aktuelle Scoresicht oder Ergebnis-Read-Model-Referenz

---

## 12) Minimale Implementierungsreihenfolge

1. `POST /v1/analyses/keyword`
2. `POST /v1/analyses/listing`
3. `GET /v1/analyses/{id}`
4. ListingAnalysisWorkflow
5. KeywordAnalysisWorkflow
6. Listing Collector/Parser/Validator/Writer
7. Search Collector/Parser/Validator/Writer
8. Score Engine v1
9. Ergebnis-Read-Models
10. RefreshWorkflow und Scheduler

---

## 13) Kurzfazit

Die v1-Schnittstellen sollten strikt so gebaut werden:
- **API** nimmt Aufträge an und liefert stabile Verträge,
- **Temporal** besitzt den kritischen Analysefluss,
- **BullMQ** übernimmt leichte Fan-outs und Side-Jobs,
- **Worker** sind nach Collection, Parsing, Validation, Normalisierung und Scoring getrennt,
- **Idempotenz, Retry-Klassen und Statusklarheit** sind kein Nice-to-have, sondern Kernvertrag.

Damit bleibt das System trotz externer Seitenfragilität operativ kontrollierbar.