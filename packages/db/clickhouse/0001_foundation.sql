CREATE TABLE IF NOT EXISTS search_snapshots (
  snapshot_id UUID,
  capture_job_id UUID,
  keyword_id UUID,
  query_term String,
  locale LowCardinality(String),
  page_number UInt16,
  captured_at DateTime64(3, 'UTC'),
  total_results_estimate UInt32,
  parser_version LowCardinality(String),
  validator_status LowCardinality(String),
  validation_errors_json String,
  source_url String,
  raw_artifact_path String,
  snapshot_dedupe_key String,
  capture_reason LowCardinality(String)
) ENGINE = MergeTree
ORDER BY (keyword_id, captured_at, page_number, snapshot_id);

CREATE TABLE IF NOT EXISTS search_result_impressions (
  snapshot_id UUID,
  keyword_id UUID,
  listing_id UUID,
  captured_at DateTime64(3, 'UTC'),
  page_number UInt16,
  rank_position UInt16,
  absolute_rank UInt32,
  ad_flag Bool,
  price_amount_minor Int64,
  currency_code FixedString(3),
  review_count UInt32,
  average_rating Float32,
  shop_id UUID,
  parser_version LowCardinality(String)
) ENGINE = MergeTree
ORDER BY (keyword_id, captured_at, absolute_rank, listing_id);

CREATE TABLE IF NOT EXISTS listing_snapshots (
  snapshot_id UUID,
  capture_job_id UUID,
  listing_id UUID,
  etsy_listing_id String,
  shop_id UUID,
  captured_at DateTime64(3, 'UTC'),
  status LowCardinality(String),
  title String,
  price_amount_minor Int64,
  currency_code FixedString(3),
  review_count UInt32,
  average_rating Float32,
  favorite_count UInt32,
  image_count UInt16,
  tags_json String,
  attributes_json String,
  is_digital Bool,
  validator_status LowCardinality(String),
  validation_errors_json String,
  parser_version LowCardinality(String),
  source_url String,
  raw_artifact_path String,
  snapshot_dedupe_key String
) ENGINE = MergeTree
PARTITION BY toYYYYMM(captured_at)
ORDER BY (listing_id, captured_at, snapshot_id);

CREATE TABLE IF NOT EXISTS shop_snapshots (
  snapshot_id UUID,
  capture_job_id UUID,
  shop_id UUID,
  etsy_shop_id String,
  captured_at DateTime64(3, 'UTC'),
  shop_name String,
  rating Float32,
  review_count UInt32,
  total_sales_public_proxy UInt32,
  admirers_count UInt32,
  country_code LowCardinality(String),
  parser_version LowCardinality(String),
  validator_status LowCardinality(String),
  validation_errors_json String,
  source_url String,
  raw_artifact_path String,
  snapshot_dedupe_key String
) ENGINE = MergeTree
PARTITION BY toYYYYMM(captured_at)
ORDER BY (shop_id, captured_at, snapshot_id);

CREATE TABLE IF NOT EXISTS score_snapshots (
  score_snapshot_id UUID,
  subject_type LowCardinality(String),
  subject_id UUID,
  captured_at DateTime64(3, 'UTC'),
  score_version_id UUID,
  opportunity_score Float32,
  demand_score Float32,
  competition_score Float32,
  momentum_score Float32,
  commercial_viability_score Float32,
  confidence_score Float32,
  observed_signal_count UInt16,
  estimated_signal_count UInt16,
  evidence_json String,
  calculation_trace_json String,
  snapshot_dedupe_key String
) ENGINE = MergeTree
PARTITION BY toYYYYMM(captured_at)
ORDER BY (subject_type, subject_id, captured_at, score_snapshot_id);

CREATE TABLE IF NOT EXISTS trend_fact_daily (
  subject_type LowCardinality(String),
  subject_id UUID,
  day Date,
  score_version_id UUID,
  avg_price_amount_minor Int64,
  min_price_amount_minor Int64,
  max_price_amount_minor Int64,
  review_delta_7d Int32,
  favorite_delta_7d Int32,
  rank_best UInt32,
  rank_worst UInt32,
  rank_median Float32,
  snapshot_count UInt16,
  computed_at DateTime64(3, 'UTC')
) ENGINE = MergeTree
ORDER BY (subject_type, subject_id, day);
