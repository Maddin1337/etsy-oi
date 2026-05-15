import { describe, expect, it } from "vitest";
import {
  buildAnalysisDetailResponse,
  buildAnalysisListResponse,
  buildCancelAnalysisResponse,
  buildCreateAnalysisResponse,
  buildRefreshAnalysisResponse
} from "../src/analysis-read-model.js";
import type { CaptureJobRecord } from "../src/analysis-store.js";

const createdAt = new Date("2026-05-14T08:00:00.000Z");

type RowOverrides = Partial<{
  id: string;
  analysis_type: "keyword" | "listing";
  status:
    | "queued"
    | "running"
    | "partial"
    | "completed"
    | "failed"
    | "stale"
    | "refreshed"
    | "cancelled"
    | "blocked"
    | "validation_failed";
  retry_count: number;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  refresh_of_analysis_id: string | null;
  error_code: string | null;
  term: string | null;
  locale: string | null;
  category_hint: string | null;
  listing_url: string | null;
}>;

function makeRow(overrides: RowOverrides = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    analysis_type: "listing" as const,
    status: "queued" as const,
    retry_count: 0,
    created_at: createdAt,
    started_at: null,
    finished_at: null,
    refresh_of_analysis_id: null,
    error_code: null,
    term: null,
    locale: "en-US",
    category_hint: null,
    listing_url: "https://www.etsy.com/listing/1234567890/example",
    ...overrides
  };
}

function makeJob(overrides: Partial<CaptureJobRecord> = {}): CaptureJobRecord {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    analysis_id: "11111111-1111-1111-1111-111111111111",
    status: "queued",
    job_type: "listing_capture",
    target_type: "listing",
    target_ref: "https://www.etsy.com/listing/1234567890/example",
    source_url: "https://www.etsy.com/listing/1234567890/example",
    capture_reason: "initial",
    worker_queue: "collector-listing",
    attempt_count: 0,
    started_at: null,
    finished_at: null,
    created_at: createdAt,
    ...overrides
  };
}

describe("analysis read model", () => {
  it("baut Create-Responses über das Read-Model konsistent auf", () => {
    const response = buildCreateAnalysisResponse({
      analysis: makeRow({
        analysis_type: "keyword",
        term: "mid century wandkunst",
        listing_url: null
      }),
      normalized_input: {
        term: "mid century wandkunst",
        locale: "en-US",
        contract_version: "v1"
      },
      idempotency: {
        key: "idem_test",
        replayed: false
      }
    });

    expect(response.analysis.id).toBe("an_11111111-1111-1111-1111-111111111111");
    expect(response.normalized_input?.term).toBe("mid century wandkunst");
    expect(response.idempotency.replayed).toBe(false);
  });

  it("liefert Listen- und Cancel-Responses aus derselben DTO-Ableitung", () => {
    const listResponse = buildAnalysisListResponse([
      makeRow({ status: "completed", started_at: createdAt, finished_at: createdAt })
    ], { type: "listing" }, createdAt.getTime() + 5000);
    const cancelResponse = buildCancelAnalysisResponse(makeRow({ status: "cancelled", finished_at: createdAt }), createdAt.getTime() + 5000);

    expect(listResponse.items).toHaveLength(1);
    expect(listResponse.items[0].status).toBe("completed");
    expect(listResponse.filters).toEqual({ type: "listing" });
    expect(cancelResponse.analysis.status).toBe("cancelled");
  });

  it("erhält Refresh-Metadaten beim Aufbau der 202-Response", () => {
    const response = buildRefreshAnalysisResponse({
      analysis: makeRow({ refresh_of_analysis_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }),
      normalized_input: {
        listing_url: "https://www.etsy.com/listing/1234567890/example",
        contract_version: "v1"
      },
      idempotency: {
        key: "idem_refresh",
        replayed: true
      },
      refresh_of_analysis_id: "an_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      priority: "high"
    });

    expect(response.refresh_of_analysis_id).toBe("an_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(response.priority).toBe("high");
    expect(response.idempotency.replayed).toBe(true);
  });

  it("leitet bei fortgeschrittener Demo-Analyse einen abgeschlossenen Capture-Job-Status ab", () => {
    const response = buildAnalysisDetailResponse(
      makeRow({ status: "completed", started_at: createdAt, finished_at: createdAt }),
      [makeJob()],
      createdAt.getTime() + 5000
    );

    expect(response.analysis.status).toBe("completed");
    expect(response.result?.status).toBe("completed");
    expect(response.workflow.capture_jobs).toHaveLength(1);
    expect(response.workflow.capture_jobs[0]).toMatchObject({
      analysis_id: "an_11111111-1111-1111-1111-111111111111",
      status: "completed",
      worker_queue: "collector-listing"
    });
    expect(response.workflow.capture_jobs[0].started_at).toBe(createdAt.toISOString());
    expect(response.workflow.capture_jobs[0].finished_at).not.toBeNull();
  });

  it("liefert bei Zwischenstand weiterhin Partial-Result und Partial-Workflow", () => {
    const response = buildAnalysisDetailResponse(
      makeRow({
        analysis_type: "keyword",
        status: "partial",
        started_at: createdAt,
        finished_at: createdAt,
        term: "mid century wandkunst",
        listing_url: null
      }),
      [
        makeJob({
          job_type: "search_capture",
          target_type: "keyword",
          target_ref: "mid century wandkunst",
          source_url: "etsy://search/mid%20century%20wandkunst?locale=en-US",
          capture_reason: "keyword_analysis",
          worker_queue: "collector-search"
        })
      ],
      createdAt.getTime() + 1700
    );

    expect(response.analysis.status).toBe("partial");
    expect(response.result?.status).toBe("partial");
    expect(response.workflow.capture_jobs[0]).toMatchObject({
      status: "partial",
      worker_queue: "collector-search",
      capture_reason: "keyword_analysis"
    });
  });

  it("respektiert terminale Capture-Job-Status aus der Persistenz", () => {
    const response = buildAnalysisDetailResponse(
      makeRow({ status: "failed", started_at: createdAt, finished_at: createdAt, error_code: "internal_error", term: "fail listing", listing_url: null }),
      [makeJob({ status: "blocked" })],
      createdAt.getTime() + 5000
    );

    expect(response.analysis.status).toBe("failed");
    expect(response.result).toBeNull();
    expect(response.workflow.capture_jobs[0].status).toBe("blocked");
  });
});
