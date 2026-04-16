-- Task #606: Delete 8 test accounts for ltvjeugd@gmail.com
-- Run with: psql "$SUPABASE_DATABASE_URL" -f scripts/delete-test-accounts-606.sql
--
-- Deletes exactly 8 test/dummy accounts tied to ltvjeugd@gmail.com.
-- KEEPS: thelaw (platform_owner) and any other accounts not in the allowed list.
--
-- Strategy: FK enforcement stays ON throughout. We delete from all child tables
-- BEFORE deleting from players, and from players BEFORE deleting from users.
-- Tables with ON DELETE CASCADE (identities, sessions, mfa_factors, push_device_tokens,
-- feature_events, group_event_rsvps, etc.) auto-clean when users are deleted.

BEGIN;

DO $$
DECLARE
  -- Derive target user IDs from email + exact username allowlist.
  -- thelaw is intentionally excluded from this list.
  target_usernames text[] := ARRAY[
    'test21', 'testacademy', 'test2', 'test1',
    'rolandk', 'patty', 'jokeb', 'ltvjeugd_78f8'
  ];
  target_user_ids   uuid[];
  target_player_ids uuid[];
  users_deleted     int;
  players_deleted   int;
BEGIN
  -- ── DERIVE TARGET IDS FROM DATABASE ──────────────────────────────────────
  SELECT ARRAY_AGG(id::uuid)
  INTO   target_user_ids
  FROM   users
  WHERE  email    = 'ltvjeugd@gmail.com'
    AND  username = ANY(target_usernames)
    AND  username != 'thelaw';   -- belt-and-suspenders: never delete thelaw

  IF target_user_ids IS NULL OR array_length(target_user_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No matching users found — aborting.';
  END IF;

  -- Resolve the player profile IDs linked to these users
  SELECT ARRAY_AGG(id::uuid)
  INTO   target_player_ids
  FROM   players
  WHERE  user_id = ANY(target_user_ids);

  RAISE NOTICE 'Targeting % user(s) and % player profile(s)',
    array_length(target_user_ids, 1),
    COALESCE(array_length(target_player_ids, 1), 0);

  -- ── SAFETY GATE ──────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = ANY(target_user_ids)
      AND (email != 'ltvjeugd@gmail.com' OR username = 'thelaw')
  ) THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: thelaw or wrong-email account in target set.';
  END IF;

  -- ── CASCADE CLEANUP: player-linked rows (must run BEFORE deleting players) ─
  -- These tables have NO ACTION / RESTRICT FK to players.id, so they must be
  -- cleared first. Tables with ON DELETE CASCADE are skipped here — they clean
  -- up automatically when we delete players or users.

  -- XP / gamification
  DELETE FROM player_xp_events              WHERE player_id = ANY(target_player_ids);
  DELETE FROM xp_transactions               WHERE player_id = ANY(target_player_ids);
  DELETE FROM level_up_events               WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_level_events           WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_level_up_celebrations  WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_feature_unlock_history WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_streaks                WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_quests                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM daily_quest_slots             WHERE player_id = ANY(target_player_ids);
  DELETE FROM quest_chain_bonus_claims      WHERE player_id = ANY(target_player_ids);

  -- Badges / titles / skills
  DELETE FROM player_badges                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_titles                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_skill_state            WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_skill_scores           WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_pillar_progress        WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_ball_levels            WHERE player_id = ANY(target_player_ids);

  -- Baselines / assessments
  DELETE FROM player_baseline_skill_scores  WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_baselines              WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_deep_assessments       WHERE player_id = ANY(target_player_ids);
  DELETE FROM deep_assessment_pillar_summaries WHERE player_id = ANY(target_player_ids);
  DELETE FROM adult_skill_assessments       WHERE player_id = ANY(target_player_ids);
  DELETE FROM domain_assessments            WHERE player_id = ANY(target_player_ids);
  DELETE FROM skill_evidence                WHERE player_id = ANY(target_player_ids);
  DELETE FROM level_trials                  WHERE player_id = ANY(target_player_ids);

  -- Progress / notifications / notes / holidays
  DELETE FROM player_progress               WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_progress_flags         WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_notifications          WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_notes                  WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_holidays               WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_ai_insights            WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_ai_training_plans      WHERE player_id = ANY(target_player_ids);
  DELETE FROM ai_coach_conversations        WHERE player_id = ANY(target_player_ids);

  -- Social / connections / matches (player vs player)
  DELETE FROM player_matches                WHERE initiator_id = ANY(target_player_ids)
                                               OR receiver_id  = ANY(target_player_ids);
  DELETE FROM player_connections            WHERE player1_id = ANY(target_player_ids)
                                               OR player2_id = ANY(target_player_ids);
  DELETE FROM player_invites                WHERE player_id = ANY(target_player_ids);
  DELETE FROM spotlight_nominations         WHERE nominated_player_id = ANY(target_player_ids)
                                               OR nominator_player_id = ANY(target_player_ids);
  DELETE FROM spotlight_weekly_winners      WHERE player_id = ANY(target_player_ids);
  DELETE FROM spotlight_monthly_winners     WHERE player_id = ANY(target_player_ids);

  -- Sessions / series / waitlist / ratings
  DELETE FROM session_players               WHERE player_id = ANY(target_player_ids);
  DELETE FROM session_waitlist              WHERE player_id = ANY(target_player_ids);
  DELETE FROM session_ratings               WHERE player_id = ANY(target_player_ids);
  DELETE FROM session_skill_feedback        WHERE player_id = ANY(target_player_ids);
  DELETE FROM session_skill_observations    WHERE player_id = ANY(target_player_ids);
  DELETE FROM session_ai_chats              WHERE player_id = ANY(target_player_ids);
  DELETE FROM in_session_feedback           WHERE player_id = ANY(target_player_ids);
  DELETE FROM series_players                WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_session_cancellations  WHERE player_id = ANY(target_player_ids);
  DELETE FROM lesson_group_members          WHERE player_id = ANY(target_player_ids);

  -- Billing / credits / bookings
  DELETE FROM credit_transactions           WHERE player_id = ANY(target_player_ids);
  DELETE FROM packages                      WHERE player_id = ANY(target_player_ids);
  DELETE FROM invoices                      WHERE player_id = ANY(target_player_ids);
  DELETE FROM payments                      WHERE player_id = ANY(target_player_ids);
  DELETE FROM payment_reminders             WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_subscriptions          WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_booking_preferences    WHERE player_id = ANY(target_player_ids);
  DELETE FROM booking_requests              WHERE player_id = ANY(target_player_ids);
  DELETE FROM booking_invite_guests         WHERE player_id = ANY(target_player_ids);
  DELETE FROM booking_invites               WHERE host_player_id = ANY(target_player_ids);
  DELETE FROM court_bookings                WHERE player_id = ANY(target_player_ids);
  DELETE FROM equipment_rentals             WHERE player_id = ANY(target_player_ids);

  -- Corporate
  DELETE FROM corporate_members             WHERE player_id = ANY(target_player_ids);
  DELETE FROM corporate_credit_transactions WHERE player_id = ANY(target_player_ids);

  -- Match / tournament / ladder
  DELETE FROM match_requests                WHERE player_id              = ANY(target_player_ids)
                                               OR invited_player_id     = ANY(target_player_ids)
                                               OR matched_with_player_id = ANY(target_player_ids);
  DELETE FROM match_logs                    WHERE player_id          = ANY(target_player_ids)
                                               OR opponent_player_id = ANY(target_player_ids);
  DELETE FROM matches                       WHERE player_id = ANY(target_player_ids);
  DELETE FROM match_opponents               WHERE player_id = ANY(target_player_ids);
  DELETE FROM match_plans                   WHERE player_id = ANY(target_player_ids);
  DELETE FROM match_reflections             WHERE player_id = ANY(target_player_ids);
  DELETE FROM match_pillar_scores           WHERE player_id = ANY(target_player_ids);
  DELETE FROM match_challenges              WHERE winner_player_id = ANY(target_player_ids);
  DELETE FROM match_training_suggestions    WHERE player_id = ANY(target_player_ids);
  DELETE FROM adult_glow_matches            WHERE player_id   = ANY(target_player_ids)
                                               OR opponent_id = ANY(target_player_ids);
  DELETE FROM open_match_slots              WHERE player_id = ANY(target_player_ids);
  DELETE FROM open_matches                  WHERE host_player_id = ANY(target_player_ids);
  DELETE FROM tournament_participants       WHERE player_id = ANY(target_player_ids);
  DELETE FROM tournament_matches            WHERE player1_id = ANY(target_player_ids)
                                               OR player2_id = ANY(target_player_ids)
                                               OR winner_id  = ANY(target_player_ids);
  DELETE FROM tournaments                   WHERE winner_id = ANY(target_player_ids);
  DELETE FROM ladder_players                WHERE player_id = ANY(target_player_ids);
  DELETE FROM ladder_challenges             WHERE challenger_id = ANY(target_player_ids)
                                               OR challenged_id = ANY(target_player_ids)
                                               OR winner_id     = ANY(target_player_ids);

  -- Conversations / messaging
  DELETE FROM message_reactions             WHERE reactor_player_id = ANY(target_player_ids);
  DELETE FROM messages                      WHERE sender_player_id  = ANY(target_player_ids);
  DELETE FROM conversation_participants     WHERE player_id = ANY(target_player_ids);
  DELETE FROM conversations                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM squad_members                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM play_request_participants     WHERE player_id = ANY(target_player_ids);
  DELETE FROM play_requests                 WHERE creator_id = ANY(target_player_ids);

  -- Reviews
  DELETE FROM coach_reviews                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM coach_match_reviews           WHERE player_id = ANY(target_player_ids);
  DELETE FROM review_prompts                WHERE player_id = ANY(target_player_ids);

  -- Shop / marketplace
  DELETE FROM shop_orders                   WHERE player_id = ANY(target_player_ids);
  DELETE FROM shop_wishlist                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM marketplace_messages          WHERE sender_id    = ANY(target_player_ids)
                                               OR recipient_id = ANY(target_player_ids);
  DELETE FROM marketplace_favorites         WHERE player_id = ANY(target_player_ids);
  DELETE FROM marketplace_listings          WHERE seller_id = ANY(target_player_ids);
  DELETE FROM seller_profiles               WHERE player_id = ANY(target_player_ids);

  -- Academy / transfers / parents
  DELETE FROM join_requests                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM academy_transfer_requests     WHERE player_id = ANY(target_player_ids);
  DELETE FROM parent_player_relations       WHERE player_id = ANY(target_player_ids);

  -- Service providers
  DELETE FROM provider_client_notes         WHERE player_id = ANY(target_player_ids);
  DELETE FROM provider_client_preferences   WHERE player_id = ANY(target_player_ids);

  -- Push tokens by player_id (not cascade from users in all environments)
  DELETE FROM push_device_tokens            WHERE player_id = ANY(target_player_ids);

  -- ── DELETE PLAYER PROFILES ───────────────────────────────────────────────
  DELETE FROM players WHERE id = ANY(target_player_ids);
  GET DIAGNOSTICS players_deleted = ROW_COUNT;
  RAISE NOTICE 'Player profiles deleted: %', players_deleted;

  -- ── DELETE USER ACCOUNTS ─────────────────────────────────────────────────
  -- push_device_tokens, identities, sessions, mfa_factors, feature_events, etc.
  -- all have ON DELETE CASCADE on user_id and will auto-delete here.
  DELETE FROM users
  WHERE  id       = ANY(target_user_ids)
    AND  email    = 'ltvjeugd@gmail.com'   -- belt-and-suspenders email guard
    AND  username != 'thelaw';             -- belt-and-suspenders username guard
  GET DIAGNOSTICS users_deleted = ROW_COUNT;
  RAISE NOTICE 'User accounts deleted: %', users_deleted;

  -- ── POST-DELETE ASSERTIONS ───────────────────────────────────────────────
  IF users_deleted != array_length(target_user_ids, 1) THEN
    RAISE EXCEPTION 'Expected % users deleted, got %. Rolling back.',
      array_length(target_user_ids, 1), users_deleted;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users WHERE username = 'thelaw' AND email = 'ltvjeugd@gmail.com'
  ) THEN
    RAISE EXCEPTION 'SAFETY FAILURE: thelaw account missing after delete — rolling back!';
  END IF;

  -- Verify no orphaned player-linked rows remain for the deleted player IDs
  IF target_player_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM session_players WHERE player_id = ANY(target_player_ids)
  ) THEN
    RAISE EXCEPTION 'Orphaned session_players rows remain — rolling back!';
  END IF;

  IF target_player_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM credit_transactions WHERE player_id = ANY(target_player_ids)
  ) THEN
    RAISE EXCEPTION 'Orphaned credit_transactions rows remain — rolling back!';
  END IF;

  RAISE NOTICE 'All assertions passed. thelaw intact. % test account(s) removed.', users_deleted;
END $$;

COMMIT;

-- ── VERIFICATION QUERY (run after commit to confirm) ─────────────────────
SELECT username, role
FROM   users
WHERE  email = 'ltvjeugd@gmail.com'
ORDER  BY username;
