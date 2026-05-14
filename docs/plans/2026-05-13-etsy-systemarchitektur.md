# Etsy Opportunity Intelligence – Systemarchitektur

> Fokus: qualitativ hochwertiges Etsy-Analyse-Tool für Nischen-, Produkt- und Opportunity-Research.

**Ziel:** Eine belastbare, skalierbare Architektur für ein Etsy-Research-Produkt, das öffentliche Marktsignale einsammelt, normalisiert, bewertet und als Opportunity-Insights bereitstellt.

**Architekturprinzip:** Nicht „möglichst schnell etwas scrapen“, sondern ein System bauen, das Datenqualität, Nachvollziehbarkeit, Robustheit gegen Layout-Änderungen und saubere Analytics priorisiert.

**Empfohlener Stack:** Next.js 15, React 19, NestJS + Fastify, PostgreSQL 18, ClickHouse Cloud, Temporal Cloud, BullMQ + Valkey/Redis, Playwright, OpenTelemetry, Grafana Cloud, Sentry.

---

## 1) Systemziel

Das System soll drei Kernfragen beantworten:

1. **Wonach suchen Käufer?**
2. **Wie stark ist die Konkurrenz?**
3. **Welche Listings/Nischen zeigen aktuell die beste Opportunity?**

Dafür braucht das System:
- Datenerfassung von öffentlichen Etsy-Seiten
- Normalisierung und Validierung der Daten
- Zeitreihenfähige Speicherung
- Opportunity-Scoring
- UI für Analysten und Endnutzer

---

## 2) Architektur auf höchster Ebene

```text
[User / Analyst]
      |
      v
[Next.js Web App]
      |
      v
[API Gateway / NestJS]
      |
      +--------------------+
      |                    |
      v                    v
[PostgreSQL]         [ClickHouse]
 App-Daten            Analytics / Snapshots / Trends
      |
      v
[Workflow Layer]
 Temporal Cloud + BullMQ
      |
      v
[Collection Pipeline]
 Scheduler -> Playwright Workers -> Extractors -> Validators -> Scoring
      |
      +--------------------+
      |                    |
      v                    v
[Raw Storage]        [Observability]
 HTML / JSON /       OTel / Grafana / Sentry
 Screenshots
```

---

## 3) Hauptkomponenten

## 3.1 Frontend

**Technologie**
- Next.js 15
- React 19
- TypeScript
- shadcn/ui
- TanStack Table
- ECharts

**Verantwortung**
- Keyword Analyzer
- Listing Analyzer
- Niche Explorer
- interne QA-/Admin-Ansicht
- Ergebnisdarstellung für Scores, Trends, Preiscluster, Konkurrenzdichte

**Warum so?**
- sehr gute Developer Experience
- serverseitige Datenanbindung einfach
- schnell produktionsreif
- moderne UI ohne unnötigen Overhead

---

## 3.2 API / Application Layer

**Technologie**
- NestJS
- Fastify

**Verantwortung**
- Authentifizierung / Sessions
- API für Frontend
- Verwaltung von Analysen, Projekten, Keywords, Nutzerabfragen
- Triggern von Jobs und Workflows
- Zugriffsschicht für Postgres und ClickHouse

**Warum so?**
- klare Modulstruktur
- geeignet für wachsende Teams
- gute Trennung zwischen Domain, Jobs und API

**Präzisierung**
- NestJS ist hier **App-API + Backend-for-Frontend**, kein separates API-Gateway-Produkt
- Contracts zwischen Frontend, API und Workern sollten versioniert werden
- Datenbankmigrationen und Schema-Änderungen müssen als eigener Release-Pfad behandelt werden

---

## 3.3 Workflow- und Job-System

**Technologie**
- Temporal Cloud für kritische und langlebige Workflows
- BullMQ + Valkey/Redis für kurzfristige Queue-Jobs

**Aufgabenteilung**

**Temporal** für:
- mehrstufige Crawl-/Re-Crawl-Pipelines
- Retry-Logik
- Orchestrierung von Snapshot, Parsing, Validierung, Score-Rebuild
- geplante Refresh-Zyklen

**BullMQ** für:
- kleinere Hintergrundjobs
- Cache-Warming
- E-Mail / Notifications
- leichte Fan-out Tasks

**Warum diese Kombination?**
- Temporal ist stark für robuste Business-Workflows
- BullMQ ist schnell und pragmatisch für Standard-Queues
- zusammen sehr produktionsreif

**Betriebsregel**
- **Temporal** orchestriert nur langlebige, kritische, mehrstufige Flows
- **BullMQ** verarbeitet nur kurzlebige Side-Jobs ohne komplexe Orchestrierung
- jeder Job-Typ braucht Idempotenz-Key, Retry-Strategie und Dead-Letter-Pfad

---

## 3.4 Datenerfassung / Collection Layer

**Technologie**
- Playwright
- dedizierte Worker
- regelbasierte Extractors

**Drei Seitentypen**
- Search Pages
- Listing Pages
- Shop Pages

**Pipeline**
1. URL / Query einplanen
2. Seite rendern und abrufen
3. Rohdaten speichern
4. strukturierte Daten extrahieren
5. Validierung ausführen
6. Normalisierte Entitäten schreiben
7. Scores und Trends berechnen

**Extractor-Reihenfolge**
1. JSON-LD
2. eingebettete JSON-Daten
3. relevante Netzwerkantworten
4. DOM-Fallback

**Warum diese Reihenfolge?**
Weil sie robuster ist als reines CSS-Selector-Scraping.

## 3.4.1 Collection Resilience

Die Collection-Pipeline ist der kritischste operative Teil des Produkts.

**Pflichtbausteine**
- adaptive Rate-Limits pro Seitentyp
- Block-/Captcha-Erkennung als eigener Status
- Session-/Cookie-Handling getrennt von Parserlogik
- Proxy-/Egress-Strategie für Lastverteilung
- Crawl-Budget pro Keyword, Listing und Refresh-Zyklus

**Failure-Klassen**
- Netzwerkfehler
- Blockierung / Captcha
- Parser-Drift
- semantische Datenlücke trotz erfolgreichem Fetch

Nur so lässt sich später sauber unterscheiden, ob ein Problem von Etsy, vom Netzwerk oder vom eigenen Extractor kommt.

---

## 3.5 Storage Layer

### PostgreSQL 18

**Speichert**
- User
- Accounts
- Projekte
- gespeicherte Keywords
- Analyse-Jobs
- Konfiguration
- Billing / Limits
- kuratierte Kernobjekte

**Beispiele für Tabellen**
- users
- workspaces
- projects
- keywords
- analyses
- listings
- shops
- score_versions

### ClickHouse Cloud

**Speichert**
- Snapshots von Listings
- Suchergebnis-Snapshots
- Zeitreihen
- Review-/Favorite-/Preis-Verläufe
- Trendmetriken
- Event-/Analytics-Daten

**Warum getrennt?**
- Postgres ist ideal für App-Logik
- ClickHouse ist ideal für große Analyse- und Zeitreihendaten
- so bleibt das System performant und wartbar

## 3.5.1 Storage-Vertrag

**Postgres enthält**
- kanonische Entitäten
- User-/Workspace-/Billing-Daten
- Job-Metadaten und Status
- aktuelle, kuratierte Objektzustände

**ClickHouse enthält**
- append-only Snapshots
- Ranking-/Trend-/Zeitreihendaten
- aggregierte Analysemetriken
- Query-optimierte Verlaufsdaten

**Objekt-Storage enthält**
- HTML
- Screenshots
- Response-Artefakte
- extrahierte Rohblobs

**Wichtige Regel**
Jeder Snapshot braucht eine stabile ID, Parser-Version, Capture-Zeit und Referenz auf den Raw-Artefaktpfad.

---

## 3.6 Raw Storage

**Speichert pro Crawl-Lauf**
- HTML
- Screenshot
- extrahierte JSON-Blobs
- Metadaten zum Parser
- Response-/Fetch-Metadaten

**Zweck**
- Debugging
- Reprocessing
- Drift-Erkennung
- Qualitätskontrolle

**Empfehlung**
- objektbasiertes Storage wie S3-kompatibel

---

## 3.7 Scoring Engine

**Input**
- Nachfrage-Signale
- Konkurrenz-Signale
- Momentum-Signale
- Preis-/Monetarisierungs-Signale
- Shop-Stärke

**Output**
- Opportunity Score
- Demand Score
- Competition Score
- Momentum Score
- Confidence Score

**Wichtige Regel**
Das System darf geschätzte Werte nicht als exakte Wahrheit darstellen. Deshalb braucht jeder Score zusätzlich:
- Erklärung
- Datenbasis
- Confidence Level

## 3.7.1 Score-Spezifikation v1

Jeder Score in v1 sollte versioniert und erklärbar sein.

**Empfohlene v1-Gewichtung**
- Demand: 35%
- Competition: 25%
- Momentum: 25%
- Commercial viability: 15%

**Zusatzregeln**
- fehlende Signale senken den Confidence Score
- beobachtete Werte und geschätzte Werte werden getrennt ausgewiesen
- jede Score-Version bekommt eigenes Changelog und Rebuild-Pfad

---

## 3.8 Observability / Quality Layer

**Technologie**
- OpenTelemetry
- Grafana Cloud
- Sentry

**Überwachen**
- Crawl Success Rate
- Parser Failure Rate
- Drift-Events
- Queue-Latenzen
- Workflow-Dauer
- API-Latenzen
- Fehlerraten

**Zusätzliche Qualitätsmechanismen**
- Schema Validation pro Seitentyp
- Canary-Crawls
- Parser-Versionierung
- automatische Alerts bei Datenabfall

---

## 4) Datenfluss im Detail

## 4.1 Keyword-Analyse

```text
User gibt Keyword ein
-> API erzeugt Analyseauftrag
-> Temporal startet Workflow
-> Search Collector ruft Etsy-Suchergebnisse ab
-> Raw Snapshot wird gespeichert
-> Search Extractor extrahiert Listings, Preise, Reviews, Reihenfolge, Filtermerkmale
-> Listing URLs werden für Detailanalyse eingeplant
-> Detaildaten werden gesammelt und normalisiert
-> Analytics werden in ClickHouse geschrieben
-> Opportunity Engine berechnet Scores
-> API liefert Ergebnis an Frontend
```

## 4.2 Listing-Analyse

```text
User gibt Listing-URL ein
-> API validiert URL
-> Collection Job lädt Listing
-> Rohdaten + Screenshot werden gespeichert
-> Extractor liest Preis, Titel, Bilder, Reviews, Favoriten, Shop-Daten, Alter, Attribute
-> Validator prüft Vollständigkeit
-> Normalisierte Daten werden persistiert
-> Score Engine bewertet Listing im Markt-Kontext
-> Frontend zeigt Ergebnis + Erklärungen
```

## 4.3 Re-Crawl / Refresh

```text
Scheduler identifiziert relevante Keywords / Listings
-> Temporal plant Refresh
-> Worker führen Re-Crawl durch
-> Neue Snapshots werden gespeichert
-> Trend- und Velocity-Metriken werden aktualisiert
-> Alerts bei starken Veränderungen
```

## 4.4 Nutzerfluss v1

```text
User meldet sich an
-> gibt Keyword oder Listing-URL ein
-> Analyseauftrag wird angelegt
-> Status = queued / running / partial / failed / completed
-> bei Erfolg: Score + Begründung + Top-Signale werden angezeigt
-> User kann Ergebnis speichern, erneut ausführen oder vergleichen
```

**Pflicht-Zustände in der UI**
- loading
- partial
- stale
- failed
- refreshed

---

## 5) Datenmodell für v1

## Kernentitäten

### Keyword
- id
- term
- locale
- category_hint
- first_seen_at
- last_analyzed_at

### SearchSnapshot
- id
- keyword_id
- captured_at
- total_results_estimate
- top_listing_ids
- raw_storage_ref
- parser_version

### Listing
- id
- etsy_listing_id
- shop_id
- url
- title
- category
- created_at_source
- first_seen_at
- last_seen_at

### ListingSnapshot
- id
- listing_id
- captured_at
- price
- currency
- review_count
- average_rating
- favorite_count
- image_count
- tags
- attributes
- raw_storage_ref
- validator_status

### Shop
- id
- etsy_shop_id
- name
- url
- rating
- total_sales_public_proxy
- country
- first_seen_at

### ScoreSnapshot
- id
- subject_type
- subject_id
- captured_at
- demand_score
- competition_score
- momentum_score
- opportunity_score
- confidence_score
- score_version

## 5.1 Zusätzliche Pflichtfelder für v1

### Für Jobs / Analysen
- status
- error_code
- retry_count
- started_at
- finished_at

### Für Snapshots
- source_url
- locale
- capture_reason
- parser_version
- validation_errors

### Für Rankings / Suchergebnisse
- rank_position
- page_number
- ad_flag
- query_term

## 5.2 Kanonisierung und Idempotenz

- Listings brauchen eine kanonische interne ID zusätzlich zur Etsy-ID
- Shops und Listings müssen deduplizierbar sein
- jeder Crawl-Lauf braucht einen Idempotenz-Key
- Raw Snapshot -> Parsed Snapshot -> Normalized Entity -> Derived Metrics ist die feste Verarbeitungskette

---

## 6) Qualitätsarchitektur

Qualität ist bei diesem Produkt kein Extra, sondern Kern der Architektur.

## Pflichtmechanismen
- Parser-Versionierung
- Snapshot-basierte Reproduzierbarkeit
- Validierungsregeln pro Seitentyp
- Confidence Score je Analyse
- Canary-Keywords für Frühwarnung
- manuelle QA-Oberfläche für Stichproben

## Beispiel für Validator-Regeln
- Preis muss parsebar sein
- Titel darf nicht leer sein
- Review Count darf nicht negativ sein
- Shop-Referenz muss konsistent sein
- Snapshot ohne Mindestfelder wird nicht produktiv verwertet

---

## 7) Sicherheits- und Compliance-Grundsätze

- Nur notwendige öffentliche Daten verwenden
- klare Trennung zwischen Rohdaten und Produktmetriken
- Rate-Limits und konservative Collection-Strategien
- Auditierbarkeit jeder Berechnung
- keine exakten Fremdumsatz-Behauptungen ohne belastbare Quelle
- Produktsprache: „geschätzt“, „Signal“, „Proxy“, „Confidence“ statt falscher Sicherheit

## Mindestregeln für Compliance und Betrieb

- Retention-Regeln für HTML, Screenshots und Logs vorab definieren
- Zugriff auf Raw Storage nur für interne QA-/Ops-Pfade
- sensible Artefakte verschlüsselt speichern
- Lösch- und Reprocessing-Konzept dokumentieren
- ToS-/Legal-Risiko als laufende Produktannahme behandeln, nicht als Fußnote

---

## 8) Empfohlene Servicestruktur

```text
/apps
  /web                -> Next.js Frontend
  /api                -> NestJS API
  /worker-collector   -> Playwright Collection Worker
  /worker-parser      -> Parsing / Normalisierung
  /worker-scoring     -> Score-Berechnung
  /admin              -> interne QA / Operations UI

/packages
  /shared-types
  /db
  /scoring
  /extractors
  /validators
  /telemetry
```

**Warum so?**
- saubere Trennung der Verantwortlichkeiten
- wiederverwendbare Domain-Pakete
- gute Basis für Monorepo und Teamwachstum

---

## 9) Deployment-Empfehlung

## Frontend
- Vercel

## API + Worker
- Render oder ECS/Fargate

**Empfehlung für die Worker**
- API kann auf Render funktionieren
- Playwright-Worker sind auf ECS/Fargate oder vergleichbarer isolierter Runtime meist sauberer
- getrennte Worker-Pools für Search, Listing, Refresh und Reprocessing vermeiden Engpässe

**Operative Regeln**
- Concurrency-Limits pro Worker-Typ festlegen
- Backpressure bei Queue-Spitzen aktiv erzwingen
- Materialized Views / Aggregate Tables in ClickHouse früh mitdenken

## Daten
- Managed PostgreSQL
- ClickHouse Cloud
- Managed Redis/Valkey
- S3-kompatibler Object Storage

## Warum managed?
Weil du in v1 deine Energie auf Datenqualität und Produktlogik richten solltest, nicht auf unnötigen Infra-Betrieb.

---

## 10) Was bewusst nicht in v1 gehört

Nicht priorisieren:
- Browser Extension
- generative AI-Features als Kernfunktion
- Team-/Seat-Management
- komplexe Alerting-Workflows
- Vollabdeckung aller Etsy-Kategorien
- aggressives Full-Market Crawling

v1 soll erst beweisen:
- dass die Daten stabil sind
- dass Scores nützlich sind
- dass Nutzer bessere Produktentscheidungen treffen können

---

## 11) Beste Architekturentscheidung für dieses Projekt

Wenn du nur **eine** Sache richtig machst, dann diese:

## **Baue die Datenpipeline snapshot-first und validator-first.**

Das heißt:
- erst Rohdaten sauber speichern
- dann extrahieren
- dann validieren
- erst danach scorieren und anzeigen

Genau das trennt ein belastbares Produkt von einer fragilen Scraper-Bastellösung.

---

## 12) Kurzfazit

Die beste Architektur für dein Etsy-Research-Produkt ist:
- **UI:** Next.js 15 + React 19
- **Backend:** NestJS + Fastify
- **OLTP:** PostgreSQL 18
- **Analytics:** ClickHouse Cloud
- **Workflows:** Temporal Cloud
- **Jobs:** BullMQ + Valkey/Redis
- **Collection:** Playwright + mehrstufige Extractors
- **Qualität:** Snapshotting, Validation, Confidence Scores, Drift Detection
- **Observability:** OTel + Grafana + Sentry

Damit bekommst du ein System, das nicht nur „irgendwie Daten zieht“, sondern langfristig als **hochwertige Opportunity-Intelligence-Plattform** tragfähig ist.
