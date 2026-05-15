import {
  AnalysisDetailResponseSchema,
  CreateAnalysisResponseSchema,
  type AnalysisDetailResponse,
  type AnalysisDto,
  type AnalysisStatus,
  type CaptureJobDto,
  type CaptureJobStatus,
  type CreateAnalysisResponse,
  type ListingResultSummary,
  type KeywordResultSummary
} from "@etsy-oi/shared-types";
import type { CaptureJobRecord } from "./analysis-store.js";
import {
  formatAnalysisId,
  keywordResult,
  listingResult,
  progressFor,
  type AnalysisSubjectInput,
  type PersistedAnalysisRow
} from "./demo-analysis.js";

const DEMO_STALE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RUNNING_AFTER_MS = 750;
const PARTIAL_AFTER_MS = 1500;
const COMPLETED_AFTER_MS = 2250;
const DEMO_LISTING_URL = "https://www.etsy.com/listing/1234567890";
const DEMO_KEYWORD_TERM = "mid century wall art";
const TERMINAL_CAPTURE_STATUSES: CaptureJobStatus[] = [
  "completed",
  "partial",
  "failed",
  "blocked",
  "validation_failed"
];

type AnalysisReadModelInput = PersistedAnalysisRow & AnalysisSubjectInput;

type NormalizedAnalysisInput = Record<string, string | undefined>;

type CreateAnalysisEnvelope = {
  analysis: AnalysisReadModelInput;
  normalized_input: NormalizedAnalysisInput;
  idempotency: {
    key: string;
    replayed: boolean;
  };
};

type RefreshAnalysisEnvelope = CreateAnalysisEnvelope & {
  refresh_of_analysis_id: string;
  priority: string;
};

function deriveAnalysisStatus(row: PersistedAnalysisRow): AnalysisStatus {
  return row.status;
}

function analysisFinishedAt(row: PersistedAnalysisRow): string | null {
  return row.finished_at?.toISOString() ?? null;
}

export function toAnalysisDto(row: PersistedAnalysisRow, input: AnalysisSubjectInput, now = Date.now()): AnalysisDto {
  const type = row.analysis_type;
  const status = deriveAnalysisStatus(row);
  const startedAt = row.started_at?.toISOString() ?? null;
  const finishedAt = analysisFinishedAt(row);

  return {
    id: formatAnalysisId(row.id),
    type,
    status,
    workflow_id: row.refresh_of_analysis_id
      ? `wf_refresh_${type}_${formatAnalysisId(row.refresh_of_analysis_id)}`
      : `wf_${type}_${formatAnalysisId(row.id)}`,
    subject_label: type === "keyword" ? input.term ?? null : input.listing_url ?? null,
    subject_ref: type === "keyword" ? input.term ?? null : input.listing_url ?? null,
    refresh_of_analysis_id: row.refresh_of_analysis_id ? formatAnalysisId(row.refresh_of_analysis_id) : null,
    retry_count: row.retry_count,
    created_at: row.created_at.toISOString(),
    stale_at: new Date(row.created_at.getTime() + DEMO_STALE_WINDOW_MS).toISOString(),
    progress: progressFor(type, status),
    error_code: status === "failed" ? row.error_code ?? "internal_error" : null,
    error_message: status === "failed" ? "Analyse wurde mit Fehler beendet." : null,
    started_at: startedAt,
    finished_at: finishedAt
  };
}

function resultForAnalysis(
  analysis: AnalysisDto,
  input: AnalysisSubjectInput,
  override?: KeywordResultSummary | ListingResultSummary | null
): KeywordResultSummary | ListingResultSummary | null {
  if (override !== undefined) {
    return override;
  }

  if (!["partial", "completed", "stale"].includes(analysis.status)) {
    return null;
  }

  return analysis.type === "keyword"
    ? keywordResult(analysis.id, input.term ?? DEMO_KEYWORD_TERM, analysis.status)
    : listingResult(analysis.id, input.listing_url ?? DEMO_LISTING_URL, analysis.status);
}

function deriveCaptureJobStatus(job: CaptureJobRecord, analysisStatus: AnalysisStatus): CaptureJobStatus {
  if (TERMINAL_CAPTURE_STATUSES.includes(job.status)) return job.status;

  switch (analysisStatus) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "partial":
      return "partial";
    case "completed":
    case "stale":
    case "refreshed":
      return "completed";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    case "validation_failed":
      return "validation_failed";
    case "cancelled":
      return job.status;
    default:
      return job.status;
  }
}

function toCaptureJobDto(job: CaptureJobRecord, analysis: AnalysisDto): CaptureJobDto {
  const status = deriveCaptureJobStatus(job, analysis.status);
  const startedAt = job.started_at?.toISOString() ?? (status === "queued" ? null : analysis.started_at);
  const finishedAt =
    job.finished_at?.toISOString() ?? (["completed", "partial", "failed", "blocked", "validation_failed"].includes(status) ? analysis.finished_at : null);

  return {
    id: job.id,
    analysis_id: formatAnalysisId(job.analysis_id),
    status,
    job_type: job.job_type,
    target_type: job.target_type,
    target_ref: job.target_ref,
    source_url: job.source_url,
    capture_reason: job.capture_reason,
    worker_queue: job.worker_queue,
    attempt_count: job.attempt_count,
    failure_class: job.failure_class ?? null,
    capture_mode: job.capture_mode,
    final_url: job.final_url,
    blocked: job.blocked,
    captcha_detected: job.captcha_detected,
    captured_at: job.captured_at ?? null,
    started_at: startedAt,
    finished_at: finishedAt,
    created_at: job.created_at.toISOString()
  };
}

export function buildAnalysisDetailResponse(
  row: AnalysisReadModelInput,
  captureJobs: CaptureJobRecord[],
  resultOverrideOrNow?: KeywordResultSummary | ListingResultSummary | null | number,
  now = Date.now()
): AnalysisDetailResponse {
  const resultOverride = typeof resultOverrideOrNow === "number" ? undefined : resultOverrideOrNow;
  const effectiveNow = typeof resultOverrideOrNow === "number" ? resultOverrideOrNow : now;
  const analysis = toAnalysisDto(row, row, effectiveNow);
  const response: AnalysisDetailResponse = {
    analysis,
    result: resultForAnalysis(analysis, row, resultOverride),
    workflow: {
      capture_jobs: captureJobs.map((job) => toCaptureJobDto(job, analysis))
    }
  };

  return AnalysisDetailResponseSchema.parse(response);
}

export function buildCreateAnalysisResponse(envelope: CreateAnalysisEnvelope, now = Date.now()): CreateAnalysisResponse {
  const normalizedInput = Object.fromEntries(
    Object.entries(envelope.normalized_input).filter((entry) => typeof entry[1] === "string")
  ) as Record<string, string>;

  return CreateAnalysisResponseSchema.parse({
    analysis: toAnalysisDto(envelope.analysis, envelope.analysis, now),
    normalized_input: normalizedInput,
    idempotency: envelope.idempotency
  });
}

export function buildRefreshAnalysisResponse(envelope: RefreshAnalysisEnvelope, now = Date.now()) {
  return {
    ...buildCreateAnalysisResponse(envelope, now),
    refresh_of_analysis_id: envelope.refresh_of_analysis_id,
    priority: envelope.priority
  };
}

export function buildCancelAnalysisResponse(row: AnalysisReadModelInput, now = Date.now()) {
  return {
    analysis: toAnalysisDto(row, row, now)
  };
}

export function buildAnalysisListResponse(records: AnalysisReadModelInput[], filters: unknown, now = Date.now()) {
  return {
    items: records.map((record) => toAnalysisDto(record, record, now)),
    next_cursor: null,
    filters
  };
}
