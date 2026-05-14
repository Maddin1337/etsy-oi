import { CONTRACT_VERSION } from "@etsy-oi/shared-types";

export const PARSER_PIPELINE_ORDER = ["json_ld", "embedded_json", "network", "dom"] as const;

export function describeParserWorker() {
  return {
    worker: "parser",
    contract_version: CONTRACT_VERSION,
    extraction_order: PARSER_PIPELINE_ORDER
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(describeParserWorker(), null, 2));
}
