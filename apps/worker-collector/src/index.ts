import { CONTRACT_VERSION, CaptureReasonSchema } from "@etsy-oi/shared-types";

export type CollectorRuntimeConfig = {
  queueName: "listing-detail-collect" | "search-collect" | "shop-collect";
  rawStorageBucket: string;
};

export function getCollectorConfig(env = process.env): CollectorRuntimeConfig {
  return {
    queueName: "listing-detail-collect",
    rawStorageBucket: env.RAW_STORAGE_BUCKET ?? "etsy-raw-dev"
  };
}

export function describeCollector() {
  return {
    worker: "collector",
    contract_version: CONTRACT_VERSION,
    supported_capture_reasons: CaptureReasonSchema.options
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(describeCollector(), null, 2));
}
