import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_LOCALE,
  type AnalysisDetailResponse,
  type AnalysisDto,
  type AnalysisStatus,
  type CaptureJobDto,
  type CaptureJobStatus,
  type CaptureReason,
  type CreateAnalysisResponse,
  type KeywordResultSummary,
  type ListingResultSummary,
  type Priority,
  type RefreshPolicy
} from "@etsy-oi/shared-types";
import "./styles.css";

type AnalysisResult = KeywordResultSummary | ListingResultSummary;

type AnalysisDetail = AnalysisDetailResponse;

type AnalysisListResponse = {
  items: AnalysisDto[];
  next_cursor: string | null;
  filters: unknown;
};

type Flow = "keyword" | "listing";
type DashboardFilter = "all" | Flow;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
const terminalStatuses: AnalysisStatus[] = ["completed", "partial", "failed", "stale", "refreshed", "cancelled"];
const pollingTerminalStatuses: AnalysisStatus[] = ["completed", "failed", "stale", "refreshed", "cancelled"];
const statePreview: AnalysisStatus[] = ["queued", "running", "partial", "completed", "failed", "stale"];

function statusCopy(status: AnalysisStatus): { label: string; tone: string; detail: string } {
  const map: Record<AnalysisStatus, { label: string; tone: string; detail: string }> = {
    queued: { label: "In Warteschlange", tone: "neutral", detail: "Analyse angenommen und wartet auf die Erfassung." },
    running: { label: "Läuft", tone: "active", detail: "Collector und Parser bauen gerade den Snapshot auf." },
    partial: { label: "Teilweise", tone: "warning", detail: "Genug Daten für einen Score, aber mit reduzierter Sicherheit." },
    completed: { label: "Abgeschlossen", tone: "success", detail: "Read-Model und Score sind bereit." },
    failed: { label: "Fehlgeschlagen", tone: "danger", detail: "Die Analyse ist mit einem terminalen Fehler beendet worden." },
    stale: { label: "Veraltet", tone: "warning", detail: "Das Ergebnis ist älter als das aktuelle Frischefenster." },
    refreshed: { label: "Aktualisiert", tone: "success", detail: "Eine neuere verknüpfte Analyse hat das vorherige Ergebnis ersetzt." },
    cancelled: { label: "Abgebrochen", tone: "neutral", detail: "Die Analyse wurde vor dem Abschluss abgebrochen." },
    blocked: { label: "Blockiert", tone: "danger", detail: "Die Erfassung wurde blockiert und braucht eine Prüfung." },
    validation_failed: { label: "Validierung fehlgeschlagen", tone: "danger", detail: "Die geparsten Daten haben die v1-Qualitätsregeln nicht bestanden." }
  };
  return map[status];
}

function captureJobStatusCopy(status: CaptureJobStatus): { label: string; tone: string } {
  const map: Record<CaptureJobStatus, { label: string; tone: string }> = {
    queued: { label: "In Warteschlange", tone: "neutral" },
    running: { label: "Läuft", tone: "active" },
    completed: { label: "Fertig", tone: "success" },
    partial: { label: "Teilweise", tone: "warning" },
    failed: { label: "Fehlgeschlagen", tone: "danger" },
    blocked: { label: "Blockiert", tone: "danger" },
    validation_failed: { label: "Validierung fehlgeschlagen", tone: "danger" }
  };

  return map[status];
}

function captureReasonLabel(reason: CaptureReason): string {
  const map: Record<CaptureReason, string> = {
    initial: "Erstlauf",
    refresh: "Aktualisierung",
    debug: "Debuglauf",
    canary: "Canary-Lauf",
    rebuild: "Neuaufbau",
    keyword_analysis: "Keyword-Analyse"
  };

  return map[reason];
}

function analysisTypeLabel(type: AnalysisDto["type"]): string {
  return type === "keyword" ? "Keyword-Analyse" : "Listing-Analyse";
}

function analysisTimestamp(value: string): string {
  return new Date(value).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Anfrage fehlgeschlagen (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

function App() {
  const [flow, setFlow] = useState<Flow>("keyword");
  const [analysisId, setAnalysisId] = useState<string | null>(() => {
    const match = window.location.pathname.match(/\/analyses\/([^/]+)/);
    return match?.[1] ?? null;
  });

  function openAnalysis(id: string) {
    window.history.pushState(null, "", `/analyses/${id}`);
    setAnalysisId(id);
  }

  function goHome(nextFlow: Flow = flow) {
    window.history.pushState(null, "", "/");
    setFlow(nextFlow);
    setAnalysisId(null);
  }

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => goHome()} aria-label="Zum Dashboard wechseln">
          <span className="brandMark">OI</span>
          <span>
            <strong>Etsy Opportunity Intelligence</strong>
            <small>MVP-v1-Arbeitsbereich</small>
          </span>
        </button>
        <nav className="topActions" aria-label="Hauptnavigation">
          <button onClick={() => goHome("keyword")}>Suchbegriffe</button>
          <button onClick={() => goHome("listing")}>Listings</button>
        </nav>
      </header>

      {analysisId ? (
        <AnalysisView id={analysisId} onBack={() => goHome()} />
      ) : (
        <Dashboard flow={flow} setFlow={setFlow} onCreated={openAnalysis} />
      )}
    </main>
  );
}

function Dashboard({
  flow,
  setFlow,
  onCreated
}: {
  flow: Flow;
  setFlow: (flow: Flow) => void;
  onCreated: (id: string) => void;
}) {
  const [items, setItems] = useState<AnalysisDto[]>([]);
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRecentAnalyses() {
      try {
        setLoading(true);
        const response = await apiFetch<AnalysisListResponse>("/v1/analyses");
        if (cancelled) return;
        setItems(response.items);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Die letzten Analysen konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRecentAnalyses();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = items.filter((item) => filter === "all" || item.type === filter);

  return (
    <div className="shell">
      <section className="intro">
        <div>
          <p className="eyebrow">Beta-Analysekonsole</p>
          <h1>Starte eine fokussierte Etsy-Chancenanalyse.</h1>
          <p>
            Der MVP unterstützt die zwei v1-Nutzerpfade: Keyword-Marktanalyse und Listing-Analyse. Beide nutzen die
            REST-Verträge unter <code>/v1</code>.
          </p>
        </div>
        <div className="healthCard" aria-label="MVP-Umfang">
          <strong>MVP-Umfang</strong>
          <span>Deutsche Oberfläche</span>
          <span>Top-24-Listing-Stichprobe</span>
          <span>opportunity_v1-Score</span>
        </div>
      </section>

      <section className="workbench">
        <div className="tabs" role="tablist" aria-label="Analysetyp">
          <button className={flow === "keyword" ? "selected" : ""} onClick={() => setFlow("keyword")} role="tab">
            Suchbegriff-Analyse
          </button>
          <button className={flow === "listing" ? "selected" : ""} onClick={() => setFlow("listing")} role="tab">
            Listing-Analyse
          </button>
        </div>
        {flow === "keyword" ? <KeywordForm onCreated={onCreated} /> : <ListingForm onCreated={onCreated} />}
      </section>

      <section className="recentAnalyses" aria-label="Letzte Analysen">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Verlauf</p>
            <h2>Letzte Analysen</h2>
          </div>
          <div className="filterChips" role="toolbar" aria-label="Filter für letzte Analysen">
            <button className={filter === "all" ? "selectedChip" : ""} onClick={() => setFilter("all")} type="button">
              Alle
            </button>
            <button className={filter === "keyword" ? "selectedChip" : ""} onClick={() => setFilter("keyword")} type="button">
              Nur Keyword
            </button>
            <button className={filter === "listing" ? "selectedChip" : ""} onClick={() => setFilter("listing")} type="button">
              Nur Listing
            </button>
          </div>
        </div>

        {loading ? <div className="loadingPanel compact">Letzte Analysen werden geladen...</div> : null}
        {error ? <div className="alert danger compact">{error}</div> : null}
        {!loading && !error ? (
          filteredItems.length ? (
            <div className="recentAnalysisList">
              {filteredItems.slice(0, 8).map((analysis) => {
                const copy = statusCopy(analysis.status);
                return (
                  <a
                    key={analysis.id}
                    className="recentAnalysisCard"
                    href={`/analyses/${analysis.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      onCreated(analysis.id);
                    }}
                  >
                    <div>
                      <strong>{analysisTypeLabel(analysis.type)}</strong>
                      <span>{analysis.id}</span>
                    </div>
                    <div>
                      <b className={copy.tone}>{copy.label}</b>
                      <span>{analysisTimestamp(analysis.created_at)}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="loadingPanel compact">Für diesen Filter gibt es noch keine Analysen.</div>
          )
        ) : null}
      </section>

      <section className="stateGrid" aria-label="Statusvorschau der Analyse">
        {statePreview.map((status) => (
          <StatusTile key={status} status={status} />
        ))}
      </section>
    </div>
  );
}

function KeywordForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [term, setTerm] = useState("mid century wandkunst");
  const [categoryHint, setCategoryHint] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [refreshPolicy, setRefreshPolicy] = useState<RefreshPolicy>("if_stale");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await apiFetch<CreateAnalysisResponse>("/v1/analyses/keyword", {
        method: "POST",
        body: JSON.stringify({
          term,
          locale: DEFAULT_LOCALE,
          category_hint: categoryHint.trim() ? categoryHint.trim() : null,
          priority,
          refresh_policy: refreshPolicy
        })
      });
      onCreated(response.analysis.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Die Suchbegriff-Analyse konnte nicht gestartet werden.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="analysisForm" onSubmit={submit}>
      <label>
        Suchbegriff
        <input value={term} minLength={2} maxLength={120} onChange={(event) => setTerm(event.target.value)} />
      </label>
      <label>
        Kategorie-Hinweis
        <input placeholder="Optional" value={categoryHint} onChange={(event) => setCategoryHint(event.target.value)} />
      </label>
      <FormOptions
        priority={priority}
        refreshPolicy={refreshPolicy}
        onPriority={setPriority}
        onRefreshPolicy={setRefreshPolicy}
      />
      {error ? <p className="formError">{error}</p> : null}
      <button className="primaryButton" type="submit" disabled={submitting}>
        {submitting ? "Wird gestartet..." : "Suchbegriff-Analyse starten"}
      </button>
    </form>
  );
}

function ListingForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [listingUrl, setListingUrl] = useState("https://www.etsy.com/listing/1234567890/example");
  const [priority, setPriority] = useState<Priority>("normal");
  const [refreshPolicy, setRefreshPolicy] = useState<RefreshPolicy>("if_stale");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await apiFetch<CreateAnalysisResponse>("/v1/analyses/listing", {
        method: "POST",
        body: JSON.stringify({
          listing_url: listingUrl,
          priority,
          refresh_policy: refreshPolicy
        })
      });
      onCreated(response.analysis.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Die Listing-Analyse konnte nicht gestartet werden.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="analysisForm" onSubmit={submit}>
      <label>
        Etsy-Listing-URL
        <input value={listingUrl} onChange={(event) => setListingUrl(event.target.value)} />
      </label>
      <FormOptions
        priority={priority}
        refreshPolicy={refreshPolicy}
        onPriority={setPriority}
        onRefreshPolicy={setRefreshPolicy}
      />
      {error ? <p className="formError">{error}</p> : null}
      <button className="primaryButton" type="submit" disabled={submitting}>
        {submitting ? "Wird gestartet..." : "Listing-Analyse starten"}
      </button>
    </form>
  );
}

function FormOptions({
  priority,
  refreshPolicy,
  onPriority,
  onRefreshPolicy
}: {
  priority: Priority;
  refreshPolicy: RefreshPolicy;
  onPriority: (priority: Priority) => void;
  onRefreshPolicy: (policy: RefreshPolicy) => void;
}) {
  return (
    <div className="optionGrid">
      <label>
        Priorität
        <select value={priority} onChange={(event) => onPriority(event.target.value as Priority)}>
          <option value="low">Niedrig</option>
          <option value="normal">Normal</option>
          <option value="high">Hoch</option>
        </select>
      </label>
      <label>
        Aktualisierungsregel
        <select value={refreshPolicy} onChange={(event) => onRefreshPolicy(event.target.value as RefreshPolicy)}>
          <option value="never">Nie</option>
          <option value="if_stale">Nur wenn veraltet</option>
          <option value="force">Erzwingen</option>
        </select>
      </label>
    </div>
  );
}

function AnalysisView({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<AnalysisDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function load() {
      try {
        const next = await apiFetch<AnalysisDetail>(`/v1/analyses/${id}`);
        if (cancelled) return;
        setDetail(next);
        setError(null);
        if (!pollingTerminalStatuses.includes(next.analysis.status)) {
          timer = window.setTimeout(load, 750);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Die Analyse konnte nicht geladen werden.");
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [id]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await apiFetch<CreateAnalysisResponse & { refresh_of_analysis_id: string }>(
        `/v1/analyses/${id}/refresh`,
        {
          method: "POST",
          body: JSON.stringify({ reason: "user_requested", priority: "high" })
        }
      );
      window.history.pushState(null, "", `/analyses/${response.analysis.id}`);
      window.location.assign(`/analyses/${response.analysis.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Die Aktualisierung konnte nicht gestartet werden.");
      setRefreshing(false);
    }
  }

  const status = detail?.analysis.status ?? "queued";

  return (
    <div className="shell">
      <button className="backButton" onClick={onBack}>
        Zurück zu den Analyseformularen
      </button>
      {error ? <div className="alert danger">{error}</div> : null}
      {detail ? (
        <>
          <StatusPanel analysis={detail.analysis} />
          <WorkflowPanel jobs={detail.workflow.capture_jobs} />
          {detail.result ? <ResultPanel result={detail.result} /> : <EmptyResult status={status} />}
          <div className="resultActions">
            <button className="secondaryButton" onClick={refresh} disabled={refreshing}>
              {refreshing ? "Aktualisierung startet..." : "Ergebnis aktualisieren"}
            </button>
          </div>
        </>
      ) : (
        <div className="loadingPanel">Analyse wird geladen...</div>
      )}
    </div>
  );
}

function StatusPanel({ analysis }: { analysis: AnalysisDto }) {
  const copy = statusCopy(analysis.status);
  const percent = analysis.progress?.percent ?? (terminalStatuses.includes(analysis.status) ? 100 : 0);

  return (
    <section className={`statusPanel ${copy.tone}`} aria-label="Analyse-Status">
      <div>
        <p className="eyebrow">Analyse {analysis.id}</p>
        <h2>{copy.label}</h2>
        <p>{copy.detail}</p>
      </div>
      <div className="progressBlock">
        <span>{percent}%</span>
        <div className="progressTrack">
          <div style={{ width: `${percent}%` }} />
        </div>
        <small>{analysis.progress?.phase ?? "abgeschlossen"}</small>
      </div>
    </section>
  );
}

function EmptyResult({ status }: { status: AnalysisStatus }) {
  if (status === "failed") {
    return <div className="alert danger">Es wurde kein Ergebnis erzeugt. Bitte Fehlercode prüfen und danach erneut versuchen.</div>;
  }

  return <div className="loadingPanel">Die Ergebnisansicht erscheint, sobald das Read-Model verfügbar ist.</div>;
}

function WorkflowPanel({ jobs }: { jobs: CaptureJobDto[] }) {
  return (
    <section className="workflowPanel" aria-label="Capture-Jobs">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Workflow</p>
          <h2>Capture-Jobs</h2>
        </div>
      </div>

      {jobs.length ? (
        <div className="workflowGrid">
          {jobs.map((job) => {
            const status = captureJobStatusCopy(job.status);
            return (
              <article key={job.id} className="workflowCard">
                <div className="workflowCardHeader">
                  <strong>{captureReasonLabel(job.capture_reason)}</strong>
                  <b className={status.tone}>{status.label}</b>
                </div>
                <div className="workflowMeta">
                  <span>Warteschlange: {job.worker_queue}</span>
                  <span>Jobtyp: {job.job_type}</span>
                  <span>Ziel: {job.target_ref}</span>
                  <span>Angelegt: {analysisTimestamp(job.created_at)}</span>
                </div>
                <a href={job.source_url} target="_blank" rel="noreferrer">
                  Quelle öffnen
                </a>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="loadingPanel compact">Für diese Analyse wurden noch keine Capture-Jobs angelegt.</div>
      )}
    </section>
  );
}

function ResultPanel({ result }: { result: AnalysisResult }) {
  return (
    <section className="resultLayout" aria-label="Analyseergebnis">
      <ScoreCard result={result} />
      {result.type === "keyword" ? <KeywordResult result={result} /> : <ListingResult result={result} />}
    </section>
  );
}

function ScoreCard({ result }: { result: AnalysisResult }) {
  const scores = [
    ["Chance", result.scores.opportunity_score],
    ["Nachfrage", result.scores.demand_score],
    ["Wettbewerb", result.scores.competition_score],
    ["Dynamik", result.scores.momentum_score],
    ["Sicherheit", result.scores.confidence_score]
  ] as const;

  return (
    <aside className="scoreCard">
      <p className="eyebrow">{result.scores.score_version}</p>
      <strong>{result.scores.opportunity_score}</strong>
      <span>Chancen-Score</span>
      <div className="scoreRows">
        {scores.slice(1).map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <meter min="0" max="100" value={value} />
            <b>{value}</b>
          </div>
        ))}
      </div>
      {result.warnings.length ? (
        <div className="warnings">
          {result.warnings.map((warning) => (
            <p key={warning.code}>{warning.message}</p>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function KeywordResult({ result }: { result: KeywordResultSummary }) {
  return (
    <div className="detailsPanel">
      <h2>{result.keyword.term}</h2>
      <div className="metricGrid">
        <Metric label="Ergebnisse" value={formatNumber(result.market_summary.total_results_estimate)} />
        <Metric label="Stichprobe" value={String(result.market_summary.sampled_listing_count)} />
        <Metric label="Medianpreis" value={result.market_summary.median_price?.amount ?? "k. A."} />
        <Metric label="Anzeigenanteil" value={formatPercent(result.market_summary.ads_share)} />
      </div>
      <ExplanationList items={result.explanations} />
      <h3>Top-Listings</h3>
      <div className="listingTable">
        {result.top_listings.map((listing, index) => (
          <div key={String(listing.listing_id ?? index)} className="listingRow">
            <b>#{String(listing.rank_position)}</b>
            <span>{String(listing.title)}</span>
            <small>{String((listing.price as { amount?: string } | undefined)?.amount ?? "k. A.")}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListingResult({ result }: { result: ListingResultSummary }) {
  const snapshot = result.snapshot as {
    captured_at?: string;
    price?: { amount?: string; currency?: string };
    review_count?: number;
    average_rating?: number;
    favorite_count?: number | null;
    image_count?: number;
    validator_status?: string;
    tags?: string[];
  };

  return (
    <div className="detailsPanel">
      <h2>{result.listing.title}</h2>
      <a href={result.listing.url} target="_blank" rel="noreferrer">
        Etsy-Listing öffnen
      </a>
      <div className="metricGrid">
        <Metric label="Preis" value={snapshot.price?.amount ?? "k. A."} />
        <Metric label="Bewertungen" value={formatNumber(snapshot.review_count ?? null)} />
        <Metric label="Sterne" value={snapshot.average_rating ? snapshot.average_rating.toFixed(1) : "k. A."} />
        <Metric label="Bilder" value={String(snapshot.image_count ?? "k. A.")} />
      </div>
      <ExplanationList items={result.explanations} />
      <div className="tagList">
        {(snapshot.tags ?? []).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

function ExplanationList({ items }: { items: string[] }) {
  return (
    <div className="explanations">
      <h3>Warum dieser Score?</h3>
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusTile({ status }: { status: AnalysisStatus }) {
  const copy = statusCopy(status);
  return (
    <div className={`statusTile ${copy.tone}`}>
      <b>{copy.label}</b>
      <span>{copy.detail}</span>
    </div>
  );
}

function formatNumber(value: number | null | undefined) {
  return value == null ? "k. A." : new Intl.NumberFormat("de-DE").format(value);
}

function formatPercent(value: number | null | undefined) {
  return value == null ? "k. A." : `${Math.round(value * 100)}%`;
}

createRoot(document.getElementById("root")!).render(<App />);
