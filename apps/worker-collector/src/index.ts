export {
  CollectorStore,
  describeCollector,
  getCollectorConfig,
  processNextCaptureJob,
  type CaptureJobRow,
  type CollectorQueueName,
  type CollectorRuntimeConfig,
  type ProcessedCaptureJob
} from "@etsy-oi/pipeline";

import { describeCollector, processNextCaptureJob } from "@etsy-oi/pipeline";

const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 750);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCollectorLoop() {
  let stopping = false;
  const stop = () => {
    stopping = true;
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(JSON.stringify({ worker: "collector", status: "started", poll_interval_ms: pollIntervalMs }, null, 2));

  while (!stopping) {
    const result = await processNextCaptureJob();
    if (result) {
      console.log(JSON.stringify({ worker: "collector", status: "processed", result }, null, 2));
      continue;
    }

    await sleep(pollIntervalMs);
  }

  console.log(JSON.stringify({ worker: "collector", status: "stopped" }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] ?? "run";

  if (mode === "describe") {
    console.log(JSON.stringify(describeCollector(), null, 2));
  } else if (mode === "run-once") {
    const result = await processNextCaptureJob();
    console.log(JSON.stringify({ processed: Boolean(result), result }, null, 2));
  } else {
    await runCollectorLoop();
  }
}
