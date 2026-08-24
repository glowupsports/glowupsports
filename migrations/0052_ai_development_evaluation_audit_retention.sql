-- Immutable AI provenance is retained independently of player lifecycle.
-- Removing the player FK avoids a cascade DELETE attempting to delete a
-- protected audit record.
ALTER TABLE ai_development_evaluation
  DROP CONSTRAINT IF EXISTS ai_development_evaluation_player_id_fkey;