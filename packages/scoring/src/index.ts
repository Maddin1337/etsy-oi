import {
  ACTIVE_SCORE_KEY,
  type ListingSnapshot,
  type ScoreSet,
  type SearchSnapshot
} from "@etsy-oi/shared-types";

export const OPPORTUNITY_V1_WEIGHTS = {
  demand: 35,
  competition: 25,
  momentum: 25,
  commercial_viability: 15
} as const;

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function computeOpportunityScore(input: Omit<ScoreSet, "opportunity_score" | "score_version">): ScoreSet {
  const opportunity =
    input.demand_score * 0.35 +
    (100 - input.competition_score) * 0.25 +
    input.momentum_score * 0.25 +
    input.commercial_viability_score * 0.15;

  return {
    ...input,
    opportunity_score: round(opportunity),
    score_version: ACTIVE_SCORE_KEY
  };
}

export function computeListingScores(snapshot: ListingSnapshot): {
  scores: ScoreSet;
  evidence: string[];
  observed_signal_count: number;
  estimated_signal_count: number;
  calculation_trace: Record<string, unknown>;
} {
  const demand = clamp((snapshot.review_count ?? 0) / 12 + ((snapshot.favorite_count ?? 0) / 18));
  const competition = clamp(46 + (snapshot.tags.length > 0 ? 3 : 0));
  const momentum = clamp((snapshot.average_rating ?? 0) * 12 + (snapshot.image_count ?? 0) * 1.2);
  const commercialViability = clamp((snapshot.price?.amount_minor ?? 0) / 100 + (snapshot.average_rating ?? 0) * 8);
  const confidence = snapshot.validator_status === "valid" ? 67 : snapshot.validator_status === "partial" ? 58 : 42;
  const scores = computeOpportunityScore({
    demand_score: round(demand),
    competition_score: round(competition),
    momentum_score: round(momentum),
    commercial_viability_score: round(commercialViability),
    confidence_score: confidence
  });

  return {
    scores,
    evidence: [
      "Listing-Snapshot wurde aus Raw-Artefakten normalisiert.",
      snapshot.average_rating ? `Bewertungssignal ${snapshot.average_rating.toFixed(1)} Sterne berücksichtigt.` : "Bewertungssignal nicht verfügbar.",
      snapshot.favorite_count == null ? "Favoritenzahl fehlt und reduziert die Sicherheit." : "Favoritenzahl stärkt das Nachfragesignal."
    ],
    observed_signal_count: [snapshot.review_count, snapshot.average_rating, snapshot.favorite_count, snapshot.price, snapshot.image_count]
      .filter((value) => value !== undefined && value !== null)
      .length,
    estimated_signal_count: 5,
    calculation_trace: {
      kind: "listing",
      inputs: {
        review_count: snapshot.review_count ?? null,
        average_rating: snapshot.average_rating ?? null,
        favorite_count: snapshot.favorite_count ?? null,
        image_count: snapshot.image_count ?? null,
        price_amount_minor: snapshot.price?.amount_minor ?? null
      }
    }
  };
}

export function computeKeywordScores(snapshot: SearchSnapshot): {
  scores: ScoreSet;
  evidence: string[];
  observed_signal_count: number;
  estimated_signal_count: number;
  calculation_trace: Record<string, unknown>;
  market_summary: {
    sampled_listing_count: number;
    median_price_amount_minor: number | null;
    median_review_count: number | null;
    ads_share: number;
  };
} {
  const prices = snapshot.results
    .map((result) => result.price?.amount_minor)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);
  const reviews = snapshot.results
    .map((result) => result.review_count)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);
  const ads = snapshot.results.filter((result) => result.ad_flag).length;
  const median = (values: number[]) => {
    if (values.length === 0) return null;
    const middle = Math.floor(values.length / 2);
    return values.length % 2 === 0 ? Math.round((values[middle - 1]! + values[middle]!) / 2) : values[middle]!;
  };
  const medianPrice = median(prices);
  const medianReviewCount = median(reviews);
  const demand = clamp((snapshot.total_results_estimate ?? 0) / 250 + (medianReviewCount ?? 0) / 5);
  const competition = clamp(40 + ads * 10 + snapshot.results.length * 1.5);
  const momentum = clamp((medianReviewCount ?? 0) / 3 + ((medianPrice ?? 0) / 100) * 1.5);
  const commercialViability = clamp(((medianPrice ?? 0) / 100) * 2.4);
  const confidence = snapshot.validator_status === "valid" ? 64 : snapshot.validator_status === "partial" ? 58 : 41;
  const scores = computeOpportunityScore({
    demand_score: round(demand),
    competition_score: round(competition),
    momentum_score: round(momentum),
    commercial_viability_score: round(commercialViability),
    confidence_score: confidence
  });
  const adsShare = snapshot.results.length === 0 ? 0 : round(ads / snapshot.results.length);

  return {
    scores,
    evidence: [
      "Search-Snapshot wurde aus den Top-Listings der Suchseite aggregiert.",
      `${snapshot.results.length} Listing-Impressionen wurden ausgewertet.`,
      ads > 0 ? "Anzeigenanteil erhöht den Wettbewerb moderat." : "Keine Anzeigen in der Stichprobe erkannt."
    ],
    observed_signal_count: snapshot.results.length,
    estimated_signal_count: snapshot.results.length,
    calculation_trace: {
      kind: "keyword",
      inputs: {
        total_results_estimate: snapshot.total_results_estimate ?? null,
        sampled_listing_count: snapshot.results.length,
        median_price_amount_minor: medianPrice,
        median_review_count: medianReviewCount,
        ads_share: adsShare
      }
    },
    market_summary: {
      sampled_listing_count: snapshot.results.length,
      median_price_amount_minor: medianPrice,
      median_review_count: medianReviewCount,
      ads_share: adsShare
    }
  };
}
