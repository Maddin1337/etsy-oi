export {
  ParserStore,
  describeParserWorker,
  getParserConfig,
  processNextParserJob,
  type ParserRuntimeConfig,
  type ProcessedParserJob
} from "@etsy-oi/pipeline";

import { describeParserWorker, processNextParserJob } from "@etsy-oi/pipeline";

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] ?? "describe";
  if (mode === "run-once") {
    const result = await processNextParserJob();
    console.log(JSON.stringify({ processed: Boolean(result), result }, null, 2));
  } else {
    console.log(JSON.stringify(describeParserWorker(), null, 2));
  }
}
