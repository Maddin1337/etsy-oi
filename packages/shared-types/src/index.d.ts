import { z } from "zod";
export declare const CONTRACT_VERSION: "v1";
export declare const DEFAULT_LOCALE: "en-US";
export declare const ACTIVE_SCORE_KEY: "opportunity_v1";
export declare const KEYWORD_TOP_LISTING_LIMIT: 24;
export declare const ContractVersionSchema: z.ZodLiteral<"v1">;
export declare const LocaleSchema: z.ZodLiteral<"en-US">;
export declare const AnalysisTypeSchema: z.ZodEnum<["keyword", "listing", "shop"]>;
export type AnalysisType = z.infer<typeof AnalysisTypeSchema>;
export declare const AnalysisStatusSchema: z.ZodEnum<["queued", "running", "partial", "completed", "failed", "blocked", "validation_failed", "stale", "refreshed", "cancelled"]>;
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;
export declare const WorkerJobStatusSchema: z.ZodEnum<["queued", "leased", "running", "succeeded", "failed_retryable", "failed_terminal", "dead_lettered", "skipped"]>;
export type WorkerJobStatus = z.infer<typeof WorkerJobStatusSchema>;
export declare const SnapshotValidationStatusSchema: z.ZodEnum<["valid", "partial", "invalid", "blocked", "parser_drift"]>;
export type SnapshotValidationStatus = z.infer<typeof SnapshotValidationStatusSchema>;
export declare const FailureClassSchema: z.ZodEnum<["network_error", "timeout", "blocked_captcha", "parser_drift", "semantic_gap", "validation_failed", "rate_limited", "dependency_unavailable", "budget_exhausted", "internal_error"]>;
export type FailureClass = z.infer<typeof FailureClassSchema>;
export declare const DataQualityStatusSchema: z.ZodEnum<["ok", "partial", "suspect"]>;
export type DataQualityStatus = z.infer<typeof DataQualityStatusSchema>;
export declare const PrioritySchema: z.ZodEnum<["low", "normal", "high"]>;
export type Priority = z.infer<typeof PrioritySchema>;
export declare const RefreshPolicySchema: z.ZodEnum<["never", "if_stale", "force"]>;
export type RefreshPolicy = z.infer<typeof RefreshPolicySchema>;
export declare const TriggerSourceSchema: z.ZodEnum<["user", "scheduler", "rebuild", "canary"]>;
export type TriggerSource = z.infer<typeof TriggerSourceSchema>;
export declare const CaptureReasonSchema: z.ZodEnum<["initial", "refresh", "debug", "canary", "rebuild", "keyword_analysis"]>;
export type CaptureReason = z.infer<typeof CaptureReasonSchema>;
export declare const CaptureJobTypeSchema: z.ZodEnum<["search_capture", "listing_capture", "shop_capture", "reprocess"]>;
export type CaptureJobType = z.infer<typeof CaptureJobTypeSchema>;
export declare const TargetTypeSchema: z.ZodEnum<["keyword", "listing", "shop", "url"]>;
export type TargetType = z.infer<typeof TargetTypeSchema>;
export declare const SubjectTypeSchema: z.ZodEnum<["keyword", "listing", "shop"]>;
export type SubjectType = z.infer<typeof SubjectTypeSchema>;
export declare const MoneyMinorSchema: z.ZodObject<{
    amount_minor: z.ZodNumber;
    currency_code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    amount_minor: number;
    currency_code: string;
}, {
    amount_minor: number;
    currency_code: string;
}>;
export type MoneyMinor = z.infer<typeof MoneyMinorSchema>;
export declare const ApiMoneySchema: z.ZodObject<{
    amount: z.ZodString;
    currency: z.ZodString;
}, "strip", z.ZodTypeAny, {
    amount: string;
    currency: string;
}, {
    amount: string;
    currency: string;
}>;
export type ApiMoney = z.infer<typeof ApiMoneySchema>;
export declare const FieldSourceSchema: z.ZodEnum<["json_ld", "embedded_json", "network", "dom", "derived"]>;
export type FieldSource = z.infer<typeof FieldSourceSchema>;
export declare const ValidationIssueSchema: z.ZodObject<{
    code: z.ZodString;
    message: z.ZodString;
    field: z.ZodOptional<z.ZodString>;
    severity: z.ZodDefault<z.ZodEnum<["warning", "error"]>>;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    severity: "warning" | "error";
    field?: string | undefined;
}, {
    code: string;
    message: string;
    field?: string | undefined;
    severity?: "warning" | "error" | undefined;
}>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export declare const ScoreSetSchema: z.ZodObject<{
    opportunity_score: z.ZodNumber;
    demand_score: z.ZodNumber;
    competition_score: z.ZodNumber;
    momentum_score: z.ZodNumber;
    commercial_viability_score: z.ZodNumber;
    confidence_score: z.ZodNumber;
    score_version: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    opportunity_score: number;
    demand_score: number;
    competition_score: number;
    momentum_score: number;
    commercial_viability_score: number;
    confidence_score: number;
    score_version: string;
}, {
    opportunity_score: number;
    demand_score: number;
    competition_score: number;
    momentum_score: number;
    commercial_viability_score: number;
    confidence_score: number;
    score_version?: string | undefined;
}>;
export type ScoreSet = z.infer<typeof ScoreSetSchema>;
export declare const ParsedSnapshotBaseSchema: z.ZodObject<{
    snapshot_id: z.ZodString;
    capture_job_id: z.ZodString;
    captured_at: z.ZodString;
    source_url: z.ZodString;
    raw_storage_ref: z.ZodString;
    parser_version: z.ZodString;
    validator_status: z.ZodEnum<["valid", "partial", "invalid", "blocked", "parser_drift"]>;
    validation_errors: z.ZodDefault<z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        field: z.ZodOptional<z.ZodString>;
        severity: z.ZodDefault<z.ZodEnum<["warning", "error"]>>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        severity: "warning" | "error";
        field?: string | undefined;
    }, {
        code: string;
        message: string;
        field?: string | undefined;
        severity?: "warning" | "error" | undefined;
    }>, "many">>;
    contract_version: z.ZodDefault<z.ZodLiteral<"v1">>;
}, "strip", z.ZodTypeAny, {
    snapshot_id: string;
    capture_job_id: string;
    captured_at: string;
    source_url: string;
    raw_storage_ref: string;
    parser_version: string;
    validator_status: "valid" | "partial" | "blocked" | "invalid" | "parser_drift";
    validation_errors: {
        code: string;
        message: string;
        severity: "warning" | "error";
        field?: string | undefined;
    }[];
    contract_version: "v1";
}, {
    snapshot_id: string;
    capture_job_id: string;
    captured_at: string;
    source_url: string;
    raw_storage_ref: string;
    parser_version: string;
    validator_status: "valid" | "partial" | "blocked" | "invalid" | "parser_drift";
    validation_errors?: {
        code: string;
        message: string;
        field?: string | undefined;
        severity?: "warning" | "error" | undefined;
    }[] | undefined;
    contract_version?: "v1" | undefined;
}>;
export declare const SearchResultImpressionSchema: z.ZodObject<{
    listing_id: z.ZodOptional<z.ZodString>;
    etsy_listing_id: z.ZodOptional<z.ZodString>;
    listing_url: z.ZodString;
    rank_position: z.ZodNumber;
    page_number: z.ZodNumber;
    absolute_rank: z.ZodNumber;
    ad_flag: z.ZodBoolean;
    title: z.ZodOptional<z.ZodString>;
    price: z.ZodOptional<z.ZodObject<{
        amount_minor: z.ZodNumber;
        currency_code: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        amount_minor: number;
        currency_code: string;
    }, {
        amount_minor: number;
        currency_code: string;
    }>>;
    shop_id: z.ZodOptional<z.ZodString>;
    review_count: z.ZodOptional<z.ZodNumber>;
    average_rating: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    listing_url: string;
    rank_position: number;
    page_number: number;
    absolute_rank: number;
    ad_flag: boolean;
    listing_id?: string | undefined;
    etsy_listing_id?: string | undefined;
    title?: string | undefined;
    price?: {
        amount_minor: number;
        currency_code: string;
    } | undefined;
    shop_id?: string | undefined;
    review_count?: number | undefined;
    average_rating?: number | undefined;
}, {
    listing_url: string;
    rank_position: number;
    page_number: number;
    absolute_rank: number;
    ad_flag: boolean;
    listing_id?: string | undefined;
    etsy_listing_id?: string | undefined;
    title?: string | undefined;
    price?: {
        amount_minor: number;
        currency_code: string;
    } | undefined;
    shop_id?: string | undefined;
    review_count?: number | undefined;
    average_rating?: number | undefined;
}>;
export type SearchResultImpression = z.infer<typeof SearchResultImpressionSchema>;
export declare const SearchSnapshotSchema: z.ZodObject<{
    snapshot_id: z.ZodString;
    capture_job_id: z.ZodString;
    captured_at: z.ZodString;
    source_url: z.ZodString;
    raw_storage_ref: z.ZodString;
    parser_version: z.ZodString;
    validator_status: z.ZodEnum<["valid", "partial", "invalid", "blocked", "parser_drift"]>;
    validation_errors: z.ZodDefault<z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        field: z.ZodOptional<z.ZodString>;
        severity: z.ZodDefault<z.ZodEnum<["warning", "error"]>>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        severity: "warning" | "error";
        field?: string | undefined;
    }, {
        code: string;
        message: string;
        field?: string | undefined;
        severity?: "warning" | "error" | undefined;
    }>, "many">>;
    contract_version: z.ZodDefault<z.ZodLiteral<"v1">>;
} & {
    snapshot_type: z.ZodLiteral<"search">;
    keyword_id: z.ZodOptional<z.ZodString>;
    query_term: z.ZodString;
    locale: z.ZodDefault<z.ZodLiteral<"en-US">>;
    page_number: z.ZodNumber;
    total_results_estimate: z.ZodOptional<z.ZodNumber>;
    capture_reason: z.ZodEnum<["initial", "refresh", "debug", "canary", "rebuild", "keyword_analysis"]>;
    results: z.ZodArray<z.ZodObject<{
        listing_id: z.ZodOptional<z.ZodString>;
        etsy_listing_id: z.ZodOptional<z.ZodString>;
        listing_url: z.ZodString;
        rank_position: z.ZodNumber;
        page_number: z.ZodNumber;
        absolute_rank: z.ZodNumber;
        ad_flag: z.ZodBoolean;
        title: z.ZodOptional<z.ZodString>;
        price: z.ZodOptional<z.ZodObject<{
            amount_minor: z.ZodNumber;
            currency_code: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            amount_minor: number;
            currency_code: string;
        }, {
            amount_minor: number;
            currency_code: string;
        }>>;
        shop_id: z.ZodOptional<z.ZodString>;
        review_count: z.ZodOptional<z.ZodNumber>;
        average_rating: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        listing_url: string;
        rank_position: number;
        page_number: number;
        absolute_rank: number;
        ad_flag: boolean;
        listing_id?: string | undefined;
        etsy_listing_id?: string | undefined;
        title?: string | undefined;
        price?: {
            amount_minor: number;
            currency_code: string;
        } | undefined;
        shop_id?: string | undefined;
        review_count?: number | undefined;
        average_rating?: number | undefined;
    }, {
        listing_url: string;
        rank_position: number;
        page_number: number;
        absolute_rank: number;
        ad_flag: boolean;
        listing_id?: string | undefined;
        etsy_listing_id?: string | undefined;
        title?: string | undefined;
        price?: {
            amount_minor: number;
            currency_code: string;
        } | undefined;
        shop_id?: string | undefined;
        review_count?: number | undefined;
        average_rating?: number | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    snapshot_id: string;
    capture_job_id: string;
    captured_at: string;
    source_url: string;
    raw_storage_ref: string;
    parser_version: string;
    validator_status: "valid" | "partial" | "blocked" | "invalid" | "parser_drift";
    validation_errors: {
        code: string;
        message: string;
        severity: "warning" | "error";
        field?: string | undefined;
    }[];
    contract_version: "v1";
    page_number: number;
    snapshot_type: "search";
    query_term: string;
    locale: "en-US";
    capture_reason: "rebuild" | "canary" | "initial" | "refresh" | "debug" | "keyword_analysis";
    results: {
        listing_url: string;
        rank_position: number;
        page_number: number;
        absolute_rank: number;
        ad_flag: boolean;
        listing_id?: string | undefined;
        etsy_listing_id?: string | undefined;
        title?: string | undefined;
        price?: {
            amount_minor: number;
            currency_code: string;
        } | undefined;
        shop_id?: string | undefined;
        review_count?: number | undefined;
        average_rating?: number | undefined;
    }[];
    keyword_id?: string | undefined;
    total_results_estimate?: number | undefined;
}, {
    snapshot_id: string;
    capture_job_id: string;
    captured_at: string;
    source_url: string;
    raw_storage_ref: string;
    parser_version: string;
    validator_status: "valid" | "partial" | "blocked" | "invalid" | "parser_drift";
    page_number: number;
    snapshot_type: "search";
    query_term: string;
    capture_reason: "rebuild" | "canary" | "initial" | "refresh" | "debug" | "keyword_analysis";
    results: {
        listing_url: string;
        rank_position: number;
        page_number: number;
        absolute_rank: number;
        ad_flag: boolean;
        listing_id?: string | undefined;
        etsy_listing_id?: string | undefined;
        title?: string | undefined;
        price?: {
            amount_minor: number;
            currency_code: string;
        } | undefined;
        shop_id?: string | undefined;
        review_count?: number | undefined;
        average_rating?: number | undefined;
    }[];
    validation_errors?: {
        code: string;
        message: string;
        field?: string | undefined;
        severity?: "warning" | "error" | undefined;
    }[] | undefined;
    contract_version?: "v1" | undefined;
    keyword_id?: string | undefined;
    locale?: "en-US" | undefined;
    total_results_estimate?: number | undefined;
}>;
export type SearchSnapshot = z.infer<typeof SearchSnapshotSchema>;
export declare const ListingSnapshotSchema: z.ZodEffects<z.ZodObject<{
    snapshot_id: z.ZodString;
    capture_job_id: z.ZodString;
    captured_at: z.ZodString;
    source_url: z.ZodString;
    raw_storage_ref: z.ZodString;
    parser_version: z.ZodString;
    validator_status: z.ZodEnum<["valid", "partial", "invalid", "blocked", "parser_drift"]>;
    validation_errors: z.ZodDefault<z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        field: z.ZodOptional<z.ZodString>;
        severity: z.ZodDefault<z.ZodEnum<["warning", "error"]>>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        severity: "warning" | "error";
        field?: string | undefined;
    }, {
        code: string;
        message: string;
        field?: string | undefined;
        severity?: "warning" | "error" | undefined;
    }>, "many">>;
    contract_version: z.ZodDefault<z.ZodLiteral<"v1">>;
} & {
    snapshot_type: z.ZodLiteral<"listing">;
    listing_id: z.ZodOptional<z.ZodString>;
    etsy_listing_id: z.ZodOptional<z.ZodString>;
    shop_id: z.ZodOptional<z.ZodString>;
    etsy_shop_id: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<["active", "inactive", "unknown"]>>;
    price: z.ZodOptional<z.ZodObject<{
        amount_minor: z.ZodNumber;
        currency_code: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        amount_minor: number;
        currency_code: string;
    }, {
        amount_minor: number;
        currency_code: string;
    }>>;
    price_missing_reason: z.ZodOptional<z.ZodString>;
    review_count: z.ZodOptional<z.ZodNumber>;
    average_rating: z.ZodOptional<z.ZodNumber>;
    favorite_count: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    image_count: z.ZodOptional<z.ZodNumber>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    attributes: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    is_digital: z.ZodOptional<z.ZodBoolean>;
    field_sources: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodEnum<["json_ld", "embedded_json", "network", "dom", "derived"]>>>;
}, "strip", z.ZodTypeAny, {
    status: "unknown" | "active" | "inactive";
    snapshot_id: string;
    capture_job_id: string;
    captured_at: string;
    source_url: string;
    raw_storage_ref: string;
    parser_version: string;
    validator_status: "valid" | "partial" | "blocked" | "invalid" | "parser_drift";
    validation_errors: {
        code: string;
        message: string;
        severity: "warning" | "error";
        field?: string | undefined;
    }[];
    contract_version: "v1";
    title: string;
    snapshot_type: "listing";
    tags: string[];
    attributes: Record<string, unknown>;
    field_sources: Record<string, "json_ld" | "embedded_json" | "network" | "dom" | "derived">;
    listing_id?: string | undefined;
    etsy_listing_id?: string | undefined;
    price?: {
        amount_minor: number;
        currency_code: string;
    } | undefined;
    shop_id?: string | undefined;
    review_count?: number | undefined;
    average_rating?: number | undefined;
    etsy_shop_id?: string | undefined;
    price_missing_reason?: string | undefined;
    favorite_count?: number | null | undefined;
    image_count?: number | undefined;
    is_digital?: boolean | undefined;
}, {
    snapshot_id: string;
    capture_job_id: string;
    captured_at: string;
    source_url: string;
    raw_storage_ref: string;
    parser_version: string;
    validator_status: "valid" | "partial" | "blocked" | "invalid" | "parser_drift";
    title: string;
    snapshot_type: "listing";
    status?: "unknown" | "active" | "inactive" | undefined;
    validation_errors?: {
        code: string;
        message: string;
        field?: string | undefined;
        severity?: "warning" | "error" | undefined;
    }[] | undefined;
    contract_version?: "v1" | undefined;
    listing_id?: string | undefined;
    etsy_listing_id?: string | undefined;
    price?: {
        amount_minor: number;
        currency_code: string;
    } | undefined;
    shop_id?: string | undefined;
    review_count?: number | undefined;
    average_rating?: number | undefined;
    etsy_shop_id?: string | undefined;
    price_missing_reason?: string | undefined;
    favorite_count?: number | null | undefined;
    image_count?: number | undefined;
    tags?: string[] | undefined;
    attributes?: Record<string, unknown> | undefined;
    is_digital?: boolean | undefined;
    field_sources?: Record<string, "json_ld" | "embedded_json" | "network" | "dom" | "derived"> | undefined;
}>, {
    status: "unknown" | "active" | "inactive";
    snapshot_id: string;
    capture_job_id: string;
    captured_at: string;
    source_url: string;
    raw_storage_ref: string;
    parser_version: string;
    validator_status: "valid" | "partial" | "blocked" | "invalid" | "parser_drift";
    validation_errors: {
        code: string;
        message: string;
        severity: "warning" | "error";
        field?: string | undefined;
    }[];
    contract_version: "v1";
    title: string;
    snapshot_type: "listing";
    tags: string[];
    attributes: Record<string, unknown>;
    field_sources: Record<string, "json_ld" | "embedded_json" | "network" | "dom" | "derived">;
    listing_id?: string | undefined;
    etsy_listing_id?: string | undefined;
    price?: {
        amount_minor: number;
        currency_code: string;
    } | undefined;
    shop_id?: string | undefined;
    review_count?: number | undefined;
    average_rating?: number | undefined;
    etsy_shop_id?: string | undefined;
    price_missing_reason?: string | undefined;
    favorite_count?: number | null | undefined;
    image_count?: number | undefined;
    is_digital?: boolean | undefined;
}, {
    snapshot_id: string;
    capture_job_id: string;
    captured_at: string;
    source_url: string;
    raw_storage_ref: string;
    parser_version: string;
    validator_status: "valid" | "partial" | "blocked" | "invalid" | "parser_drift";
    title: string;
    snapshot_type: "listing";
    status?: "unknown" | "active" | "inactive" | undefined;
    validation_errors?: {
        code: string;
        message: string;
        field?: string | undefined;
        severity?: "warning" | "error" | undefined;
    }[] | undefined;
    contract_version?: "v1" | undefined;
    listing_id?: string | undefined;
    etsy_listing_id?: string | undefined;
    price?: {
        amount_minor: number;
        currency_code: string;
    } | undefined;
    shop_id?: string | undefined;
    review_count?: number | undefined;
    average_rating?: number | undefined;
    etsy_shop_id?: string | undefined;
    price_missing_reason?: string | undefined;
    favorite_count?: number | null | undefined;
    image_count?: number | undefined;
    tags?: string[] | undefined;
    attributes?: Record<string, unknown> | undefined;
    is_digital?: boolean | undefined;
    field_sources?: Record<string, "json_ld" | "embedded_json" | "network" | "dom" | "derived"> | undefined;
}>;
export type ListingSnapshot = z.infer<typeof ListingSnapshotSchema>;
export declare const ShopSnapshotSchema: z.ZodObject<{
    snapshot_id: z.ZodString;
    capture_job_id: z.ZodString;
    captured_at: z.ZodString;
    source_url: z.ZodString;
    raw_storage_ref: z.ZodString;
    parser_version: z.ZodString;
    validator_status: z.ZodEnum<["valid", "partial", "invalid", "blocked", "parser_drift"]>;
    validation_errors: z.ZodDefault<z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        field: z.ZodOptional<z.ZodString>;
        severity: z.ZodDefault<z.ZodEnum<["warning", "error"]>>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        severity: "warning" | "error";
        field?: string | undefined;
    }, {
        code: string;
        message: string;
        field?: string | undefined;
        severity?: "warning" | "error" | undefined;
    }>, "many">>;
    contract_version: z.ZodDefault<z.ZodLiteral<"v1">>;
} & {
    snapshot_type: z.ZodLiteral<"shop">;
    shop_id: z.ZodOptional<z.ZodString>;
    etsy_shop_id: z.ZodOptional<z.ZodString>;
    shop_name: z.ZodString;
    canonical_shop_url: z.ZodOptional<z.ZodString>;
    rating: z.ZodOptional<z.ZodNumber>;
    review_count: z.ZodOptional<z.ZodNumber>;
    total_sales_public_proxy: z.ZodOptional<z.ZodNumber>;
    admirers_count: z.ZodOptional<z.ZodNumber>;
    country_code: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    snapshot_id: string;
    capture_job_id: string;
    captured_at: string;
    source_url: string;
    raw_storage_ref: string;
    parser_version: string;
    validator_status: "valid" | "partial" | "blocked" | "invalid" | "parser_drift";
    validation_errors: {
        code: string;
        message: string;
        severity: "warning" | "error";
        field?: string | undefined;
    }[];
    contract_version: "v1";
    snapshot_type: "shop";
    shop_name: string;
    shop_id?: string | undefined;
    review_count?: number | undefined;
    etsy_shop_id?: string | undefined;
    canonical_shop_url?: string | undefined;
    rating?: number | undefined;
    total_sales_public_proxy?: number | undefined;
    admirers_count?: number | undefined;
    country_code?: string | undefined;
}, {
    snapshot_id: string;
    capture_job_id: string;
    captured_at: string;
    source_url: string;
    raw_storage_ref: string;
    parser_version: string;
    validator_status: "valid" | "partial" | "blocked" | "invalid" | "parser_drift";
    snapshot_type: "shop";
    shop_name: string;
    validation_errors?: {
        code: string;
        message: string;
        field?: string | undefined;
        severity?: "warning" | "error" | undefined;
    }[] | undefined;
    contract_version?: "v1" | undefined;
    shop_id?: string | undefined;
    review_count?: number | undefined;
    etsy_shop_id?: string | undefined;
    canonical_shop_url?: string | undefined;
    rating?: number | undefined;
    total_sales_public_proxy?: number | undefined;
    admirers_count?: number | undefined;
    country_code?: string | undefined;
}>;
export type ShopSnapshot = z.infer<typeof ShopSnapshotSchema>;
export declare const ScoreSnapshotSchema: z.ZodObject<{
    score_snapshot_id: z.ZodString;
    subject_type: z.ZodEnum<["keyword", "listing", "shop"]>;
    subject_id: z.ZodString;
    captured_at: z.ZodString;
    score_version_id: z.ZodString;
    scores: z.ZodObject<{
        opportunity_score: z.ZodNumber;
        demand_score: z.ZodNumber;
        competition_score: z.ZodNumber;
        momentum_score: z.ZodNumber;
        commercial_viability_score: z.ZodNumber;
        confidence_score: z.ZodNumber;
        score_version: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        opportunity_score: number;
        demand_score: number;
        competition_score: number;
        momentum_score: number;
        commercial_viability_score: number;
        confidence_score: number;
        score_version: string;
    }, {
        opportunity_score: number;
        demand_score: number;
        competition_score: number;
        momentum_score: number;
        commercial_viability_score: number;
        confidence_score: number;
        score_version?: string | undefined;
    }>;
    observed_signal_count: z.ZodNumber;
    estimated_signal_count: z.ZodNumber;
    evidence: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    calculation_trace: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    snapshot_dedupe_key: z.ZodString;
    contract_version: z.ZodDefault<z.ZodLiteral<"v1">>;
}, "strip", z.ZodTypeAny, {
    captured_at: string;
    contract_version: "v1";
    score_snapshot_id: string;
    subject_type: "keyword" | "listing" | "shop";
    subject_id: string;
    score_version_id: string;
    scores: {
        opportunity_score: number;
        demand_score: number;
        competition_score: number;
        momentum_score: number;
        commercial_viability_score: number;
        confidence_score: number;
        score_version: string;
    };
    observed_signal_count: number;
    estimated_signal_count: number;
    evidence: string[];
    calculation_trace: Record<string, unknown>;
    snapshot_dedupe_key: string;
}, {
    captured_at: string;
    score_snapshot_id: string;
    subject_type: "keyword" | "listing" | "shop";
    subject_id: string;
    score_version_id: string;
    scores: {
        opportunity_score: number;
        demand_score: number;
        competition_score: number;
        momentum_score: number;
        commercial_viability_score: number;
        confidence_score: number;
        score_version?: string | undefined;
    };
    observed_signal_count: number;
    estimated_signal_count: number;
    snapshot_dedupe_key: string;
    contract_version?: "v1" | undefined;
    evidence?: string[] | undefined;
    calculation_trace?: Record<string, unknown> | undefined;
}>;
export type ScoreSnapshot = z.infer<typeof ScoreSnapshotSchema>;
export declare const CreateKeywordAnalysisRequestSchema: z.ZodObject<{
    term: z.ZodString;
    locale: z.ZodDefault<z.ZodLiteral<"en-US">>;
    category_hint: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    priority: z.ZodDefault<z.ZodEnum<["low", "normal", "high"]>>;
    refresh_policy: z.ZodDefault<z.ZodEnum<["never", "if_stale", "force"]>>;
    project_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    locale: "en-US";
    term: string;
    priority: "low" | "normal" | "high";
    refresh_policy: "never" | "if_stale" | "force";
    category_hint?: string | null | undefined;
    project_id?: string | null | undefined;
}, {
    term: string;
    locale?: "en-US" | undefined;
    category_hint?: string | null | undefined;
    priority?: "low" | "normal" | "high" | undefined;
    refresh_policy?: "never" | "if_stale" | "force" | undefined;
    project_id?: string | null | undefined;
}>;
export type CreateKeywordAnalysisRequest = z.infer<typeof CreateKeywordAnalysisRequestSchema>;
export declare const CreateListingAnalysisRequestSchema: z.ZodObject<{
    listing_url: z.ZodString;
    priority: z.ZodDefault<z.ZodEnum<["low", "normal", "high"]>>;
    refresh_policy: z.ZodDefault<z.ZodEnum<["never", "if_stale", "force"]>>;
    project_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    listing_url: string;
    priority: "low" | "normal" | "high";
    refresh_policy: "never" | "if_stale" | "force";
    project_id?: string | null | undefined;
}, {
    listing_url: string;
    priority?: "low" | "normal" | "high" | undefined;
    refresh_policy?: "never" | "if_stale" | "force" | undefined;
    project_id?: string | null | undefined;
}>;
export type CreateListingAnalysisRequest = z.infer<typeof CreateListingAnalysisRequestSchema>;
export declare const AnalysisProgressSchema: z.ZodObject<{
    phase: z.ZodString;
    percent: z.ZodNumber;
    steps_total: z.ZodNumber;
    steps_completed: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    phase: string;
    percent: number;
    steps_total: number;
    steps_completed: number;
}, {
    phase: string;
    percent: number;
    steps_total: number;
    steps_completed: number;
}>;
export type AnalysisProgress = z.infer<typeof AnalysisProgressSchema>;
export declare const AnalysisDtoSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["keyword", "listing", "shop"]>;
    status: z.ZodEnum<["queued", "running", "partial", "completed", "failed", "blocked", "validation_failed", "stale", "refreshed", "cancelled"]>;
    workflow_id: z.ZodOptional<z.ZodString>;
    progress: z.ZodOptional<z.ZodObject<{
        phase: z.ZodString;
        percent: z.ZodNumber;
        steps_total: z.ZodNumber;
        steps_completed: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        phase: string;
        percent: number;
        steps_total: number;
        steps_completed: number;
    }, {
        phase: string;
        percent: number;
        steps_total: number;
        steps_completed: number;
    }>>;
    error_code: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    error_message: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    retry_count: z.ZodDefault<z.ZodNumber>;
    created_at: z.ZodString;
    started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    finished_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    stale_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    type: "keyword" | "listing" | "shop";
    status: "queued" | "running" | "partial" | "completed" | "failed" | "blocked" | "validation_failed" | "stale" | "refreshed" | "cancelled";
    id: string;
    retry_count: number;
    created_at: string;
    workflow_id?: string | undefined;
    progress?: {
        phase: string;
        percent: number;
        steps_total: number;
        steps_completed: number;
    } | undefined;
    error_code?: string | null | undefined;
    error_message?: string | null | undefined;
    started_at?: string | null | undefined;
    finished_at?: string | null | undefined;
    stale_at?: string | null | undefined;
}, {
    type: "keyword" | "listing" | "shop";
    status: "queued" | "running" | "partial" | "completed" | "failed" | "blocked" | "validation_failed" | "stale" | "refreshed" | "cancelled";
    id: string;
    created_at: string;
    workflow_id?: string | undefined;
    progress?: {
        phase: string;
        percent: number;
        steps_total: number;
        steps_completed: number;
    } | undefined;
    error_code?: string | null | undefined;
    error_message?: string | null | undefined;
    retry_count?: number | undefined;
    started_at?: string | null | undefined;
    finished_at?: string | null | undefined;
    stale_at?: string | null | undefined;
}>;
export type AnalysisDto = z.infer<typeof AnalysisDtoSchema>;
export declare const CreateAnalysisResponseSchema: z.ZodObject<{
    analysis: z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["keyword", "listing", "shop"]>;
        status: z.ZodEnum<["queued", "running", "partial", "completed", "failed", "blocked", "validation_failed", "stale", "refreshed", "cancelled"]>;
        workflow_id: z.ZodOptional<z.ZodString>;
        progress: z.ZodOptional<z.ZodObject<{
            phase: z.ZodString;
            percent: z.ZodNumber;
            steps_total: z.ZodNumber;
            steps_completed: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            phase: string;
            percent: number;
            steps_total: number;
            steps_completed: number;
        }, {
            phase: string;
            percent: number;
            steps_total: number;
            steps_completed: number;
        }>>;
        error_code: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        error_message: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        retry_count: z.ZodDefault<z.ZodNumber>;
        created_at: z.ZodString;
        started_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        finished_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        stale_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        type: "keyword" | "listing" | "shop";
        status: "queued" | "running" | "partial" | "completed" | "failed" | "blocked" | "validation_failed" | "stale" | "refreshed" | "cancelled";
        id: string;
        retry_count: number;
        created_at: string;
        workflow_id?: string | undefined;
        progress?: {
            phase: string;
            percent: number;
            steps_total: number;
            steps_completed: number;
        } | undefined;
        error_code?: string | null | undefined;
        error_message?: string | null | undefined;
        started_at?: string | null | undefined;
        finished_at?: string | null | undefined;
        stale_at?: string | null | undefined;
    }, {
        type: "keyword" | "listing" | "shop";
        status: "queued" | "running" | "partial" | "completed" | "failed" | "blocked" | "validation_failed" | "stale" | "refreshed" | "cancelled";
        id: string;
        created_at: string;
        workflow_id?: string | undefined;
        progress?: {
            phase: string;
            percent: number;
            steps_total: number;
            steps_completed: number;
        } | undefined;
        error_code?: string | null | undefined;
        error_message?: string | null | undefined;
        retry_count?: number | undefined;
        started_at?: string | null | undefined;
        finished_at?: string | null | undefined;
        stale_at?: string | null | undefined;
    }>;
    normalized_input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    idempotency: z.ZodObject<{
        key: z.ZodString;
        replayed: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        key: string;
        replayed: boolean;
    }, {
        key: string;
        replayed: boolean;
    }>;
}, "strip", z.ZodTypeAny, {
    analysis: {
        type: "keyword" | "listing" | "shop";
        status: "queued" | "running" | "partial" | "completed" | "failed" | "blocked" | "validation_failed" | "stale" | "refreshed" | "cancelled";
        id: string;
        retry_count: number;
        created_at: string;
        workflow_id?: string | undefined;
        progress?: {
            phase: string;
            percent: number;
            steps_total: number;
            steps_completed: number;
        } | undefined;
        error_code?: string | null | undefined;
        error_message?: string | null | undefined;
        started_at?: string | null | undefined;
        finished_at?: string | null | undefined;
        stale_at?: string | null | undefined;
    };
    idempotency: {
        key: string;
        replayed: boolean;
    };
    normalized_input?: Record<string, string> | undefined;
}, {
    analysis: {
        type: "keyword" | "listing" | "shop";
        status: "queued" | "running" | "partial" | "completed" | "failed" | "blocked" | "validation_failed" | "stale" | "refreshed" | "cancelled";
        id: string;
        created_at: string;
        workflow_id?: string | undefined;
        progress?: {
            phase: string;
            percent: number;
            steps_total: number;
            steps_completed: number;
        } | undefined;
        error_code?: string | null | undefined;
        error_message?: string | null | undefined;
        retry_count?: number | undefined;
        started_at?: string | null | undefined;
        finished_at?: string | null | undefined;
        stale_at?: string | null | undefined;
    };
    idempotency: {
        key: string;
        replayed: boolean;
    };
    normalized_input?: Record<string, string> | undefined;
}>;
export type CreateAnalysisResponse = z.infer<typeof CreateAnalysisResponseSchema>;
export declare const WarningSchema: z.ZodObject<{
    code: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
}, {
    code: string;
    message: string;
}>;
export type Warning = z.infer<typeof WarningSchema>;
export declare const KeywordResultSummarySchema: z.ZodObject<{
    analysis_id: z.ZodString;
    type: z.ZodLiteral<"keyword">;
    status: z.ZodEnum<["queued", "running", "partial", "completed", "failed", "blocked", "validation_failed", "stale", "refreshed", "cancelled"]>;
    keyword: z.ZodObject<{
        id: z.ZodString;
        term: z.ZodString;
        locale: z.ZodLiteral<"en-US">;
        category_hint: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        locale: "en-US";
        term: string;
        category_hint: string | null;
        id: string;
    }, {
        locale: "en-US";
        term: string;
        category_hint: string | null;
        id: string;
    }>;
    market_summary: z.ZodObject<{
        total_results_estimate: z.ZodNullable<z.ZodNumber>;
        sampled_listing_count: z.ZodNumber;
        median_price: z.ZodNullable<z.ZodObject<{
            amount: z.ZodString;
            currency: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            amount: string;
            currency: string;
        }, {
            amount: string;
            currency: string;
        }>>;
        median_review_count: z.ZodNullable<z.ZodNumber>;
        ads_share: z.ZodNullable<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        total_results_estimate: number | null;
        sampled_listing_count: number;
        median_price: {
            amount: string;
            currency: string;
        } | null;
        median_review_count: number | null;
        ads_share: number | null;
    }, {
        total_results_estimate: number | null;
        sampled_listing_count: number;
        median_price: {
            amount: string;
            currency: string;
        } | null;
        median_review_count: number | null;
        ads_share: number | null;
    }>;
    scores: z.ZodObject<{
        opportunity_score: z.ZodNumber;
        demand_score: z.ZodNumber;
        competition_score: z.ZodNumber;
        momentum_score: z.ZodNumber;
        commercial_viability_score: z.ZodNumber;
        confidence_score: z.ZodNumber;
        score_version: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        opportunity_score: number;
        demand_score: number;
        competition_score: number;
        momentum_score: number;
        commercial_viability_score: number;
        confidence_score: number;
        score_version: string;
    }, {
        opportunity_score: number;
        demand_score: number;
        competition_score: number;
        momentum_score: number;
        commercial_viability_score: number;
        confidence_score: number;
        score_version?: string | undefined;
    }>;
    explanations: z.ZodArray<z.ZodString, "many">;
    top_listings: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    artifacts: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    warnings: z.ZodDefault<z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
    }, {
        code: string;
        message: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    keyword: {
        locale: "en-US";
        term: string;
        category_hint: string | null;
        id: string;
    };
    type: "keyword";
    status: "queued" | "running" | "partial" | "completed" | "failed" | "blocked" | "validation_failed" | "stale" | "refreshed" | "cancelled";
    scores: {
        opportunity_score: number;
        demand_score: number;
        competition_score: number;
        momentum_score: number;
        commercial_viability_score: number;
        confidence_score: number;
        score_version: string;
    };
    analysis_id: string;
    market_summary: {
        total_results_estimate: number | null;
        sampled_listing_count: number;
        median_price: {
            amount: string;
            currency: string;
        } | null;
        median_review_count: number | null;
        ads_share: number | null;
    };
    explanations: string[];
    top_listings: Record<string, unknown>[];
    artifacts: Record<string, unknown>;
    warnings: {
        code: string;
        message: string;
    }[];
}, {
    keyword: {
        locale: "en-US";
        term: string;
        category_hint: string | null;
        id: string;
    };
    type: "keyword";
    status: "queued" | "running" | "partial" | "completed" | "failed" | "blocked" | "validation_failed" | "stale" | "refreshed" | "cancelled";
    scores: {
        opportunity_score: number;
        demand_score: number;
        competition_score: number;
        momentum_score: number;
        commercial_viability_score: number;
        confidence_score: number;
        score_version?: string | undefined;
    };
    analysis_id: string;
    market_summary: {
        total_results_estimate: number | null;
        sampled_listing_count: number;
        median_price: {
            amount: string;
            currency: string;
        } | null;
        median_review_count: number | null;
        ads_share: number | null;
    };
    explanations: string[];
    top_listings: Record<string, unknown>[];
    artifacts: Record<string, unknown>;
    warnings?: {
        code: string;
        message: string;
    }[] | undefined;
}>;
export type KeywordResultSummary = z.infer<typeof KeywordResultSummarySchema>;
export declare const ListingResultSummarySchema: z.ZodObject<{
    analysis_id: z.ZodString;
    type: z.ZodLiteral<"listing">;
    status: z.ZodEnum<["queued", "running", "partial", "completed", "failed", "blocked", "validation_failed", "stale", "refreshed", "cancelled"]>;
    listing: z.ZodObject<{
        listing_id: z.ZodString;
        etsy_listing_id: z.ZodNullable<z.ZodString>;
        url: z.ZodString;
        title: z.ZodString;
        shop_id: z.ZodNullable<z.ZodString>;
        category: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        listing_id: string;
        etsy_listing_id: string | null;
        title: string;
        shop_id: string | null;
        category: string | null;
    }, {
        url: string;
        listing_id: string;
        etsy_listing_id: string | null;
        title: string;
        shop_id: string | null;
        category: string | null;
    }>;
    snapshot: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    scores: z.ZodObject<{
        opportunity_score: z.ZodNumber;
        demand_score: z.ZodNumber;
        competition_score: z.ZodNumber;
        momentum_score: z.ZodNumber;
        commercial_viability_score: z.ZodNumber;
        confidence_score: z.ZodNumber;
        score_version: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        opportunity_score: number;
        demand_score: number;
        competition_score: number;
        momentum_score: number;
        commercial_viability_score: number;
        confidence_score: number;
        score_version: string;
    }, {
        opportunity_score: number;
        demand_score: number;
        competition_score: number;
        momentum_score: number;
        commercial_viability_score: number;
        confidence_score: number;
        score_version?: string | undefined;
    }>;
    explanations: z.ZodArray<z.ZodString, "many">;
    artifacts: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    warnings: z.ZodDefault<z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
    }, {
        code: string;
        message: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    listing: {
        url: string;
        listing_id: string;
        etsy_listing_id: string | null;
        title: string;
        shop_id: string | null;
        category: string | null;
    };
    type: "listing";
    status: "queued" | "running" | "partial" | "completed" | "failed" | "blocked" | "validation_failed" | "stale" | "refreshed" | "cancelled";
    scores: {
        opportunity_score: number;
        demand_score: number;
        competition_score: number;
        momentum_score: number;
        commercial_viability_score: number;
        confidence_score: number;
        score_version: string;
    };
    analysis_id: string;
    explanations: string[];
    artifacts: Record<string, unknown>;
    warnings: {
        code: string;
        message: string;
    }[];
    snapshot: Record<string, unknown>;
}, {
    listing: {
        url: string;
        listing_id: string;
        etsy_listing_id: string | null;
        title: string;
        shop_id: string | null;
        category: string | null;
    };
    type: "listing";
    status: "queued" | "running" | "partial" | "completed" | "failed" | "blocked" | "validation_failed" | "stale" | "refreshed" | "cancelled";
    scores: {
        opportunity_score: number;
        demand_score: number;
        competition_score: number;
        momentum_score: number;
        commercial_viability_score: number;
        confidence_score: number;
        score_version?: string | undefined;
    };
    analysis_id: string;
    explanations: string[];
    artifacts: Record<string, unknown>;
    snapshot: Record<string, unknown>;
    warnings?: {
        code: string;
        message: string;
    }[] | undefined;
}>;
export type ListingResultSummary = z.infer<typeof ListingResultSummarySchema>;
export declare const KeywordAnalysisWorkflowInputSchema: z.ZodObject<{
    analysis_id: z.ZodString;
    workspace_id: z.ZodString;
    keyword: z.ZodObject<{
        term: z.ZodString;
        locale: z.ZodLiteral<"en-US">;
        category_hint: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        locale: "en-US";
        term: string;
        category_hint: string | null;
    }, {
        locale: "en-US";
        term: string;
        category_hint: string | null;
    }>;
    priority: z.ZodEnum<["low", "normal", "high"]>;
    requested_at: z.ZodString;
    idempotency_key: z.ZodString;
    contract_version: z.ZodLiteral<"v1">;
}, "strip", z.ZodTypeAny, {
    keyword: {
        locale: "en-US";
        term: string;
        category_hint: string | null;
    };
    contract_version: "v1";
    priority: "low" | "normal" | "high";
    analysis_id: string;
    workspace_id: string;
    requested_at: string;
    idempotency_key: string;
}, {
    keyword: {
        locale: "en-US";
        term: string;
        category_hint: string | null;
    };
    contract_version: "v1";
    priority: "low" | "normal" | "high";
    analysis_id: string;
    workspace_id: string;
    requested_at: string;
    idempotency_key: string;
}>;
export type KeywordAnalysisWorkflowInput = z.infer<typeof KeywordAnalysisWorkflowInputSchema>;
export declare const ListingAnalysisWorkflowInputSchema: z.ZodObject<{
    analysis_id: z.ZodString;
    workspace_id: z.ZodString;
    listing_url: z.ZodString;
    priority: z.ZodEnum<["low", "normal", "high"]>;
    requested_at: z.ZodString;
    idempotency_key: z.ZodString;
    contract_version: z.ZodLiteral<"v1">;
}, "strip", z.ZodTypeAny, {
    contract_version: "v1";
    listing_url: string;
    priority: "low" | "normal" | "high";
    analysis_id: string;
    workspace_id: string;
    requested_at: string;
    idempotency_key: string;
}, {
    contract_version: "v1";
    listing_url: string;
    priority: "low" | "normal" | "high";
    analysis_id: string;
    workspace_id: string;
    requested_at: string;
    idempotency_key: string;
}>;
export type ListingAnalysisWorkflowInput = z.infer<typeof ListingAnalysisWorkflowInputSchema>;
export declare const ListingDetailCollectJobSchema: z.ZodObject<{
    job_id: z.ZodString;
    analysis_id: z.ZodString;
    parent_workflow_id: z.ZodString;
    listing_url: z.ZodString;
    rank_position: z.ZodNumber;
    page_number: z.ZodNumber;
    query_term: z.ZodString;
    locale: z.ZodLiteral<"en-US">;
    capture_reason: z.ZodLiteral<"keyword_analysis">;
    dedupe_key: z.ZodString;
    attempt: z.ZodNumber;
    contract_version: z.ZodLiteral<"v1">;
}, "strip", z.ZodTypeAny, {
    contract_version: "v1";
    listing_url: string;
    rank_position: number;
    page_number: number;
    query_term: string;
    locale: "en-US";
    capture_reason: "keyword_analysis";
    analysis_id: string;
    job_id: string;
    parent_workflow_id: string;
    dedupe_key: string;
    attempt: number;
}, {
    contract_version: "v1";
    listing_url: string;
    rank_position: number;
    page_number: number;
    query_term: string;
    locale: "en-US";
    capture_reason: "keyword_analysis";
    analysis_id: string;
    job_id: string;
    parent_workflow_id: string;
    dedupe_key: string;
    attempt: number;
}>;
export type ListingDetailCollectJob = z.infer<typeof ListingDetailCollectJobSchema>;
export declare class DomainFailure extends Error {
    readonly failureClass: FailureClass;
    readonly retryable: boolean;
    readonly details?: unknown;
    constructor(failureClass: FailureClass, message: string, options?: {
        retryable?: boolean;
        details?: unknown;
    });
}
export declare class ValidationFailure extends DomainFailure {
    constructor(message: string, details?: unknown);
}
export declare class ParserDriftFailure extends DomainFailure {
    constructor(message: string, details?: unknown);
}
export declare class RetryableDependencyFailure extends DomainFailure {
    constructor(message: string, details?: unknown);
}
//# sourceMappingURL=index.d.ts.map