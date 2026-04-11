-- =====================================================================
-- DSS Speelsterkte Thresholds seed — KNLTB 2026 official boundaries
-- Source: KNLTB DSS (Dynamisch Speelsterkte Systeem) 2026 publication
-- Run via: psql "$SUPABASE_DATABASE_URL" -f server/seeds/dss-speelsterkte-seed.sql
-- =====================================================================

-- Create table (idempotent)
CREATE TABLE IF NOT EXISTS dss_speelsterkte_thresholds (
  speelsterkte          integer     PRIMARY KEY,
  men_singles_max_rating   numeric,
  women_singles_max_rating numeric,
  men_doubles_max_rating   numeric,
  women_doubles_max_rating numeric,
  notes                 text
);

-- Seed all 9 speelsterkte rows with 2026 KNLTB official boundaries
-- NULL max_rating = ranking-based / no upper numeric boundary
INSERT INTO dss_speelsterkte_thresholds
  (speelsterkte, men_singles_max_rating, women_singles_max_rating, men_doubles_max_rating, women_doubles_max_rating, notes)
VALUES
  (1, NULL,   NULL,   NULL,   NULL,   'Ranking-based; national/international level'),
  (2, NULL,   NULL,   NULL,   NULL,   'Top national competitive players'),
  (3, 3.7985, 3.8347, 3.7985, 3.8347, 'Advanced competitive; KNLTB 2026 boundary'),
  (4, 4.8287, 4.8792, 4.8287, 4.8792, 'Strong club player; KNLTB 2026 boundary'),
  (5, 5.8669, 5.8959, 5.8669, 5.8959, 'Mid-level club player; KNLTB 2026 boundary'),
  (6, 6.8999, 6.8999, 6.8999, 6.8999, 'Recreational competitive; KNLTB 2026 boundary'),
  (7, 7.9999, 7.9999, 7.9999, 7.9999, 'Regular recreational player; KNLTB 2026 boundary'),
  (8, 8.9999, 8.9999, 8.9999, 8.9999, 'Beginner competitive; KNLTB 2026 boundary'),
  (9, NULL,   NULL,   NULL,   NULL,   'Entry level; DSS >= 9.0000')
ON CONFLICT (speelsterkte) DO UPDATE SET
  men_singles_max_rating   = EXCLUDED.men_singles_max_rating,
  women_singles_max_rating = EXCLUDED.women_singles_max_rating,
  men_doubles_max_rating   = EXCLUDED.men_doubles_max_rating,
  women_doubles_max_rating = EXCLUDED.women_doubles_max_rating,
  notes                    = EXCLUDED.notes;

-- Store K=0.275 ELO update formula constant in app_config
CREATE TABLE IF NOT EXISTS app_config (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  description text,
  created_at  timestamp DEFAULT now()
);

INSERT INTO app_config (key, value, description)
VALUES ('dss_k_factor', '0.275', 'KNLTB DSS 2026 ELO update K-factor (K = 0.275)')
ON CONFLICT (key) DO UPDATE SET
  value       = EXCLUDED.value,
  description = EXCLUDED.description;

-- Verify
SELECT speelsterkte, men_singles_max_rating, women_singles_max_rating, notes
FROM dss_speelsterkte_thresholds
ORDER BY speelsterkte;

SELECT key, value, description FROM app_config WHERE key = 'dss_k_factor';
