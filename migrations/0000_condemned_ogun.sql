CREATE TABLE "academies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"join_code" text,
	"city" text,
	"country" text,
	"description" text,
	"owner_id" varchar,
	"website" text,
	"phone" text,
	"email" text,
	"logo_url" text,
	"cover_image_url" text,
	"facilities" jsonb,
	"court_count" integer,
	"age_groups" jsonb,
	"programs" jsonb,
	"price_range" text,
	"profile_visibility" text DEFAULT 'public',
	"cancel_hours_before_free" integer DEFAULT 24,
	"charge_late_private_cancellations" boolean DEFAULT true,
	"charge_late_group_cancellations" boolean DEFAULT true,
	"semi_private_upgrade_billing" text DEFAULT 'premium',
	"allow_make_up_for_timely_cancels" boolean DEFAULT true,
	"xp_per_session" integer DEFAULT 10,
	"xp_bonus_streak" integer DEFAULT 5,
	"no_show_penalty" integer DEFAULT 100,
	"late_cancellation_penalty" integer DEFAULT 50,
	"attendance_threshold" integer DEFAULT 80,
	"require_confirmation" boolean DEFAULT true,
	"allow_waitlist" boolean DEFAULT true,
	"max_waitlist_size" integer DEFAULT 3,
	"primary_color" text,
	"secondary_color" text,
	"address" text,
	"default_session_length" integer DEFAULT 60,
	"xp_visible_to_players" boolean DEFAULT true,
	"notifications_enabled" boolean DEFAULT true,
	"is_freelance" boolean DEFAULT false,
	"freelance_owner_coach_id" varchar,
	"allow_freelance_coaches" text DEFAULT 'allow',
	"timezone" text DEFAULT 'Asia/Dubai',
	"bank_name" text,
	"bank_account_number" text,
	"bank_iban" text,
	"bank_account_holder" text,
	"bank_swift_code" text,
	"payment_instructions" text,
	"accepts_cash" boolean DEFAULT true,
	"accepts_bank_transfer" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "academies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "academies_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "academy_applications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_name" text NOT NULL,
	"country" text NOT NULL,
	"contact_person" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy_invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'coach',
	"invite_code" varchar(32) NOT NULL,
	"status" text DEFAULT 'pending',
	"invited_by" varchar,
	"accepted_by" varchar,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "academy_invites_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "academy_owner_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"owner_name" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"years_in_sports" text,
	"background_tags" jsonb DEFAULT '[]'::jsonb,
	"vision_tags" jsonb DEFAULT '[]'::jsonb,
	"academy_focus" text,
	"internal_note" text,
	"public_message" text,
	"photo_url" text,
	"approved" boolean DEFAULT false,
	"approved_by" varchar,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "academy_owner_profiles_academy_id_unique" UNIQUE("academy_id")
);
--> statement-breakpoint
CREATE TABLE "academy_pricing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"session_type" text NOT NULL,
	"price_per_session" numeric NOT NULL,
	"currency" text DEFAULT 'AED',
	"is_per_person" boolean DEFAULT false,
	"duration" integer,
	"price_per_hour" numeric,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"is_active" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"address" text,
	"city" text,
	"country" text,
	"timezone" text DEFAULT 'Asia/Dubai',
	"currency" text DEFAULT 'AED',
	"logo_url" text,
	"primary_color" varchar(7) DEFAULT '#2ECC40',
	"default_session_duration" integer DEFAULT 60,
	"working_hours_start" integer DEFAULT 6,
	"working_hours_end" integer DEFAULT 22,
	"billing_enabled" boolean DEFAULT false,
	"billing_mode" text DEFAULT 'hybrid',
	"default_lesson_price" numeric DEFAULT '100',
	"invoice_due_days" integer DEFAULT 14,
	"cancellation_policy_enabled" boolean DEFAULT true,
	"cancellation_window_hours" integer DEFAULT 24,
	"cancellation_charge_percent" integer DEFAULT 100,
	"welcome_video_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "academy_settings_academy_id_unique" UNIQUE("academy_id")
);
--> statement-breakpoint
CREATE TABLE "academy_transfer_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"from_academy_id" varchar NOT NULL,
	"to_academy_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"from_academy_status" text DEFAULT 'pending',
	"from_academy_reviewed_by" varchar,
	"from_academy_reviewed_at" timestamp,
	"from_academy_note" text,
	"to_academy_status" text DEFAULT 'pending',
	"to_academy_reviewed_by" varchar,
	"to_academy_reviewed_at" timestamp,
	"to_academy_note" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "adult_glow_matches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"opponent_id" varchar NOT NULL,
	"did_win" boolean NOT NULL,
	"games_diff" integer DEFAULT 0,
	"set_score" text,
	"match_type" text DEFAULT 'friendly',
	"verification" text DEFAULT 'self_reported',
	"player_mmr_before" integer,
	"opponent_mmr_before" integer,
	"mmr_delta" integer,
	"match_date" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "adult_skill_assessments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"coach_id" varchar NOT NULL,
	"skill_id" text NOT NULL,
	"score" integer NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"entity_type" text NOT NULL,
	"entity_id" varchar,
	"action" text NOT NULL,
	"performed_by" varchar,
	"performed_by_role" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" text,
	"ip_address" text,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "availability_exceptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon_name" text NOT NULL,
	"icon_color" text DEFAULT '#00D9FF',
	"rarity" text DEFAULT 'common',
	"category" text DEFAULT 'general',
	"unlock_criteria" jsonb,
	"order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ball_levels" (
	"id" varchar PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"rank" integer NOT NULL,
	"language_tier" text NOT NULL,
	"display_name_player" text NOT NULL,
	"display_name_coach" text NOT NULL,
	"identity" text,
	"court_type" text,
	"ball_type" text,
	"match_format" text,
	"social_goals" jsonb,
	"reward_badge" text,
	"reward_unlock" text,
	"promotion_to_level_id" varchar,
	"promotion_requirements" jsonb,
	"trial_enabled" boolean DEFAULT true,
	"trial_days" integer DEFAULT 14,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "billing_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"stripe_customer_id" text,
	"stripe_account_id" text,
	"billing_email" text,
	"billing_name" text,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "billing_accounts_academy_id_unique" UNIQUE("academy_id")
);
--> statement-breakpoint
CREATE TABLE "booking_invite_guests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"status" text DEFAULT 'pending',
	"responded_at" timestamp,
	"share_amount" numeric,
	"payment_status" text DEFAULT 'pending',
	"xp_awarded" integer DEFAULT 0,
	"notification_sent_at" timestamp,
	"reminder_sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "booking_invite_guests_unique" UNIQUE("invite_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "booking_invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"host_player_id" varchar NOT NULL,
	"split_cost" boolean DEFAULT true,
	"cost_per_person" numeric,
	"currency" text DEFAULT 'AED',
	"max_guests" integer DEFAULT 3,
	"message" text,
	"total_invited" integer DEFAULT 0,
	"total_accepted" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "booking_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"player_id" varchar NOT NULL,
	"coach_id" varchar,
	"location_id" varchar,
	"court_id" varchar,
	"requested_start" timestamp NOT NULL,
	"requested_end" timestamp NOT NULL,
	"duration" integer NOT NULL,
	"session_type" text NOT NULL,
	"player_note" text,
	"status" text DEFAULT 'pending',
	"responded_by" varchar,
	"responded_at" timestamp,
	"response_note" text,
	"session_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_academy_memberships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"academy_id" varchar NOT NULL,
	"role" text DEFAULT 'coach',
	"is_active" boolean DEFAULT true,
	"is_primary" boolean DEFAULT false,
	"hourly_rate" numeric,
	"session_billing_mode" text DEFAULT 'academy_managed',
	"payout_type" text DEFAULT 'per_hour',
	"joined_at" timestamp DEFAULT now(),
	"left_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "coach_availability" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"coach_id" varchar NOT NULL,
	"location_id" varchar,
	"court_id" varchar,
	"weekday" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"slot_duration" integer DEFAULT 60,
	"session_types" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_calibration" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"bias_score" numeric(4, 2) DEFAULT '0.00',
	"calibration_count" integer DEFAULT 0,
	"last_calibration_at" timestamp,
	"bulk_rating_flag" boolean DEFAULT false,
	"consistency_score" numeric(4, 2) DEFAULT '1.00',
	"score_weight" numeric(3, 2) DEFAULT '1.00',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "coach_calibration_coach_id_unique" UNIQUE("coach_id")
);
--> statement-breakpoint
CREATE TABLE "coach_contracts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"academy_id" varchar NOT NULL,
	"pay_type" text DEFAULT 'hourly' NOT NULL,
	"hourly_rate" numeric,
	"session_rate" numeric,
	"percentage_rate" numeric,
	"currency" text DEFAULT 'AED',
	"private_rate" numeric,
	"semi_private_rate" numeric,
	"group_rate" numeric,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"status" text DEFAULT 'active',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_court_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"court_id" varchar NOT NULL,
	"priority" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_court_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"preferred_type" text DEFAULT 'no_preference',
	"daylight_only" boolean DEFAULT false,
	"max_sessions_per_court_per_day" integer DEFAULT 8,
	"max_total_sessions_per_day" integer DEFAULT 10,
	"fallback_behavior" text DEFAULT 'suggest',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "coach_court_rules_coach_id_unique" UNIQUE("coach_id")
);
--> statement-breakpoint
CREATE TABLE "coach_earnings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"academy_id" varchar,
	"session_id" varchar,
	"amount" numeric NOT NULL,
	"currency" text DEFAULT 'AED',
	"calculation_type" text NOT NULL,
	"session_duration" integer,
	"session_price" numeric,
	"status" text DEFAULT 'pending',
	"confirmed_at" timestamp,
	"paid_at" timestamp,
	"earning_month" integer NOT NULL,
	"earning_year" integer NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_freelance_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"freelance_academy_id" varchar,
	"business_name" text NOT NULL,
	"slug" text,
	"tagline" text,
	"bio" text,
	"logo_url" text,
	"cover_image_url" text,
	"primary_color" text,
	"contact_email" text,
	"contact_phone" text,
	"website" text,
	"social_links" jsonb,
	"service_areas" jsonb,
	"travel_radius" integer,
	"specialties" jsonb,
	"age_groups_served" jsonb,
	"show_pricing" boolean DEFAULT false,
	"hourly_rate_min" integer,
	"hourly_rate_max" integer,
	"currency" text DEFAULT 'USD',
	"is_active" boolean DEFAULT false,
	"activated_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "coach_freelance_profiles_coach_id_unique" UNIQUE("coach_id"),
	CONSTRAINT "coach_freelance_profiles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "coach_invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"coach_id" varchar,
	"email" text NOT NULL,
	"role" text DEFAULT 'coach',
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" varchar NOT NULL,
	"token" text NOT NULL,
	"message" text,
	"expires_at" timestamp,
	"accepted_at" timestamp,
	"declined_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "coach_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "coach_match_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" varchar NOT NULL,
	"coach_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"technical_feedback" text,
	"tactical_feedback" text,
	"physical_feedback" text,
	"mental_feedback" text,
	"social_feedback" text,
	"match_feedback" text,
	"top_improvements" jsonb DEFAULT '[]'::jsonb,
	"strength_to_reinforce" text,
	"suggested_lesson_focus" jsonb DEFAULT '[]'::jsonb,
	"voice_note_url" text,
	"comment" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"priority" text DEFAULT 'medium',
	"is_read" boolean DEFAULT false,
	"action_url" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_payment_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"academy_id" varchar,
	"payment_type" text DEFAULT 'hourly' NOT NULL,
	"hourly_rate" numeric,
	"private_session_rate" numeric,
	"group_session_rate" numeric,
	"commission_percentage" numeric,
	"hybrid_base_rate" numeric,
	"hybrid_commission_percentage" numeric,
	"currency" text DEFAULT 'AED',
	"is_active" boolean DEFAULT true,
	"effective_from" timestamp DEFAULT now(),
	"effective_to" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "coach_payment_rules_coach_id_unique" UNIQUE("coach_id")
);
--> statement-breakpoint
CREATE TABLE "coach_payouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"coach_id" varchar NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"hours_worked" numeric DEFAULT '0',
	"hourly_rate" numeric NOT NULL,
	"gross_amount" numeric NOT NULL,
	"status" text DEFAULT 'pending',
	"decline_reason" text,
	"paid_at" timestamp,
	"paid_by" varchar,
	"payment_method" text,
	"payment_reference" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_review_stats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"total_reviews" integer DEFAULT 0,
	"visible_reviews" integer DEFAULT 0,
	"average_overall" numeric,
	"avg_coaching_quality" numeric,
	"avg_communication" numeric,
	"avg_with_kids_beginners" numeric,
	"avg_reliability" numeric,
	"avg_feedback_motivation" numeric,
	"kid_review_count" integer DEFAULT 0,
	"teen_review_count" integer DEFAULT 0,
	"adult_review_count" integer DEFAULT 0,
	"red_level_count" integer DEFAULT 0,
	"orange_level_count" integer DEFAULT 0,
	"green_level_count" integer DEFAULT 0,
	"yellow_level_count" integer DEFAULT 0,
	"best_for_tags" jsonb DEFAULT '[]'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	CONSTRAINT "coach_review_stats_coach_id_unique" UNIQUE("coach_id")
);
--> statement-breakpoint
CREATE TABLE "coach_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"academy_id" varchar,
	"coaching_quality" integer NOT NULL,
	"communication" integer NOT NULL,
	"with_kids_beginners" integer NOT NULL,
	"reliability" integer NOT NULL,
	"feedback_motivation" integer NOT NULL,
	"overall_score" numeric NOT NULL,
	"what_does_well" text,
	"best_for_player_type" text,
	"reviewer_age_category" text,
	"reviewer_level" text,
	"session_count_at_review" integer NOT NULL,
	"is_visible" boolean DEFAULT false,
	"is_hidden" boolean DEFAULT false,
	"hidden_reason" text,
	"hidden_by" varchar,
	"hidden_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"min_session_length" integer DEFAULT 30,
	"buffer_between_sessions" integer DEFAULT 0,
	"availability_paused" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "coach_settings_coach_id_unique" UNIQUE("coach_id")
);
--> statement-breakpoint
CREATE TABLE "coach_stats_rollup" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"high_effort_rate_30" numeric,
	"up_rate_30" numeric,
	"down_rate_30" numeric,
	"avg_up_per_session" numeric,
	"severity_factor" numeric DEFAULT '1.0',
	"is_high_effort_spammer" boolean DEFAULT false,
	"is_up_spammer" boolean DEFAULT false,
	"last_calculated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_time_blocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"source_type" text NOT NULL,
	"source_academy_id" varchar,
	"source_session_id" varchar,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"start_utc_minutes" integer,
	"end_utc_minutes" integer,
	"status" text DEFAULT 'confirmed',
	"is_private" boolean DEFAULT false,
	"block_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_wellness_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"academy_id" varchar,
	"date" date NOT NULL,
	"sleep_hours" numeric(3, 1),
	"sleep_quality" text,
	"nutrition_score" integer,
	"meals_count" integer,
	"hydration_level" text,
	"energy_level" integer,
	"mood_level" integer,
	"stress_level" integer,
	"physical_pain" boolean DEFAULT false,
	"pain_notes" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "coach_wellness_logs_coach_date" UNIQUE("coach_id","date")
);
--> statement-breakpoint
CREATE TABLE "coach_xp_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"session_id" varchar,
	"xp_amount" integer NOT NULL,
	"source" text NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coaches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"tshirt_size" text,
	"specialty" text,
	"bio" text,
	"role" text DEFAULT 'coach',
	"home_location_id" varchar,
	"hourly_rate" numeric,
	"level" integer DEFAULT 1,
	"total_xp" integer DEFAULT 0,
	"onboarding_completed" boolean DEFAULT false,
	"onboarding_mode" text,
	"onboarding_completed_at" timestamp,
	"onboarding_acknowledgements" jsonb,
	"years_experience" text,
	"certifications" text,
	"background_tags" jsonb,
	"philosophy_tags" jsonb,
	"public_quote" text,
	"photo_url" text,
	"bio_status" text DEFAULT 'draft',
	"bio_approved_by" varchar,
	"bio_approved_at" timestamp,
	"bio_rejection_reason" text,
	"show_profile_to_players" boolean DEFAULT true,
	"show_in_directory" boolean DEFAULT true,
	"open_to_opportunities" boolean DEFAULT false,
	"specializations" jsonb,
	"languages" jsonb,
	"parent_dashboard_pin" text DEFAULT '1234',
	"pin_changed_at" timestamp,
	"is_freelance" boolean DEFAULT false,
	"personal_academy_id" varchar,
	"self_service_rate" numeric,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coaching_series" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"coach_id" varchar,
	"court_id" varchar,
	"location_id" varchar,
	"title" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"duration" integer NOT NULL,
	"session_type" text NOT NULL,
	"ball_level" text,
	"skill_level" integer,
	"max_players" integer DEFAULT 6,
	"week_count" integer,
	"series_start_date" date NOT NULL,
	"series_end_date" date,
	"xp_per_session" integer DEFAULT 20,
	"vibe" text DEFAULT 'casual',
	"price" numeric,
	"status" text DEFAULT 'active',
	"paused_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comment_likes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'level' NOT NULL,
	"series_id" varchar,
	"is_private" boolean DEFAULT false,
	"allow_chat" boolean DEFAULT true,
	"allow_posts" boolean DEFAULT true,
	"avatar_url" text,
	"cover_url" text,
	"accent_color" text,
	"member_count" integer DEFAULT 0,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"academy_id" varchar,
	"participant_type" text NOT NULL,
	"coach_id" varchar,
	"player_id" varchar,
	"role" text DEFAULT 'member',
	"can_post" boolean DEFAULT true,
	"last_read_at" timestamp,
	"mute_until" timestamp,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"academy_id" varchar,
	"player_id" varchar,
	"coach_id" varchar,
	"last_message_at" timestamp,
	"last_message_preview" text,
	"is_archived" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "court_availability" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"court_id" varchar NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"blocked_reason" text,
	"blocked_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "court_availability_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"court_id" varchar NOT NULL,
	"date" date NOT NULL,
	"hour" integer NOT NULL,
	"booking_count" integer DEFAULT 0,
	"total_slots" integer DEFAULT 1,
	"demand_score" numeric(3, 2) DEFAULT '0.00',
	"avg_bookings_this_slot" numeric(4, 2),
	"is_popular_time" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "court_availability_snapshots_unique" UNIQUE("court_id","date","hour")
);
--> statement-breakpoint
CREATE TABLE "court_bookings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"court_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"player_id" varchar,
	"academy_id" varchar,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"booking_type" text DEFAULT 'public' NOT NULL,
	"price" numeric DEFAULT '0',
	"currency" text DEFAULT 'AED',
	"payment_status" text DEFAULT 'pending',
	"credits_used" integer DEFAULT 0,
	"credit_package_id" varchar,
	"status" text DEFAULT 'pending',
	"confirmed_at" timestamp,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"cancelled_by" varchar,
	"xp_awarded" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "courts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"location_id" varchar,
	"name" text NOT NULL,
	"color" varchar(7) DEFAULT '#2ECC40',
	"is_active" boolean DEFAULT true,
	"position" integer DEFAULT 0,
	"surface" text DEFAULT 'hard',
	"description" text,
	"photo_url" text,
	"visibility" text DEFAULT 'academy',
	"price_per_hour" numeric DEFAULT '0',
	"peak_price_per_hour" numeric,
	"member_price_per_hour" numeric,
	"currency" text DEFAULT 'AED',
	"credits_per_hour" integer DEFAULT 0,
	"peak_credits_per_hour" integer,
	"member_credits_per_hour" integer,
	"max_booking_duration_hours" integer DEFAULT 2,
	"min_booking_duration_minutes" integer DEFAULT 60,
	"cancel_window_hours" integer DEFAULT 24,
	"guests_allowed" boolean DEFAULT false,
	"requires_approval" boolean DEFAULT false,
	"operating_hours" jsonb,
	"xp_reward_per_hour" integer DEFAULT 10,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"academy_id" varchar,
	"session_id" varchar,
	"package_id" varchar,
	"session_player_id" varchar,
	"type" text NOT NULL,
	"credit_type" text,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"event_key" varchar,
	"balance_before" integer,
	"balance_after" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "credit_transactions_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "daily_quest_slots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"slot_date" date NOT NULL,
	"quest_1_id" varchar,
	"quest_2_id" varchar,
	"quest_3_id" varchar,
	"bonus_quest_id" varchar,
	"bonus_unlocked" boolean DEFAULT false,
	"completed_count" integer DEFAULT 0,
	"all_completed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deep_assessment_pillar_summaries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"pillar" text NOT NULL,
	"total_skills" integer DEFAULT 0,
	"assessed_skills" integer DEFAULT 0,
	"average_score" numeric(4, 2),
	"score_0_count" integer DEFAULT 0,
	"score_1_count" integer DEFAULT 0,
	"score_2_count" integer DEFAULT 0,
	"score_3_count" integer DEFAULT 0,
	"low_confidence_count" integer DEFAULT 0,
	"medium_confidence_count" integer DEFAULT 0,
	"high_confidence_count" integer DEFAULT 0,
	"last_assessed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "deep_assessment_pillar_summaries_unique" UNIQUE("player_id","pillar")
);
--> statement-breakpoint
CREATE TABLE "deep_assessment_skills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pillar" text NOT NULL,
	"category" text NOT NULL,
	"skill_key" text NOT NULL,
	"skill_name" text NOT NULL,
	"description" text,
	"player_description" text,
	"parent_description" text,
	"score_0_description" text,
	"score_1_description" text,
	"score_2_description" text,
	"score_3_description" text,
	"applicable_ball_levels" jsonb DEFAULT '[]'::jsonb,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"drives_xp" boolean DEFAULT false,
	"drives_drills" boolean DEFAULT true,
	"drives_quests" boolean DEFAULT false,
	"promotion_required" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "deep_assessment_skills_skill_key_unique" UNIQUE("skill_key")
);
--> statement-breakpoint
CREATE TABLE "diagnostic_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"error_id" text NOT NULL,
	"user_id" varchar,
	"academy_id" varchar,
	"user_role" text,
	"severity" text DEFAULT 'error',
	"message" text NOT NULL,
	"stack" text,
	"screen" text,
	"context" jsonb,
	"user_comment" text,
	"platform" text,
	"app_version" text,
	"device_info" text,
	"status" text DEFAULT 'new',
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "domain_assessments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"coach_id" varchar NOT NULL,
	"domain_id" varchar NOT NULL,
	"status" text NOT NULL,
	"previous_status" text,
	"notes" text,
	"is_baseline" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "drill_blocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"block_type" text NOT NULL,
	"order_index" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"skill_ids" jsonb DEFAULT '[]'::jsonb,
	"pillars" jsonb DEFAULT '[]'::jsonb,
	"coach_instructions" text,
	"player_instructions" text,
	"equipment_needed" jsonb DEFAULT '[]'::jsonb,
	"variations" jsonb DEFAULT '[]'::jsonb,
	"success_criteria" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "glow_skills" (
	"id" varchar PRIMARY KEY NOT NULL,
	"pillar" text NOT NULL,
	"name" text NOT NULL,
	"stage" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"muted_until" timestamp,
	"notifications_enabled" boolean DEFAULT true,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "in_session_feedback" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"coach_id" varchar NOT NULL,
	"feedback_type" text NOT NULL,
	"message" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"xp_awarded" integer DEFAULT 0,
	"pillar_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"role" text DEFAULT 'coach' NOT NULL,
	"academy_id" varchar NOT NULL,
	"invited_email" text,
	"invited_by" varchar NOT NULL,
	"used_by" varchar,
	"used_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"player_id" varchar,
	"package_id" varchar,
	"session_id" varchar,
	"invoice_number" text NOT NULL,
	"stripe_invoice_id" text,
	"invoice_type" text DEFAULT 'manual',
	"amount" numeric NOT NULL,
	"currency" text DEFAULT 'AED',
	"status" text DEFAULT 'pending',
	"due_date" date,
	"paid_at" timestamp,
	"line_items" jsonb,
	"notes" text,
	"payment_method" text DEFAULT 'cash',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "join_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"academy_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lesson_group_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"joined_at" timestamp DEFAULT now(),
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "lesson_group_member_unique" UNIQUE("group_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"coach_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"group_type" text DEFAULT 'youth',
	"allowed_ball_levels" jsonb,
	"min_skill_level" integer DEFAULT 1,
	"max_skill_level" integer DEFAULT 3,
	"min_glow_rank" integer,
	"max_glow_rank" integer,
	"max_players" integer DEFAULT 6,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lesson_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"level_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"focus" text NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"min_players" integer DEFAULT 1,
	"max_players" integer DEFAULT 6,
	"age_group" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true,
	"usage_count" integer DEFAULT 0,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "level_requirements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ball_level" text NOT NULL,
	"domain_id" varchar NOT NULL,
	"min_status" text NOT NULL,
	"min_progress_value" integer,
	"min_sessions_at_level" integer DEFAULT 8,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "level_skills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_id" varchar NOT NULL,
	"skill_id" varchar NOT NULL,
	"target_score" integer DEFAULT 2 NOT NULL,
	"weight" numeric(3, 2) DEFAULT '1.00',
	"is_required" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "level_skills_level_skill" UNIQUE("level_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "level_tests" (
	"id" varchar PRIMARY KEY NOT NULL,
	"level_id" varchar NOT NULL,
	"name" text NOT NULL,
	"test_type" text NOT NULL,
	"description" text,
	"metrics" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "level_trials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"from_level_id" varchar NOT NULL,
	"to_level_id" varchar NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"ends_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"test_results" jsonb,
	"evidence_count" integer DEFAULT 0,
	"match_count" integer DEFAULT 0,
	"evaluated_by" varchar,
	"evaluation_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "level_up_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"from_level_id" varchar NOT NULL,
	"to_level_id" varchar NOT NULL,
	"trial_id" varchar,
	"xp_awarded" integer DEFAULT 0,
	"badges_awarded" jsonb DEFAULT '[]'::jsonb,
	"title_unlocked" varchar,
	"celebration_shown" boolean DEFAULT false,
	"celebration_shown_at" timestamp,
	"player_notified" boolean DEFAULT false,
	"parent_notified" boolean DEFAULT false,
	"promoted_by" varchar,
	"promoted_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "location_travel_times" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"coach_id" varchar,
	"from_location_id" varchar NOT NULL,
	"to_location_id" varchar NOT NULL,
	"travel_time_minutes" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Dubai',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketplace_favorites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"listing_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "marketplace_favorites_unique" UNIQUE("player_id","listing_id")
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" varchar NOT NULL,
	"academy_id" varchar,
	"title" text NOT NULL,
	"description" text,
	"condition" text DEFAULT 'used',
	"category" text NOT NULL,
	"brand" text,
	"model" text,
	"price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'AED',
	"is_negotiable" boolean DEFAULT true,
	"images" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'active',
	"is_verified" boolean DEFAULT false,
	"verified_at" timestamp,
	"verified_by" varchar,
	"view_count" integer DEFAULT 0,
	"favorite_count" integer DEFAULT 0,
	"message_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"sold_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "marketplace_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"recipient_id" varchar NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"session_id" varchar,
	"coach_id" varchar,
	"match_type" text NOT NULL,
	"match_format" text NOT NULL,
	"court_surface" text,
	"ball_type" text,
	"opponent_name" text,
	"opponent_player_id" varchar,
	"opponent_level" text,
	"player_score" jsonb NOT NULL,
	"opponent_score" jsonb NOT NULL,
	"result" text NOT NULL,
	"aces" integer DEFAULT 0,
	"double_faults" integer DEFAULT 0,
	"winners" integer DEFAULT 0,
	"unforced_errors" integer DEFAULT 0,
	"observations" jsonb,
	"coach_notes" text,
	"player_notes" text,
	"played_at" timestamp NOT NULL,
	"duration" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_opponents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"name" text NOT NULL,
	"club" text,
	"glow_rank" integer,
	"external_rating" text,
	"playstyle_tags" jsonb DEFAULT '[]'::jsonb,
	"stronger_side" text,
	"weaker_side" text,
	"typical_patterns" jsonb DEFAULT '[]'::jsonb,
	"last_5_matches" jsonb DEFAULT '[]'::jsonb,
	"win_rate" integer,
	"coach_notes" text,
	"player_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_pillar_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"technical_score" integer,
	"tactical_score" integer,
	"physical_score" integer,
	"mental_score" integer,
	"social_score" integer,
	"match_score" integer,
	"technical_status" text,
	"tactical_status" text,
	"physical_status" text,
	"mental_status" text,
	"social_status" text,
	"match_status" text,
	"technical_insight" text,
	"tactical_insight" text,
	"physical_insight" text,
	"mental_insight" text,
	"social_insight" text,
	"match_insight" text,
	"source" text DEFAULT 'auto' NOT NULL,
	"coach_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"opponent_id" varchar,
	"match_id" varchar,
	"scheduled_date" date,
	"scheduled_time" text,
	"venue" text,
	"match_type" text DEFAULT 'competitive',
	"primary_tactic" text,
	"mental_cue" text,
	"energy_focus" text,
	"suggested_tactics" jsonb DEFAULT '[]'::jsonb,
	"pre_match_energy" text,
	"pre_match_mood" text,
	"pre_match_confidence" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_reflections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"what_worked" jsonb DEFAULT '[]'::jsonb,
	"what_didnt_work" jsonb DEFAULT '[]'::jsonb,
	"biggest_challenge" text,
	"post_match_energy" text,
	"post_match_mood" text,
	"post_match_confidence" integer,
	"key_takeaway" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"academy_id" varchar,
	"match_type" text DEFAULT 'singles',
	"match_intent" text DEFAULT 'friendly',
	"title" text,
	"description" text,
	"preferred_date" date,
	"preferred_time" text,
	"required_level_min" integer DEFAULT 1,
	"required_level_max" integer DEFAULT 9,
	"required_ball_level" text,
	"is_adult" boolean DEFAULT true,
	"max_players" integer DEFAULT 2,
	"status" text DEFAULT 'open',
	"invited_player_id" varchar,
	"matched_with_player_id" varchar,
	"matched_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_training_suggestions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"focus_area" text NOT NULL,
	"pillar" text NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"suggested_weeks" integer DEFAULT 2,
	"related_template_ids" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"opponent_id" varchar,
	"plan_id" varchar,
	"academy_id" varchar,
	"match_date" date NOT NULL,
	"match_type" text DEFAULT 'competitive',
	"surface" text,
	"venue" text,
	"result" text NOT NULL,
	"score" text NOT NULL,
	"sets_won" integer DEFAULT 0,
	"sets_lost" integer DEFAULT 0,
	"games_won" integer DEFAULT 0,
	"games_lost" integer DEFAULT 0,
	"duration_minutes" integer,
	"aces" integer DEFAULT 0,
	"double_faults" integer DEFAULT 0,
	"winners" integer DEFAULT 0,
	"unforced_errors" integer DEFAULT 0,
	"trust_level" text DEFAULT 'self_reported' NOT NULL,
	"verified_by" varchar,
	"verified_at" timestamp,
	"glow_rank_before" integer,
	"glow_rank_after" integer,
	"glow_rank_change" integer DEFAULT 0,
	"confidence_change" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar NOT NULL,
	"academy_id" varchar,
	"reactor_type" text NOT NULL,
	"reactor_coach_id" varchar,
	"reactor_player_id" varchar,
	"emoji" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"academy_id" varchar,
	"sender_type" text,
	"sender_coach_id" varchar,
	"sender_player_id" varchar,
	"body" text NOT NULL,
	"message_type" text DEFAULT 'text',
	"reply_to_id" varchar,
	"xp_awarded" integer,
	"is_edited" boolean DEFAULT false,
	"is_deleted" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"session_reminders" boolean DEFAULT true,
	"feedback_requests" boolean DEFAULT true,
	"package_expiry" boolean DEFAULT true,
	"load_warnings" boolean DEFAULT true,
	"chat_messages" boolean DEFAULT true,
	"reminder_minutes_before" integer DEFAULT 30,
	"quiet_hours_start" integer,
	"quiet_hours_end" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "notification_preferences_coach_id_unique" UNIQUE("coach_id")
);
--> statement-breakpoint
CREATE TABLE "offline_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar,
	"action_type" text NOT NULL,
	"payload" jsonb,
	"synced" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "open_match_slots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"role" text DEFAULT 'player',
	"status" text DEFAULT 'confirmed',
	"joined_at" timestamp DEFAULT now(),
	"cancelled_at" timestamp,
	"xp_awarded" integer DEFAULT 0,
	"notification_sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "open_match_slots_unique" UNIQUE("match_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "open_matches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" varchar NOT NULL,
	"host_player_id" varchar NOT NULL,
	"academy_id" varchar,
	"match_type" text DEFAULT 'singles',
	"title" text,
	"description" text,
	"required_level_min" integer DEFAULT 1,
	"required_level_max" integer DEFAULT 20,
	"required_ball_level" text,
	"skill_flexibility" text DEFAULT 'flexible',
	"max_players" integer DEFAULT 2,
	"current_players" integer DEFAULT 1,
	"status" text DEFAULT 'open',
	"visibility" text DEFAULT 'academy',
	"cost_per_player" numeric,
	"currency" text DEFAULT 'AED',
	"xp_bonus" integer DEFAULT 25,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "open_to_play" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"academy_id" varchar NOT NULL,
	"available_from" timestamp NOT NULL,
	"available_until" timestamp NOT NULL,
	"intent" text DEFAULT 'match' NOT NULL,
	"location_id" varchar,
	"location_name" text,
	"message" text,
	"level_range" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "package_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"credits" integer NOT NULL,
	"price" numeric NOT NULL,
	"currency" text DEFAULT 'AED',
	"validity_days" integer DEFAULT 90,
	"session_type" text,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"player_id" varchar,
	"template_id" varchar,
	"name" text,
	"credit_type" text DEFAULT 'group',
	"series_id" varchar,
	"total_credits" integer NOT NULL,
	"remaining_credits" integer NOT NULL,
	"price" numeric,
	"price_per_credit" numeric,
	"currency" text DEFAULT 'AED',
	"purchase_date" timestamp DEFAULT now(),
	"expiry_date" date,
	"invoice_id" varchar,
	"status" text DEFAULT 'active',
	"is_paid" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parent_player_relations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_user_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"relationship" text DEFAULT 'parent',
	"is_primary" boolean DEFAULT true,
	"can_view_invoices" boolean DEFAULT true,
	"can_view_progress" boolean DEFAULT true,
	"can_receive_notifications" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parent_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"invoice_email" text,
	"preferred_language" text DEFAULT 'en',
	"notify_invoice_created" boolean DEFAULT true,
	"notify_payment_reminder" boolean DEFAULT true,
	"notify_payment_overdue" boolean DEFAULT true,
	"notify_payment_confirmed" boolean DEFAULT true,
	"reminder_days_before" integer DEFAULT 3,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "parent_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "payment_reminders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"reminder_type" text NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"status" text DEFAULT 'pending',
	"sent_at" timestamp,
	"notification_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"player_id" varchar,
	"invoice_id" varchar,
	"payer_name" text,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"amount" numeric NOT NULL,
	"currency" text DEFAULT 'AED',
	"status" text DEFAULT 'pending',
	"payment_method" text,
	"payment_date" timestamp DEFAULT now(),
	"received_by" varchar,
	"confirmed_by" varchar,
	"confirmed_at" timestamp,
	"rejected_by" varchar,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"proof_url" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_config" (
	"key" varchar PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "player_badges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"badge_id" varchar NOT NULL,
	"earned_at" timestamp DEFAULT now(),
	"awarded_by" varchar,
	"context" jsonb,
	CONSTRAINT "player_badges_unique" UNIQUE("player_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "player_ball_levels" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"level_id" varchar NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"trial_started_at" timestamp,
	"trial_ends_at" timestamp,
	"trial_from_level_id" varchar,
	"assigned_at" timestamp DEFAULT now(),
	"assigned_by" varchar,
	"previous_level_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_baseline_skill_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baseline_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"pillar" text NOT NULL,
	"skill_category" text NOT NULL,
	"rating" integer,
	"not_observed" boolean DEFAULT false,
	"notes" text,
	"evidence_url" text,
	"coach_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_baselines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"academy_id" varchar,
	"suggested_level_id" varchar,
	"confirmed_level_id" varchar,
	"confidence_score" integer DEFAULT 50,
	"tennis_experience" text,
	"plays_competition" text,
	"can_rally_five" boolean,
	"serve_ability" text,
	"technique_rating" integer,
	"tactical_rating" integer,
	"physical_rating" integer,
	"mental_rating" integer,
	"social_rating" integer,
	"match_rating" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"locked_at" timestamp,
	"locked_by_coach_id" varchar,
	"was_overridden" boolean DEFAULT false,
	"override_reason" text,
	"override_note" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_booking_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"preferred_days" jsonb,
	"preferred_time_windows" jsonb,
	"preferred_surfaces" jsonb,
	"preferred_courts" jsonb,
	"auto_accept_friend_invites" boolean DEFAULT false,
	"open_to_open_matches" boolean DEFAULT true,
	"preferred_match_type" text DEFAULT 'any',
	"notify_on_open_matches" boolean DEFAULT true,
	"notify_on_friend_bookings" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "player_booking_preferences_player_id_unique" UNIQUE("player_id")
);
--> statement-breakpoint
CREATE TABLE "player_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player1_id" varchar NOT NULL,
	"player2_id" varchar NOT NULL,
	"status" text DEFAULT 'pending',
	"matches_played" integer DEFAULT 0,
	"last_played_at" timestamp,
	"connection_type" text,
	"created_at" timestamp DEFAULT now(),
	"accepted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "player_deep_assessments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"skill_id" varchar NOT NULL,
	"score" integer,
	"confidence" text DEFAULT 'medium',
	"notes" text,
	"evidence_url" text,
	"coach_id" varchar,
	"academy_id" varchar,
	"session_id" varchar,
	"previous_score" integer,
	"assessment_count" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "player_deep_assessments_unique" UNIQUE("player_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "player_feature_unlock_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"feature_key" text NOT NULL,
	"unlocked_at_level" integer NOT NULL,
	"onboarding_shown" boolean DEFAULT false,
	"onboarding_shown_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "player_feature_unlock_history_unique" UNIQUE("player_id","feature_key")
);
--> statement-breakpoint
CREATE TABLE "player_feature_unlocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_key" text NOT NULL,
	"required_level" integer DEFAULT 1 NOT NULL,
	"feature_name" text NOT NULL,
	"feature_description" text,
	"feature_icon" text,
	"onboarding_title" text,
	"onboarding_description" text,
	"onboarding_tips" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "player_feature_unlocks_feature_key_unique" UNIQUE("feature_key")
);
--> statement-breakpoint
CREATE TABLE "player_holidays" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"academy_id" varchar NOT NULL,
	"invite_code" varchar(32) NOT NULL,
	"status" text DEFAULT 'pending',
	"claimed_by" varchar,
	"parent_name" text,
	"parent_phone" text,
	"expires_at" timestamp,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "player_invites_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "player_level_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"from_ball_level" text,
	"from_skill_level" integer,
	"to_ball_level" text NOT NULL,
	"to_skill_level" integer NOT NULL,
	"actor_id" varchar,
	"actor_type" text,
	"reason" text,
	"evidence_ids" jsonb,
	"status" text DEFAULT 'applied',
	"approved_by" varchar,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_level_thresholds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" integer NOT NULL,
	"xp_required" integer NOT NULL,
	"title" text NOT NULL,
	"badge_unlock" text,
	"title_unlock" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "player_level_thresholds_level_unique" UNIQUE("level")
);
--> statement-breakpoint
CREATE TABLE "player_level_up_celebrations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"from_level" integer NOT NULL,
	"to_level" integer NOT NULL,
	"new_title" text,
	"xp_bonus_awarded" integer DEFAULT 0,
	"badges_awarded" jsonb DEFAULT '[]'::jsonb,
	"features_unlocked" jsonb DEFAULT '[]'::jsonb,
	"celebration_shown" boolean DEFAULT false,
	"celebration_shown_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_level_xp_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_source" text NOT NULL,
	"xp_amount" integer DEFAULT 10 NOT NULL,
	"description" text,
	"is_one_time" boolean DEFAULT false,
	"cooldown_minutes" integer,
	"max_per_day" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "player_level_xp_rules_action_source_unique" UNIQUE("action_source")
);
--> statement-breakpoint
CREATE TABLE "player_matches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"initiator_id" varchar NOT NULL,
	"receiver_id" varchar,
	"match_type" text NOT NULL,
	"play_type" text NOT NULL,
	"proposed_date" timestamp,
	"proposed_time_slot" text,
	"location_city" text,
	"court_id" varchar,
	"court_booking_id" varchar,
	"status" text DEFAULT 'pending',
	"message" text,
	"responded_at" timestamp,
	"response_message" text,
	"counter_proposed_date" timestamp,
	"counter_proposed_time_slot" text,
	"result_status" text,
	"result_notes" text,
	"xp_awarded" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar,
	"coach_id" varchar,
	"content" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"session_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"type" varchar(50) DEFAULT 'general' NOT NULL,
	"data" json,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_pillar_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"pillar" text NOT NULL,
	"current_score" numeric(4, 2) DEFAULT '0.00',
	"trend" text DEFAULT 'stable',
	"last_session_delta" text,
	"last_updated_at" timestamp DEFAULT now(),
	"last_session_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "player_pillar_progress_unique" UNIQUE("player_id","pillar")
);
--> statement-breakpoint
CREATE TABLE "player_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar,
	"coach_id" varchar,
	"session_id" varchar,
	"skill_area" text NOT NULL,
	"rating" integer,
	"trend" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_progress_flags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"flag_type" text NOT NULL,
	"severity" text DEFAULT 'low',
	"is_active" boolean DEFAULT true,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "player_quests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"quest_template_id" varchar NOT NULL,
	"current_progress" integer DEFAULT 0,
	"target_progress" integer NOT NULL,
	"status" text DEFAULT 'active',
	"assigned_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"claimed_at" timestamp,
	"expires_at" timestamp,
	"streak_day" integer DEFAULT 1,
	"xp_reward" integer,
	"currency_reward" integer
);
--> statement-breakpoint
CREATE TABLE "player_session_cancellations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar,
	"player_id" varchar,
	"academy_id" varchar,
	"session_type" text NOT NULL,
	"cancellation_type" text NOT NULL,
	"reason" text NOT NULL,
	"reason_text" text,
	"cancelled_at" timestamp DEFAULT now(),
	"session_date" timestamp NOT NULL,
	"hours_before_session" integer,
	"is_late_cancel" boolean DEFAULT false,
	"billing_status" text DEFAULT 'pending',
	"make_up_eligibility" text DEFAULT 'not_eligible',
	"make_up_session_id" varchar,
	"make_up_granted_by" varchar,
	"make_up_granted_at" timestamp,
	"notified_coach" boolean DEFAULT false,
	"coach_notified_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_skill_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"skill_id" varchar NOT NULL,
	"score" integer NOT NULL,
	"session_id" varchar,
	"coach_id" varchar,
	"moving_average" numeric(4, 2),
	"observation_count" integer DEFAULT 1,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_skill_state" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"domain_id" varchar NOT NULL,
	"progress_value" integer DEFAULT 0 NOT NULL,
	"trend" text DEFAULT 'stable',
	"momentum" text DEFAULT 'building',
	"confidence_score" integer DEFAULT 50,
	"assessment_status" text,
	"last_assessment_date" timestamp,
	"last_up_date" timestamp,
	"up_count_recent" integer DEFAULT 0,
	"down_count_recent" integer DEFAULT 0,
	"is_frozen" boolean DEFAULT false,
	"freeze_reason" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"plan_name" text NOT NULL,
	"price" numeric NOT NULL,
	"currency" text DEFAULT 'AED',
	"billing_period" text DEFAULT 'monthly',
	"sessions_per_period" integer,
	"status" text DEFAULT 'active',
	"start_date" date NOT NULL,
	"end_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_titles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"title_id" varchar NOT NULL,
	"unlocked_at" timestamp DEFAULT now(),
	"is_equipped" boolean DEFAULT false,
	CONSTRAINT "player_titles_unique" UNIQUE("player_id","title_id")
);
--> statement-breakpoint
CREATE TABLE "player_xp_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"action_source" text NOT NULL,
	"xp_amount" integer NOT NULL,
	"context_type" text,
	"context_id" varchar,
	"level_at_event" integer NOT NULL,
	"xp_before_event" integer NOT NULL,
	"xp_after_event" integer NOT NULL,
	"triggered_level_up" boolean DEFAULT false,
	"new_level" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"coach_id" varchar,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"tshirt_size" text,
	"height" integer,
	"age" integer,
	"date_of_birth" text,
	"ball_level" text,
	"skill_level" integer,
	"membership_type" text,
	"medical_notes" text,
	"total_xp" integer DEFAULT 0,
	"level" integer DEFAULT 1,
	"glow_score" integer DEFAULT 0,
	"streak" integer DEFAULT 0,
	"glow_battle_power" integer DEFAULT 0,
	"glow_mmr" integer DEFAULT 1000,
	"glow_rank" integer DEFAULT 9,
	"total_matches_played" integer DEFAULT 0,
	"rage_quit_count" integer DEFAULT 0,
	"no_show_count" integer DEFAULT 0,
	"is_adult" boolean DEFAULT false,
	"player_pathway" text DEFAULT 'youth',
	"onboarding_completed" boolean DEFAULT false,
	"motivation_type" text,
	"experience_level" text,
	"dominant_hand" text,
	"backhand_type" text,
	"enjoyment_tags" jsonb,
	"focus_goals" jsonb,
	"self_confidence_flags" jsonb,
	"parent_email" text,
	"chat_enabled" boolean,
	"community_enabled" boolean,
	"profile_photo_url" text,
	"display_name" text,
	"preferred_play_type" text,
	"open_to_play" boolean DEFAULT false,
	"typical_play_times" jsonb,
	"preferred_cities" jsonb,
	"match_preference" text,
	"privacy_level" text DEFAULT 'platform',
	"bio" text,
	"last_active_at" timestamp,
	"preferred_time" text,
	"status" text DEFAULT 'active',
	"tennis_idol" text,
	"favorite_shot" text,
	"short_term_goal" text,
	"long_term_dream" text,
	"weekly_commitment" text,
	"nickname" text,
	"quiz_score" integer,
	"audit_verified_at" timestamp,
	"audit_verified_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "post_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar NOT NULL,
	"author_id" varchar NOT NULL,
	"is_quick_comment" boolean DEFAULT false,
	"quick_comment_type" text,
	"text" text,
	"parent_id" varchar,
	"is_hidden" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "post_reactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"reaction_type" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" varchar NOT NULL,
	"academy_id" varchar NOT NULL,
	"context_type" text NOT NULL,
	"context_id" varchar,
	"caption" text,
	"media_urls" jsonb DEFAULT '[]'::jsonb,
	"media_types" jsonb DEFAULT '[]'::jsonb,
	"visibility" text DEFAULT 'academy' NOT NULL,
	"group_id" varchar,
	"tagged_user_ids" jsonb DEFAULT '[]'::jsonb,
	"location_name" text,
	"cheer_count" integer DEFAULT 0,
	"comment_count" integer DEFAULT 0,
	"is_hidden" boolean DEFAULT false,
	"is_pinned" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pressure_moments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" varchar NOT NULL,
	"moment_type" text NOT NULL,
	"set_number" integer,
	"game_score" text,
	"point_score" text,
	"outcome" text NOT NULL,
	"confidence_level" integer,
	"error_increase" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "push_device_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"coach_id" varchar,
	"player_id" varchar,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"device_name" text,
	"is_active" boolean DEFAULT true,
	"last_used_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quest_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon_name" text NOT NULL,
	"icon_color" text DEFAULT '#00D9FF',
	"quest_type" text DEFAULT 'daily' NOT NULL,
	"category" text DEFAULT 'training',
	"target_action" text NOT NULL,
	"target_count" integer DEFAULT 1 NOT NULL,
	"target_metadata" jsonb,
	"xp_reward" integer DEFAULT 50,
	"currency_reward" integer DEFAULT 0,
	"badge_id" varchar,
	"difficulty" text DEFAULT 'easy',
	"order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recurring_series" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"coach_id" varchar,
	"court_id" varchar,
	"location_id" varchar,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"duration" integer NOT NULL,
	"session_type" text NOT NULL,
	"ball_level" text,
	"skill_level" integer,
	"week_count" integer NOT NULL,
	"series_start_date" date NOT NULL,
	"series_end_date" date,
	"price" numeric,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" varchar NOT NULL,
	"stripe_refund_id" text,
	"amount" numeric NOT NULL,
	"reason" text,
	"notes" text,
	"status" text DEFAULT 'pending',
	"processed_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "review_flags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" varchar NOT NULL,
	"flagged_by" varchar NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'pending',
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"action_taken" text,
	"internal_note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "review_prompts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"coach_id" varchar NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_at" timestamp NOT NULL,
	"status" text DEFAULT 'pending',
	"shown_at" timestamp,
	"completed_at" timestamp,
	"dismissed_at" timestamp,
	"review_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "review_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" varchar NOT NULL,
	"coach_id" varchar NOT NULL,
	"response_text" text NOT NULL,
	"is_hidden" boolean DEFAULT false,
	"hidden_reason" text,
	"hidden_by" varchar,
	"hidden_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "review_responses_review_id_unique" UNIQUE("review_id")
);
--> statement-breakpoint
CREATE TABLE "role_message_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"template_key" text NOT NULL,
	"coach_message" text NOT NULL,
	"player_message" text NOT NULL,
	"parent_message" text NOT NULL,
	"placeholders" jsonb DEFAULT '[]'::jsonb,
	"category" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "role_message_templates_unique" UNIQUE("academy_id","template_key")
);
--> statement-breakpoint
CREATE TABLE "scheduled_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"type" text NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb,
	"status" text DEFAULT 'pending',
	"sent_at" timestamp,
	"error" text,
	"related_entity_type" text,
	"related_entity_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "seller_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"display_name" text,
	"bio" text,
	"is_verified" boolean DEFAULT false,
	"verification_level" text DEFAULT 'none',
	"verified_at" timestamp,
	"total_sales" integer DEFAULT 0,
	"total_listings" integer DEFAULT 0,
	"average_rating" numeric(3, 2),
	"response_rate" integer,
	"response_time" text,
	"joined_marketplace_at" timestamp DEFAULT now(),
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "seller_profiles_player_id_unique" UNIQUE("player_id")
);
--> statement-breakpoint
CREATE TABLE "series_players" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"status" text DEFAULT 'active',
	"joined_at" timestamp DEFAULT now(),
	"left_at" timestamp,
	"pause_from" date,
	"pause_until" date,
	"pause_reason" text,
	"sessions_attended" integer DEFAULT 0,
	"total_xp_earned" integer DEFAULT 0,
	"linked_package_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_feedback" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar,
	"intensity" text,
	"mood" text,
	"focus_tags" text,
	"coach_notes" text
);
--> statement-breakpoint
CREATE TABLE "session_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"template_id" varchar,
	"status" text DEFAULT 'draft' NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"current_block_index" integer DEFAULT 0,
	"coach_notes" text,
	"generated_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "session_plans_session_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "session_players" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar,
	"player_id" varchar,
	"attendance_status" text,
	"late_minutes" integer,
	"absence_reason" text,
	"is_guest" boolean DEFAULT false,
	"xp_awarded" integer,
	"notes" text,
	"credit_deducted_at" timestamp,
	"credit_transaction_id" varchar
);
--> statement-breakpoint
CREATE TABLE "session_skill_feedback" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"coach_id" varchar NOT NULL,
	"effort" integer NOT NULL,
	"execution" integer NOT NULL,
	"understanding" integer NOT NULL,
	"overall" text NOT NULL,
	"technique_pillar" integer,
	"tactical_pillar" integer,
	"physical_pillar" integer,
	"mental_pillar" integer,
	"social_pillar" integer,
	"match_pillar" integer,
	"skill_ratings" jsonb,
	"trial_ready" boolean DEFAULT false,
	"note" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "session_skill_feedback_unique" UNIQUE("session_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "session_skill_observations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"coach_id" varchar NOT NULL,
	"domain_id" varchar NOT NULL,
	"direction" text NOT NULL,
	"effort_level" text NOT NULL,
	"note" text,
	"raw_delta" integer,
	"applied_delta" integer,
	"was_down_guarded" boolean DEFAULT false,
	"was_cooldown_applied" boolean DEFAULT false,
	"diminishing_return_factor" numeric,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar,
	"name" text NOT NULL,
	"session_type" text NOT NULL,
	"duration" integer NOT NULL,
	"ball_level" text,
	"skill_level" integer,
	"default_player_ids" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_waitlist" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"position" integer NOT NULL,
	"xp_bonus_on_join" integer DEFAULT 5,
	"status" text DEFAULT 'waiting',
	"promoted_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"coach_id" varchar,
	"court_id" varchar,
	"location_id" varchar,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"duration" integer NOT NULL,
	"session_type" text NOT NULL,
	"ball_level" text,
	"skill_level" integer,
	"title" text,
	"max_players" integer DEFAULT 6,
	"xp_reward" integer DEFAULT 20,
	"vibe" text DEFAULT 'casual',
	"min_level" integer,
	"max_level" integer,
	"is_recurring" boolean DEFAULT false,
	"recurring_group_id" varchar,
	"series_id" varchar,
	"week_number" integer,
	"week_count" integer,
	"is_modified_from_series" boolean DEFAULT false,
	"is_skipped" boolean DEFAULT false,
	"skip_reason" text,
	"travel_time" integer DEFAULT 0,
	"payment_status" text DEFAULT 'unpaid',
	"price" numeric,
	"academy_price" numeric,
	"coach_payout" numeric,
	"academy_margin" numeric,
	"pricing_currency" text DEFAULT 'AED',
	"status" text DEFAULT 'scheduled',
	"cancelled_at" timestamp,
	"cancelled_by" varchar,
	"cancellation_reason" text,
	"is_last_minute_cancellation" boolean DEFAULT false,
	"cancellation_charged" boolean DEFAULT false,
	"cancellation_charge_amount" numeric,
	"google_calendar_event_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shop_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon_name" text DEFAULT 'pricetag',
	"icon_color" text DEFAULT '#00D9FF',
	"order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"is_featured" boolean DEFAULT false,
	"type" text DEFAULT 'product',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "shop_categories_slug_unique" UNIQUE("academy_id","slug")
);
--> statement-breakpoint
CREATE TABLE "shop_order_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"product_id" varchar,
	"service_id" varchar,
	"item_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"quantity" integer DEFAULT 1,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"variant_id" text,
	"variant_name" text,
	"service_details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shop_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"player_id" varchar,
	"user_id" varchar,
	"order_number" text NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"tax" numeric(10, 2) DEFAULT '0',
	"discount" numeric(10, 2) DEFAULT '0',
	"total" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'AED',
	"status" text DEFAULT 'pending',
	"payment_status" text DEFAULT 'pending',
	"payment_method" text,
	"stripe_payment_intent_id" text,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"notes" text,
	"scheduled_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	CONSTRAINT "shop_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "shop_products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"category_id" varchar,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"short_description" text,
	"price" numeric(10, 2) NOT NULL,
	"compare_at_price" numeric(10, 2),
	"currency" text DEFAULT 'AED',
	"sku" text,
	"stock_quantity" integer DEFAULT 0,
	"track_inventory" boolean DEFAULT true,
	"allow_backorder" boolean DEFAULT false,
	"image_url" text,
	"images" jsonb DEFAULT '[]'::jsonb,
	"has_variants" boolean DEFAULT false,
	"variants" jsonb,
	"is_featured" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"order" integer DEFAULT 0,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "shop_products_slug_unique" UNIQUE("academy_id","slug")
);
--> statement-breakpoint
CREATE TABLE "shop_services" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"category_id" varchar,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"short_description" text,
	"price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'AED',
	"duration_minutes" integer,
	"requires_booking" boolean DEFAULT true,
	"is_stringing_service" boolean DEFAULT false,
	"stringing_options" jsonb,
	"image_url" text,
	"icon_name" text DEFAULT 'build',
	"is_featured" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"order" integer DEFAULT 0,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "shop_services_slug_unique" UNIQUE("academy_id","slug")
);
--> statement-breakpoint
CREATE TABLE "shop_wishlist" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"product_id" varchar,
	"service_id" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "shop_wishlist_unique_product" UNIQUE("player_id","product_id"),
	CONSTRAINT "shop_wishlist_unique_service" UNIQUE("player_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "skill_domains" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0,
	CONSTRAINT "skill_domains_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "skill_evidence" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"skill_id" varchar NOT NULL,
	"session_id" varchar,
	"trial_id" varchar,
	"video_url" text NOT NULL,
	"thumbnail_url" text,
	"duration_seconds" integer NOT NULL,
	"capture_type" text NOT NULL,
	"skill_score" integer,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_score" integer,
	"review_notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"captured_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "skill_rubrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" varchar NOT NULL,
	"score" integer NOT NULL,
	"observable" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "skill_rubrics_skill_score" UNIQUE("skill_id","score")
);
--> statement-breakpoint
CREATE TABLE "spotlight_monthly_winners" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"total_weekly_wins" integer DEFAULT 0 NOT NULL,
	"total_votes_all_weeks" integer DEFAULT 0 NOT NULL,
	"xp_awarded" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "spotlight_monthly_unique" UNIQUE("academy_id","month","year")
);
--> statement-breakpoint
CREATE TABLE "spotlight_nominations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"nominator_player_id" varchar NOT NULL,
	"nominated_player_id" varchar NOT NULL,
	"reason" text NOT NULL,
	"week_start" date NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "spotlight_nom_unique_vote" UNIQUE("nominator_player_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "spotlight_weekly_winners" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"week_start" date NOT NULL,
	"total_votes" integer DEFAULT 0 NOT NULL,
	"top_reason" text,
	"xp_awarded" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "spotlight_weekly_unique" UNIQUE("academy_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "squad_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"role" text DEFAULT 'member',
	"joined_at" timestamp DEFAULT now(),
	"xp_contributed" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "squads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"badge" text,
	"total_xp" integer DEFAULT 0,
	"week_streak" integer DEFAULT 0,
	"max_members" integer DEFAULT 8,
	"is_public" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"stripe_price_id" text,
	"monthly_price" numeric NOT NULL,
	"yearly_price" numeric,
	"currency" text DEFAULT 'USD',
	"max_coaches" integer DEFAULT 1,
	"max_players" integer DEFAULT 50,
	"max_locations" integer DEFAULT 1,
	"features" jsonb,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'active',
	"billing_period" text DEFAULT 'monthly',
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"trial_ends_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "titles" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"rarity" text DEFAULT 'common',
	"unlock_criteria" jsonb,
	"order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_social_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"display_name" text,
	"bio" text,
	"avatar_url" text,
	"cover_url" text,
	"title" text,
	"title_unlocked_at" timestamp,
	"featured_badges" jsonb DEFAULT '[]'::jsonb,
	"post_count" integer DEFAULT 0,
	"cheer_count" integer DEFAULT 0,
	"connection_count" integer DEFAULT 0,
	"profile_visibility" text DEFAULT 'academy',
	"show_glow_score" boolean DEFAULT true,
	"show_level" boolean DEFAULT true,
	"allow_dms" text DEFAULT 'connections',
	"is_kid_profile" boolean DEFAULT false,
	"parent_approved_dms" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_social_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'coach' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"academy_id" varchar,
	"coach_id" varchar,
	"player_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"last_login_at" timestamp,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "xp_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"session_id" varchar,
	"xp_amount" integer NOT NULL,
	"source" text NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "academy_invites" ADD CONSTRAINT "academy_invites_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_invites" ADD CONSTRAINT "academy_invites_invited_by_coaches_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_invites" ADD CONSTRAINT "academy_invites_accepted_by_coaches_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_owner_profiles" ADD CONSTRAINT "academy_owner_profiles_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_pricing" ADD CONSTRAINT "academy_pricing_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_settings" ADD CONSTRAINT "academy_settings_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_transfer_requests" ADD CONSTRAINT "academy_transfer_requests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_transfer_requests" ADD CONSTRAINT "academy_transfer_requests_from_academy_id_academies_id_fk" FOREIGN KEY ("from_academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_transfer_requests" ADD CONSTRAINT "academy_transfer_requests_to_academy_id_academies_id_fk" FOREIGN KEY ("to_academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adult_glow_matches" ADD CONSTRAINT "adult_glow_matches_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adult_glow_matches" ADD CONSTRAINT "adult_glow_matches_opponent_id_players_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adult_skill_assessments" ADD CONSTRAINT "adult_skill_assessments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adult_skill_assessments" ADD CONSTRAINT "adult_skill_assessments_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_invite_guests" ADD CONSTRAINT "booking_invite_guests_invite_id_booking_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."booking_invites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_invite_guests" ADD CONSTRAINT "booking_invite_guests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_invites" ADD CONSTRAINT "booking_invites_booking_id_court_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."court_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_invites" ADD CONSTRAINT "booking_invites_host_player_id_players_id_fk" FOREIGN KEY ("host_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_responded_by_coaches_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_academy_memberships" ADD CONSTRAINT "coach_academy_memberships_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_academy_memberships" ADD CONSTRAINT "coach_academy_memberships_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_availability" ADD CONSTRAINT "coach_availability_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_availability" ADD CONSTRAINT "coach_availability_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_availability" ADD CONSTRAINT "coach_availability_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_availability" ADD CONSTRAINT "coach_availability_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_calibration" ADD CONSTRAINT "coach_calibration_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_contracts" ADD CONSTRAINT "coach_contracts_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_contracts" ADD CONSTRAINT "coach_contracts_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_court_preferences" ADD CONSTRAINT "coach_court_preferences_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_court_preferences" ADD CONSTRAINT "coach_court_preferences_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_court_rules" ADD CONSTRAINT "coach_court_rules_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_earnings" ADD CONSTRAINT "coach_earnings_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_earnings" ADD CONSTRAINT "coach_earnings_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_earnings" ADD CONSTRAINT "coach_earnings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_freelance_profiles" ADD CONSTRAINT "coach_freelance_profiles_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_freelance_profiles" ADD CONSTRAINT "coach_freelance_profiles_freelance_academy_id_academies_id_fk" FOREIGN KEY ("freelance_academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_invitations" ADD CONSTRAINT "coach_invitations_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_invitations" ADD CONSTRAINT "coach_invitations_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_invitations" ADD CONSTRAINT "coach_invitations_invited_by_coaches_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_match_reviews" ADD CONSTRAINT "coach_match_reviews_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_match_reviews" ADD CONSTRAINT "coach_match_reviews_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_match_reviews" ADD CONSTRAINT "coach_match_reviews_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_notifications" ADD CONSTRAINT "coach_notifications_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_payment_rules" ADD CONSTRAINT "coach_payment_rules_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_payment_rules" ADD CONSTRAINT "coach_payment_rules_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_payouts" ADD CONSTRAINT "coach_payouts_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_payouts" ADD CONSTRAINT "coach_payouts_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_payouts" ADD CONSTRAINT "coach_payouts_paid_by_coaches_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_review_stats" ADD CONSTRAINT "coach_review_stats_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_reviews" ADD CONSTRAINT "coach_reviews_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_reviews" ADD CONSTRAINT "coach_reviews_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_reviews" ADD CONSTRAINT "coach_reviews_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_settings" ADD CONSTRAINT "coach_settings_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_stats_rollup" ADD CONSTRAINT "coach_stats_rollup_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_time_blocks" ADD CONSTRAINT "coach_time_blocks_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_time_blocks" ADD CONSTRAINT "coach_time_blocks_source_academy_id_academies_id_fk" FOREIGN KEY ("source_academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_wellness_logs" ADD CONSTRAINT "coach_wellness_logs_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_wellness_logs" ADD CONSTRAINT "coach_wellness_logs_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_xp_transactions" ADD CONSTRAINT "coach_xp_transactions_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_xp_transactions" ADD CONSTRAINT "coach_xp_transactions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_series" ADD CONSTRAINT "coaching_series_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_series" ADD CONSTRAINT "coaching_series_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_series" ADD CONSTRAINT "coaching_series_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_series" ADD CONSTRAINT "coaching_series_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_post_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_series_id_coaching_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."coaching_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_availability" ADD CONSTRAINT "court_availability_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_availability" ADD CONSTRAINT "court_availability_blocked_by_users_id_fk" FOREIGN KEY ("blocked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_availability_snapshots" ADD CONSTRAINT "court_availability_snapshots_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_bookings" ADD CONSTRAINT "court_bookings_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courts" ADD CONSTRAINT "courts_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courts" ADD CONSTRAINT "courts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_session_player_id_session_players_id_fk" FOREIGN KEY ("session_player_id") REFERENCES "public"."session_players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_quest_slots" ADD CONSTRAINT "daily_quest_slots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_quest_slots" ADD CONSTRAINT "daily_quest_slots_quest_1_id_player_quests_id_fk" FOREIGN KEY ("quest_1_id") REFERENCES "public"."player_quests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_quest_slots" ADD CONSTRAINT "daily_quest_slots_quest_2_id_player_quests_id_fk" FOREIGN KEY ("quest_2_id") REFERENCES "public"."player_quests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_quest_slots" ADD CONSTRAINT "daily_quest_slots_quest_3_id_player_quests_id_fk" FOREIGN KEY ("quest_3_id") REFERENCES "public"."player_quests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_quest_slots" ADD CONSTRAINT "daily_quest_slots_bonus_quest_id_player_quests_id_fk" FOREIGN KEY ("bonus_quest_id") REFERENCES "public"."player_quests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_assessment_pillar_summaries" ADD CONSTRAINT "deep_assessment_pillar_summaries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_reports" ADD CONSTRAINT "diagnostic_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_reports" ADD CONSTRAINT "diagnostic_reports_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_reports" ADD CONSTRAINT "diagnostic_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_assessments" ADD CONSTRAINT "domain_assessments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_assessments" ADD CONSTRAINT "domain_assessments_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_assessments" ADD CONSTRAINT "domain_assessments_domain_id_skill_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."skill_domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_blocks" ADD CONSTRAINT "drill_blocks_template_id_lesson_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."lesson_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_community_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."community_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_session_feedback" ADD CONSTRAINT "in_session_feedback_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_session_feedback" ADD CONSTRAINT "in_session_feedback_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_session_feedback" ADD CONSTRAINT "in_session_feedback_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_group_members" ADD CONSTRAINT "lesson_group_members_group_id_lesson_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."lesson_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_group_members" ADD CONSTRAINT "lesson_group_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_groups" ADD CONSTRAINT "lesson_groups_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_groups" ADD CONSTRAINT "lesson_groups_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_templates" ADD CONSTRAINT "lesson_templates_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_templates" ADD CONSTRAINT "lesson_templates_level_id_ball_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."ball_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_templates" ADD CONSTRAINT "lesson_templates_created_by_coaches_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_requirements" ADD CONSTRAINT "level_requirements_domain_id_skill_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."skill_domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_skills" ADD CONSTRAINT "level_skills_level_id_ball_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."ball_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_skills" ADD CONSTRAINT "level_skills_skill_id_glow_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."glow_skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_tests" ADD CONSTRAINT "level_tests_level_id_ball_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."ball_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_trials" ADD CONSTRAINT "level_trials_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_trials" ADD CONSTRAINT "level_trials_from_level_id_ball_levels_id_fk" FOREIGN KEY ("from_level_id") REFERENCES "public"."ball_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_trials" ADD CONSTRAINT "level_trials_to_level_id_ball_levels_id_fk" FOREIGN KEY ("to_level_id") REFERENCES "public"."ball_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_trials" ADD CONSTRAINT "level_trials_evaluated_by_coaches_id_fk" FOREIGN KEY ("evaluated_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_up_events" ADD CONSTRAINT "level_up_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_up_events" ADD CONSTRAINT "level_up_events_from_level_id_ball_levels_id_fk" FOREIGN KEY ("from_level_id") REFERENCES "public"."ball_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_up_events" ADD CONSTRAINT "level_up_events_to_level_id_ball_levels_id_fk" FOREIGN KEY ("to_level_id") REFERENCES "public"."ball_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_up_events" ADD CONSTRAINT "level_up_events_trial_id_level_trials_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."level_trials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_up_events" ADD CONSTRAINT "level_up_events_promoted_by_coaches_id_fk" FOREIGN KEY ("promoted_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_travel_times" ADD CONSTRAINT "location_travel_times_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_travel_times" ADD CONSTRAINT "location_travel_times_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_travel_times" ADD CONSTRAINT "location_travel_times_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_travel_times" ADD CONSTRAINT "location_travel_times_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_favorites" ADD CONSTRAINT "marketplace_favorites_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_favorites" ADD CONSTRAINT "marketplace_favorites_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_seller_id_players_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_sender_id_players_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_recipient_id_players_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_opponent_player_id_players_id_fk" FOREIGN KEY ("opponent_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_opponents" ADD CONSTRAINT "match_opponents_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_pillar_scores" ADD CONSTRAINT "match_pillar_scores_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_pillar_scores" ADD CONSTRAINT "match_pillar_scores_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_pillar_scores" ADD CONSTRAINT "match_pillar_scores_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_plans" ADD CONSTRAINT "match_plans_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_plans" ADD CONSTRAINT "match_plans_opponent_id_match_opponents_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."match_opponents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_reflections" ADD CONSTRAINT "match_reflections_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_reflections" ADD CONSTRAINT "match_reflections_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_requests" ADD CONSTRAINT "match_requests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_requests" ADD CONSTRAINT "match_requests_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_requests" ADD CONSTRAINT "match_requests_invited_player_id_players_id_fk" FOREIGN KEY ("invited_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_requests" ADD CONSTRAINT "match_requests_matched_with_player_id_players_id_fk" FOREIGN KEY ("matched_with_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_training_suggestions" ADD CONSTRAINT "match_training_suggestions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_training_suggestions" ADD CONSTRAINT "match_training_suggestions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_opponent_id_match_opponents_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."match_opponents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_plan_id_match_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."match_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_verified_by_coaches_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_reactor_coach_id_coaches_id_fk" FOREIGN KEY ("reactor_coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_reactor_player_id_players_id_fk" FOREIGN KEY ("reactor_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_coach_id_coaches_id_fk" FOREIGN KEY ("sender_coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_player_id_players_id_fk" FOREIGN KEY ("sender_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_match_slots" ADD CONSTRAINT "open_match_slots_match_id_open_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."open_matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_match_slots" ADD CONSTRAINT "open_match_slots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_matches" ADD CONSTRAINT "open_matches_booking_id_court_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."court_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_matches" ADD CONSTRAINT "open_matches_host_player_id_players_id_fk" FOREIGN KEY ("host_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_matches" ADD CONSTRAINT "open_matches_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_to_play" ADD CONSTRAINT "open_to_play_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_to_play" ADD CONSTRAINT "open_to_play_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_to_play" ADD CONSTRAINT "open_to_play_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_templates" ADD CONSTRAINT "package_templates_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_template_id_package_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."package_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_player_relations" ADD CONSTRAINT "parent_player_relations_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_player_relations" ADD CONSTRAINT "parent_player_relations_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_settings" ADD CONSTRAINT "parent_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_coaches_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_coaches_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_rejected_by_coaches_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_awarded_by_users_id_fk" FOREIGN KEY ("awarded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ball_levels" ADD CONSTRAINT "player_ball_levels_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ball_levels" ADD CONSTRAINT "player_ball_levels_level_id_ball_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."ball_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ball_levels" ADD CONSTRAINT "player_ball_levels_trial_from_level_id_ball_levels_id_fk" FOREIGN KEY ("trial_from_level_id") REFERENCES "public"."ball_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ball_levels" ADD CONSTRAINT "player_ball_levels_previous_level_id_ball_levels_id_fk" FOREIGN KEY ("previous_level_id") REFERENCES "public"."ball_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_baseline_skill_scores" ADD CONSTRAINT "player_baseline_skill_scores_baseline_id_player_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."player_baselines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_baseline_skill_scores" ADD CONSTRAINT "player_baseline_skill_scores_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_baseline_skill_scores" ADD CONSTRAINT "player_baseline_skill_scores_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_baselines" ADD CONSTRAINT "player_baselines_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_baselines" ADD CONSTRAINT "player_baselines_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_baselines" ADD CONSTRAINT "player_baselines_suggested_level_id_ball_levels_id_fk" FOREIGN KEY ("suggested_level_id") REFERENCES "public"."ball_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_baselines" ADD CONSTRAINT "player_baselines_confirmed_level_id_ball_levels_id_fk" FOREIGN KEY ("confirmed_level_id") REFERENCES "public"."ball_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_baselines" ADD CONSTRAINT "player_baselines_locked_by_coach_id_coaches_id_fk" FOREIGN KEY ("locked_by_coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_booking_preferences" ADD CONSTRAINT "player_booking_preferences_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_connections" ADD CONSTRAINT "player_connections_player1_id_players_id_fk" FOREIGN KEY ("player1_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_connections" ADD CONSTRAINT "player_connections_player2_id_players_id_fk" FOREIGN KEY ("player2_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_deep_assessments" ADD CONSTRAINT "player_deep_assessments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_deep_assessments" ADD CONSTRAINT "player_deep_assessments_skill_id_deep_assessment_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."deep_assessment_skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_deep_assessments" ADD CONSTRAINT "player_deep_assessments_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_deep_assessments" ADD CONSTRAINT "player_deep_assessments_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_deep_assessments" ADD CONSTRAINT "player_deep_assessments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_feature_unlock_history" ADD CONSTRAINT "player_feature_unlock_history_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_holidays" ADD CONSTRAINT "player_holidays_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_invites" ADD CONSTRAINT "player_invites_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_invites" ADD CONSTRAINT "player_invites_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_invites" ADD CONSTRAINT "player_invites_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_level_events" ADD CONSTRAINT "player_level_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_level_up_celebrations" ADD CONSTRAINT "player_level_up_celebrations_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_matches" ADD CONSTRAINT "player_matches_initiator_id_players_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_matches" ADD CONSTRAINT "player_matches_receiver_id_players_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_matches" ADD CONSTRAINT "player_matches_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_matches" ADD CONSTRAINT "player_matches_court_booking_id_court_bookings_id_fk" FOREIGN KEY ("court_booking_id") REFERENCES "public"."court_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_notes" ADD CONSTRAINT "player_notes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_notes" ADD CONSTRAINT "player_notes_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_notes" ADD CONSTRAINT "player_notes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_pillar_progress" ADD CONSTRAINT "player_pillar_progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_pillar_progress" ADD CONSTRAINT "player_pillar_progress_last_session_id_sessions_id_fk" FOREIGN KEY ("last_session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_progress_flags" ADD CONSTRAINT "player_progress_flags_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_quest_template_id_quest_templates_id_fk" FOREIGN KEY ("quest_template_id") REFERENCES "public"."quest_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_session_cancellations" ADD CONSTRAINT "player_session_cancellations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_session_cancellations" ADD CONSTRAINT "player_session_cancellations_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_session_cancellations" ADD CONSTRAINT "player_session_cancellations_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_skill_scores" ADD CONSTRAINT "player_skill_scores_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_skill_scores" ADD CONSTRAINT "player_skill_scores_skill_id_glow_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."glow_skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_skill_scores" ADD CONSTRAINT "player_skill_scores_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_skill_scores" ADD CONSTRAINT "player_skill_scores_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_skill_state" ADD CONSTRAINT "player_skill_state_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_skill_state" ADD CONSTRAINT "player_skill_state_domain_id_skill_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."skill_domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_subscriptions" ADD CONSTRAINT "player_subscriptions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_subscriptions" ADD CONSTRAINT "player_subscriptions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_titles" ADD CONSTRAINT "player_titles_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_titles" ADD CONSTRAINT "player_titles_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_xp_events" ADD CONSTRAINT "player_xp_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_id_post_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."post_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_group_id_community_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."community_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pressure_moments" ADD CONSTRAINT "pressure_moments_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_device_tokens" ADD CONSTRAINT "push_device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_device_tokens" ADD CONSTRAINT "push_device_tokens_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_device_tokens" ADD CONSTRAINT "push_device_tokens_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_templates" ADD CONSTRAINT "quest_templates_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processed_by_coaches_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_review_id_coach_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."coach_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_flagged_by_users_id_fk" FOREIGN KEY ("flagged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_prompts" ADD CONSTRAINT "review_prompts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_prompts" ADD CONSTRAINT "review_prompts_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_prompts" ADD CONSTRAINT "review_prompts_review_id_coach_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."coach_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_review_id_coach_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."coach_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_message_templates" ADD CONSTRAINT "role_message_templates_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_players" ADD CONSTRAINT "series_players_series_id_coaching_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."coaching_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_players" ADD CONSTRAINT "series_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_players" ADD CONSTRAINT "series_players_linked_package_id_packages_id_fk" FOREIGN KEY ("linked_package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_template_id_lesson_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."lesson_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_generated_by_coaches_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_players" ADD CONSTRAINT "session_players_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_players" ADD CONSTRAINT "session_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_skill_feedback" ADD CONSTRAINT "session_skill_feedback_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_skill_feedback" ADD CONSTRAINT "session_skill_feedback_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_skill_feedback" ADD CONSTRAINT "session_skill_feedback_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_skill_observations" ADD CONSTRAINT "session_skill_observations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_skill_observations" ADD CONSTRAINT "session_skill_observations_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_skill_observations" ADD CONSTRAINT "session_skill_observations_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_skill_observations" ADD CONSTRAINT "session_skill_observations_domain_id_skill_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."skill_domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_templates" ADD CONSTRAINT "session_templates_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_waitlist" ADD CONSTRAINT "session_waitlist_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_waitlist" ADD CONSTRAINT "session_waitlist_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_categories" ADD CONSTRAINT "shop_categories_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_product_id_shop_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shop_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_service_id_shop_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."shop_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_category_id_shop_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."shop_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_services" ADD CONSTRAINT "shop_services_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_services" ADD CONSTRAINT "shop_services_category_id_shop_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."shop_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_wishlist" ADD CONSTRAINT "shop_wishlist_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_wishlist" ADD CONSTRAINT "shop_wishlist_product_id_shop_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shop_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_wishlist" ADD CONSTRAINT "shop_wishlist_service_id_shop_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."shop_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_skill_id_glow_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."glow_skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_trial_id_level_trials_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."level_trials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_reviewed_by_coaches_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_captured_by_coaches_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_rubrics" ADD CONSTRAINT "skill_rubrics_skill_id_glow_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."glow_skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_monthly_winners" ADD CONSTRAINT "spotlight_monthly_winners_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_monthly_winners" ADD CONSTRAINT "spotlight_monthly_winners_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_nominations" ADD CONSTRAINT "spotlight_nominations_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_nominations" ADD CONSTRAINT "spotlight_nominations_nominator_player_id_players_id_fk" FOREIGN KEY ("nominator_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_nominations" ADD CONSTRAINT "spotlight_nominations_nominated_player_id_players_id_fk" FOREIGN KEY ("nominated_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_weekly_winners" ADD CONSTRAINT "spotlight_weekly_winners_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_weekly_winners" ADD CONSTRAINT "spotlight_weekly_winners_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_members" ADD CONSTRAINT "squad_members_squad_id_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_members" ADD CONSTRAINT "squad_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squads" ADD CONSTRAINT "squads_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_social_profiles" ADD CONSTRAINT "user_social_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academy_pricing_academy_idx" ON "academy_pricing" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "academy_pricing_type_idx" ON "academy_pricing" USING btree ("session_type");--> statement-breakpoint
CREATE INDEX "academy_pricing_active_idx" ON "academy_pricing" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "adult_glow_matches_player_idx" ON "adult_glow_matches" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "adult_glow_matches_opponent_idx" ON "adult_glow_matches" USING btree ("opponent_id");--> statement-breakpoint
CREATE INDEX "adult_glow_matches_date_idx" ON "adult_glow_matches" USING btree ("match_date");--> statement-breakpoint
CREATE INDEX "adult_skill_assessments_player_idx" ON "adult_skill_assessments" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "adult_skill_assessments_skill_idx" ON "adult_skill_assessments" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "booking_invite_guests_invite_idx" ON "booking_invite_guests" USING btree ("invite_id");--> statement-breakpoint
CREATE INDEX "booking_invite_guests_player_idx" ON "booking_invite_guests" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "booking_invite_guests_status_idx" ON "booking_invite_guests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "booking_invites_booking_idx" ON "booking_invites" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_invites_host_idx" ON "booking_invites" USING btree ("host_player_id");--> statement-breakpoint
CREATE INDEX "coach_calibration_coach_idx" ON "coach_calibration" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "coach_contracts_coach_idx" ON "coach_contracts" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "coach_contracts_academy_idx" ON "coach_contracts" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "coach_contracts_status_idx" ON "coach_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "coach_match_reviews_match_idx" ON "coach_match_reviews" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "coach_match_reviews_coach_idx" ON "coach_match_reviews" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "coach_match_reviews_player_idx" ON "coach_match_reviews" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "coach_reviews_coach_idx" ON "coach_reviews" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "coach_reviews_player_idx" ON "coach_reviews" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "coach_reviews_visible_idx" ON "coach_reviews" USING btree ("is_visible","is_hidden");--> statement-breakpoint
CREATE INDEX "coach_time_blocks_coach_date_idx" ON "coach_time_blocks" USING btree ("coach_id","date");--> statement-breakpoint
CREATE INDEX "coach_time_blocks_coach_status_idx" ON "coach_time_blocks" USING btree ("coach_id","status");--> statement-breakpoint
CREATE INDEX "coach_wellness_logs_coach_idx" ON "coach_wellness_logs" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "coach_wellness_logs_date_idx" ON "coach_wellness_logs" USING btree ("date");--> statement-breakpoint
CREATE INDEX "comment_likes_comment_idx" ON "comment_likes" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "comment_likes_user_idx" ON "comment_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "community_groups_academy_idx" ON "community_groups" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "community_groups_type_idx" ON "community_groups" USING btree ("type");--> statement-breakpoint
CREATE INDEX "community_groups_series_idx" ON "community_groups" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "court_availability_court_date_idx" ON "court_availability" USING btree ("court_id","date");--> statement-breakpoint
CREATE INDEX "court_availability_snapshots_court_date_idx" ON "court_availability_snapshots" USING btree ("court_id","date");--> statement-breakpoint
CREATE INDEX "court_bookings_court_date_idx" ON "court_bookings" USING btree ("court_id","date");--> statement-breakpoint
CREATE INDEX "court_bookings_user_idx" ON "court_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "court_bookings_status_idx" ON "court_bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "credit_transactions_player_session_idx" ON "credit_transactions" USING btree ("player_id","session_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_package_idx" ON "credit_transactions" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_credit_type_idx" ON "credit_transactions" USING btree ("credit_type");--> statement-breakpoint
CREATE INDEX "daily_quest_slots_player_date_idx" ON "daily_quest_slots" USING btree ("player_id","slot_date");--> statement-breakpoint
CREATE INDEX "deep_assessment_pillar_summaries_player_idx" ON "deep_assessment_pillar_summaries" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "deep_assessment_skills_pillar_idx" ON "deep_assessment_skills" USING btree ("pillar");--> statement-breakpoint
CREATE INDEX "deep_assessment_skills_category_idx" ON "deep_assessment_skills" USING btree ("category");--> statement-breakpoint
CREATE INDEX "deep_assessment_skills_active_idx" ON "deep_assessment_skills" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "drill_blocks_template_idx" ON "drill_blocks" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "drill_blocks_type_idx" ON "drill_blocks" USING btree ("block_type");--> statement-breakpoint
CREATE INDEX "glow_skills_pillar_idx" ON "glow_skills" USING btree ("pillar");--> statement-breakpoint
CREATE INDEX "glow_skills_stage_idx" ON "glow_skills" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "group_members_group_idx" ON "group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lesson_templates_academy_idx" ON "lesson_templates" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "lesson_templates_level_idx" ON "lesson_templates" USING btree ("level_id");--> statement-breakpoint
CREATE INDEX "lesson_templates_focus_idx" ON "lesson_templates" USING btree ("focus");--> statement-breakpoint
CREATE INDEX "level_skills_level_idx" ON "level_skills" USING btree ("level_id");--> statement-breakpoint
CREATE INDEX "level_skills_skill_idx" ON "level_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "level_tests_level_idx" ON "level_tests" USING btree ("level_id");--> statement-breakpoint
CREATE INDEX "level_trials_player_idx" ON "level_trials" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "level_trials_status_idx" ON "level_trials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "level_trials_from_level_idx" ON "level_trials" USING btree ("from_level_id");--> statement-breakpoint
CREATE INDEX "level_trials_to_level_idx" ON "level_trials" USING btree ("to_level_id");--> statement-breakpoint
CREATE INDEX "level_up_events_player_idx" ON "level_up_events" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "level_up_events_from_level_idx" ON "level_up_events" USING btree ("from_level_id");--> statement-breakpoint
CREATE INDEX "level_up_events_to_level_idx" ON "level_up_events" USING btree ("to_level_id");--> statement-breakpoint
CREATE INDEX "marketplace_favorites_player_idx" ON "marketplace_favorites" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "marketplace_listings_seller_idx" ON "marketplace_listings" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "marketplace_listings_academy_idx" ON "marketplace_listings" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "marketplace_listings_status_idx" ON "marketplace_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketplace_listings_category_idx" ON "marketplace_listings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "marketplace_messages_listing_idx" ON "marketplace_messages" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "marketplace_messages_sender_idx" ON "marketplace_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "marketplace_messages_recipient_idx" ON "marketplace_messages" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "match_logs_player_idx" ON "match_logs" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "match_logs_session_idx" ON "match_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "match_logs_played_at_idx" ON "match_logs" USING btree ("played_at");--> statement-breakpoint
CREATE INDEX "match_opponents_player_idx" ON "match_opponents" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "match_pillar_scores_match_idx" ON "match_pillar_scores" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_pillar_scores_player_idx" ON "match_pillar_scores" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "match_plans_player_idx" ON "match_plans" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "match_plans_opponent_idx" ON "match_plans" USING btree ("opponent_id");--> statement-breakpoint
CREATE INDEX "match_plans_date_idx" ON "match_plans" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX "match_reflections_match_idx" ON "match_reflections" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_reflections_player_idx" ON "match_reflections" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "match_requests_player_idx" ON "match_requests" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "match_requests_status_idx" ON "match_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "match_requests_date_idx" ON "match_requests" USING btree ("preferred_date");--> statement-breakpoint
CREATE INDEX "match_training_suggestions_match_idx" ON "match_training_suggestions" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_training_suggestions_player_idx" ON "match_training_suggestions" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "matches_player_idx" ON "matches" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "matches_opponent_idx" ON "matches" USING btree ("opponent_id");--> statement-breakpoint
CREATE INDEX "matches_date_idx" ON "matches" USING btree ("match_date");--> statement-breakpoint
CREATE INDEX "matches_academy_idx" ON "matches" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "open_match_slots_match_idx" ON "open_match_slots" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "open_match_slots_player_idx" ON "open_match_slots" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "open_matches_booking_idx" ON "open_matches" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "open_matches_host_idx" ON "open_matches" USING btree ("host_player_id");--> statement-breakpoint
CREATE INDEX "open_matches_status_idx" ON "open_matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "open_matches_academy_status_idx" ON "open_matches" USING btree ("academy_id","status");--> statement-breakpoint
CREATE INDEX "open_to_play_user_idx" ON "open_to_play" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "open_to_play_academy_idx" ON "open_to_play" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "open_to_play_active_idx" ON "open_to_play" USING btree ("is_active","available_until");--> statement-breakpoint
CREATE INDEX "packages_player_idx" ON "packages" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "packages_series_idx" ON "packages" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "packages_status_idx" ON "packages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "packages_credit_type_idx" ON "packages" USING btree ("credit_type");--> statement-breakpoint
CREATE INDEX "player_badges_player_idx" ON "player_badges" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_badges_badge_idx" ON "player_badges" USING btree ("badge_id");--> statement-breakpoint
CREATE INDEX "player_ball_levels_player_idx" ON "player_ball_levels" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_ball_levels_level_idx" ON "player_ball_levels" USING btree ("level_id");--> statement-breakpoint
CREATE INDEX "player_ball_levels_status_idx" ON "player_ball_levels" USING btree ("status");--> statement-breakpoint
CREATE INDEX "player_baseline_skills_baseline_idx" ON "player_baseline_skill_scores" USING btree ("baseline_id");--> statement-breakpoint
CREATE INDEX "player_baseline_skills_player_idx" ON "player_baseline_skill_scores" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_baseline_skills_pillar_idx" ON "player_baseline_skill_scores" USING btree ("pillar");--> statement-breakpoint
CREATE INDEX "player_baselines_player_idx" ON "player_baselines" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_baselines_academy_idx" ON "player_baselines" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "player_baselines_status_idx" ON "player_baselines" USING btree ("status");--> statement-breakpoint
CREATE INDEX "player_booking_preferences_player_idx" ON "player_booking_preferences" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_connections_player1_idx" ON "player_connections" USING btree ("player1_id");--> statement-breakpoint
CREATE INDEX "player_connections_player2_idx" ON "player_connections" USING btree ("player2_id");--> statement-breakpoint
CREATE INDEX "player_connections_status_idx" ON "player_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "player_deep_assessments_player_idx" ON "player_deep_assessments" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_deep_assessments_skill_idx" ON "player_deep_assessments" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "player_deep_assessments_pillar_idx" ON "player_deep_assessments" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "player_feature_unlock_history_player_idx" ON "player_feature_unlock_history" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_feature_unlocks_key_idx" ON "player_feature_unlocks" USING btree ("feature_key");--> statement-breakpoint
CREATE INDEX "player_feature_unlocks_level_idx" ON "player_feature_unlocks" USING btree ("required_level");--> statement-breakpoint
CREATE INDEX "player_level_events_player_idx" ON "player_level_events" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_level_events_type_idx" ON "player_level_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "player_level_thresholds_level_idx" ON "player_level_thresholds" USING btree ("level");--> statement-breakpoint
CREATE INDEX "player_level_up_celebrations_player_idx" ON "player_level_up_celebrations" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_level_up_celebrations_pending_idx" ON "player_level_up_celebrations" USING btree ("celebration_shown");--> statement-breakpoint
CREATE INDEX "player_level_xp_rules_source_idx" ON "player_level_xp_rules" USING btree ("action_source");--> statement-breakpoint
CREATE INDEX "player_matches_initiator_idx" ON "player_matches" USING btree ("initiator_id");--> statement-breakpoint
CREATE INDEX "player_matches_receiver_idx" ON "player_matches" USING btree ("receiver_id");--> statement-breakpoint
CREATE INDEX "player_matches_status_idx" ON "player_matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "player_pillar_progress_player_idx" ON "player_pillar_progress" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_quests_player_idx" ON "player_quests" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_quests_status_idx" ON "player_quests" USING btree ("player_id","status");--> statement-breakpoint
CREATE INDEX "player_quests_expires_idx" ON "player_quests" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "player_skill_scores_player_idx" ON "player_skill_scores" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_skill_scores_skill_idx" ON "player_skill_scores" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "player_skill_scores_session_idx" ON "player_skill_scores" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "player_skill_scores_created_idx" ON "player_skill_scores" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "player_titles_player_idx" ON "player_titles" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_xp_events_player_idx" ON "player_xp_events" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_xp_events_source_idx" ON "player_xp_events" USING btree ("action_source");--> statement-breakpoint
CREATE INDEX "player_xp_events_created_idx" ON "player_xp_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "post_comments_post_idx" ON "post_comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_comments_author_idx" ON "post_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "post_comments_parent_idx" ON "post_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "post_reactions_post_idx" ON "post_reactions" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_reactions_user_idx" ON "post_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "posts_academy_idx" ON "posts" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "posts_group_idx" ON "posts" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "posts_context_idx" ON "posts" USING btree ("context_type","context_id");--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pressure_moments_match_idx" ON "pressure_moments" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "quest_templates_academy_idx" ON "quest_templates" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "quest_templates_type_idx" ON "quest_templates" USING btree ("quest_type","is_active");--> statement-breakpoint
CREATE INDEX "review_prompts_player_coach_idx" ON "review_prompts" USING btree ("player_id","coach_id");--> statement-breakpoint
CREATE INDEX "review_prompts_status_idx" ON "review_prompts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "role_message_templates_academy_idx" ON "role_message_templates" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "role_message_templates_key_idx" ON "role_message_templates" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "seller_profiles_player_idx" ON "seller_profiles" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "series_players_series_player_idx" ON "series_players" USING btree ("series_id","player_id");--> statement-breakpoint
CREATE INDEX "series_players_status_idx" ON "series_players" USING btree ("status");--> statement-breakpoint
CREATE INDEX "session_plans_session_idx" ON "session_plans" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_plans_template_idx" ON "session_plans" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "session_skill_feedback_session_idx" ON "session_skill_feedback" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_skill_feedback_player_idx" ON "session_skill_feedback" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "session_skill_feedback_coach_idx" ON "session_skill_feedback" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "shop_categories_academy_idx" ON "shop_categories" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "shop_order_items_order_idx" ON "shop_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shop_orders_academy_idx" ON "shop_orders" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "shop_orders_player_idx" ON "shop_orders" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "shop_orders_status_idx" ON "shop_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shop_products_academy_idx" ON "shop_products" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "shop_products_category_idx" ON "shop_products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "shop_products_featured_idx" ON "shop_products" USING btree ("is_featured","is_active");--> statement-breakpoint
CREATE INDEX "shop_services_academy_idx" ON "shop_services" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "shop_services_category_idx" ON "shop_services" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "shop_wishlist_player_idx" ON "shop_wishlist" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "skill_evidence_player_idx" ON "skill_evidence" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "skill_evidence_skill_idx" ON "skill_evidence" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_evidence_session_idx" ON "skill_evidence" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "skill_evidence_trial_idx" ON "skill_evidence" USING btree ("trial_id");--> statement-breakpoint
CREATE INDEX "skill_rubrics_skill_idx" ON "skill_rubrics" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "spotlight_monthly_academy_idx" ON "spotlight_monthly_winners" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "spotlight_nom_academy_idx" ON "spotlight_nominations" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "spotlight_nom_week_idx" ON "spotlight_nominations" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "spotlight_nom_nominator_idx" ON "spotlight_nominations" USING btree ("nominator_player_id");--> statement-breakpoint
CREATE INDEX "spotlight_weekly_academy_idx" ON "spotlight_weekly_winners" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "user_social_profiles_user_idx" ON "user_social_profiles" USING btree ("user_id");