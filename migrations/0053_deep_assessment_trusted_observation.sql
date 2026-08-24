CREATE TABLE IF NOT EXISTS deep_assessment_trusted_observation (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  deep_assessment_id varchar NOT NULL REFERENCES player_deep_assessments(id),
  player_id varchar NOT NULL REFERENCES players(id),
  academy_id varchar NOT NULL REFERENCES academies(id),
  source_system text NOT NULL,
  underlying_event_or_session_id text NOT NULL,
  observation_window text NOT NULL,
  source_type text NOT NULL,
  observed_required_observations integer NOT NULL CHECK (observed_required_observations >= 0),
  required_observations integer NOT NULL CHECK (required_observations > 0),
  occurred_at timestamptz NOT NULL,
  benchmark_relevance text NOT NULL CHECK (benchmark_relevance IN ('EXACT_BENCHMARK_COMPONENT', 'EXPLICIT_ADJACENT_COMPONENT')),
  verified_observer_ids jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deep_assessment_trusted_observation_player_idx
  ON deep_assessment_trusted_observation (player_id, created_at);
CREATE INDEX IF NOT EXISTS deep_assessment_trusted_observation_academy_idx
  ON deep_assessment_trusted_observation (academy_id, created_at);
CREATE INDEX IF NOT EXISTS deep_assessment_trusted_observation_assessment_idx
  ON deep_assessment_trusted_observation (deep_assessment_id, created_at);

CREATE OR REPLACE FUNCTION deep_assessment_trusted_observation_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DEEP_ASSESSMENT_TRUSTED_OBSERVATION_IMMUTABLE: snapshot is append-only'
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS deep_assessment_trusted_observation_immutable_guard
  ON deep_assessment_trusted_observation;
CREATE TRIGGER deep_assessment_trusted_observation_immutable_guard
BEFORE UPDATE OR DELETE ON deep_assessment_trusted_observation
FOR EACH ROW EXECUTE FUNCTION deep_assessment_trusted_observation_immutable_guard();