import { describe, expect, it } from "vitest";
import { deriveAnalysisStatus, resultFor } from "../src/demo-analysis.js";

describe("demo-analysis status derivation", () => {
  it("respektiert einen explizit persistierten completed-Status", () => {
    const row = {
      id: "11111111-1111-1111-1111-111111111111",
      analysis_type: "keyword" as const,
      status: "completed" as const,
      retry_count: 0,
      created_at: new Date(),
      started_at: new Date(),
      finished_at: new Date(),
      refresh_of_analysis_id: null,
      error_code: null
    };
    const input = {
      term: "persisted worker completion keyword",
      locale: "en-US",
      category_hint: null,
      listing_url: null
    };

    expect(deriveAnalysisStatus(row, input)).toBe("completed");
    expect(resultFor(row, input)?.status).toBe("completed");
  });
});
