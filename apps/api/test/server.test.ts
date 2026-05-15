import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import {
  processNextCaptureJob,
  processNextParserJob,
  processNextScoringJob
} from "@etsy-oi/pipeline";
import { buildServer } from "../src/server.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://root@/etsy_oi?host=/var/run/postgresql";
const defaultWorkspaceId = process.env.DEFAULT_WORKSPACE_ID ?? "00000000-0000-0000-0000-000000000001";
const pool = new Pool({ connectionString: databaseUrl });

async function makeServer(): Promise<FastifyInstance> {
  const app = buildServer();
  await app.ready();
  return app;
}

async function queryOne<T>(sql: string, values: unknown[] = []): Promise<T> {
  const result = await pool.query<T>(sql, values);
  return result.rows[0] as T;
}

async function drainWorkerPipeline(maxIterations = 30) {
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let progressed = false;

    for (const queueName of ["collector-search", "collector-listing"] as const) {
      if (await processNextCaptureJob({ queueName, databaseUrl, rawStorageBucket: "etsy-raw-test", captureMode: "fixture" })) {
        progressed = true;
      }
    }

    if (await processNextParserJob({ databaseUrl })) {
      progressed = true;
    }
    if (await processNextScoringJob({ databaseUrl })) {
      progressed = true;
    }

    if (!progressed) {
      return;
    }
  }

  throw new Error(`Worker-Pipeline hat nach ${maxIterations} Iterationen keinen Leerlauf erreicht.`);
}

async function finalizeCaptureForReadModel(
  analysisId: string,
  status: "completed" | "blocked" | "validation_failed",
  failureClass: "blocked_captcha" | "validation_failed" | null,
  capture: {
    final_url: string;
    blocked: boolean;
    captcha_detected: boolean;
    captured_at: string;
  }
) {
  const persistedAnalysisId = analysisId.replace(/^an_/, "");
  const captureJob = await queryOne<{ id: string }>(
    `select id from capture_jobs where analysis_id = $1::uuid order by created_at asc limit 1`,
    [persistedAnalysisId]
  );
  const dir = await mkdtemp(join(tmpdir(), "etsy-oi-capture-"));
  const storagePath = join(dir, `${captureJob.id}.embedded.json`);
  const artifactJson = JSON.stringify({
    page: {
      metadata: {
        capture: {
          mode: "fixture",
          ...capture
        }
      }
    }
  });

  await writeFile(storagePath, artifactJson, "utf8");
  await pool.query(
    `
      update capture_jobs
      set status = $2::capture_job_status,
          failure_class = $3::failure_class,
          started_at = now(),
          finished_at = now(),
          updated_at = now()
      where id = $1::uuid
    `,
    [captureJob.id, status, failureClass]
  );
  await pool.query(
    `
      update analyses
      set status = $2::analysis_status,
          finished_at = now(),
          updated_at = now()
      where id = $1::uuid
    `,
    [persistedAnalysisId, status]
  );
  await pool.query(
    `
      insert into raw_artifacts (
        capture_job_id,
        artifact_kind,
        storage_path,
        content_type,
        content_sha256,
        byte_size,
        encryption_status
      ) values (
        $1::uuid,
        'embedded_json',
        $2,
        'application/json',
        $3,
        $4,
        'none'
      )
    `,
    [
      captureJob.id,
      storagePath,
      createHash("sha256").update(artifactJson, "utf8").digest("hex"),
      Buffer.byteLength(artifactJson, "utf8")
    ]
  );
}

beforeAll(() => {
  execFileSync("psql", ["-d", "etsy_oi", "-f", "packages/db/migrations/0001_foundation.sql"], {
    cwd: "/root/projects/etsy-opportunity-intelligence",
    stdio: "ignore"
  });
});

beforeEach(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.DEFAULT_WORKSPACE_ID = defaultWorkspaceId;

  await pool.query(`
    TRUNCATE TABLE
      score_snapshots,
      current_entity_scores,
      search_snapshot_results,
      search_snapshots,
      listing_snapshots,
      raw_artifacts,
      capture_jobs,
      analyses,
      listings,
      keywords,
      projects,
      workspaces
    RESTART IDENTITY CASCADE
  `);
});

describe("api v1 analysis behavior", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it("liefert die zentrale Validierungsfehlerstruktur für ungültige Listing-URLs zurück", async () => {
    app = await makeServer();

    const response = await app.inject({
      method: "POST",
      url: "/v1/analyses/listing",
      payload: {
        listing_url: "https://example.com/listing/1234567890/not-etsy"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      message: "Die Anfrage entspricht nicht dem v1-Vertrag."
    });
    expect(response.json().issues[0].path).toEqual(["listing_url"]);
  });

  it("meldet readyz als ready, wenn Postgres erreichbar ist", async () => {
    app = await makeServer();

    const response = await app.inject({ method: "GET", url: "/readyz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ready",
      dependencies: {
        postgres: "ready",
        clickhouse: "not_configured",
        redis: "not_configured",
        temporal: "not_configured"
      },
      capture: {
        mode: "fixture",
        live_capture_enabled: false,
        raw_storage_bucket: process.env.RAW_STORAGE_BUCKET ?? "etsy-raw-dev",
        worker_queue_default: "collector-listing",
        supported_capture_modes: ["fixture", "live"]
      }
    });
  });

  it("meldet readyz als degraded, wenn Postgres nicht erreichbar ist", async () => {
    process.env.DATABASE_URL = "postgresql://127.0.0.1:1/etsy_oi";
    app = await makeServer();

    const response = await app.inject({ method: "GET", url: "/readyz" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "degraded",
      dependencies: {
        postgres: "error",
        clickhouse: "not_configured",
        redis: "not_configured",
        temporal: "not_configured"
      },
      capture: {
        mode: "fixture",
        live_capture_enabled: false,
        raw_storage_bucket: process.env.RAW_STORAGE_BUCKET ?? "etsy-raw-dev",
        worker_queue_default: "collector-listing",
        supported_capture_modes: ["fixture", "live"]
      }
    });
  });

  it("persistiert Keyword-Analysen und legt das Default-Workspace automatisch an", async () => {
    app = await makeServer();
    const payload = {
      term: "  Mid   Century Wall Art  ",
      locale: "en-US",
      refresh_policy: "if_stale"
    };

    const first = await app.inject({ method: "POST", url: "/v1/analyses/keyword", payload });
    const second = await app.inject({ method: "POST", url: "/v1/analyses/keyword", payload });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(first.json().analysis.id).toBe(second.json().analysis.id);
    expect(first.json().idempotency.replayed).toBe(false);
    expect(second.json().idempotency.replayed).toBe(true);
    expect(second.json().normalized_input).toMatchObject({
      term: "mid century wall art",
      contract_version: "v1"
    });

    const workspace = await queryOne<{ id: string; slug: string }>(
      "select id, slug from workspaces where id = $1",
      [defaultWorkspaceId]
    );
    const counts = await queryOne<{ analyses_count: number; keywords_count: number; capture_jobs_count: number }>(`
      select
        (select count(*)::int from analyses) as analyses_count,
        (select count(*)::int from keywords) as keywords_count,
        (select count(*)::int from capture_jobs) as capture_jobs_count
    `);

    const captureJob = await queryOne<{
      job_type: string;
      target_type: string;
      capture_reason: string;
      worker_queue: string;
      target_ref: string;
      status: string;
    }>(`
      select job_type, target_type, capture_reason, worker_queue, target_ref, status
      from capture_jobs
      limit 1
    `);

    expect(workspace).toMatchObject({ id: defaultWorkspaceId, slug: "default" });
    expect(counts).toMatchObject({ analyses_count: 1, keywords_count: 1, capture_jobs_count: 1 });
    expect(captureJob).toMatchObject({
      job_type: "search_capture",
      target_type: "keyword",
      capture_reason: "keyword_analysis",
      worker_queue: "collector-search",
      target_ref: "mid century wall art",
      status: "queued"
    });
  });

  it("reagiert bei parallelen Duplicate-Submits ohne 500 und liefert dieselbe Analyse-ID zurück", async () => {
    app = await makeServer();
    const payload = {
      term: "parallel idempotency keyword",
      locale: "en-US",
      refresh_policy: "if_stale"
    };

    const [first, second] = await Promise.all([
      app.inject({ method: "POST", url: "/v1/analyses/keyword", payload }),
      app.inject({ method: "POST", url: "/v1/analyses/keyword", payload })
    ]);

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(first.json().analysis.id).toBe(second.json().analysis.id);
  });

  it("liest eine persistierte Analyse auch nach einem Server-Neustart wieder aus, ohne implizit Worker-Arbeit auszuführen", async () => {
    app = await makeServer();
    const created = await app.inject({
      method: "POST",
      url: "/v1/analyses/listing",
      payload: {
        listing_url: "https://www.etsy.com/listing/1234567890/example?utm_source=test",
        refresh_policy: "if_stale"
      }
    });
    const analysisId = created.json().analysis.id;

    await app.close();
    app = await makeServer();

    const persisted = await app.inject({ method: "GET", url: `/v1/analyses/${analysisId}` });

    expect(persisted.statusCode).toBe(200);
    expect(persisted.json().analysis.id).toBe(analysisId);
    expect(persisted.json().analysis.status).toBe("queued");
    expect(persisted.json().workflow.capture_jobs).toHaveLength(1);
    expect(persisted.json().workflow.capture_jobs[0]).toMatchObject({
      analysis_id: analysisId,
      status: "queued",
      job_type: "listing_capture",
      target_type: "listing",
      capture_reason: "initial",
      worker_queue: "collector-listing",
      failure_class: null,
      captured_at: null
    });
    expect(persisted.json().result).toBeNull();
  });

  it("liefert zunächst den persistierten Zwischenstand und zeigt danach den terminalen Workflow-Status", async () => {
    app = await makeServer();
    const created = await app.inject({
      method: "POST",
      url: "/v1/analyses/keyword",
      payload: {
        term: "mid century wandkunst",
        locale: "en-US",
        refresh_policy: "if_stale"
      }
    });

    const analysisId = created.json().analysis.id;
    const queuedDetail = await app.inject({ method: "GET", url: `/v1/analyses/${analysisId}` });

    expect(queuedDetail.statusCode).toBe(200);
    expect(queuedDetail.json().analysis.status).toBe("queued");
    expect(queuedDetail.json().result).toBeNull();
    expect(queuedDetail.json().workflow.capture_jobs[0]).toMatchObject({
      analysis_id: analysisId,
      status: "queued",
      worker_queue: "collector-search"
    });

    await finalizeCaptureForReadModel(analysisId, "completed", null, {
      final_url: "https://www.etsy.com/search?q=mid%20century%20wandkunst",
      blocked: false,
      captcha_detected: false,
      captured_at: new Date().toISOString()
    });

    const completedDetail = await app.inject({ method: "GET", url: `/v1/analyses/${analysisId}` });

    expect(completedDetail.statusCode).toBe(200);
    expect(completedDetail.json().analysis.status).toBe("completed");
    expect(completedDetail.json().result).toBeNull();
    expect(completedDetail.json().workflow.capture_jobs[0]).toMatchObject({
      analysis_id: analysisId,
      status: "completed",
      worker_queue: "collector-search",
      capture_mode: "fixture",
      final_url: "https://www.etsy.com/search?q=mid%20century%20wandkunst",
      blocked: false,
      captcha_detected: false
    });
  });

  it("markiert blockierte Listing-Captures mit Failure-Class und Capture-Metadaten", async () => {
    app = await makeServer();
    const created = await app.inject({
      method: "POST",
      url: "/v1/analyses/listing",
      payload: {
        listing_url: "https://www.etsy.com/listing/9990000001/example-blocked",
        refresh_policy: "if_stale"
      }
    });

    const analysisId = created.json().analysis.id;
    await finalizeCaptureForReadModel(analysisId, "blocked", "blocked_captcha", {
      final_url: "https://www.etsy.com/listing/9990000001/example-blocked",
      blocked: true,
      captcha_detected: true,
      captured_at: new Date().toISOString()
    });

    const detail = await app.inject({ method: "GET", url: `/v1/analyses/${analysisId}` });

    expect(detail.statusCode).toBe(200);
    expect(detail.json().analysis).toMatchObject({
      id: analysisId,
      status: "blocked",
      subject_label: "https://www.etsy.com/listing/9990000001"
    });
    expect(detail.json().result).toBeNull();
    expect(detail.json().workflow.capture_jobs[0]).toMatchObject({
      status: "blocked",
      failure_class: "blocked_captcha",
      capture_mode: "fixture",
      final_url: "https://www.etsy.com/listing/9990000001/example-blocked",
      blocked: true,
      captcha_detected: true
    });
  });

  it("markiert Parser-Qualitätsfehler als validation_failed mit Capture-Metadaten", async () => {
    app = await makeServer();
    const created = await app.inject({
      method: "POST",
      url: "/v1/analyses/listing",
      payload: {
        listing_url: "https://www.etsy.com/listing/9990000002/example-validation-failed",
        refresh_policy: "if_stale"
      }
    });

    const analysisId = created.json().analysis.id;
    await finalizeCaptureForReadModel(analysisId, "validation_failed", "validation_failed", {
      final_url: "https://www.etsy.com/listing/9990000002/example-validation-failed",
      blocked: false,
      captcha_detected: false,
      captured_at: new Date().toISOString()
    });

    const detail = await app.inject({ method: "GET", url: `/v1/analyses/${analysisId}` });

    expect(detail.statusCode).toBe(200);
    expect(detail.json().analysis).toMatchObject({
      id: analysisId,
      status: "validation_failed",
      subject_label: "https://www.etsy.com/listing/9990000002"
    });
    expect(detail.json().result).toBeNull();
    expect(detail.json().workflow.capture_jobs[0]).toMatchObject({
      status: "validation_failed",
      failure_class: "validation_failed",
      capture_mode: "fixture",
      final_url: "https://www.etsy.com/listing/9990000002/example-validation-failed",
      blocked: false,
      captcha_detected: false
    });
  });

  it("hält Refresh idempotent und markiert die Originalanalyse als aktualisiert", async () => {
    app = await makeServer();
    const created = await app.inject({
      method: "POST",
      url: "/v1/analyses/listing",
      payload: {
        listing_url: "https://www.etsy.com/listing/1234567890/example?utm_source=test",
        refresh_policy: "if_stale"
      }
    });
    const analysisId = created.json().analysis.id;

    const firstRefresh = await app.inject({
      method: "POST",
      url: `/v1/analyses/${analysisId}/refresh`,
      payload: { priority: "high" }
    });
    const replayRefresh = await app.inject({
      method: "POST",
      url: `/v1/analyses/${analysisId}/refresh`,
      payload: { priority: "high" }
    });
    const original = await app.inject({ method: "GET", url: `/v1/analyses/${analysisId}` });
    const captureJobs = await pool.query<{
      analysis_id: string;
      capture_reason: string;
      job_type: string;
      worker_queue: string;
    }>(`
      select analysis_id::text, capture_reason, job_type, worker_queue
      from capture_jobs
      order by created_at asc
    `);

    expect(firstRefresh.statusCode).toBe(202);
    expect(replayRefresh.statusCode).toBe(202);
    expect(firstRefresh.json().analysis.id).toBe(replayRefresh.json().analysis.id);
    expect(firstRefresh.json().idempotency.replayed).toBe(false);
    expect(replayRefresh.json().idempotency.replayed).toBe(true);
    expect(firstRefresh.json().refresh_of_analysis_id).toBe(analysisId);
    expect(original.json().analysis.status).toBe("refreshed");
    expect(captureJobs.rows).toHaveLength(2);
    expect(captureJobs.rows[0]).toMatchObject({
      analysis_id: analysisId.replace("an_", ""),
      capture_reason: "initial",
      job_type: "listing_capture",
      worker_queue: "collector-listing"
    });
    expect(captureJobs.rows[1]).toMatchObject({
      analysis_id: firstRefresh.json().analysis.id.replace("an_", ""),
      capture_reason: "refresh",
      job_type: "listing_capture",
      worker_queue: "collector-listing"
    });
  });

  it("validiert Refresh-Prioritäten gegen den v1-Vertrag", async () => {
    app = await makeServer();
    const created = await app.inject({
      method: "POST",
      url: "/v1/analyses/keyword",
      payload: { term: "refresh validation", locale: "en-US" }
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/analyses/${created.json().analysis.id}/refresh`,
      payload: { priority: "urgent" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      message: "Die Anfrage entspricht nicht dem v1-Vertrag."
    });
    expect(response.json().issues[0].path).toEqual(["priority"]);
  });

  it("hält abgebrochene Analysen bei späteren Reads terminal", async () => {
    app = await makeServer();
    const created = await app.inject({
      method: "POST",
      url: "/v1/analyses/keyword",
      payload: { term: "cancel behavior contract", locale: "en-US" }
    });
    const analysisId = created.json().analysis.id;

    const cancelled = await app.inject({ method: "POST", url: `/v1/analyses/${analysisId}/cancel` });
    const afterRead = await app.inject({ method: "GET", url: `/v1/analyses/${analysisId}` });

    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().analysis.status).toBe("cancelled");
    expect(afterRead.json().analysis.status).toBe("cancelled");
    expect(afterRead.json().analysis.progress).toMatchObject({
      phase: "cancelled",
      percent: 0
    });
  });

  it("liefert die gemeinsame not_found-Fehlerstruktur für fehlende Analyse-Routen zurück", async () => {
    app = await makeServer();

    const read = await app.inject({ method: "GET", url: "/v1/analyses/an_missing" });
    const refresh = await app.inject({ method: "POST", url: "/v1/analyses/an_missing/refresh", payload: {} });
    const cancel = await app.inject({ method: "POST", url: "/v1/analyses/an_missing/cancel" });

    for (const response of [read, refresh, cancel]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        code: "not_found",
        message: "Analyse an_missing wurde nicht gefunden."
      });
    }
  });
});
