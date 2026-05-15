import { z } from "zod";

export const CONTRACT_VERSION = "v1" as const;
export const DEFAULT_LOCALE = "en-US" as const;
export const ACTIVE_SCORE_KEY = "opportunity_v1" as const;
export const KEYWORD_TOP_LISTING_LIMIT = 24 as const;

export const ContractVersionSchema = z.literal(CONTRACT_VERSION);

export const LocaleSchema = z.literal(DEFAULT_LOCALE);

export const AnalysisTypeSchema = z.enum(["keyword", "listing", "shop"]);
export type AnalysisType = z.infer<typeof AnalysisTypeSchema>;

export const AnalysisStatusSchema = z.enum([
  "queued",
  "running",
  "partial",
  "completed",
  "failed",
  "blocked",
  "validation_failed",
  "stale",
  "refreshed",
  "cancelled"
]);
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

export const WorkerJobStatusSchema = z.enum([
  "queued",
  "leased",
  "running",
  "succeeded",
  "failed_retryable",
  "failed_terminal",
  "dead_lettered",
  "skipped"
]);
export type WorkerJobStatus = z.infer<typeof WorkerJobStatusSchema>;

export const SnapshotValidationStatusSchema = z.enum([
  "valid",
  "partial",
  "invalid",
  "blocked",
  "parser_drift"
]);
export type SnapshotValidationStatus = z.infer<typeof SnapshotValidationStatusSchema>;

export const FailureClassSchema = z.enum([
  "network_error",
  "timeout",
  "blocked_captcha",
  "parser_drift",
  "semantic_gap",
  "validation_failed",
  "rate_limited",
  "dependency_unavailable",
  "budget_exhausted",
  "internal_error"
]);
export type FailureClass = z.infer<typeof FailureClassSchema>;

export const DataQualityStatusSchema = z.enum(["ok", "partial", "suspect"]);
export type DataQualityStatus = z.infer<typeof DataQualityStatusSchema>;

export const PrioritySchema = z.enum(["low", "normal", "high"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const RefreshPolicySchema = z.enum(["never", "if_stale", "force"]);
export type RefreshPolicy = z.infer<typeof RefreshPolicySchema>;

export const TriggerSourceSchema = z.enum(["user", "scheduler", "rebuild", "canary"]);
export type TriggerSource = z.infer<typeof TriggerSourceSchema>;

export const CaptureReasonSchema = z.enum([
  "initial",
  "refresh",
  "debug",
  "canary",
  "rebuild",
  "keyword_analysis"
]);
export type CaptureReason = z.infer<typeof CaptureReasonSchema>;

export const CaptureJobTypeSchema = z.enum([
  "search_capture",
  "listing_capture",
  "shop_capture",
  "reprocess"
]);
export type CaptureJobType = z.infer<typeof CaptureJobTypeSchema>;

export const TargetTypeSchema = z.enum(["keyword", "listing", "shop", "url"]);
export type TargetType = z.infer<typeof TargetTypeSchema>;

export const SubjectTypeSchema = z.enum(["keyword", "listing", "shop"]);
export type SubjectType = z.infer<typeof SubjectTypeSchema>;

export const MoneyMinorSchema = z.object({
  amount_minor: z.number().int().nonnegative(),
  currency_code: z.string().length(3)
});
export type MoneyMinor = z.infer<typeof MoneyMinorSchema>;

export const ApiMoneySchema = z.object({
  amount: z.string().regex(/^-?\d+(\.\d{2})$/),
  currency: z.string().length(3)
});
export type ApiMoney = z.infer<typeof ApiMoneySchema>;

export const FieldSourceSchema = z.enum(["json_ld", "embedded_json", "network", "dom", "derived"]);
export type FieldSource = z.infer<typeof FieldSourceSchema>;

export const ValidationIssueSchema = z.object({
  code: z.string().min(2),
  message: z.string().min(1),
  field: z.string().optional(),
  severity: z.enum(["warning", "error"]).default("error")
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const ScoreSetSchema = z.object({
  opportunity_score: z.number().min(0).max(100),
  demand_score: z.number().min(0).max(100),
  competition_score: z.number().min(0).max(100),
  momentum_score: z.number().min(0).max(100),
  commercial_viability_score: z.number().min(0).max(100),
  confidence_score: z.number().min(0).max(100),
  score_version: z.string().default(ACTIVE_SCORE_KEY)
});
export type ScoreSet = z.infer<typeof ScoreSetSchema>;

export const ParsedSnapshotBaseSchema = z.object({
  snapshot_id: z.string().uuid(),
  capture_job_id: z.string().uuid(),
  captured_at: z.string().datetime(),
  source_url: z.string().url(),
  raw_storage_ref: z.string().min(1),
  parser_version: z.string().min(1),
  validator_status: SnapshotValidationStatusSchema,
  validation_errors: z.array(ValidationIssueSchema).default([]),
  contract_version: ContractVersionSchema.default(CONTRACT_VERSION)
});

export const SearchResultImpressionSchema = z.object({
  listing_id: z.string().uuid().optional(),
  etsy_listing_id: z.string().optional(),
  listing_url: z.string().url(),
  rank_position: z.number().int().positive(),
  page_number: z.number().int().positive(),
  absolute_rank: z.number().int().positive(),
  ad_flag: z.boolean(),
  title: z.string().optional(),
  price: MoneyMinorSchema.optional(),
  shop_id: z.string().uuid().optional(),
  review_count: z.number().int().nonnegative().optional(),
  average_rating: z.number().min(0).max(5).optional()
});
export type SearchResultImpression = z.infer<typeof SearchResultImpressionSchema>;

export const SearchSnapshotSchema = ParsedSnapshotBaseSchema.extend({
  snapshot_type: z.literal("search"),
  keyword_id: z.string().uuid().optional(),
  query_term: z.string().min(2).max(120),
  locale: LocaleSchema.default(DEFAULT_LOCALE),
  page_number: z.number().int().positive(),
  total_results_estimate: z.number().int().nonnegative().optional(),
  capture_reason: CaptureReasonSchema,
  results: z.array(SearchResultImpressionSchema).max(KEYWORD_TOP_LISTING_LIMIT)
});
export type SearchSnapshot = z.infer<typeof SearchSnapshotSchema>;

export const ListingSnapshotSchema = ParsedSnapshotBaseSchema.extend({
  snapshot_type: z.literal("listing"),
  listing_id: z.string().uuid().optional(),
  etsy_listing_id: z.string().optional(),
  shop_id: z.string().uuid().optional(),
  etsy_shop_id: z.string().optional(),
  title: z.string().min(1),
  status: z.enum(["active", "inactive", "unknown"]).default("unknown"),
  price: MoneyMinorSchema.optional(),
  price_missing_reason: z.string().optional(),
  review_count: z.number().int().nonnegative().optional(),
  average_rating: z.number().min(0).max(5).optional(),
  favorite_count: z.number().int().nonnegative().nullable().optional(),
  image_count: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).default([]),
  attributes: z.record(z.unknown()).default({}),
  is_digital: z.boolean().optional(),
  field_sources: z.record(FieldSourceSchema).default({})
}).superRefine((snapshot, ctx) => {
  if (!snapshot.price && !snapshot.price_missing_reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["price"],
      message: "Listing snapshot requires price or price_missing_reason."
    });
  }
});
export type ListingSnapshot = z.infer<typeof ListingSnapshotSchema>;

export const ShopSnapshotSchema = ParsedSnapshotBaseSchema.extend({
  snapshot_type: z.literal("shop"),
  shop_id: z.string().uuid().optional(),
  etsy_shop_id: z.string().optional(),
  shop_name: z.string().min(1),
  canonical_shop_url: z.string().url().optional(),
  rating: z.number().min(0).max(5).optional(),
  review_count: z.number().int().nonnegative().optional(),
  total_sales_public_proxy: z.number().int().nonnegative().optional(),
  admirers_count: z.number().int().nonnegative().optional(),
  country_code: z.string().length(2).optional()
});
export type ShopSnapshot = z.infer<typeof ShopSnapshotSchema>;

export const ScoreSnapshotSchema = z.object({
  score_snapshot_id: z.string().uuid(),
  subject_type: SubjectTypeSchema,
  subject_id: z.string().uuid(),
  captured_at: z.string().datetime(),
  score_version_id: z.string().uuid(),
  scores: ScoreSetSchema,
  observed_signal_count: z.number().int().nonnegative(),
  estimated_signal_count: z.number().int().nonnegative(),
  evidence: z.array(z.string()).default([]),
  calculation_trace: z.record(z.unknown()).default({}),
  snapshot_dedupe_key: z.string().min(1),
  contract_version: ContractVersionSchema.default(CONTRACT_VERSION)
});
export type ScoreSnapshot = z.infer<typeof ScoreSnapshotSchema>;

export const CreateKeywordAnalysisRequestSchema = z.object({
  term: z.string().trim().min(2).max(120),
  locale: LocaleSchema.default(DEFAULT_LOCALE),
  category_hint: z.string().nullable().optional(),
  priority: PrioritySchema.default("normal"),
  refresh_policy: RefreshPolicySchema.default("if_stale"),
  project_id: z.string().uuid().nullable().optional()
});
export type CreateKeywordAnalysisRequest = z.infer<typeof CreateKeywordAnalysisRequestSchema>;

export const CreateListingAnalysisRequestSchema = z.object({
  listing_url: z.string().url().regex(/^https?:\/\/([a-z0-9-]+\.)?etsy\.com\/listing\/\d+(\/|[?#]|$)/i, {
    message: "listing_url must be an Etsy listing URL."
  }),
  priority: PrioritySchema.default("normal"),
  refresh_policy: RefreshPolicySchema.default("if_stale"),
  project_id: z.string().uuid().nullable().optional()
});
export type CreateListingAnalysisRequest = z.infer<typeof CreateListingAnalysisRequestSchema>;

export const AnalysisProgressSchema = z.object({
  phase: z.string(),
  percent: z.number().min(0).max(100),
  steps_total: z.number().int().nonnegative(),
  steps_completed: z.number().int().nonnegative()
});
export type AnalysisProgress = z.infer<typeof AnalysisProgressSchema>;

export const AnalysisDtoSchema = z.object({
  id: z.string(),
  type: AnalysisTypeSchema,
  status: AnalysisStatusSchema,
  workflow_id: z.string().optional(),
  progress: AnalysisProgressSchema.optional(),
  error_code: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  retry_count: z.number().int().nonnegative().default(0),
  created_at: z.string().datetime(),
  started_at: z.string().datetime().nullable().optional(),
  finished_at: z.string().datetime().nullable().optional(),
  stale_at: z.string().datetime().nullable().optional()
});
export type AnalysisDto = z.infer<typeof AnalysisDtoSchema>;

export const CreateAnalysisResponseSchema = z.object({
  analysis: AnalysisDtoSchema,
  normalized_input: z.record(z.string()).optional(),
  idempotency: z.object({
    key: z.string(),
    replayed: z.boolean()
  })
});
export type CreateAnalysisResponse = z.infer<typeof CreateAnalysisResponseSchema>;

export const WarningSchema = z.object({
  code: z.string(),
  message: z.string()
});
export type Warning = z.infer<typeof WarningSchema>;

export const KeywordResultSummarySchema = z.object({
  analysis_id: z.string(),
  type: z.literal("keyword"),
  status: AnalysisStatusSchema,
  keyword: z.object({
    id: z.string(),
    term: z.string(),
    locale: LocaleSchema,
    category_hint: z.string().nullable()
  }),
  market_summary: z.object({
    total_results_estimate: z.number().int().nonnegative().nullable(),
    sampled_listing_count: z.number().int().nonnegative(),
    median_price: ApiMoneySchema.nullable(),
    median_review_count: z.number().int().nonnegative().nullable(),
    ads_share: z.number().min(0).max(1).nullable()
  }),
  scores: ScoreSetSchema,
  explanations: z.array(z.string()),
  top_listings: z.array(z.record(z.unknown())),
  artifacts: z.record(z.unknown()),
  warnings: z.array(WarningSchema).default([])
});
export type KeywordResultSummary = z.infer<typeof KeywordResultSummarySchema>;

export const ListingResultSummarySchema = z.object({
  analysis_id: z.string(),
  type: z.literal("listing"),
  status: AnalysisStatusSchema,
  listing: z.object({
    listing_id: z.string(),
    etsy_listing_id: z.string().nullable(),
    url: z.string().url(),
    title: z.string(),
    shop_id: z.string().nullable(),
    category: z.string().nullable()
  }),
  snapshot: z.record(z.unknown()),
  scores: ScoreSetSchema,
  explanations: z.array(z.string()),
  artifacts: z.record(z.unknown()),
  warnings: z.array(WarningSchema).default([])
});
export type ListingResultSummary = z.infer<typeof ListingResultSummarySchema>;

export const CaptureJobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "blocked",
  "validation_failed"
]);
export type CaptureJobStatus = z.infer<typeof CaptureJobStatusSchema>;

export const CaptureJobDtoSchema = z.object({
  id: z.string(),
  analysis_id: z.string(),
  status: CaptureJobStatusSchema,
  job_type: CaptureJobTypeSchema,
  target_type: TargetTypeSchema,
  target_ref: z.string(),
  source_url: z.string(),
  capture_reason: CaptureReasonSchema,
  worker_queue: z.string(),
  attempt_count: z.number().int().nonnegative(),
  started_at: z.string().datetime().nullable().optional(),
  finished_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime()
});
export type CaptureJobDto = z.infer<typeof CaptureJobDtoSchema>;

export const AnalysisWorkflowSchema = z.object({
  capture_jobs: z.array(CaptureJobDtoSchema)
});
export type AnalysisWorkflow = z.infer<typeof AnalysisWorkflowSchema>;

export const AnalysisDetailResponseSchema = z.object({
  analysis: AnalysisDtoSchema,
  result: z.union([KeywordResultSummarySchema, ListingResultSummarySchema]).nullable(),
  workflow: AnalysisWorkflowSchema
});
export type AnalysisDetailResponse = z.infer<typeof AnalysisDetailResponseSchema>;

export const KeywordAnalysisWorkflowInputSchema = z.object({
  analysis_id: z.string(),
  workspace_id: z.string(),
  keyword: z.object({
    term: z.string(),
    locale: LocaleSchema,
    category_hint: z.string().nullable()
  }),
  priority: PrioritySchema,
  requested_at: z.string().datetime(),
  idempotency_key: z.string(),
  contract_version: ContractVersionSchema
});
export type KeywordAnalysisWorkflowInput = z.infer<typeof KeywordAnalysisWorkflowInputSchema>;

export const ListingAnalysisWorkflowInputSchema = z.object({
  analysis_id: z.string(),
  workspace_id: z.string(),
  listing_url: z.string().url(),
  priority: PrioritySchema,
  requested_at: z.string().datetime(),
  idempotency_key: z.string(),
  contract_version: ContractVersionSchema
});
export type ListingAnalysisWorkflowInput = z.infer<typeof ListingAnalysisWorkflowInputSchema>;

export const ListingDetailCollectJobSchema = z.object({
  job_id: z.string(),
  analysis_id: z.string(),
  parent_workflow_id: z.string(),
  listing_url: z.string().url(),
  rank_position: z.number().int().positive(),
  page_number: z.number().int().positive(),
  query_term: z.string(),
  locale: LocaleSchema,
  capture_reason: z.literal("keyword_analysis"),
  dedupe_key: z.string(),
  attempt: z.number().int().nonnegative(),
  contract_version: ContractVersionSchema
});
export type ListingDetailCollectJob = z.infer<typeof ListingDetailCollectJobSchema>;

export class DomainFailure extends Error {
  readonly failureClass: FailureClass;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(failureClass: FailureClass, message: string, options: { retryable?: boolean; details?: unknown } = {}) {
    super(message);
    this.name = "DomainFailure";
    this.failureClass = failureClass;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export class ValidationFailure extends DomainFailure {
  constructor(message: string, details?: unknown) {
    super("validation_failed", message, { retryable: false, details });
    this.name = "ValidationFailure";
  }
}

export class ParserDriftFailure extends DomainFailure {
  constructor(message: string, details?: unknown) {
    super("parser_drift", message, { retryable: false, details });
    this.name = "ParserDriftFailure";
  }
}

export class RetryableDependencyFailure extends DomainFailure {
  constructor(message: string, details?: unknown) {
    super("dependency_unavailable", message, { retryable: true, details });
    this.name = "RetryableDependencyFailure";
  }
}
