export {
  ParserStore,
  describeParserWorker,
  getParserConfig,
  processNextParserJob,
  type ParserRuntimeConfig,
  type ProcessedParserJob
} from "@etsy-oi/pipeline";

import { describeParserWorker, processNextParserJob } from "@etsy-oi/pipeline";

const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 750);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runParserLoop() {
  let stopping = false;
  const stop = () => {
    stopping = true;
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(JSON.stringify({ worker: "parser", status: "started", poll_interval_ms: pollIntervalMs }, null, 2));

  while (!stopping) {
    const result = await processNextParserJob();
    if (result) {
      console.log(JSON.stringify({ worker: "parser", status: "processed", result }, null, 2));
      continue;
    }

    await sleep(pollIntervalMs);
  }

  console.log(JSON.stringify({ worker: "parser", status: "stopped" }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] ?? "run";

  if (mode === "describe") {
    console.log(JSON.stringify(describeParserWorker(), null, 2));
  } else if (mode === "run-once") {
    const result = await processNextParserJob();
    console.log(JSON.stringify({ processed: Boolean(result), result }, null, 2));
  } else {
    await runParserLoop();
  }
}
