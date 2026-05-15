export {
  ScoringStore,
  describeScoringWorker,
  getScoringConfig,
  processNextScoringJob,
  type ProcessedScoreJob,
  type ScoringRuntimeConfig
} from "@etsy-oi/pipeline";

import { describeScoringWorker, processNextScoringJob } from "@etsy-oi/pipeline";

const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 750);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScoringLoop() {
  let stopping = false;
  const stop = () => {
    stopping = true;
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(JSON.stringify({ worker: "scoring", status: "started", poll_interval_ms: pollIntervalMs }, null, 2));

  while (!stopping) {
    const result = await processNextScoringJob();
    if (result) {
      console.log(JSON.stringify({ worker: "scoring", status: "processed", result }, null, 2));
      continue;
    }

    await sleep(pollIntervalMs);
  }

  console.log(JSON.stringify({ worker: "scoring", status: "stopped" }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] ?? "run";

  if (mode === "describe") {
    console.log(JSON.stringify(describeScoringWorker(), null, 2));
  } else if (mode === "run-once") {
    const result = await processNextScoringJob();
    console.log(JSON.stringify({ processed: Boolean(result), result }, null, 2));
  } else {
    await runScoringLoop();
  }
}
