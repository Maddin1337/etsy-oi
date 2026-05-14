import { ACTIVE_SCORE_KEY, CONTRACT_VERSION } from "@etsy-oi/shared-types";

export function describeScoringWorker() {
  return {
    worker: "scoring",
    contract_version: CONTRACT_VERSION,
    active_score_key: ACTIVE_SCORE_KEY
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(describeScoringWorker(), null, 2));
}
