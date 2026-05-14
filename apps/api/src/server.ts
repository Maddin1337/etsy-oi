import Fastify from "fastify";
import { ZodError, z } from "zod";
import {
  CONTRACT_VERSION,
  CreateKeywordAnalysisRequestSchema,
  CreateListingAnalysisRequestSchema,
  PrioritySchema,
  ValidationFailure,
  type CreateAnalysisResponse,
  type Priority
} from "@etsy-oi/shared-types";
import { AnalysisStore, normalizedInputFor, refreshOfId } from "./analysis-store.js";
import { keywordResult, listingResult, resultFor, toAnalysisDto } from "./demo-analysis.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";

function canonicalizeKeyword(term: string): string {
  return term
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function canonicalizeEtsyListingUrl(input: string): string {
  const url = new URL(input);
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key === "ref" || key.startsWith("ga_") || key.startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }
  const match = url.pathname.match(/\/listing\/(\d+)/);
  if (!/(^|\.)etsy\.com$/i.test(url.hostname) || !match?.[1]) {
    throw new ValidationFailure("listing_url muss eine Etsy-Listing-URL sein.");
  }
  url.pathname = `/listing/${match[1]}`;
  return url.toString().replace(/\/$/, "");
}

function notFoundMessage(analysisId: string) {
  return {
    code: "not_found",
    message: `Analyse ${analysisId} wurde nicht gefunden.`
  };
}

const RefreshAnalysisRequestSchema = z.object({
  priority: PrioritySchema.default("high")
});

export function buildServer() {
  const app = Fastify({ logger: true });
  const store = new AnalysisStore();

  app.addHook("onClose", async () => {
    await store.close();
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: "validation_failed",
        message: "Die Anfrage entspricht nicht dem v1-Vertrag.",
        issues: error.issues
      });
    }
    if (error instanceof ValidationFailure) {
      return reply.code(400).send({
        code: error.failureClass,
        message: error.message
      });
    }
    return reply.code(500).send({
      code: "internal_error",
      message: error instanceof Error ? error.message : "Unerwarteter Serverfehler."
    });
  });

  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/readyz", async (_request, reply) => {
    const postgresReady = await store.ping().then(() => true).catch(() => false);
    const payload = {
      status: postgresReady ? "ready" : "degraded",
      dependencies: {
        postgres: postgresReady ? "ready" : "error",
        clickhouse: "not_configured",
        redis: "not_configured",
        temporal: "not_configured"
      }
    };

    return reply.code(postgresReady ? 200 : 503).send(payload);
  });

  app.post("/v1/analyses/keyword", async (request, reply) => {
    const parsed = CreateKeywordAnalysisRequestSchema.parse(request.body);
    const normalizedTerm = canonicalizeKeyword(parsed.term);
    const created = await store.createKeywordAnalysis({
      term: normalizedTerm,
      locale: parsed.locale,
      category_hint: parsed.category_hint ?? null,
      refresh_policy: parsed.refresh_policy
    });

    const response: CreateAnalysisResponse = {
      analysis: toAnalysisDto(created.record, created.record),
      normalized_input: {
        term: normalizedTerm,
        locale: parsed.locale,
        contract_version: CONTRACT_VERSION
      },
      idempotency: {
        key: created.idempotencyKey,
        replayed: created.replayed
      }
    };

    return reply.code(202).send(response);
  });

  app.post("/v1/analyses/listing", async (request, reply) => {
    const parsed = CreateListingAnalysisRequestSchema.parse(request.body);
    const listingUrl = canonicalizeEtsyListingUrl(parsed.listing_url);
    const created = await store.createListingAnalysis({
      listing_url: listingUrl,
      refresh_policy: parsed.refresh_policy
    });

    const response: CreateAnalysisResponse = {
      analysis: toAnalysisDto(created.record, created.record),
      normalized_input: {
        listing_url: listingUrl,
        contract_version: CONTRACT_VERSION
      },
      idempotency: {
        key: created.idempotencyKey,
        replayed: created.replayed
      }
    };

    return reply.code(202).send(response);
  });

  app.get<{ Params: { analysis_id: string } }>("/v1/analyses/:analysis_id", async (request, reply) => {
    const record = await store.getByExternalId(request.params.analysis_id);
    if (!record) return reply.code(404).send(notFoundMessage(request.params.analysis_id));
    return {
      analysis: toAnalysisDto(record, record),
      result: resultFor(record, record)
    };
  });

  app.get("/v1/analyses", async (request) => {
    const records = await store.list();
    return {
      items: records.map((record) => toAnalysisDto(record, record)),
      next_cursor: null,
      filters: request.query
    };
  });

  app.post<{ Params: { analysis_id: string }; Body: { priority?: Priority } }>(
    "/v1/analyses/:analysis_id/refresh",
    async (request, reply) => {
      const parsed = RefreshAnalysisRequestSchema.parse(request.body ?? {});
      const priority = parsed.priority;
      const refreshed = await store.refresh(request.params.analysis_id, priority);
      if (!refreshed) return reply.code(404).send(notFoundMessage(request.params.analysis_id));

      return reply.code(202).send({
        analysis: toAnalysisDto(refreshed.record, refreshed.record),
        normalized_input: {
          ...normalizedInputFor(refreshed.record),
          contract_version: CONTRACT_VERSION
        },
        idempotency: {
          key: refreshed.idempotencyKey,
          replayed: refreshed.replayed
        },
        refresh_of_analysis_id: refreshOfId(refreshed.record) ?? request.params.analysis_id,
        priority
      });
    }
  );

  app.post<{ Params: { analysis_id: string } }>("/v1/analyses/:analysis_id/cancel", async (request, reply) => {
    const record = await store.cancel(request.params.analysis_id);
    if (!record) return reply.code(404).send(notFoundMessage(request.params.analysis_id));
    return {
      analysis: toAnalysisDto(record, record)
    };
  });

  app.get<{ Params: { keyword_id: string } }>("/v1/keywords/:keyword_id/latest-analysis", async (request) => ({
    keyword_id: request.params.keyword_id,
    result: keywordResult("an_latest_keyword", "mid century wall art", "completed")
  }));

  app.get<{ Params: { listing_id: string } }>("/v1/listings/:listing_id/latest-analysis", async (request) => ({
    listing_id: request.params.listing_id,
    result: listingResult("an_latest_listing", "https://www.etsy.com/listing/1234567890", "completed")
  }));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  await app.listen({ port, host });
}
