import { SnapshotValidationStatusSchema } from "@etsy-oi/shared-types";

export const adminBootstrap = {
  app: "admin",
  focus: ["snapshots", "validator-errors", "drift-indicators", "raw-artifact-references"] as const,
  validationStatuses: SnapshotValidationStatusSchema.options
};

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(adminBootstrap, null, 2));
}
