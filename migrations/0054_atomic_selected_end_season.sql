-- Atomic academy-wide End Season rollover. Closing snapshots become immutable
-- once an enrollment has ended, and a committed source season can only roll
-- forward once.
ALTER TABLE player_season_enrollments
  ADD COLUMN IF NOT EXISTS closing_history_snapshot jsonb NULL;

CREATE OR REPLACE FUNCTION player_season_enrollment_snapshot_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.ended_at IS NOT NULL
     AND (
       NEW.ended_at IS DISTINCT FROM OLD.ended_at
       OR NEW.closing_credit_snapshot IS DISTINCT FROM OLD.closing_credit_snapshot
       OR NEW.closing_history_snapshot IS DISTINCT FROM OLD.closing_history_snapshot
     ) THEN
    RAISE EXCEPTION 'PLAYER_SEASON_ENROLLMENT_SNAPSHOT_IMMUTABLE: closed enrollment snapshots cannot change'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS player_season_enrollment_snapshot_immutable_guard
  ON player_season_enrollments;
CREATE TRIGGER player_season_enrollment_snapshot_immutable_guard
BEFORE UPDATE ON player_season_enrollments
FOR EACH ROW EXECUTE FUNCTION player_season_enrollment_snapshot_immutable_guard();

CREATE TABLE IF NOT EXISTS academy_season_rollovers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id varchar NOT NULL REFERENCES academies(id),
  source_season_id varchar NOT NULL REFERENCES academy_seasons(id),
  next_season_id varchar NOT NULL REFERENCES academy_seasons(id),
  request_key text NOT NULL,
  selected_player_ids jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamp DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS academy_season_rollovers_source_unique
  ON academy_season_rollovers(academy_id, source_season_id);
CREATE UNIQUE INDEX IF NOT EXISTS academy_season_rollovers_request_unique
  ON academy_season_rollovers(academy_id, request_key);