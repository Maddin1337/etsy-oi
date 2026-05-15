export {
  ScoringStore,
  describeScoringWorker,
  getScoringConfig,
  processNextScoringJob,
  type ProcessedScoreJob,
  type ScoringRuntimeConfig
} from "@etsy-oi/pipeline";

import { describeScoringWorker, processNextScoringJob } from "@etsy-oi/pipeline";

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] ?? "describe";
  if (mode === "run-once") {
    const result = await processNextScoringJob();
    console.log(JSON.stringify({ processed: Boolean(result), result }, null, 2));
  } else {
    console.log(JSON.stringify(describeScoringWorker(), null, 2));
  }
}
