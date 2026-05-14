CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE analysis_type AS ENUM ('keyword', 'listing', 'shop');
CREATE TYPE analysis_status AS ENUM ('queued', 'running', 'partial', 'completed', 'failed', 'blocked', 'validation_failed', 'stale', 'refreshed', 'cancelled');
CREATE TYPE trigger_source AS ENUM ('user', 'scheduler', 'rebuild', 'canary');
CREATE TYPE data_quality_status AS ENUM ('ok', 'partial', 'suspect');
CREATE TYPE capture_job_type AS ENUM ('search_capture', 'listing_capture', 'shop_capture', 'reprocess');
CREATE TYPE target_type AS ENUM ('keyword', 'listing', 'shop', 'url');
CREATE TYPE capture_reason AS ENUM ('initial', 'refresh', 'debug', 'canary', 'rebuild', 'keyword_analysis');
CREATE TYPE capture_job_status AS ENUM ('queued', 'running', 'completed', 'partial', 'failed', 'blocked', 'validation_failed');
CREATE TYPE failure_class AS ENUM ('network_error', 'timeout', 'blocked_captcha', 'parser_drift', 'semantic_gap', 'validation_failed', 'rate_limited', 'dependency_unavailable', 'budget_exhausted', 'internal_error');
CREATE TYPE artifact_kind AS ENUM ('html', 'screenshot', 'jsonld', 'embedded_json', 'network_response', 'parser_io');
CREATE TYPE retention_class AS ENUM ('short', 'standard', 'extended');
CREATE TYPE subject_type AS ENUM ('keyword', 'listing', 'shop');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT projects_workspace_name_unique UNIQUE (workspace_id, name)
);

CREATE TABLE keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_term TEXT NOT NULL,
  canonical_term TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en-US',
  category_hint TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_analyzed_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT keywords_canonical_locale_unique UNIQUE (canonical_term, locale)
);
CREATE INDEX keywords_last_analyzed_at_idx ON keywords(last_analyzed_at);

CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etsy_shop_id TEXT,
  shop_name TEXT NOT NULL,
  canonical_shop_url TEXT NOT NULL UNIQUE,
  source_shop_url TEXT NOT NULL,
  country_code TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_snapshot_at TIMESTAMPTZ,
  data_quality_status data_quality_status NOT NULL DEFAULT 'partial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX shops_etsy_shop_id_unique ON shops(etsy_shop_id) WHERE etsy_shop_id IS NOT NULL;

CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etsy_listing_id TEXT,
  shop_id UUID REFERENCES shops(id),
  canonical_listing_url TEXT NOT NULL UNIQUE,
  source_listing_url TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  category_hint TEXT,
  primary_currency_code CHAR(3),
  created_at_source TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_snapshot_at TIMESTAMPTZ,
  last_parser_version TEXT,
  data_quality_status data_quality_status NOT NULL DEFAULT 'partial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX listings_etsy_listing_id_unique ON listings(etsy_listing_id) WHERE etsy_listing_id IS NOT NULL;
CREATE INDEX listings_shop_id_idx ON listings(shop_id);
CREATE INDEX listings_last_snapshot_at_idx ON listings(last_snapshot_at DESC);

CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  project_id UUID REFERENCES projects(id),
  analysis_type analysis_type NOT NULL,
  subject_keyword_id UUID REFERENCES keywords(id),
  subject_listing_id UUID REFERENCES listings(id),
  subject_shop_id UUID REFERENCES shops(id),
  status analysis_status NOT NULL DEFAULT 'queued',
  requested_by_user_id UUID REFERENCES users(id),
  trigger_source trigger_source NOT NULL DEFAULT 'user',
  refresh_of_analysis_id UUID REFERENCES analyses(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  error_code TEXT,
  error_detail JSONB,
  retry_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT analyses_exactly_one_subject_check CHECK (
    (analysis_type = 'keyword' AND subject_keyword_id IS NOT NULL AND subject_listing_id IS NULL AND subject_shop_id IS NULL) OR
    (analysis_type = 'listing' AND subject_keyword_id IS NULL AND subject_listing_id IS NOT NULL AND subject_shop_id IS NULL) OR
    (analysis_type = 'shop' AND subject_keyword_id IS NULL AND subject_listing_id IS NULL AND subject_shop_id IS NOT NULL)
  )
);
CREATE INDEX analyses_workspace_status_idx ON analyses(workspace_id, status);

CREATE TABLE capture_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES analyses(id),
  job_type capture_job_type NOT NULL,
  target_type target_type NOT NULL,
  target_ref TEXT NOT NULL,
  source_url TEXT NOT NULL,
  capture_reason capture_reason NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status capture_job_status NOT NULL DEFAULT 'queued',
  failure_class failure_class,
  worker_queue TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX capture_jobs_analysis_id_idx ON capture_jobs(analysis_id);
CREATE INDEX capture_jobs_queue_status_idx ON capture_jobs(worker_queue, status);

CREATE TABLE raw_artifacts (
  artifact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_job_id UUID NOT NULL REFERENCES capture_jobs(id),
  artifact_kind artifact_kind NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_class retention_class NOT NULL DEFAULT 'standard',
  encryption_status TEXT NOT NULL
);
CREATE INDEX raw_artifacts_capture_job_id_idx ON raw_artifacts(capture_job_id);

CREATE TABLE score_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  score_key TEXT NOT NULL,
  version TEXT NOT NULL,
  weights_json JSONB NOT NULL,
  changelog_md TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT score_versions_key_version_unique UNIQUE (score_key, version)
);

INSERT INTO score_versions (score_key, version, weights_json, changelog_md, is_active)
VALUES (
  'opportunity_v1',
  '2026-05-13',
  '{"demand":35,"competition":25,"momentum":25,"commercial_viability":15}'::jsonb,
  'Initial v1 opportunity scoring weights.',
  true
);

CREATE TABLE current_entity_scores (
  subject_type subject_type NOT NULL,
  subject_id UUID NOT NULL,
  score_version_id UUID NOT NULL REFERENCES score_versions(id),
  opportunity_score NUMERIC(5,2) NOT NULL,
  demand_score NUMERIC(5,2) NOT NULL,
  competition_score NUMERIC(5,2) NOT NULL,
  momentum_score NUMERIC(5,2) NOT NULL,
  commercial_viability_score NUMERIC(5,2) NOT NULL,
  confidence_score NUMERIC(5,2) NOT NULL,
  evidence_summary_json JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT current_entity_scores_subject_unique UNIQUE (subject_type, subject_id)
);
CREATE INDEX current_entity_scores_score_version_id_idx ON current_entity_scores(score_version_id);
