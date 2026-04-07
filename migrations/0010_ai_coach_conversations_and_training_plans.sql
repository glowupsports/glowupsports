-- Migration: Add ai_coach_conversations and player_ai_training_plans tables
-- Applied manually via direct SQL on 2026-04-07 (drizzle-kit push times out on large schema)

CREATE TABLE IF NOT EXISTS ai_coach_conversations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id varchar REFERENCES coaches(id),
  player_id varchar NOT NULL REFERENCES players(id),
  role text NOT NULL,
  content text NOT NULL,
  context_type text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_coach_conversations_player_idx
  ON ai_coach_conversations (player_id);

CREATE INDEX IF NOT EXISTS ai_coach_conversations_coach_player_idx
  ON ai_coach_conversations (coach_id, player_id);

CREATE INDEX IF NOT EXISTS ai_coach_conversations_context_type_idx
  ON ai_coach_conversations (player_id, context_type, created_at);

CREATE TABLE IF NOT EXISTS player_ai_training_plans (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id varchar NOT NULL REFERENCES players(id),
  coach_id varchar REFERENCES coaches(id),
  academy_id varchar REFERENCES academies(id),
  week_start_date date NOT NULL,
  plan_json jsonb,
  status text NOT NULL DEFAULT 'draft',
  coach_notes text,
  generated_at timestamp DEFAULT now(),
  approved_at timestamp
);

CREATE INDEX IF NOT EXISTS player_ai_training_plans_player_idx
  ON player_ai_training_plans (player_id);

CREATE INDEX IF NOT EXISTS player_ai_training_plans_week_idx
  ON player_ai_training_plans (week_start_date);

CREATE UNIQUE INDEX IF NOT EXISTS player_ai_training_plans_player_week_uniq
  ON player_ai_training_plans (player_id, week_start_date);
