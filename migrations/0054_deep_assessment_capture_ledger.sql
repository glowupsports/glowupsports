CREATE TABLE IF NOT EXISTS deep_assessment_capture_ledger (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id varchar NOT NULL REFERENCES academies(id),
  player_id varchar NOT NULL REFERENCES players(id),
  coach_id varchar NOT NULL REFERENCES coaches(id),
  capture_id text NOT NULL,
  payload_hash text NOT NULL,
  assessment_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deep_assessment_capture_ledger_scope_unique
    UNIQUE (academy_id, player_id, coach_id, capture_id)
);

CREATE INDEX IF NOT EXISTS deep_assessment_capture_ledger_player_idx
  ON deep_assessment_capture_ledger (player_id, created_at);