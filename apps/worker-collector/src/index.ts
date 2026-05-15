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

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] ?? "describe";
  if (mode === "run-once") {
    const result = await processNextCaptureJob();
    console.log(JSON.stringify({ processed: Boolean(result), result }, null, 2));
  } else {
    console.log(JSON.stringify(describeCollector(), null, 2));
  }
}
