-- Task #606: Delete 8 test accounts for ltvjeugd@gmail.com
-- Run with: psql "$SUPABASE_DATABASE_URL" -f scripts/delete-test-accounts-606.sql
--
-- Deletes exactly 8 test/dummy accounts. Keeps thelaw (platform_owner) and all
-- other ltvjeugd@gmail.com accounts not in the target list.
--
-- Schema note:
--   users.player_id  → players.id   (user's linked player profile)
--   users.coach_id   → coaches.id   (user's linked coach profile)
--   There is NO players.user_id column.
--
-- Strategy: FK enforcement stays ON. We delete children before parents,
-- in order: player-linked rows → coach-linked rows → players → coaches → users.
-- Tables with ON DELETE CASCADE auto-clean when users row is deleted.

BEGIN;

DO $$
DECLARE
  target_usernames  text[] := ARRAY[
    'test21', 'testacademy', 'test2', 'test1',
    'rolandk', 'patty', 'jokeb', 'ltvjeugd_78f8'
  ];
  target_user_ids   uuid[];
  target_player_ids uuid[];
  target_coach_ids  uuid[];
  users_deleted     int;
  players_deleted   int;
  coaches_deleted   int;
BEGIN
  -- ── DERIVE TARGET IDS ──────────────────────────────────────────────────
  -- Resolve user IDs by email + username — never by hardcoded UUIDs.
  SELECT ARRAY_AGG(id::uuid)
  INTO   target_user_ids
  FROM   users
  WHERE  email    = 'ltvjeugd@gmail.com'
    AND  username  = ANY(target_usernames)
    AND  username != 'thelaw';   -- belt-and-suspenders

  -- Resolve player profile IDs from users.player_id (NOT players.user_id)
  SELECT ARRAY_AGG(player_id::uuid)
  INTO   target_player_ids
  FROM   users
  WHERE  id        = ANY(target_user_ids)
    AND  player_id IS NOT NULL;

  -- Resolve coach profile IDs from users.coach_id
  SELECT ARRAY_AGG(coach_id::uuid)
  INTO   target_coach_ids
  FROM   users
  WHERE  id       = ANY(target_user_ids)
    AND  coach_id IS NOT NULL;

  -- ── SAFETY GATES ─────────────────────────────────────────────────────────
  IF target_user_ids IS NULL OR array_length(target_user_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No matching users found — aborting.';
  END IF;

  -- Exact-count guard: fail loudly rather than silently partial-delete.
  IF array_length(target_user_ids, 1) != 8 THEN
    RAISE EXCEPTION
      'Expected exactly 8 target users, found %. Aborting to prevent partial delete.',
      array_length(target_user_ids, 1);
  END IF;

  -- Verify every target user belongs to the correct email and is not thelaw.
  IF EXISTS (
    SELECT 1 FROM users
    WHERE  id = ANY(target_user_ids)
      AND  (email != 'ltvjeugd@gmail.com' OR username = 'thelaw')
  ) THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: wrong-email or thelaw in target set — aborting!';
  END IF;

  RAISE NOTICE 'Targeting % user(s), % player profile(s), % coach profile(s)',
    array_length(target_user_ids, 1),
    COALESCE(array_length(target_player_ids, 1), 0),
    COALESCE(array_length(target_coach_ids, 1), 0);

  -- ── STEP 1: PLAYER-LINKED CHILD ROWS ─────────────────────────────────────
  -- Must run before DELETE FROM players (FK: RESTRICT / NO ACTION).
  -- Note: tables also having coach_id FKs are included here; those rows
  -- reference the target players so they must be deleted regardless.

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

  -- Baselines / assessments / evidence
  DELETE FROM player_baseline_skill_scores  WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_baselines              WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_deep_assessments       WHERE player_id = ANY(target_player_ids);
  DELETE FROM deep_assessment_pillar_summaries WHERE player_id = ANY(target_player_ids);
  DELETE FROM adult_skill_assessments       WHERE player_id = ANY(target_player_ids);
  DELETE FROM domain_assessments            WHERE player_id = ANY(target_player_ids);
  DELETE FROM skill_evidence                WHERE player_id = ANY(target_player_ids);
  DELETE FROM level_trials                  WHERE player_id = ANY(target_player_ids);

  -- Progress / notifications / notes / AI
  DELETE FROM player_progress               WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_progress_flags         WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_notifications          WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_notes                  WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_holidays               WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_ai_insights            WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_ai_training_plans      WHERE player_id = ANY(target_player_ids);
  DELETE FROM ai_coach_conversations        WHERE player_id = ANY(target_player_ids);
  DELETE FROM video_feedback                WHERE player_id = ANY(target_player_ids);

  -- Social / connections
  DELETE FROM player_matches                WHERE initiator_id = ANY(target_player_ids)
                                               OR receiver_id  = ANY(target_player_ids);
  DELETE FROM player_connections            WHERE player1_id = ANY(target_player_ids)
                                               OR player2_id = ANY(target_player_ids);
  DELETE FROM player_invites                WHERE player_id = ANY(target_player_ids);
  DELETE FROM spotlight_nominations         WHERE nominated_player_id = ANY(target_player_ids)
                                               OR nominator_player_id = ANY(target_player_ids);
  DELETE FROM spotlight_weekly_winners      WHERE player_id = ANY(target_player_ids);
  DELETE FROM spotlight_monthly_winners     WHERE player_id = ANY(target_player_ids);

  -- Sessions / series / waitlist / ratings / feedback
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

  -- Billing / credits / bookings / corporate
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
  DELETE FROM slot_reservations             WHERE player_id = ANY(target_player_ids);
  DELETE FROM corporate_members             WHERE player_id = ANY(target_player_ids);
  DELETE FROM corporate_credit_transactions WHERE player_id = ANY(target_player_ids);

  -- Matches / tournaments / ladders
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

  -- Messaging / conversations
  DELETE FROM message_reactions             WHERE reactor_player_id = ANY(target_player_ids);
  DELETE FROM messages                      WHERE sender_player_id  = ANY(target_player_ids);
  DELETE FROM conversation_participants     WHERE player_id = ANY(target_player_ids);
  DELETE FROM conversations                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM squad_members                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM play_request_participants     WHERE player_id = ANY(target_player_ids);
  DELETE FROM play_requests                 WHERE creator_id = ANY(target_player_ids);

  -- Reviews / shop / marketplace / academy / parents
  DELETE FROM coach_reviews                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM coach_match_reviews           WHERE player_id = ANY(target_player_ids);
  DELETE FROM review_prompts                WHERE player_id = ANY(target_player_ids);
  DELETE FROM shop_orders                   WHERE player_id = ANY(target_player_ids);
  DELETE FROM shop_wishlist                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM marketplace_messages          WHERE sender_id    = ANY(target_player_ids)
                                               OR recipient_id = ANY(target_player_ids);
  DELETE FROM marketplace_favorites         WHERE player_id = ANY(target_player_ids);
  DELETE FROM marketplace_listings          WHERE seller_id = ANY(target_player_ids);
  DELETE FROM seller_profiles               WHERE player_id = ANY(target_player_ids);
  DELETE FROM join_requests                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM academy_transfer_requests     WHERE player_id = ANY(target_player_ids);
  DELETE FROM parent_player_relations       WHERE player_id = ANY(target_player_ids);
  DELETE FROM provider_client_notes         WHERE player_id = ANY(target_player_ids);
  DELETE FROM provider_client_preferences   WHERE player_id = ANY(target_player_ids);

  -- Push tokens keyed by player_id
  DELETE FROM push_device_tokens            WHERE player_id = ANY(target_player_ids);

  -- ── STEP 2: COACH-LINKED CHILD ROWS ──────────────────────────────────────
  -- Only runs if any target user had a coach profile (users.coach_id IS NOT NULL).
  -- Must run before DELETE FROM coaches (FK: RESTRICT / NO ACTION).
  -- Skips tables already cleared in Step 1 (e.g., session_skill_feedback,
  -- coach_reviews, ai_coach_conversations — those rows were player-keyed).
  IF target_coach_ids IS NOT NULL AND array_length(target_coach_ids, 1) > 0 THEN
    DELETE FROM coach_academy_memberships  WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_availability         WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_calibration          WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_contracts            WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_court_preferences    WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_court_rules          WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_earnings             WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_freelance_profiles   WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_invitations          WHERE coach_id    = ANY(target_coach_ids)
                                              OR invited_by  = ANY(target_coach_ids);
    DELETE FROM coach_notifications        WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_payment_rules        WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_payouts              WHERE coach_id  = ANY(target_coach_ids)
                                              OR paid_by   = ANY(target_coach_ids);
    DELETE FROM coach_review_stats         WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_settings             WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_stats_rollup         WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_time_blocks          WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coach_xp_transactions      WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM notification_preferences   WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM review_responses           WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM scheduled_notifications    WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM session_intake_data        WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM session_plans              WHERE generated_by = ANY(target_coach_ids);
    DELETE FROM session_templates          WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM lesson_templates           WHERE created_by = ANY(target_coach_ids);
    DELETE FROM location_travel_times      WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM availability_exceptions    WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM push_device_tokens         WHERE coach_id = ANY(target_coach_ids);
    -- Coaching series and lesson groups may have child records; session_players
    -- already cleaned, but sessions still reference lesson_groups:
    DELETE FROM sessions                   WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM recurring_series           WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM coaching_series            WHERE coach_id = ANY(target_coach_ids);
    DELETE FROM lesson_groups              WHERE coach_id = ANY(target_coach_ids);
  END IF;

  -- ── STEP 3: DELETE PLAYER PROFILES ───────────────────────────────────────
  DELETE FROM players WHERE id = ANY(target_player_ids);
  GET DIAGNOSTICS players_deleted = ROW_COUNT;
  RAISE NOTICE 'Player profiles deleted: %', players_deleted;

  -- ── STEP 4: DELETE COACH PROFILES ────────────────────────────────────────
  IF target_coach_ids IS NOT NULL AND array_length(target_coach_ids, 1) > 0 THEN
    DELETE FROM coaches WHERE id = ANY(target_coach_ids);
    GET DIAGNOSTICS coaches_deleted = ROW_COUNT;
    RAISE NOTICE 'Coach profiles deleted: %', coaches_deleted;
  END IF;

  -- ── STEP 5: DELETE USER ACCOUNTS ─────────────────────────────────────────
  -- Cascade-linked tables (identities, sessions, mfa_factors, feature_events,
  -- push_device_tokens by user_id, etc.) auto-delete via ON DELETE CASCADE.
  DELETE FROM users
  WHERE  id       = ANY(target_user_ids)
    AND  email    = 'ltvjeugd@gmail.com'
    AND  username != 'thelaw';
  GET DIAGNOSTICS users_deleted = ROW_COUNT;
  RAISE NOTICE 'User accounts deleted: %', users_deleted;

  -- ── POST-DELETE ASSERTIONS ────────────────────────────────────────────────
  IF users_deleted != 8 THEN
    RAISE EXCEPTION
      'Expected 8 users deleted, got % — rolling back.', users_deleted;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE username = 'thelaw' AND email = 'ltvjeugd@gmail.com'
  ) THEN
    RAISE EXCEPTION 'SAFETY FAILURE: thelaw account missing after delete — rolling back!';
  END IF;

  -- Orphan checks: key child tables must be empty for the deleted IDs
  IF target_player_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM session_players   WHERE player_id = ANY(target_player_ids)
    UNION ALL
    SELECT 1 FROM credit_transactions WHERE player_id = ANY(target_player_ids)
    UNION ALL
    SELECT 1 FROM player_quests     WHERE player_id = ANY(target_player_ids)
  ) THEN
    RAISE EXCEPTION 'Orphaned player-linked rows remain — rolling back!';
  END IF;

  IF target_coach_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM coach_notifications WHERE coach_id = ANY(target_coach_ids)
    UNION ALL
    SELECT 1 FROM coaching_series     WHERE coach_id = ANY(target_coach_ids)
  ) THEN
    RAISE EXCEPTION 'Orphaned coach-linked rows remain — rolling back!';
  END IF;

  RAISE NOTICE 'All assertions passed. thelaw intact. 8 test accounts removed cleanly.';
END $$;

COMMIT;

-- ── VERIFICATION QUERY ────────────────────────────────────────────────────
-- Run after COMMIT to confirm surviving accounts:
SELECT username, role
FROM   users
WHERE  email = 'ltvjeugd@gmail.com'
ORDER  BY username;
