-- Task #404: AI Monthly Parent Reports
-- Creates the player_monthly_reports table for storing auto-generated monthly progress reports

CREATE TABLE IF NOT EXISTS player_monthly_reports (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id VARCHAR NOT NULL REFERENCES players(id),
  academy_id VARCHAR REFERENCES academies(id),
  month_year VARCHAR(7) NOT NULL,

  sessions_attended INTEGER NOT NULL DEFAULT 0,
  sessions_total INTEGER NOT NULL DEFAULT 0,

  pillar_highlights JSONB DEFAULT '[]'::jsonb,
  ai_progress_summary TEXT,
  next_milestone TEXT,

  coach_note TEXT,
  coach_id VARCHAR REFERENCES coaches(id),

  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  pdf_url TEXT,

  generated_at TIMESTAMP DEFAULT NOW(),
  finalised_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS player_monthly_reports_player_month_uniq
  ON player_monthly_reports (player_id, month_year);

CREATE INDEX IF NOT EXISTS player_monthly_reports_player_idx
  ON player_monthly_reports (player_id);

CREATE INDEX IF NOT EXISTS player_monthly_reports_academy_idx
  ON player_monthly_reports (academy_id);

CREATE INDEX IF NOT EXISTS player_monthly_reports_status_idx
  ON player_monthly_reports (status);

COMMENT ON TABLE player_monthly_reports IS 'Auto-generated monthly AI progress reports for parents — one per player per month';
