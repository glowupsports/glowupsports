-- Task #399: AI Match Prep + Tournament Readiness Score
-- Creates player_match_readiness table for caching AI-generated readiness cards

CREATE TABLE IF NOT EXISTS player_match_readiness (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id VARCHAR NOT NULL REFERENCES players(id),
  tournament_match_id VARCHAR REFERENCES tournament_matches(id),
  match_date DATE NOT NULL,
  readiness_score INTEGER NOT NULL,
  top_strength TEXT NOT NULL,
  biggest_gap TEXT NOT NULL,
  tactical_tips JSONB NOT NULL DEFAULT '[]',
  dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS pmr_player_idx ON player_match_readiness(player_id);
CREATE INDEX IF NOT EXISTS pmr_match_date_idx ON player_match_readiness(match_date);
CREATE UNIQUE INDEX IF NOT EXISTS pmr_player_matchdate_unique ON player_match_readiness(player_id, match_date);
