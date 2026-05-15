import React, { FormEvent, useEffect, useMemo, useState } from "react";
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
type RuntimeStatus = {
  status: "ready" | "degraded";
  dependencies: Record<string, string>;
  capture?: {
    mode?: "fixture" | "live";
    live_capture_enabled?: boolean;
    raw_storage_bucket?: string;
    worker_queue_default?: string;
    supported_capture_modes?: string[];
  };
};
type Flow = "keyword" | "listing";
type DashboardFilter = "all" | Flow;
type ResultCaptureMeta = {
  mode?: string;
  finalUrl?: string;
  blocked?: boolean;
  capturedAt?: string | null;
  validatorStatus?: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
const terminalStatuses: AnalysisStatus[] = ["completed", "partial", "failed", "stale", "refreshed", "cancelled", "blocked", "validation_failed"];
const pollingTerminalStatuses: AnalysisStatus[] = ["completed", "failed", "stale", "refreshed", "cancelled", "blocked", "validation_failed"];
const statePreview: AnalysisStatus[] = ["queued", "running", "partial", "completed", "blocked", "validation_failed"];

function statusCopy(status: AnalysisStatus): { label: string; tone: string; detail: string } {
  const map: Record<AnalysisStatus, { label: string; tone: string; detail: string }> = {
    queued: { label: "In Warteschlange", tone: "neutral", detail: "Analyse angenommen und wartet auf die Erfassung." },
    running: { label: "Läuft", tone: "active", detail: "Collector, Parser und Scoring arbeiten am aktuellen Lauf." },
    partial: { label: "Teilweise", tone: "warning", detail: "Es gibt genug Daten für einen Score, aber nicht alles ist vollständig belastbar." },
    completed: { label: "Abgeschlossen", tone: "success", detail: "Read-Model, Score und Workflow-Daten sind bereit." },
    failed: { label: "Fehlgeschlagen", tone: "danger", detail: "Der Lauf ist mit einem terminalen Fehler beendet worden." },
    stale: { label: "Veraltet", tone: "warning", detail: "Das Ergebnis ist älter als das aktuelle Frischefenster." },
    refreshed: { label: "Aktualisiert", tone: "success", detail: "Ein neuerer Lauf hat dieses Ergebnis ersetzt." },
    cancelled: { label: "Abgebrochen", tone: "neutral", detail: "Die Analyse wurde vor dem Abschluss gestoppt." },
    blocked: { label: "Blockiert", tone: "danger", detail: "Die Capture-Stufe wurde geblockt, typischerweise durch Captcha oder Anti-Bot-Signale." },
    validation_failed: { label: "Validierung fehlgeschlagen", tone: "danger", detail: "Es wurden Daten erfasst, aber sie haben die Qualitätsregeln nicht bestanden." }
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

function analysisTimestamp(value: string | null | undefined): string {
  if (!value) return "k. A.";
  return new Date(value).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function shortText(value: string | null | undefined, max = 72): string {
  if (!value) return "Ohne Betreff";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function runtimeModeLabel(mode: string | undefined): string {
  return mode === "live" ? "Live-Capture" : "Fixture-Capture";
}

function subjectLabel(analysis: AnalysisDto): string {
  return shortText(analysis.subject_label ?? analysis.subject_ref ?? analysis.id, analysis.type === "listing" ? 64 : 56);
}

function groupedCounts(items: AnalysisDto[]) {
  return {
    total: items.length,
    liveReady: items.filter((item) => ["completed", "partial"].includes(item.status)).length,
    risky: items.filter((item) => ["blocked", "validation_failed", "failed"].includes(item.status)).length
  };
}

function extractResultCaptureMeta(result: AnalysisResult): ResultCaptureMeta {
  const artifacts = (result.artifacts ?? {}) as Record<string, unknown>;
  const capture = (artifacts.capture ?? artifacts.page_capture ?? {}) as Record<string, unknown>;
  const snapshot = result.type === "listing"
    ? (result.snapshot as Record<string, unknown>)
    : (result.market_summary as Record<string, unknown>);

  return {
    mode: typeof capture.mode === "string" ? capture.mode : undefined,
    finalUrl: typeof capture.final_url === "string" ? capture.final_url : undefined,
    blocked: capture.blocked === true,
    capturedAt: typeof capture.captured_at === "string" ? capture.captured_at : typeof snapshot.captured_at === "string" ? snapshot.captured_at : null,
    validatorStatus:
      result.type === "listing"
        ? typeof (result.snapshot as Record<string, unknown>).validator_status === "string"
          ? String((result.snapshot as Record<string, unknown>).validator_status)
          : undefined
        : undefined
  };
}

function recommendationForStatus(status: AnalysisStatus): string | null {
  switch (status) {
    case "blocked":
      return "Die Capture-Stufe wurde blockiert. Für v2 solltest du denselben Lauf im Live-Modus prüfen und die Zielseite auf Captcha/Anti-Bot-Hinweise kontrollieren.";
    case "validation_failed":
      return "Es wurden Daten geholt, aber nicht in ausreichender Qualität. Prüfe Capture-Metadaten, Parser-Ausgabe und fehlende Kernfelder.";
    case "partial":
      return "Der Lauf ist nutzbar, aber nicht vollständig. Nutze die Warnings und Snapshot-Signale als Research-Hinweis statt als harte Wahrheit.";
    case "failed":
      return "Der Lauf ist terminal fehlgeschlagen. Fehlerklasse, Queue und Quell-URL sind die ersten Prüfstellen.";
    default:
      return null;
  }
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
  const [analysisId, setAnalysisId] = useState<string | null>(() => window.location.pathname.match(/\/analyses\/([^/]+)/)?.[1] ?? null);

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
            <small>MVP-v2 Research Console</small>
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

function Dashboard({ flow, setFlow, onCreated }: { flow: Flow; setFlow: (flow: Flow) => void; onCreated: (id: string) => void }) {
  const [items, setItems] = useState<AnalysisDto[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setLoading(true);
        const [analysisResponse, runtimeResponse] = await Promise.all([
          apiFetch<AnalysisListResponse>("/v1/analyses"),
          apiFetch<RuntimeStatus>("/readyz")
        ]);
        if (cancelled) return;
        setItems(analysisResponse.items);
        setRuntime(runtimeResponse);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Dashboard konnte nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(() => items.filter((item) => filter === "all" || item.type === filter).slice(0, 10), [items, filter]);
  const counts = groupedCounts(items);
  const runtimeMode = runtime?.capture?.mode;

  return (
    <div className="shell">
      <section className="intro">
        <div>
          <p className="eyebrow">Beta-Analysekonsole</p>
          <h1>Starte belastbarere Etsy-Chancenanalysen mit sichtbarem Pipeline-Status.</h1>
          <p>
            v2 zeigt nicht nur den Score, sondern auch Capture-Modus, Workflow-Risiken und Research-Signale für
            blockierte, partielle und validierungsfehlerhafte Läufe.
          </p>
        </div>
        <div className="healthCard" aria-label="Laufzeitstatus">
          <strong>{runtimeModeLabel(runtimeMode)}</strong>
          <span>{runtime?.status === "ready" ? "API und Postgres bereit" : "Stack degradiert"}</span>
          <span>Bucket: {runtime?.capture?.raw_storage_bucket ?? "k. A."}</span>
          <span>Modi: {(runtime?.capture?.supported_capture_modes ?? ["fixture", "live"]).join(" / ")}</span>
        </div>
      </section>

      <section className="summaryGrid" aria-label="Übersicht">
        <StatCard label="Analysen gesamt" value={String(counts.total)} detail="Persistierte Läufe im Verlauf" />
        <StatCard label="Nutzbare Resultate" value={String(counts.liveReady)} detail="Status completed oder partial" />
        <StatCard label="Risikofälle" value={String(counts.risky)} detail="blocked, validation_failed oder failed" />
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
            <h2>Research-Verlauf</h2>
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

        {loading ? <div className="loadingPanel compact">Dashboard wird geladen...</div> : null}
        {error ? <div className="alert danger compact">{error}</div> : null}
        {!loading && !error ? (
          filteredItems.length ? (
            <div className="recentAnalysisList">
              {filteredItems.map((analysis) => {
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
                      <strong>{subjectLabel(analysis)}</strong>
                      <span>{analysisTypeLabel(analysis.type)}</span>
                      <span>{analysis.id}</span>
                    </div>
                    <div>
                      <b className={copy.tone}>{copy.label}</b>
                      <span>{analysisTimestamp(analysis.created_at)}</span>
                      {analysis.refresh_of_analysis_id ? <span>Refresh von {analysis.refresh_of_analysis_id}</span> : null}
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
      <FormOptions priority={priority} refreshPolicy={refreshPolicy} onPriority={setPriority} onRefreshPolicy={setRefreshPolicy} />
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
        body: JSON.stringify({ listing_url: listingUrl, priority, refresh_policy: refreshPolicy })
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
      <FormOptions priority={priority} refreshPolicy={refreshPolicy} onPriority={setPriority} onRefreshPolicy={setRefreshPolicy} />
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
      const response = await apiFetch<CreateAnalysisResponse & { refresh_of_analysis_id: string }>(`/v1/analyses/${id}/refresh`, {
        method: "POST",
        body: JSON.stringify({ reason: "user_requested", priority: "high" })
      });
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
        Zurück zum Dashboard
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
  const recommendation = recommendationForStatus(analysis.status);

  return (
    <>
      <section className={`statusPanel ${copy.tone}`} aria-label="Analyse-Status">
        <div>
          <p className="eyebrow">{analysisTypeLabel(analysis.type)} · {analysis.id}</p>
          <h2>{copy.label}</h2>
          <p>{copy.detail}</p>
          <div className="inlineMeta">
            <span>Betreff: {subjectLabel(analysis)}</span>
            <span>Erstellt: {analysisTimestamp(analysis.created_at)}</span>
            {analysis.refresh_of_analysis_id ? <span>Refresh von {analysis.refresh_of_analysis_id}</span> : null}
          </div>
        </div>
        <div className="progressBlock">
          <span>{percent}%</span>
          <div className="progressTrack">
            <div style={{ width: `${percent}%` }} />
          </div>
          <small>{analysis.progress?.phase ?? "abgeschlossen"}</small>
        </div>
      </section>
      {recommendation ? <div className="alert warning soft">{recommendation}</div> : null}
    </>
  );
}

function EmptyResult({ status }: { status: AnalysisStatus }) {
  if (status === "failed") {
    return <div className="alert danger">Es wurde kein Ergebnis erzeugt. Prüfe Fehlerklasse, Workflow und Quell-URL.</div>;
  }
  if (status === "blocked") {
    return <div className="alert danger">Die Analyse wurde während der Capture-Stufe blockiert. Für diesen Lauf gibt es deshalb noch kein belastbares Ergebnis.</div>;
  }
  if (status === "validation_failed") {
    return <div className="alert danger">Es wurden Rohdaten erfasst, aber die Qualitätsregeln wurden nicht erfüllt. Ergebnis bleibt bewusst leer.</div>;
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
                  <span>Modus: {runtimeModeLabel(job.capture_mode)}</span>
                  <span>Warteschlange: {job.worker_queue}</span>
                  <span>Jobtyp: {job.job_type}</span>
                  <span>Ziel: {shortText(job.target_ref, 48)}</span>
                  <span>Angelegt: {analysisTimestamp(job.created_at)}</span>
                  {job.captured_at ? <span>Erfasst: {analysisTimestamp(job.captured_at)}</span> : null}
                  {job.failure_class ? <span>Fehlerklasse: {job.failure_class}</span> : null}
                  {job.blocked ? <span>Blockiert: ja</span> : null}
                  {job.captcha_detected ? <span>Captcha erkannt: ja</span> : null}
                </div>
                <div className="workflowLinks">
                  <a href={job.source_url} target="_blank" rel="noreferrer">
                    Quelle öffnen
                  </a>
                  {job.final_url && job.final_url !== job.source_url ? (
                    <a href={job.final_url} target="_blank" rel="noreferrer">
                      Finale URL öffnen
                    </a>
                  ) : null}
                </div>
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
  const captureMeta = extractResultCaptureMeta(result);

  return (
    <section className="resultLayout" aria-label="Analyseergebnis">
      <ScoreCard result={result} captureMeta={captureMeta} />
      {result.type === "keyword" ? <KeywordResult result={result} captureMeta={captureMeta} /> : <ListingResult result={result} captureMeta={captureMeta} />}
    </section>
  );
}

function ScoreCard({ result, captureMeta }: { result: AnalysisResult; captureMeta: ResultCaptureMeta }) {
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
      <div className="scoreMeta">
        <span>Capture: {runtimeModeLabel(captureMeta.mode)}</span>
        {captureMeta.capturedAt ? <span>Erfasst: {analysisTimestamp(captureMeta.capturedAt)}</span> : null}
        {captureMeta.validatorStatus ? <span>Validator: {captureMeta.validatorStatus}</span> : null}
        {captureMeta.blocked ? <span>Block-Signal erkannt</span> : null}
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

function KeywordResult({ result, captureMeta }: { result: KeywordResultSummary; captureMeta: ResultCaptureMeta }) {
  return (
    <div className="detailsPanel">
      <h2>{result.keyword.term}</h2>
      <div className="metricGrid">
        <Metric label="Ergebnisse" value={formatNumber(result.market_summary.total_results_estimate)} />
        <Metric label="Stichprobe" value={String(result.market_summary.sampled_listing_count)} />
        <Metric label="Medianpreis" value={result.market_summary.median_price?.amount ?? "k. A."} />
        <Metric label="Anzeigenanteil" value={formatPercent(result.market_summary.ads_share)} />
      </div>
      <CaptureSignalPanel captureMeta={captureMeta} />
      <ExplanationList items={result.explanations} />
      <h3>Top-Listings</h3>
      <div className="listingTable">
        {result.top_listings.map((listing, index) => (
          <div key={String((listing as { listing_id?: string }).listing_id ?? index)} className="listingRow">
            <b>#{String((listing as { rank_position?: number }).rank_position ?? index + 1)}</b>
            <span>{String((listing as { title?: string }).title ?? "Ohne Titel")}</span>
            <small>{String(((listing as { price?: { amount?: string } }).price?.amount) ?? "k. A.")}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListingResult({ result, captureMeta }: { result: ListingResultSummary; captureMeta: ResultCaptureMeta }) {
  const snapshot = result.snapshot as {
    price?: { amount?: string; currency?: string };
    review_count?: number;
    average_rating?: number;
    favorite_count?: number | null;
    image_count?: number;
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
      <CaptureSignalPanel captureMeta={captureMeta} />
      <ExplanationList items={result.explanations} />
      <div className="tagList">
        {(snapshot.tags ?? []).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

function CaptureSignalPanel({ captureMeta }: { captureMeta: ResultCaptureMeta }) {
  return (
    <div className="captureMetaPanel">
      <h3>Capture-Signale</h3>
      <div className="metricGrid compactMetrics">
        <Metric label="Modus" value={runtimeModeLabel(captureMeta.mode)} />
        <Metric label="Validator" value={captureMeta.validatorStatus ?? "k. A."} />
        <Metric label="Erfasst" value={captureMeta.capturedAt ? analysisTimestamp(captureMeta.capturedAt) : "k. A."} />
        <Metric label="Block-Signal" value={captureMeta.blocked ? "Ja" : "Nein"} />
      </div>
      {captureMeta.finalUrl ? (
        <a href={captureMeta.finalUrl} target="_blank" rel="noreferrer">
          Finale Capture-URL öffnen
        </a>
      ) : null}
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

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="statCard">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
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
