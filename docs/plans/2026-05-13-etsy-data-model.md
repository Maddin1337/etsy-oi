# Etsy Opportunity Intelligence – Datenmodell v1

**Ziel:** Ein konkret implementierbares v1-Datenmodell für das Etsy-Produkt, das kanonische Entitäten, Append-only-Snapshots, Raw-Artefakte, Idempotenz und Reprocessing sauber trennt.

**Baut auf:** `/root/docs/plans/2026-05-13-etsy-systemarchitektur.md`

---

## 1) Verbindliche Modellierungsprinzipien

Das v1-Datenmodell folgt der festen Verarbeitungskette:

```text
Raw Artifact -> Capture Record -> Parsed Snapshot -> Validated Snapshot -> Canonical Entity -> Derived Metrics / Scores / Read Models
```

**Pflichtregeln:**
- Snapshots sind **append-only**.
- Postgres hält **kanonische, mutable Kernobjekte** und App-/Job-Metadaten.
- ClickHouse hält **historische, query-intensive Fakten**.
- Object Storage hält **HTML, Screenshots, Rohblobs und Beweisartefakte**.
- Jede Verarbeitungsstufe trägt **Versionen, Zeitstempel, Referenzen und Idempotenz-/Dedupe-Schlüssel**.
- **Observed** und **estimated** Signale werden getrennt gespeichert oder explizit markiert.

---

## 2) Explizite Annahmen für v1

1. **Locale-Scope:** v1 fokussiert auf `en-US`.
2. **Geldmodell:** Preise werden als `amount_minor BIGINT` + `currency_code CHAR(3)` gespeichert; keine Floats für Geld.
3. **Externe Schlüssel:** Etsy Listing ID und Etsy Shop ID werden verwendet, wenn extrahierbar, aber interne IDs bleiben führend.
4. **Search-Abdeckung:** Für Keyword-Analysen wird in v1 die erste Search-Results-Seite und die Top 24 Treffer weiterverarbeitet.
5. **Favoriten/Sales:** Nicht immer sicher oder vollständig verfügbar; deshalb Trennung zwischen beobachtetem Wert, fehlendem Wert und Schätzwert.
6. **Multi-Tenancy:** Markt-/Produktdaten sind global, Analysen und gespeicherte Ergebnisse sind workspace-gebunden.
7. **Kategorie-/Taxonomie-Tiefe:** Etsy-Taxonomie wird in v1 nicht vollständig gespiegelt; rohe Kategoriehinweise und normalisierte Produktattribute reichen aus.
8. **Bildanalyse:** Nicht Teil von v1; nur Bild-Metadaten werden modelliert.
9. **Read Models:** API-nahe Ergebnis-Views dürfen aus mehreren Speichern zusammengesetzt werden, sind aber kein Ersatz für Rohhistorie.

---

## 3) Storage-Zuordnung und Verantwortung

## PostgreSQL enthält

- `users`, `workspaces`, `projects`
- `keywords`
- `listings`
- `shops`
- `analyses`
- `capture_jobs`
- `score_versions`
- optional `current_entity_scores`
- optionale QA-/ops-nahe Indextabellen, aber keine großen Blobs

**Rolle:** System of record für App-Zustand, kanonische Entitäten, Status, Idempotenz und Freigabelogik.

## ClickHouse enthält

- `search_snapshots`
- `search_result_impressions`
- `listing_snapshots`
- `shop_snapshots`
- `score_snapshots`
- `trend_fact_daily`
- optionale Aggregate/Materialized Views

**Rolle:** Zeitreihen, Ranking-Historie, Score-Historie, query-intensive Verlaufsdaten.

## Object Storage enthält

- HTML
- Screenshots
- JSON-LD-Blobs
- embedded JSON-Blobs
- relevante Netzwerkresponses
- Parser-Input-/Output-Blobs bei Fehlerfällen

**Rolle:** Debugging, Reprocessing, Drift-Erkennung, QA, Nachvollziehbarkeit.

---

## 4) Kanonische Kernentitäten

## 4.1 Keyword

Repräsentiert einen normalisierten Suchbegriff.

**Kanonischer Schlüssel:** `(canonical_term, locale)`

**Pflichtfelder:**
- `id UUID`
- `raw_term TEXT`
- `canonical_term TEXT`
- `locale TEXT`
- `category_hint TEXT NULL`
- `first_seen_at TIMESTAMPTZ`
- `last_seen_at TIMESTAMPTZ`
- `last_analyzed_at TIMESTAMPTZ NULL`
- `is_active BOOLEAN`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

**Pflichtindexe / Constraints:**
- `UNIQUE (canonical_term, locale)`
- Index auf `(last_analyzed_at)`

## 4.2 Listing

Repräsentiert das kanonische Produktobjekt.

**Kanonischer Schlüssel:**
- primär `etsy_listing_id`, wenn vorhanden
- sonst `canonical_listing_url`

**Pflichtfelder:**
- `id UUID`
- `etsy_listing_id TEXT NULL`
- `shop_id UUID NULL`
- `canonical_listing_url TEXT`
- `source_listing_url TEXT`
- `title TEXT`
- `status TEXT` (`active|inactive|unknown`)
- `category_hint TEXT NULL`
- `primary_currency_code CHAR(3) NULL`
- `created_at_source TIMESTAMPTZ NULL`
- `first_seen_at TIMESTAMPTZ`
- `last_seen_at TIMESTAMPTZ`
- `last_snapshot_at TIMESTAMPTZ NULL`
- `last_parser_version TEXT NULL`
- `data_quality_status TEXT` (`ok|partial|suspect`)
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

**Pflichtindexe / Constraints:**
- partielles `UNIQUE (etsy_listing_id)` wenn nicht null
- `UNIQUE (canonical_listing_url)`
- Index auf `(shop_id)`
- Index auf `(last_snapshot_at DESC)`

## 4.3 Shop

Repräsentiert einen Etsy-Shop.

**Kanonischer Schlüssel:**
- primär `etsy_shop_id`, wenn vorhanden
- sonst `canonical_shop_url`

**Pflichtfelder:**
- `id UUID`
- `etsy_shop_id TEXT NULL`
- `shop_name TEXT`
- `canonical_shop_url TEXT`
- `source_shop_url TEXT`
- `country_code TEXT NULL`
- `first_seen_at TIMESTAMPTZ`
- `last_seen_at TIMESTAMPTZ`
- `last_snapshot_at TIMESTAMPTZ NULL`
- `data_quality_status TEXT` (`ok|partial|suspect`)
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

**Pflichtindexe / Constraints:**
- partielles `UNIQUE (etsy_shop_id)` wenn nicht null
- `UNIQUE (canonical_shop_url)`

## 4.4 Analysis

Repräsentiert einen Benutzer- oder Scheduler-Auftrag.

**Pflichtfelder:**
- `id UUID`
- `workspace_id UUID`
- `project_id UUID NULL`
- `analysis_type TEXT` (`keyword|listing|shop`)
- `subject_keyword_id UUID NULL`
- `subject_listing_id UUID NULL`
- `subject_shop_id UUID NULL`
- `status TEXT` (`queued|running|partial|completed|failed|blocked|validation_failed|stale|refreshed|cancelled`)
- `requested_by_user_id UUID NULL`
- `trigger_source TEXT` (`user|scheduler|rebuild|canary`)
- `refresh_of_analysis_id UUID NULL`
- `idempotency_key TEXT`
- `error_code TEXT NULL`
- `error_detail JSONB NULL`
- `retry_count INT`
- `started_at TIMESTAMPTZ NULL`
- `finished_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

**Regel:** Genau ein Subject-Feld muss passend zum `analysis_type` gesetzt sein.

## 4.5 Capture Job

Abgrenzbare technische Ausführung eines Collection-Schritts.

**Pflichtfelder:**
- `id UUID`
- `analysis_id UUID NULL`
- `job_type TEXT` (`search_capture|listing_capture|shop_capture|reprocess`)
- `target_type TEXT` (`keyword|listing|shop|url`)
- `target_ref TEXT`
- `source_url TEXT`
- `capture_reason TEXT` (`initial|refresh|debug|canary|rebuild|keyword_analysis`)
- `idempotency_key TEXT`
- `status TEXT` (`queued|running|completed|partial|failed|blocked|validation_failed`)
- `failure_class TEXT NULL` (`network_error|blocked_captcha|parser_drift|semantic_gap|rate_limited|internal_error`)
- `worker_queue TEXT`
- `attempt_count INT`
- `started_at TIMESTAMPTZ NULL`
- `finished_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

## 4.6 Score Version

Versioniert die Score-Logik.

**Pflichtfelder:**
- `id UUID`
- `score_key TEXT`
- `version TEXT`
- `weights_json JSONB`
- `changelog_md TEXT`
- `is_active BOOLEAN`
- `created_at TIMESTAMPTZ`

## 4.7 Current Entity Scores

API-nahe aktuelle Scoresicht.

**Pflichtfelder:**
- `subject_type TEXT`
- `subject_id UUID`
- `score_version_id UUID`
- `opportunity_score NUMERIC(5,2)`
- `demand_score NUMERIC(5,2)`
- `competition_score NUMERIC(5,2)`
- `momentum_score NUMERIC(5,2)`
- `commercial_viability_score NUMERIC(5,2)`
- `confidence_score NUMERIC(5,2)`
- `evidence_summary_json JSONB`
- `computed_at TIMESTAMPTZ`

---

## 5) Beziehungen

```text
workspace 1---n analyses
project 1---n analyses
keyword 1---n search_snapshots
shop 1---n listings
listing 1---n listing_snapshots
shop 1---n shop_snapshots
analysis 1---n capture_jobs
analysis 1---n score_snapshots
capture_job 1---n raw_artifacts
capture_job 1---0..1 search_snapshot
capture_job 1---0..1 listing_snapshot
capture_job 1---0..1 shop_snapshot
keyword n---m listing über search_result_impressions
score_version 1---n score_snapshots
```

**Wichtige Modellierungsentscheidung:**
Die Keyword-zu-Listing-Beziehung ist **nicht statisch**, sondern wird über `search_result_impressions` pro Search-Snapshot historisiert. Damit bleiben Ranking und Sichtbarkeit query-spezifisch nachvollziehbar.

---

## 6) ClickHouse-Faktenmodell

## 6.1 `search_snapshots`

**Pflichtspalten:**
- `snapshot_id UUID`
- `capture_job_id UUID`
- `keyword_id UUID`
- `query_term String`
- `locale LowCardinality(String)`
- `page_number UInt16`
- `captured_at DateTime64(3, 'UTC')`
- `total_results_estimate UInt32`
- `parser_version LowCardinality(String)`
- `validator_status LowCardinality(String)`
- `validation_errors_json String`
- `source_url String`
- `raw_artifact_path String`
- `snapshot_dedupe_key String`
- `capture_reason LowCardinality(String)`

**ORDER BY:** `(keyword_id, captured_at, page_number, snapshot_id)`

## 6.2 `search_result_impressions`

**Pflichtspalten:**
- `snapshot_id UUID`
- `keyword_id UUID`
- `listing_id UUID`
- `captured_at DateTime64(3, 'UTC')`
- `page_number UInt16`
- `rank_position UInt16`
- `absolute_rank UInt32`
- `ad_flag Bool`
- `price_amount_minor Int64`
- `currency_code FixedString(3)`
- `review_count UInt32`
- `average_rating Float32`
- `shop_id UUID`
- `parser_version LowCardinality(String)`

**ORDER BY:** `(keyword_id, captured_at, absolute_rank, listing_id)`

## 6.3 `listing_snapshots`

**Pflichtspalten:**
- `snapshot_id UUID`
- `capture_job_id UUID`
- `listing_id UUID`
- `etsy_listing_id String`
- `shop_id UUID`
- `captured_at DateTime64(3, 'UTC')`
- `status LowCardinality(String)`
- `title String`
- `price_amount_minor Int64`
- `currency_code FixedString(3)`
- `review_count UInt32`
- `average_rating Float32`
- `favorite_count UInt32`
- `image_count UInt16`
- `tags_json String`
- `attributes_json String`
- `is_digital Bool`
- `validator_status LowCardinality(String)`
- `validation_errors_json String`
- `parser_version LowCardinality(String)`
- `source_url String`
- `raw_artifact_path String`
- `snapshot_dedupe_key String`

**PARTITION BY:** `toYYYYMM(captured_at)`

**ORDER BY:** `(listing_id, captured_at, snapshot_id)`

## 6.4 `shop_snapshots`

**Pflichtspalten:**
- `snapshot_id UUID`
- `capture_job_id UUID`
- `shop_id UUID`
- `etsy_shop_id String`
- `captured_at DateTime64(3, 'UTC')`
- `shop_name String`
- `rating Float32`
- `review_count UInt32`
- `total_sales_public_proxy UInt32`
- `admirers_count UInt32`
- `country_code LowCardinality(String)`
- `parser_version LowCardinality(String)`
- `validator_status LowCardinality(String)`
- `validation_errors_json String`
- `source_url String`
- `raw_artifact_path String`
- `snapshot_dedupe_key String`

## 6.5 `score_snapshots`

**Pflichtspalten:**
- `score_snapshot_id UUID`
- `subject_type LowCardinality(String)`
- `subject_id UUID`
- `captured_at DateTime64(3, 'UTC')`
- `score_version_id UUID`
- `opportunity_score Float32`
- `demand_score Float32`
- `competition_score Float32`
- `momentum_score Float32`
- `commercial_viability_score Float32`
- `confidence_score Float32`
- `observed_signal_count UInt16`
- `estimated_signal_count UInt16`
- `evidence_json String`
- `calculation_trace_json String`
- `snapshot_dedupe_key String`

## 6.6 `trend_fact_daily`

**Pflichtspalten:**
- `subject_type LowCardinality(String)`
- `subject_id UUID`
- `day Date`
- `score_version_id UUID`
- `avg_price_amount_minor Int64`
- `min_price_amount_minor Int64`
- `max_price_amount_minor Int64`
- `review_delta_7d Int32`
- `favorite_delta_7d Int32`
- `rank_best UInt32`
- `rank_worst UInt32`
- `rank_median Float32`
- `snapshot_count UInt16`
- `computed_at DateTime64(3, 'UTC')`

---

## 7) Raw-Storage-Referenzmodell

Jeder Snapshot referenziert Rohartefakte statt sie direkt in DBs zu speichern.

**Pflichtfelder pro Rohartefakt:**
- `artifact_id UUID`
- `capture_job_id UUID`
- `artifact_kind TEXT` (`html|screenshot|jsonld|embedded_json|network_response|parser_io`)
- `storage_path TEXT`
- `content_type TEXT`
- `content_sha256 TEXT`
- `byte_size BIGINT`
- `captured_at TIMESTAMPTZ`
- `retention_class TEXT` (`short|standard|extended`)
- `encryption_status TEXT`

**Pfadkonvention:**

```text
s3://etsy-raw/{env}/{page_type}/{yyyy}/{mm}/{dd}/{capture_job_id}/{artifact_kind}-{sha256}.{ext}
```

**Beispiel:**

```text
s3://etsy-raw/prod/listing/2026/05/13/01HV.../html-8f2d....html.gz
```

---

## 8) Pflichtfelder pro Snapshot-Typ

## 8.1 Search Snapshot

**Pflichtfelder:**
- `snapshot_id`
- `keyword_id`
- `captured_at`
- `query_term`
- `locale`
- `page_number`
- `source_url`
- `raw_storage_ref`
- `parser_version`
- `capture_reason`
- `validator_status`

**Pflichtfelder pro Ranking-Zeile:**
- `listing external ref oder listing_id`
- `rank_position`
- `page_number`
- `absolute_rank`
- `ad_flag`
- `query_term`

## 8.2 Listing Snapshot

**Pflichtfelder:**
- `snapshot_id`
- `listing_id oder externe Listing-Referenz`
- `captured_at`
- `title`
- `price_amount_minor` + `currency_code` oder `price_missing_reason`
- `shop_id oder externe Shop-Referenz` oder `shop_missing_reason`
- `raw_storage_ref`
- `source_url`
- `parser_version`
- `validator_status`
- `validation_errors`

## 8.3 Shop Snapshot

**Pflichtfelder:**
- `snapshot_id`
- `shop_id oder externe Shop-Referenz`
- `captured_at`
- `shop_name`
- `raw_storage_ref`
- `source_url`
- `parser_version`
- `validator_status`

## 8.4 Score Snapshot

**Pflichtfelder:**
- `score_snapshot_id`
- `subject_type`
- `subject_id`
- `captured_at`
- `score_version_id`
- `opportunity_score`
- `demand_score`
- `competition_score`
- `momentum_score`
- `commercial_viability_score`
- `confidence_score`
- `observed_signal_count`
- `estimated_signal_count`
- `evidence_json`

---

## 9) Kanonisierung

## 9.1 URL-Kanonisierung

1. Hostname lowercase
2. Schema immer `https`
3. irrelevante Query-Parameter entfernen (`ref`, `ga_*`, Tracking-/Session-Parameter)
4. Fragment entfernen
5. doppelte Slashes normalisieren
6. Original-URL separat als `source_url` erhalten

## 9.2 Keyword-Kanonisierung

`canonical_term` entsteht durch:
- Unicode `NFKC`
- lowercase
- trim
- innere Whitespaces auf einfaches Leerzeichen reduzieren
- Rand-Satzzeichen entfernen

**Beispiel:**
- Raw: `  Printable Wall Art  `
- Canonical: `printable wall art`

## 9.3 Listing-Kanonisierung

**Dedupe-Regel v1:**
- gleiche `etsy_listing_id` => identisches Listing
- sonst gleiche `canonical_listing_url` => identisches Listing
- sonst kein Auto-Merge in v1

**Merge-Regeln:**
- `first_seen_at` nur einmal setzen
- `last_seen_at` bei jeder validierten Beobachtung aktualisieren
- `title` nur mit `valid`/`partial` Snapshot überschreiben
- `shop_id` nur bei validierter Zuordnung überschreiben
- `status = inactive` statt harter Löschung

## 9.4 Shop-Kanonisierung

**Dedupe-Regel v1:**
- gleiche `etsy_shop_id` => identischer Shop
- sonst gleiche `canonical_shop_url` => identischer Shop
- gleicher Anzeigename allein reicht **nicht**

## 9.5 Tags und Attribute

- rohe Tags bleiben im Snapshot erhalten
- normalisierte Tags zusätzlich lowercase + NFKC
- Attribute als key/value-Paare mit kanonisiertem Schlüssel
- keine tiefe Ontologieauflösung in v1

---

## 10) Idempotenz

Idempotenz ist Pflicht auf vier Ebenen.

## 10.1 Analyse-Idempotenz

**Bildungsvorschlag:**

```text
sha256(workspace_id + analysis_type + normalized_subject + refresh_policy + active_window_bucket)
```

**Zweck:** Verhindert doppelte Analyseaufträge innerhalb eines kurzen Zeitfensters.

## 10.2 Capture-Idempotenz

**Bildungsvorschlag:**

```text
sha256(job_type + target_ref + source_url + capture_reason + parser_family + scheduled_bucket)
```

**Zweck:** verhindert Doppel-Captures bei Retries oder parallelen Triggern.

## 10.3 Snapshot-Dedupe

**Bildungsvorschlag:**

```text
sha256(entity_external_key + captured_at_bucket + parser_version + raw_artifact_sha256)
```

**Zweck:** verhindert Doppelwrites derselben Beobachtung, erlaubt aber spätere echte Re-Captures.

## 10.4 Event-Idempotenz

Jedes Event erhält:
- `event_id`
- `event_type`
- `schema_version`
- `producer`
- `occurred_at`
- `idempotency_key`
- `trace_id`

Consumer deduplizieren auf `idempotency_key` oder `event_id`.

---

## 11) Validierungs- und Gating-Regeln

## Listing Snapshot Hard-Fail

- leerer Titel
- Preis nicht parsebar und kein Missing-Reason
- widersprüchliche Listing-IDs
- keine referenzierbare Rohquelle

## Search Snapshot Hard-Fail

- kein Keyword-Bezug
- kein `captured_at`
- weder Ranking-Zeilen noch expliziter `empty_result`-Status
- keine Rohreferenz

## Shop Snapshot Hard-Fail

- kein Shop-Bezug
- leerer Shop-Name
- keine Rohreferenz

**Produktive Regel:** `invalid` Snapshots dürfen nicht in Score- oder Produktpfade eingehen; sie bleiben nur für QA/Reprocessing sichtbar.

---

## 12) Reprocessing und Retention

## Reprocessing-Regeln

- Reprocessing liest aus Raw-Artefakten und Parser-/Validator-Versionen.
- Reprocessing erzeugt **neue Snapshots**, nie Mutation alter Snapshot-Zeilen.
- Score-Rebuild erzeugt neue `score_snapshots`.
- Kanonische Postgres-Objekte dürfen anschließend neu kuratiert werden.

## Retention-Regeln v1

- HTML: 30–90 Tage Standard
- Screenshots: 30 Tage Standard
- Drift-/Canary-/Fehlerfälle: längere Retention
- ClickHouse-Snapshots: keine aggressive Löschung in v1, aber Kostenüberwachung
- Postgres-Kernobjekte: dauerhaft

---

## 13) Empfohlene Read Models

## `keyword_opportunity_view`

Liefert:
- Keyword-Stammdaten
- letzten Search Snapshot
- Top Listings mit aktueller Rank-Position
- aggregierte Konkurrenz-/Nachfrage-Scores
- Datenfrische und Confidence

## `listing_detail_view`

Liefert:
- Listing-Stammdaten
- Shop-Kurzprofil
- aktuellen ListingSnapshot
- aktuelle Scores
- Trenddaten der letzten 30 Tage
- Warnings und Validation-Hinweise

## `shop_summary_view`

Liefert:
- Shop-Stammdaten
- aktuelle sichtbare Shop-Signale
- beobachtete Listing-Anzahl im Datensatz
- Score/Momentum-Zusammenfassung

---

## 14) Reihenfolge für die Implementierung des Datenmodells

1. Postgres-Kernobjekte und Constraints
2. ClickHouse-Snapshottabellen
3. URL-/Keyword-/Money-Kanonisierung als Shared Library
4. Idempotency-Key-Generatoren
5. Validatoren je Seitentyp
6. Writer/Upsert-Logik für Listings und Shops
7. ScoreSnapshots und aktuelle Score-Sicht
8. Read Models für API

---

## 15) Kurzfazit

Das v1-Datenmodell trennt bewusst:
- **Postgres** für kuratierte Zustände,
- **ClickHouse** für Historie und Analytics,
- **Object Storage** für Rohartefakte.

Die wichtigste Datenmodell-Entscheidung lautet:

**Snapshot-first, validator-first, idempotent by design.**

Nur so bleiben Trends, Ranking-Historie, Score-Erklärbarkeit und Reprocessing belastbar.