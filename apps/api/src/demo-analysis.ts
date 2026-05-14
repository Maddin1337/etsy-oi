import { ACTIVE_SCORE_KEY, type AnalysisDto, type AnalysisStatus, type KeywordResultSummary, type ListingResultSummary } from "@etsy-oi/shared-types";

export type AnalysisSubjectInput = {
  term: string | null;
  locale: string | null;
  category_hint: string | null;
  listing_url: string | null;
};

export type PersistedAnalysisRow = {
  id: string;
  analysis_type: "keyword" | "listing";
  status: AnalysisStatus;
  retry_count: number;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  refresh_of_analysis_id: string | null;
  error_code: string | null;
};

const DEMO_STALE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RUNNING_AFTER_MS = 750;
const PARTIAL_AFTER_MS = 1500;
const COMPLETED_AFTER_MS = 2250;

function fixedIso(minutes: number): string {
  return new Date(Date.UTC(2026, 4, 13, 8, minutes, 0)).toISOString();
}

export function formatAnalysisId(id: string): string {
  return `an_${id}`;
}

export function parseAnalysisId(id: string): string | null {
  const match = id.match(/^an_([0-9a-f-]{36})$/i);
  return match?.[1] ?? null;
}

export function progressFor(type: "keyword" | "listing", status: AnalysisStatus): AnalysisDto["progress"] {
  const total = type === "keyword" ? 5 : 4;
  const phaseByStatus: Partial<Record<AnalysisStatus, string>> = {
    queued: "queued",
    running: type === "keyword" ? "collect_listing_details" : "collect_listing_page",
    partial: "persist_result_views",
    completed: "completed",
    failed: "failed",
    stale: "stale",
    refreshed: "refreshed",
    cancelled: "cancelled",
    blocked: "blocked",
    validation_failed: "validation_failed"
  };
  const percentByStatus: Partial<Record<AnalysisStatus, number>> = {
    queued: 0,
    running: 42,
    partial: 78,
    completed: 100,
    failed: 100,
    stale: 100,
    refreshed: 100,
    cancelled: 0,
    blocked: 100,
    validation_failed: 100
  };
  const percent = percentByStatus[status] ?? 0;
  return {
    phase: phaseByStatus[status] ?? status,
    percent,
    steps_total: total,
    steps_completed: Math.min(total, Math.round((percent / 100) * total))
  };
}

export function deriveAnalysisStatus(row: PersistedAnalysisRow, input: AnalysisSubjectInput, now = Date.now()): AnalysisStatus {
  if (row.status === "cancelled" || row.status === "refreshed") return row.status;
  if (input.term?.includes("fail") || input.listing_url?.includes("fail")) return "failed";
  if (input.term?.includes("stale") || input.listing_url?.includes("stale")) return "stale";

  const ageMs = Math.max(0, now - row.created_at.getTime());
  if (ageMs < RUNNING_AFTER_MS) return "queued";
  if (ageMs < PARTIAL_AFTER_MS) return "running";
  if (ageMs < COMPLETED_AFTER_MS) return "partial";
  return "completed";
}

export function toAnalysisDto(row: PersistedAnalysisRow, input: AnalysisSubjectInput, now = Date.now()): AnalysisDto {
  const type = row.analysis_type;
  const status = deriveAnalysisStatus(row, input, now);
  const startedAt = status === "queued" ? null : row.started_at?.toISOString() ?? row.created_at.toISOString();
  const finishedAt = ["completed", "partial", "failed", "stale", "refreshed", "cancelled"].includes(status)
    ? row.finished_at?.toISOString() ?? new Date(row.created_at.getTime() + COMPLETED_AFTER_MS).toISOString()
    : null;

  return {
    id: formatAnalysisId(row.id),
    type,
    status,
    workflow_id: row.refresh_of_analysis_id
      ? `wf_refresh_${type}_${formatAnalysisId(row.refresh_of_analysis_id)}`
      : `wf_${type}_${formatAnalysisId(row.id)}`,
    retry_count: row.retry_count,
    created_at: row.created_at.toISOString(),
    stale_at: new Date(row.created_at.getTime() + DEMO_STALE_WINDOW_MS).toISOString(),
    progress: progressFor(type, status),
    error_code: status === "failed" ? row.error_code ?? "internal_error" : null,
    error_message: status === "failed" ? "Deterministischer Demo-Fehler wurde durch die Eingabe ausgelöst." : null,
    started_at: startedAt,
    finished_at: finishedAt
  };
}

export function keywordResult(analysisId: string, term: string, status: AnalysisStatus): KeywordResultSummary {
  return {
    analysis_id: analysisId,
    type: "keyword",
    status,
    keyword: {
      id: "kw_mid_century_wall_art",
      term,
      locale: "en-US",
      category_hint: null
    },
    market_summary: {
      total_results_estimate: 12453,
      sampled_listing_count: 24,
      median_price: { amount: "24.90", currency: "USD" },
      median_review_count: 137,
      ads_share: 0.18
    },
    scores: {
      opportunity_score: 72,
      demand_score: 78,
      competition_score: 55,
      momentum_score: 69,
      commercial_viability_score: 66,
      confidence_score: status === "partial" ? 58 : 64,
      score_version: ACTIVE_SCORE_KEY
    },
    explanations: [
      "Hohe sichtbare Nachfragesignale in den betrachteten Top-Listings.",
      "Wettbewerb ist vorhanden, aber die erste Seite ist nicht vollständig konzentriert.",
      "Die Sicherheit ist reduziert, solange die Favoritenabdeckung unvollständig ist."
    ],
    top_listings: [
      {
        listing_id: "lst_01",
        etsy_listing_id: "1234567890",
        rank_position: 1,
        title: "Mid-Century-Wandkunst-Print",
        price: { amount: "28.00", currency: "USD" },
        shop_id: "shp_01",
        review_count: 214,
        favorite_count: 921,
        ad_flag: false
      },
      {
        listing_id: "lst_02",
        etsy_listing_id: "1234567891",
        rank_position: 2,
        title: "Retro-Galeriewand Druckset",
        price: { amount: "18.50", currency: "USD" },
        shop_id: "shp_02",
        review_count: 91,
        favorite_count: 388,
        ad_flag: true
      }
    ],
    artifacts: {
      search_snapshot_id: "ss_demo_keyword",
      parser_version: "search_parser_2026_05_13",
      captured_at: fixedIso(1)
    },
    warnings:
      status === "partial"
        ? [
            {
              code: "PARTIAL_FAVORITES_COVERAGE",
              message: "Favoritenzahlen waren nur für einen Teil der Stichprobe verfügbar."
            }
          ]
        : []
  };
}

export function listingResult(analysisId: string, listingUrl: string, status: AnalysisStatus): ListingResultSummary {
  return {
    analysis_id: analysisId,
    type: "listing",
    status,
    listing: {
      listing_id: "lst_demo_listing",
      etsy_listing_id: "1234567890",
      url: listingUrl,
      title: "Personalisierte Geburtsblumen-Halskette",
      shop_id: "shp_demo_shop",
      category: "Schmuck"
    },
    snapshot: {
      captured_at: fixedIso(3),
      price: { amount: "32.50", currency: "USD" },
      review_count: 881,
      average_rating: 4.8,
      favorite_count: null,
      image_count: 7,
      tags: ["personalisierte halskette", "birth flower", "gift for mom"],
      attributes: { made_to_order: true },
      validator_status: status === "partial" ? "partial" : "valid",
      validation_errors:
        status === "partial"
          ? [
              {
                code: "MISSING_FAVORITE_COUNT",
                message: "Die Favoritenzahl konnte nicht mit ausreichender Sicherheit extrahiert werden."
              }
            ]
          : []
    },
    scores: {
      opportunity_score: 61,
      demand_score: 74,
      competition_score: 49,
      momentum_score: 57,
      commercial_viability_score: 63,
      confidence_score: status === "partial" ? 58 : 67,
      score_version: ACTIVE_SCORE_KEY
    },
    explanations: [
      "Die Nachfragesignale für dieses Listing und benachbarte Keywords sind stark.",
      "Die Kategorie ist wettbewerbsintensiv, was den Chancen-Score begrenzt.",
      "Die Sicherheit ist niedriger, solange Favoritensignale fehlen."
    ],
    artifacts: {
      listing_snapshot_id: "ls_demo_listing",
      raw_storage_ref_available: true,
      parser_version: "listing_parser_2026_05_13"
    },
    warnings:
      status === "partial"
        ? [{ code: "MISSING_FAVORITE_COUNT", message: "Die Favoritenzahl fehlt im Listing-Snapshot." }]
        : []
  };
}

export function resultFor(row: PersistedAnalysisRow, input: AnalysisSubjectInput, now = Date.now()) {
  const analysis = toAnalysisDto(row, input, now);
  if (!["partial", "completed", "stale"].includes(analysis.status)) {
    return null;
  }

  return row.analysis_type === "keyword"
    ? keywordResult(analysis.id, input.term ?? "mid century wall art", analysis.status)
    : listingResult(analysis.id, input.listing_url ?? "https://www.etsy.com/listing/1234567890", analysis.status);
}
