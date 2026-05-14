import { describe, expect, it } from "vitest";
import {
  ACTIVE_SCORE_KEY,
  CreateKeywordAnalysisRequestSchema,
  CreateListingAnalysisRequestSchema,
  FailureClassSchema,
  ListingSnapshotSchema,
  ScoreSetSchema,
  SearchSnapshotSchema
} from "../src/index.js";

describe("shared v1 contracts", () => {
  it("defaults keyword analysis requests to en-US, normal priority and if_stale refresh", () => {
    const parsed = CreateKeywordAnalysisRequestSchema.parse({ term: "mid century wall art" });

    expect(parsed).toEqual({
      term: "mid century wall art",
      locale: "en-US",
      priority: "normal",
      refresh_policy: "if_stale"
    });
  });

  it("accepts only Etsy listing URLs for listing analysis requests", () => {
    expect(
      CreateListingAnalysisRequestSchema.safeParse({
        listing_url: "https://www.etsy.com/listing/1234567890/example?utm_source=test"
      }).success
    ).toBe(true);

    expect(
      CreateListingAnalysisRequestSchema.safeParse({
        listing_url: "https://example.com/listing/1234567890/example"
      }).success
    ).toBe(false);
  });

  it("caps keyword search snapshots at the v1 top 24 listing limit", () => {
    const result = SearchSnapshotSchema.safeParse({
      snapshot_type: "search",
      snapshot_id: "00000000-0000-0000-0000-000000000001",
      capture_job_id: "00000000-0000-0000-0000-000000000002",
      captured_at: "2026-05-13T20:01:10.000Z",
      source_url: "https://www.etsy.com/search?q=print",
      raw_storage_ref: "s3://etsy-raw/dev/search/x.html.gz",
      parser_version: "search_parser_2026_05_13",
      validator_status: "partial",
      query_term: "print",
      page_number: 1,
      capture_reason: "keyword_analysis",
      results: Array.from({ length: 25 }, (_, index) => ({
        listing_url: `https://www.etsy.com/listing/${index + 1}/item`,
        rank_position: index + 1,
        page_number: 1,
        absolute_rank: index + 1,
        ad_flag: false
      }))
    });

    expect(result.success).toBe(false);
  });

  it("requires listing snapshots to carry either price data or an explicit missing reason", () => {
    const parsed = ListingSnapshotSchema.parse({
      snapshot_type: "listing",
      snapshot_id: "00000000-0000-0000-0000-000000000011",
      capture_job_id: "00000000-0000-0000-0000-000000000012",
      captured_at: "2026-05-13T20:03:00.000Z",
      source_url: "https://www.etsy.com/listing/123/example",
      raw_storage_ref: "s3://etsy-raw/dev/listing/x.html.gz",
      parser_version: "listing_parser_2026_05_13",
      validator_status: "partial",
      title: "Personalized necklace",
      price_missing_reason: "not_rendered"
    });

    expect(parsed.price_missing_reason).toBe("not_rendered");
  });

  it("keeps the current score key explicit", () => {
    const parsed = ScoreSetSchema.parse({
      opportunity_score: 72,
      demand_score: 78,
      competition_score: 55,
      momentum_score: 69,
      commercial_viability_score: 66,
      confidence_score: 64
    });

    expect(parsed.score_version).toBe(ACTIVE_SCORE_KEY);
  });

  it("includes the operational failure classes from the worker plan", () => {
    expect(FailureClassSchema.options).toContain("blocked_captcha");
    expect(FailureClassSchema.options).toContain("budget_exhausted");
    expect(FailureClassSchema.options).toContain("parser_drift");
  });
});
