-- Phase 3B: server-side AI interpretation provenance.
-- Additive only: this table is not part of canonical progression state and
-- intentionally has no DevelopmentDecision foreign key.
CREATE TABLE IF NOT EXISTS ai_development_evaluation (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_key TEXT NOT NULL,
  actor_user_id VARCHAR NOT NULL REFERENCES users(id),
  actor_coach_id VARCHAR REFERENCES coaches(id),
  academy_id VARCHAR NOT NULL REFERENCES academies(id),
  player_id VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  evaluation_version TEXT NOT NULL,
  context_contract_version TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  requested_state_version INTEGER NOT NULL,
  requested_versions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  interpretation_json JSONB,
  diagnostics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_request_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_development_evaluation_key_unique
  ON ai_development_evaluation (evaluation_key);
CREATE INDEX IF NOT EXISTS ai_development_evaluation_player_created_idx
  ON ai_development_evaluation (player_id, created_at);
CREATE INDEX IF NOT EXISTS ai_development_evaluation_academy_created_idx
  ON ai_development_evaluation (academy_id, created_at);