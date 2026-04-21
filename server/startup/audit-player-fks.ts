/**
 * Task #905 — Drift watchdog for the player merge / delete code paths.
 *
 * On boot, list every foreign key in the public schema that references
 * `players(id)` and diff that set against the hard-coded list of tables
 * the merge endpoint (`server/routes/admin-setup.ts`) and the delete
 * path (`storage.deletePlayer` in `server/storage.ts`) actually touch.
 *
 * Any unknown table is logged as a single WARN with a pointer to the
 * two code locations that need to be updated. The check is wrapped in
 * a Promise.race against a hard timeout (default 1500ms) and never
 * throws — boot must not depend on this audit. If the budget is blown
 * (e.g. busy startup, slow information_schema), the audit logs a
 * single "Skipped" WARN instead of stalling.
 *
 * To refresh the constant below when adding a new player_* table, mirror
 * the table in BOTH the merge endpoint and `deletePlayer`, then add the
 * table name here.
 */
import { pool } from "../db";

const KNOWN_PLAYER_FK_TABLES: ReadonlySet<string> = new Set([
  // Core coaching / scheduling
  "session_players",
  "series_players",
  "lesson_group_members",
  "session_waitlist",
  "session_skill_observations",
  "session_skill_feedback",
  "in_session_feedback",
  "session_intake_data",
  "session_ratings",
  "session_ai_summaries",
  "session_ai_chats",
  "skill_evidence",
  "domain_assessments",
  "adult_skill_assessments",
  "player_session_reflections",

  // Notes & progress
  "player_notes",
  "player_progress",
  "player_progress_flags",
  "player_holidays",
  "player_session_cancellations",
  "player_subscriptions",
  "player_invites",
  "player_notifications",

  // Credit Engine V2 + legacy V1
  "credit_lots",
  "credit_ledger_v2",
  "credit_shadow_diff",
  "player_credit_balance",
  "player_money_wallet",
  "packages",
  "credit_transactions",

  // Billing
  "invoices",
  "payments",
  "payment_reminders",
  "refunds",

  // Shop
  "shop_orders",
  "shop_order_items",
  "shop_wishlist",

  // Gamification / XP / levels
  "player_badges",
  "player_titles",
  "player_quests",
  "daily_quest_slots",
  "quest_chain_bonus_claims",
  "player_streaks",
  "player_ball_levels",
  "player_pillar_progress",
  "player_baselines",
  "player_baseline_skill_scores",
  "player_skill_state",
  "player_skill_scores",
  "player_deep_assessments",
  "deep_assessment_pillar_summaries",
  "player_level_events",
  "player_xp_events",
  "xp_transactions",
  "player_level_up_celebrations",
  "player_feature_unlock_history",
  "level_up_events",
  "level_trials",

  // AI artifacts
  "player_ai_insights",
  "player_ai_training_plans",
  "player_monthly_assessments",
  "player_match_readiness",
  "player_monthly_reports",
  "ai_coach_conversations",

  // Spotlight / recognition
  "spotlight_weekly_winners",
  "spotlight_monthly_winners",
  "spotlight_nominations",

  // Family / parents
  "family_invite_codes",
  "parent_player_relations",

  // Booking / play / matches
  "booking_requests",
  "join_requests",
  "academy_transfer_requests",
  "player_booking_preferences",
  "booking_invites",
  "booking_invite_guests",
  "open_matches",
  "open_match_slots",
  "play_requests",
  "play_request_participants",
  "match_requests",
  "court_bookings",
  "slot_reservations",
  "live_matches",
  "matches",
  "match_opponents",
  "match_plans",
  "match_pillar_scores",
  "match_reflections",
  "match_training_suggestions",
  "match_logs",
  "match_challenges",
  "coach_match_reviews",
  "player_matches",
  "player_connections",
  "adult_glow_matches",

  // Tournaments / ladders / squads
  "tournaments",
  "tournament_participants",
  "tournament_matches",
  "ladder_players",
  "ladder_challenges",
  "squad_members",

  // Chat / reviews / reactions
  "messages",
  "message_reactions",
  "conversations",
  "conversation_participants",
  "coach_reviews",
  "review_prompts",

  // Marketplace
  "marketplace_listings",
  "marketplace_messages",
  "marketplace_favorites",
  "seller_profiles",

  // Provider / corporate
  "provider_client_notes",
  "provider_client_preferences",
  "corporate_members",
  "corporate_credit_transactions",

  // Equipment / video / beta
  "equipment_rentals",
  "video_feedback",
  "beta_feedback",

  // Devices / users (users.player_id is nulled, not deleted)
  "push_device_tokens",
  "users",
]);

// Use pg_catalog directly — it joins on OIDs so we cannot accidentally
// match unrelated constraints that happen to share a name across schemas
// (a real risk with information_schema's name-only joins). We restrict to
// FKs in the public schema whose referenced column is public.players(id).
const FK_QUERY = `
  SELECT DISTINCT cls.relname AS table_name
    FROM pg_constraint con
    JOIN pg_class cls            ON cls.oid = con.conrelid
    JOIN pg_namespace ns         ON ns.oid = cls.relnamespace
    JOIN pg_class ref_cls        ON ref_cls.oid = con.confrelid
    JOIN pg_namespace ref_ns     ON ref_ns.oid = ref_cls.relnamespace
    JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS rk(attnum, ord) ON TRUE
    JOIN pg_attribute ref_att
      ON ref_att.attrelid = ref_cls.oid
     AND ref_att.attnum   = rk.attnum
   WHERE con.contype   = 'f'
     AND ns.nspname    = 'public'
     AND ref_ns.nspname = 'public'
     AND ref_cls.relname = 'players'
     AND ref_att.attname = 'id'
`;

export async function auditPlayerForeignKeys(timeoutMs = 1500): Promise<void> {
  const started = Date.now();
  try {
    const result = await Promise.race<
      { rows: { table_name: string }[] } | null
    >([
      pool.query<{ table_name: string }>(FK_QUERY),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (!result) {
      // Never fail boot — just note that the audit was skipped.
      console.warn(
        `[PlayerFKAudit] Skipped: information_schema query exceeded ${timeoutMs}ms budget`
      );
      return;
    }

    const unknown: string[] = [];
    for (const row of result.rows) {
      const name = row.table_name;
      if (!KNOWN_PLAYER_FK_TABLES.has(name)) unknown.push(name);
    }

    const elapsed = Date.now() - started;
    if (unknown.length === 0) {
      console.log(
        `[PlayerFKAudit] OK — ${result.rows.length} player FK tables, all known (${elapsed}ms)`
      );
      return;
    }

    console.warn(
      `[PlayerFKAudit] WARN — ${unknown.length} table(s) reference players(id) but are NOT handled by the merge/delete code: ${unknown.join(", ")}.\n` +
        `  → Update the merge endpoint at server/routes/admin-setup.ts (PART A/B around the ifTable() helpers)\n` +
        `  → Update storage.deletePlayer in server/storage.ts (FK-ordered batches)\n` +
        `  → Then add the table name(s) to KNOWN_PLAYER_FK_TABLES in server/startup/audit-player-fks.ts (${elapsed}ms)`
    );
  } catch (err) {
    // Swallow — this watchdog must never fail boot.
    console.warn(
      `[PlayerFKAudit] Skipped due to error: ${(err as Error)?.message ?? String(err)}`
    );
  }
}
