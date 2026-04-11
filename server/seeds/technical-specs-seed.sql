-- =====================================================================
-- Technical specs seed: court dimensions per ball-level stage
-- Source: ITF Rules of Tennis Appendix VIII + LTA Mini Tennis guidelines
-- Run via: psql "$SUPABASE_DATABASE_URL" -f server/seeds/technical-specs-seed.sql
-- =====================================================================

-- Ensure column exists (idempotent)
ALTER TABLE ball_levels ADD COLUMN IF NOT EXISTS technical_specs JSONB;

-- RED stage (ITF Stage 3) — 11 m × 5.5 m court, 80 cm net
UPDATE ball_levels SET technical_specs = '{"courtLengthM":11,"courtWidthM":5.5,"netHeightCm":80,"racketSizeInchMax":23,"racketSizeLabel":"up to 23 inches","ageBand":"up to 8 years","itfStageName":"Stage 3 – Red","ballDescription":"Red foam or low-compression red ball (75%)"}'::jsonb WHERE id = 'RED_3';
UPDATE ball_levels SET technical_specs = '{"courtLengthM":11,"courtWidthM":5.5,"netHeightCm":80,"racketSizeInchMax":23,"racketSizeLabel":"up to 23 inches","ageBand":"up to 8 years","itfStageName":"Stage 3 – Red","ballDescription":"Red foam or low-compression red ball (75%)"}'::jsonb WHERE id = 'RED_2';
UPDATE ball_levels SET technical_specs = '{"courtLengthM":11,"courtWidthM":5.5,"netHeightCm":80,"racketSizeInchMax":23,"racketSizeLabel":"up to 23 inches","ageBand":"up to 8 years","itfStageName":"Stage 3 – Red","ballDescription":"Red foam or low-compression red ball (75%)"}'::jsonb WHERE id = 'RED_1';

-- ORANGE stage (ITF Stage 2) — 18 m × 6.5 m court, 80 cm net
UPDATE ball_levels SET technical_specs = '{"courtLengthM":18,"courtWidthM":6.5,"netHeightCm":80,"racketSizeInchMin":23,"racketSizeInchMax":25,"racketSizeLabel":"23–25 inches","ageBand":"8–10 years","itfStageName":"Stage 2 – Orange","ballDescription":"Orange low-compression ball (50%)"}'::jsonb WHERE id = 'ORANGE_3';
UPDATE ball_levels SET technical_specs = '{"courtLengthM":18,"courtWidthM":6.5,"netHeightCm":80,"racketSizeInchMin":23,"racketSizeInchMax":25,"racketSizeLabel":"23–25 inches","ageBand":"8–10 years","itfStageName":"Stage 2 – Orange","ballDescription":"Orange low-compression ball (50%)"}'::jsonb WHERE id = 'ORANGE_2';
UPDATE ball_levels SET technical_specs = '{"courtLengthM":18,"courtWidthM":6.5,"netHeightCm":80,"racketSizeInchMin":23,"racketSizeInchMax":25,"racketSizeLabel":"23–25 inches","ageBand":"8–10 years","itfStageName":"Stage 2 – Orange","ballDescription":"Orange low-compression ball (50%)"}'::jsonb WHERE id = 'ORANGE_1';

-- GREEN stage (ITF Stage 1) — Full court 23.77 m × 8.23 m, standard 91.4 cm net
UPDATE ball_levels SET technical_specs = '{"courtLengthM":23.77,"courtWidthM":8.23,"netHeightCm":91.4,"racketSizeInchMin":25,"racketSizeInchMax":26,"racketSizeLabel":"25–26 inches","ageBand":"9–10 years","itfStageName":"Stage 1 – Green","ballDescription":"Green low-compression ball (75%)"}'::jsonb WHERE id = 'GREEN_3';
UPDATE ball_levels SET technical_specs = '{"courtLengthM":23.77,"courtWidthM":8.23,"netHeightCm":91.4,"racketSizeInchMin":25,"racketSizeInchMax":26,"racketSizeLabel":"25–26 inches","ageBand":"9–10 years","itfStageName":"Stage 1 – Green","ballDescription":"Green low-compression ball (75%)"}'::jsonb WHERE id = 'GREEN_2';
UPDATE ball_levels SET technical_specs = '{"courtLengthM":23.77,"courtWidthM":8.23,"netHeightCm":91.4,"racketSizeInchMin":25,"racketSizeInchMax":26,"racketSizeLabel":"25–26 inches","ageBand":"9–10 years","itfStageName":"Stage 1 – Green","ballDescription":"Green low-compression ball (75%)"}'::jsonb WHERE id = 'GREEN_1';

-- YELLOW stage (ITF Stage 0) — Full court, standard yellow ball
UPDATE ball_levels SET technical_specs = '{"courtLengthM":23.77,"courtWidthM":8.23,"netHeightCm":91.4,"racketSizeLabel":"26+ inches (adult)","ageBand":"10+ years","itfStageName":"Stage 0 – Yellow (Full Court)","ballDescription":"Standard yellow pressurised ball"}'::jsonb WHERE id = 'YELLOW_3';
UPDATE ball_levels SET technical_specs = '{"courtLengthM":23.77,"courtWidthM":8.23,"netHeightCm":91.4,"racketSizeLabel":"26+ inches (adult)","ageBand":"10+ years","itfStageName":"Stage 0 – Yellow (Full Court)","ballDescription":"Standard yellow pressurised ball"}'::jsonb WHERE id = 'YELLOW_2';
UPDATE ball_levels SET technical_specs = '{"courtLengthM":23.77,"courtWidthM":8.23,"netHeightCm":91.4,"racketSizeLabel":"26+ inches (adult)","ageBand":"10+ years","itfStageName":"Stage 0 – Yellow (Full Court)","ballDescription":"Standard yellow pressurised ball"}'::jsonb WHERE id = 'YELLOW_1';

-- BLUE stage — Foundation full-court tennis (ages 10–12)
UPDATE ball_levels SET technical_specs = '{"courtLengthM":23.77,"courtWidthM":8.23,"netHeightCm":91.4,"racketSizeLabel":"26+ inches (adult)","ageBand":"10–12 years","itfStageName":"Stage 0 – Yellow (Full Court)","ballDescription":"Standard yellow pressurised ball","note":"Blue stage: foundation full-court tennis"}'::jsonb WHERE id = 'BLUE_3';
UPDATE ball_levels SET technical_specs = '{"courtLengthM":23.77,"courtWidthM":8.23,"netHeightCm":91.4,"racketSizeLabel":"26+ inches (adult)","ageBand":"10–12 years","itfStageName":"Stage 0 – Yellow (Full Court)","ballDescription":"Standard yellow pressurised ball","note":"Blue stage: foundation full-court tennis"}'::jsonb WHERE id = 'BLUE_2';
UPDATE ball_levels SET technical_specs = '{"courtLengthM":23.77,"courtWidthM":8.23,"netHeightCm":91.4,"racketSizeLabel":"26+ inches (adult)","ageBand":"10–12 years","itfStageName":"Stage 0 – Yellow (Full Court)","ballDescription":"Standard yellow pressurised ball","note":"Blue stage: foundation full-court tennis"}'::jsonb WHERE id = 'BLUE_1';

-- GLOW stage — Adult full-court (Glow Rank 1–9)
UPDATE ball_levels SET technical_specs = '{"courtLengthM":23.77,"courtWidthM":8.23,"netHeightCm":91.4,"racketSizeLabel":"Standard adult racket","ageBand":"Adult","itfStageName":"Glow Rank – Adult Full Court","ballDescription":"Standard yellow pressurised ball"}'::jsonb WHERE stage = 'GLOW';

-- Verify
SELECT id, stage, technical_specs->'courtLengthM' AS court_length_m, technical_specs->'itfStageName' AS itf_stage
FROM ball_levels
WHERE technical_specs IS NOT NULL
ORDER BY stage, id;
