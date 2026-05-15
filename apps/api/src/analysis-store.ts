import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type QueryResultRow } from "pg";
import type { FailureClass, Priority } from "@etsy-oi/shared-types";
import { formatAnalysisId, parseAnalysisId, type AnalysisSubjectInput, type PersistedAnalysisRow } from "./demo-analysis.js";

const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_WORKSPACE_NAME = "Default Workspace";
const DEFAULT_WORKSPACE_SLUG = "default";
const DEFAULT_DATABASE_URL = "postgresql://root@/etsy_oi?host=/var/run/postgresql";

type AnalysisRecord = PersistedAnalysisRow &
  AnalysisSubjectInput & {
    subject_keyword_id: string | null;
    subject_listing_id: string | null;
    workspace_id: string;
    idempotency_key: string;
  };

export type CaptureJobRecord = {
  id: string;
  analysis_id: string;
  status: "queued" | "running" | "completed" | "partial" | "failed" | "blocked" | "validation_failed";
  job_type: "search_capture" | "listing_capture" | "shop_capture" | "reprocess";
  target_type: "keyword" | "listing" | "shop" | "url";
  target_ref: string;
  source_url: string;
  capture_reason: "initial" | "refresh" | "debug" | "canary" | "rebuild" | "keyword_analysis";
  worker_queue: string;
  attempt_count: number;
  failure_class: FailureClass | null;
  capture_mode?: "fixture" | "live";
  final_url?: string;
  blocked?: boolean;
  captcha_detected?: boolean;
  captured_at?: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
};

type CaptureJobReason = "initial" | "refresh" | "keyword_analysis";

export type CreateKeywordInput = {
  term: string;
  locale: string;
  category_hint: string | null;
  refresh_policy: string;
};

export type CreateListingInput = {
  listing_url: string;
  refresh_policy: string;
};

function makeIdempotencyKey(parts: readonly string[]): string {
  return `idem_${createHash("sha256").update(parts.join(":"), "utf8").digest("hex").slice(0, 24)}`;
}

function defaultWorkspaceId(): string {
  return process.env.DEFAULT_WORKSPACE_ID ?? DEFAULT_WORKSPACE_ID;
}

function listingTitle(listingUrl: string): string {
  const listingId = listingUrl.match(/\/listing\/(\d+)/)?.[1] ?? "demo";
  return `Demo-Listing ${listingId}`;
}

async function firstRow<T extends QueryResultRow>(pool: Pool, text: string, values: unknown[] = []): Promise<T | null> {
  const result = await pool.query<T>(text, values);
  return result.rows[0] ?? null;
}

function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

type CaptureArtifactMetadata = {
  capture_mode?: "fixture" | "live";
  final_url?: string;
  blocked?: boolean;
  captcha_detected?: boolean;
  captured_at?: string | null;
};

async function readCaptureArtifactMetadata(pool: Pool, captureJobId: string): Promise<CaptureArtifactMetadata> {
  const artifact = await firstRow<{ storage_path: string }>(
    pool,
    `
      select storage_path
      from raw_artifacts
      where capture_job_id = $1::uuid
        and artifact_kind = 'embedded_json'
      order by captured_at desc
      limit 1
    `,
    [captureJobId]
  );
  if (!artifact) return {};

  try {
    const envelope = JSON.parse(await readFile(artifact.storage_path, "utf8")) as {
      page?: { metadata?: { capture?: Record<string, unknown> } };
    };
    const capture = envelope.page?.metadata?.capture;
    if (!capture || typeof capture !== "object") return {};

    return {
      capture_mode: capture.mode === "live" ? "live" : capture.mode === "fixture" ? "fixture" : undefined,
      final_url: typeof capture.final_url === "string" ? capture.final_url : undefined,
      blocked: capture.blocked === true,
      captcha_detected: capture.captcha_detected === true,
      captured_at: typeof capture.captured_at === "string" ? capture.captured_at : null
    };
  } catch {
    return {};
  }
}

function captureJobShape(record: AnalysisRecord, reason: CaptureJobReason) {
  if (record.analysis_type === "keyword") {
    return {
      jobType: "search_capture",
      targetType: "keyword",
      targetRef: record.term ?? "",
      sourceUrl: `etsy://search/${encodeURIComponent(record.term ?? "")}?locale=${encodeURIComponent(record.locale ?? "en-US")}`,
      workerQueue: "collector-search",
      captureReason: reason === "refresh" ? "refresh" : "keyword_analysis"
    } as const;
  }

  return {
    jobType: "listing_capture",
    targetType: "listing",
    targetRef: record.listing_url ?? "",
    sourceUrl: record.listing_url ?? "https://www.etsy.com/listing/1234567890",
    workerQueue: "collector-listing",
    captureReason: reason
  } as const;
}

export class AnalysisStore {
  constructor(private readonly pool: Pool = new Pool({ connectionString: resolveDatabaseUrl() })) {}

  async close() {
    await this.pool.end();
  }

  async ping(): Promise<boolean> {
    await this.pool.query("select 1");
    return true;
  }

  async ensureDefaultWorkspace(): Promise<void> {
    await this.pool.query(
      `
        insert into workspaces (id, name, slug)
        values ($1::uuid, $2, $3)
        on conflict do nothing
      `,
      [defaultWorkspaceId(), DEFAULT_WORKSPACE_NAME, DEFAULT_WORKSPACE_SLUG]
    );

    await this.pool.query(
      `
        update workspaces
        set name = $2,
            slug = $3,
            updated_at = now()
        where id = $1::uuid or slug = $3
      `,
      [defaultWorkspaceId(), DEFAULT_WORKSPACE_NAME, DEFAULT_WORKSPACE_SLUG]
    );

  }

  async createKeywordAnalysis(input: CreateKeywordInput) {
    await this.ensureDefaultWorkspace();
    const idempotencyKey = makeIdempotencyKey([defaultWorkspaceId(), "keyword", input.term, input.refresh_policy]);
    const existing = await this.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { record: existing, idempotencyKey, replayed: true };
    }

    const keyword = await firstRow<{ id: string }>(
      this.pool,
      `
        insert into keywords (canonical_term, raw_term, locale, category_hint)
        values ($1, $2, $3, $4)
        on conflict (canonical_term, locale) do update
          set raw_term = excluded.raw_term,
              category_hint = coalesce(excluded.category_hint, keywords.category_hint),
              last_seen_at = now(),
              updated_at = now()
        returning id
      `,
      [input.term, input.term, input.locale, input.category_hint]
    );

    const created = await firstRow<{ id: string }>(
      this.pool,
      `
        insert into analyses (
          workspace_id,
          analysis_type,
          subject_keyword_id,
          status,
          idempotency_key
        )
        values ($1::uuid, 'keyword', $2::uuid, 'queued', $3)
        on conflict (idempotency_key) do update
          set idempotency_key = analyses.idempotency_key
        returning id
      `,
      [defaultWorkspaceId(), keyword?.id, idempotencyKey]
    );

    const record = await this.findById(created?.id ?? "");
    if (!record) throw new Error("Keyword-Analyse konnte nach Insert nicht geladen werden.");
    await this.enqueueCaptureJob(record, "keyword_analysis");
    return { record, idempotencyKey, replayed: false };
  }

  async createListingAnalysis(input: CreateListingInput) {
    await this.ensureDefaultWorkspace();
    const idempotencyKey = makeIdempotencyKey([defaultWorkspaceId(), "listing", input.listing_url, input.refresh_policy]);
    const existing = await this.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { record: existing, idempotencyKey, replayed: true };
    }

    const listing = await firstRow<{ id: string }>(
      this.pool,
      `
        insert into listings (
          canonical_listing_url,
          source_listing_url,
          etsy_listing_id,
          title,
          status,
          data_quality_status
        )
        values ($1, $1, $2, $3, 'active', 'partial')
        on conflict (canonical_listing_url) do update
          set source_listing_url = excluded.source_listing_url,
              etsy_listing_id = excluded.etsy_listing_id,
              title = excluded.title,
              last_seen_at = now(),
              updated_at = now()
        returning id
      `,
      [input.listing_url, input.listing_url.match(/\/listing\/(\d+)/)?.[1] ?? null, listingTitle(input.listing_url)]
    );

    const created = await firstRow<{ id: string }>(
      this.pool,
      `
        insert into analyses (
          workspace_id,
          analysis_type,
          subject_listing_id,
          status,
          idempotency_key
        )
        values ($1::uuid, 'listing', $2::uuid, 'queued', $3)
        on conflict (idempotency_key) do update
          set idempotency_key = analyses.idempotency_key
        returning id
      `,
      [defaultWorkspaceId(), listing?.id, idempotencyKey]
    );

    const record = await this.findById(created?.id ?? "");
    if (!record) throw new Error("Listing-Analyse konnte nach Insert nicht geladen werden.");
    await this.enqueueCaptureJob(record, "initial");
    return { record, idempotencyKey, replayed: false };
  }

  async getByExternalId(externalId: string): Promise<AnalysisRecord | null> {
    const internalId = parseAnalysisId(externalId);
    if (!internalId) return null;
    return this.findById(internalId);
  }

  async list(): Promise<AnalysisRecord[]> {
    const result = await this.pool.query<AnalysisRecord>(`
      select
        a.id,
        a.workspace_id,
        a.analysis_type,
        a.status,
        a.retry_count,
        a.created_at,
        a.started_at,
        a.finished_at,
        a.refresh_of_analysis_id,
        a.error_code,
        a.subject_keyword_id,
        a.subject_listing_id,
        a.idempotency_key,
        k.canonical_term as term,
        k.locale,
        k.category_hint,
        l.canonical_listing_url as listing_url
      from analyses a
      left join keywords k on k.id = a.subject_keyword_id
      left join listings l on l.id = a.subject_listing_id
      order by a.created_at desc
    `);
    return result.rows;
  }

  async listCaptureJobs(externalAnalysisId: string): Promise<CaptureJobRecord[]> {
    const internalId = parseAnalysisId(externalAnalysisId);
    if (!internalId) return [];

    const result = await this.pool.query<CaptureJobRecord>(
      `
        select
          id::text,
          analysis_id::text,
          status,
          job_type,
          target_type,
          target_ref,
          source_url,
          capture_reason,
          worker_queue,
          attempt_count,
          failure_class,
          started_at,
          finished_at,
          created_at
        from capture_jobs
        where analysis_id = $1::uuid
        order by created_at asc
      `,
      [internalId]
    );

    return Promise.all(
      result.rows.map(async (job) => ({
        ...job,
        ...(await readCaptureArtifactMetadata(this.pool, job.id))
      }))
    );
  }

  async refresh(externalId: string, priority: Priority) {
    const original = await this.getByExternalId(externalId);
    if (!original) return null;

    const idempotencyKey = makeIdempotencyKey(["refresh", externalId, priority]);
    const existing = await this.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { record: existing, original, idempotencyKey, replayed: true };
    }

    const created = await firstRow<{ id: string }>(
      this.pool,
      `
        insert into analyses (
          workspace_id,
          analysis_type,
          subject_keyword_id,
          subject_listing_id,
          status,
          refresh_of_analysis_id,
          idempotency_key
        )
        values ($1::uuid, $2, $3::uuid, $4::uuid, 'queued', $5::uuid, $6)
        on conflict (idempotency_key) do update
          set idempotency_key = analyses.idempotency_key
        returning id
      `,
      [
        original.workspace_id,
        original.analysis_type,
        original.subject_keyword_id,
        original.subject_listing_id,
        original.id,
        idempotencyKey
      ]
    );

      await this.pool.query(
      `
        update analyses
        set status = 'refreshed',
            finished_at = now(),
            idempotency_key = idempotency_key || ':retired:' || replace(id::text, '-', ''),
            updated_at = now()
        where id = $1::uuid
      `,
      [original.id]
    );

    const record = await this.findById(created?.id ?? "");
    const refreshedOriginal = await this.findById(original.id);
    if (!record || !refreshedOriginal) throw new Error("Refresh-Analyse konnte nicht geladen werden.");
    await this.enqueueCaptureJob(record, "refresh");
    return { record, original: refreshedOriginal, idempotencyKey, replayed: false };
  }

  async cancel(externalId: string): Promise<AnalysisRecord | null> {
    const internalId = parseAnalysisId(externalId);
    if (!internalId) return null;
    await this.pool.query(
      `
        update analyses
        set status = 'cancelled',
            finished_at = now(),
            idempotency_key = idempotency_key || ':retired:' || replace(id::text, '-', ''),
            updated_at = now()
        where id = $1::uuid
      `,
      [internalId]
    );
    return this.findById(internalId);
  }

  private async findById(id: string): Promise<AnalysisRecord | null> {
    return firstRow<AnalysisRecord>(
      this.pool,
      `
        select
          a.id,
          a.workspace_id,
          a.analysis_type,
          a.status,
          a.retry_count,
          a.created_at,
          a.started_at,
          a.finished_at,
          a.refresh_of_analysis_id,
          a.error_code,
          a.subject_keyword_id,
          a.subject_listing_id,
          a.idempotency_key,
          k.canonical_term as term,
          k.locale,
          k.category_hint,
          l.canonical_listing_url as listing_url
        from analyses a
        left join keywords k on k.id = a.subject_keyword_id
        left join listings l on l.id = a.subject_listing_id
        where a.id = $1::uuid
      `,
      [id]
    );
  }

  private async findByIdempotencyKey(idempotencyKey: string): Promise<AnalysisRecord | null> {
    const row = await firstRow<{ id: string }>(
      this.pool,
      `select id from analyses where idempotency_key = $1 and status not in ('refreshed', 'cancelled') order by created_at desc limit 1`,
      [idempotencyKey]
    );
    return row ? this.findById(row.id) : null;
  }

  private async enqueueCaptureJob(record: AnalysisRecord, reason: CaptureJobReason): Promise<void> {
    const shape = captureJobShape(record, reason);
    const idempotencyKey = makeIdempotencyKey([
      "capture-job",
      record.id,
      shape.jobType,
      shape.captureReason,
      shape.targetRef
    ]);

    await this.pool.query(
      `
        insert into capture_jobs (
          analysis_id,
          job_type,
          target_type,
          target_ref,
          source_url,
          capture_reason,
          idempotency_key,
          status,
          worker_queue
        )
        values ($1::uuid, $2, $3, $4, $5, $6, $7, 'queued', $8)
        on conflict (idempotency_key) do update
          set idempotency_key = capture_jobs.idempotency_key
      `,
      [
        record.id,
        shape.jobType,
        shape.targetType,
        shape.targetRef,
        shape.sourceUrl,
        shape.captureReason,
        idempotencyKey,
        shape.workerQueue
      ]
    );
  }
}

export function normalizedInputFor(record: AnalysisRecord) {
  if (record.analysis_type === "keyword") {
    return {
      term: record.term ?? "",
      locale: record.locale ?? "en-US"
    };
  }

  return {
    listing_url: record.listing_url ?? ""
  };
}

export function refreshOfId(record: AnalysisRecord): string | null {
  return record.refresh_of_analysis_id ? formatAnalysisId(record.refresh_of_analysis_id) : null;
}
