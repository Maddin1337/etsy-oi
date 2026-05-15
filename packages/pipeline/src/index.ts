import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { chromium } from "@playwright/test";
import { DEFAULT_DATABASE_URL } from "@etsy-oi/db";
import {
  buildListingFixtureDocument,
  buildSearchFixtureDocument,
  extractListingSnapshotFromEnvelope,
  extractSearchSnapshotFromEnvelope,
  parseCapturedArtifactEnvelope,
  toDecimalMoney,
  type CapturedArtifactEnvelope,
  type ExtractorFamily
} from "@etsy-oi/extractors";
import { computeKeywordScores, computeListingScores } from "@etsy-oi/scoring";
import {
  ACTIVE_SCORE_KEY,
  CONTRACT_VERSION,
  KEYWORD_TOP_LISTING_LIMIT,
  type AnalysisStatus,
  type CaptureReason,
  type KeywordResultSummary,
  type ListingResultSummary,
  type ListingSnapshot,
  type ScoreSet,
  type SearchSnapshot,
  type SnapshotValidationStatus,
  type ValidationIssue
} from "@etsy-oi/shared-types";
import { deriveValidatorStatus, validateListingSnapshotGate, validateSearchSnapshotGate } from "@etsy-oi/validators";
import { Pool, type QueryResultRow } from "pg";

export type CollectorQueueName = "collector-listing" | "collector-search" | "collector-shop";
type CaptureMode = "fixture" | "live";
type ProcessStatus = "completed" | "partial" | "blocked" | "validation_failed";
type SubjectType = "keyword" | "listing" | "shop";

type CaptureJobStatus = "queued" | "running" | "completed" | "partial" | "failed" | "blocked" | "validation_failed";

type AnalysisType = "keyword" | "listing" | "shop";

type AnalysisRecord = {
  id: string;
  workspace_id: string;
  analysis_type: AnalysisType;
  status: AnalysisStatus;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  subject_keyword_id: string | null;
  subject_listing_id: string | null;
  subject_shop_id: string | null;
  term: string | null;
  locale: string | null;
  category_hint: string | null;
  listing_url: string | null;
};

export type CaptureJobRow = {
  id: string;
  analysis_id: string;
  status: CaptureJobStatus;
  job_type: "search_capture" | "listing_capture" | "shop_capture" | "reprocess";
  target_type: "keyword" | "listing" | "shop" | "url";
  target_ref: string;
  source_url: string;
  capture_reason: CaptureReason;
  worker_queue: CollectorQueueName;
  failure_class: string | null;
  attempt_count: number;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
};

type RawArtifactRow = {
  artifact_kind: "html" | "screenshot" | "jsonld" | "embedded_json" | "network_response" | "parser_io";
  storage_path: string;
  content_sha256: string;
  content_type: string;
  byte_size: number;
};

type ListingSnapshotRecord = {
  id: string;
  capture_job_id: string;
  analysis_id: string;
  listing_id: string | null;
  snapshot_json: ListingSnapshot;
  validator_status: SnapshotValidationStatus;
  validation_errors: ValidationIssue[];
  parser_version: string;
  captured_at: Date;
};

type SearchSnapshotRecord = {
  id: string;
  capture_job_id: string;
  analysis_id: string;
  keyword_id: string | null;
  snapshot_json: SearchSnapshot;
  validator_status: SnapshotValidationStatus;
  validation_errors: ValidationIssue[];
  parser_version: string;
  captured_at: Date;
};

type ScoreVersionRecord = {
  id: string;
  score_key: string;
  version: string;
};

type ScoreSnapshotRow = {
  id: string;
  analysis_id: string | null;
  subject_type: SubjectType;
  subject_id: string;
  score_version_id: string;
  scores_json: ScoreSet;
  observed_signal_count: number;
  estimated_signal_count: number;
  evidence_json: string[];
  calculation_trace: Record<string, unknown>;
  captured_at: Date;
};

type SearchSnapshotResultRow = {
  listing_id: string | null;
  etsy_listing_id: string | null;
  listing_url: string;
  absolute_rank: number;
  rank_position: number;
  page_number: number;
  ad_flag: boolean;
  title: string | null;
  price_amount_minor: number | null;
  price_currency_code: string | null;
  review_count: number | null;
  average_rating: string | null;
};

type ArtifactRecord = {
  artifactKind: RawArtifactRow["artifact_kind"];
  contentType: string;
  storagePath: string;
  contentSha256: string;
  byteSize: number;
};

export type CollectorRuntimeConfig = {
  queueName: CollectorQueueName;
  rawStorageBucket: string;
  databaseUrl: string;
  captureMode: CaptureMode;
};

export type ParserRuntimeConfig = {
  databaseUrl: string;
};

export type ScoringRuntimeConfig = {
  databaseUrl: string;
};

export type ProcessedCaptureJob = {
  jobId: string;
  analysisId: string;
  queueName: CollectorQueueName;
  artifactStoragePath: string;
  artifactSha256: string;
  status: ProcessStatus;
};

export type ProcessedParserJob = {
  captureJobId: string;
  analysisId: string;
  snapshotType: "listing" | "search";
  snapshotId: string;
  status: ProcessStatus;
};

export type ProcessedScoreJob = {
  analysisId: string;
  subjectType: SubjectType;
  subjectId: string;
  scoreSnapshotId: string;
  status: ProcessStatus;
};

export type MaterializedAnalysis = {
  analysisId: string;
  status: AnalysisStatus;
  processedCaptureJobs: number;
  processedParsers: number;
  processedScores: number;
};

const DEFAULT_RAW_STORAGE_ROOT = path.join(os.tmpdir(), "etsy-oi-raw");

function makeIdempotencyKey(parts: readonly string[]) {
  return `idem_${createHash("sha256").update(parts.join(":"), "utf8").digest("hex").slice(0, 24)}`;
}

function sha256(content: string | Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

function rawStorageRoot(bucket: string) {
  return path.isAbsolute(bucket) ? bucket : path.join(DEFAULT_RAW_STORAGE_ROOT, bucket);
}

function artifactBasePath(bucket: string, job: CaptureJobRow) {
  const stamp = job.created_at.toISOString().slice(0, 10);
  return path.join(rawStorageRoot(bucket), stamp, job.worker_queue, job.id);
}

async function firstRow<T extends QueryResultRow>(pool: Pool, text: string, values: unknown[] = []) {
  const result = await pool.query<T>(text, values);
  return result.rows[0] ?? null;
}

function decimalAverageRating(value: string | null) {
  return value == null ? null : Number(value);
}

function validatorStatusFromCaptureFlags(blocked: boolean, issues: ValidationIssue[]) {
  if (blocked) return "blocked" satisfies SnapshotValidationStatus;
  return deriveValidatorStatus(issues);
}

function processStatusFromValidator(validatorStatus: SnapshotValidationStatus): ProcessStatus {
  switch (validatorStatus) {
    case "blocked":
      return "blocked";
    case "invalid":
    case "parser_drift":
      return "validation_failed";
    case "partial":
      return "partial";
    default:
      return "completed";
  }
}

function analysisStatusFromProcess(status: ProcessStatus): AnalysisStatus {
  switch (status) {
    case "blocked":
      return "blocked";
    case "validation_failed":
      return "validation_failed";
    case "partial":
      return "partial";
    default:
      return "completed";
  }
}

function detectBlockedPage(html: string, title: string) {
  const haystack = `${title}\n${html}`.toLowerCase();
  return {
    blocked: /captcha|verify you are human|robot|unusual traffic|access denied/.test(haystack),
    captcha: /captcha|verify you are human/.test(haystack)
  };
}

function canonicalShopName(input: string | undefined) {
  return (input?.trim() || "Unknown Etsy Shop").slice(0, 255);
}

function canonicalListingTitle(input: string | undefined, fallbackUrl: string) {
  const fallbackId = fallbackUrl.match(/\/listing\/(\d+)/)?.[1] ?? "listing";
  return (input?.trim() || `Listing ${fallbackId}`).slice(0, 255);
}

function listingIdFromUrl(url: string) {
  return url.match(/\/listing\/(\d+)/)?.[1] ?? null;
}

function canonicalListingUrl(url: string) {
  const listingId = listingIdFromUrl(url);
  if (!listingId) return url;
  try {
    const parsed = new URL(url);
    parsed.protocol = "https:";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = `/listing/${listingId}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return `https://www.etsy.com/listing/${listingId}`;
  }
}

function extractSearchTermFromSourceUrl(sourceUrl: string) {
  if (sourceUrl.startsWith("etsy://search/")) {
    return decodeURIComponent(sourceUrl.replace(/^etsy:\/\/search\//, "").split("?")[0] ?? "");
  }
  return null;
}

function buildLiveSearchUrl(job: CaptureJobRow) {
  const sourceTerm = extractSearchTermFromSourceUrl(job.source_url);
  const term = job.target_ref || sourceTerm || job.source_url;
  return `https://www.etsy.com/search?q=${encodeURIComponent(term)}`;
}

async function collectFixturePage(job: CaptureJobRow) {
  const fixture = job.job_type === "listing_capture"
    ? buildListingFixtureDocument(job.source_url)
    : buildSearchFixtureDocument(job.target_ref || extractSearchTermFromSourceUrl(job.source_url) || job.source_url, "en-US");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1280 } });
    const url = `data:text/html;charset=utf-8,${encodeURIComponent(fixture.html)}`;
    await page.goto(url, { waitUntil: "load" });
    const html = await page.content();
    const screenshot = await page.screenshot({ fullPage: true, type: "png" });
    const metadataText = await page.locator("#etsy-oi-page-data").textContent();
    return {
      finalUrl: url,
      html,
      screenshot,
      title: await page.title(),
      metadata: metadataText ? JSON.parse(metadataText) as Record<string, unknown> : fixture.metadata
    };
  } finally {
    await browser.close();
  }
}

async function collectLivePage(job: CaptureJobRow) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1280 } });
    const targetUrl = job.job_type === "search_capture" ? buildLiveSearchUrl(job) : job.source_url;
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("load").catch(() => undefined);
    const html = await page.content();
    const screenshot = await page.screenshot({ fullPage: true, type: "png" });
    return {
      finalUrl: page.url(),
      html,
      screenshot,
      title: await page.title(),
      metadata: {}
    };
  } finally {
    await browser.close();
  }
}

async function collectPage(job: CaptureJobRow, captureMode: CaptureMode): Promise<CapturedArtifactEnvelope & { screenshot: Buffer }> {
  const capturedAt = new Date().toISOString();
  const page = captureMode === "live" ? await collectLivePage(job) : await collectFixturePage(job);
  const blockState = detectBlockedPage(page.html, page.title);
  const baseMetadata = page.metadata;
  const metadata = {
    ...baseMetadata,
    capture: {
      mode: captureMode,
      final_url: page.finalUrl,
      blocked: blockState.blocked,
      captcha_detected: blockState.captcha,
      captured_at: capturedAt
    }
  };

  return {
    capture_job_id: job.id,
    analysis_id: job.analysis_id,
    source_url: job.job_type === "search_capture" && captureMode === "live" ? buildLiveSearchUrl(job) : job.source_url,
    target_ref: job.target_ref,
    worker_queue: job.worker_queue,
    job_type: job.job_type,
    capture_reason: job.capture_reason,
    captured_at: capturedAt,
    contract_version: CONTRACT_VERSION,
    page: {
      kind: job.job_type === "listing_capture" ? "listing" : "search",
      html: page.html,
      title: page.title,
      metadata
    },
    screenshot: page.screenshot
  };
}

async function persistArtifactFiles(bucket: string, job: CaptureJobRow, payload: CapturedArtifactEnvelope & { screenshot: Buffer }): Promise<ArtifactRecord[]> {
  const basePath = artifactBasePath(bucket, job);
  await mkdir(path.dirname(basePath), { recursive: true });

  const htmlPath = `${basePath}.html`;
  const jsonPath = `${basePath}.embedded.json`;
  const screenshotPath = `${basePath}.screenshot.png`;
  const htmlContent = payload.page.html;
  const jsonContent = JSON.stringify({ ...payload, screenshot: undefined }, null, 2);

  await writeFile(htmlPath, htmlContent, "utf8");
  await writeFile(jsonPath, jsonContent, "utf8");
  await writeFile(screenshotPath, payload.screenshot);

  return [
    {
      artifactKind: "html",
      contentType: "text/html",
      storagePath: htmlPath,
      contentSha256: sha256(htmlContent),
      byteSize: Buffer.byteLength(htmlContent, "utf8")
    },
    {
      artifactKind: "embedded_json",
      contentType: "application/json",
      storagePath: jsonPath,
      contentSha256: sha256(jsonContent),
      byteSize: Buffer.byteLength(jsonContent, "utf8")
    },
    {
      artifactKind: "screenshot",
      contentType: "image/png",
      storagePath: screenshotPath,
      contentSha256: sha256(payload.screenshot),
      byteSize: payload.screenshot.byteLength
    }
  ];
}

async function upsertRawArtifacts(pool: Pool, jobId: string, artifacts: ArtifactRecord[]) {
  for (const artifact of artifacts) {
    await pool.query(
      `
        insert into raw_artifacts (
          capture_job_id,
          artifact_kind,
          storage_path,
          content_type,
          content_sha256,
          byte_size,
          retention_class,
          encryption_status
        )
        values ($1::uuid, $2, $3, $4, $5, $6, 'standard', 'not_encrypted')
        on conflict (storage_path) do update
          set artifact_kind = excluded.artifact_kind,
              content_type = excluded.content_type,
              content_sha256 = excluded.content_sha256,
              byte_size = excluded.byte_size,
              retention_class = excluded.retention_class,
              encryption_status = excluded.encryption_status
      `,
      [jobId, artifact.artifactKind, artifact.storagePath, artifact.contentType, artifact.contentSha256, artifact.byteSize]
    );
  }
}

export function getCollectorConfig(env = process.env): CollectorRuntimeConfig {
  return {
    queueName: env.COLLECTOR_QUEUE === "collector-search" || env.COLLECTOR_QUEUE === "collector-shop"
      ? env.COLLECTOR_QUEUE
      : "collector-listing",
    rawStorageBucket: env.RAW_STORAGE_BUCKET ?? "etsy-raw-dev",
    databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    captureMode: env.ETSY_OI_CAPTURE_MODE === "live" ? "live" : "fixture"
  };
}

export function describeCollector() {
  return {
    worker: "collector",
    contract_version: CONTRACT_VERSION,
    supported_queues: ["collector-listing", "collector-search", "collector-shop"],
    supported_capture_modes: ["fixture", "live"]
  };
}

export function getParserConfig(env = process.env): ParserRuntimeConfig {
  return { databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL };
}

export function describeParserWorker() {
  return {
    worker: "parser",
    contract_version: CONTRACT_VERSION,
    extraction_order: ["json_ld", "embedded_json", "network", "dom"]
  };
}

export function getScoringConfig(env = process.env): ScoringRuntimeConfig {
  return { databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL };
}

export function describeScoringWorker() {
  return {
    worker: "scoring",
    contract_version: CONTRACT_VERSION,
    active_score_key: ACTIVE_SCORE_KEY
  };
}

class PipelineRepository {
  constructor(public readonly pool: Pool) {}

  async getAnalysisById(analysisId: string) {
    return firstRow<AnalysisRecord>(
      this.pool,
      `
        select
          a.id::text,
          a.workspace_id::text,
          a.analysis_type,
          a.status,
          a.created_at,
          a.started_at,
          a.finished_at,
          a.subject_keyword_id::text,
          a.subject_listing_id::text,
          a.subject_shop_id::text,
          k.canonical_term as term,
          k.locale,
          k.category_hint,
          l.canonical_listing_url as listing_url
        from analyses a
        left join keywords k on k.id = a.subject_keyword_id
        left join listings l on l.id = a.subject_listing_id
        where a.id = $1::uuid
      `,
      [analysisId]
    );
  }

  async leaseNextCaptureJob(queueName?: CollectorQueueName) {
    const leased = await firstRow<CaptureJobRow>(
      this.pool,
      `
        with next_job as (
          select id
          from capture_jobs
          where status = 'queued'
            and ($1::text is null or worker_queue = $1)
          order by created_at asc
          limit 1
          for update skip locked
        )
        update capture_jobs cj
        set status = 'running',
            attempt_count = cj.attempt_count + 1,
            started_at = coalesce(cj.started_at, now()),
            updated_at = now()
        from next_job
        where cj.id = next_job.id
        returning
          cj.id::text,
          cj.analysis_id::text,
          cj.status,
          cj.job_type,
          cj.target_type,
          cj.target_ref,
          cj.source_url,
          cj.capture_reason,
          cj.worker_queue,
          cj.failure_class,
          cj.attempt_count,
          cj.started_at,
          cj.finished_at,
          cj.created_at
      `,
      [queueName ?? null]
    );
    if (!leased) return null;
    await this.markAnalysisRunning(leased.analysis_id);
    return leased;
  }

  async leaseAnalysisCaptureJob(analysisId: string) {
    const leased = await firstRow<CaptureJobRow>(
      this.pool,
      `
        with next_job as (
          select id
          from capture_jobs
          where analysis_id = $1::uuid
            and status = 'queued'
          order by created_at asc
          limit 1
          for update skip locked
        )
        update capture_jobs cj
        set status = 'running',
            attempt_count = cj.attempt_count + 1,
            started_at = coalesce(cj.started_at, now()),
            updated_at = now()
        from next_job
        where cj.id = next_job.id
        returning
          cj.id::text,
          cj.analysis_id::text,
          cj.status,
          cj.job_type,
          cj.target_type,
          cj.target_ref,
          cj.source_url,
          cj.capture_reason,
          cj.worker_queue,
          cj.failure_class,
          cj.attempt_count,
          cj.started_at,
          cj.finished_at,
          cj.created_at
      `,
      [analysisId]
    );
    if (!leased) return null;
    await this.markAnalysisRunning(leased.analysis_id);
    return leased;
  }

  async leaseNextParseJob() {
    return firstRow<CaptureJobRow>(
      this.pool,
      `
        select
          cj.id::text,
          cj.analysis_id::text,
          cj.status,
          cj.job_type,
          cj.target_type,
          cj.target_ref,
          cj.source_url,
          cj.capture_reason,
          cj.worker_queue,
          cj.failure_class,
          cj.attempt_count,
          cj.started_at,
          cj.finished_at,
          cj.created_at
        from capture_jobs cj
        where cj.status in ('completed', 'partial')
          and not exists (select 1 from listing_snapshots ls where ls.capture_job_id = cj.id)
          and not exists (select 1 from search_snapshots ss where ss.capture_job_id = cj.id)
        order by cj.created_at asc
        limit 1
      `
    );
  }

  async leaseAnalysisParseJob(analysisId: string) {
    return firstRow<CaptureJobRow>(
      this.pool,
      `
        select
          cj.id::text,
          cj.analysis_id::text,
          cj.status,
          cj.job_type,
          cj.target_type,
          cj.target_ref,
          cj.source_url,
          cj.capture_reason,
          cj.worker_queue,
          cj.failure_class,
          cj.attempt_count,
          cj.started_at,
          cj.finished_at,
          cj.created_at
        from capture_jobs cj
        where cj.analysis_id = $1::uuid
          and cj.status in ('completed', 'partial')
          and not exists (select 1 from listing_snapshots ls where ls.capture_job_id = cj.id)
          and not exists (select 1 from search_snapshots ss where ss.capture_job_id = cj.id)
        order by cj.created_at asc
        limit 1
      `,
      [analysisId]
    );
  }

  async leaseNextScoreAnalysis() {
    return firstRow<AnalysisRecord>(
      this.pool,
      `
        select
          a.id::text,
          a.workspace_id::text,
          a.analysis_type,
          a.status,
          a.created_at,
          a.started_at,
          a.finished_at,
          a.subject_keyword_id::text,
          a.subject_listing_id::text,
          a.subject_shop_id::text,
          k.canonical_term as term,
          k.locale,
          k.category_hint,
          l.canonical_listing_url as listing_url
        from analyses a
        left join keywords k on k.id = a.subject_keyword_id
        left join listings l on l.id = a.subject_listing_id
        where a.status in ('running', 'partial', 'queued')
          and (
            (a.analysis_type = 'listing' and exists (select 1 from listing_snapshots ls where ls.analysis_id = a.id)) or
            (a.analysis_type = 'keyword' and exists (select 1 from search_snapshots ss where ss.analysis_id = a.id))
          )
          and not exists (select 1 from score_snapshots sc where sc.analysis_id = a.id)
        order by a.created_at asc
        limit 1
      `
    );
  }

  async leaseScoreAnalysisById(analysisId: string) {
    return firstRow<AnalysisRecord>(
      this.pool,
      `
        select
          a.id::text,
          a.workspace_id::text,
          a.analysis_type,
          a.status,
          a.created_at,
          a.started_at,
          a.finished_at,
          a.subject_keyword_id::text,
          a.subject_listing_id::text,
          a.subject_shop_id::text,
          k.canonical_term as term,
          k.locale,
          k.category_hint,
          l.canonical_listing_url as listing_url
        from analyses a
        left join keywords k on k.id = a.subject_keyword_id
        left join listings l on l.id = a.subject_listing_id
        where a.id = $1::uuid
          and a.status in ('running', 'partial', 'queued')
          and (
            (a.analysis_type = 'listing' and exists (select 1 from listing_snapshots ls where ls.analysis_id = a.id)) or
            (a.analysis_type = 'keyword' and exists (select 1 from search_snapshots ss where ss.analysis_id = a.id))
          )
          and not exists (select 1 from score_snapshots sc where sc.analysis_id = a.id)
        limit 1
      `,
      [analysisId]
    );
  }

  async markAnalysisRunning(analysisId: string) {
    await this.pool.query(
      `
        update analyses
        set status = case when status = 'queued' then 'running' else status end,
            started_at = coalesce(started_at, now()),
            updated_at = now()
        where id = $1::uuid
          and status not in ('cancelled', 'refreshed')
      `,
      [analysisId]
    );
  }

  async listRawArtifacts(captureJobId: string) {
    const result = await this.pool.query<RawArtifactRow>(
      `
        select artifact_kind, storage_path, content_sha256, content_type, byte_size
        from raw_artifacts
        where capture_job_id = $1::uuid
        order by artifact_kind asc
      `,
      [captureJobId]
    );
    return result.rows;
  }

  async getEmbeddedEnvelope(captureJobId: string) {
    const artifact = await firstRow<{ storage_path: string }>(
      this.pool,
      `select storage_path from raw_artifacts where capture_job_id = $1::uuid and artifact_kind = 'embedded_json' limit 1`,
      [captureJobId]
    );
    if (!artifact) return null;
    const raw = await readFile(artifact.storage_path, "utf8");
    return {
      rawStorageRef: artifact.storage_path,
      artifact: parseCapturedArtifactEnvelope(raw)
    };
  }

  async updateCaptureJobCompletion(job: CaptureJobRow, status: ProcessStatus, failureClass: string | null = null) {
    await this.pool.query(
      `
        update capture_jobs
        set status = $2,
            failure_class = $3,
            finished_at = now(),
            updated_at = now()
        where id = $1::uuid
      `,
      [job.id, status, failureClass]
    );
  }

  async upsertShop(input: { shop_name: string; canonical_shop_url: string; source_shop_url: string }) {
    return firstRow<{ id: string }>(
      this.pool,
      `
        insert into shops (shop_name, canonical_shop_url, source_shop_url, data_quality_status, last_snapshot_at)
        values ($1, $2, $3, 'partial', now())
        on conflict (canonical_shop_url) do update
          set shop_name = excluded.shop_name,
              source_shop_url = excluded.source_shop_url,
              last_seen_at = now(),
              last_snapshot_at = now(),
              updated_at = now()
        returning id::text
      `,
      [input.shop_name, input.canonical_shop_url, input.source_shop_url]
    );
  }

  async upsertListing(input: {
    canonical_listing_url: string;
    source_listing_url: string;
    etsy_listing_id: string | null;
    title: string;
    status: string;
    primary_currency_code: string | null;
    shop_id: string | null;
    last_parser_version: string;
    data_quality_status: "ok" | "partial" | "suspect";
  }) {
    return firstRow<{ id: string }>(
      this.pool,
      `
        insert into listings (
          canonical_listing_url,
          source_listing_url,
          etsy_listing_id,
          title,
          status,
          primary_currency_code,
          shop_id,
          last_snapshot_at,
          last_parser_version,
          data_quality_status
        )
        values ($1, $2, $3, $4, $5, $6, $7::uuid, now(), $8, $9)
        on conflict (canonical_listing_url) do update
          set source_listing_url = excluded.source_listing_url,
              etsy_listing_id = coalesce(excluded.etsy_listing_id, listings.etsy_listing_id),
              title = excluded.title,
              status = excluded.status,
              primary_currency_code = coalesce(excluded.primary_currency_code, listings.primary_currency_code),
              shop_id = coalesce(excluded.shop_id, listings.shop_id),
              last_seen_at = now(),
              last_snapshot_at = now(),
              last_parser_version = excluded.last_parser_version,
              data_quality_status = excluded.data_quality_status,
              updated_at = now()
        returning id::text
      `,
      [
        input.canonical_listing_url,
        input.source_listing_url,
        input.etsy_listing_id,
        input.title,
        input.status,
        input.primary_currency_code,
        input.shop_id,
        input.last_parser_version,
        input.data_quality_status
      ]
    );
  }

  async updateKeywordLastAnalyzed(keywordId: string) {
    await this.pool.query(
      `update keywords set last_analyzed_at = now(), last_seen_at = now(), updated_at = now() where id = $1::uuid`,
      [keywordId]
    );
  }

  async insertListingSnapshot(snapshot: ListingSnapshot, analysisId: string, listingId: string | null) {
    const dedupeKey = makeIdempotencyKey(["listing-snapshot", snapshot.capture_job_id, snapshot.parser_version]);
    const row = await firstRow<{ id: string }>(
      this.pool,
      `
        insert into listing_snapshots (
          capture_job_id,
          analysis_id,
          listing_id,
          snapshot_json,
          validator_status,
          validation_errors,
          parser_version,
          captured_at,
          dedupe_key
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4::jsonb, $5, $6::jsonb, $7, $8::timestamptz, $9)
        on conflict (capture_job_id) do update
          set listing_id = excluded.listing_id,
              snapshot_json = excluded.snapshot_json,
              validator_status = excluded.validator_status,
              validation_errors = excluded.validation_errors,
              parser_version = excluded.parser_version,
              captured_at = excluded.captured_at,
              dedupe_key = excluded.dedupe_key
        returning id::text
      `,
      [
        snapshot.capture_job_id,
        analysisId,
        listingId,
        JSON.stringify(snapshot),
        snapshot.validator_status,
        JSON.stringify(snapshot.validation_errors),
        snapshot.parser_version,
        snapshot.captured_at,
        dedupeKey
      ]
    );
    return row?.id ?? "";
  }

  async insertSearchSnapshot(snapshot: SearchSnapshot, analysisId: string, keywordId: string | null) {
    const dedupeKey = makeIdempotencyKey(["search-snapshot", snapshot.capture_job_id, snapshot.parser_version]);
    const row = await firstRow<{ id: string }>(
      this.pool,
      `
        insert into search_snapshots (
          capture_job_id,
          analysis_id,
          keyword_id,
          query_term,
          locale,
          page_number,
          total_results_estimate,
          snapshot_json,
          validator_status,
          validation_errors,
          parser_version,
          captured_at,
          dedupe_key
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12::timestamptz, $13)
        on conflict (capture_job_id) do update
          set keyword_id = excluded.keyword_id,
              query_term = excluded.query_term,
              locale = excluded.locale,
              page_number = excluded.page_number,
              total_results_estimate = excluded.total_results_estimate,
              snapshot_json = excluded.snapshot_json,
              validator_status = excluded.validator_status,
              validation_errors = excluded.validation_errors,
              parser_version = excluded.parser_version,
              captured_at = excluded.captured_at,
              dedupe_key = excluded.dedupe_key
        returning id::text
      `,
      [
        snapshot.capture_job_id,
        analysisId,
        keywordId,
        snapshot.query_term,
        snapshot.locale,
        snapshot.page_number,
        snapshot.total_results_estimate ?? null,
        JSON.stringify(snapshot),
        snapshot.validator_status,
        JSON.stringify(snapshot.validation_errors),
        snapshot.parser_version,
        snapshot.captured_at,
        dedupeKey
      ]
    );
    return row?.id ?? "";
  }

  async replaceSearchSnapshotResults(searchSnapshotId: string, snapshot: SearchSnapshot) {
    await this.pool.query(`delete from search_snapshot_results where search_snapshot_id = $1::uuid`, [searchSnapshotId]);
    for (const result of snapshot.results) {
      await this.pool.query(
        `
          insert into search_snapshot_results (
            search_snapshot_id,
            absolute_rank,
            rank_position,
            page_number,
            listing_id,
            etsy_listing_id,
            listing_url,
            ad_flag,
            title,
            price_amount_minor,
            price_currency_code,
            review_count,
            average_rating
          )
          values ($1::uuid, $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10, $11, $12, $13)
        `,
        [
          searchSnapshotId,
          result.absolute_rank,
          result.rank_position,
          result.page_number,
          result.listing_id ?? null,
          result.etsy_listing_id ?? null,
          result.listing_url,
          result.ad_flag,
          result.title ?? null,
          result.price?.amount_minor ?? null,
          result.price?.currency_code ?? null,
          result.review_count ?? null,
          result.average_rating ?? null
        ]
      );
    }
  }

  async enqueueListingFanout(analysisId: string, results: SearchSnapshot["results"]) {
    for (const result of results.slice(0, KEYWORD_TOP_LISTING_LIMIT)) {
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
          values ($1::uuid, 'listing_capture', 'listing', $2, $2, 'keyword_analysis', $3, 'queued', 'collector-listing')
          on conflict (idempotency_key) do update
            set idempotency_key = capture_jobs.idempotency_key
        `,
        [analysisId, result.listing_url, makeIdempotencyKey(["keyword-listing-fanout", analysisId, result.listing_url])]
      );
    }
  }

  async getLatestListingSnapshotForAnalysis(analysisId: string) {
    return firstRow<ListingSnapshotRecord>(
      this.pool,
      `
        select
          ls.id::text,
          ls.capture_job_id::text,
          ls.analysis_id::text,
          ls.listing_id::text,
          ls.snapshot_json,
          ls.validator_status,
          ls.validation_errors,
          ls.parser_version,
          ls.captured_at
        from listing_snapshots ls
        where ls.analysis_id = $1::uuid
        order by ls.captured_at desc, ls.created_at desc
        limit 1
      `,
      [analysisId]
    );
  }

  async getLatestSearchSnapshotForAnalysis(analysisId: string) {
    return firstRow<SearchSnapshotRecord>(
      this.pool,
      `
        select
          ss.id::text,
          ss.capture_job_id::text,
          ss.analysis_id::text,
          ss.keyword_id::text,
          ss.snapshot_json,
          ss.validator_status,
          ss.validation_errors,
          ss.parser_version,
          ss.captured_at
        from search_snapshots ss
        where ss.analysis_id = $1::uuid
        order by ss.captured_at desc, ss.created_at desc
        limit 1
      `,
      [analysisId]
    );
  }

  async getActiveScoreVersion() {
    return firstRow<ScoreVersionRecord>(
      this.pool,
      `select id::text, score_key, version from score_versions where score_key = $1 and is_active = true order by created_at desc limit 1`,
      [ACTIVE_SCORE_KEY]
    );
  }

  async insertScoreSnapshot(input: {
    analysisId: string;
    subjectType: SubjectType;
    subjectId: string;
    scoreVersionId: string;
    scores: ScoreSet;
    observedSignalCount: number;
    estimatedSignalCount: number;
    evidence: string[];
    calculationTrace: Record<string, unknown>;
    capturedAt: string;
  }) {
    const dedupeKey = makeIdempotencyKey(["score-snapshot", input.analysisId, input.scoreVersionId, input.subjectType, input.subjectId]);
    const row = await firstRow<{ id: string }>(
      this.pool,
      `
        insert into score_snapshots (
          analysis_id,
          subject_type,
          subject_id,
          score_version_id,
          scores_json,
          observed_signal_count,
          estimated_signal_count,
          evidence_json,
          calculation_trace,
          captured_at,
          snapshot_dedupe_key
        )
        values ($1::uuid, $2, $3::uuid, $4::uuid, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, $10::timestamptz, $11)
        on conflict (snapshot_dedupe_key) do update
          set scores_json = excluded.scores_json,
              observed_signal_count = excluded.observed_signal_count,
              estimated_signal_count = excluded.estimated_signal_count,
              evidence_json = excluded.evidence_json,
              calculation_trace = excluded.calculation_trace,
              captured_at = excluded.captured_at
        returning id::text
      `,
      [
        input.analysisId,
        input.subjectType,
        input.subjectId,
        input.scoreVersionId,
        JSON.stringify(input.scores),
        input.observedSignalCount,
        input.estimatedSignalCount,
        JSON.stringify(input.evidence),
        JSON.stringify(input.calculationTrace),
        input.capturedAt,
        dedupeKey
      ]
    );
    return row?.id ?? "";
  }

  async upsertCurrentEntityScore(input: {
    subjectType: SubjectType;
    subjectId: string;
    scoreVersionId: string;
    scores: ScoreSet;
    evidenceSummary: Record<string, unknown>;
  }) {
    await this.pool.query(
      `
        insert into current_entity_scores (
          subject_type,
          subject_id,
          score_version_id,
          opportunity_score,
          demand_score,
          competition_score,
          momentum_score,
          commercial_viability_score,
          confidence_score,
          evidence_summary_json,
          computed_at
        )
        values ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
        on conflict (subject_type, subject_id) do update
          set score_version_id = excluded.score_version_id,
              opportunity_score = excluded.opportunity_score,
              demand_score = excluded.demand_score,
              competition_score = excluded.competition_score,
              momentum_score = excluded.momentum_score,
              commercial_viability_score = excluded.commercial_viability_score,
              confidence_score = excluded.confidence_score,
              evidence_summary_json = excluded.evidence_summary_json,
              computed_at = now()
      `,
      [
        input.subjectType,
        input.subjectId,
        input.scoreVersionId,
        input.scores.opportunity_score,
        input.scores.demand_score,
        input.scores.competition_score,
        input.scores.momentum_score,
        input.scores.commercial_viability_score,
        input.scores.confidence_score,
        JSON.stringify(input.evidenceSummary)
      ]
    );
  }

  async finalizeAnalysis(analysisId: string, status: AnalysisStatus) {
    await this.pool.query(
      `
        update analyses
        set status = $2::analysis_status,
            finished_at = case when $2::analysis_status in ('completed', 'partial', 'blocked', 'validation_failed', 'failed') then now() else finished_at end,
            updated_at = now()
        where id = $1::uuid
          and status not in ('cancelled', 'refreshed')
      `,
      [analysisId, status]
    );
  }

  async getLatestScoreSnapshotForAnalysis(analysisId: string) {
    return firstRow<ScoreSnapshotRow>(
      this.pool,
      `
        select
          id::text,
          analysis_id::text,
          subject_type,
          subject_id::text,
          score_version_id::text,
          scores_json,
          observed_signal_count,
          estimated_signal_count,
          evidence_json,
          calculation_trace,
          captured_at
        from score_snapshots
        where analysis_id = $1::uuid
        order by captured_at desc
        limit 1
      `,
      [analysisId]
    );
  }

  async getSearchSnapshotResults(searchSnapshotId: string) {
    const result = await this.pool.query<SearchSnapshotResultRow>(
      `
        select
          listing_id::text,
          etsy_listing_id,
          listing_url,
          absolute_rank,
          rank_position,
          page_number,
          ad_flag,
          title,
          price_amount_minor,
          price_currency_code,
          review_count,
          average_rating::text
        from search_snapshot_results
        where search_snapshot_id = $1::uuid
        order by absolute_rank asc
      `,
      [searchSnapshotId]
    );
    return result.rows;
  }

  async getListingContext(listingId: string | null, fallbackUrl: string) {
    if (!listingId) {
      return { id: fallbackUrl, url: fallbackUrl, title: canonicalListingTitle(undefined, fallbackUrl), etsy_listing_id: listingIdFromUrl(fallbackUrl), shop_id: null, category_hint: null };
    }
    return firstRow<{
      id: string;
      url: string;
      title: string;
      etsy_listing_id: string | null;
      shop_id: string | null;
      category_hint: string | null;
    }>(
      this.pool,
      `
        select
          id::text,
          canonical_listing_url as url,
          title,
          etsy_listing_id,
          shop_id::text,
          category_hint
        from listings
        where id = $1::uuid
      `,
      [listingId]
    );
  }

  async getKeywordContext(keywordId: string | null, fallbackTerm: string, fallbackLocale: string) {
    if (!keywordId) {
      return { id: `kw_${fallbackTerm}`, term: fallbackTerm, locale: fallbackLocale, category_hint: null };
    }
    return firstRow<{ id: string; term: string; locale: string; category_hint: string | null }>(
      this.pool,
      `
        select id::text, canonical_term as term, locale, category_hint
        from keywords
        where id = $1::uuid
      `,
      [keywordId]
    );
  }
}

export class CollectorStore {
  private readonly repository: PipelineRepository;

  constructor(
    private readonly pool: Pool,
    private readonly rawStorageBucket: string,
    private readonly captureMode: CaptureMode = "fixture"
  ) {
    this.repository = new PipelineRepository(pool);
  }

  async close() {
    await this.pool.end();
  }

  async leaseNextCaptureJob(queueName?: CollectorQueueName) {
    return this.repository.leaseNextCaptureJob(queueName);
  }

  async completeCaptureJob(job: CaptureJobRow): Promise<ProcessedCaptureJob> {
    const payload = await collectPage(job, this.captureMode);
    const artifacts = await persistArtifactFiles(this.rawStorageBucket, job, payload);
    await upsertRawArtifacts(this.pool, job.id, artifacts);

    const captureFlags = payload.page.metadata.capture as { blocked?: boolean; captcha_detected?: boolean } | undefined;
    const blocked = captureFlags?.blocked === true || captureFlags?.captcha_detected === true;
    const status: ProcessStatus = blocked ? "blocked" : "completed";
    await this.repository.updateCaptureJobCompletion(job, status, blocked ? "blocked_captcha" : null);

    return {
      jobId: job.id,
      analysisId: job.analysis_id,
      queueName: job.worker_queue,
      artifactStoragePath: artifacts[0]?.storagePath ?? "",
      artifactSha256: artifacts[0]?.contentSha256 ?? "",
      status
    };
  }
}

async function parseListingArtifact(repository: PipelineRepository, job: CaptureJobRow): Promise<ProcessedParserJob> {
  const embedded = await repository.getEmbeddedEnvelope(job.id);
  if (!embedded) {
    await repository.updateCaptureJobCompletion(job, "validation_failed", "parser_drift");
    await repository.finalizeAnalysis(job.analysis_id, "validation_failed");
    return { captureJobId: job.id, analysisId: job.analysis_id, snapshotType: "listing", snapshotId: "", status: "validation_failed" };
  }

  const rawCapture = embedded.artifact.page.metadata.capture as { blocked?: boolean } | undefined;
  const parsed = extractListingSnapshotFromEnvelope({
    artifact: embedded.artifact,
    rawStorageRef: embedded.rawStorageRef
  });
  const issues = validateListingSnapshotGate(parsed);
  const validatorStatus = validatorStatusFromCaptureFlags(rawCapture?.blocked === true, issues);
  const normalizedSnapshot: ListingSnapshot = {
    ...parsed,
    validator_status: validatorStatus,
    validation_errors: issues
  };

  const shopUrl = String((embedded.artifact.page.metadata.shop_url as string | undefined) ?? "https://www.etsy.com/shop/unknown");
  const shopName = canonicalShopName(embedded.artifact.page.metadata.shop_name as string | undefined);
  const shop = await repository.upsertShop({
    shop_name: shopName,
    canonical_shop_url: shopUrl,
    source_shop_url: shopUrl
  });
  const listing = await repository.upsertListing({
    canonical_listing_url: canonicalListingUrl(embedded.artifact.source_url),
    source_listing_url: embedded.artifact.source_url,
    etsy_listing_id: normalizedSnapshot.etsy_listing_id ?? listingIdFromUrl(embedded.artifact.source_url),
    title: canonicalListingTitle(normalizedSnapshot.title, embedded.artifact.source_url),
    status: normalizedSnapshot.status,
    primary_currency_code: normalizedSnapshot.price?.currency_code ?? null,
    shop_id: shop?.id ?? null,
    last_parser_version: normalizedSnapshot.parser_version,
    data_quality_status: validatorStatus === "valid" ? "ok" : validatorStatus === "partial" ? "partial" : "suspect"
  });
  const listingSnapshotId = await repository.insertListingSnapshot(
    {
      ...normalizedSnapshot,
      listing_id: listing?.id,
      shop_id: shop?.id
    },
    job.analysis_id,
    listing?.id ?? null
  );

  const processStatus = processStatusFromValidator(validatorStatus);
  await repository.updateCaptureJobCompletion(job, processStatus, processStatus === "blocked" ? "blocked_captcha" : processStatus === "validation_failed" ? "validation_failed" : null);

  return {
    captureJobId: job.id,
    analysisId: job.analysis_id,
    snapshotType: "listing",
    snapshotId: listingSnapshotId,
    status: processStatus
  };
}

async function parseSearchArtifact(repository: PipelineRepository, analysis: AnalysisRecord | null, job: CaptureJobRow): Promise<ProcessedParserJob> {
  const embedded = await repository.getEmbeddedEnvelope(job.id);
  if (!embedded) {
    await repository.updateCaptureJobCompletion(job, "validation_failed", "parser_drift");
    await repository.finalizeAnalysis(job.analysis_id, "validation_failed");
    return { captureJobId: job.id, analysisId: job.analysis_id, snapshotType: "search", snapshotId: "", status: "validation_failed" };
  }

  const rawCapture = embedded.artifact.page.metadata.capture as { blocked?: boolean } | undefined;
  const parsed = extractSearchSnapshotFromEnvelope({
    artifact: embedded.artifact,
    rawStorageRef: embedded.rawStorageRef,
    keywordId: analysis?.subject_keyword_id ?? undefined
  });
  const issues = validateSearchSnapshotGate(parsed);
  const validatorStatus = validatorStatusFromCaptureFlags(rawCapture?.blocked === true, issues);
  const normalizedResults = [] as SearchSnapshot["results"];
  for (const result of parsed.results) {
    const listing = await repository.upsertListing({
      canonical_listing_url: canonicalListingUrl(result.listing_url),
      source_listing_url: result.listing_url,
      etsy_listing_id: result.etsy_listing_id ?? listingIdFromUrl(result.listing_url),
      title: canonicalListingTitle(result.title, result.listing_url),
      status: "active",
      primary_currency_code: result.price?.currency_code ?? null,
      shop_id: null,
      last_parser_version: parsed.parser_version,
      data_quality_status: "partial"
    });
    normalizedResults.push({ ...result, listing_id: listing?.id });
  }

  const snapshot: SearchSnapshot = {
    ...parsed,
    keyword_id: analysis?.subject_keyword_id ?? parsed.keyword_id,
    validator_status: validatorStatus,
    validation_errors: issues,
    results: normalizedResults
  };

  const searchSnapshotId = await repository.insertSearchSnapshot(snapshot, job.analysis_id, analysis?.subject_keyword_id ?? null);
  await repository.replaceSearchSnapshotResults(searchSnapshotId, snapshot);
  await repository.enqueueListingFanout(job.analysis_id, snapshot.results);
  if (analysis?.subject_keyword_id) {
    await repository.updateKeywordLastAnalyzed(analysis.subject_keyword_id);
  }

  const processStatus = processStatusFromValidator(validatorStatus);
  await repository.updateCaptureJobCompletion(job, processStatus, processStatus === "blocked" ? "blocked_captcha" : processStatus === "validation_failed" ? "validation_failed" : null);

  return {
    captureJobId: job.id,
    analysisId: job.analysis_id,
    snapshotType: "search",
    snapshotId: searchSnapshotId,
    status: processStatus
  };
}

export class ParserStore {
  private readonly repository: PipelineRepository;

  constructor(private readonly pool: Pool) {
    this.repository = new PipelineRepository(pool);
  }

  async close() {
    await this.pool.end();
  }

  async processNextCompletedCaptureJob(): Promise<ProcessedParserJob | null> {
    const job = await this.repository.leaseNextParseJob();
    if (!job) return null;
    const analysis = await this.repository.getAnalysisById(job.analysis_id);
    return job.job_type === "listing_capture"
      ? parseListingArtifact(this.repository, job)
      : parseSearchArtifact(this.repository, analysis, job);
  }
}

export class ScoringStore {
  private readonly repository: PipelineRepository;

  constructor(private readonly pool: Pool) {
    this.repository = new PipelineRepository(pool);
  }

  async close() {
    await this.pool.end();
  }

  async processNextReadyAnalysis(): Promise<ProcessedScoreJob | null> {
    const analysis = await this.repository.leaseNextScoreAnalysis();
    if (!analysis) return null;
    const scoreVersion = await this.repository.getActiveScoreVersion();
    if (!scoreVersion) throw new Error("Keine aktive Score-Version gefunden.");

    if (analysis.analysis_type === "listing") {
      const latest = await this.repository.getLatestListingSnapshotForAnalysis(analysis.id);
      if (!latest?.listing_id) {
        await this.repository.finalizeAnalysis(analysis.id, "validation_failed");
        return {
          analysisId: analysis.id,
          subjectType: "listing",
          subjectId: analysis.subject_listing_id ?? analysis.id,
          scoreSnapshotId: "",
          status: "validation_failed"
        };
      }

      const computed = computeListingScores(latest.snapshot_json);
      const scoreSnapshotId = await this.repository.insertScoreSnapshot({
        analysisId: analysis.id,
        subjectType: "listing",
        subjectId: latest.listing_id,
        scoreVersionId: scoreVersion.id,
        scores: computed.scores,
        observedSignalCount: computed.observed_signal_count,
        estimatedSignalCount: computed.estimated_signal_count,
        evidence: computed.evidence,
        calculationTrace: computed.calculation_trace,
        capturedAt: latest.captured_at.toISOString()
      });
      await this.repository.upsertCurrentEntityScore({
        subjectType: "listing",
        subjectId: latest.listing_id,
        scoreVersionId: scoreVersion.id,
        scores: computed.scores,
        evidenceSummary: {
          snapshot_id: latest.id,
          evidence: computed.evidence
        }
      });
      const status = latest.validator_status === "partial" ? "partial" : latest.validator_status === "valid" ? "completed" : processStatusFromValidator(latest.validator_status);
      await this.repository.finalizeAnalysis(analysis.id, analysisStatusFromProcess(status));
      return {
        analysisId: analysis.id,
        subjectType: "listing",
        subjectId: latest.listing_id,
        scoreSnapshotId,
        status
      };
    }

    const latest = await this.repository.getLatestSearchSnapshotForAnalysis(analysis.id);
    if (!latest?.keyword_id) {
      await this.repository.finalizeAnalysis(analysis.id, "validation_failed");
      return {
        analysisId: analysis.id,
        subjectType: "keyword",
        subjectId: analysis.subject_keyword_id ?? analysis.id,
        scoreSnapshotId: "",
        status: "validation_failed"
      };
    }

    const computed = computeKeywordScores(latest.snapshot_json);
    const scoreSnapshotId = await this.repository.insertScoreSnapshot({
      analysisId: analysis.id,
      subjectType: "keyword",
      subjectId: latest.keyword_id,
      scoreVersionId: scoreVersion.id,
      scores: computed.scores,
      observedSignalCount: computed.observed_signal_count,
      estimatedSignalCount: computed.estimated_signal_count,
      evidence: computed.evidence,
      calculationTrace: {
        ...computed.calculation_trace,
        market_summary: computed.market_summary
      },
      capturedAt: latest.captured_at.toISOString()
    });
    await this.repository.upsertCurrentEntityScore({
      subjectType: "keyword",
      subjectId: latest.keyword_id,
      scoreVersionId: scoreVersion.id,
      scores: computed.scores,
      evidenceSummary: {
        snapshot_id: latest.id,
        market_summary: computed.market_summary,
        evidence: computed.evidence
      }
    });
    const status = latest.validator_status === "partial" ? "partial" : latest.validator_status === "valid" ? "completed" : processStatusFromValidator(latest.validator_status);
    await this.repository.finalizeAnalysis(analysis.id, analysisStatusFromProcess(status));
    return {
      analysisId: analysis.id,
      subjectType: "keyword",
      subjectId: latest.keyword_id,
      scoreSnapshotId,
      status
    };
  }
}

export async function processNextCaptureJob(config = getCollectorConfig()) {
  const store = new CollectorStore(new Pool({ connectionString: config.databaseUrl }), config.rawStorageBucket, config.captureMode);
  try {
    const job = await store.leaseNextCaptureJob(config.queueName);
    if (!job) return null;
    return await store.completeCaptureJob(job);
  } finally {
    await store.close();
  }
}

export async function processNextParserJob(config = getParserConfig()) {
  const store = new ParserStore(new Pool({ connectionString: config.databaseUrl }));
  try {
    return await store.processNextCompletedCaptureJob();
  } finally {
    await store.close();
  }
}

export async function processNextScoringJob(config = getScoringConfig()) {
  const store = new ScoringStore(new Pool({ connectionString: config.databaseUrl }));
  try {
    return await store.processNextReadyAnalysis();
  } finally {
    await store.close();
  }
}

export async function materializeAnalysis(analysisId: string, config: Partial<CollectorRuntimeConfig> = {}): Promise<MaterializedAnalysis> {
  const databaseUrl = config.databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const rawStorageBucket = config.rawStorageBucket ?? process.env.RAW_STORAGE_BUCKET ?? "etsy-raw-dev";
  const captureMode = config.captureMode ?? (process.env.ETSY_OI_CAPTURE_MODE === "live" ? "live" : "fixture");
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new PipelineRepository(pool);
  let processedCaptureJobs = 0;
  let processedParsers = 0;
  let processedScores = 0;
  try {
    for (let guard = 0; guard < 64; guard += 1) {
      const analysis = await repository.getAnalysisById(analysisId);
      if (!analysis) {
        return { analysisId, status: "failed", processedCaptureJobs, processedParsers, processedScores };
      }
      if (["completed", "partial", "blocked", "validation_failed", "failed", "cancelled", "refreshed"].includes(analysis.status)) {
        return { analysisId, status: analysis.status, processedCaptureJobs, processedParsers, processedScores };
      }

      const captureJob = await repository.leaseAnalysisCaptureJob(analysisId);
      if (captureJob) {
        const collector = new CollectorStore(pool, rawStorageBucket, captureMode);
        await collector.completeCaptureJob(captureJob);
        processedCaptureJobs += 1;
        continue;
      }

      const parseJob = await repository.leaseAnalysisParseJob(analysisId);
      if (parseJob) {
        const current = await repository.getAnalysisById(analysisId);
        if (parseJob.job_type === "listing_capture") {
          await parseListingArtifact(repository, parseJob);
        } else {
          await parseSearchArtifact(repository, current, parseJob);
        }
        processedParsers += 1;
        continue;
      }

      const scoreReady = await repository.leaseScoreAnalysisById(analysisId);
      if (scoreReady) {
        const scorer = new ScoringStore(pool);
        await scorer.processNextReadyAnalysis();
        processedScores += 1;
        continue;
      }

      return { analysisId, status: analysis.status, processedCaptureJobs, processedParsers, processedScores };
    }

    const analysis = await repository.getAnalysisById(analysisId);
    return { analysisId, status: analysis?.status ?? "failed", processedCaptureJobs, processedParsers, processedScores };
  } finally {
    await pool.end();
  }
}

export async function buildListingResultSummary(databaseUrl: string, analysisId: string): Promise<ListingResultSummary | null> {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new PipelineRepository(pool);
  try {
    const analysis = await repository.getAnalysisById(analysisId);
    const snapshot = await repository.getLatestListingSnapshotForAnalysis(analysisId);
    const score = await repository.getLatestScoreSnapshotForAnalysis(analysisId);
    if (!analysis || !snapshot || !score) return null;
    const listingContext = await repository.getListingContext(snapshot.listing_id, analysis.listing_url ?? snapshot.snapshot_json.source_url);
    if (!listingContext) return null;
    return {
      analysis_id: `an_${analysisId}`,
      type: "listing",
      status: analysis.status,
      listing: {
        listing_id: listingContext.id,
        etsy_listing_id: listingContext.etsy_listing_id,
        url: listingContext.url,
        title: listingContext.title,
        shop_id: listingContext.shop_id,
        category: listingContext.category_hint
      },
      snapshot: {
        captured_at: snapshot.captured_at.toISOString(),
        price: toDecimalMoney(snapshot.snapshot_json.price),
        review_count: snapshot.snapshot_json.review_count ?? null,
        average_rating: snapshot.snapshot_json.average_rating ?? null,
        favorite_count: snapshot.snapshot_json.favorite_count ?? null,
        image_count: snapshot.snapshot_json.image_count ?? null,
        tags: snapshot.snapshot_json.tags,
        attributes: snapshot.snapshot_json.attributes,
        validator_status: snapshot.validator_status,
        validation_errors: snapshot.validation_errors
      },
      scores: score.scores_json,
      explanations: score.evidence_json,
      artifacts: {
        listing_snapshot_id: snapshot.id,
        raw_storage_ref_available: Boolean(snapshot.snapshot_json.raw_storage_ref),
        parser_version: snapshot.parser_version,
        raw_storage_ref: snapshot.snapshot_json.raw_storage_ref
      },
      warnings: snapshot.validation_errors.map((issue) => ({ code: issue.code, message: issue.message }))
    };
  } finally {
    await pool.end();
  }
}

export async function buildKeywordResultSummary(databaseUrl: string, analysisId: string): Promise<KeywordResultSummary | null> {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new PipelineRepository(pool);
  try {
    const analysis = await repository.getAnalysisById(analysisId);
    const snapshot = await repository.getLatestSearchSnapshotForAnalysis(analysisId);
    const score = await repository.getLatestScoreSnapshotForAnalysis(analysisId);
    if (!analysis || !snapshot || !score) return null;
    const keyword = await repository.getKeywordContext(snapshot.keyword_id, snapshot.snapshot_json.query_term, snapshot.snapshot_json.locale);
    if (!keyword) return null;
    const results = await repository.getSearchSnapshotResults(snapshot.id);

    const prices = results.map((row) => row.price_amount_minor).filter((value): value is number => value != null).sort((a, b) => a - b);
    const reviews = results.map((row) => row.review_count).filter((value): value is number => value != null).sort((a, b) => a - b);
    const middle = (values: number[]) => values.length === 0 ? null : (values.length % 2 === 0 ? Math.round((values[values.length / 2 - 1]! + values[values.length / 2]!) / 2) : values[Math.floor(values.length / 2)]!);
    const adsCount = results.filter((row) => row.ad_flag).length;
    return {
      analysis_id: `an_${analysisId}`,
      type: "keyword",
      status: analysis.status,
      keyword: {
        id: keyword.id,
        term: keyword.term,
        locale: keyword.locale as "en-US",
        category_hint: keyword.category_hint
      },
      market_summary: {
        total_results_estimate: snapshot.snapshot_json.total_results_estimate ?? null,
        sampled_listing_count: results.length,
        median_price: prices.length ? toDecimalMoney({ amount_minor: middle(prices) ?? 0, currency_code: results.find((row: SearchSnapshotResultRow) => row.price_currency_code)?.price_currency_code ?? "USD" }) : null,
        median_review_count: middle(reviews),
        ads_share: results.length ? Math.round((adsCount / results.length) * 100) / 100 : null
      },
      scores: score.scores_json,
      explanations: score.evidence_json,
      top_listings: results.map((row) => ({
        listing_id: row.listing_id,
        etsy_listing_id: row.etsy_listing_id,
        rank_position: row.rank_position,
        title: row.title,
        price: row.price_amount_minor == null ? null : toDecimalMoney({ amount_minor: row.price_amount_minor, currency_code: row.price_currency_code ?? "USD" }),
        review_count: row.review_count,
        average_rating: decimalAverageRating(row.average_rating),
        ad_flag: row.ad_flag,
        listing_url: row.listing_url
      })),
      artifacts: {
        search_snapshot_id: snapshot.id,
        parser_version: snapshot.parser_version,
        captured_at: snapshot.captured_at.toISOString()
      },
      warnings: snapshot.validation_errors.map((issue) => ({ code: issue.code, message: issue.message }))
    };
  } finally {
    await pool.end();
  }
}
