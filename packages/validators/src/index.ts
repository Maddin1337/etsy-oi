import type { ListingSnapshot, SearchSnapshot, ValidationIssue } from "@etsy-oi/shared-types";

function hasError(issues: ValidationIssue[]) {
  return issues.some((issue) => issue.severity === "error");
}

export function validateListingSnapshotGate(snapshot: ListingSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [...snapshot.validation_errors];

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

export function validateSearchSnapshotGate(snapshot: SearchSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [...snapshot.validation_errors];

  if (!snapshot.query_term.trim()) {
    issues.push({ code: "EMPTY_QUERY", message: "Search snapshot requires query_term.", field: "query_term", severity: "error" });
  }
  if (snapshot.results.length === 0) {
    issues.push({ code: "EMPTY_RESULTS", message: "Search snapshot requires at least one result.", field: "results", severity: "error" });
  }
  if (!snapshot.raw_storage_ref) {
    issues.push({ code: "MISSING_RAW_SOURCE", message: "Search snapshot must reference a raw artifact.", field: "raw_storage_ref", severity: "error" });
  }

  return issues;
}

export function deriveValidatorStatus(issues: ValidationIssue[]): "valid" | "partial" | "invalid" {
  if (issues.length === 0) return "valid";
  return hasError(issues) ? "invalid" : "partial";
}
