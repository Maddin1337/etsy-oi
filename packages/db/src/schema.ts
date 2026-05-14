import {
  boolean,
  bigint,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const analysisTypeEnum = pgEnum("analysis_type", ["keyword", "listing", "shop"]);
export const analysisStatusEnum = pgEnum("analysis_status", [
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
export const triggerSourceEnum = pgEnum("trigger_source", ["user", "scheduler", "rebuild", "canary"]);
export const dataQualityStatusEnum = pgEnum("data_quality_status", ["ok", "partial", "suspect"]);
export const captureJobTypeEnum = pgEnum("capture_job_type", [
  "search_capture",
  "listing_capture",
  "shop_capture",
  "reprocess"
]);
export const targetTypeEnum = pgEnum("target_type", ["keyword", "listing", "shop", "url"]);
export const captureReasonEnum = pgEnum("capture_reason", [
  "initial",
  "refresh",
  "debug",
  "canary",
  "rebuild",
  "keyword_analysis"
]);
export const captureJobStatusEnum = pgEnum("capture_job_status", [
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "blocked",
  "validation_failed"
]);
export const failureClassEnum = pgEnum("failure_class", [
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
export const artifactKindEnum = pgEnum("artifact_kind", [
  "html",
  "screenshot",
  "jsonld",
  "embedded_json",
  "network_response",
  "parser_io"
]);
export const retentionClassEnum = pgEnum("retention_class", ["short", "standard", "extended"]);
export const subjectTypeEnum = pgEnum("subject_type", ["keyword", "listing", "shop"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  ...timestamps
}, (table) => ({
  emailUnique: unique("users_email_unique").on(table.email)
}));

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  ...timestamps
}, (table) => ({
  slugUnique: unique("workspaces_slug_unique").on(table.slug)
}));

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  ...timestamps
}, (table) => ({
  workspaceNameUnique: unique("projects_workspace_name_unique").on(table.workspaceId, table.name)
}));

export const keywords = pgTable("keywords", {
  id: uuid("id").primaryKey().defaultRandom(),
  rawTerm: text("raw_term").notNull(),
  canonicalTerm: text("canonical_term").notNull(),
  locale: text("locale").notNull().default("en-US"),
  categoryHint: text("category_hint"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastAnalyzedAt: timestamp("last_analyzed_at", { withTimezone: true }),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps
}, (table) => ({
  canonicalLocaleUnique: unique("keywords_canonical_locale_unique").on(table.canonicalTerm, table.locale),
  lastAnalyzedAtIdx: index("keywords_last_analyzed_at_idx").on(table.lastAnalyzedAt)
}));

export const shops = pgTable("shops", {
  id: uuid("id").primaryKey().defaultRandom(),
  etsyShopId: text("etsy_shop_id"),
  shopName: text("shop_name").notNull(),
  canonicalShopUrl: text("canonical_shop_url").notNull(),
  sourceShopUrl: text("source_shop_url").notNull(),
  countryCode: text("country_code"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSnapshotAt: timestamp("last_snapshot_at", { withTimezone: true }),
  dataQualityStatus: dataQualityStatusEnum("data_quality_status").default("partial").notNull(),
  ...timestamps
}, (table) => ({
  etsyShopUnique: unique("shops_etsy_shop_id_unique").on(table.etsyShopId),
  canonicalShopUrlUnique: unique("shops_canonical_shop_url_unique").on(table.canonicalShopUrl)
}));

export const listings = pgTable("listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  etsyListingId: text("etsy_listing_id"),
  shopId: uuid("shop_id").references(() => shops.id),
  canonicalListingUrl: text("canonical_listing_url").notNull(),
  sourceListingUrl: text("source_listing_url").notNull(),
  title: text("title").notNull(),
  status: text("status").default("unknown").notNull(),
  categoryHint: text("category_hint"),
  primaryCurrencyCode: char("primary_currency_code", { length: 3 }),
  createdAtSource: timestamp("created_at_source", { withTimezone: true }),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSnapshotAt: timestamp("last_snapshot_at", { withTimezone: true }),
  lastParserVersion: text("last_parser_version"),
  dataQualityStatus: dataQualityStatusEnum("data_quality_status").default("partial").notNull(),
  ...timestamps
}, (table) => ({
  etsyListingUnique: unique("listings_etsy_listing_id_unique").on(table.etsyListingId),
  canonicalListingUrlUnique: unique("listings_canonical_listing_url_unique").on(table.canonicalListingUrl),
  shopIdx: index("listings_shop_id_idx").on(table.shopId),
  lastSnapshotIdx: index("listings_last_snapshot_at_idx").on(table.lastSnapshotAt)
}));

export const analyses = pgTable("analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  projectId: uuid("project_id").references(() => projects.id),
  analysisType: analysisTypeEnum("analysis_type").notNull(),
  subjectKeywordId: uuid("subject_keyword_id").references(() => keywords.id),
  subjectListingId: uuid("subject_listing_id").references(() => listings.id),
  subjectShopId: uuid("subject_shop_id").references(() => shops.id),
  status: analysisStatusEnum("status").default("queued").notNull(),
  requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
  triggerSource: triggerSourceEnum("trigger_source").default("user").notNull(),
  refreshOfAnalysisId: uuid("refresh_of_analysis_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  errorCode: text("error_code"),
  errorDetail: jsonb("error_detail"),
  retryCount: integer("retry_count").default(0).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ...timestamps
}, (table) => ({
  idempotencyUnique: unique("analyses_idempotency_key_unique").on(table.idempotencyKey),
  workspaceStatusIdx: index("analyses_workspace_status_idx").on(table.workspaceId, table.status),
  subjectMatchesType: check(
    "analyses_exactly_one_subject_check",
    sql`(
      (${table.analysisType} = 'keyword' and ${table.subjectKeywordId} is not null and ${table.subjectListingId} is null and ${table.subjectShopId} is null) or
      (${table.analysisType} = 'listing' and ${table.subjectKeywordId} is null and ${table.subjectListingId} is not null and ${table.subjectShopId} is null) or
      (${table.analysisType} = 'shop' and ${table.subjectKeywordId} is null and ${table.subjectListingId} is null and ${table.subjectShopId} is not null)
    )`
  )
}));

export const captureJobs = pgTable("capture_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisId: uuid("analysis_id").references(() => analyses.id),
  jobType: captureJobTypeEnum("job_type").notNull(),
  targetType: targetTypeEnum("target_type").notNull(),
  targetRef: text("target_ref").notNull(),
  sourceUrl: text("source_url").notNull(),
  captureReason: captureReasonEnum("capture_reason").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: captureJobStatusEnum("status").default("queued").notNull(),
  failureClass: failureClassEnum("failure_class"),
  workerQueue: text("worker_queue").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ...timestamps
}, (table) => ({
  idempotencyUnique: unique("capture_jobs_idempotency_key_unique").on(table.idempotencyKey),
  analysisIdx: index("capture_jobs_analysis_id_idx").on(table.analysisId),
  queueStatusIdx: index("capture_jobs_queue_status_idx").on(table.workerQueue, table.status)
}));

export const rawArtifacts = pgTable("raw_artifacts", {
  id: uuid("artifact_id").primaryKey().defaultRandom(),
  captureJobId: uuid("capture_job_id").notNull().references(() => captureJobs.id),
  artifactKind: artifactKindEnum("artifact_kind").notNull(),
  storagePath: text("storage_path").notNull(),
  contentType: text("content_type").notNull(),
  contentSha256: text("content_sha256").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  retentionClass: retentionClassEnum("retention_class").default("standard").notNull(),
  encryptionStatus: text("encryption_status").notNull()
}, (table) => ({
  storagePathUnique: unique("raw_artifacts_storage_path_unique").on(table.storagePath),
  captureJobIdx: index("raw_artifacts_capture_job_id_idx").on(table.captureJobId)
}));

export const scoreVersions = pgTable("score_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  scoreKey: text("score_key").notNull(),
  version: text("version").notNull(),
  weightsJson: jsonb("weights_json").notNull(),
  changelogMd: text("changelog_md").notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  scoreVersionUnique: unique("score_versions_key_version_unique").on(table.scoreKey, table.version)
}));

export const currentEntityScores = pgTable("current_entity_scores", {
  subjectType: subjectTypeEnum("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  scoreVersionId: uuid("score_version_id").notNull().references(() => scoreVersions.id),
  opportunityScore: numeric("opportunity_score", { precision: 5, scale: 2 }).notNull(),
  demandScore: numeric("demand_score", { precision: 5, scale: 2 }).notNull(),
  competitionScore: numeric("competition_score", { precision: 5, scale: 2 }).notNull(),
  momentumScore: numeric("momentum_score", { precision: 5, scale: 2 }).notNull(),
  commercialViabilityScore: numeric("commercial_viability_score", { precision: 5, scale: 2 }).notNull(),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull(),
  evidenceSummaryJson: jsonb("evidence_summary_json").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  currentScoreUnique: unique("current_entity_scores_subject_unique").on(table.subjectType, table.subjectId),
  scoreVersionIdx: index("current_entity_scores_score_version_id_idx").on(table.scoreVersionId)
}));
