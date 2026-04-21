/**
 * Task #907 — Canonical module for player FK cleanup.
 *
 * Historically the same set of player_* tables had to be hand-kept in sync
 * across at least two places:
 *   - `storage.deletePlayer` in `server/storage.ts`         (Task #904)
 *   - merge endpoint Part A/B in `server/routes/admin-setup.ts` (Task #900)
 * …and a third (the startup drift watchdog added in Task #905) held its own
 * private list. Every time a new player_* table landed in `shared/schema.ts`,
 * all of them had to be updated by hand or coaches would hit FK violation
 * crashes in production.
 *
 * This module is now the single source of truth:
 *
 *   1. `KNOWN_PLAYER_FK_TABLES` — canonical set of every table that has an FK
 *      back to `players(id)`. The startup watchdog diffs the live DB against
 *      this set and logs a loud WARN if a new unknown table shows up.
 *
 *   2. `GUARDED_PLAYER_DELETE_STATEMENTS` — ordered list of existence-guarded
 *      DELETE statements that `storage.deletePlayer` runs for the subset of
 *      player-referencing tables whose handling is just "delete by player".
 *      The merge endpoint either transfers these to the target player
 *      (Part A) or deletes them as ephemeral/device-bound rows (Part B); see
 *      the comments next to each entry for the merge-side treatment.
 *
 * When a new player_* table lands in `shared/schema.ts`:
 *   - Add the table name to `KNOWN_PLAYER_FK_TABLES` below.
 *   - If its cleanup is a simple "DELETE FROM <table> WHERE player_id = $1",
 *     add it to `GUARDED_PLAYER_DELETE_STATEMENTS` below — both `deletePlayer`
 *     and the startup watchdog pick it up automatically.
 *   - If it needs transfer-on-merge behaviour, mirror it in the merge
 *     endpoint's Part A (see `server/routes/admin-setup.ts`). That file still
 *     owns its own SQL because transfers are not mechanical — many have
 *     composite UNIQUE constraints that need per-table dedup.
 *
 * Until the table is added here, the boot-time watchdog logs:
 *   [PlayerFKAudit] WARN — <table> references players(id) but is NOT handled
 *   by the merge/delete code: …
 *
 * which is the "clear, loud failure" the cleanup was missing before.
 */

export type PoolLikeExec = (
  sql: string,
  params: unknown[],
) => Promise<unknown>;

/**
 * Every table in the `public` schema with an FK to `players(id)`. Ordering
 * here is purely for human readability — the runtime contract is set-equality
 * against what the DB reports.
 *
 * Do NOT remove entries without also updating `deletePlayer` and the merge
 * endpoint; the startup drift audit will start throwing WARNs if the DB
 * disagrees with this set.
 */
export const KNOWN_PLAYER_FK_TABLES: ReadonlySet<string> = new Set([
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

/**
 * Ordered list of existence-guarded DELETE statements applied by
 * `storage.deletePlayer` for the subset of player-referencing tables whose
 * handling is either a straight delete or a small variant (e.g. marketplace
 * listing-chained cleanup, both-sides player refs). Ordering within the list
 * matters where one entry's table has an FK to another; marketplace_messages
 * and marketplace_favorites run before marketplace_listings is deleted
 * elsewhere in `deletePlayer`.
 *
 * Each statement must reference `$1` as the player id. The `sql` template is
 * executed verbatim — don't add parameter placeholders beyond `$1` here.
 *
 * MERGE-SIDE NOTE: the merge endpoint (`server/routes/admin-setup.ts`) either
 * transfers these rows to the target (Part A) or deletes them as ephemeral
 * (Part B) — the chosen behaviour is called out inline next to each entry.
 */
export interface GuardedPlayerDeleteStatement {
  readonly table: string;
  readonly sql: string;
  /** Human-readable note on how the merge endpoint handles this table. */
  readonly mergeNote: string;
}

export const GUARDED_PLAYER_DELETE_STATEMENTS: readonly GuardedPlayerDeleteStatement[] = [
  // Marketplace child rows must be removed before marketplace_listings (the
  // listings delete itself is a typed drizzle call later in deletePlayer).
  {
    table: "marketplace_messages",
    mergeNote: "Part B: deleted (ephemeral conversational data).",
    sql: `DELETE FROM marketplace_messages
          WHERE sender_id = $1 OR recipient_id = $1
             OR listing_id IN (SELECT id FROM marketplace_listings WHERE seller_id = $1)`,
  },
  {
    table: "marketplace_favorites",
    mergeNote: "Part B: deleted (ephemeral UI state).",
    sql: `DELETE FROM marketplace_favorites
          WHERE player_id = $1
             OR listing_id IN (SELECT id FROM marketplace_listings WHERE seller_id = $1)`,
  },

  // Legacy V1 billing — inert but rows may still exist on old DBs.
  {
    table: "packages",
    mergeNote: "Part A: transferred (immutable history).",
    sql: `DELETE FROM packages WHERE player_id = $1`,
  },
  {
    table: "credit_transactions",
    mergeNote: "Part A: transferred (immutable history).",
    sql: `DELETE FROM credit_transactions WHERE player_id = $1`,
  },

  // Provider marketplace coaching artifacts.
  {
    table: "provider_client_notes",
    mergeNote: "Part A: transferred.",
    sql: `DELETE FROM provider_client_notes WHERE player_id = $1`,
  },
  {
    table: "provider_client_preferences",
    mergeNote: "Part A: dedup on (provider_id, player_id) then transferred.",
    sql: `DELETE FROM provider_client_preferences WHERE player_id = $1`,
  },

  // Corporate membership & ledger.
  {
    table: "corporate_members",
    mergeNote: "Part A: transferred.",
    sql: `DELETE FROM corporate_members WHERE player_id = $1`,
  },
  {
    table: "corporate_credit_transactions",
    mergeNote: "Part A: transferred (historical).",
    sql: `DELETE FROM corporate_credit_transactions WHERE player_id = $1`,
  },

  // Equipment rentals, video & beta feedback.
  {
    table: "equipment_rentals",
    mergeNote: "Part A: transferred.",
    sql: `DELETE FROM equipment_rentals WHERE player_id = $1`,
  },
  {
    table: "video_feedback",
    mergeNote: "Part A: transferred.",
    sql: `DELETE FROM video_feedback WHERE player_id = $1`,
  },
  {
    table: "beta_feedback",
    mergeNote: "Part A: transferred.",
    sql: `DELETE FROM beta_feedback WHERE player_id = $1`,
  },

  // AI tables — coaching insights, reflections, plans, ratings.
  {
    table: "session_ai_summaries",
    mergeNote: "Part A: dedup on (session_id, player_id) then transferred.",
    sql: `DELETE FROM session_ai_summaries WHERE player_id = $1`,
  },
  {
    table: "player_ai_insights",
    mergeNote: "Part A: transferred.",
    sql: `DELETE FROM player_ai_insights WHERE player_id = $1`,
  },
  {
    table: "session_ai_chats",
    mergeNote: "Part A: transferred.",
    sql: `DELETE FROM session_ai_chats WHERE player_id = $1`,
  },
  {
    table: "ai_coach_conversations",
    mergeNote: "Part A: transferred.",
    sql: `DELETE FROM ai_coach_conversations WHERE player_id = $1`,
  },
  {
    table: "player_session_reflections",
    mergeNote: "Part A: transferred.",
    sql: `DELETE FROM player_session_reflections WHERE player_id = $1`,
  },
  {
    table: "player_monthly_assessments",
    mergeNote: "Part A: dedup on (player_id, month_year) then transferred.",
    sql: `DELETE FROM player_monthly_assessments WHERE player_id = $1`,
  },
  {
    table: "player_match_readiness",
    mergeNote: "Part A: dedup on (player_id, match_date) then transferred.",
    sql: `DELETE FROM player_match_readiness WHERE player_id = $1`,
  },
  {
    table: "player_ai_training_plans",
    mergeNote: "Part A: dedup on (player_id, week_start_date) then transferred.",
    sql: `DELETE FROM player_ai_training_plans WHERE player_id = $1`,
  },
  {
    table: "player_monthly_reports",
    mergeNote: "Part A: dedup on (player_id, month_year) then transferred.",
    sql: `DELETE FROM player_monthly_reports WHERE player_id = $1`,
  },
  {
    table: "session_ratings",
    mergeNote: "Part A: dedup on (session_id, player_id) then transferred.",
    sql: `DELETE FROM session_ratings WHERE player_id = $1`,
  },
  {
    table: "session_intake_data",
    mergeNote: "Part A: transferred.",
    sql: `DELETE FROM session_intake_data WHERE player_id = $1`,
  },

  // Spotlight winners & nominations (both sides for nominations).
  {
    table: "spotlight_weekly_winners",
    mergeNote: "Part A: dedup on (academy_id, week_start) then transferred.",
    sql: `DELETE FROM spotlight_weekly_winners WHERE player_id = $1`,
  },
  {
    table: "spotlight_monthly_winners",
    mergeNote: "Part A: dedup on (academy_id, month, year) then transferred.",
    sql: `DELETE FROM spotlight_monthly_winners WHERE player_id = $1`,
  },
  {
    table: "spotlight_nominations",
    mergeNote: "Part B: deleted both sides (UNIQUE(nominator, week_start)).",
    sql: `DELETE FROM spotlight_nominations
          WHERE nominator_player_id = $1 OR nominated_player_id = $1`,
  },

  // Family invite codes — clear both parent + used-by sides.
  {
    table: "family_invite_codes",
    mergeNote: "Part A: both parent_player_id and used_by_player_id transferred.",
    sql: `DELETE FROM family_invite_codes
          WHERE parent_player_id = $1 OR used_by_player_id = $1`,
  },

  // Push tokens — bound to the player's device + user account.
  {
    table: "push_device_tokens",
    mergeNote: "Part B: deleted (device/session-bound, not transferable).",
    sql: `DELETE FROM push_device_tokens WHERE player_id = $1`,
  },

  // Quest chain bonus claims — gamification artifacts.
  {
    table: "quest_chain_bonus_claims",
    mergeNote: "Part B: deleted (source player's claim record).",
    sql: `DELETE FROM quest_chain_bonus_claims WHERE player_id = $1`,
  },

  // Task #906: credit_shadow_diff — diagnostic log from the shadow-mode
  // credit engine runner. Per-player history, drop on delete.
  {
    table: "credit_shadow_diff",
    mergeNote: "Part A: transferred (UPDATE player_id to target, no dedup needed).",
    sql: `DELETE FROM credit_shadow_diff WHERE player_id = $1`,
  },

  // Task #906: slot_reservations — ephemeral 5-min TTL court-slot holds.
  // Never transfer on merge; drop on both merge source and delete.
  {
    table: "slot_reservations",
    mergeNote: "Part B: deleted (ephemeral 5-min TTL hold).",
    sql: `DELETE FROM slot_reservations WHERE player_id = $1`,
  },
];

/**
 * Runs every guarded delete in `GUARDED_PLAYER_DELETE_STATEMENTS` against the
 * provided executor, skipping tables that don't yet exist in the database
 * (so older DBs that haven't run `db:push` stay safe).
 *
 * `exec` accepts the same `(sql, params)` shape as `pg.Pool.query` or a
 * pooled client — we deliberately avoid typing against `pg` directly so the
 * helper can be reused by any caller that already has a query function in
 * hand (e.g. a Drizzle transaction client wrapper).
 */
export async function runGuardedPlayerDeletes(
  exec: PoolLikeExec,
  playerId: string,
): Promise<void> {
  const tableExistsCache = new Map<string, boolean>();
  const tableExists = async (name: string): Promise<boolean> => {
    const cached = tableExistsCache.get(name);
    if (cached !== undefined) return cached;
    const res = (await exec(
      `SELECT to_regclass($1) IS NOT NULL AS exists`,
      [`public.${name}`],
    )) as { rows: { exists: boolean }[] };
    const exists = Boolean(res.rows[0]?.exists);
    tableExistsCache.set(name, exists);
    return exists;
  };

  for (const { table, sql } of GUARDED_PLAYER_DELETE_STATEMENTS) {
    if (await tableExists(table)) {
      await exec(sql, [playerId]);
    }
  }
}
