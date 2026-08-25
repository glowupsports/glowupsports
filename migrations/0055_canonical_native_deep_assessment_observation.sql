CREATE TABLE IF NOT EXISTS canonical_native_deep_assessment_observation (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  academy_id varchar NOT NULL REFERENCES academies(id),
  player_id varchar NOT NULL REFERENCES players(id),
  coach_id varchar NOT NULL REFERENCES coaches(id),
  capture_id text NOT NULL,
  payload_hash text NOT NULL,
  benchmark_definition_id varchar NOT NULL REFERENCES canonical_benchmark_definition(id),
  benchmark_id text NOT NULL,
  canonical_skill_id text NOT NULL REFERENCES canonical_skill_definition(id),
  component_key text NOT NULL,
  taxonomy_config_version text NOT NULL,
  benchmark_config_version text NOT NULL,
  evidence_config_version text NOT NULL,
  strength_model_version text NOT NULL,
  glow_config_version text NOT NULL,
  source_system text NOT NULL,
  underlying_event_or_session_id text NOT NULL,
  observation_window text NOT NULL,
  source_type text NOT NULL,
  observed_required_observations integer NOT NULL CHECK (observed_required_observations >= required_observations),
  required_observations integer NOT NULL CHECK (required_observations > 0),
  occurred_at timestamptz NOT NULL,
  benchmark_relevance text NOT NULL CHECK (benchmark_relevance = 'EXACT_BENCHMARK_COMPONENT'),
  verified_observer_ids jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canonical_native_deep_assessment_observation_capture_scope_unique
    UNIQUE (academy_id, player_id, coach_id, capture_id)
);

CREATE INDEX IF NOT EXISTS canonical_native_deep_assessment_observation_player_idx
  ON canonical_native_deep_assessment_observation (player_id, created_at);
CREATE INDEX IF NOT EXISTS canonical_native_deep_assessment_observation_academy_idx
  ON canonical_native_deep_assessment_observation (academy_id, created_at);

-- Drizzle may have created this additive table before this SQL migration ran.
-- Retrofit every integrity check explicitly so that upgrade path receives the
-- same controls as a fresh CREATE TABLE path.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canonical_native_da_required_positive_chk'
      AND conrelid = 'canonical_native_deep_assessment_observation'::regclass
  ) THEN
    ALTER TABLE canonical_native_deep_assessment_observation
      ADD CONSTRAINT canonical_native_da_required_positive_chk
      CHECK (required_observations > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canonical_native_da_observed_complete_chk'
      AND conrelid = 'canonical_native_deep_assessment_observation'::regclass
  ) THEN
    ALTER TABLE canonical_native_deep_assessment_observation
      ADD CONSTRAINT canonical_native_da_observed_complete_chk
      CHECK (observed_required_observations >= required_observations);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canonical_native_da_relevance_exact_chk'
      AND conrelid = 'canonical_native_deep_assessment_observation'::regclass
  ) THEN
    ALTER TABLE canonical_native_deep_assessment_observation
      ADD CONSTRAINT canonical_native_da_relevance_exact_chk
      CHECK (benchmark_relevance = 'EXACT_BENCHMARK_COMPONENT');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION canonical_native_deep_assessment_observation_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_NATIVE_DEEP_ASSESSMENT_OBSERVATION_IMMUTABLE: snapshot is append-only'
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS canonical_native_deep_assessment_observation_immutable_guard
  ON canonical_native_deep_assessment_observation;
CREATE TRIGGER canonical_native_deep_assessment_observation_immutable_guard
BEFORE UPDATE OR DELETE ON canonical_native_deep_assessment_observation
FOR EACH ROW EXECUTE FUNCTION canonical_native_deep_assessment_observation_immutable_guard();