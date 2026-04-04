import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

// Always use Supabase database for both development and production
const databaseUrl = process.env.SUPABASE_DATABASE_URL || "";

if (!databaseUrl) {
  console.error("[Database] CRITICAL: SUPABASE_DATABASE_URL is not set!");
  console.error("[Database] Available env vars:", Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('SUPA') || k.includes('PG')));
  throw new Error("SUPABASE_DATABASE_URL must be set");
}

// Log connection attempt (mask sensitive parts)
const maskedUrl = databaseUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
console.log(`[Database] Attempting connection to: ${maskedUrl.substring(0, 50)}...`);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  // Optimized for Supabase Transaction Pooler (port 6543)
  max: 12,                        // Good balance for concurrent requests
  min: 2,                         // Keep connections warm
  connectionTimeoutMillis: 10000, // 10s timeout
  idleTimeoutMillis: 30000,       // Release idle after 30s
  keepAlive: true,                // Keep connections alive
  allowExitOnIdle: false,         // Keep pool alive for server
});

console.log('[Database] Pool configured: max=12, min=2, keepAlive=true');

// Add error handler to pool
pool.on('error', (err) => {
  console.error('[Database] Pool error:', err.message);
});

// Test connection on startup
pool.query('SELECT 1').then(async () => {
  console.log('[Database] Connection test successful - Supabase PostgreSQL ready');
  try {
    await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS audit_verified_at TIMESTAMP`);
    await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS audit_verified_by VARCHAR`);
  } catch (e: any) {
    console.log('[Database] Audit columns already exist or migration skipped');
  }
  try {
    await pool.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS address TEXT`);
    await pool.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
  } catch (e: any) {
    console.log('[Database] Locations migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_availability (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id VARCHAR NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS provider_availability_provider_idx ON provider_availability(provider_id)`);
  } catch (e: any) {
    console.log('[Database] provider_availability migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_order_upsells (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id VARCHAR NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
        provider_id VARCHAR NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
        service_id VARCHAR,
        label TEXT NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        responded_at TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS shop_order_upsells_order_idx ON shop_order_upsells(order_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS shop_order_upsells_provider_idx ON shop_order_upsells(provider_id)`);
  } catch (e: any) {
    console.log('[Database] shop_order_upsells migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS beta_feedback (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id VARCHAR REFERENCES players(id),
        player_name TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS bf_player_idx ON beta_feedback(player_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS bf_created_idx ON beta_feedback(created_at)`);
  } catch (e: any) {
    console.log('[Database] beta_feedback migration skipped:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE session_skill_feedback ADD COLUMN IF NOT EXISTS stroke_feedback JSONB`);
    await pool.query(`ALTER TABLE session_skill_feedback ADD COLUMN IF NOT EXISTS lesson_intensity TEXT`);
    await pool.query(`ALTER TABLE session_skill_feedback ADD COLUMN IF NOT EXISTS player_note TEXT`);
  } catch (e: any) {
    console.log('[Database] stroke_feedback columns migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS video_feedback (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        coach_id VARCHAR NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
        player_id VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        session_id VARCHAR REFERENCES sessions(id) ON DELETE SET NULL,
        academy_id VARCHAR REFERENCES academies(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        video_url TEXT NOT NULL,
        thumbnail_url TEXT,
        annotations JSONB DEFAULT '[]'::jsonb,
        message_id VARCHAR,
        conversation_id VARCHAR,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS vf_coach_idx ON video_feedback(coach_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS vf_player_idx ON video_feedback(player_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS vf_academy_idx ON video_feedback(academy_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS vf_created_idx ON video_feedback(created_at)`);
  } catch (e: any) {
    console.log('[Database] video_feedback migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS equipment (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        academy_id VARCHAR NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL DEFAULT 'rental',
        price_credits INTEGER,
        price_cash NUMERIC(10,2),
        currency TEXT DEFAULT 'AED',
        quantity INTEGER NOT NULL DEFAULT 1,
        available_quantity INTEGER NOT NULL DEFAULT 1,
        photo_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS equipment_academy_idx ON equipment(academy_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS equipment_type_idx ON equipment(type)`);
  } catch (e: any) {
    console.log('[Database] equipment migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_matches (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        creator_id VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        opponent_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        sport TEXT NOT NULL DEFAULT 'tennis',
        match_type TEXT NOT NULL DEFAULT 'singles',
        match_format TEXT NOT NULL DEFAULT 'best_of_3',
        scoring_mode TEXT NOT NULL DEFAULT 'standard',
        challenge_id VARCHAR,
        current_score JSONB DEFAULT '{"sets":[{"creator":0,"opponent":0}],"currentGame":{"creator":0,"opponent":0},"setsWon":{"creator":0,"opponent":0},"pointHistory":[]}'::jsonb,
        status TEXT NOT NULL DEFAULT 'live',
        winner_id VARCHAR REFERENCES players(id),
        set_score_summary TEXT,
        games_diff INTEGER DEFAULT 0,
        mmr_delta_creator INTEGER,
        mmr_delta_opponent INTEGER,
        previous_mmr_creator INTEGER,
        previous_mmr_opponent INTEGER,
        new_mmr_creator INTEGER,
        new_mmr_opponent INTEGER,
        previous_rank_creator INTEGER,
        new_rank_creator INTEGER,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        last_updated_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS live_matches_creator_idx ON live_matches(creator_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS live_matches_status_idx ON live_matches(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS live_matches_started_idx ON live_matches(started_at)`);
  } catch (e: any) {
    console.log('[Database] live_matches migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS equipment_rentals (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        equipment_id VARCHAR NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
        player_id VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        academy_id VARCHAR NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
        reserved_from TIMESTAMP NOT NULL,
        reserved_until TIMESTAMP NOT NULL,
        returned_at TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'reserved',
        payment_method TEXT NOT NULL DEFAULT 'credits',
        amount_paid NUMERIC(10,2),
        credits_used INTEGER,
        notes TEXT,
        checked_out_by VARCHAR,
        checked_in_by VARCHAR,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE equipment_rentals ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'rental'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS eq_rentals_equipment_idx ON equipment_rentals(equipment_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS eq_rentals_player_idx ON equipment_rentals(player_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS eq_rentals_academy_idx ON equipment_rentals(academy_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS eq_rentals_status_idx ON equipment_rentals(status)`);
  } catch (e: any) {
    console.log('[Database] equipment_rentals migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS corporate_accounts (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        academy_id VARCHAR NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
        company_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        credit_balance INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS corporate_accounts_academy_idx ON corporate_accounts(academy_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS corporate_accounts_email_idx ON corporate_accounts(contact_email)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS corporate_members (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        corporate_account_id VARCHAR NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
        player_id VARCHAR REFERENCES players(id),
        invite_email TEXT NOT NULL,
        invite_token TEXT UNIQUE,
        invite_status TEXT NOT NULL DEFAULT 'pending',
        invited_by VARCHAR NOT NULL REFERENCES users(id),
        accepted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS corporate_members_account_idx ON corporate_members(corporate_account_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS corporate_members_player_idx ON corporate_members(player_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS corporate_members_token_idx ON corporate_members(invite_token)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS corporate_credit_transactions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        corporate_account_id VARCHAR NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
        academy_id VARCHAR NOT NULL REFERENCES academies(id),
        player_id VARCHAR REFERENCES players(id),
        session_id VARCHAR REFERENCES sessions(id),
        session_player_id VARCHAR,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_before INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reason TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS corp_credit_tx_account_idx ON corporate_credit_transactions(corporate_account_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS corp_credit_tx_player_idx ON corporate_credit_transactions(player_id)`);
    await pool.query(`ALTER TABLE corporate_credit_transactions ADD COLUMN IF NOT EXISTS session_player_id VARCHAR`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS corp_credit_tx_session_player_uniq ON corporate_credit_transactions(session_player_id) WHERE session_player_id IS NOT NULL`);
  } catch (e: any) {
    console.log('[Database] corporate accounts migration skipped:', e.message);
  }
  try {
    // Multi-sport platform foundation migration
    await pool.query(`ALTER TABLE academies ADD COLUMN IF NOT EXISTS sports JSONB DEFAULT '["tennis"]'::jsonb`);
    await pool.query(`ALTER TABLE courts ADD COLUMN IF NOT EXISTS sport TEXT DEFAULT 'tennis'`);
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sport TEXT DEFAULT 'tennis'`);
    await pool.query(`ALTER TABLE coaching_series ADD COLUMN IF NOT EXISTS sport TEXT DEFAULT 'tennis'`);
    await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS sport_profiles JSONB`);
    await pool.query(`ALTER TABLE match_requests ADD COLUMN IF NOT EXISTS sport TEXT DEFAULT 'tennis'`);
    console.log('[Database] Multi-sport migration applied');
  } catch (e: any) {
    console.log('[Database] Multi-sport migration skipped:', e.message);
  }
  try {
    // Add CHECK constraints for sport columns (enforce valid sport values at DB level)
    // Use DO block to handle IF NOT EXISTS safely across Postgres versions
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'courts_sport_check'
        ) THEN
          ALTER TABLE courts ADD CONSTRAINT courts_sport_check
            CHECK (sport IN ('tennis', 'padel', 'pickleball', 'multi'));
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'sessions_sport_check'
        ) THEN
          ALTER TABLE sessions ADD CONSTRAINT sessions_sport_check
            CHECK (sport IN ('tennis', 'padel', 'pickleball'));
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'coaching_series_sport_check'
        ) THEN
          ALTER TABLE coaching_series ADD CONSTRAINT coaching_series_sport_check
            CHECK (sport IN ('tennis', 'padel', 'pickleball'));
        END IF;
      END $$;
    `);
    console.log('[Database] Sport CHECK constraints applied');
  } catch (e: any) {
    console.log('[Database] Sport CHECK constraints migration skipped:', e.message);
  }
  try {
    // Backfill tennis sport_profiles from existing player ball_level data
    // Only for players where sport_profiles is null (first-time migration)
    await pool.query(`
      UPDATE players
      SET sport_profiles = jsonb_build_object(
        'tennis', jsonb_build_object(
          'ballLevel', ball_level,
          'skillLevel', skill_level
        )
      )
      WHERE ball_level IS NOT NULL
        AND (sport_profiles IS NULL OR sport_profiles->'tennis' IS NULL)
    `);
    console.log('[Database] Tennis sport_profiles backfill applied');
  } catch (e: any) {
    console.log('[Database] Tennis sport_profiles backfill skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS play_requests (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        creator_id VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        sport TEXT NOT NULL DEFAULT 'tennis',
        scheduled_at TIMESTAMP NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        location TEXT NOT NULL,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        spots_total INTEGER NOT NULL DEFAULT 1,
        spots_filled INTEGER NOT NULL DEFAULT 0,
        level_min INTEGER,
        level_max INTEGER,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS play_requests_creator_idx ON play_requests(creator_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS play_requests_status_idx ON play_requests(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS play_requests_sport_idx ON play_requests(sport)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS play_requests_scheduled_idx ON play_requests(scheduled_at)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS play_request_participants (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id VARCHAR NOT NULL REFERENCES play_requests(id) ON DELETE CASCADE,
        player_id VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'joined',
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(request_id, player_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS prp_request_idx ON play_request_participants(request_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS prp_player_idx ON play_request_participants(player_id)`);
    console.log('[Database] play_requests migration successful');
  } catch (e: any) {
    console.log('[Database] play_requests migration skipped:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE group_events ADD COLUMN IF NOT EXISTS wager NUMERIC`);
    await pool.query(`ALTER TABLE group_events ADD COLUMN IF NOT EXISTS wager_currency TEXT NOT NULL DEFAULT 'AED'`);
    console.log('[Database] group_events wager migration successful');
  } catch (e: any) {
    console.log('[Database] group_events wager migration skipped:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'open'`);
    await pool.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS start_time TEXT`);
    await pool.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_fee NUMERIC`);
    await pool.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS doubles_registration_fee NUMERIC`);
    await pool.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS level_min NUMERIC`);
    await pool.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS level_max NUMERIC`);
    await pool.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS venue_lat NUMERIC`);
    await pool.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS venue_lng NUMERIC`);
    console.log('[Database] tournaments extended fields migration successful');
  } catch (e: any) {
    console.log('[Database] tournaments extended fields migration skipped:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS google_place_id TEXT`);
    console.log('[Database] locations google_place_id migration successful');
  } catch (e: any) {
    console.log('[Database] locations google_place_id migration skipped:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS city TEXT`);
    await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS country TEXT`);
    console.log('[Database] players city/country migration successful');
  } catch (e: any) {
    console.log('[Database] players city/country migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feature_events (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        academy_id VARCHAR REFERENCES academies(id) ON DELETE SET NULL,
        feature TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'web',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS fe_user_idx ON feature_events(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS fe_academy_idx ON feature_events(academy_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS fe_feature_idx ON feature_events(feature)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS fe_created_idx ON feature_events(created_at)`);
    console.log('[Database] feature_events migration successful');
  } catch (e: any) {
    console.log('[Database] feature_events migration skipped:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE coaches ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE coaches ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE coaches ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMP`);
    console.log('[Database] coaches GPS columns migration successful');
  } catch (e: any) {
    console.log('[Database] coaches GPS columns migration skipped:', e.message);
  }
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`);
    console.log('[Database] users stripe columns migration applied');
  } catch (e: any) {
    console.warn('[Database] users stripe columns migration skipped:', e.message);
  }
  try {
    // Partial unique index: only one AI session note per (session, player).
    // Non-AI feedback types (technique, praise, etc.) are unconstrained and
    // continue to support multiple entries per session/player.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS in_session_feedback_ai_note_unique
      ON in_session_feedback(session_id, player_id)
      WHERE feedback_type = 'ai_session_note'
    `);
    console.log('[Database] in_session_feedback AI note partial index applied');
  } catch (e: any) {
    console.warn('[Database] in_session_feedback AI note partial index skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        feature_type TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        academy_id VARCHAR REFERENCES academies(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS ai_usage_logs_user_idx ON ai_usage_logs(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ai_usage_logs_academy_idx ON ai_usage_logs(academy_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ai_usage_logs_created_idx ON ai_usage_logs(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ai_usage_logs_feature_idx ON ai_usage_logs(feature_type)`);
    console.log('[Database] ai_usage_logs migration successful');
  } catch (e: any) {
    console.log('[Database] ai_usage_logs migration skipped:', e.message);
  }
  try {
    // Subscription plans table — academy tier management
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        stripe_price_id TEXT,
        stripe_product_id TEXT,
        monthly_price NUMERIC NOT NULL DEFAULT 0,
        yearly_price NUMERIC,
        currency TEXT NOT NULL DEFAULT 'EUR',
        max_coaches INTEGER NOT NULL DEFAULT 1,
        max_players INTEGER NOT NULL DEFAULT 50,
        max_locations INTEGER NOT NULL DEFAULT 1,
        features JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS sp_sort_idx ON subscription_plans(sort_order)`);
    await pool.query(`ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS description TEXT`);
    await pool.query(`ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_product_id TEXT`);
    await pool.query(`ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);

    // Subscriptions table — active academy subscriptions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        academy_id VARCHAR NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
        plan_id VARCHAR NOT NULL REFERENCES subscription_plans(id),
        stripe_subscription_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        billing_period TEXT NOT NULL DEFAULT 'monthly',
        current_period_start TIMESTAMP,
        current_period_end TIMESTAMP,
        trial_ends_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS sub_academy_idx ON subscriptions(academy_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS sub_plan_idx ON subscriptions(plan_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS sub_status_idx ON subscriptions(status)`);
    await pool.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);

    // Seed the 3 default subscription plans if none exist
    const existing = await pool.query(`SELECT COUNT(*) FROM subscription_plans`);
    if (parseInt(existing.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO subscription_plans (name, description, monthly_price, currency, max_coaches, max_players, max_locations, features, sort_order)
        VALUES
          ('Starter', 'Perfect for small academies getting started', 0, 'EUR', 3, 30, 1, 
           '{"ai_coach_basic":false,"ai_coach_unlimited":false,"video_feedback":false,"match_analytics":false,"tournaments":false,"custom_roles":false,"white_labeling":false,"advanced_invoicing":false}'::jsonb,
           0),
          ('Pro', 'For growing academies needing more tools', 49, 'EUR', 10, 150, 3,
           '{"ai_coach_basic":true,"ai_coach_unlimited":false,"video_feedback":true,"match_analytics":true,"tournaments":false,"custom_roles":false,"white_labeling":false,"advanced_invoicing":true}'::jsonb,
           1),
          ('Elite', 'Full power for elite and multi-location academies', 99, 'EUR', -1, -1, -1,
           '{"ai_coach_basic":true,"ai_coach_unlimited":true,"video_feedback":true,"match_analytics":true,"tournaments":true,"custom_roles":true,"white_labeling":true,"advanced_invoicing":true}'::jsonb,
           2)
        ON CONFLICT DO NOTHING
      `);
      console.log('[Database] Subscription plans seeded: Starter, Pro, Elite');
    }
    console.log('[Database] Subscription plans/subscriptions migration successful');
  } catch (e: any) {
    console.log('[Database] Subscription plans migration skipped:', e.message);
  }
}).catch((err) => {
  console.error('[Database] Connection test FAILED:', err.message);
});

export const db = drizzle(pool, { schema });
export { pool };

console.log(`[Database] Drizzle ORM initialized with Supabase PostgreSQL`);
