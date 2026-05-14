import { ACTIVE_SCORE_KEY, type ScoreSet } from "@etsy-oi/shared-types";

export const OPPORTUNITY_V1_WEIGHTS = {
  demand: 35,
  competition: 25,
  momentum: 25,
  commercial_viability: 15
} as const;

export function computeOpportunityScore(input: Omit<ScoreSet, "opportunity_score" | "score_version">): ScoreSet {
  const opportunity =
    input.demand_score * 0.35 +
    (100 - input.competition_score) * 0.25 +
    input.momentum_score * 0.25 +
    input.commercial_viability_score * 0.15;

  return {
    ...input,
    opportunity_score: Math.round(opportunity * 100) / 100,
    score_version: ACTIVE_SCORE_KEY
  };
}
