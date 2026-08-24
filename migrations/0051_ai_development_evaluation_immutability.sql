-- Phase 3B closure: protect provenance identity and trusted inputs at the DB
-- boundary while allowing the service's one-way completion lifecycle.
CREATE OR REPLACE FUNCTION ai_development_evaluation_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AI_DEVELOPMENT_EVALUATION_IMMUTABILITY_VIOLATION: evaluation provenance cannot be deleted'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.evaluation_key IS DISTINCT FROM NEW.evaluation_key
    OR OLD.actor_user_id IS DISTINCT FROM NEW.actor_user_id
    OR OLD.actor_coach_id IS DISTINCT FROM NEW.actor_coach_id
    OR OLD.academy_id IS DISTINCT FROM NEW.academy_id
    OR OLD.player_id IS DISTINCT FROM NEW.player_id
    OR OLD.trigger IS DISTINCT FROM NEW.trigger
    OR OLD.evaluation_version IS DISTINCT FROM NEW.evaluation_version
    OR OLD.context_contract_version IS DISTINCT FROM NEW.context_contract_version
    OR OLD.context_hash IS DISTINCT FROM NEW.context_hash
    OR OLD.prompt_version IS DISTINCT FROM NEW.prompt_version
    OR OLD.prompt_hash IS DISTINCT FROM NEW.prompt_hash
    OR OLD.model IS DISTINCT FROM NEW.model
    OR OLD.requested_state_version IS DISTINCT FROM NEW.requested_state_version
    OR OLD.requested_versions_json IS DISTINCT FROM NEW.requested_versions_json
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'AI_DEVELOPMENT_EVALUATION_IMMUTABILITY_VIOLATION: trusted evaluation provenance cannot be rewritten'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status <> 'PROCESSING'
    AND (NEW.status <> OLD.status OR NEW.interpretation_json IS DISTINCT FROM OLD.interpretation_json
      OR NEW.diagnostics_json IS DISTINCT FROM OLD.diagnostics_json
      OR NEW.provider_request_id IS DISTINCT FROM OLD.provider_request_id
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at)
  THEN
    RAISE EXCEPTION 'AI_DEVELOPMENT_EVALUATION_IMMUTABILITY_VIOLATION: completed evaluation lifecycle cannot be rewritten'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_development_evaluation_immutable_guard ON ai_development_evaluation;
CREATE TRIGGER ai_development_evaluation_immutable_guard
BEFORE UPDATE OR DELETE ON ai_development_evaluation
FOR EACH ROW EXECUTE FUNCTION ai_development_evaluation_immutable_guard();