import {
  CONTRACT_VERSION,
  ListingSnapshotSchema,
  SearchSnapshotSchema,
  type CaptureReason,
  type ListingSnapshot,
  type MoneyMinor,
  type SearchSnapshot,
  type SearchResultImpression,
  type SnapshotValidationStatus,
  type ValidationIssue
} from "@etsy-oi/shared-types";

export const EXTRACTION_ORDER = ["json_ld", "embedded_json", "network", "dom"] as const;

export type ExtractorFamily = "search" | "listing" | "shop";

export type CapturedArtifactEnvelope = {
  capture_job_id: string;
  analysis_id: string;
  source_url: string;
  target_ref: string;
  worker_queue: string;
  job_type: string;
  capture_reason: CaptureReason;
  captured_at: string;
  contract_version: string;
  page: {
    kind: "listing" | "search";
    html: string;
    title: string;
    metadata: Record<string, unknown>;
  };
};

export function parserVersion(family: ExtractorFamily, date = "2026_05_16"): string {
  return `${family}_parser_${date}`;
}

function decimalToMoneyMinor(amount: string, currency = "USD"): MoneyMinor {
  const normalized = amount.trim();
  const [whole, fraction = "00"] = normalized.split(".");
  return {
    amount_minor: Number.parseInt(`${whole}${fraction.padEnd(2, "0").slice(0, 2)}`, 10),
    currency_code: currency
  };
}

function moneyMinorToDecimalString(value: MoneyMinor | undefined): { amount: string; currency: string } | null {
  if (!value) return null;
  const sign = value.amount_minor < 0 ? "-" : "";
  const absolute = Math.abs(value.amount_minor);
  const whole = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, "0");
  return { amount: `${sign}${whole}.${cents}`, currency: value.currency_code };
}

function statusAndIssues<T extends { price?: unknown; price_missing_reason?: unknown; favorite_count?: number | null }>(
  subject: T,
  preferred: ValidationIssue[] = []
): { validator_status: SnapshotValidationStatus; validation_errors: ValidationIssue[] } {
  const validationErrors = [...preferred];
  if (!("price" in subject) || (!subject.price && !("price_missing_reason" in subject && subject.price_missing_reason))) {
    validationErrors.push({
      code: "MISSING_PRICE",
      message: "Listing price could not be extracted.",
      field: "price",
      severity: "error"
    });
  }
  if ("favorite_count" in subject && subject.favorite_count == null) {
    validationErrors.push({
      code: "MISSING_FAVORITE_COUNT",
      message: "Favorite count could not be extracted with confidence.",
      field: "favorite_count",
      severity: "warning"
    });
  }
  return {
    validator_status: validationErrors.some((issue) => issue.severity === "error") ? "invalid" : validationErrors.length ? "partial" : "valid",
    validation_errors: validationErrors
  };
}

export function buildListingFixtureDocument(listingUrl: string) {
  const listingId = listingUrl.match(/\/listing\/(\d+)/)?.[1] ?? "1234567890";
  const title = "Personalisierte Geburtsblumen-Halskette";
  const metadata = {
    etsy_listing_id: listingId,
    title,
    shop_name: "BirthBloomStudio",
    shop_url: `https://www.etsy.com/shop/BirthBloomStudio`,
    price: { amount: "32.50", currency: "USD" },
    review_count: 881,
    average_rating: 4.8,
    favorite_count: null,
    image_count: 7,
    tags: ["personalisierte halskette", "birth flower", "gift for mom"],
    attributes: { made_to_order: true, material: "Sterling Silver" },
    is_digital: false,
    status: "active"
  };
  const html = `<!doctype html>
<html lang="de">
  <head>
    <title>${title}</title>
    <script type="application/json" id="etsy-oi-page-data">${JSON.stringify(metadata)}</script>
  </head>
  <body>
    <main data-page-kind="listing" data-listing-id="${listingId}">
      <h1>${title}</h1>
      <p data-price="32.50">USD 32.50</p>
      <p data-review-count="881">881 Bewertungen</p>
      <p data-average-rating="4.8">4.8 Sterne</p>
      <ul>${metadata.tags.map((tag) => `<li data-tag>${tag}</li>`).join("")}</ul>
    </main>
  </body>
</html>`;
  return { html, title, metadata };
}

export function buildSearchFixtureDocument(queryTerm: string, locale = "en-US") {
  const normalizedTerm = queryTerm.trim();
  const results = [
    {
      etsy_listing_id: "1234567890",
      listing_url: "https://www.etsy.com/listing/1234567890/mid-century-wandkunst-print",
      rank_position: 1,
      absolute_rank: 1,
      page_number: 1,
      ad_flag: false,
      title: "Mid-Century-Wandkunst-Print",
      price: { amount: "28.00", currency: "USD" },
      review_count: 214,
      average_rating: 4.9
    },
    {
      etsy_listing_id: "1234567891",
      listing_url: "https://www.etsy.com/listing/1234567891/retro-galeriewand-druckset",
      rank_position: 2,
      absolute_rank: 2,
      page_number: 1,
      ad_flag: true,
      title: "Retro-Galeriewand Druckset",
      price: { amount: "24.00", currency: "USD" },
      review_count: 91,
      average_rating: 4.8
    },
    {
      etsy_listing_id: "1234567892",
      listing_url: "https://www.etsy.com/listing/1234567892/retro-abstract-poster-set",
      rank_position: 3,
      absolute_rank: 3,
      page_number: 1,
      ad_flag: false,
      title: "Retro Abstract Poster Set",
      price: { amount: "26.00", currency: "USD" },
      review_count: 137,
      average_rating: 4.7
    },
    {
      etsy_listing_id: "1234567893",
      listing_url: "https://www.etsy.com/listing/1234567893/minimalist-gallery-wall-set",
      rank_position: 4,
      absolute_rank: 4,
      page_number: 1,
      ad_flag: false,
      title: "Minimalist Gallery Wall Set",
      price: { amount: "22.00", currency: "USD" },
      review_count: 84,
      average_rating: 4.6
    },
    {
      etsy_listing_id: "1234567894",
      listing_url: "https://www.etsy.com/listing/1234567894/mcm-sun-print-bundle",
      rank_position: 5,
      absolute_rank: 5,
      page_number: 1,
      ad_flag: false,
      title: "MCM Sun Print Bundle",
      price: { amount: "26.00", currency: "USD" },
      review_count: 166,
      average_rating: 4.9
    },
    {
      etsy_listing_id: "1234567895",
      listing_url: "https://www.etsy.com/listing/1234567895/earth-tone-abstract-wall-art",
      rank_position: 6,
      absolute_rank: 6,
      page_number: 1,
      ad_flag: false,
      title: "Earth Tone Abstract Wall Art",
      price: { amount: "31.00", currency: "USD" },
      review_count: 58,
      average_rating: 4.5
    }
  ];
  const metadata = {
    query_term: normalizedTerm,
    locale,
    page_number: 1,
    total_results_estimate: 12453,
    results
  };
  const html = `<!doctype html>
<html lang="de">
  <head>
    <title>${normalizedTerm}</title>
    <script type="application/json" id="etsy-oi-page-data">${JSON.stringify(metadata)}</script>
  </head>
  <body>
    <main data-page-kind="search" data-query-term="${normalizedTerm}">
      <h1>${normalizedTerm}</h1>
      ${results
        .map(
          (result) => `<article data-listing-id="${result.etsy_listing_id}" data-rank="${result.rank_position}" data-ad-flag="${result.ad_flag}">
            <a href="${result.listing_url}">${result.title}</a>
            <span data-price="${result.price.amount}">${result.price.currency} ${result.price.amount}</span>
          </article>`
        )
        .join("")}
    </main>
  </body>
</html>`;
  return { html, title: normalizedTerm, metadata };
}

export function parseCapturedArtifactEnvelope(raw: string): CapturedArtifactEnvelope {
  return JSON.parse(raw) as CapturedArtifactEnvelope;
}

export function extractListingSnapshotFromEnvelope(input: {
  artifact: CapturedArtifactEnvelope;
  rawStorageRef: string;
  listingId?: string;
  shopId?: string;
}): ListingSnapshot {
  const metadata = input.artifact.page.metadata as Record<string, unknown>;
  const priceMetadata = metadata.price as { amount?: string; currency?: string } | undefined;
  const preliminary: Omit<ListingSnapshot, "validator_status" | "validation_errors"> & {
    validator_status?: SnapshotValidationStatus;
    validation_errors?: ValidationIssue[];
  } = {
    snapshot_type: "listing",
    snapshot_id: crypto.randomUUID(),
    capture_job_id: input.artifact.capture_job_id,
    captured_at: input.artifact.captured_at,
    source_url: input.artifact.source_url,
    raw_storage_ref: input.rawStorageRef,
    parser_version: parserVersion("listing"),
    contract_version: CONTRACT_VERSION,
    listing_id: input.listingId,
    etsy_listing_id: String(metadata.etsy_listing_id ?? ""),
    shop_id: input.shopId,
    title: String(metadata.title ?? input.artifact.page.title ?? ""),
    status: (metadata.status as "active" | "inactive" | "unknown" | undefined) ?? "unknown",
    price: priceMetadata?.amount ? decimalToMoneyMinor(priceMetadata.amount, priceMetadata.currency ?? "USD") : undefined,
    price_missing_reason: priceMetadata?.amount ? undefined : "not_available",
    review_count: Number(metadata.review_count ?? 0),
    average_rating: Number(metadata.average_rating ?? 0),
    favorite_count: metadata.favorite_count == null ? null : Number(metadata.favorite_count),
    image_count: Number(metadata.image_count ?? 0),
    tags: Array.isArray(metadata.tags) ? metadata.tags.map((value) => String(value)) : [],
    attributes: typeof metadata.attributes === "object" && metadata.attributes ? metadata.attributes as Record<string, unknown> : {},
    is_digital: metadata.is_digital === true,
    field_sources: {
      title: "embedded_json",
      price: "embedded_json",
      review_count: "embedded_json",
      average_rating: "embedded_json",
      tags: "embedded_json"
    }
  };
  const validation = statusAndIssues(preliminary);
  return ListingSnapshotSchema.parse({ ...preliminary, ...validation });
}

export function extractSearchSnapshotFromEnvelope(input: {
  artifact: CapturedArtifactEnvelope;
  rawStorageRef: string;
  keywordId?: string;
}): SearchSnapshot {
  const metadata = input.artifact.page.metadata as Record<string, unknown>;
  const rawResults = Array.isArray(metadata.results) ? metadata.results as Record<string, unknown>[] : [];
  const results: SearchResultImpression[] = rawResults.map((result) => ({
    etsy_listing_id: String(result.etsy_listing_id ?? ""),
    listing_url: String(result.listing_url ?? "https://www.etsy.com/listing/1234567890/fallback"),
    rank_position: Number(result.rank_position ?? 1),
    page_number: Number(result.page_number ?? 1),
    absolute_rank: Number(result.absolute_rank ?? 1),
    ad_flag: Boolean(result.ad_flag),
    title: String(result.title ?? ""),
    price: decimalToMoneyMinor(String((result.price as { amount?: string } | undefined)?.amount ?? "0.00"), String((result.price as { currency?: string } | undefined)?.currency ?? "USD")),
    review_count: Number(result.review_count ?? 0),
    average_rating: Number(result.average_rating ?? 0)
  }));
  return SearchSnapshotSchema.parse({
    snapshot_type: "search",
    snapshot_id: crypto.randomUUID(),
    capture_job_id: input.artifact.capture_job_id,
    captured_at: input.artifact.captured_at,
    source_url: input.artifact.source_url,
    raw_storage_ref: input.rawStorageRef,
    parser_version: parserVersion("search"),
    contract_version: CONTRACT_VERSION,
    keyword_id: input.keywordId,
    query_term: String(metadata.query_term ?? input.artifact.target_ref),
    locale: String(metadata.locale ?? "en-US"),
    page_number: Number(metadata.page_number ?? 1),
    total_results_estimate: Number(metadata.total_results_estimate ?? 0),
    capture_reason: input.artifact.capture_reason,
    validator_status: results.length > 0 ? "valid" : "invalid",
    validation_errors: results.length > 0
      ? []
      : [{ code: "NO_SEARCH_RESULTS", message: "Search results could not be extracted.", field: "results", severity: "error" }],
    results
  });
}

export function toDecimalMoney(value: MoneyMinor | undefined) {
  return moneyMinorToDecimalString(value);
}
