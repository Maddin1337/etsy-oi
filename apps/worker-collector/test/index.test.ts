import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { Pool } from "pg";
import { buildServer } from "../../api/src/server.js";
import { CollectorStore, processNextCaptureJob } from "../src/index.js";

const testDatabaseName = "etsy_oi_worker_test";
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

describe("collector worker", () => {
  it("verarbeitet einen persistierten Capture-Job per Playwright-Fixture und schreibt HTML- plus JSON-Artefakte", async () => {
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

    const result = await processNextCaptureJob({
      queueName: "collector-listing",
      rawStorageBucket: "etsy-raw-test",
      databaseUrl,
      captureMode: "fixture"
    });

    const persisted = await pool.query<{
      analysis_status: string;
      job_status: string;
      attempt_count: number;
      artifact_kind: string;
      storage_path: string;
      content_sha256: string;
    }>(`
      select
        a.status as analysis_status,
        cj.status as job_status,
        cj.attempt_count,
        ra.artifact_kind,
        ra.storage_path,
        ra.content_sha256
      from capture_jobs cj
      join analyses a on a.id = cj.analysis_id
      join raw_artifacts ra on ra.capture_job_id = cj.id
      order by ra.artifact_kind asc
    `);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      queueName: "collector-listing",
      status: "completed"
    });
    expect(persisted.rows).toHaveLength(3);
    expect(persisted.rows[0]).toMatchObject({
      analysis_status: "running",
      job_status: "completed",
      attempt_count: 1
    });
    expect(persisted.rows.map((row) => row.artifact_kind).sort()).toEqual(["embedded_json", "html", "screenshot"]);
    for (const row of persisted.rows) {
      await access(row.storage_path);
      expect(row.content_sha256).toHaveLength(64);
    }
  });

  it("leased nur Jobs der angeforderten Queue", async () => {
    const app = buildServer();
    await app.ready();

    const keywordCreated = await app.inject({
      method: "POST",
      url: "/v1/analyses/keyword",
      payload: {
        term: "queue filter keyword",
        locale: "en-US",
        refresh_policy: "if_stale"
      }
    });
    const listingCreated = await app.inject({
      method: "POST",
      url: "/v1/analyses/listing",
      payload: {
        listing_url: "https://www.etsy.com/listing/1234567890/queue-filter",
        refresh_policy: "if_stale"
      }
    });
    expect(keywordCreated.statusCode).toBe(202);
    expect(listingCreated.statusCode).toBe(202);
    await app.close();

    const store = new CollectorStore(new Pool({ connectionString: databaseUrl }), "etsy-raw-test");
    try {
      const leased = await store.leaseNextCaptureJob("collector-search");
      expect(leased?.worker_queue).toBe("collector-search");
      expect(leased?.job_type).toBe("search_capture");
    } finally {
      await store.close();
    }
  });

  it("verarbeitet Search-Capture-Jobs mit Raw-Artefakten und Capture-Metadaten", async () => {
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
    await app.close();

    const result = await processNextCaptureJob({
      queueName: "collector-search",
      rawStorageBucket: "etsy-raw-test",
      databaseUrl,
      captureMode: "fixture"
    });

    const persisted = await pool.query<{
      job_status: string;
      worker_queue: string;
      target_ref: string;
      source_url: string;
      artifact_kind: string;
      storage_path: string;
    }>(`
      select
        cj.status as job_status,
        cj.worker_queue,
        cj.target_ref,
        cj.source_url,
        ra.artifact_kind,
        ra.storage_path
      from capture_jobs cj
      join raw_artifacts ra on ra.capture_job_id = cj.id
      where cj.worker_queue = 'collector-search'
      order by ra.artifact_kind asc
    `);

    expect(result).toMatchObject({
      queueName: "collector-search",
      status: "completed"
    });
    expect(persisted.rows).toHaveLength(3);
    expect(persisted.rows[0]).toMatchObject({
      job_status: "completed",
      worker_queue: "collector-search",
      target_ref: "mid century wandkunst",
      source_url: "etsy://search/mid%20century%20wandkunst?locale=en-US"
    });
    expect(persisted.rows.map((row) => row.artifact_kind).sort()).toEqual(["embedded_json", "html", "screenshot"]);

    const embeddedPath = persisted.rows.find((row) => row.artifact_kind === "embedded_json")?.storage_path;
    expect(embeddedPath).toBeTruthy();
    const envelope = JSON.parse(await readFile(embeddedPath!, "utf8"));
    expect(envelope.page.kind).toBe("search");
    expect(envelope.page.metadata.capture).toMatchObject({
      mode: "fixture",
      blocked: false,
      captcha_detected: false
    });
    expect(envelope.page.metadata.capture.final_url).toContain("data:text/html");
  });
});
