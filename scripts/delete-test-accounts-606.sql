-- Task #606: Delete 8 test accounts for ltvjeugd@gmail.com
-- Run with: psql "$SUPABASE_DATABASE_URL" -f scripts/delete-test-accounts-606.sql
--
-- Deletes exactly 8 test/dummy accounts tied to ltvjeugd@gmail.com.
-- KEEPS: thelaw (platform_owner) — must not be touched.
-- All other ltvjeugd@gmail.com accounts not in this list are also left alone.

BEGIN;

-- Temporarily disable FK constraint checks so we can delete in any order.
-- Re-enabled at end of transaction with SET session_replication_role = DEFAULT.
SET session_replication_role = replica;

DO $$
DECLARE
  -- Exactly 8 user IDs to delete (verified via SELECT before running)
  target_user_ids text[] := ARRAY[
    'dd80e47c-1906-446e-9074-584d57efe1f4',  -- test21        (player)
    '2932a1c3-014c-4fe0-8f15-f46bbaed44b4',  -- testacademy   (academy_owner)
    'b5ba18a2-7a4b-4068-87dc-c7c0fb2cbf85',  -- test2         (academy_owner)
    '0433fabe-5e7c-4c7f-9551-1fbcfb36c481',  -- test1         (academy_owner)
    'f04e8785-798e-4b95-87d8-0977b7b6b2c7',  -- rolandk       (player)
    '165206cb-fe50-45d8-88e6-746144bdf874',  -- patty         (player)
    '8f7d19c6-a7bd-469a-b6eb-92af4754be7b',  -- jokeb         (player)
    '78f8d6d0-33c7-48a3-9e7a-acc6cffa3e82'   -- ltvjeugd_78f8 (platform_owner)
  ];

  -- Player profile IDs linked to the above users (only test21 and rolandk had player records)
  target_player_ids text[] := ARRAY[
    '47420589-2529-4bf3-a9fe-8d7394a19c25',  -- test21's player profile
    '94b94f60-d0b0-42eb-9397-592fc6cc979d'   -- rolandk's player profile
  ];

  users_deleted  int;
  players_deleted int;
BEGIN
  -- ── SAFETY GATE ──────────────────────────────────────────────────────────
  -- Abort immediately if thelaw's user ID appears in the target list.
  IF '3750b8a8-f35b-49c6-ac87-7fd3e6d56db1' = ANY(target_user_ids) THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: thelaw is in the target list — aborting!';
  END IF;

  -- Verify target accounts all belong to the expected email (double-check)
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id = ANY(target_user_ids)
      AND (email != 'ltvjeugd@gmail.com' OR username = 'thelaw')
  ) THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: a target user is not ltvjeugd@gmail.com or is thelaw — aborting!';
  END IF;

  -- ── CASCADE CLEANUP: player-linked rows ─────────────────────────────────
  DELETE FROM player_ball_levels              WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_baseline_skill_scores    WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_baselines                WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_badges                   WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_titles                   WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_quests                   WHERE player_id = ANY(target_player_ids);
  DELETE FROM daily_quest_slots               WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_streaks                  WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_xp_events                WHERE player_id = ANY(target_player_ids);
  DELETE FROM xp_transactions                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM level_up_events                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_level_events             WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_level_up_celebrations    WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_feature_unlock_history   WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_skill_state              WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_skill_scores             WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_pillar_progress          WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_progress                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_progress_flags           WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_notifications            WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_notes                    WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_holidays                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_matches                  WHERE initiator_id = ANY(target_player_ids)
                                                 OR receiver_id  = ANY(target_player_ids);
  DELETE FROM player_connections              WHERE player1_id = ANY(target_player_ids)
                                                 OR player2_id = ANY(target_player_ids);
  DELETE FROM player_invites                  WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_session_cancellations    WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_booking_preferences      WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_subscriptions            WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_deep_assessments         WHERE player_id = ANY(target_player_ids);
  DELETE FROM deep_assessment_pillar_summaries WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_ai_insights              WHERE player_id = ANY(target_player_ids);
  DELETE FROM player_ai_training_plans        WHERE player_id = ANY(target_player_ids);
  DELETE FROM session_players                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM session_waitlist                WHERE player_id = ANY(target_player_ids);
  DELETE FROM session_ratings                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM session_skill_feedback          WHERE player_id = ANY(target_player_ids);
  DELETE FROM session_skill_observations      WHERE player_id = ANY(target_player_ids);
  DELETE FROM session_ai_chats                WHERE player_id = ANY(target_player_ids);
  DELETE FROM series_players                  WHERE player_id = ANY(target_player_ids);
  DELETE FROM credit_transactions             WHERE player_id = ANY(target_player_ids);
  DELETE FROM packages                        WHERE player_id = ANY(target_player_ids);
  DELETE FROM invoices                        WHERE player_id = ANY(target_player_ids);
  DELETE FROM payments                        WHERE player_id = ANY(target_player_ids);
  DELETE FROM payment_reminders               WHERE player_id = ANY(target_player_ids);
  DELETE FROM in_session_feedback             WHERE player_id = ANY(target_player_ids);
  DELETE FROM domain_assessments              WHERE player_id = ANY(target_player_ids);
  DELETE FROM coach_reviews                   WHERE player_id = ANY(target_player_ids);
  DELETE FROM coach_match_reviews             WHERE player_id = ANY(target_player_ids);
  DELETE FROM review_prompts                  WHERE player_id = ANY(target_player_ids);
  DELETE FROM booking_requests                WHERE player_id = ANY(target_player_ids);
  DELETE FROM booking_invites                 WHERE host_player_id = ANY(target_player_ids);
  DELETE FROM booking_invite_guests           WHERE player_id = ANY(target_player_ids);
  DELETE FROM court_bookings                  WHERE player_id = ANY(target_player_ids);
  DELETE FROM slot_reservations               WHERE player_id = ANY(target_player_ids);
  DELETE FROM open_matches                    WHERE host_player_id = ANY(target_player_ids);
  DELETE FROM open_match_slots                WHERE player_id = ANY(target_player_ids);
  DELETE FROM match_requests                  WHERE player_id              = ANY(target_player_ids)
                                                 OR invited_player_id     = ANY(target_player_ids)
                                                 OR matched_with_player_id = ANY(target_player_ids);
  DELETE FROM match_logs                      WHERE player_id          = ANY(target_player_ids)
                                                 OR opponent_player_id = ANY(target_player_ids);
  DELETE FROM matches                         WHERE player_id = ANY(target_player_ids);
  DELETE FROM match_opponents                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM match_plans                     WHERE player_id = ANY(target_player_ids);
  DELETE FROM match_reflections               WHERE player_id = ANY(target_player_ids);
  DELETE FROM match_pillar_scores             WHERE player_id = ANY(target_player_ids);
  DELETE FROM match_challenges                WHERE winner_player_id = ANY(target_player_ids);
  DELETE FROM match_training_suggestions      WHERE player_id = ANY(target_player_ids);
  DELETE FROM adult_glow_matches              WHERE player_id   = ANY(target_player_ids)
                                                 OR opponent_id = ANY(target_player_ids);
  DELETE FROM adult_skill_assessments         WHERE player_id = ANY(target_player_ids);
  DELETE FROM live_matches                    WHERE creator_id = ANY(target_player_ids)
                                                 OR winner_id  = ANY(target_player_ids);
  DELETE FROM tournament_participants         WHERE player_id = ANY(target_player_ids);
  DELETE FROM tournament_matches              WHERE player1_id = ANY(target_player_ids)
                                                 OR player2_id = ANY(target_player_ids)
                                                 OR winner_id  = ANY(target_player_ids);
  DELETE FROM tournaments                     WHERE winner_id = ANY(target_player_ids);
  DELETE FROM ladder_players                  WHERE player_id = ANY(target_player_ids);
  DELETE FROM ladder_challenges               WHERE challenger_id = ANY(target_player_ids)
                                                 OR challenged_id = ANY(target_player_ids)
                                                 OR winner_id     = ANY(target_player_ids);
  DELETE FROM squad_members                   WHERE player_id = ANY(target_player_ids);
  DELETE FROM play_requests                   WHERE creator_id = ANY(target_player_ids);
  DELETE FROM play_request_participants       WHERE player_id = ANY(target_player_ids);
  DELETE FROM conversations                   WHERE player_id = ANY(target_player_ids);
  DELETE FROM conversation_participants       WHERE player_id = ANY(target_player_ids);
  DELETE FROM messages                        WHERE sender_player_id = ANY(target_player_ids);
  DELETE FROM message_reactions               WHERE reactor_player_id = ANY(target_player_ids);
  DELETE FROM spotlight_nominations           WHERE nominated_player_id = ANY(target_player_ids)
                                                 OR nominator_player_id = ANY(target_player_ids);
  DELETE FROM spotlight_weekly_winners        WHERE player_id = ANY(target_player_ids);
  DELETE FROM spotlight_monthly_winners       WHERE player_id = ANY(target_player_ids);
  DELETE FROM shop_orders                     WHERE player_id = ANY(target_player_ids);
  DELETE FROM shop_wishlist                   WHERE player_id = ANY(target_player_ids);
  DELETE FROM marketplace_listings            WHERE seller_id = ANY(target_player_ids);
  DELETE FROM marketplace_favorites           WHERE player_id = ANY(target_player_ids);
  DELETE FROM marketplace_messages            WHERE sender_id    = ANY(target_player_ids)
                                                 OR recipient_id = ANY(target_player_ids);
  DELETE FROM seller_profiles                 WHERE player_id = ANY(target_player_ids);
  DELETE FROM skill_evidence                  WHERE player_id = ANY(target_player_ids);
  DELETE FROM level_trials                    WHERE player_id = ANY(target_player_ids);
  DELETE FROM join_requests                   WHERE player_id = ANY(target_player_ids);
  DELETE FROM academy_transfer_requests       WHERE player_id = ANY(target_player_ids);
  DELETE FROM corporate_members               WHERE player_id = ANY(target_player_ids);
  DELETE FROM corporate_credit_transactions   WHERE player_id = ANY(target_player_ids);
  DELETE FROM parent_player_relations         WHERE player_id = ANY(target_player_ids);
  DELETE FROM ai_coach_conversations          WHERE player_id = ANY(target_player_ids);
  DELETE FROM video_feedback                  WHERE player_id = ANY(target_player_ids);
  DELETE FROM lesson_group_members            WHERE player_id = ANY(target_player_ids);
  DELETE FROM quest_chain_bonus_claims        WHERE player_id = ANY(target_player_ids);
  DELETE FROM provider_client_notes           WHERE player_id = ANY(target_player_ids);
  DELETE FROM provider_client_preferences     WHERE player_id = ANY(target_player_ids);

  -- ── CASCADE CLEANUP: user-linked rows ───────────────────────────────────
  DELETE FROM push_device_tokens  WHERE user_id = ANY(target_user_ids)
                                      OR player_id = ANY(target_player_ids);

  -- ── DELETE PLAYER PROFILES ───────────────────────────────────────────────
  DELETE FROM players WHERE id = ANY(target_player_ids);
  GET DIAGNOSTICS players_deleted = ROW_COUNT;
  RAISE NOTICE 'Player profiles deleted: %', players_deleted;

  -- ── DELETE USER ACCOUNTS ─────────────────────────────────────────────────
  DELETE FROM users
  WHERE id    = ANY(target_user_ids)
    AND email = 'ltvjeugd@gmail.com'   -- belt-and-suspenders email guard
    AND username != 'thelaw';           -- belt-and-suspenders username guard
  GET DIAGNOSTICS users_deleted = ROW_COUNT;
  RAISE NOTICE 'User accounts deleted: %', users_deleted;

  -- ── POST-DELETE ASSERTIONS ───────────────────────────────────────────────
  IF users_deleted != 8 THEN
    RAISE EXCEPTION 'Expected 8 users deleted, got %. Rolling back.', users_deleted;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'thelaw' AND email = 'ltvjeugd@gmail.com') THEN
    RAISE EXCEPTION 'thelaw account missing after delete — rolling back!';
  END IF;

  RAISE NOTICE 'All assertions passed. thelaw intact. 8 test accounts removed.';
END $$;

SET session_replication_role = DEFAULT;
COMMIT;

-- ── VERIFICATION QUERY (run after commit to confirm) ─────────────────────
SELECT username, role FROM users
WHERE email = 'ltvjeugd@gmail.com'
ORDER BY username;
