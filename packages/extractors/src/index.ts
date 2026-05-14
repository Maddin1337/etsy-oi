export const EXTRACTION_ORDER = ["json_ld", "embedded_json", "network", "dom"] as const;

export type ExtractorFamily = "search" | "listing" | "shop";

export function parserVersion(family: ExtractorFamily, date = "2026_05_13"): string {
  return `${family}_parser_${date}`;
}
