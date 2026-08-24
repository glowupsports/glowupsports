/**
 * db-migrate.ts — Task #1649
 *
 * Pre-creates ALL unique constraints and unique indexes that drizzle-kit push
 * would otherwise prompt for interactively when tables have existing data.
 *
 * Every operation is idempotent:
 *   - Tables: CREATE TABLE IF NOT EXISTS
 *   - Constraints: guarded by pg_class existence check (covers both named
 *     constraints AND their backing indexes, preventing error code 42P07)
 *   - Unique indexes: guarded by pg_indexes existence check
 *   - Partial/expression indexes: CREATE UNIQUE INDEX IF NOT EXISTS
 *
 * Run via: npx tsx db-migrate.ts
 */

import { Pool, PoolClient } from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("ERROR: SUPABASE_DATABASE_URL or DATABASE_URL must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });
type PgClient = PoolClient;

/**
 * Ensures a named UNIQUE constraint exists in pg_constraint.
 *
 * Three cases handled:
 *  A) Constraint already in pg_constraint → nothing to do.
 *  B) No constraint, but a plain unique index with the same name exists in pg_class →
 *     promote the index to a named constraint with USING INDEX.
 *  C) Neither → create the constraint from scratch with the given column list.
 */
async function addConstraintIfMissing(
  client: PgClient,
  constraintName: string,
  table: string,
  columns: string,
) {
  await client.query(`
    DO $$ BEGIN
      -- Guard: skip entirely if the table doesn't exist yet
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '${table}'
      ) THEN
        NULL; -- table not yet created; drizzle push will handle constraint creation

      -- Case A: constraint already exists
      ELSIF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = '${constraintName}' AND contype = 'u'
      ) THEN
        NULL; -- nothing to do

      -- Case B: plain unique index exists but no constraint entry yet → promote
      ELSIF EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = '${constraintName}' AND relkind = 'i'
      ) THEN
        ALTER TABLE ${table}
          ADD CONSTRAINT ${constraintName} UNIQUE USING INDEX ${constraintName};

      -- Case C: neither exists → create from scratch
      ELSE
        ALTER TABLE ${table}
          ADD CONSTRAINT ${constraintName} UNIQUE (${columns});
      END IF;
    END $$
  `);
  console.log(`[db-migrate] ${constraintName} — OK`);
}

/**
 * Pre-creates a FOREIGN KEY constraint with NOT VALID so drizzle-kit sees it
 * already exists and skips adding it (avoiding FK validation of existing data
 * or concurrent inserts from the running app server).
 *
 * NOT VALID means:
 *  - Existing rows are NOT scanned for violations (safe with dirty data)
 *  - New rows ARE still enforced by the constraint going forward
 */
async function addForeignKeyIfMissing(
  client: PgClient,
  constraintName: string,
  table: string,
  column: string,
  refTable: string,
  refColumn: string,
) {
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}'
      ) THEN
        ALTER TABLE ${table}
          ADD CONSTRAINT ${constraintName}
          FOREIGN KEY (${column}) REFERENCES ${refTable}(${refColumn})
          NOT VALID;
      END IF;
    END $$
  `);
  console.log(`[db-migrate] ${constraintName} (FK) — OK`);
}

/** Creates a plain unique index if it does not already exist. */
async function addUniqueIndexIfMissing(
  client: PgClient,
  indexName: string,
  ddl: string,
) {
  try {
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = '${indexName}') THEN
          ${ddl};
        END IF;
      END $$
    `);
    console.log(`[db-migrate] ${indexName} — OK`);
  } catch (err: unknown) {
    const pg = err as { code?: string; message?: string };
    if (pg.code === "42P01") {
      // Table referenced by this index doesn't exist yet; drizzle push will
      // create both the table and the index when the schema is applied.
      console.warn(`[db-migrate] ${indexName} — SKIPPED (table not yet created)`);
    } else {
      throw err;
    }
  }
}

async function run() {
  const client = await pool.connect();
  try {
    console.log("[db-migrate] Applying pending schema changes...");

    // ── player_health_snapshots (Task #1649) ──────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_health_snapshots (
        id               VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid()::text,
        player_id        VARCHAR     NOT NULL,
        sleep_quality    TEXT,
        recovery_status  TEXT,
        steps_today      INTEGER,
        recorded_at      TIMESTAMP   NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_health_snapshots_player_idx
        ON player_health_snapshots (player_id)
    `);
    console.log("[db-migrate] player_health_snapshots — OK");

    // ═══════════════════════════════════════════════════════════════════════════
    // DATA CLEANUP — delete orphan rows that would violate FK constraints
    // drizzle-kit tries to add/validate these FKs; orphan rows must be removed first.
    // ═══════════════════════════════════════════════════════════════════════════

    // match_challenges: challenger_id and opponent_id must be in players
    const mcDel = await client.query(`
      DELETE FROM match_challenges
      WHERE challenger_id NOT IN (SELECT id FROM players)
         OR opponent_id   NOT IN (SELECT id FROM players)
    `);
    console.log(`[db-migrate] match_challenges orphan cleanup — ${mcDel.rowCount} rows removed`);

    // Bulk cleanup: delete orphan rows from all tables with NOT NULL session_id FK
    // These are newly-added tables whose FK constraints have never been validated.
    const sessionOrphanTables = [
      "session_waitlist",
      "in_session_feedback",
      "session_skill_observations",
      "session_skill_feedback",
      "session_plans",
      "session_ai_summaries",
      "session_ai_chats",
      "session_ai_briefs",
      "player_session_reflections",
      "session_ratings",
      "session_intake_data",
      "session_checkins",
      "coach_earnings",
      "booking_requests",
    ];
    for (const tbl of sessionOrphanTables) {
      try {
        const r = await client.query(`
          DELETE FROM ${tbl}
          WHERE session_id IS NOT NULL
            AND session_id NOT IN (SELECT id FROM sessions)
        `);
        if ((r.rowCount ?? 0) > 0) {
          console.log(`[db-migrate] ${tbl} orphan session cleanup — ${r.rowCount} rows removed`);
        }
      } catch (e: any) {
        if (e.code !== '42P01') throw e; // ignore "table does not exist"
      }
    }

    // Bulk cleanup: delete orphan rows from recently-added tables with NOT NULL player_id FK
    const playerOrphanTables = [
      "player_session_reflections",
      "player_ai_insights",
      "player_ai_usage",
      "player_credit_balance",
      "player_money_wallet",
      "player_pack_pity",
      "player_login_streaks",
      "player_deep_assessments",
      "deep_assessment_pillar_summaries",
      "player_monthly_assessments",
      "player_match_readiness",
      "player_ai_training_plans",
      "player_monthly_reports",
      "player_arena_badges",
      "player_ability_cards",
      "arena_champion_cards",
      "arena_player_cards",
      "player_saved_drills",
      "player_collected_cards",
    ];
    for (const tbl of playerOrphanTables) {
      try {
        const r = await client.query(`
          DELETE FROM ${tbl}
          WHERE player_id IS NOT NULL
            AND player_id NOT IN (SELECT id FROM players)
        `);
        if ((r.rowCount ?? 0) > 0) {
          console.log(`[db-migrate] ${tbl} orphan player cleanup — ${r.rowCount} rows removed`);
        }
      } catch (e: any) {
        // 42P01 = table does not exist, 42703 = column does not exist — both safe to skip
        if (e.code !== '42P01' && e.code !== '42703') throw e;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FOREIGN KEY pre-creation (NOT VALID) — stops drizzle-kit from validating
    // existing rows when it adds these constraints for the first time.
    // drizzle-kit sees the constraint already exists → skips it entirely.
    // ═══════════════════════════════════════════════════════════════════════════

    // session_ai_briefs
    await addForeignKeyIfMissing(client,
      "session_ai_briefs_session_id_sessions_id_fk",
      "session_ai_briefs", "session_id", "sessions", "id");

    // session_ai_summaries
    await addForeignKeyIfMissing(client,
      "session_ai_summaries_session_id_sessions_id_fk",
      "session_ai_summaries", "session_id", "sessions", "id");
    await addForeignKeyIfMissing(client,
      "session_ai_summaries_player_id_players_id_fk",
      "session_ai_summaries", "player_id", "players", "id");

    // session_ai_chats
    await addForeignKeyIfMissing(client,
      "session_ai_chats_session_id_sessions_id_fk",
      "session_ai_chats", "session_id", "sessions", "id");
    await addForeignKeyIfMissing(client,
      "session_ai_chats_player_id_players_id_fk",
      "session_ai_chats", "player_id", "players", "id");
    await addForeignKeyIfMissing(client,
      "session_ai_chats_coach_id_coaches_id_fk",
      "session_ai_chats", "coach_id", "coaches", "id");

    // player_ai_insights — only player_id is a FK (no coach_id column)
    await addForeignKeyIfMissing(client,
      "player_ai_insights_player_id_players_id_fk",
      "player_ai_insights", "player_id", "players", "id");

    // player_session_reflections
    await addForeignKeyIfMissing(client,
      "player_session_reflections_session_id_sessions_id_fk",
      "player_session_reflections", "session_id", "sessions", "id");
    await addForeignKeyIfMissing(client,
      "player_session_reflections_player_id_players_id_fk",
      "player_session_reflections", "player_id", "players", "id");

    // player_ai_usage — uses user_id referencing users, no FK in drizzle schema

    // player_ai_training_plans
    await addForeignKeyIfMissing(client,
      "player_ai_training_plans_player_id_players_id_fk",
      "player_ai_training_plans", "player_id", "players", "id");
    await addForeignKeyIfMissing(client,
      "player_ai_training_plans_coach_id_coaches_id_fk",
      "player_ai_training_plans", "coach_id", "coaches", "id");

    // session_ratings
    await addForeignKeyIfMissing(client,
      "session_ratings_session_id_sessions_id_fk",
      "session_ratings", "session_id", "sessions", "id");
    await addForeignKeyIfMissing(client,
      "session_ratings_player_id_players_id_fk",
      "session_ratings", "player_id", "players", "id");
    await addForeignKeyIfMissing(client,
      "session_ratings_coach_id_coaches_id_fk",
      "session_ratings", "coach_id", "coaches", "id");

    // session_intake_data
    await addForeignKeyIfMissing(client,
      "session_intake_data_session_id_sessions_id_fk",
      "session_intake_data", "session_id", "sessions", "id");
    await addForeignKeyIfMissing(client,
      "session_intake_data_player_id_players_id_fk",
      "session_intake_data", "player_id", "players", "id");
    await addForeignKeyIfMissing(client,
      "session_intake_data_coach_id_coaches_id_fk",
      "session_intake_data", "coach_id", "coaches", "id");

    // player_monthly_assessments
    await addForeignKeyIfMissing(client,
      "player_monthly_assessments_player_id_players_id_fk",
      "player_monthly_assessments", "player_id", "players", "id");

    // player_monthly_reports
    await addForeignKeyIfMissing(client,
      "player_monthly_reports_player_id_players_id_fk",
      "player_monthly_reports", "player_id", "players", "id");

    // player_match_readiness
    await addForeignKeyIfMissing(client,
      "player_match_readiness_player_id_players_id_fk",
      "player_match_readiness", "player_id", "players", "id");

    // match_challenges (belt-and-suspenders; data cleanup already ran)
    await addForeignKeyIfMissing(client,
      "match_challenges_challenger_id_players_id_fk",
      "match_challenges", "challenger_id", "players", "id");
    await addForeignKeyIfMissing(client,
      "match_challenges_opponent_id_players_id_fk",
      "match_challenges", "opponent_id", "players", "id");

    // ═══════════════════════════════════════════════════════════════════════════
    // COLUMN-LEVEL .unique() constraints — ALTER TABLE … ADD CONSTRAINT
    // ═══════════════════════════════════════════════════════════════════════════

    // users (lines 39, 49)
    await addConstraintIfMissing(client, "users_username_unique", "users", "username");
    await addConstraintIfMissing(client, "users_apple_id_unique", "users", "apple_id");

    // academies (lines 178, 179)
    await addConstraintIfMissing(client, "academies_slug_unique", "academies", "slug");
    await addConstraintIfMissing(client, "academies_join_code_unique", "academies", "join_code");

    // academy_owner_profiles (line 347)
    await addConstraintIfMissing(client, "academy_owner_profiles_academy_id_unique", "academy_owner_profiles", "academy_id");

    // invites (line 379)
    await addConstraintIfMissing(client, "invites_token_unique", "invites", "token");

    // coach_invitations (line 471)
    await addConstraintIfMissing(client, "coach_invitations_token_unique", "coach_invitations", "token");

    // coach_freelance_profiles (lines 593, 598)
    await addConstraintIfMissing(client, "coach_freelance_profiles_coach_id_unique", "coach_freelance_profiles", "coach_id");
    await addConstraintIfMissing(client, "coach_freelance_profiles_slug_unique", "coach_freelance_profiles", "slug");

    // player_booking_preferences (line 1015)
    await addConstraintIfMissing(client, "player_booking_preferences_player_id_unique", "player_booking_preferences", "player_id");

    // players (line 1172)
    await addConstraintIfMissing(client, "players_attendance_share_token_unique", "players", "attendance_share_token");

    // player_invites (line 1444)
    await addConstraintIfMissing(client, "player_invites_invite_code_unique", "player_invites", "invite_code");

    // skill_domains (line 2305)
    await addConstraintIfMissing(client, "skill_domains_name_unique", "skill_domains", "name");

    // coach_court_rules (line 2729)
    await addConstraintIfMissing(client, "coach_court_rules_coach_id_unique", "coach_court_rules", "coach_id");

    // coach_settings (line 2751)
    await addConstraintIfMissing(client, "coach_settings_coach_id_unique", "coach_settings", "coach_id");

    // academy_settings (line 2780)
    await addConstraintIfMissing(client, "academy_settings_academy_id_unique", "academy_settings", "academy_id");

    // academy_invites (line 2829)
    await addConstraintIfMissing(client, "academy_invites_invite_code_unique", "academy_invites", "invite_code");

    // provider_invites (line 2849)
    await addConstraintIfMissing(client, "provider_invites_token_unique", "provider_invites", "token");

    // notification_preferences (line 2957)
    await addConstraintIfMissing(client, "notification_preferences_coach_id_unique", "notification_preferences", "coach_id");

    // billing_accounts (line 3012)
    await addConstraintIfMissing(client, "billing_accounts_academy_id_unique", "billing_accounts", "academy_id");

    // parent_settings (line 3447)
    await addConstraintIfMissing(client, "parent_settings_user_id_unique", "parent_settings", "user_id");

    // coach_payment_rules (line 3499)
    await addConstraintIfMissing(client, "coach_payment_rules_coach_id_unique", "coach_payment_rules", "coach_id");

    // review_responses (line 3654)
    await addConstraintIfMissing(client, "review_responses_review_id_unique", "review_responses", "review_id");

    // coach_review_stats (line 3759)
    await addConstraintIfMissing(client, "coach_review_stats_coach_id_unique", "coach_review_stats", "coach_id");

    // user_feed_preferences (line 4250)
    await addConstraintIfMissing(client, "user_feed_preferences_user_id_unique", "user_feed_preferences", "user_id");

    // user_social_profiles (line 4354)
    await addConstraintIfMissing(client, "user_social_profiles_user_id_unique", "user_social_profiles", "user_id");

    // player_social_notif_prefs (line 4403)
    await addConstraintIfMissing(client, "player_social_notif_prefs_user_id_unique", "player_social_notif_prefs", "user_id");

    // weekly_skill_challenges (line 4750)
    await addConstraintIfMissing(client, "weekly_skill_challenges_week_start_unique", "weekly_skill_challenges", "week_start");

    // shop_orders (line 5039)
    await addConstraintIfMissing(client, "shop_orders_order_number_unique", "shop_orders", "order_number");

    // service_providers (line 5154)
    await addConstraintIfMissing(client, "service_providers_user_id_unique", "service_providers", "user_id");

    // seller_profiles (line 5363)
    await addConstraintIfMissing(client, "seller_profiles_player_id_unique", "seller_profiles", "player_id");

    // coach_calibration (line 5847)
    await addConstraintIfMissing(client, "coach_calibration_coach_id_unique", "coach_calibration", "coach_id");

    // player_level_thresholds (line 6629)
    await addConstraintIfMissing(client, "player_level_thresholds_level_unique", "player_level_thresholds", "level");

    // player_level_xp_rules (line 6653)
    await addConstraintIfMissing(client, "player_level_xp_rules_action_source_unique", "player_level_xp_rules", "action_source");

    // player_feature_unlocks (line 6727)
    await addConstraintIfMissing(client, "player_feature_unlocks_feature_key_unique", "player_feature_unlocks", "feature_key");

    // deep_assessment_skills (line 6849)
    await addConstraintIfMissing(client, "deep_assessment_skills_skill_key_unique", "deep_assessment_skills", "skill_key");

    // corporate_members (line 7277)
    await addConstraintIfMissing(client, "corporate_members_invite_token_unique", "corporate_members", "invite_token");

    // family_invite_codes (line 7639)
    await addConstraintIfMissing(client, "family_invite_codes_code_unique", "family_invite_codes", "code");

    // spectator_links (line 7666)
    await addConstraintIfMissing(client, "spectator_links_token_unique", "spectator_links", "token");

    // chat_rooms (line 8418)
    await addConstraintIfMissing(client, "chat_rooms_conversation_id_unique", "chat_rooms", "conversation_id");

    // outside_invites (line 8620)
    await addConstraintIfMissing(client, "outside_invites_token_unique", "outside_invites", "token");

    // arena_champion_cards (line 8694)
    await addConstraintIfMissing(client, "arena_champion_cards_player_id_unique", "arena_champion_cards", "player_id");

    // arena_player_cards (line 8728)
    await addConstraintIfMissing(client, "arena_player_cards_player_id_unique", "arena_player_cards", "player_id");

    // arena_coach_cards (line 8753)
    await addConstraintIfMissing(client, "arena_coach_cards_coach_id_unique", "arena_coach_cards", "coach_id");

    // player_pack_pity (line 8831)
    await addConstraintIfMissing(client, "player_pack_pity_player_id_unique", "player_pack_pity", "player_id");

    // player_login_streaks (line 9076)
    await addConstraintIfMissing(client, "player_login_streaks_player_id_unique", "player_login_streaks", "player_id");

    // ═══════════════════════════════════════════════════════════════════════════
    // TABLE-LEVEL unique("name").on(...) constraints
    // ═══════════════════════════════════════════════════════════════════════════

    // booking_invite_guests (line 873)
    await addConstraintIfMissing(client, "booking_invite_guests_unique", "booking_invite_guests", "invite_id, player_id");

    // open_match_slots (line 996)
    await addConstraintIfMissing(client, "open_match_slots_unique", "open_match_slots", "match_id, player_id");

    // court_availability_snapshots (line 1070)
    await addConstraintIfMissing(client, "court_availability_snapshots_unique", "court_availability_snapshots", "court_id, date, hour");

    // lesson_group_members (line 1389)
    await addConstraintIfMissing(client, "lesson_group_member_unique", "lesson_group_members", "group_id, player_id");

    // credit_transactions (line 3212) ← was the current blocker
    await addConstraintIfMissing(client, "credit_transactions_event_key_unique", "credit_transactions", "event_key");

    // group_event_rsvps (line 4031)
    await addConstraintIfMissing(client, "group_event_rsvps_event_user_unique", "group_event_rsvps", "event_id, user_id");

    // feed_items (line 4225)
    await addConstraintIfMissing(client, "feed_items_source_unique", "feed_items", "source_type, source_id");

    // player_badges (line 4504)
    await addConstraintIfMissing(client, "player_badges_unique", "player_badges", "player_id, badge_id");

    // player_titles (line 4550)
    await addConstraintIfMissing(client, "player_titles_unique", "player_titles", "player_id, title_id");

    // shop_categories (line 4905)
    await addConstraintIfMissing(client, "shop_categories_slug_unique", "shop_categories", "academy_id, slug");

    // shop_products (line 4967)
    await addConstraintIfMissing(client, "shop_products_slug_unique", "shop_products", "academy_id, slug");

    // shop_services (line 5020)
    await addConstraintIfMissing(client, "shop_services_slug_unique", "shop_services", "academy_id, slug");

    // shop_wishlist (lines 5141, 5142) — two constraints on the same table
    await addConstraintIfMissing(client, "shop_wishlist_unique_product", "shop_wishlist", "player_id, product_id");
    await addConstraintIfMissing(client, "shop_wishlist_unique_service", "shop_wishlist", "player_id, service_id");

    // marketplace_favorites (line 5328)
    await addConstraintIfMissing(client, "marketplace_favorites_unique", "marketplace_favorites", "player_id, listing_id");

    // skill_rubrics (line 5498)
    await addConstraintIfMissing(client, "skill_rubrics_skill_score", "skill_rubrics", "skill_id, score");

    // level_skills (line 5519)
    await addConstraintIfMissing(client, "level_skills_level_skill", "level_skills", "level_id, skill_id");

    // player_pillar_progress (line 5725)
    await addConstraintIfMissing(client, "player_pillar_progress_unique", "player_pillar_progress", "player_id, pillar");

    // session_skill_feedback (line 5835)
    await addConstraintIfMissing(client, "session_skill_feedback_unique", "session_skill_feedback", "session_id, player_id");

    // session_plans (line 6003)
    await addConstraintIfMissing(client, "session_plans_session_unique", "session_plans", "session_id");

    // role_message_templates (line 6144)
    await addConstraintIfMissing(client, "role_message_templates_unique", "role_message_templates", "academy_id, template_key");

    // player_feature_unlock_history (line 6833)
    await addConstraintIfMissing(client, "player_feature_unlock_history_unique", "player_feature_unlock_history", "player_id, feature_key");

    // player_deep_assessments (line 6919)
    await addConstraintIfMissing(client, "player_deep_assessments_unique", "player_deep_assessments", "player_id, skill_id");

    // deep_assessment_pillar_summaries (line 6956)
    await addConstraintIfMissing(client, "deep_assessment_pillar_summaries_unique", "deep_assessment_pillar_summaries", "player_id, pillar");

    // coach_wellness_logs (line 6999)
    await addConstraintIfMissing(client, "coach_wellness_logs_coach_date", "coach_wellness_logs", "coach_id, date");

    // spotlight_nominations (line 7034)
    await addConstraintIfMissing(client, "spotlight_nom_unique_vote", "spotlight_nominations", "nominator_player_id, week_start");

    // spotlight_weekly_winners (line 7052)
    await addConstraintIfMissing(client, "spotlight_weekly_unique", "spotlight_weekly_winners", "academy_id, week_start");

    // spotlight_monthly_winners (line 7071)
    await addConstraintIfMissing(client, "spotlight_monthly_unique", "spotlight_monthly_winners", "academy_id, month, year");

    // tournament_participants (line 7133)
    await addConstraintIfMissing(client, "tp_unique_entry", "tournament_participants", "tournament_id, player_id");

    // ladder_players (line 7208)
    await addConstraintIfMissing(client, "lp_unique_entry", "ladder_players", "ladder_id, player_id");

    // session_ai_summaries (line 7808)
    await addConstraintIfMissing(client, "session_ai_summaries_session_player", "session_ai_summaries", "session_id, player_id");

    // player_ai_usage (line 7907)
    await addConstraintIfMissing(client, "player_ai_usage_user_month", "player_ai_usage", "user_id, month");

    // session_ai_briefs (line 7926)
    await addConstraintIfMissing(client, "session_ai_briefs_session_uniq", "session_ai_briefs", "session_id");

    // player_monthly_assessments (line 7995)
    await addConstraintIfMissing(client, "player_monthly_assessments_player_month_uniq", "player_monthly_assessments", "player_id, month_year");

    // player_ai_training_plans (line 8055)
    await addConstraintIfMissing(client, "player_ai_training_plans_player_week_uniq", "player_ai_training_plans", "player_id, week_start_date");

    // player_monthly_reports (line 8099)
    await addConstraintIfMissing(client, "player_monthly_reports_player_month_uniq", "player_monthly_reports", "player_id, month_year");

    // session_ratings (line 8125)
    await addConstraintIfMissing(client, "session_ratings_session_id_player_id_unique", "session_ratings", "session_id, player_id");

    // level_coaching_context (line 8187)
    await addConstraintIfMissing(client, "level_coaching_context_level_id_unique", "level_coaching_context", "level_id");

    // session_checkins (line 8652)
    await addConstraintIfMissing(client, "session_checkins_session_player_unique", "session_checkins", "session_id, player_id");

    // player_ability_cards (line 8793)
    await addConstraintIfMissing(client, "player_ability_cards_unique", "player_ability_cards", "player_id, ability_card_id");

    // arena_season_standings (line 8900)
    await addConstraintIfMissing(client, "arena_season_standings_unique", "arena_season_standings", "season_id, player_id");

    // arena_head_to_head (line 8912)
    await addConstraintIfMissing(client, "arena_head_to_head_pair_unique", "arena_head_to_head", "player_a_id, player_b_id");

    // arena_cosmetics_unlocked (line 8961)
    await addConstraintIfMissing(client, "arena_cosmetics_unlocked_unique", "arena_cosmetics_unlocked", "player_id, cosmetic_key");

    // arena_trophy_room_pins (line 8973)
    await addConstraintIfMissing(client, "arena_trophy_room_pins_slot_unique", "arena_trophy_room_pins", "player_id, pin_slot");

    // arena_predictions (line 8989)
    await addConstraintIfMissing(client, "arena_predictions_player_match_unique", "arena_predictions", "player_id, match_id");

    // player_arena_badges (line 9133)
    await addConstraintIfMissing(client, "player_arena_badges_unique", "player_arena_badges", "player_id, badge_key");

    // arena_shop_daily_purchases (line 9148)
    await addConstraintIfMissing(client, "arena_shop_daily_purchases_unique", "arena_shop_daily_purchases", "player_id, ability_card_id, purchase_date");

    // card_wishlists (line 9162)
    await addConstraintIfMissing(client, "card_wishlists_unique", "card_wishlists", "player_id, card_ref_id");

    // arena_daily_challenge_claims (line 9176)
    await addConstraintIfMissing(client, "adcc_player_date_tier_unique", "arena_daily_challenge_claims", "player_id, challenge_date, tier");

    // ═══════════════════════════════════════════════════════════════════════════
    // uniqueIndex() — CREATE UNIQUE INDEX (including partial/expression indexes)
    // ═══════════════════════════════════════════════════════════════════════════

    // player_connections — expression + partial index (line 1618)
    await addUniqueIndexIfMissing(client,
      "player_connections_friend_pair_unique",
      `CREATE UNIQUE INDEX player_connections_friend_pair_unique
         ON player_connections (LEAST(player1_id, player2_id), GREATEST(player1_id, player2_id))
         WHERE connection_type = 'friend'`);

    // community_groups — partial index (line 3927)
    await addUniqueIndexIfMissing(client,
      "community_groups_family_group_id_unique",
      `CREATE UNIQUE INDEX community_groups_family_group_id_unique
         ON community_groups (family_group_id)
         WHERE family_group_id IS NOT NULL`);

    // coach_follows (line 4442)
    await addUniqueIndexIfMissing(client,
      "coach_follows_unique_pair",
      `CREATE UNIQUE INDEX coach_follows_unique_pair
         ON coach_follows (follower_user_id, coach_id)`);

    // quest_chain_bonus_claims (line 4694)
    await addUniqueIndexIfMissing(client,
      "quest_chain_bonus_claims_unique_idx",
      `CREATE UNIQUE INDEX quest_chain_bonus_claims_unique_idx
         ON quest_chain_bonus_claims (player_id, quest_type, period_key)`);

    // player_of_week (line 4735)
    await addUniqueIndexIfMissing(client,
      "player_of_week_unique_idx",
      `CREATE UNIQUE INDEX player_of_week_unique_idx
         ON player_of_week (scope, scope_id, week_start)`);

    // weekly_digests (line 4795)
    await addUniqueIndexIfMissing(client,
      "weekly_digests_player_week_unique",
      `CREATE UNIQUE INDEX weekly_digests_player_week_unique
         ON weekly_digests (player_id, week_start)`);

    // monthly_digests (line 4820)
    await addUniqueIndexIfMissing(client,
      "monthly_digests_player_month_unique",
      `CREATE UNIQUE INDEX monthly_digests_player_month_unique
         ON monthly_digests (player_id, month_start)`);

    // yearly_recaps (line 4847)
    await addUniqueIndexIfMissing(client,
      "yearly_recaps_player_year_unique",
      `CREATE UNIQUE INDEX yearly_recaps_player_year_unique
         ON yearly_recaps (player_id, year)`);

    // highlight_reels (line 4870)
    await addUniqueIndexIfMissing(client,
      "highlight_reels_match_unique",
      `CREATE UNIQUE INDEX highlight_reels_match_unique
         ON highlight_reels (match_log_id)`);

    // provider_client_preferences (line 5214)
    await addUniqueIndexIfMissing(client,
      "provider_client_prefs_unique_idx",
      `CREATE UNIQUE INDEX provider_client_prefs_unique_idx
         ON provider_client_preferences (provider_id, player_id)`);

    // ladders (line 7190)
    await addUniqueIndexIfMissing(client,
      "ladders_country_unique",
      `CREATE UNIQUE INDEX ladders_country_unique
         ON ladders (scope, country_code, sport)`);

    // corporate_credit_transactions (line 7309)
    await addUniqueIndexIfMissing(client,
      "corp_credit_tx_session_player_uniq",
      `CREATE UNIQUE INDEX corp_credit_tx_session_player_uniq
         ON corporate_credit_transactions (session_player_id)`);

    // play_request_participants (line 7501)
    await addUniqueIndexIfMissing(client,
      "prp_request_player_uniq",
      `CREATE UNIQUE INDEX prp_request_player_uniq
         ON play_request_participants (request_id, player_id)`);

    // family_members (line 7599)
    await addUniqueIndexIfMissing(client,
      "family_members_group_player_unique",
      `CREATE UNIQUE INDEX family_members_group_player_unique
         ON family_members (family_group_id, player_id)`);

    // family_member_spend_limits (line 7626)
    await addUniqueIndexIfMissing(client,
      "family_member_spend_limits_unique",
      `CREATE UNIQUE INDEX family_member_spend_limits_unique
         ON family_member_spend_limits (family_group_id, player_id, category)`);

    // player_match_readiness (line 8020)
    await addUniqueIndexIfMissing(client,
      "pmr_player_matchdate_unique",
      `CREATE UNIQUE INDEX pmr_player_matchdate_unique
         ON player_match_readiness (player_id, match_date)`);

    // player_saved_drills (line 8236)
    await addUniqueIndexIfMissing(client,
      "player_saved_drills_unique",
      `CREATE UNIQUE INDEX player_saved_drills_unique
         ON player_saved_drills (player_id, drill_id)`);

    // coach_assigned_drills (line 8266)
    await addUniqueIndexIfMissing(client,
      "coach_assigned_drills_unique",
      `CREATE UNIQUE INDEX coach_assigned_drills_unique
         ON coach_assigned_drills (coach_id, player_id, drill_id)`);

    // player_credit_balance (line 8298)
    await addUniqueIndexIfMissing(client,
      "player_credit_balance_unique",
      `CREATE UNIQUE INDEX player_credit_balance_unique
         ON player_credit_balance (player_id, academy_id, type)`);

    // credit_ledger_v2 (line 8350)
    await addUniqueIndexIfMissing(client,
      "credit_ledger_v2_event_key_unique",
      `CREATE UNIQUE INDEX credit_ledger_v2_event_key_unique
         ON credit_ledger_v2 (event_key)`);

    // credit_ledger_v2 partial index (line 8364)
    await addUniqueIndexIfMissing(client,
      "credit_ledger_v2_no_dup_consume",
      `CREATE UNIQUE INDEX credit_ledger_v2_no_dup_consume
         ON credit_ledger_v2 (session_player_id)
         WHERE reason = 'consume' AND session_player_id IS NOT NULL`);

    // player_money_wallet (line 8406)
    await addUniqueIndexIfMissing(client,
      "player_money_wallet_unique",
      `CREATE UNIQUE INDEX player_money_wallet_unique
         ON player_money_wallet (player_id, academy_id)`);

    // chat_rooms — country (line 8429)
    await addUniqueIndexIfMissing(client,
      "chat_rooms_country_unique",
      `CREATE UNIQUE INDEX chat_rooms_country_unique
         ON chat_rooms (country_code)`);

    // chat_room_mutes (line 8443)
    await addUniqueIndexIfMissing(client,
      "chat_room_mutes_unique",
      `CREATE UNIQUE INDEX chat_room_mutes_unique
         ON chat_room_mutes (room_id, user_id)`);

    // chat_room_coach_pins (line 8472)
    await addUniqueIndexIfMissing(client,
      "chat_room_coach_pins_unique",
      `CREATE UNIQUE INDEX chat_room_coach_pins_unique
         ON chat_room_coach_pins (room_id, coach_id, week_start)`);

    // chat_room_message_mentions (line 8488)
    await addUniqueIndexIfMissing(client,
      "chat_room_msg_mentions_unique",
      `CREATE UNIQUE INDEX chat_room_msg_mentions_unique
         ON chat_room_message_mentions (message_id, player_id)`);

    // leaderboard_snapshots (line 8548)
    await addUniqueIndexIfMissing(client,
      "leaderboard_snapshots_unique_idx",
      `CREATE UNIQUE INDEX leaderboard_snapshots_unique_idx
         ON leaderboard_snapshots (sport, scope, country, player_id, snapshot_week)`);

    // feature_interest (line 8569)
    await addUniqueIndexIfMissing(client,
      "feature_interest_player_feature_unique",
      `CREATE UNIQUE INDEX feature_interest_player_feature_unique
         ON feature_interest (player_id, feature_key)`);

    // release_notes_cache (line 8597)
    await addUniqueIndexIfMissing(client,
      "release_notes_cache_unique_idx",
      `CREATE UNIQUE INDEX release_notes_cache_unique_idx
         ON release_notes_cache (version, role, locale)`);

    // ── Add skill_tags column to players and drills if missing (Task #1701) ──
    // This column was declared in schema.ts but never applied to Supabase.
    // Every getPlayer() call was throwing "column skill_tags does not exist"
    // → /api/me returned 500 → auth context cleared → all players logged out.
    await client.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS skill_tags jsonb;`);
    console.log("[db-migrate] players.skill_tags — OK");

    {
      const drillsExists = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'drills'
      `);
      if (drillsExists.rowCount && drillsExists.rowCount > 0) {
        await client.query(`ALTER TABLE drills ADD COLUMN IF NOT EXISTS skill_tags jsonb DEFAULT '[]'::jsonb;`);
        console.log("[db-migrate] drills.skill_tags — OK");
      } else {
        console.log("[db-migrate] drills.skill_tags — SKIPPED (table not yet created)");
      }
    }

    // ── Backfill default availability for coaches with zero rows (Task #1692) ──
    // Idempotent: coaches that already have rows are skipped by the NOT EXISTS guard.
    {
      const zeroAvailCoaches = await client.query(`
        SELECT c.id, c.academy_id
        FROM coaches c
        WHERE NOT EXISTS (
          SELECT 1 FROM coach_availability ca WHERE ca.coach_id = c.id
        )
      `);
      let backfillCount = 0;
      for (const row of zeroAvailCoaches.rows) {
        for (let weekday = 0; weekday <= 6; weekday++) {
          await client.query(
            `INSERT INTO coach_availability
               (id, coach_id, academy_id, weekday, start_time, end_time, slot_duration, is_active)
             VALUES
               (gen_random_uuid()::text, $1, $2, $3, '07:00', '22:00', 60, true)
             ON CONFLICT DO NOTHING`,
            [row.id, row.academy_id, weekday],
          );
        }
        backfillCount++;
      }
      console.log(
        `[db-migrate] coach_availability backfill — ${backfillCount} coaches seeded with default Mon–Sun schedule`,
      );
    }

    // ── Court Booking Confirmations — Task #1712 ──────────────────────────────
    {
      // New columns on coaching_series
      await client.query(`
        ALTER TABLE coaching_series
          ADD COLUMN IF NOT EXISTS court_location TEXT,
          ADD COLUMN IF NOT EXISTS court_reminder_group_ids JSONB
      `);
      console.log("[db-migrate] coaching_series.court_location + court_reminder_group_ids — OK");

      // New table
      await client.query(`
        CREATE TABLE IF NOT EXISTS court_booking_confirmations (
          id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          series_id   TEXT REFERENCES coaching_series(id) ON DELETE SET NULL,
          academy_id  TEXT REFERENCES academies(id),
          status      TEXT NOT NULL DEFAULT 'pending',
          screenshot_key  TEXT,
          screenshot_url  TEXT,
          rejection_note  TEXT,
          confirmed_at    TIMESTAMPTZ,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      console.log("[db-migrate] court_booking_confirmations table — OK");

      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS court_booking_confirmations_session_player_idx
          ON court_booking_confirmations (session_id, player_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS court_booking_confirmations_session_idx
          ON court_booking_confirmations (session_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS court_booking_confirmations_player_idx
          ON court_booking_confirmations (player_id)
      `);
      console.log("[db-migrate] court_booking_confirmations indexes — OK");
    }

    // ── Task #1773: Approve Dean Hamilton's bio_status so he is eligible ──────
    // Dean Hamilton (id = 76f7d0e7-1363-404f-93d0-7edcce95a28d) had bio_status
    // = 'draft', blocking him from the coach directory. The public quality gate
    // (publicCoachQualityGate) does not check bio_status, but the non-public
    // directory path does. Setting it to 'approved' is the prerequisite for
    // eventual visibility (he must also add a photo, quote, or specialty to
    // pass the quality gate).
    await client.query(`
      UPDATE coaches
      SET bio_status = 'approved'
      WHERE id = '76f7d0e7-1363-404f-93d0-7edcce95a28d'
        AND bio_status = 'draft'
    `);
    console.log("[db-migrate] Dean Hamilton bio_status — OK");

    // ── academy_settings.cancellation_policy — Task #1788 ────────────────────
    // Column declared in schema.ts but never applied to Supabase.
    // getAcademySettings() was throwing "column cancellation_policy does not exist"
    // (Postgres code 42703) on every academy creation, causing a 500 error.
    await client.query(`
      ALTER TABLE academy_settings
        ADD COLUMN IF NOT EXISTS cancellation_policy TEXT
          DEFAULT 'Free cancellation up to 24 hours before the lesson'
    `);
    console.log("[db-migrate] academy_settings.cancellation_policy — OK");

    // ── Coach blocked calendar slots table ──────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS coach_blocked_slots (
        id VARCHAR(255) PRIMARY KEY,
        academy_id VARCHAR(255) NOT NULL,
        date VARCHAR(10) NOT NULL,
        hour INTEGER NOT NULL,
        coach_id VARCHAR(255),
        court_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS coach_blocked_slots_academy_date_idx
        ON coach_blocked_slots (academy_id, date)
    `);
    console.log("[db-migrate] coach_blocked_slots table — OK");

    // ── Task #2004 — Fix booking wizard location duplicates ──────────────────
    // The DB had 8 locations: 4 real parent venues + 4 orphaned child sub-locations
    // that were mistakenly created as locations instead of courts.  Courts were
    // linked to the child entries.  Fix: move courts to their parent venue and
    // deactivate the 4 empty child sub-locations so the wizard shows only 4 tiles.
    //
    // Parent → Child mapping (child IDs are hardcoded because they are the ones
    // being deactivated and their names could drift):
    //   Sidra 1 tennis          (ee142c78) → sidra tennis courts    (fc9b9253)
    //   Maple 1 Tennis Court    (1e178e26) → Maple tennis court     (358f3887)
    //   Safa Club 1             (61dfd4fa) → Safa tennis club       (d0193c3e)
    //   Ambassador Intl Academy (f8e73856) → ambassender school al qouz (211cdfc0)
    //
    // NOTE: "ambassender school al qouz" (211cdfc0) is the PARENT venue and is
    // intentionally left active — the academy owner will deactivate it manually
    // when they decide to remove it.  "Ambassador International Academy" (f8e73856)
    // is the ORPHANED child sub-location whose court has been moved to the parent
    // above; it IS deactivated by this migration (see IN list below).
    //
    // To safely remove a location in the future:
    //   1. Reassign all sessions/series pointing to it to a replacement location.
    //   2. Set is_active = false on the location.
    await client.query(`
      UPDATE courts
      SET location_id = 'fc9b9253-763f-4d63-852d-eb2034ef0097'
      WHERE location_id = 'ee142c78-731e-4861-bdb2-d181307bb492'
    `);
    await client.query(`
      UPDATE courts
      SET location_id = '358f3887-4224-444a-a6a8-dcbbb06a6bd9'
      WHERE location_id = '1e178e26-2996-40e6-a186-36c58cd76efe'
    `);
    await client.query(`
      UPDATE courts
      SET location_id = 'd0193c3e-af23-4234-845c-7d6a9b1cbc79'
      WHERE location_id = '61dfd4fa-0be6-4a99-81ac-66ce3e20f2cf'
    `);
    await client.query(`
      UPDATE courts
      SET location_id = '211cdfc0-7304-48a5-9535-df157e1b687c'
      WHERE location_id = 'f8e73856-dc28-44aa-ab90-f2f7aab7d321'
    `);
    await client.query(`
      UPDATE locations
      SET is_active = false
      WHERE id IN (
        'ee142c78-731e-4861-bdb2-d181307bb492',
        '1e178e26-2996-40e6-a186-36c58cd76efe',
        '61dfd4fa-0be6-4a99-81ac-66ce3e20f2cf',
        'f8e73856-dc28-44aa-ab90-f2f7aab7d321'
      )
    `);
    console.log("[db-migrate] Task #2004 location dedup — OK");

    // ── Task #2036: coach_tier_pricing table ───────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS coach_tier_pricing (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        academy_id VARCHAR NOT NULL REFERENCES academies(id),
        role TEXT NOT NULL,
        price_60min NUMERIC,
        price_90min NUMERIC,
        price_120min NUMERIC,
        currency TEXT DEFAULT 'AED',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS coach_tier_pricing_academy_role_idx
      ON coach_tier_pricing(academy_id, role)
    `);
    console.log("[db-migrate] coach_tier_pricing table — OK");

    // ── Task #2096: coach_report_state table ──────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS coach_report_state (
        key TEXT PRIMARY KEY,
        paid_session_ids JSONB NOT NULL DEFAULT '[]',
        excluded_session_ids JSONB NOT NULL DEFAULT '[]',
        start_date TEXT,
        rate_per_session NUMERIC,
        currency TEXT DEFAULT 'AED',
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("[db-migrate] coach_report_state table — OK");

    // ── Task #2117: academy_seasons + player_season_enrollments ───────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS academy_seasons (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        academy_id VARCHAR NOT NULL REFERENCES academies(id),
        name TEXT NOT NULL,
        start_date DATE NOT NULL,
        ended_at TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS academy_seasons_active_per_academy_idx
      ON academy_seasons(academy_id) WHERE is_active = true
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_season_enrollments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id VARCHAR NOT NULL REFERENCES players(id),
        academy_id VARCHAR NOT NULL,
        season_id VARCHAR NOT NULL REFERENCES academy_seasons(id),
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_season_enrollments_player_idx
      ON player_season_enrollments(player_id, academy_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_season_enrollments_season_idx
      ON player_season_enrollments(season_id)
    `);

    // Backfill: create one active season per academy that doesn't have one yet,
    // then enroll all players that don't have an enrollment for that academy.
    await client.query(`
      INSERT INTO academy_seasons (id, academy_id, name, start_date, is_active)
      SELECT
        gen_random_uuid(),
        a.id,
        'Season 2025-2026',
        COALESCE(
          (SELECT DATE(MIN(sess.start_time)) FROM sessions sess WHERE sess.academy_id = a.id),
          '2025-01-01'
        )::DATE,
        true
      FROM academies a
      WHERE NOT EXISTS (
        SELECT 1 FROM academy_seasons s WHERE s.academy_id = a.id AND s.is_active = true
      )
    `);

    // Enroll existing players: started_at = their first session date, or academy join date
    await client.query(`
      INSERT INTO player_season_enrollments (id, player_id, academy_id, season_id, started_at)
      SELECT
        gen_random_uuid(),
        p.id,
        p.academy_id,
        s.id,
        COALESCE(
          (
            SELECT MIN(sess.start_time)
            FROM sessions sess
            JOIN session_players sp ON sp.session_id = sess.id
            WHERE sp.player_id = p.id
              AND sess.academy_id = p.academy_id
          ),
          p.created_at,
          NOW()
        ) AS started_at
      FROM players p
      JOIN academy_seasons s ON s.academy_id = p.academy_id AND s.is_active = true
      WHERE p.academy_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM player_season_enrollments e
          WHERE e.player_id = p.id AND e.academy_id = p.academy_id AND e.ended_at IS NULL
        )
    `);
    console.log("[db-migrate] Task #2117 academy_seasons + player_season_enrollments — OK");

    // ── Batch 1 security tables: otp_codes + rate_limit_hits ─────────────────
    // Fresh-DB-safe:   CREATE TABLE IF NOT EXISTS (runs on a blank schema)
    // Upgrade-safe:    ALTER TABLE … ADD COLUMN IF NOT EXISTS (runs on a DB
    //                  that already has the table without the purpose column,
    //                  e.g. tables created directly via psql in Batch 1).
    // Both statements are idempotent — running this script twice is safe.

    await client.query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id            VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid(),
        email         TEXT        NOT NULL,
        code_hash     TEXT        NOT NULL,
        purpose       TEXT        NOT NULL DEFAULT 'registration',
        expires_at    TIMESTAMP   NOT NULL,
        used_at       TIMESTAMP,
        verified_at   TIMESTAMP,
        attempt_count INTEGER     NOT NULL DEFAULT 0,
        created_at    TIMESTAMP   DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS otp_codes_email_idx ON otp_codes(email)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS otp_codes_expires_at_idx ON otp_codes(expires_at)
    `);
    // Upgrade path: add purpose to tables created before this column existed.
    await client.query(`
      ALTER TABLE otp_codes
        ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'registration'
    `);
    console.log("[db-migrate] otp_codes (Batch-1 OTP-01) — OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS rate_limit_hits (
        key          TEXT      NOT NULL,
        window_start TIMESTAMP NOT NULL,
        count        INTEGER   NOT NULL DEFAULT 1,
        expires_at   TIMESTAMP NOT NULL,
        CONSTRAINT rate_limit_hits_key_window_idx UNIQUE (key, window_start)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS rate_limit_hits_expires_at_idx
        ON rate_limit_hits(expires_at)
    `);
    console.log("[db-migrate] rate_limit_hits (Batch-1 RL-01) — OK");

    // B3-P0 residual: unique constraint on player_session_cancellations so that
    // the mark-unavailable INSERT ON CONFLICT DO NOTHING is concurrency-safe.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS player_session_cancellations_session_player_type_uniq
        ON player_session_cancellations (session_id, player_id, cancellation_type)
    `);
    console.log("[db-migrate] player_session_cancellations_session_player_type_uniq — OK");

    // ── Task #2201 — Pre-Season Lifecycle & RBAC Integrity ────────────────────
    // Closing credit snapshot column on player_season_enrollments.
    // Stores per-type signed balances at season close as { group, semi_private, private }.
    // NULL on historical rows closed before this migration ran — use NULL as sentinel
    // for "no snapshot available" rather than backfilling.
    await client.query(`
      ALTER TABLE player_season_enrollments
        ADD COLUMN IF NOT EXISTS closing_credit_snapshot jsonb NULL
    `);
    console.log("[db-migrate] Task #2201 closing_credit_snapshot — OK");

    // Atomic End Season rollover: immutable close snapshots and persistent
    // source-season/request idempotency records.
    const atomicSeasonRolloverMigration = path.resolve(
      process.cwd(),
      "migrations/0054_atomic_selected_end_season.sql",
    );
    await client.query(readFileSync(atomicSeasonRolloverMigration, "utf8"));
    console.log("[db-migrate] atomic selected End Season rollover — OK");

    // ── Phase 2 — Canonical Progression Core ─────────────────────────────────
    // The checked-in migration is additive and idempotent. Execute it here so
    // the standard `db-migrate.ts && drizzle-kit push` workflow creates the
    // canonical foundation before Drizzle inspects the intended schema.
    const canonicalMigrationPath = path.resolve(process.cwd(), "migrations/0049_canonical_progression_core.sql");
    await client.query(readFileSync(canonicalMigrationPath, "utf8"));
    console.log("[db-migrate] Phase 2 canonical progression core — OK");

    // ── Verification ──────────────────────────────────────────────────────────
    const check = await client.query(
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'player_health_snapshots'"
    );
    const exists = parseInt(check.rows[0].count, 10) > 0;
    console.log(`[db-migrate] Verification: table exists = ${exists}`);
    if (!exists) {
      console.error("[db-migrate] ERROR: player_health_snapshots was not created");
      process.exit(1);
    }

    console.log("[db-migrate] Done.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("[db-migrate] Fatal:", err);
  process.exit(1);
});
