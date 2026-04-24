import pkg from "pg";
const { Pool } = pkg;

const TABLES_IN_ORDER = [
  "users",
  "academies",
  "academy_applications",
  "academy_owner_profiles",
  "invites",
  "join_requests",
  "academy_transfer_requests",
  "coach_invitations",
  "coaches",
  "coach_freelance_profiles",
  "locations",
  "location_travel_times",
  "courts",
  "court_availability",
  "court_bookings",
  "booking_invites",
  "booking_invite_guests",
  "open_matches",
  "open_match_slots",
  "player_booking_preferences",
  "court_availability_snapshots",
  "players",
  "lesson_groups",
  "lesson_group_members",
  "player_level_events",
  "player_invites",
  "player_matches",
  "adult_glow_matches",
  "adult_skill_assessments",
  "player_connections",
  "package_templates",
  "packages",
  "sessions",
  "coaching_series",
  "series_players",
  "recurring_series",
  "session_players",
  "session_waitlist",
  "squads",
  "squad_members",
  "player_session_cancellations",
  "player_holidays",
  "session_feedback",
  "in_session_feedback",
  "audit_logs",
  "platform_config",
  "offline_queue",
  "player_notes",
  "player_progress",
  "session_templates",
  "coach_notifications",
  "skill_domains",
  "player_skill_state",
  "session_skill_observations",
  "level_requirements",
  "coach_stats_rollup",
  "player_progress_flags",
  "domain_assessments",
  "xp_transactions",
  "coach_xp_transactions",
  "conversations",
  "conversation_participants",
  "messages",
  "message_reactions",
  "coach_availability",
  "availability_exceptions",
  "coach_court_preferences",
  "coach_court_rules",
  "coach_settings",
  "academy_settings",
  "academy_invites",
  "coach_academy_memberships",
  "coach_time_blocks",
  "push_device_tokens",
  "notification_preferences",
  "scheduled_notifications",
  "billing_accounts",
  "subscription_plans",
  "subscriptions",
  "invoices",
  "payments",
  "credit_transactions",
  "player_subscriptions",
  "refunds",
  "coach_payouts",
  "diagnostic_reports",
  "booking_requests",
  "parent_player_relations",
  "parent_settings",
  "payment_reminders",
  "coach_payment_rules",
  "coach_earnings",
  "coach_reviews",
  "review_responses",
  "review_flags",
  "review_prompts",
  "coach_review_stats",
  "academy_pricing",
  "coach_contracts",
  "community_groups",
  "group_members",
  "posts",
  "post_reactions",
  "post_comments",
  "comment_likes",
  "open_to_play",
  "user_social_profiles",
  "badges",
  "player_badges",
  "titles",
  "player_titles",
  "quest_templates",
  "player_quests",
  "daily_quest_slots",
  "shop_categories",
  "shop_products",
  "shop_services",
  "shop_orders",
  "shop_order_items",
  "shop_wishlist",
  "marketplace_listings",
  "marketplace_favorites",
  "marketplace_messages",
  "seller_profiles",
  "ball_levels",
  "glow_skills",
  "skill_rubrics",
  "level_skills",
  "level_tests",
  "player_ball_levels",
  "player_baselines",
  "player_baseline_skill_scores",
  "player_skill_scores",
  "player_pillar_progress",
  "level_trials",
  "session_skill_feedback",
  "coach_calibration",
  "lesson_templates",
  "drill_blocks",
  "session_plans",
  "match_logs",
  "skill_evidence",
  "role_message_templates",
  "level_up_events",
  "match_opponents",
  "match_plans",
  "matches",
  "match_reflections",
  "match_pillar_scores",
  "coach_match_reviews",
  "pressure_moments",
  "match_training_suggestions",
  "player_level_thresholds",
  "player_level_xp_rules",
  "player_feature_unlocks",
  "player_xp_events",
  "player_level_up_celebrations",
  "player_feature_unlock_history",
  "deep_assessment_skills",
  "player_deep_assessments",
  "deep_assessment_pillar_summaries",
];

async function syncDatabases() {
  const devUrl = process.env.DATABASE_URL;
  const prodUrl = process.env.SUPABASE_DATABASE_URL;

  if (!devUrl || !prodUrl) {
    console.error("Missing DATABASE_URL or SUPABASE_DATABASE_URL");
    process.exit(1);
  }

  const devPool = new Pool({ connectionString: devUrl });
  const prodPool = new Pool({ 
    connectionString: prodUrl,
    ssl: { rejectUnauthorized: false }
  });

  console.log("🔗 Connecting to databases...");

  try {
    const devClient = await devPool.connect();
    const prodClient = await prodPool.connect();

    console.log("✅ Connected to both databases\n");

    console.log("🗑️  Clearing production tables (in reverse order)...");
    for (const table of [...TABLES_IN_ORDER].reverse()) {
      try {
        await prodClient.query(`DELETE FROM "${table}"`);
        console.log(`   Cleared: ${table}`);
      } catch (e: any) {
        if (!e.message.includes("does not exist")) {
          console.log(`   Skip: ${table} (${e.message.slice(0, 50)})`);
        }
      }
    }

    console.log("\n📦 Copying data from dev to production...\n");

    let totalRows = 0;
    for (const table of TABLES_IN_ORDER) {
      try {
        const { rows } = await devClient.query(`SELECT * FROM "${table}"`);
        
        if (rows.length === 0) {
          continue;
        }

        const columns = Object.keys(rows[0]);
        const columnList = columns.map(c => `"${c}"`).join(", ");

        for (const row of rows) {
          const values = columns.map((_, i) => `$${i + 1}`).join(", ");
          const params = columns.map(c => row[c]);
          
          try {
            await prodClient.query(
              `INSERT INTO "${table}" (${columnList}) VALUES (${values}) ON CONFLICT DO NOTHING`,
              params
            );
          } catch (insertErr: any) {
            console.error(`   Error inserting into ${table}: ${insertErr.message.slice(0, 80)}`);
          }
        }

        console.log(`   ✅ ${table}: ${rows.length} rows`);
        totalRows += rows.length;
      } catch (e: any) {
        if (!e.message.includes("does not exist")) {
          console.log(`   ⚠️  ${table}: ${e.message.slice(0, 60)}`);
        }
      }
    }

    console.log(`\n🎉 Sync complete! Copied ${totalRows} total rows to production.`);

    devClient.release();
    prodClient.release();
    await devPool.end();
    await prodPool.end();

  } catch (error) {
    console.error("Sync failed:", error);
    process.exit(1);
  }
}

syncDatabases();
