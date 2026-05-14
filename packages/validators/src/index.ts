import type { ListingSnapshot, ValidationIssue } from "@etsy-oi/shared-types";

export function validateListingSnapshotGate(snapshot: ListingSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!snapshot.title.trim()) {
    issues.push({ code: "EMPTY_TITLE", message: "Listing title is required.", field: "title", severity: "error" });
  }
  if (!snapshot.price && !snapshot.price_missing_reason) {
    issues.push({
      code: "MISSING_PRICE",
      message: "Listing price or explicit price_missing_reason is required.",
      field: "price",
      severity: "error"
    });
  }
  if (!snapshot.raw_storage_ref) {
    issues.push({
      code: "MISSING_RAW_SOURCE",
      message: "Listing snapshot must reference a raw artifact.",
      field: "raw_storage_ref",
      severity: "error"
    });
  }

  return issues;
}
