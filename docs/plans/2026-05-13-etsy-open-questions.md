# Etsy v1 – Offene Fragen, Default-Entscheidungen und Entscheidungsbedarf

**Ziel:** Offene Architektur- und Produktfragen für v1 explizit machen, dabei sinnvolle Defaults festhalten, damit die Umsetzung morgen starten kann, ohne unmarkierte Lücken zu hinterlassen.

**Baut auf:** `/root/docs/plans/2026-05-13-etsy-systemarchitektur.md`

---

## 1) Entscheidungslogik für dieses Dokument

Jede Frage ist einem der folgenden Typen zugeordnet:

- **Default für v1 gesetzt** – Umsetzung kann sofort starten
- **Vor Go-Live entscheiden** – Beta-Entwicklung darf starten, Produktivbetrieb nicht
- **Vor Implementierung entscheiden** – beeinflusst zentrale Contracts oder Scope so stark, dass zuerst ein Beschluss nötig ist

---

## 2) Bereits gesetzte Defaults für v1

Diese Entscheidungen gelten in allen begleitenden Artefakten als verbindlich, solange der Benutzer sie nicht explizit ändert.

### Produkt-/Scope-Defaults

1. **Pflicht-Flows:** Keyword-Analyse und Listing-Analyse
2. **Locale v1:** `en-US`
3. **Search-Tiefe:** erste Search-Results-Seite
4. **Detailtiefe je Keyword:** Top 24 Listings
5. **Ergebnisbereitstellung:** Polling statt Push
6. **Nicht in v1:** Browser Extension, GenAI-Core-Features, Vollmarkt-Crawl, komplexe Teamfeatures

### Technik-Defaults

7. **Monorepo-Struktur:** `apps/*` + `packages/*` wie im Build Plan beschrieben
8. **API-Stil:** REST/JSON unter `/v1`
9. **Workflow-Orchestrierung:** Temporal für Kernflows, BullMQ für Fan-out/Side-Jobs
10. **Storage-Split:** Postgres = kuratierte Zustände, ClickHouse = Snapshots/Trends, Object Storage = Raw-Artefakte
11. **Money-Format:** `amount_minor` + `currency_code`
12. **URL-Kanonisierung:** `https`, lowercase host, Tracking-Parameter weg, `source_url` separat behalten
13. **Observed vs estimated:** immer trennen oder explizit markieren
14. **Scoring v1:** `Demand 35 / Competition 25 / Momentum 25 / Commercial viability 15`
15. **Staleness v1:** Keyword- und Listing-Ergebnisse standardmäßig nach 24h `stale`

### Betriebs-Defaults

16. **Collector-Priorität:** Listing-Pfad zuerst stabilisieren, dann Search-Pfad
17. **Collector-Laufzeitbudgets:** konservativ, kein aggressives Full-Market-Crawling
18. **Raw-Storage-Zugriff:** nur intern/QA/Ops
19. **Canary-Crawls:** täglich für definierte Keywords
20. **Retention grob:** HTML 30–90 Tage, Screenshots 30 Tage, Drift-/Fehlerfälle länger

---

## 3) Offene Fragen, die **vor Implementierung** entschieden werden sollten

## 3.1 Repository- und Tooling-Basis

### Frage
Soll das Projekt tatsächlich als neues Monorepo unter `/root/projects/etsy-opportunity-intelligence` starten, oder existiert bereits ein Zielrepo mit anderen Konventionen?

**Warum wichtig:**
Fast alle Pfade im Build Plan basieren auf dieser Annahme.

**Aktueller Default:** neues pnpm/Turbo-Monorepo.

**Auswirkung bei Änderung:**
hoch – betrifft Build Plan, Delegationssplits und alle vorgeschlagenen Dateipfade.

---

### Frage
Soll in `packages/db` Prisma oder Drizzle als primäre Postgres-Zugriffsschicht verwendet werden?

**Warum wichtig:**
Migrationsstil, Repository-Struktur und Testaufbau unterscheiden sich stark.

**Aktueller Default:** offen, aber **eine** Entscheidung vor DB-Implementierung nötig.

**Empfehlung:**
- Prisma, wenn schnell produktiv und teamfreundlich priorisiert wird
- Drizzle, wenn SQL-Nähe und feinere Migrationskontrolle bevorzugt werden

**Auswirkung bei Änderung:**
mittel bis hoch.

---

## 3.2 Contract- und ID-Basis

### Frage
Sollen interne IDs UUID v4, UUID v7 oder ULIDs sein?

**Warum wichtig:**
wirkt sich auf DB-Schema, Log-Korrelation und Sortierbarkeit aus.

**Aktueller Default:** UUID allgemein; konkrete Variante noch offen.

**Empfehlung:** UUID v7 oder ULID, wenn zeitliche Sortierbarkeit gewünscht ist.

**Auswirkung bei Änderung:**
mittel.

---

### Frage
Wie strikt ist das Dedupe-Fenster für doppelte User-Analysen?

**Warum wichtig:**
beeinflusst API-Idempotenz und Nutzererwartung.

**Aktueller Default:** 15 Minuten aktive Dedupe-Periode.

**Auswirkung bei Änderung:**
mittel.

---

## 3.3 Search-Scope

### Frage
Bleibt v1 wirklich bei **einer** Search-Seite und Top 24 Listings, oder sollen 2–3 Seiten unterstützt werden?

**Warum wichtig:**
beeinflusst Collector-Budget, Workflow-Laufzeit, Score-Basis und ClickHouse-Volumen.

**Aktueller Default:** eine Seite, Top 24 Listings.

**Empfehlung:** nicht erweitern, bevor Listing- und Search-Pfad stabil sind.

**Auswirkung bei Änderung:**
hoch.

---

### Frage
Wie werden Sponsored/Ad-Listings im Ranking behandelt?

**Warum wichtig:**
Competition-, Rank- und Opportunity-Metriken verändern sich deutlich.

**Aktueller Default:** Ads werden separat markiert (`ad_flag`), aber in der Impression-Historie mitgeführt.

**Noch zu entscheiden:**
- ob Ads im primären Opportunity-Ranking standardmäßig ausgeblendet werden
- ob Aggregationen organisch und paid getrennt berechnet werden

**Auswirkung bei Änderung:**
hoch auf Analytics/Scoring.

---

## 3.4 Shop-Scope

### Frage
Ist Shop-Analyse in v1 nur ein Hilfsobjekt für Listing-/Keyword-Kontext oder ein späterer User-Flow?

**Warum wichtig:**
beeinflusst UI, API und Priorisierung des Shop-Collectors.

**Aktueller Default:** Shop ist Hilfsentität, kein primärer User-Flow.

**Auswirkung bei Änderung:**
mittel bis hoch.

---

## 4) Offene Fragen, die **vor Go-Live** entschieden werden müssen

## 4.1 Legal / ToS / Risk Management

### Frage
Wie wird das ToS-/Legal-Risiko operativ bewertet, dokumentiert und regelmäßig überprüft?

**Warum wichtig:**
Die Systemarchitektur nennt das explizit als laufende Produktannahme, nicht als Fußnote.

**Aktueller Default:** konservative Collection-Strategie und geringe Abdeckung.

**Vor Go-Live nötig:**
- benannter Owner
- Review-Rhythmus
- Eskalationspfad bei Block-/Legal-Signalen

---

### Frage
Welche Rollen dürfen HTML, Screenshots und Parser-Rohblobs sehen?

**Warum wichtig:**
Raw Storage ist sensibler als kuratierte Produktmetriken.

**Aktueller Default:** nur interne QA/Ops-Pfade.

**Vor Go-Live nötig:**
- Rollenmodell
- Audit-Logging
- Zugriffspfad-Dokumentation

---

### Frage
Wie lautet die verbindliche Retention für HTML, Screenshots, Logs und Raw-Blobs?

**Warum wichtig:**
Kosten, Compliance und Reprocessing hängen direkt davon ab.

**Aktueller Default:**
- HTML 30–90 Tage
- Screenshots 30 Tage
- Fehler-/Driftfälle länger

**Vor Go-Live nötig:**
- konkrete Zahlen je Artefakttyp
- Löschprozess
- Reprocessing-Fenster

---

## 4.2 Kosten und Kapazitäten

### Frage
Welche harte Kostenobergrenze gilt für Playwright-Worker, Proxies, ClickHouse und Storage in v1?

**Warum wichtig:**
Ohne Budgetgrenzen werden Refresh-Scheduler und Search-Tiefe blind dimensioniert.

**Aktueller Default:** konservativ, aber ohne konkrete Zahl.

**Vor Go-Live nötig:**
- monatliches Zielbudget
- Maximalgrenzen pro Dienstklasse

---

### Frage
Welche gleichzeitige Analysekapazität muss v1 tragen?

**Warum wichtig:**
bestimmt Worker-Pools, Queue-Concurrency und SLA-Erwartungen.

**Aktueller Default:** noch offen.

**Empfehlung:** Beta zunächst auf niedrige zweistellige parallele Jobs dimensionieren.

---

## 4.3 Produktkommunikation

### Frage
Welche Begriffe dürfen im UI benutzt werden, um Unsicherheit korrekt auszudrücken?

**Warum wichtig:**
Architektur fordert klar: „geschätzt“, „Signal“, „Proxy“, „Confidence“ statt falscher Sicherheit.

**Aktueller Default:** diese Begriffe sollen verbindlich verwendet werden.

**Vor Go-Live nötig:**
- Copy-/Terminologie-Freigabe
- verbotene Formulierungen definieren (z. B. exakte Umsatzbehauptungen)

---

## 5) Offene Fragen, die während der Umsetzung geklärt werden können

## 5.1 Daten- und Signalqualität

### Frage
Wie stabil und vollständig ist `favorite_count` praktisch auf Etsy-Seiten für v1?

**Aktueller Default:** nicht als harte Pflichtvoraussetzung behandeln; bei Fehlen `partial` + Confidence-Abschlag.

**Was zu testen ist:**
- Sichtbarkeit pro Seitentyp/Locale
- Varianz zwischen HTML, JS, eingebetteten Daten

---

### Frage
Wie belastbar ist `total_results_estimate` auf Search-Seiten?

**Aktueller Default:** als Proxy behandeln, nie als exakte Marktgröße.

**Folge:**
- in API/UI als estimate labeln
- nicht alleinige Basis für Opportunity-Score

---

### Frage
Welche Shop-Signale sind stabil genug: Rating, Review Count, Admirers, Sales-Proxy?

**Aktueller Default:** Rating/Review höher priorisieren als Sales-Proxy.

---

### Frage
Welche Felder sind bei Listing-Varianten oder digitalen Produkten inkonsistent?

**Aktueller Default:** `is_digital`, `processing_days`, Variantenpreise als optionale Zusatzsignale behandeln.

---

## 5.2 Score-Design

### Frage
Welche Minimaldatenbasis ist nötig, bevor überhaupt ein Opportunity-Score angezeigt werden darf?

**Aktueller Default:**
- für Listing: Titel + Preis + Shop-Bezug + verwertbarer Snapshot
- für Keyword: valider Search Snapshot + mindestens 60 % verwertbare Listing-Details

**Noch zu verifizieren:**
ob 60 % für Beta fachlich ausreichend ist.

---

### Frage
Wie wird Momentum behandelt, solange noch wenig Historie vorliegt?

**Aktueller Default:**
- geringer Confidence
- `insufficient_history` als interner Hinweis oder Warning
- Momentum nicht künstlich überbewerten

---

### Frage
Sollen Competition-Scores primär keyword-zentriert, listing-zentriert oder hybrid sein?

**Aktueller Default:**
- Keyword-Analyse: keyword-/SERP-zentriert
- Listing-Analyse: Markt-/Nischenkontext aus zugeordneten Search- und Trend-Signalen

---

## 5.3 UI / UX

### Frage
Wie prominent sollen Warnings und Confidence im UI sein?

**Aktueller Default:** sichtbar auf der Hauptebene, nicht in einem versteckten Tooltip allein.

---

### Frage
Soll die Admin-/QA-Oberfläche von Anfang an separate App (`apps/admin`) sein oder initial ein geschützter Bereich in `apps/web`?

**Aktueller Default:** separate App, weil Rollen, interne Daten und Raw-Verweise anders sind.

**Falls Zeitdruck:** geschützter Interimsbereich in `apps/web` wäre ein pragmatischer Fallback.

---

## 6) Empfohlene Entscheidungsreihenfolge

## Vor dem ersten großen Implementierungstag entscheiden

1. Zielrepo und Monorepo-Setup bestätigen
2. ORM/DB-Toolkit festlegen
3. interne ID-Variante festlegen
4. Search-Scope (1 Seite / Top 24) bestätigen
5. Shop als Hilfsobjekt vs. eigener User-Flow bestätigen

## Vor Beta-Deployment entscheiden

6. Budgetgrenzen
7. Raw-Storage-Retention konkret
8. Rollen-/Zugriffsmodell für Rohartefakte
9. Legal-/ToS-Review-Prozess
10. UI-Terminologie und verbotene Claims freigeben

## Während der Umsetzung datengetrieben klären

11. Favorite Count Stabilität
12. Search results estimate Qualität
13. Shop-Signal-Zuverlässigkeit
14. Momentum-Mindesthistorie
15. sinnvolle Partial-Schwellen pro Analyseart

---

## 7) Entscheidungsstatus-Tabelle

| Thema | Status | Default gesetzt? | Vor Implementierung nötig? | Vor Go-Live nötig? |
|---|---|---:|---:|---:|
| Monorepo-Zielpfad | offen | ja | ja | nein |
| Prisma vs Drizzle | offen | nein | ja | nein |
| interne ID-Variante | offen | teilweise | ja | nein |
| Search-Scope | offen | ja | ja | nein |
| Shop als User-Flow | offen | ja | ja | nein |
| Budgetgrenzen | offen | nein | nein | ja |
| Raw-Storage-Retention | offen | teilweise | nein | ja |
| Raw-Storage-Rollenmodell | offen | teilweise | nein | ja |
| Legal-/ToS-Prozess | offen | teilweise | nein | ja |
| Favorite Count Stabilität | offen | ja | nein | nein |
| Momentum bei wenig Historie | offen | ja | nein | nein |
| UI-Terminologie | offen | teilweise | nein | ja |

---

## 8) Empfehlung für morgen

Trotz offener Punkte kann morgen **sofort** gestartet werden, wenn diese Defaults akzeptiert werden:

- neues Monorepo
- `en-US`
- Search erste Seite
- Top 24 Listings
- Temporal + BullMQ wie beschrieben
- Postgres + ClickHouse + Object Storage Split
- Listing-Pfad zuerst
- Confidence/Warnings als Pflichtbestandteil jeder Analyseantwort

Nur drei Punkte sollten idealerweise **vor dem ersten Code** einmal kurz bestätigt werden:

1. Zielrepo / Monorepo-Startpunkt
2. Prisma oder Drizzle
3. ob Search-Scope bei 1 Seite / Top 24 bleibt

---

## 9) Kurzfazit

Die Architektur ist belastbar genug, um morgen mit der Umsetzung zu starten. Die wichtigsten offenen Fragen blockieren **nicht** das gesamte Vorhaben, solange die hier gesetzten Defaults bewusst als v1-Entscheidungen akzeptiert werden.

Der größte Fehler wäre jetzt nicht fehlende Perfektion, sondern **stillschweigende Unklarheit**. Dieses Dokument macht die verbleibenden Unsicherheiten explizit und reduziert damit Delegations- und Implementierungsrisiko.