import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { buildServer } from "../../../apps/api/src/server.js";
import { ParserStore, buildKeywordResultSummary, buildListingResultSummary, materializeAnalysis, processNextCaptureJob } from "../src/index.js";

const testDatabaseName = "etsy_oi_pipeline_test";
const databaseUrl = `postgresql://root@/${testDatabaseName}?host=/var/run/postgresql`;
const defaultWorkspaceId = process.env.DEFAULT_WORKSPACE_ID ?? "00000000-0000-0000-0000-000000000001";
let pool: Pool;

beforeAll(() => {
  execFileSync(
    "psql",
    [
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `drop database if exists ${testDatabaseName} with (force);`,
      "-c",
      `create database ${testDatabaseName};`
    ],
    {
      cwd: "/root/projects/etsy-opportunity-intelligence",
      stdio: "ignore"
    }
  );

  execFileSync("psql", ["-d", testDatabaseName, "-f", "packages/db/migrations/0001_foundation.sql"], {
    cwd: "/root/projects/etsy-opportunity-intelligence",
    stdio: "ignore"
  });

  pool = new Pool({ connectionString: databaseUrl });
});

beforeEach(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.DEFAULT_WORKSPACE_ID = defaultWorkspaceId;

  await pool.query(`
    TRUNCATE TABLE
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

afterAll(async () => {
  await pool.end();
  execFileSync(
    "psql",
    ["-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `drop database if exists ${testDatabaseName} with (force);`],
    {
      cwd: "/root/projects/etsy-opportunity-intelligence",
      stdio: "ignore"
    }
  );
});

describe("parser pipeline", () => {
  it("materialisiert Listing-Raw-Artefakte zu einem persistierten Listing-Snapshot", async () => {
    const app = buildServer();
    await app.ready();

    const created = await app.inject({
      method: "POST",
      url: "/v1/analyses/listing",
      payload: {
        listing_url: "https://www.etsy.com/listing/1234567890/example",
        refresh_policy: "if_stale"
      }
    });
    expect(created.statusCode).toBe(202);
    await app.close();

    const collected = await processNextCaptureJob({
      queueName: "collector-listing",
      rawStorageBucket: "etsy-raw-test",
      databaseUrl,
      captureMode: "fixture"
    });
    expect(collected).toMatchObject({ status: "completed" });

    const parser = new ParserStore(new Pool({ connectionString: databaseUrl }));
    try {
      const parsed = await parser.processNextCompletedCaptureJob();
      expect(parsed).toMatchObject({
        snapshotType: "listing",
        status: "partial"
      });
    } finally {
      await parser.close();
    }

    const snapshot = await pool.query<{
      validator_status: string;
      parser_version: string;
      source_url: string;
      raw_storage_ref: string;
      title: string;
      review_count: number;
      average_rating: string;
      first_error_code: string | null;
    }>(`
      select
        ls.validator_status,
        ls.parser_version,
        ls.snapshot_json->>'source_url' as source_url,
        ls.snapshot_json->>'raw_storage_ref' as raw_storage_ref,
        ls.snapshot_json->>'title' as title,
        (ls.snapshot_json->>'review_count')::int as review_count,
        (ls.snapshot_json->>'average_rating')::numeric as average_rating,
        ls.validation_errors->0->>'code' as first_error_code
      from listing_snapshots ls
    `);

    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]).toMatchObject({
      validator_status: "partial",
      parser_version: "listing_parser_2026_05_16",
      source_url: "https://www.etsy.com/listing/1234567890",
      title: "Personalisierte Geburtsblumen-Halskette",
      review_count: 881,
      average_rating: "4.8",
      first_error_code: "MISSING_FAVORITE_COUNT"
    });
    expect(snapshot.rows[0].raw_storage_ref).toContain("collector-listing");
  });

  it("materialisiert Search-Raw-Artefakte zu Search-Snapshot plus Listing-Fanout", async () => {
    const app = buildServer();
    await app.ready();

    const created = await app.inject({
      method: "POST",
      url: "/v1/analyses/keyword",
      payload: {
        term: "mid century wandkunst",
        locale: "en-US",
        refresh_policy: "if_stale"
      }
    });
    expect(created.statusCode).toBe(202);
    const analysisId = created.json().analysis.id.replace("an_", "");
    await app.close();

    const collected = await processNextCaptureJob({
      queueName: "collector-search",
      rawStorageBucket: "etsy-raw-test",
      databaseUrl,
      captureMode: "fixture"
    });
    expect(collected).toMatchObject({ status: "completed" });

    const parser = new ParserStore(new Pool({ connectionString: databaseUrl }));
    try {
      const parsed = await parser.processNextCompletedCaptureJob();
      expect(parsed).toMatchObject({
        analysisId,
        snapshotType: "search",
        status: "completed"
      });
    } finally {
      await parser.close();
    }

    const snapshots = await pool.query<{
      validator_status: string;
      parser_version: string;
      query_term: string;
      sampled_listing_count: number;
    }>(`
      select
        ss.validator_status,
        ss.parser_version,
        ss.snapshot_json->>'query_term' as query_term,
        jsonb_array_length(ss.snapshot_json->'results') as sampled_listing_count
      from search_snapshots ss
    `);
    const fanoutJobs = await pool.query<{ count: string }>(`
      select count(*)::text as count
      from capture_jobs
      where analysis_id = $1::uuid
        and worker_queue = 'collector-listing'
        and capture_reason = 'keyword_analysis'
    `, [analysisId]);
    const topResult = await pool.query<{
      absolute_rank: number;
      title: string;
      listing_url: string;
    }>(`
      select
        ssr.absolute_rank,
        ssr.title,
        ssr.listing_url
      from search_snapshot_results ssr
      order by ssr.absolute_rank asc
      limit 1
    `);

    expect(snapshots.rows).toHaveLength(1);
    expect(snapshots.rows[0]).toMatchObject({
      validator_status: "valid",
      parser_version: "search_parser_2026_05_16",
      query_term: "mid century wandkunst",
      sampled_listing_count: 6
    });
    expect(Number(fanoutJobs.rows[0].count)).toBe(6);
    expect(topResult.rows[0]).toMatchObject({
      absolute_rank: 1,
      title: "Mid-Century-Wandkunst-Print",
      listing_url: "https://www.etsy.com/listing/1234567890/mid-century-wandkunst-print"
    });
  });

  it("materialisiert Listing-Analysen Ende-zu-Ende bis Score-Snapshot und Ergebnis-Summary", async () => {
    const app = buildServer();
    await app.ready();

    const created = await app.inject({
      method: "POST",
      url: "/v1/analyses/listing",
      payload: {
        listing_url: "https://www.etsy.com/listing/1234567890/example",
        refresh_policy: "if_stale"
      }
    });
    expect(created.statusCode).toBe(202);
    const analysisId = created.json().analysis.id.replace("an_", "");
    await app.close();

    const materialized = await materializeAnalysis(analysisId, {
      databaseUrl,
      rawStorageBucket: "etsy-raw-test",
      captureMode: "fixture"
    });

    expect(materialized).toMatchObject({
      analysisId,
      status: "partial",
      processedCaptureJobs: 1,
      processedParsers: 1,
      processedScores: 1
    });

    const persisted = await pool.query<{
      analysis_status: string;
      score_snapshot_count: string;
      current_score_count: string;
    }>(`
      select
        (select status::text from analyses where id = $1::uuid) as analysis_status,
        (select count(*)::text from score_snapshots where analysis_id = $1::uuid) as score_snapshot_count,
        (select count(*)::text from current_entity_scores where subject_type = 'listing') as current_score_count
    `, [analysisId]);
    const summary = await buildListingResultSummary(databaseUrl, analysisId);

    expect(persisted.rows[0]).toMatchObject({
      analysis_status: "partial",
      score_snapshot_count: "1",
      current_score_count: "1"
    });
    expect(summary).toMatchObject({
      analysis_id: `an_${analysisId}`,
      type: "listing",
      status: "partial"
    });
    expect(summary?.snapshot.validator_status).toBe("partial");
    expect(summary?.warnings[0]?.code).toBe("MISSING_FAVORITE_COUNT");
    expect(summary?.scores.opportunity_score).toBeGreaterThan(0);
  });

  it("materialisiert Keyword-Analysen Ende-zu-Ende bis Score-Snapshot und Markt-Summary", async () => {
    const app = buildServer();
    await app.ready();

    const created = await app.inject({
      method: "POST",
      url: "/v1/analyses/keyword",
      payload: {
        term: "mid century wandkunst",
        locale: "en-US",
        refresh_policy: "if_stale"
      }
    });
    expect(created.statusCode).toBe(202);
    const analysisId = created.json().analysis.id.replace("an_", "");
    await app.close();

    const materialized = await materializeAnalysis(analysisId, {
      databaseUrl,
      rawStorageBucket: "etsy-raw-test",
      captureMode: "fixture"
    });

    expect(materialized).toMatchObject({
      analysisId,
      status: "completed",
      processedScores: 1
    });
    expect(materialized.processedCaptureJobs).toBeGreaterThanOrEqual(1);
    expect(materialized.processedParsers).toBeGreaterThanOrEqual(1);

    const persisted = await pool.query<{
      analysis_status: string;
      score_snapshot_count: string;
      current_score_count: string;
    }>(`
      select
        (select status::text from analyses where id = $1::uuid) as analysis_status,
        (select count(*)::text from score_snapshots where analysis_id = $1::uuid) as score_snapshot_count,
        (select count(*)::text from current_entity_scores where subject_type = 'keyword') as current_score_count
    `, [analysisId]);
    const summary = await buildKeywordResultSummary(databaseUrl, analysisId);

    expect(persisted.rows[0]).toMatchObject({
      analysis_status: "completed",
      score_snapshot_count: "1",
      current_score_count: "1"
    });
    expect(summary).toMatchObject({
      analysis_id: `an_${analysisId}`,
      type: "keyword",
      status: "completed"
    });
    expect(summary?.market_summary.sampled_listing_count).toBe(6);
    expect(summary?.top_listings).toHaveLength(6);
    expect(summary?.scores.opportunity_score).toBeGreaterThan(0);
  });
});
