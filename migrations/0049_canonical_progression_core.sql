-- Phase 2 — Canonical Progression Core
-- Additive only: does not drop, rewrite, or redirect any legacy progression data.

CREATE TABLE IF NOT EXISTS canonical_skill_definition (
  id TEXT PRIMARY KEY,
  taxonomy_config_version TEXT NOT NULL,
  family TEXT NOT NULL,
  pillar TEXT NOT NULL,
  is_ability_bearing BOOLEAN NOT NULL DEFAULT TRUE,
  definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_config_version (
  version TEXT PRIMARY KEY,
  config_json JSONB NOT NULL,
  provenance TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical_benchmark_definition (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  benchmark_config_version TEXT NOT NULL,
  taxonomy_config_version TEXT NOT NULL,
  benchmark_id TEXT NOT NULL,
  qualified_source_key TEXT NOT NULL,
  source_skill_id TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('ABILITY_BENCHMARK', 'HARD_GATE', 'CONTEXT_ONLY', 'SOCIAL_CHARACTER')),
  component_mapping_type TEXT NOT NULL CHECK (component_mapping_type IN ('SINGLE_ATOMIC_TARGET', 'MULTI_ATOMIC_COMPONENT_BENCHMARK', 'HARD_GATE', 'CONTEXT_ONLY', 'SOCIAL_CHARACTER')),
  pathway TEXT NOT NULL,
  level TEXT NOT NULL,
  source_pillar TEXT,
  source_category TEXT,
  source_name TEXT,
  interval_lower NUMERIC(12,4),
  interval_upper NUMERIC(12,4),
  definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT canonical_benchmark_version_id_unique UNIQUE (benchmark_config_version, benchmark_id),
  CONSTRAINT canonical_benchmark_version_source_unique UNIQUE (benchmark_config_version, qualified_source_key)
);

CREATE TABLE IF NOT EXISTS canonical_benchmark_component (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  benchmark_definition_id VARCHAR NOT NULL REFERENCES canonical_benchmark_definition(id) ON DELETE CASCADE,
  canonical_skill_id TEXT NOT NULL REFERENCES canonical_skill_definition(id),
  component_key TEXT NOT NULL,
  role TEXT NOT NULL,
  weight NUMERIC(8,6) NOT NULL CHECK (weight > 0 AND weight <= 1),
  is_ability_bearing BOOLEAN NOT NULL DEFAULT FALSE,
  mapping_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT canonical_benchmark_component_unique UNIQUE (benchmark_definition_id, component_key)
);

CREATE TABLE IF NOT EXISTS player_canonical_progression (
  player_id VARCHAR PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  academy_id VARCHAR NOT NULL REFERENCES academies(id),
  state_version INTEGER NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  placement_status TEXT NOT NULL DEFAULT 'UNASSESSED' CHECK (placement_status IN ('UNASSESSED', 'PROVISIONAL', 'CONFIRMED')),
  glow_status TEXT NOT NULL DEFAULT 'ESTABLISHING' CHECK (glow_status IN ('ESTABLISHING', 'PROVISIONAL', 'CONFIRMED')),
  current_pathway_id TEXT,
  current_level_id TEXT,
  estimated_glow NUMERIC(14,4),
  glow_coverage NUMERIC(8,6) NOT NULL DEFAULT 0 CHECK (glow_coverage >= 0 AND glow_coverage <= 1),
  glow_confidence NUMERIC(8,6) NOT NULL DEFAULT 0 CHECK (glow_confidence >= 0 AND glow_confidence <= 1),
  readiness_json JSONB,
  taxonomy_config_version TEXT NOT NULL,
  benchmark_config_version TEXT NOT NULL,
  evidence_config_version TEXT NOT NULL,
  strength_model_version TEXT NOT NULL,
  glow_config_version TEXT NOT NULL,
  last_decision_id VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT player_canonical_progression_academy_player_unique UNIQUE (academy_id, player_id)
);

CREATE TABLE IF NOT EXISTS player_canonical_skill_state (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  academy_id VARCHAR NOT NULL REFERENCES academies(id),
  player_id VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  canonical_skill_id TEXT NOT NULL REFERENCES canonical_skill_definition(id),
  active_benchmark_definition_id VARCHAR REFERENCES canonical_benchmark_definition(id),
  active_benchmark_id TEXT,
  benchmark_config_version TEXT,
  absolute_strength NUMERIC(14,4),
  stage_relative_mastery NUMERIC(8,4) CHECK (stage_relative_mastery IS NULL OR (stage_relative_mastery >= 0 AND stage_relative_mastery <= 100)),
  observation_status TEXT NOT NULL DEFAULT 'UNOBSERVED' CHECK (observation_status IN ('UNOBSERVED', 'OBSERVED')),
  confidence NUMERIC(8,6) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  coverage NUMERIC(8,6) NOT NULL DEFAULT 0 CHECK (coverage >= 0 AND coverage <= 1),
  freshness_at TIMESTAMP,
  last_evidence_at TIMESTAMP,
  trend TEXT NOT NULL DEFAULT 'STABLE',
  state_version INTEGER NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  last_decision_id VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT player_canonical_skill_state_player_skill_unique UNIQUE (player_id, canonical_skill_id)
);

CREATE TABLE IF NOT EXISTS development_decision (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  academy_id VARCHAR NOT NULL REFERENCES academies(id),
  player_id VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  actor_user_id VARCHAR NOT NULL REFERENCES users(id),
  actor_coach_id VARCHAR REFERENCES coaches(id),
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'VALIDATING', 'ACCEPTED', 'APPLIED', 'REJECTED', 'SUPERSEDED')),
  benchmark_definition_id VARCHAR REFERENCES canonical_benchmark_definition(id),
  benchmark_id TEXT NOT NULL,
  proposed_benchmark_mastery NUMERIC(8,4) NOT NULL CHECK (proposed_benchmark_mastery >= 0 AND proposed_benchmark_mastery <= 100),
  confidence NUMERIC(8,6) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  rationale TEXT,
  expected_player_state_version INTEGER,
  taxonomy_config_version TEXT NOT NULL,
  benchmark_config_version TEXT NOT NULL,
  evidence_config_version TEXT NOT NULL,
  strength_model_version TEXT NOT NULL,
  glow_config_version TEXT NOT NULL,
  accepted_at TIMESTAMP,
  applied_at TIMESTAMP,
  rejected_at TIMESTAMP,
  superseded_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS development_decision_validation (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  decision_id VARCHAR NOT NULL REFERENCES development_decision(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('ACCEPTED', 'REJECTED')),
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  validated_evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  validated_by_user_id VARCHAR REFERENCES users(id),
  validated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT development_decision_validation_once_unique UNIQUE (decision_id)
);

CREATE TABLE IF NOT EXISTS player_canonical_skill_history (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  academy_id VARCHAR NOT NULL REFERENCES academies(id),
  player_id VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  canonical_skill_id TEXT NOT NULL REFERENCES canonical_skill_definition(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('DEVELOPMENT', 'RECALIBRATION')),
  decision_id VARCHAR REFERENCES development_decision(id),
  recalibration_event_id VARCHAR,
  prior_absolute_strength NUMERIC(14,4),
  next_absolute_strength NUMERIC(14,4),
  prior_mastery NUMERIC(8,4),
  next_mastery NUMERIC(8,4),
  state_version INTEGER NOT NULL,
  state_json JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canonical_decision_snapshot (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  decision_id VARCHAR NOT NULL REFERENCES development_decision(id) ON DELETE CASCADE,
  academy_id VARCHAR NOT NULL REFERENCES academies(id),
  player_id VARCHAR NOT NULL REFERENCES players(id),
  state_version INTEGER NOT NULL,
  taxonomy_config_version TEXT NOT NULL,
  benchmark_config_version TEXT NOT NULL,
  evidence_config_version TEXT NOT NULL,
  strength_model_version TEXT NOT NULL,
  glow_config_version TEXT NOT NULL,
  aggregate_json JSONB NOT NULL,
  skill_states_json JSONB NOT NULL,
  pillar_json JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT canonical_decision_snapshot_decision_unique UNIQUE (decision_id)
);

CREATE TABLE IF NOT EXISTS development_decision_evidence_link (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  decision_id VARCHAR NOT NULL REFERENCES development_decision(id) ON DELETE CASCADE,
  evidence_id VARCHAR NOT NULL,
  link_role TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT development_decision_evidence_link_unique UNIQUE (decision_id, evidence_id, link_role)
);

CREATE TABLE IF NOT EXISTS canonical_evidence_contribution (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  idempotency_key TEXT NOT NULL,
  decision_id VARCHAR NOT NULL REFERENCES development_decision(id),
  aggregation_unit_id TEXT NOT NULL,
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  academy_id VARCHAR NOT NULL REFERENCES academies(id),
  player_id VARCHAR NOT NULL REFERENCES players(id),
  canonical_skill_id TEXT NOT NULL REFERENCES canonical_skill_definition(id),
  benchmark_id TEXT NOT NULL,
  component_key TEXT,
  contribution_role TEXT NOT NULL DEFAULT 'DEVELOPMENT',
  prior_state_version INTEGER NOT NULL,
  resulting_state_version INTEGER NOT NULL,
  taxonomy_config_version TEXT NOT NULL,
  benchmark_config_version TEXT NOT NULL,
  evidence_config_version TEXT NOT NULL,
  strength_model_version TEXT NOT NULL,
  component_weight NUMERIC(8,6) NOT NULL,
  normalized_source_reliability NUMERIC(8,6) NOT NULL,
  normalized_protocol_quality NUMERIC(8,6) NOT NULL,
  normalized_observation_completeness NUMERIC(8,6) NOT NULL,
  normalized_benchmark_relevance_difficulty NUMERIC(8,6) NOT NULL,
  normalized_recency NUMERIC(8,6) NOT NULL,
  normalized_independent_corroboration NUMERIC(8,6) NOT NULL,
  computed_q NUMERIC(8,6) NOT NULL,
  absolute_delta NUMERIC(14,4) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT canonical_evidence_contribution_idempotency_unique UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS canonical_decision_application_receipt (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  decision_id VARCHAR NOT NULL REFERENCES development_decision(id) ON DELETE CASCADE,
  player_id VARCHAR NOT NULL REFERENCES players(id),
  state_version INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT canonical_decision_application_receipt_unique UNIQUE (decision_id)
);

CREATE TABLE IF NOT EXISTS development_decision_execution_attempt (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  decision_id VARCHAR NOT NULL REFERENCES development_decision(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('APPLIED', 'TECHNICAL_FAILURE', 'STALE_STATE_VERSION', 'CONFIG_INVALID', 'EVIDENCE_INELIGIBLE', 'AUTH_REVALIDATION_FAILED')),
  failure_class TEXT,
  stable_error_code TEXT,
  diagnostic_reference TEXT,
  expected_state_version INTEGER,
  observed_state_version INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT development_decision_execution_attempt_unique UNIQUE (decision_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS canonical_recalibration_event (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  academy_id VARCHAR NOT NULL REFERENCES academies(id),
  player_id VARCHAR NOT NULL REFERENCES players(id),
  actor_user_id VARCHAR REFERENCES users(id),
  reason TEXT NOT NULL,
  from_state_snapshot_id VARCHAR,
  to_state_snapshot_id VARCHAR,
  before_state JSONB NOT NULL,
  after_state JSONB NOT NULL,
  old_taxonomy_config_version TEXT NOT NULL,
  old_benchmark_config_version TEXT NOT NULL,
  old_evidence_config_version TEXT NOT NULL,
  old_strength_model_version TEXT NOT NULL,
  new_taxonomy_config_version TEXT NOT NULL,
  new_benchmark_config_version TEXT NOT NULL,
  new_evidence_config_version TEXT NOT NULL,
  new_strength_model_version TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS canonical_skill_definition_family_idx ON canonical_skill_definition(family);
CREATE INDEX IF NOT EXISTS canonical_skill_definition_pillar_idx ON canonical_skill_definition(pillar);
CREATE INDEX IF NOT EXISTS canonical_benchmark_pathway_level_idx ON canonical_benchmark_definition(pathway, level);
CREATE INDEX IF NOT EXISTS canonical_benchmark_classification_idx ON canonical_benchmark_definition(classification);
CREATE INDEX IF NOT EXISTS canonical_benchmark_component_skill_idx ON canonical_benchmark_component(canonical_skill_id);
CREATE INDEX IF NOT EXISTS player_canonical_progression_academy_placement_idx ON player_canonical_progression(academy_id, placement_status);
CREATE INDEX IF NOT EXISTS player_canonical_progression_academy_glow_idx ON player_canonical_progression(academy_id, glow_status);
CREATE INDEX IF NOT EXISTS player_canonical_progression_updated_idx ON player_canonical_progression(academy_id, updated_at);
CREATE INDEX IF NOT EXISTS player_canonical_skill_state_academy_skill_idx ON player_canonical_skill_state(academy_id, canonical_skill_id);
CREATE INDEX IF NOT EXISTS player_canonical_skill_state_benchmark_mastery_idx ON player_canonical_skill_state(active_benchmark_id, stage_relative_mastery);
CREATE INDEX IF NOT EXISTS player_canonical_skill_state_stale_idx ON player_canonical_skill_state(academy_id, last_evidence_at);
CREATE INDEX IF NOT EXISTS development_decision_player_status_idx ON development_decision(player_id, status);
CREATE INDEX IF NOT EXISTS development_decision_academy_created_idx ON development_decision(academy_id, created_at);
CREATE INDEX IF NOT EXISTS player_canonical_skill_history_player_skill_created_idx ON player_canonical_skill_history(player_id, canonical_skill_id, created_at);
CREATE INDEX IF NOT EXISTS player_canonical_skill_history_decision_idx ON player_canonical_skill_history(decision_id);
CREATE INDEX IF NOT EXISTS canonical_decision_snapshot_player_created_idx ON canonical_decision_snapshot(player_id, created_at);
CREATE INDEX IF NOT EXISTS development_decision_evidence_link_evidence_idx ON development_decision_evidence_link(evidence_id);
CREATE INDEX IF NOT EXISTS canonical_evidence_contribution_player_skill_idx ON canonical_evidence_contribution(player_id, canonical_skill_id);
CREATE INDEX IF NOT EXISTS canonical_recalibration_event_player_created_idx ON canonical_recalibration_event(player_id, created_at);