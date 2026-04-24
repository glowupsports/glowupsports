import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, numeric, boolean, date, jsonb, json, index, uniqueIndex, unique, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== AUTH TABLES ====================

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(), // globally unique username for login
  email: text("email").notNull(), // email can be shared by family members (not unique)
  password: text("password").notNull(),
  role: text("role").notNull().default("coach"), // platform_owner | academy_owner | coach | assistant | player
  status: text("status").notNull().default("active"), // active | pending | suspended
  academyId: varchar("academy_id"), // references academies.id (set after registration)
  coachId: varchar("coach_id"), // references coaches.id (links user to coach profile)
  playerId: varchar("player_id"), // references players.id (links user to player profile)
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
  appleId: text("apple_id").unique(), // Apple Sign-In user identifier
  deleted: boolean("deleted").default(false), // true when account has been deleted
  deletedAt: timestamp("deleted_at"), // when the account was deleted
  // AI Pro subscription fields (players only)
  stripeCustomerId: text("stripe_customer_id"), // Stripe customer ID for AI Pro
  stripeSubscriptionId: text("stripe_subscription_id"), // Active AI Pro subscription ID
  chatOnboardingSeenAt: timestamp("chat_onboarding_seen_at"), // when the user dismissed the chat tutorial
});

// Password reset codes (Task #750) — stores hashed 6-digit codes + deep-link tokens for password recovery
export const passwordResetCodes = pgTable("password_reset_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  codeHash: text("code_hash").notNull(),
  tokenHash: text("token_hash"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  attemptCount: integer("attempt_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("password_reset_codes_user_id_idx").on(table.userId),
  tokenHashIdx: index("password_reset_codes_token_hash_idx").on(table.tokenHash),
}));

export type PasswordResetCode = typeof passwordResetCodes.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  role: true,
  status: true,
  academyId: true,
  coachId: true,
  playerId: true,
});

export const loginSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .transform(val => val.toLowerCase()),
  password: z.string().min(6),
});

export const usernameSchema = z.string()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be 30 characters or less")
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
  .transform(val => val.toLowerCase());

// T-shirt sizes for merchandise and giveaways
// Children's sizes (ages 2-16): 2T, 3T, 4T, YXS (4-5), YS (6-7), YM (8-10), YL (12-14), YXL (16)
// Adult sizes (ages 17+): XS, S, M, L, XL, XXL, XXXL
export const childTshirtSizes = ["2T", "3T", "4T", "YXS", "YS", "YM", "YL", "YXL"] as const;
export const adultTshirtSizes = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;
export const tshirtSizes = [...childTshirtSizes, ...adultTshirtSizes] as const;
export type ChildTshirtSize = typeof childTshirtSizes[number];
export type AdultTshirtSize = typeof adultTshirtSizes[number];
export type TshirtSize = typeof tshirtSizes[number];

// Player self-registration (open, no academy required)
export const playerRegisterSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be 30 characters or less")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores allowed")
    .transform(val => val.toLowerCase()),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z
    .string()
    .min(1, "Date of birth is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be in YYYY-MM-DD format"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(5, "Phone number is required for WhatsApp communication"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  tshirtSize: z.enum(tshirtSizes).optional(),
  height: z.number().int().min(50).max(250).optional(), // height in cm
});

// Coach registration via invite token
export const coachInviteRegisterSchema = z.object({
  token: z.string().min(1, "Invite token is required"),
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be 30 characters or less")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores allowed")
    .transform(val => val.toLowerCase()),
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().min(5, "Phone number is required for WhatsApp communication"),
  specialty: z.string().optional(),
  tshirtSize: z.enum(tshirtSizes).optional(),
});

// Legacy register schema (for backwards compatibility)
export const registerSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be 30 characters or less")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores allowed")
    .transform(val => val.toLowerCase()),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  academyName: z.string().min(2).optional(),
  role: z.enum(["platform_owner", "academy_owner", "coach", "assistant", "player", "service_provider"]).default("coach"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type PlayerRegisterInput = z.infer<typeof playerRegisterSchema>;
export type CoachInviteRegisterInput = z.infer<typeof coachInviteRegisterSchema>;

// ==================== MULTI-ACADEMY STRUCTURE ====================

// Academies (top-level tenant)
export const academies = pgTable("academies", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // e.g., "alex-tennis-academy"
  joinCode: text("join_code").unique(), // 6-char code for players to join (e.g., "ABC123")
  city: text("city"), // for search/discovery
  country: text("country"), // for search/discovery
  description: text("description"), // short public description
  ownerId: varchar("owner_id"), // references coaches.id (set after coach creation)

  // Join Settings — when true (default), players can join instantly without
  // coach approval. When false, players must submit a join request that the
  // coach reviews. See Task #1131.
  openJoin: boolean("open_join").default(true).notNull(),
  
  // Public Profile Fields (Academy Directory)
  website: text("website"),
  phone: text("phone"),
  email: text("email"),
  logoUrl: text("logo_url"),
  coverImageUrl: text("cover_image_url"),
  facilities: jsonb("facilities").$type<string[]>(), // indoor_courts, outdoor_courts, gym, shop, cafe, parking, etc.
  courtCount: integer("court_count"),
  ageGroups: jsonb("age_groups").$type<string[]>(), // kids, juniors, teens, adults, seniors
  programs: jsonb("programs").$type<string[]>(), // beginner, intermediate, advanced, competitive, private
  priceRange: text("price_range"), // $ | $$ | $$$ | $$$$
  profileVisibility: text("profile_visibility").default("public"), // public | members_only | private
  
  // Cancellation Policy Settings
  cancelHoursBeforeFree: integer("cancel_hours_before_free").default(24), // Hours before session for free cancellation
  chargeLatePrivateCancellations: boolean("charge_late_private_cancellations").default(true),
  chargeLateGroupCancellations: boolean("charge_late_group_cancellations").default(true), // Group always counts, but this controls billing
  semiPrivateUpgradeBilling: text("semi_private_upgrade_billing").default("premium"), // premium | goodwill - how to bill remaining player
  allowMakeUpForTimelyCancels: boolean("allow_make_up_for_timely_cancels").default(true), // Academy discretion for make-ups
  
  // Credit System V2 — feature flag for the new credit/package engine.
  // When false (default), all routes/attendance triggers use the legacy
  // `packages` + `credit_transactions` system. Phase 1 only creates the
  // tables/engine; later phases flip this per academy.
  useNewCreditSystem: boolean("use_new_credit_system").default(false),

  // XP & Gamification Settings
  xpPerSession: integer("xp_per_session").default(10),
  xpBonusStreak: integer("xp_bonus_streak").default(5),
  noShowPenalty: integer("no_show_penalty").default(100),
  lateCancellationPenalty: integer("late_cancellation_penalty").default(50),
  
  // Attendance Settings
  attendanceThreshold: integer("attendance_threshold").default(80),
  requireConfirmation: boolean("require_confirmation").default(true),
  
  // Waitlist Settings
  allowWaitlist: boolean("allow_waitlist").default(true),
  maxWaitlistSize: integer("max_waitlist_size").default(3),
  
  // Branding
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  // Structured academy theme (Task #791): primary, secondary, accent, surface,
  // panel, panelElevated, panelBorder, text, textMuted, plus optional dark
  // overrides. When null the app falls back to the built-in Glow Green theme.
  theme: jsonb("theme").$type<{
    primary?: string;
    secondary?: string;
    accent?: string;
    surface?: string;
    panel?: string;
    panelElevated?: string;
    panelBorder?: string;
    text?: string;
    textMuted?: string;
    dark?: {
      primary?: string;
      secondary?: string;
      accent?: string;
      surface?: string;
      panel?: string;
      panelElevated?: string;
      panelBorder?: string;
      text?: string;
      textMuted?: string;
    };
  } | null>(),
  address: text("address"),
  
  // Academy Settings
  defaultSessionLength: integer("default_session_length").default(60),
  xpVisibleToPlayers: boolean("xp_visible_to_players").default(true),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  
  // Academy Type: academy (full coaching), venue (court rental only), club (social/membership)
  academyType: text("academy_type").default("academy"), // academy | venue | club
  
  // Freelance Support
  isFreelance: boolean("is_freelance").default(false), // True if this is a coach's personal freelance academy
  freelanceOwnerCoachId: varchar("freelance_owner_coach_id"), // Coach ID who owns this freelance academy
  allowFreelanceCoaches: text("allow_freelance_coaches").default("allow"), // allow | review_required | disallow
  
  // Timezone (IANA format like "Asia/Dubai", "Europe/Amsterdam")
  timezone: text("timezone").default("Asia/Dubai"),
  
  // Bank Details for Payment Instructions
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankIban: text("bank_iban"),
  bankAccountHolder: text("bank_account_holder"),
  bankSwiftCode: text("bank_swift_code"),
  paymentInstructions: text("payment_instructions"),
  acceptsCash: boolean("accepts_cash").default(true),
  acceptsBankTransfer: boolean("accepts_bank_transfer").default(true),
  // Task #1095 — flag flipped to true by Task #1093 once online card payments
  // are wired up for an academy. Default false so the booking wizard shows the
  // "Coming soon" teaser everywhere until then.
  onlineCardEnabled: boolean("online_card_enabled").default(false),
  
  // Multi-sport support: list of sports this academy offers (e.g., ["tennis", "padel"])
  sports: jsonb("sports").$type<string[]>().default(["tennis"]),
  
  // AI Budget Control (platform owner configurable)
  monthlyTokenBudget: integer("monthly_token_budget"), // null = unlimited
  
  // Aggregate rating from session ratings
  averageRating: numeric("average_rating", { precision: 3, scale: 2 }),
  totalRatings: integer("total_ratings").notNull().default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAcademySchema = createInsertSchema(academies).omit({ id: true, createdAt: true });
export type InsertAcademy = z.infer<typeof insertAcademySchema>;
export type Academy = typeof academies.$inferSelect;

// Academy Applications (for new academies awaiting platform owner approval)
export const academyApplications = pgTable("academy_applications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyName: text("academy_name").notNull(),
  country: text("country").notNull(),
  contactPerson: text("contact_person").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  description: text("description"),
  status: text("status").default("pending").notNull(), // pending | approved | rejected
  reviewedBy: varchar("reviewed_by"), // platform owner who reviewed
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAcademyApplicationSchema = createInsertSchema(academyApplications).omit({ id: true, createdAt: true, reviewedBy: true, reviewedAt: true });
export const academyApplicationInputSchema = z.object({
  academyName: z.string().min(2, "Academy name must be at least 2 characters"),
  country: z.string().min(2, "Country is required"),
  contactPerson: z.string().min(2, "Contact person name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  description: z.string().optional(),
});
export type InsertAcademyApplication = z.infer<typeof insertAcademyApplicationSchema>;
export type AcademyApplication = typeof academyApplications.$inferSelect;
export type AcademyApplicationInput = z.infer<typeof academyApplicationInputSchema>;

// Academy Owner Profiles (public bio/identity for the academy owner)
export const academyOwnerProfiles = pgTable("academy_owner_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull().unique(),
  ownerName: text("owner_name").notNull(),
  role: text("role").notNull().default("owner"), // owner | director | founder
  yearsInSports: text("years_in_sports"), // e.g. "10+ years"
  backgroundTags: jsonb("background_tags").$type<string[]>().default([]), // former_player, coach, business, parent, mixed
  visionTags: jsonb("vision_tags").$type<string[]>().default([]), // player_development, long_term_growth, fun_confidence, performance_pathway, community
  academyFocus: text("academy_focus"), // recreational | performance | mixed
  internalNote: text("internal_note"), // "What matters most in this academy?"
  publicMessage: text("public_message"), // visible to players
  photoUrl: text("photo_url"),
  approved: boolean("approved").default(false),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAcademyOwnerProfileSchema = createInsertSchema(academyOwnerProfiles).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  approvedBy: true,
  approvedAt: true 
});
export type InsertAcademyOwnerProfile = z.infer<typeof insertAcademyOwnerProfileSchema>;
export type AcademyOwnerProfile = typeof academyOwnerProfiles.$inferSelect;

// Invites (for coaches to join academies)
export const invites = pgTable("invites", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  shortCode: varchar("short_code", { length: 6 }),
  role: text("role").notNull().default("coach"), // coach | assistant
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  invitedEmail: text("invited_email"), // optional pre-set email
  invitedBy: varchar("invited_by").notNull(), // coach/owner who created invite
  usedBy: varchar("used_by"), // user who accepted
  usedAt: timestamp("used_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInviteSchema = createInsertSchema(invites).omit({ id: true, createdAt: true, usedBy: true, usedAt: true });
export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type Invite = typeof invites.$inferSelect;

// Player Join Requests (for players to request joining an academy)
export const joinRequests = pgTable("join_requests", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  status: text("status").default("pending").notNull(), // pending | approved | rejected
  message: text("message"), // optional message from player
  reviewedBy: varchar("reviewed_by"), // coach/owner who reviewed
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertJoinRequestSchema = createInsertSchema(joinRequests).omit({ id: true, createdAt: true, reviewedBy: true, reviewedAt: true });
export const joinRequestInputSchema = z.object({
  academyId: z.string().min(1, "Academy is required"),
  message: z.string().optional(),
});
export type InsertJoinRequest = z.infer<typeof insertJoinRequestSchema>;
export type JoinRequest = typeof joinRequests.$inferSelect;
export type JoinRequestInput = z.infer<typeof joinRequestInputSchema>;

// Academy Transfer Requests (player wants to switch academies)
export const academyTransferRequests = pgTable("academy_transfer_requests", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  fromAcademyId: varchar("from_academy_id").references(() => academies.id).notNull(),
  toAcademyId: varchar("to_academy_id").references(() => academies.id).notNull(),
  status: text("status").default("pending").notNull(), // pending | approved | rejected | cancelled
  reason: text("reason"), // player's reason for transfer
  
  // From academy response
  fromAcademyStatus: text("from_academy_status").default("pending"), // pending | approved | rejected
  fromAcademyReviewedBy: varchar("from_academy_reviewed_by"),
  fromAcademyReviewedAt: timestamp("from_academy_reviewed_at"),
  fromAcademyNote: text("from_academy_note"),
  
  // To academy response
  toAcademyStatus: text("to_academy_status").default("pending"), // pending | approved | rejected
  toAcademyReviewedBy: varchar("to_academy_reviewed_by"),
  toAcademyReviewedAt: timestamp("to_academy_reviewed_at"),
  toAcademyNote: text("to_academy_note"),
  
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAcademyTransferRequestSchema = createInsertSchema(academyTransferRequests).omit({ 
  id: true, createdAt: true, completedAt: true,
  fromAcademyReviewedBy: true, fromAcademyReviewedAt: true,
  toAcademyReviewedBy: true, toAcademyReviewedAt: true,
});
export const transferRequestInputSchema = z.object({
  toAcademyId: z.string().min(1, "Destination academy is required"),
  reason: z.string().optional(),
});
export type InsertAcademyTransferRequest = z.infer<typeof insertAcademyTransferRequestSchema>;
export type AcademyTransferRequest = typeof academyTransferRequests.$inferSelect;
export type TransferRequestInput = z.infer<typeof transferRequestInputSchema>;

// Coach Invitations (academy invites coach to join)
export const coachInvitations = pgTable("coach_invitations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id), // null if new coach, set if existing coach
  email: text("email").notNull(), // email to send invitation to
  role: text("role").default("coach"), // coach | assistant | head_coach
  
  status: text("status").default("pending").notNull(), // pending | accepted | declined | expired
  invitedBy: varchar("invited_by").references(() => coaches.id).notNull(),
  token: text("token").notNull().unique(), // unique invite token
  
  message: text("message"), // optional welcome message
  expiresAt: timestamp("expires_at"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCoachInvitationSchema = createInsertSchema(coachInvitations).omit({ 
  id: true, createdAt: true, acceptedAt: true, declinedAt: true, token: true 
});
export const coachInvitationInputSchema = z.object({
  email: z.string().email("Valid email is required"),
  role: z.enum(["coach", "assistant", "head_coach"]).default("coach"),
  message: z.string().optional(),
});
export type InsertCoachInvitation = z.infer<typeof insertCoachInvitationSchema>;
export type CoachInvitation = typeof coachInvitations.$inferSelect;
export type CoachInvitationInput = z.infer<typeof coachInvitationInputSchema>;

// ==================== COACH APP TABLES ====================

// Coaches
export const coaches = pgTable("coaches", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  tshirtSize: text("tshirt_size"), // XS, S, M, L, XL, XXL, XXXL
  specialty: text("specialty"),
  bio: text("bio"),
  role: text("role").default("coach"), // platform_owner | academy_owner | coach | assistant
  homeLocationId: varchar("home_location_id"),
  hourlyRate: numeric("hourly_rate"),
  
  level: integer("level").default(1),
  totalXp: integer("total_xp").default(0),
  
  // Coach Onboarding
  onboardingCompleted: boolean("onboarding_completed").default(false),
  onboardingMode: text("onboarding_mode"), // basic | standard | advanced
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  onboardingAcknowledgements: jsonb("onboarding_acknowledgements").$type<{
    fairness?: boolean;
    feedbackRules?: boolean;
    attendanceRules?: boolean;
  }>(),
  
  // Coach Bio/Identity (Private)
  yearsExperience: text("years_experience"), // 0-2 | 3-5 | 6-10 | 10+
  certifications: text("certifications"),
  backgroundTags: jsonb("background_tags").$type<string[]>(), // former_player, coaching_education, self_developed, mixed
  philosophyTags: jsonb("philosophy_tags").$type<string[]>(), // confidence, discipline, fun, technique, performance, growth (max 3)
  
  // Coach Bio (Public - visible to players after approval)
  publicQuote: text("public_quote"), // max 120 chars
  photoUrl: text("photo_url"),
  bioStatus: text("bio_status").default("draft"), // draft | pending_approval | approved | rejected
  bioApprovedBy: varchar("bio_approved_by"),
  bioApprovedAt: timestamp("bio_approved_at"),
  bioRejectionReason: text("bio_rejection_reason"),
  showProfileToPlayers: boolean("show_profile_to_players").default(true),
  
  // Coach Directory Settings
  showInDirectory: boolean("show_in_directory").default(true), // visible in platform-wide coach directory
  openToOpportunities: boolean("open_to_opportunities").default(false), // accepting invites from other academies
  specializations: jsonb("specializations").$type<string[]>(), // technique, footwork, mental, fitness, competition, etc.
  languages: jsonb("languages").$type<string[]>(), // en, nl, es, fr, ar, etc.

  // Public Profile (Task #1037 — Public Coach Profiles, flipped to default-on
  // by Task #1109 — Auto-show all coaches in public directory).
  // When true, the coach is publicly discoverable in the worldwide coach directory
  // and shows a public profile (bio, sports, certifications, sample reviews,
  // open lessons, drop-in price). New coaches default to ON (opt-out at signup);
  // existing coaches were backfilled to ON by the Task #1109 migration. Coaches
  // who explicitly turn the toggle OFF after that migration runs keep their
  // opt-out (the migration is one-shot, guarded by a marker column).
  publicProfileEnabled: boolean("public_profile_enabled").default(true),
  // Optional separate avatar used on the public profile (falls back to photoUrl).
  publicAvatarUrl: text("public_avatar_url"),
  
  // Parent Dashboard PIN Protection
  parentDashboardPin: text("parent_dashboard_pin").default("1234"), // 4-digit PIN, default 1234
  pinChangedAt: timestamp("pin_changed_at"), // When PIN was last changed (null = never changed, must change on first use)
  
  // Freelance Coach Support
  isFreelance: boolean("is_freelance").default(false), // Coach can run their own personal academy
  personalAcademyId: varchar("personal_academy_id"), // ID of auto-created personal academy for freelancers
  selfServiceRate: numeric("self_service_rate"), // Rate for self-managed sessions (personal academy)

  // Aggregate rating from session ratings
  averageRating: numeric("average_rating", { precision: 3, scale: 2 }),
  totalRatings: integer("total_ratings").notNull().default(0),

  // Phase 3 — Auto-create a private "lesson recap" draft after each completed
  // lesson. Default OFF so coaches opt in explicitly (avoids notification
  // fatigue per Phase 3 risks). When true, on session completion the system
  // inserts a draft `posts` row that the coach can edit + send or skip from
  // the dashboard.
  lessonRecapEnabled: boolean("lesson_recap_enabled").default(false),

  // Live GPS tracking
  lastLat: doublePrecision("last_lat"),
  lastLng: doublePrecision("last_lng"),
  lastLocationAt: timestamp("last_location_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCoachSchema = createInsertSchema(coaches).omit({ id: true, createdAt: true });
export type InsertCoach = z.infer<typeof insertCoachSchema>;
export type Coach = typeof coaches.$inferSelect;

// Coach Freelance Profiles - Personal branding for freelance coaches
export const coachFreelanceProfiles = pgTable("coach_freelance_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull().unique(),
  freelanceAcademyId: varchar("freelance_academy_id").references(() => academies.id), // The coach's personal academy
  
  // Branding
  businessName: text("business_name").notNull(), // e.g., "The Law Tennis Academy"
  slug: text("slug").unique(), // URL-friendly version
  tagline: text("tagline"), // Short marketing tagline
  bio: text("bio"), // Extended bio for freelance profile
  logoUrl: text("logo_url"),
  coverImageUrl: text("cover_image_url"),
  primaryColor: text("primary_color"), // Brand color
  
  // Contact & Business Info
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  website: text("website"),
  socialLinks: jsonb("social_links").$type<{ instagram?: string; facebook?: string; linkedin?: string; twitter?: string }>(),
  
  // Service Info
  serviceAreas: jsonb("service_areas").$type<string[]>(), // Cities/regions they serve
  travelRadius: integer("travel_radius"), // Miles willing to travel
  specialties: jsonb("specialties").$type<string[]>(), // Advanced coaching specialties
  ageGroupsServed: jsonb("age_groups_served").$type<string[]>(), // kids, juniors, adults, seniors
  
  // Pricing (displayed on profile)
  showPricing: boolean("show_pricing").default(false),
  hourlyRateMin: integer("hourly_rate_min"),
  hourlyRateMax: integer("hourly_rate_max"),
  currency: text("currency").default("USD"),
  
  // Status
  isActive: boolean("is_active").default(false), // Freelance license activated
  activatedAt: timestamp("activated_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCoachFreelanceProfileSchema = createInsertSchema(coachFreelanceProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoachFreelanceProfile = z.infer<typeof insertCoachFreelanceProfileSchema>;
export type CoachFreelanceProfile = typeof coachFreelanceProfiles.$inferSelect;

// Academy Locations — physical locations belonging to an academy (academy_id FK).
// This table serves as the `academy_locations` entity; each record is scoped to one academy.
export const locations = pgTable("locations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  name: text("name").notNull(),
  address: text("address"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  googlePlaceId: text("google_place_id"),
  isActive: boolean("is_active").default(true),
  timezone: text("timezone").default("Asia/Dubai"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true });
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locations.$inferSelect;

// Location Travel Times - stores travel time between location pairs
export const locationTravelTimes = pgTable("location_travel_times", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  coachId: varchar("coach_id").references(() => coaches.id),
  fromLocationId: varchar("from_location_id").references(() => locations.id).notNull(),
  toLocationId: varchar("to_location_id").references(() => locations.id).notNull(),
  travelTimeMinutes: integer("travel_time_minutes").notNull().default(30),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLocationTravelTimeSchema = createInsertSchema(locationTravelTimes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLocationTravelTime = z.infer<typeof insertLocationTravelTimeSchema>;
export type LocationTravelTime = typeof locationTravelTimes.$inferSelect;

// Courts
export const courts = pgTable("courts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  locationId: varchar("location_id").references(() => locations.id),
  name: text("name").notNull(),
  color: varchar("color", { length: 7 }).default("#2ECC40"),
  isActive: boolean("is_active").default(true),
  position: integer("position").default(0), // For drag-and-drop ordering
  
  // Court Booking Marketplace Fields
  surface: text("surface").default("hard"), // hard | clay | grass | indoor | artificial
  description: text("description"),
  photoUrl: text("photo_url"),
  visibility: text("visibility").default("academy"), // public | academy | invite_only
  pricePerHour: numeric("price_per_hour").default("0"), // 0 = free
  peakPricePerHour: numeric("peak_price_per_hour"), // optional peak hours price
  memberPricePerHour: numeric("member_price_per_hour"), // optional discounted price for members
  currency: text("currency").default("AED"),
  
  // Court Credits System (1 credit = 5 AED)
  creditsPerHour: integer("credits_per_hour").default(0), // 0 = use AED pricing, >0 = use credits
  peakCreditsPerHour: integer("peak_credits_per_hour"), // optional peak hours credits
  memberCreditsPerHour: integer("member_credits_per_hour"), // optional member discount credits
  
  // Booking Rules
  maxBookingDurationHours: integer("max_booking_duration_hours").default(2),
  minBookingDurationMinutes: integer("min_booking_duration_minutes").default(60),
  cancelWindowHours: integer("cancel_window_hours").default(24), // hours before start time
  guestsAllowed: boolean("guests_allowed").default(false),
  requiresApproval: boolean("requires_approval").default(false), // academy must approve booking
  bookingEnabled: boolean("booking_enabled").default(true), // false = community-only, visible but not bookable
  // True = the academy doesn't own/manage this court — players or coaches must book it externally
  // (e.g. Playtomic, club website, walk-in). When set, the court-booking picker forces an
  // external_booked / external_pending choice instead of "academy court — handled for you".
  requiresExternalBooking: boolean("requires_external_booking").default(false).notNull(),
  
  // Operating Hours (JSON for flexibility)
  operatingHours: jsonb("operating_hours").$type<{
    [day: string]: { open: string; close: string; closed?: boolean };
  }>(),
  
  // XP Rewards (game layer)
  xpRewardPerHour: integer("xp_reward_per_hour").default(10),
  
  // Multi-sport support
  sport: text("sport").default("tennis"), // tennis | padel | pickleball | multi
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCourtSchema = createInsertSchema(courts).omit({ id: true, createdAt: true });
export type InsertCourt = z.infer<typeof insertCourtSchema>;
export type Court = typeof courts.$inferSelect;

// Court Availability - Tracks available/booked/blocked time slots
export const courtAvailability = pgTable("court_availability", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  courtId: varchar("court_id").references(() => courts.id).notNull(),
  date: date("date").notNull(),
  startTime: text("start_time").notNull(), // "09:00"
  endTime: text("end_time").notNull(), // "10:00"
  status: text("status").notNull().default("available"), // available | booked | blocked | maintenance
  blockedReason: text("blocked_reason"), // training | event | maintenance | closed
  blockedBy: varchar("blocked_by").references(() => users.id), // coach or admin who blocked
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  courtDateIdx: index("court_availability_court_date_idx").on(table.courtId, table.date),
}));

export const insertCourtAvailabilitySchema = createInsertSchema(courtAvailability).omit({ id: true, createdAt: true });
export type InsertCourtAvailability = z.infer<typeof insertCourtAvailabilitySchema>;
export type CourtAvailability = typeof courtAvailability.$inferSelect;

// Court Bookings - Player bookings for court time
export const courtBookings = pgTable("court_bookings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  courtId: varchar("court_id").references(() => courts.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(), // who booked
  playerId: varchar("player_id").references(() => players.id), // optional player profile
  academyId: varchar("academy_id").references(() => academies.id), // court's academy
  
  // Booking Details
  date: date("date").notNull(),
  startTime: text("start_time").notNull(), // "09:00"
  endTime: text("end_time").notNull(), // "10:00"
  durationMinutes: integer("duration_minutes").notNull(),
  
  // Booking Type
  bookingType: text("booking_type").notNull().default("public"), // public | academy | training | event
  
  // Pricing
  price: numeric("price").default("0"),
  currency: text("currency").default("AED"),
  paymentStatus: text("payment_status").default("pending"), // pending | paid | free | refunded
  
  // Court Credits (1 credit = 5 AED)
  creditsUsed: integer("credits_used").default(0), // Number of court credits used for this booking
  creditPackageId: varchar("credit_package_id"), // Which package the credits came from
  
  // Status
  status: text("status").default("pending"), // pending | confirmed | cancelled | completed | no_show
  confirmedAt: timestamp("confirmed_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  cancelledBy: varchar("cancelled_by").references(() => users.id),
  
  // XP Rewards
  xpAwarded: integer("xp_awarded").default(0),
  
  // Notes
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  courtDateIdx: index("court_bookings_court_date_idx").on(table.courtId, table.date),
  userIdx: index("court_bookings_user_idx").on(table.userId),
  statusIdx: index("court_bookings_status_idx").on(table.status),
}));

export const insertCourtBookingSchema = createInsertSchema(courtBookings).omit({ 
  id: true, 
  createdAt: true,
  confirmedAt: true,
  cancelledAt: true,
  cancelledBy: true,
});
export type InsertCourtBooking = z.infer<typeof insertCourtBookingSchema>;
export type CourtBooking = typeof courtBookings.$inferSelect;

// ==================== SOCIAL BOOKING (Phase 2) ====================

// Booking Invites - Group booking with friends
export const bookingInvites = pgTable("booking_invites", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => courtBookings.id).notNull(),
  hostPlayerId: varchar("host_player_id").references(() => players.id).notNull(),
  
  // Split cost settings
  splitCost: boolean("split_cost").default(true),
  costPerPerson: numeric("cost_per_person"),
  currency: text("currency").default("AED"),
  
  // Group settings
  maxGuests: integer("max_guests").default(3), // typical doubles = 4 players
  message: text("message"), // invite message from host
  
  // Tracking
  totalInvited: integer("total_invited").default(0),
  totalAccepted: integer("total_accepted").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  bookingIdx: index("booking_invites_booking_idx").on(table.bookingId),
  hostIdx: index("booking_invites_host_idx").on(table.hostPlayerId),
}));

export const insertBookingInviteSchema = createInsertSchema(bookingInvites).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBookingInvite = z.infer<typeof insertBookingInviteSchema>;
export type BookingInvite = typeof bookingInvites.$inferSelect;

// Booking Invite Guests - Individual invitees
export const bookingInviteGuests = pgTable("booking_invite_guests", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  inviteId: varchar("invite_id").references(() => bookingInvites.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  // Status
  status: text("status").default("pending"), // pending | accepted | declined | cancelled
  respondedAt: timestamp("responded_at"),
  
  // Cost
  shareAmount: numeric("share_amount"),
  paymentStatus: text("payment_status").default("pending"), // pending | paid | refunded
  
  // XP
  xpAwarded: integer("xp_awarded").default(0),
  
  // Notifications
  notificationSentAt: timestamp("notification_sent_at"),
  reminderSentAt: timestamp("reminder_sent_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  inviteIdx: index("booking_invite_guests_invite_idx").on(table.inviteId),
  playerIdx: index("booking_invite_guests_player_idx").on(table.playerId),
  statusIdx: index("booking_invite_guests_status_idx").on(table.status),
  uniqueInvitePlayer: unique("booking_invite_guests_unique").on(table.inviteId, table.playerId),
}));

export const insertBookingInviteGuestSchema = createInsertSchema(bookingInviteGuests).omit({ id: true, createdAt: true });
export type InsertBookingInviteGuest = z.infer<typeof insertBookingInviteGuestSchema>;
export type BookingInviteGuest = typeof bookingInviteGuests.$inferSelect;

// ==================== OPEN MATCHES (Phase 3) ====================

// Open Matches - Players can post matches for others to join
export const openMatches = pgTable("open_matches", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => courtBookings.id).notNull(),
  hostPlayerId: varchar("host_player_id").references(() => players.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id),
  
  // Match details
  matchType: text("match_type").default("singles"), // singles | doubles | practice | rally
  title: text("title"), // "Looking for doubles partner"
  description: text("description"),
  
  // Skill matching
  requiredLevelMin: integer("required_level_min").default(1), // Player XP level
  requiredLevelMax: integer("required_level_max").default(20),
  requiredBallLevel: text("required_ball_level"), // red | orange | green | yellow
  skillFlexibility: text("skill_flexibility").default("flexible"), // strict | flexible | any
  
  // Capacity
  maxPlayers: integer("max_players").default(2), // 2 for singles, 4 for doubles
  currentPlayers: integer("current_players").default(1), // host counts as 1
  
  // Status
  status: text("status").default("open"), // draft | open | full | cancelled | completed
  
  // Visibility
  visibility: text("visibility").default("academy"), // public | academy | friends_only
  
  // Cost (if any)
  costPerPlayer: numeric("cost_per_player"),
  currency: text("currency").default("AED"),
  
  // XP bonus for joining open matches
  xpBonus: integer("xp_bonus").default(25),

  // Court booking metadata — picker value chosen at create time
  // (academy_court | external_booked | external_pending). Mirrors the
  // same fields on match_requests / match_challenges so detail/list views
  // can render the booking-status pill on open matches too.
  courtBookingStatus: text("court_booking_status"),
  courtBookingNote: text("court_booking_note"),
  courtBookingUrl: text("court_booking_url"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  bookingIdx: index("open_matches_booking_idx").on(table.bookingId),
  hostIdx: index("open_matches_host_idx").on(table.hostPlayerId),
  statusIdx: index("open_matches_status_idx").on(table.status),
  academyStatusIdx: index("open_matches_academy_status_idx").on(table.academyId, table.status),
}));

export const insertOpenMatchSchema = createInsertSchema(openMatches).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOpenMatch = z.infer<typeof insertOpenMatchSchema>;
export type OpenMatch = typeof openMatches.$inferSelect;

// Open Match Slots - Players who joined the match
export const openMatchSlots = pgTable("open_match_slots", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  matchId: varchar("match_id").references(() => openMatches.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  // Role
  role: text("role").default("player"), // host | player
  
  // Status
  status: text("status").default("confirmed"), // pending | confirmed | cancelled | no_show
  
  // Timing
  joinedAt: timestamp("joined_at").defaultNow(),
  cancelledAt: timestamp("cancelled_at"),
  
  // XP
  xpAwarded: integer("xp_awarded").default(0),
  
  // Notifications
  notificationSentAt: timestamp("notification_sent_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  matchIdx: index("open_match_slots_match_idx").on(table.matchId),
  playerIdx: index("open_match_slots_player_idx").on(table.playerId),
  uniqueMatchPlayer: unique("open_match_slots_unique").on(table.matchId, table.playerId),
}));

export const insertOpenMatchSlotSchema = createInsertSchema(openMatchSlots).omit({ id: true, createdAt: true });
export type InsertOpenMatchSlot = z.infer<typeof insertOpenMatchSlotSchema>;
export type OpenMatchSlot = typeof openMatchSlots.$inferSelect;

// Match Requests - For players looking for matches without a court booking
export const matchRequests = pgTable("match_requests", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id),
  
  // Match details
  matchType: text("match_type").default("singles"), // singles | doubles
  matchIntent: text("match_intent").default("friendly"), // friendly | competitive | ranking - determines rating impact
  title: text("title"),
  description: text("description"),
  
  // Preferred date/time
  preferredDate: date("preferred_date"),
  preferredTime: text("preferred_time"), // "18:00"
  
  // Skill matching
  requiredLevelMin: integer("required_level_min").default(1),
  requiredLevelMax: integer("required_level_max").default(9),
  requiredBallLevel: text("required_ball_level"), // For kids: blue | red | orange | green | yellow | glow
  isAdult: boolean("is_adult").default(true),
  
  // Capacity for doubles
  maxPlayers: integer("max_players").default(2),
  
  // Sport
  sport: text("sport").default("tennis"), // tennis | padel | pickleball

  // Status
  status: text("status").default("open"), // open | matched | cancelled | expired
  
  // Match result (when matched)
  invitedPlayerId: varchar("invited_player_id").references(() => players.id),
  matchedWithPlayerId: varchar("matched_with_player_id").references(() => players.id),
  matchedAt: timestamp("matched_at"),

  // External court booking (Dubai community courts) — manual stop-gap until API integration.
  // Status set by player when creating: 'academy_court' | 'external_booked' | 'external_pending'
  courtBookingStatus: text("court_booking_status"),
  courtBookingNote: text("court_booking_note"),
  courtBookingUrl: text("court_booking_url"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  playerIdx: index("match_requests_player_idx").on(table.playerId),
  statusIdx: index("match_requests_status_idx").on(table.status),
  dateIdx: index("match_requests_date_idx").on(table.preferredDate),
}));

export const insertMatchRequestSchema = createInsertSchema(matchRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMatchRequest = z.infer<typeof insertMatchRequestSchema>;
export type MatchRequest = typeof matchRequests.$inferSelect;

// ==================== SMART AVAILABILITY (Phase 4) ====================

// Player Booking Preferences
export const playerBookingPreferences = pgTable("player_booking_preferences", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull().unique(),
  
  // Preferred times
  preferredDays: jsonb("preferred_days").$type<string[]>(), // ["monday", "wednesday", "friday"]
  preferredTimeWindows: jsonb("preferred_time_windows").$type<{
    start: string;
    end: string;
    priority: number;
  }[]>(), // [{ start: "18:00", end: "20:00", priority: 1 }]
  
  // Court preferences
  preferredSurfaces: jsonb("preferred_surfaces").$type<string[]>(), // ["hard", "clay"]
  preferredCourts: jsonb("preferred_courts").$type<string[]>(), // court IDs
  
  // Social preferences
  autoAcceptFriendInvites: boolean("auto_accept_friend_invites").default(false),
  openToOpenMatches: boolean("open_to_open_matches").default(true),
  preferredMatchType: text("preferred_match_type").default("any"), // singles | doubles | any
  
  // Notification preferences
  notifyOnOpenMatches: boolean("notify_on_open_matches").default(true),
  notifyOnFriendBookings: boolean("notify_on_friend_bookings").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  playerIdx: index("player_booking_preferences_player_idx").on(table.playerId),
}));

export const insertPlayerBookingPreferencesSchema = createInsertSchema(playerBookingPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayerBookingPreferences = z.infer<typeof insertPlayerBookingPreferencesSchema>;
export type PlayerBookingPreferences = typeof playerBookingPreferences.$inferSelect;

// Court Availability Snapshots - For heatmap visualization
export const courtAvailabilitySnapshots = pgTable("court_availability_snapshots", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  courtId: varchar("court_id").references(() => courts.id).notNull(),
  date: date("date").notNull(),
  hour: integer("hour").notNull(), // 0-23
  
  // Demand metrics
  bookingCount: integer("booking_count").default(0),
  totalSlots: integer("total_slots").default(1),
  demandScore: numeric("demand_score", { precision: 3, scale: 2 }).default("0.00"), // 0-1 ratio
  
  // Historical averages
  avgBookingsThisSlot: numeric("avg_bookings_this_slot", { precision: 4, scale: 2 }),
  isPopularTime: boolean("is_popular_time").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  courtDateIdx: index("court_availability_snapshots_court_date_idx").on(table.courtId, table.date),
  uniqueCourtDateHour: unique("court_availability_snapshots_unique").on(table.courtId, table.date, table.hour),
}));

export const insertCourtAvailabilitySnapshotSchema = createInsertSchema(courtAvailabilitySnapshots).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCourtAvailabilitySnapshot = z.infer<typeof insertCourtAvailabilitySnapshotSchema>;
export type CourtAvailabilitySnapshot = typeof courtAvailabilitySnapshots.$inferSelect;

// Players
export const players = pgTable("players", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  coachId: varchar("coach_id").references(() => coaches.id), // primary coach
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  tshirtSize: text("tshirt_size"), // Children: 2T, 3T, 4T, YXS, YS, YM, YL, YXL; Adults: XS, S, M, L, XL, XXL, XXXL
  height: integer("height"), // height in cm
  age: integer("age"),
  dateOfBirth: text("date_of_birth"), // ISO date string (YYYY-MM-DD)
  ballLevel: text("ball_level"), // red/orange/green/yellow/glow
  skillLevel: integer("skill_level"), // 1/2/3
  membershipType: text("membership_type"),
  medicalNotes: text("medical_notes"),
  isTest: boolean("is_test").notNull().default(false), // demo/QA accounts excluded from credit replay & analytics
  totalXp: integer("total_xp").default(0),
  level: integer("level").default(1),
  glowScore: integer("glow_score").default(0),
  glowCoins: integer("glow_coins").default(0), // In-app currency awarded from quest rewards
  streak: integer("streak").default(0),
  
  // 3-Tier Progression System
  // Tier 1: XP Level (level, totalXp) - Gamification, engagement rewards
  // Tier 2: Skill Level (ballLevel, skillLevel) - Tennis skill certification (RED_1 to YELLOW_3)
  // Tier 3: Glow Battle Power - 6 pillar scores combined for future game element
  glowBattlePower: integer("glow_battle_power").default(0), // Calculated from 6 pillar scores (0-600)
  
  // Adult Glow Rank System (Elo-based)
  glowMmr: integer("glow_mmr").default(1000), // Elo-like MMR rating (0-3000)
  glowRank: integer("glow_rank").default(9), // Bucket 1-9 (9=beginner, 1=international)
  totalMatchesPlayed: integer("total_matches_played").default(0),
  rageQuitCount: integer("rage_quit_count").default(0),
  noShowCount: integer("no_show_count").default(0),
  isAdult: boolean("is_adult").default(false), // Adults use Glow Rank, youth use ball levels
  playerPathway: text("player_pathway").default("youth"), // youth | adult | hybrid
  
  onboardingCompleted: boolean("onboarding_completed").default(false),
  motivationType: text("motivation_type"), // fun/improve/compete/unsure
  experienceLevel: text("experience_level"), // new/6-12months/1-3years/3-5years/5-10years/10-20years/20+years
  dominantHand: text("dominant_hand"), // left/right
  backhandType: text("backhand_type"), // single/double
  enjoymentTags: jsonb("enjoyment_tags").$type<string[]>(), // max 3 selections
  focusGoals: jsonb("focus_goals").$type<string[]>(), // multi-select
  selfConfidenceFlags: jsonb("self_confidence_flags").$type<string[]>(), // optional self-check
  
  // Family Lobby - Link multiple players to same parent account
  parentEmail: text("parent_email"), // Parent's email for family account linking
  parentReporting: boolean("parent_reporting").default(false), // Monthly AI progress letter to parent

  // Family PIN — used to gate sensitive family actions (e.g. minting/revoking
  // public spectator links). 4-digit string, default "1234" so first-time use
  // works without a setup step. Tracks `pinChangedAt` to surface a "change
  // your PIN" nudge in the UI when it's still the default.
  parentDashboardPin: text("parent_dashboard_pin").default("1234"),
  pinChangedAt: timestamp("pin_changed_at"),
  
  // Child Safety - Parental Controls
  chatEnabled: boolean("chat_enabled"),
  communityEnabled: boolean("community_enabled"),
  
  // Social Profile Fields (Game Character)
  profilePhotoUrl: text("profile_photo_url"),
  displayName: text("display_name"), // Optional nickname
  preferredPlayType: text("preferred_play_type"), // singles/doubles/both
  openToPlay: boolean("open_to_play").default(false), // Findable for matches
  typicalPlayTimes: jsonb("typical_play_times").$type<string[]>(), // morning/afternoon/evening/weekend
  preferredCities: jsonb("preferred_cities").$type<string[]>(), // cities/areas
  matchPreference: text("match_preference"), // casual/training/competitive
  privacyLevel: text("privacy_level").default("platform"), // everyone/platform/academy/hidden
  bio: text("bio"), // Short player bio
  lastActiveAt: timestamp("last_active_at"),
  preferredTime: text("preferred_time"), // Preferred session time (morning/afternoon/evening)
  status: text("status").default("active"), // active | inactive | suspended
  
  // New Onboarding Fields
  tennisIdol: text("tennis_idol"), // Favorite tennis player (Federer, Nadal, Alcaraz, etc.)
  favoriteShot: text("favorite_shot"), // forehand/backhand/serve/volley/dropshot
  shortTermGoal: text("short_term_goal"), // 3-month goal
  longTermDream: text("long_term_dream"), // Tennis dream/aspiration
  weeklyCommitment: text("weekly_commitment"), // 1x/2x/3x/4x+ per week
  nickname: text("nickname"), // Fun nickname for the app
  quizScore: integer("quiz_score"), // Mini tennis rules quiz score
  playStyle: varchar("play_style"), // Tennis archetype: baseline_warrior | net_ninja | serve_machine | all_court_ace | counter_puncher | tactical_mastermind
  gender: text("gender"), // male | female | prefer_not_to_say
  
  auditVerifiedAt: timestamp("audit_verified_at"),
  auditVerifiedBy: varchar("audit_verified_by"),
  
  attendanceShareToken: varchar("attendance_share_token", { length: 48 }).unique(),
  
  lastLatitude: doublePrecision("last_latitude"),
  lastLongitude: doublePrecision("last_longitude"),
  locationUpdatedAt: timestamp("location_updated_at"),
  city: text("city"),
  country: text("country"),
  
  // Home address (validated via Google Places Autocomplete)
  homeAddress: text("home_address"),
  homeLat: doublePrecision("home_lat"),
  homeLng: doublePrecision("home_lng"),
  
  // Multi-sport profiles: per-sport attributes
  // e.g., { tennis: { ballLevel: "green", skillLevel: 2 }, padel: { category: "c4" }, pickleball: { rating: "intermediate" } }
  sportProfiles: jsonb("sport_profiles").$type<Record<string, {
    ballLevel?: string | null;
    skillLevel?: number | null;
    category?: string | null;
    rating?: string | null;
  }>>(),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Speeds up the Players list (Task #628): SQL pushdown for status filter
  // per academy used by getAllPlayersWithCredits.
  index("players_academy_status_idx").on(table.academyId, table.status),
]);

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true, createdAt: true });
export const updatePlayerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email("Invalid email format").optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  age: z.number().int().min(0, "Age must be positive").max(120, "Age must be realistic").optional().nullable(),
  dateOfBirth: z.string().optional().nullable(), // ISO date string (YYYY-MM-DD)
  ballLevel: z.enum(["blue", "red", "orange", "green", "yellow", "glow"]).optional().nullable(),
  skillLevel: z.number().int().min(1).max(3).optional().nullable(),
  membershipType: z.string().optional().nullable(),
  medicalNotes: z.string().optional().nullable(),
  coachId: z.string().optional().nullable(),
  dominantHand: z.enum(["left", "right"]).optional().nullable(),
  backhandType: z.enum(["single", "double"]).optional().nullable(),
  tshirtSize: z.enum(tshirtSizes).optional().nullable(),
  height: z.number().int().min(50).max(250).optional().nullable(),
  // Social Profile Fields
  profilePhotoUrl: z.string().optional().nullable(),
  displayName: z.string().max(50).optional().nullable(),
  preferredPlayType: z.enum(["singles", "doubles", "both"]).optional().nullable(),
  openToPlay: z.boolean().optional(),
  typicalPlayTimes: z.array(z.string()).optional().nullable(),
  preferredCities: z.array(z.string()).optional().nullable(),
  matchPreference: z.enum(["casual", "training", "competitive"]).optional().nullable(),
  privacyLevel: z.enum(["everyone", "platform", "academy", "hidden"]).optional(),
  bio: z.string().max(500).optional().nullable(),
  // New Onboarding Fields
  tennisIdol: z.string().max(100).optional().nullable(),
  favoriteShot: z.enum(["forehand", "backhand", "serve", "volley", "dropshot"]).optional().nullable(),
  shortTermGoal: z.string().max(500).optional().nullable(),
  longTermDream: z.string().max(500).optional().nullable(),
  weeklyCommitment: z.enum(["1x", "2x", "3x", "4x+"]).optional().nullable(),
  nickname: z.string().max(50).optional().nullable(),
  quizScore: z.number().int().min(0).max(100).optional().nullable(),
  playStyle: z.enum(["baseline_warrior", "net_ninja", "serve_machine", "all_court_ace", "counter_puncher", "tactical_mastermind"]).optional().nullable(),
  sportProfiles: z.record(z.string(), z.object({
    ballLevel: z.string().optional().nullable(),
    skillLevel: z.number().int().min(1).max(3).optional().nullable(),
    category: z.string().optional().nullable(),
    rating: z.string().optional().nullable(),
  })).optional().nullable(),
  // Contact / family fields
  homeAddress: z.string().max(500).optional().nullable(),
  homeLat: z.number().optional().nullable(),
  homeLng: z.number().optional().nullable(),
  parentName: z.string().max(100).optional().nullable(),
  parentPhone: z.string().max(50).optional().nullable(),
  parentEmail: z.string().email("Invalid parent email").optional().nullable().or(z.literal("")),
  parentReporting: z.boolean().optional(),
  enjoymentTags: z.array(z.string()).optional().nullable(),
  gender: z.enum(["male", "female", "prefer_not_to_say"]).optional().nullable(),
}).transform((data) => ({
  ...data,
  email: data.email === "" ? null : data.email,
}));
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type UpdatePlayer = z.infer<typeof updatePlayerSchema>;
export type Player = typeof players.$inferSelect;

// Schema for player self-edit via PATCH /api/player/me/info.
// Contains only the fields a player is allowed to change themselves.
// IMPORTANT: Must remain a plain ZodObject (no .transform() at the end).
// updatePlayerSchema ends with .transform() → becomes ZodEffects → .pick() throws at runtime.
// This dedicated schema avoids that issue and also prevents mass-assignment of
// sensitive fields (coachId, skillLevel, membershipType, privacyLevel, etc.).
export const playerSelfUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  ballLevel: z.enum(["blue", "red", "orange", "green", "yellow", "glow"]).optional().nullable(),
  dominantHand: z.enum(["left", "right"]).optional().nullable(),
  backhandType: z.enum(["single", "double"]).optional().nullable(),
  tshirtSize: z.enum(tshirtSizes).optional().nullable(),
  height: z.number().int().min(50).max(250).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  medicalNotes: z.string().optional().nullable(),
  displayName: z.string().max(50).optional().nullable(),
  nickname: z.string().max(50).optional().nullable(),
  playStyle: z.enum(["baseline_warrior", "net_ninja", "serve_machine", "all_court_ace", "counter_puncher", "tactical_mastermind"]).optional().nullable(),
  tennisIdol: z.string().max(100).optional().nullable(),
  shortTermGoal: z.string().max(500).optional().nullable(),
  longTermDream: z.string().max(500).optional().nullable(),
  weeklyCommitment: z.enum(["1x", "2x", "3x", "4x+"]).optional().nullable(),
  favoriteShot: z.enum(["forehand", "backhand", "serve", "volley", "dropshot"]).optional().nullable(),
  openToPlay: z.boolean().optional(),
  typicalPlayTimes: z.array(z.string()).optional().nullable(),
  preferredCities: z.array(z.string()).optional().nullable(),
  matchPreference: z.enum(["casual", "training", "competitive"]).optional().nullable(),
  preferredPlayType: z.enum(["singles", "doubles", "both"]).optional().nullable(),
  homeAddress: z.string().max(500).optional().nullable(),
  homeLat: z.number().optional().nullable(),
  homeLng: z.number().optional().nullable(),
  parentName: z.string().max(100).optional().nullable(),
  parentPhone: z.string().max(50).optional().nullable(),
  enjoymentTags: z.array(z.string()).optional().nullable(),
  gender: z.enum(["male", "female", "prefer_not_to_say"]).optional().nullable(),
  quizScore: z.number().int().min(0).max(3).optional().nullable(),
});

// Youth Ball Stages - Constants for skill level progression
export const youthBallStages = ["red", "orange", "green", "yellow"] as const;
export type YouthBallStage = typeof youthBallStages[number];

// Helper to convert ball level to composite level (1-12)
export function getCompositeLevel(ballLevel: string, skillLevel: number): number {
  const stageIndex = youthBallStages.indexOf(ballLevel as YouthBallStage);
  if (stageIndex === -1) return 1;
  return stageIndex * 3 + skillLevel;
}

// Helper to convert composite level to ball level and skill level
export function decomposeLevel(compositeLevel: number): { ballLevel: YouthBallStage; skillLevel: number } {
  const clamped = Math.max(1, Math.min(12, compositeLevel));
  const stageIndex = Math.floor((clamped - 1) / 3);
  const skillLevel = ((clamped - 1) % 3) + 1;
  return { ballLevel: youthBallStages[stageIndex], skillLevel };
}

// Lesson Groups - For organizing players by skill level
export const lessonGroups = pgTable("lesson_groups", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id),
  
  name: text("name").notNull(),
  description: text("description"),
  
  groupType: text("group_type").default("youth"), // youth | adult | mixed
  
  // Youth level filtering (for groupType = youth or mixed)
  allowedBallLevels: jsonb("allowed_ball_levels").$type<string[]>(), // ["red", "orange"] etc.
  minSkillLevel: integer("min_skill_level").default(1), // 1-3 within ball level
  maxSkillLevel: integer("max_skill_level").default(3), // 1-3 within ball level
  
  // Adult rank filtering (for groupType = adult or mixed)
  minGlowRank: integer("min_glow_rank"), // 1-9 (1=highest, 9=beginner)
  maxGlowRank: integer("max_glow_rank"), // 1-9
  
  maxPlayers: integer("max_players").default(6),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLessonGroupSchema = createInsertSchema(lessonGroups).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLessonGroup = z.infer<typeof insertLessonGroupSchema>;
export type LessonGroup = typeof lessonGroups.$inferSelect;

// Lesson Group Members - Players assigned to groups
export const lessonGroupMembers = pgTable("lesson_group_members", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").references(() => lessonGroups.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  joinedAt: timestamp("joined_at").defaultNow(),
  status: text("status").default("active"), // active | paused | removed
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  groupPlayerUnique: unique("lesson_group_member_unique").on(table.groupId, table.playerId),
}));

export const insertLessonGroupMemberSchema = createInsertSchema(lessonGroupMembers).omit({ id: true, createdAt: true });
export type InsertLessonGroupMember = z.infer<typeof insertLessonGroupMemberSchema>;
export type LessonGroupMember = typeof lessonGroupMembers.$inferSelect;

// Player Level Events - Audit trail for skill level changes
export const playerLevelEvents = pgTable("player_level_events", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  eventType: text("event_type").notNull(), // promotion | demotion | initial_assignment | coach_override
  
  // Previous level
  fromBallLevel: text("from_ball_level"),
  fromSkillLevel: integer("from_skill_level"),
  
  // New level
  toBallLevel: text("to_ball_level").notNull(),
  toSkillLevel: integer("to_skill_level").notNull(),
  
  // Who made the change
  actorId: varchar("actor_id"), // coach/admin who made the change (null for system)
  actorType: text("actor_type"), // coach | admin | system
  
  // Reason for change
  reason: text("reason"),
  evidenceIds: jsonb("evidence_ids").$type<string[]>(), // linked skill evidence IDs
  
  // Approval status (for pending promotions)
  status: text("status").default("applied"), // pending_approval | approved | rejected | applied
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  playerIdx: index("player_level_events_player_idx").on(table.playerId),
  eventTypeIdx: index("player_level_events_type_idx").on(table.eventType),
}));

export const insertPlayerLevelEventSchema = createInsertSchema(playerLevelEvents).omit({ id: true, createdAt: true });
export type InsertPlayerLevelEvent = z.infer<typeof insertPlayerLevelEventSchema>;
export type PlayerLevelEvent = typeof playerLevelEvents.$inferSelect;

// Player Invites - For inviting players/parents to join the app
export const playerInvites = pgTable("player_invites", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  
  inviteCode: varchar("invite_code", { length: 32 }).notNull().unique(),
  
  status: text("status").default("pending"), // pending | claimed | expired | revoked
  claimedBy: varchar("claimed_by").references(() => users.id),
  
  parentName: text("parent_name"),
  parentPhone: text("parent_phone"),
  
  expiresAt: timestamp("expires_at"),
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlayerInviteSchema = createInsertSchema(playerInvites).omit({ id: true, createdAt: true });
export type InsertPlayerInvite = z.infer<typeof insertPlayerInviteSchema>;
export type PlayerInvite = typeof playerInvites.$inferSelect;

// Player Matches - Casual matches & challenges between players
export const playerMatches = pgTable("player_matches", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  // Who initiated the match
  initiatorId: varchar("initiator_id").references(() => players.id).notNull(),
  // Who received the challenge (null for open matches)
  receiverId: varchar("receiver_id").references(() => players.id),
  
  // Match details
  matchType: text("match_type").notNull(), // casual/training/friendly
  playType: text("play_type").notNull(), // singles/doubles
  
  // Location & Time
  proposedDate: timestamp("proposed_date"),
  proposedTimeSlot: text("proposed_time_slot"), // morning/afternoon/evening
  locationCity: text("location_city"),
  courtId: varchar("court_id").references(() => courts.id),
  courtBookingId: varchar("court_booking_id").references(() => courtBookings.id),
  
  // Status flow: pending -> accepted/declined/expired
  status: text("status").default("pending"), // pending/accepted/declined/cancelled/completed/expired
  
  // Message from initiator
  message: text("message"),
  
  // Response
  respondedAt: timestamp("responded_at"),
  responseMessage: text("response_message"),
  
  // Alternative time suggested
  counterProposedDate: timestamp("counter_proposed_date"),
  counterProposedTimeSlot: text("counter_proposed_time_slot"),
  
  // Result (optional, no score tracking for MVP)
  resultStatus: text("result_status"), // played/no_show/cancelled
  resultNotes: text("result_notes"),
  
  // XP awarded
  xpAwarded: integer("xp_awarded").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  initiatorIdx: index("player_matches_initiator_idx").on(table.initiatorId),
  receiverIdx: index("player_matches_receiver_idx").on(table.receiverId),
  statusIdx: index("player_matches_status_idx").on(table.status),
}));

export const insertPlayerMatchSchema = createInsertSchema(playerMatches).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  respondedAt: true,
});
export type InsertPlayerMatch = z.infer<typeof insertPlayerMatchSchema>;
export type PlayerMatch = typeof playerMatches.$inferSelect;

// Adult Glow MMR Matches - Tracked matches for Elo ranking system
export const adultGlowMatches = pgTable("adult_glow_matches", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  playerId: varchar("player_id").references(() => players.id).notNull(),
  opponentId: varchar("opponent_id").references(() => players.id).notNull(),
  
  // Result
  didWin: boolean("did_win").notNull(),
  gamesDiff: integer("games_diff").default(0), // positive = won more games
  setScore: text("set_score"), // e.g., "6-4, 7-5"
  
  // Match context
  matchType: text("match_type").default("friendly"), // friendly/ladder/tournament
  verification: text("verification").default("self_reported"), // system_verified/coach_verified/self_reported
  
  // MMR at time of match
  playerMmrBefore: integer("player_mmr_before"),
  opponentMmrBefore: integer("opponent_mmr_before"),
  mmrDelta: integer("mmr_delta"),
  
  // Timestamps
  matchDate: timestamp("match_date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  playerIdx: index("adult_glow_matches_player_idx").on(table.playerId),
  opponentIdx: index("adult_glow_matches_opponent_idx").on(table.opponentId),
  matchDateIdx: index("adult_glow_matches_date_idx").on(table.matchDate),
}));

export const insertAdultGlowMatchSchema = createInsertSchema(adultGlowMatches).omit({ 
  id: true, 
  createdAt: true,
});
export type InsertAdultGlowMatch = z.infer<typeof insertAdultGlowMatchSchema>;
export type AdultGlowMatch = typeof adultGlowMatches.$inferSelect;

// Adult Skill Assessments - Coach-evaluated skill scores for adults
export const adultSkillAssessments = pgTable("adult_skill_assessments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  playerId: varchar("player_id").references(() => players.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  
  skillId: text("skill_id").notNull(), // e.g., "ADULT_FH_CONTACT"
  score: integer("score").notNull(), // 0, 1, or 2
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  playerIdx: index("adult_skill_assessments_player_idx").on(table.playerId),
  skillIdx: index("adult_skill_assessments_skill_idx").on(table.skillId),
}));

export const insertAdultSkillAssessmentSchema = createInsertSchema(adultSkillAssessments).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true,
});
export type InsertAdultSkillAssessment = z.infer<typeof insertAdultSkillAssessmentSchema>;
export type AdultSkillAssessment = typeof adultSkillAssessments.$inferSelect;

// Player Connections - Track who has played together and friend requests
export const playerConnections = pgTable("player_connections", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  player1Id: varchar("player1_id").references(() => players.id).notNull(),
  player2Id: varchar("player2_id").references(() => players.id).notNull(),
  
  // Friend request status (player1 sends request to player2)
  status: text("status").default("pending"), // pending/accepted/declined
  
  // Stats
  matchesPlayed: integer("matches_played").default(0),
  lastPlayedAt: timestamp("last_played_at"),
  
  // Relationship (optional)
  connectionType: text("connection_type"), // friend/rival/training_partner
  
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
}, (table) => ({
  player1Idx: index("player_connections_player1_idx").on(table.player1Id),
  player2Idx: index("player_connections_player2_idx").on(table.player2Id),
  statusIdx: index("player_connections_status_idx").on(table.status),
  // Unique index on the unordered (player1Id, player2Id) pair, scoped to
  // friend connections. Prevents duplicate friend requests/connections for
  // the same pair regardless of who sent the request first.
  // See migration: server/migrations/20260422_player_connections_friend_unique.sql
  friendPairUnique: uniqueIndex("player_connections_friend_pair_unique")
    .on(
      sql`LEAST(${table.player1Id}, ${table.player2Id})`,
      sql`GREATEST(${table.player1Id}, ${table.player2Id})`,
    )
    .where(sql`${table.connectionType} = 'friend'`),
}));

export type PlayerConnection = typeof playerConnections.$inferSelect;

// Package Templates - Reusable package definitions (defined by academy owner)
export const packageTemplates = pgTable("package_templates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  
  name: text("name").notNull(), // e.g., "10 Lesson Pack", "Monthly Unlimited"
  description: text("description"),
  
  credits: integer("credits").notNull(), // Number of lessons included
  price: numeric("price").notNull(), // Price in academy currency
  currency: text("currency").default("AED"),
  
  validityDays: integer("validity_days").default(90), // How long until credits expire
  sessionType: text("session_type"), // private | semi | group | null (any)
  
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPackageTemplateSchema = createInsertSchema(packageTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPackageTemplate = z.infer<typeof insertPackageTemplateSchema>;
export type PackageTemplate = typeof packageTemplates.$inferSelect;

// Credit Package Templates (V2) — replaces the legacy `package_templates` table.
// Same shape as the V1 table; data is copied 1:1 by the 0016 migration. The V1
// table stays in place (inert) until Task #692 finally drops it; all live reads
// and writes go through this table from Task #692 step 1 onwards.
export const creditPackageTemplates = pgTable("credit_package_templates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),

  name: text("name").notNull(),
  description: text("description"),

  credits: integer("credits").notNull(),
  price: numeric("price").notNull(),
  currency: text("currency").default("AED"),

  validityDays: integer("validity_days").default(90),
  sessionType: text("session_type"),

  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  academyIdx: index("credit_package_templates_academy_idx").on(table.academyId),
}));

export const insertCreditPackageTemplateSchema = createInsertSchema(creditPackageTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCreditPackageTemplate = z.infer<typeof insertCreditPackageTemplateSchema>;
export type CreditPackageTemplate = typeof creditPackageTemplates.$inferSelect;

// Packages (Credits) - Assigned to players
// Can be linked to a specific class (seriesId) or be a general credit pool
export const packages = pgTable("packages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  playerId: varchar("player_id").references(() => players.id),
  templateId: varchar("template_id").references(() => packageTemplates.id),
  
  name: text("name"), // Copy from template or custom name
  
  // Credit type - determines which session types this package can be used for
  creditType: text("credit_type").default("group"), // group | private | semi_private | court (1 court credit = 5 AED)
  
  // Optional: Link package to specific class - credits only valid for this class
  // If null, credits can be used for any class the player is member of
  seriesId: varchar("series_id"),
  
  totalCredits: numeric("total_credits").notNull(),
  remainingCredits: numeric("remaining_credits").notNull(),
  
  price: numeric("price"), // Price paid for this package (auto-calculated from academy pricing)
  pricePerCredit: numeric("price_per_credit"), // Unit price snapshot at purchase time
  currency: text("currency").default("AED"),
  
  purchaseDate: timestamp("purchase_date").defaultNow(),
  expiryDate: date("expiry_date"),
  
  // Invoice tracking
  invoiceId: varchar("invoice_id"),
  
  status: text("status").default("active"), // active | expired | depleted
  isPaid: boolean("is_paid").default(false), // Whether payment has been received for this package
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  playerIdx: index("packages_player_idx").on(table.playerId),
  seriesIdx: index("packages_series_idx").on(table.seriesId),
  statusIdx: index("packages_status_idx").on(table.status),
  creditTypeIdx: index("packages_credit_type_idx").on(table.creditType),
}));

export const insertPackageSchema = createInsertSchema(packages).omit({ id: true, createdAt: true });
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packages.$inferSelect;

// Alias for backwards compatibility - playerCreditPackages references the packages table
export const playerCreditPackages = packages;

// Sessions
export const sessions = pgTable("sessions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  coachId: varchar("coach_id").references(() => coaches.id),
  courtId: varchar("court_id").references(() => courts.id),
  locationId: varchar("location_id").references(() => locations.id),
  
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  duration: integer("duration").notNull(), // minutes
  
  sessionType: text("session_type").notNull(), // private/semi/group/physical/activity
  ballLevel: text("ball_level"),
  // Multi-level group support: when a group session targets more than one ball
  // level (e.g. RED + BLUE kids together), we persist the full set here. The
  // legacy `ballLevel` column is kept as the primary level (= ballLevels[0])
  // so older readers continue to work unchanged.
  ballLevels: jsonb("ball_levels").$type<string[]>(),
  skillLevel: integer("skill_level"),
  
  title: text("title"), // Display name like "Sunset Rally", "Glow Doubles"
  maxPlayers: integer("max_players").default(6), // Max players for group sessions
  xpReward: integer("xp_reward").default(20), // XP earned for attending
  vibe: text("vibe").default("casual"), // casual/competitive
  minLevel: integer("min_level"), // Minimum player level
  maxLevel: integer("max_level"), // Maximum player level
  
  isRecurring: boolean("is_recurring").default(false),
  recurringGroupId: varchar("recurring_group_id"),
  seriesId: varchar("series_id"), // References coachingSeries.id - links session to its parent series
  weekNumber: integer("week_number"), // Which week in the series (1, 2, 3...)
  weekCount: integer("week_count"), // 1/5/10/15/20
  isModifiedFromSeries: boolean("is_modified_from_series").default(false), // edited individually
  isSkipped: boolean("is_skipped").default(false), // manually skipped
  skipReason: text("skip_reason"), // holiday/weather/other
  
  travelTime: integer("travel_time").default(0), // minutes
  
  paymentStatus: text("payment_status").default("unpaid"), // paid/unpaid/partial/package
  price: numeric("price"),
  
  // Layer 3: Price Snapshots - frozen at booking time
  academyPrice: numeric("academy_price"), // What player pays (snapshot from academyPricing)
  coachPayout: numeric("coach_payout"), // What coach earns (snapshot from coachContracts)
  academyMargin: numeric("academy_margin"), // academyPrice - coachPayout (calculated)
  pricingCurrency: text("pricing_currency").default("AED"),
  
  status: text("status").default("scheduled"), // scheduled/cancelled/completed
  
  // Cancellation tracking
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: varchar("cancelled_by"), // coach_id who marked the cancellation
  cancellationReason: text("cancellation_reason"), // Reason provided by coach for cancellation
  isLastMinuteCancellation: boolean("is_last_minute_cancellation").default(false),
  cancellationCharged: boolean("cancellation_charged").default(false),
  cancellationChargeAmount: numeric("cancellation_charge_amount"),
  coachReviewedAt: timestamp("coach_reviewed_at"), // Set when coach manually saves attendance

  googleCalendarEventId: text("google_calendar_event_id"), // External Google Calendar event ID for sync
  
  reminder1hSent: boolean("reminder_1h_sent").default(false),
  reminder30mSent: boolean("reminder_30m_sent").default(false),
  reflectionReminderSent: boolean("reflection_reminder_sent").default(false),
  
  // Multi-sport support
  sport: text("sport").default("tennis"), // tennis | padel | pickleball

  // Credit System V2 — how many credits this session consumes per attending player.
  // Default 1 (one credit per session). Premium sessions can be set higher.
  creditCost: numeric("credit_cost").default("1"),

  // External court booking declaration (community courts that require external reservation,
  // e.g. Playtomic). Mirrors the same triplet on bookingRequests / matches / etc.
  courtBookingStatus: text("court_booking_status"), // 'academy_court' | 'external_booked' | 'external_pending'
  courtBookingNote: text("court_booking_note"),
  courtBookingUrl: text("court_booking_url"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Coaching Series - The primary entity for recurring training blocks
// Coaches think in series: "Monday 17:00 Green Kids for 30 weeks"
// Sessions are derived instances of a series
export const coachingSeries = pgTable("coaching_series", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  coachId: varchar("coach_id").references(() => coaches.id),
  courtId: varchar("court_id").references(() => courts.id),
  locationId: varchar("location_id").references(() => locations.id),
  
  // Display name like "Monday Green Group", "Private Kevin"
  title: text("title").notNull(),
  
  // Schedule
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 1=Monday, etc.
  startTime: text("start_time").notNull(), // "HH:MM" format
  duration: integer("duration").notNull(), // minutes
  
  // Series details
  sessionType: text("session_type").notNull(), // private/semi/group/physical/activity
  ballLevel: text("ball_level"),
  // Multi-level group support — see comment on `sessions.ballLevels` above.
  ballLevels: jsonb("ball_levels").$type<string[]>(),
  skillLevel: integer("skill_level"),
  maxPlayers: integer("max_players").default(6), // Max capacity
  
  // Timeline
  weekCount: integer("week_count"), // total weeks in series (null = open-ended)
  seriesStartDate: date("series_start_date").notNull(),
  seriesEndDate: date("series_end_date"), // calculated from weekCount or set manually
  
  // Gamification
  xpPerSession: integer("xp_per_session").default(20),
  vibe: text("vibe").default("casual"), // casual/competitive
  
  // Pricing
  price: numeric("price"), // Price per session
  
  // Status: active/paused/ended
  status: text("status").default("active"),
  pausedAt: timestamp("paused_at"),
  endedAt: timestamp("ended_at"),
  
  // Multi-sport support
  sport: text("sport").default("tennis"), // tennis | padel | pickleball
  
  // Marketplace / public drop-in
  isPublic: boolean("is_public").notNull().default(false), // Whether this group is publicly listed for drop-in bookings
  publicDropInPrice: numeric("public_drop_in_price"), // Optional drop-in price per session
  
  courtBookingStatus: text("court_booking_status"), // 'academy_court' | 'external_booked' | 'external_pending'
  courtBookingNote: text("court_booking_note"),
  courtBookingUrl: text("court_booking_url"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCoachingSeriesSchema = createInsertSchema(coachingSeries).omit({ id: true, createdAt: true });
export type InsertCoachingSeries = z.infer<typeof insertCoachingSeriesSchema>;
export type CoachingSeries = typeof coachingSeries.$inferSelect;

// Series Players (Class Memberships) - Players assigned to a coaching series/class
// This is THE key table for the membership model:
// - Players join a class on a specific date
// - Can pause for vacation periods
// - Can leave/switch classes
// - Credits are consumed per active membership when sessions occur
export const seriesPlayers = pgTable("series_players", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  seriesId: varchar("series_id").references(() => coachingSeries.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  // Player's status in the series
  status: text("status").default("active"), // active/paused/left
  joinedAt: timestamp("joined_at").defaultNow(),
  leftAt: timestamp("left_at"),
  
  // Vacation/Pause tracking - player stays in class but credits not consumed
  pauseFrom: date("pause_from"),
  pauseUntil: date("pause_until"),
  pauseReason: text("pause_reason"), // holiday/injury/travel/other
  
  // Progress tracking
  sessionsAttended: integer("sessions_attended").default(0),
  totalXpEarned: integer("total_xp_earned").default(0),
  
  // Credit tracking - which package to consume credits from for this membership
  // Task #698: FK to packages dropped — packages table is inert post Task #682.
  // Column is kept as a denormalized reference (matches credit_lots.source_package_id).
  linkedPackageId: varchar("linked_package_id"),
  
  // Guest membership - temporary player in a group (e.g., during merges/holidays)
  isGuest: boolean("is_guest").default(false),
  guestUntil: date("guest_until"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  seriesPlayerIdx: index("series_players_series_player_idx").on(table.seriesId, table.playerId),
  statusIdx: index("series_players_status_idx").on(table.status),
}));

export const insertSeriesPlayerSchema = createInsertSchema(seriesPlayers).omit({ id: true });
export type InsertSeriesPlayer = z.infer<typeof insertSeriesPlayerSchema>;
export type SeriesPlayer = typeof seriesPlayers.$inferSelect;

// Legacy: Keep recurringSeries for backwards compatibility
// TODO: Migrate existing data to coachingSeries
export const recurringSeries = pgTable("recurring_series", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  coachId: varchar("coach_id").references(() => coaches.id),
  courtId: varchar("court_id").references(() => courts.id),
  locationId: varchar("location_id").references(() => locations.id),
  
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 1=Monday, etc.
  startTime: text("start_time").notNull(), // "HH:MM" format
  duration: integer("duration").notNull(), // minutes
  
  sessionType: text("session_type").notNull(),
  ballLevel: text("ball_level"),
  skillLevel: integer("skill_level"),
  
  weekCount: integer("week_count").notNull(), // total weeks in series
  seriesStartDate: date("series_start_date").notNull(),
  seriesEndDate: date("series_end_date"),
  
  price: numeric("price"),
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRecurringSeriesSchema = createInsertSchema(recurringSeries).omit({ id: true, createdAt: true });
export type InsertRecurringSeries = z.infer<typeof insertRecurringSeriesSchema>;
export type RecurringSeries = typeof recurringSeries.$inferSelect;

// Session Players
export const sessionPlayers = pgTable("session_players", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id),
  playerId: varchar("player_id").references(() => players.id),
  
  attendanceStatus: text("attendance_status"), // present/late/absent/holiday
  lateMinutes: integer("late_minutes"),
  absenceReason: text("absence_reason"), // sick/forgot/traffic/holiday/no-show/other
  
  isGuest: boolean("is_guest").default(false),
  joinType: text("join_type").default("member"), // member | drop_in
  
  xpAwarded: integer("xp_awarded"),
  notes: text("notes"),
  
  // Credit tracking - timestamp when credits were deducted for this enrollment
  creditDeductedAt: timestamp("credit_deducted_at"),
  creditTransactionId: varchar("credit_transaction_id"), // Links to player_credit_history
}, (table) => [
  // Speeds up getPlayersLastSessions IN(...) lookup on Players list hot path (Task #628).
  index("session_players_player_idx").on(table.playerId),
]);

export const insertSessionPlayerSchema = createInsertSchema(sessionPlayers).omit({ id: true });
export type InsertSessionPlayer = z.infer<typeof insertSessionPlayerSchema>;
export type SessionPlayer = typeof sessionPlayers.$inferSelect;

// Session Waitlist - Players waiting to join full sessions
export const sessionWaitlist = pgTable("session_waitlist", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  position: integer("position").notNull(), // 1, 2, 3... position in queue
  xpBonusOnJoin: integer("xp_bonus_on_join").default(5), // Bonus XP if they get in
  
  status: text("status").default("waiting"), // waiting/offered/claimed/promoted/cancelled/expired/insufficient_credits
  offeredAt: timestamp("offered_at"), // When the spot was offered to this player
  claimWindowMinutes: integer("claim_window_minutes").default(30), // How long they have to claim
  promotedAt: timestamp("promoted_at"), // When they claimed/got a spot
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSessionWaitlistSchema = createInsertSchema(sessionWaitlist).omit({ id: true, createdAt: true });
export type InsertSessionWaitlist = z.infer<typeof insertSessionWaitlistSchema>;
export type SessionWaitlist = typeof sessionWaitlist.$inferSelect;

// Squads - Groups of players who play together
export const squads = pgTable("squads", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  
  name: text("name").notNull(), // "Maple Wolves", "Night Owls"
  description: text("description"),
  badge: text("badge"), // Icon or badge identifier
  
  totalXp: integer("total_xp").default(0), // Combined XP earned as squad
  weekStreak: integer("week_streak").default(0), // Weeks playing together
  
  maxMembers: integer("max_members").default(8),
  isPublic: boolean("is_public").default(true), // Can others join?
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSquadSchema = createInsertSchema(squads).omit({ id: true, createdAt: true });
export type InsertSquad = z.infer<typeof insertSquadSchema>;
export type Squad = typeof squads.$inferSelect;

// Squad Members - Players in squads
export const squadMembers = pgTable("squad_members", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  squadId: varchar("squad_id").references(() => squads.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  role: text("role").default("member"), // leader/captain/member
  joinedAt: timestamp("joined_at").defaultNow(),
  
  xpContributed: integer("xp_contributed").default(0), // XP earned for this squad
});

export const insertSquadMemberSchema = createInsertSchema(squadMembers).omit({ id: true, joinedAt: true });
export type InsertSquadMember = z.infer<typeof insertSquadMemberSchema>;
export type SquadMember = typeof squadMembers.$inferSelect;

// Player Session Cancellations - Detailed tracking for cancellations/unavailability
export const playerSessionCancellations = pgTable("player_session_cancellations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id),
  playerId: varchar("player_id").references(() => players.id),
  academyId: varchar("academy_id").references(() => academies.id),
  
  sessionType: text("session_type").notNull(), // private/semi/group - original type at time of cancellation
  cancellationType: text("cancellation_type").notNull(), // cancel/unavailable/no_show
  
  reason: text("reason").notNull(), // sick/schedule_conflict/weather/vacation/other
  reasonText: text("reason_text"), // Custom explanation for "other"
  
  cancelledAt: timestamp("cancelled_at").defaultNow(),
  sessionDate: timestamp("session_date").notNull(), // Original session date for timing calculations
  hoursBeforeSession: integer("hours_before_session"), // Calculated hours before session
  
  isLateCancel: boolean("is_late_cancel").default(false), // Within policy window
  billingStatus: text("billing_status").default("pending"), // pending/charged/not_charged/waived
  
  makeUpEligibility: text("make_up_eligibility").default("not_eligible"), // eligible/not_eligible/granted/used
  makeUpSessionId: varchar("make_up_session_id"), // If make-up was granted, link to replacement session
  makeUpGrantedBy: varchar("make_up_granted_by"), // coach/owner who approved
  makeUpGrantedAt: timestamp("make_up_granted_at"),
  
  notifiedCoach: boolean("notified_coach").default(false),
  coachNotifiedAt: timestamp("coach_notified_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlayerSessionCancellationSchema = createInsertSchema(playerSessionCancellations).omit({ id: true, createdAt: true });
export type InsertPlayerSessionCancellation = z.infer<typeof insertPlayerSessionCancellationSchema>;
export type PlayerSessionCancellation = typeof playerSessionCancellations.$inferSelect;

// Player Holidays
export const playerHolidays = pgTable("player_holidays", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
});

export const insertPlayerHolidaySchema = createInsertSchema(playerHolidays).omit({ id: true });
export type InsertPlayerHoliday = z.infer<typeof insertPlayerHolidaySchema>;
export type PlayerHoliday = typeof playerHolidays.$inferSelect;

// Session Feedback
export const sessionFeedback = pgTable("session_feedback", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id),
  
  intensity: text("intensity"), // light/normal/intense
  mood: text("mood"), // good/neutral/low
  focusTags: text("focus_tags"), // JSON array as text
  coachNotes: text("coach_notes"),
});

export const insertSessionFeedbackSchema = createInsertSchema(sessionFeedback).omit({ id: true });
export type InsertSessionFeedback = z.infer<typeof insertSessionFeedbackSchema>;
export type SessionFeedback = typeof sessionFeedback.$inferSelect;

// In-Session Player Feedback - Real-time feedback during sessions with visibility control
export const inSessionFeedback = pgTable("in_session_feedback", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  coachId: varchar("coach_id").references(() => users.id).notNull(),
  
  // Feedback type: praise, technique, effort, focus, attitude, attendance, custom
  feedbackType: text("feedback_type").notNull(),
  
  // The actual feedback message
  message: text("message").notNull(),
  
  // Visibility: public (shows in player app, XP eligible) or private (coach only)
  visibility: text("visibility").notNull().default("private"),
  
  // Optional XP bonus for positive public feedback
  xpAwarded: integer("xp_awarded").default(0),
  
  // Pillar association for skill-based feedback
  pillarId: text("pillar_id"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInSessionFeedbackSchema = createInsertSchema(inSessionFeedback).omit({ id: true, createdAt: true });
export type InsertInSessionFeedback = z.infer<typeof insertInSessionFeedbackSchema>;
export type InSessionFeedback = typeof inSessionFeedback.$inferSelect;

// Audit Logs - Enhanced for payment tracking and admin actions
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  entityType: text("entity_type").notNull(), // payment/session/player/court/location/settings
  entityId: varchar("entity_id"),
  action: text("action").notNull(), // create/update/delete/confirm/reject
  performedBy: varchar("performed_by"),
  performedByRole: text("performed_by_role"), // admin/coach/owner
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  metadata: text("metadata"), // JSON string with additional context
  ipAddress: text("ip_address"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Platform Config - Central configuration for the entire platform
export const platformConfig = pgTable("platform_config", {
  key: varchar("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by"),
});

export const insertPlatformConfigSchema = createInsertSchema(platformConfig);
export type InsertPlatformConfig = z.infer<typeof insertPlatformConfigSchema>;
export type PlatformConfig = typeof platformConfig.$inferSelect;

// Offline Queue (V2)
export const offlineQueue = pgTable("offline_queue", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id"),
  actionType: text("action_type").notNull(),
  payload: jsonb("payload"),
  synced: boolean("synced").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOfflineQueueSchema = createInsertSchema(offlineQueue).omit({ id: true, createdAt: true });
export type InsertOfflineQueue = z.infer<typeof insertOfflineQueueSchema>;
export type OfflineQueue = typeof offlineQueue.$inferSelect;

// Player Notes (Coach Memory Hub)
export const playerNotes = pgTable("player_notes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id),
  coachId: varchar("coach_id").references(() => coaches.id),
  content: text("content").notNull(),
  category: text("category").default("general").notNull(), // technique/mental/physical/general/next-lesson
  isPinned: boolean("is_pinned").default(false).notNull(),
  sessionId: varchar("session_id").references(() => sessions.id), // optional link to session
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlayerNoteSchema = createInsertSchema(playerNotes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayerNote = z.infer<typeof insertPlayerNoteSchema>;
export type PlayerNote = typeof playerNotes.$inferSelect;

// Player Progress Snapshots
export const playerProgress = pgTable("player_progress", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id),
  coachId: varchar("coach_id").references(() => coaches.id),
  sessionId: varchar("session_id").references(() => sessions.id),
  
  skillArea: text("skill_area").notNull(), // forehand/backhand/serve/volley/movement/mental
  rating: integer("rating"), // 1-5 rating
  trend: text("trend"), // up/stable/down
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlayerProgressSchema = createInsertSchema(playerProgress).omit({ id: true, createdAt: true });
export type InsertPlayerProgress = z.infer<typeof insertPlayerProgressSchema>;
export type PlayerProgress = typeof playerProgress.$inferSelect;

// Session Templates
export const sessionTemplates = pgTable("session_templates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id),
  name: text("name").notNull(),
  sessionType: text("session_type").notNull(),
  duration: integer("duration").notNull(),
  ballLevel: text("ball_level"),
  skillLevel: integer("skill_level"),
  defaultPlayerIds: jsonb("default_player_ids"), // JSON array of player IDs
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSessionTemplateSchema = createInsertSchema(sessionTemplates).omit({ id: true, createdAt: true });
export type InsertSessionTemplate = z.infer<typeof insertSessionTemplateSchema>;
export type SessionTemplate = typeof sessionTemplates.$inferSelect;

// Coach Notifications
export const coachNotifications = pgTable("coach_notifications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id),
  type: text("type").notNull(), // auto_renew/payment/feedback/holiday/absence/reminder
  title: text("title").notNull(),
  message: text("message").notNull(),
  priority: text("priority").default("medium"), // high/medium/low
  isRead: boolean("is_read").default(false),
  actionUrl: text("action_url"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCoachNotificationSchema = createInsertSchema(coachNotifications).omit({ id: true, createdAt: true });
export type InsertCoachNotification = z.infer<typeof insertCoachNotificationSchema>;
export type CoachNotification = typeof coachNotifications.$inferSelect;

// ==================== PROGRESS ENGINE V2 ====================

// Skill Domains (Technical, Mental, Physical, Social, Tactical)
export const skillDomains = pgTable("skill_domains", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // technical/mental/physical/social/tactical
  displayName: text("display_name").notNull(),
  description: text("description"),
  icon: text("icon"), // icon name for UI
  color: text("color"), // theme color for domain (hex)
  sortOrder: integer("sort_order").default(0),
});

export const insertSkillDomainSchema = createInsertSchema(skillDomains).omit({ id: true });
export type InsertSkillDomain = z.infer<typeof insertSkillDomainSchema>;
export type SkillDomain = typeof skillDomains.$inferSelect;

// Player Skill State - Current state per player per domain
export const playerSkillState = pgTable("player_skill_state", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  domainId: varchar("domain_id").references(() => skillDomains.id).notNull(),
  
  progressValue: integer("progress_value").default(0).notNull(), // 0-100
  trend: text("trend").default("stable"), // improving/stable/focus
  momentum: text("momentum").default("building"), // building/strong/slowing
  confidenceScore: integer("confidence_score").default(50), // internal score for protection
  
  // Assessment status
  assessmentStatus: text("assessment_status"), // not_yet/developing/meets/above
  lastAssessmentDate: timestamp("last_assessment_date"),
  
  // Cooldown tracking
  lastUpDate: timestamp("last_up_date"),
  upCountRecent: integer("up_count_recent").default(0), // count of ↑ in recent sessions
  downCountRecent: integer("down_count_recent").default(0), // count of ↓ in recent sessions
  
  // Progress freeze
  isFrozen: boolean("is_frozen").default(false),
  freezeReason: text("freeze_reason"), // holiday/injury
  
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlayerSkillStateSchema = createInsertSchema(playerSkillState).omit({ id: true, updatedAt: true });
export type InsertPlayerSkillState = z.infer<typeof insertPlayerSkillStateSchema>;
export type PlayerSkillState = typeof playerSkillState.$inferSelect;

// Session Skill Observations - Individual coach observations per session
export const sessionSkillObservations = pgTable("session_skill_observations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  domainId: varchar("domain_id").references(() => skillDomains.id).notNull(),
  
  direction: text("direction").notNull(), // up/stable/down
  effortLevel: text("effort_level").notNull(), // high/normal/low
  note: text("note"),
  
  // Calculated impact (after anti-abuse rules)
  rawDelta: integer("raw_delta"), // original delta before rules
  appliedDelta: integer("applied_delta"), // actual delta after rules
  
  // Anti-abuse tracking
  wasDownGuarded: boolean("was_down_guarded").default(false),
  wasCooldownApplied: boolean("was_cooldown_applied").default(false),
  diminishingReturnFactor: numeric("diminishing_return_factor"), // 1.0, 0.7, 0.5, 0.3
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSessionSkillObservationSchema = createInsertSchema(sessionSkillObservations).omit({ id: true, createdAt: true });
export type InsertSessionSkillObservation = z.infer<typeof insertSessionSkillObservationSchema>;
export type SessionSkillObservation = typeof sessionSkillObservations.$inferSelect;

// Level Requirements - What's needed for each ball level
export const levelRequirements = pgTable("level_requirements", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ballLevel: text("ball_level").notNull(), // red1/red2/red3/orange1/orange2/orange3/green1/green2/green3/yellow
  domainId: varchar("domain_id").references(() => skillDomains.id).notNull(),
  
  minStatus: text("min_status").notNull(), // not_yet/developing/meets/above
  minProgressValue: integer("min_progress_value"), // optional minimum 0-100
  minSessionsAtLevel: integer("min_sessions_at_level").default(8), // minimum exposure
  
  description: text("description"),
});

export const insertLevelRequirementSchema = createInsertSchema(levelRequirements).omit({ id: true });
export type InsertLevelRequirement = z.infer<typeof insertLevelRequirementSchema>;
export type LevelRequirement = typeof levelRequirements.$inferSelect;

// Coach Stats Rollup - For anti-abuse calibration (V2)
export const coachStatsRollup = pgTable("coach_stats_rollup", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  
  // Rolling 30-session stats
  highEffortRate30: numeric("high_effort_rate_30"), // % of high effort given
  upRate30: numeric("up_rate_30"), // % of ↑ observations
  downRate30: numeric("down_rate_30"), // % of ↓ observations
  avgUpPerSession: numeric("avg_up_per_session"),
  
  // Calibration factor
  severityFactor: numeric("severity_factor").default("1.0"), // 0.9-1.1 for normalization
  
  // Flags
  isHighEffortSpammer: boolean("is_high_effort_spammer").default(false),
  isUpSpammer: boolean("is_up_spammer").default(false),
  
  lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
});

export const insertCoachStatsRollupSchema = createInsertSchema(coachStatsRollup).omit({ id: true, lastCalculatedAt: true });
export type InsertCoachStatsRollup = z.infer<typeof insertCoachStatsRollupSchema>;
export type CoachStatsRollup = typeof coachStatsRollup.$inferSelect;

// Player Progress Flags - For tracking issues (V2)
export const playerProgressFlags = pgTable("player_progress_flags", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  flagType: text("flag_type").notNull(), // farm_flag/inconsistency_flag/speedrun_flag
  severity: text("severity").default("low"), // low/medium/high
  isActive: boolean("is_active").default(true),
  
  description: text("description"),
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertPlayerProgressFlagSchema = createInsertSchema(playerProgressFlags).omit({ id: true, createdAt: true });
export type InsertPlayerProgressFlag = z.infer<typeof insertPlayerProgressFlagSchema>;
export type PlayerProgressFlag = typeof playerProgressFlags.$inferSelect;

// Domain Assessments - Formal evaluation snapshots
export const domainAssessments = pgTable("domain_assessments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  domainId: varchar("domain_id").references(() => skillDomains.id).notNull(),
  
  status: text("status").notNull(), // not_yet/developing/meets/above
  previousStatus: text("previous_status"),
  
  notes: text("notes"),
  isBaseline: boolean("is_baseline").default(false), // first assessment for player
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDomainAssessmentSchema = createInsertSchema(domainAssessments).omit({ id: true, createdAt: true });
export type InsertDomainAssessment = z.infer<typeof insertDomainAssessmentSchema>;
export type DomainAssessment = typeof domainAssessments.$inferSelect;

// XP Transactions - Track XP gains
export const xpTransactions = pgTable("xp_transactions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  sessionId: varchar("session_id").references(() => sessions.id),
  
  xpAmount: integer("xp_amount").notNull(),
  source: text("source").notNull(), // session/effort_bonus/skill_improvement/quest/streak/milestone
  
  description: text("description"),
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertXpTransactionSchema = createInsertSchema(xpTransactions).omit({ id: true, createdAt: true });
export type InsertXpTransaction = z.infer<typeof insertXpTransactionSchema>;
export type XpTransaction = typeof xpTransactions.$inferSelect;

// ==================== COACH XP SYSTEM ====================

// Coach XP Transactions - Track coach XP gains
export const coachXpTransactions = pgTable("coach_xp_transactions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  sessionId: varchar("session_id").references(() => sessions.id),
  
  xpAmount: integer("xp_amount").notNull(),
  source: text("source").notNull(), // session_complete/feedback/player_growth/streak/consistency
  
  description: text("description"),
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCoachXpTransactionSchema = createInsertSchema(coachXpTransactions).omit({ id: true, createdAt: true });
export type InsertCoachXpTransaction = z.infer<typeof insertCoachXpTransactionSchema>;
export type CoachXpTransaction = typeof coachXpTransactions.$inferSelect;

// ==================== GLOW CHAT SYSTEM ====================

// Conversations - Chat threads between participants
export const conversations = pgTable("conversations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // coach_player, coach_parent, coach_coach, group, provider_player
  title: text("title"), // For group chats
  
  // Academy scoping for multi-tenant isolation
  academyId: varchar("academy_id").references(() => academies.id),
  
  // Context for coach_player chats
  playerId: varchar("player_id").references(() => players.id),
  coachId: varchar("coach_id").references(() => coaches.id),

  // Context for provider_player chats
  providerId: varchar("provider_id").references(() => serviceProviders.id),
  orderId: varchar("order_id").references(() => shopOrders.id), // Links chat to a specific shop order
  
  lastMessageAt: timestamp("last_message_at"),
  lastMessagePreview: text("last_message_preview"),
  
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// Conversation Participants - Who is in each chat
export const conversationParticipants = pgTable("conversation_participants", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  
  // Academy scoping for multi-tenant isolation
  academyId: varchar("academy_id").references(() => academies.id),
  
  // Participant can be coach, player, parent, or provider
  participantType: text("participant_type").notNull(), // coach, player, parent, provider
  coachId: varchar("coach_id").references(() => coaches.id),
  playerId: varchar("player_id").references(() => players.id),
  providerId: varchar("provider_id").references(() => serviceProviders.id),
  
  role: text("role").default("member"), // owner, admin, member
  canPost: boolean("can_post").default(true),
  
  lastReadAt: timestamp("last_read_at"),
  muteUntil: timestamp("mute_until"),
  
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const insertConversationParticipantSchema = createInsertSchema(conversationParticipants).omit({ id: true, joinedAt: true });
export type InsertConversationParticipant = z.infer<typeof insertConversationParticipantSchema>;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;

// Messages - Individual chat messages
export const messages = pgTable("messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  
  // Academy scoping for multi-tenant isolation
  academyId: varchar("academy_id").references(() => academies.id),
  
  // Sender - null for system messages
  senderType: text("sender_type"), // coach, player, parent, provider, system
  senderCoachId: varchar("sender_coach_id").references(() => coaches.id),
  senderPlayerId: varchar("sender_player_id").references(() => players.id),
  senderProviderId: varchar("sender_provider_id").references(() => serviceProviders.id),
  
  body: text("body").notNull(),
  messageType: text("message_type").default("text"), // text, quick_feedback, system, xp_award
  
  replyToId: varchar("reply_to_id"), // For threaded replies
  
  // XP awarded for this message (if any)
  xpAwarded: integer("xp_awarded"),
  
  isEdited: boolean("is_edited").default(false),
  isDeleted: boolean("is_deleted").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Message Reactions - Emoji reactions on messages
export const messageReactions = pgTable("message_reactions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").references(() => messages.id).notNull(),
  
  // Academy scoping for multi-tenant isolation
  academyId: varchar("academy_id").references(() => academies.id),
  
  // Reactor
  reactorType: text("reactor_type").notNull(), // coach, player, parent
  reactorCoachId: varchar("reactor_coach_id").references(() => coaches.id),
  reactorPlayerId: varchar("reactor_player_id").references(() => players.id),
  
  emoji: text("emoji").notNull(), // thumbsup, heart, fire, trophy, star
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageReactionSchema = createInsertSchema(messageReactions).omit({ id: true, createdAt: true });
export type InsertMessageReaction = z.infer<typeof insertMessageReactionSchema>;
export type MessageReaction = typeof messageReactions.$inferSelect;

// User Quick Replies — custom chat quick-phrase chips per user
export const userQuickReplies = pgTable("user_quick_replies", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  body: text("body").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  byUserIdx: index("user_quick_replies_user_idx").on(table.userId),
}));

export const insertUserQuickReplySchema = createInsertSchema(userQuickReplies).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserQuickReply = z.infer<typeof insertUserQuickReplySchema>;
export type UserQuickReply = typeof userQuickReplies.$inferSelect;

// ==================== AVAILABILITY & COURT PREFERENCES ====================

// Coach Availability - Weekly time blocks
export const coachAvailability = pgTable("coach_availability", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  academyId: varchar("academy_id").references(() => academies.id),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  locationId: varchar("location_id").references(() => locations.id),
  courtId: varchar("court_id").references(() => courts.id),
  
  weekday: integer("weekday").notNull(), // 0=Sunday, 1=Monday, etc.
  startTime: text("start_time").notNull(), // HH:MM format
  endTime: text("end_time").notNull(), // HH:MM format
  slotDuration: integer("slot_duration").default(60), // minutes per booking slot
  
  sessionTypes: text("session_types"), // Comma-separated: "private,group,semi"
  
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCoachAvailabilitySchema = createInsertSchema(coachAvailability).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoachAvailability = z.infer<typeof insertCoachAvailabilitySchema>;
export type CoachAvailability = typeof coachAvailability.$inferSelect;

// Availability Exceptions - Overrides for specific dates
export const availabilityExceptions = pgTable("availability_exceptions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  
  reason: text("reason"), // holiday/sick/tournament/personal
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAvailabilityExceptionSchema = createInsertSchema(availabilityExceptions).omit({ id: true, createdAt: true });
export type InsertAvailabilityException = z.infer<typeof insertAvailabilityExceptionSchema>;
export type AvailabilityException = typeof availabilityExceptions.$inferSelect;

// Coach Court Preferences - Priority list of courts
export const coachCourtPreferences = pgTable("coach_court_preferences", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  courtId: varchar("court_id").references(() => courts.id).notNull(),
  
  priority: integer("priority").default(0), // Lower = higher priority
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCoachCourtPreferenceSchema = createInsertSchema(coachCourtPreferences).omit({ id: true, createdAt: true });
export type InsertCoachCourtPreference = z.infer<typeof insertCoachCourtPreferenceSchema>;
export type CoachCourtPreference = typeof coachCourtPreferences.$inferSelect;

// Coach Court Rules - Global court preferences
export const coachCourtRules = pgTable("coach_court_rules", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull().unique(),
  
  preferredType: text("preferred_type").default("no_preference"), // indoor/outdoor/no_preference
  daylightOnly: boolean("daylight_only").default(false),
  maxSessionsPerCourtPerDay: integer("max_sessions_per_court_per_day").default(8),
  maxTotalSessionsPerDay: integer("max_total_sessions_per_day").default(10),
  
  fallbackBehavior: text("fallback_behavior").default("suggest"), // suggest/block
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCoachCourtRulesSchema = createInsertSchema(coachCourtRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoachCourtRules = z.infer<typeof insertCoachCourtRulesSchema>;
export type CoachCourtRules = typeof coachCourtRules.$inferSelect;

// Coach Settings - Minimum session length, buffer time, etc.
export const coachSettings = pgTable("coach_settings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull().unique(),
  
  minSessionLength: integer("min_session_length").default(30), // minutes: 30/45/60/90
  bufferBetweenSessions: integer("buffer_between_sessions").default(0), // minutes: 0/10/15/30
  
  availabilityPaused: boolean("availability_paused").default(false),
  
  // Booking response window (minutes): 30 / 60 / 120 / 360 / 1440
  bookingResponseWindowMinutes: integer("booking_response_window_minutes").default(120),
  
  // Auto-approve rules
  autoApproveReturningPlayers: boolean("auto_approve_returning_players").default(false),
  autoApproveAdvancedBookings: boolean("auto_approve_advanced_bookings").default(false), // booked 48h+ in advance
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCoachSettingsSchema = createInsertSchema(coachSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoachSettings = z.infer<typeof insertCoachSettingsSchema>;
export type CoachSettings = typeof coachSettings.$inferSelect;

// ==================== PHASE 3: ACADEMY MANAGEMENT ====================

// Academy Settings - Extended settings for academies
export const academySettings = pgTable("academy_settings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull().unique(),
  
  address: text("address"),
  city: text("city"),
  country: text("country"),
  timezone: text("timezone").default("Asia/Dubai"),
  currency: text("currency").default("AED"),
  
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 7 }).default("#2ECC40"),
  
  defaultSessionDuration: integer("default_session_duration").default(60),
  workingHoursStart: integer("working_hours_start").default(6), // 6 AM
  workingHoursEnd: integer("working_hours_end").default(22), // 10 PM
  
  billingEnabled: boolean("billing_enabled").default(false),
  billingMode: text("billing_mode").default("hybrid"), // per_lesson | package | monthly | hybrid
  
  defaultLessonPrice: numeric("default_lesson_price").default("100"), // Default price for pay-per-lesson
  invoiceDueDays: integer("invoice_due_days").default(14), // Days until invoice is due
  
  // Cancellation Policy
  cancellationPolicyEnabled: boolean("cancellation_policy_enabled").default(true),
  cancellationWindowHours: integer("cancellation_window_hours").default(24), // Hours before session when policy kicks in
  cancellationChargePercent: integer("cancellation_charge_percent").default(100), // Percentage charged for late cancellation (0-100)
  
  // Onboarding Welcome Video
  welcomeVideoUrl: text("welcome_video_url"), // YouTube or custom video URL for player onboarding
  
  vatRegistrationNumber: text("vat_registration_number"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAcademySettingsSchema = createInsertSchema(academySettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAcademySettings = z.infer<typeof insertAcademySettingsSchema>;
export type AcademySettings = typeof academySettings.$inferSelect;

// Academy Invites - For inviting coaches to join
export const academyInvites = pgTable("academy_invites", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  
  email: text("email").notNull(),
  role: text("role").default("coach"), // coach | assistant
  inviteCode: varchar("invite_code", { length: 32 }).notNull().unique(),
  
  status: text("status").default("pending"), // pending | accepted | expired | revoked
  invitedBy: varchar("invited_by").references(() => coaches.id),
  acceptedBy: varchar("accepted_by").references(() => coaches.id),
  
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAcademyInviteSchema = createInsertSchema(academyInvites).omit({ id: true, createdAt: true });
export type InsertAcademyInvite = z.infer<typeof insertAcademyInviteSchema>;
export type AcademyInvite = typeof academyInvites.$inferSelect;

// Provider Invites — platform owner invites service providers
export const providerInvites = pgTable("provider_invites", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  invitedEmail: text("invited_email"), // optional — pre-set email
  invitedName: text("invited_name"),   // optional — pre-set display name
  createdBy: varchar("created_by").notNull(), // userId of platform_owner
  usedBy: varchar("used_by"),          // userId of the new service_provider
  usedAt: timestamp("used_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProviderInviteSchema = createInsertSchema(providerInvites).omit({ id: true, createdAt: true, usedBy: true, usedAt: true });
export type InsertProviderInvite = z.infer<typeof insertProviderInviteSchema>;
export type ProviderInvite = typeof providerInvites.$inferSelect;

// Coach Academy Memberships - For multi-academy support
export const coachAcademyMemberships = pgTable("coach_academy_memberships", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  
  role: text("role").default("coach"), // platform_owner | academy_owner | coach | assistant | head_coach | freelance_partner
  isActive: boolean("is_active").default(true),
  isPrimary: boolean("is_primary").default(false), // default academy for this coach
  
  // Per-academy pricing (each academy sets their own rate for this coach)
  hourlyRate: numeric("hourly_rate"), // Rate this academy pays the coach
  sessionBillingMode: text("session_billing_mode").default("academy_managed"), // academy_managed | self_service
  payoutType: text("payout_type").default("per_hour"), // per_hour | per_session | monthly | custom
  
  joinedAt: timestamp("joined_at").defaultNow(),
  leftAt: timestamp("left_at"),
});

export const insertCoachAcademyMembershipSchema = createInsertSchema(coachAcademyMemberships).omit({ id: true, joinedAt: true });
export type InsertCoachAcademyMembership = z.infer<typeof insertCoachAcademyMembershipSchema>;
export type CoachAcademyMembership = typeof coachAcademyMemberships.$inferSelect;

// Coach Time Blocks - Unified availability ledger across ALL academies
// Every session/block across all academies writes here to prevent double-booking
export const coachTimeBlocks = pgTable("coach_time_blocks", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  
  // Source of the block
  sourceType: text("source_type").notNull(), // session | personal | travel | blocked
  sourceAcademyId: varchar("source_academy_id").references(() => academies.id), // Which academy owns this block
  sourceSessionId: varchar("source_session_id"), // references sessions.id if from session
  
  // Time range (HH:MM format for display)
  date: date("date").notNull(),
  startTime: text("start_time").notNull(), // "HH:MM"
  endTime: text("end_time").notNull(), // "HH:MM"
  
  // UTC minutes since midnight for precise timezone-safe comparisons
  startUtcMinutes: integer("start_utc_minutes"), // minutes since midnight UTC
  endUtcMinutes: integer("end_utc_minutes"), // minutes since midnight UTC
  
  // Status
  status: text("status").default("confirmed"), // confirmed | cancelled | tentative
  
  // Visibility to other academies
  isPrivate: boolean("is_private").default(false), // If true, other academies see "Busy" only
  blockReason: text("block_reason"), // For personal blocks: vacation, sick, personal, etc.
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  coachDateIdx: index("coach_time_blocks_coach_date_idx").on(table.coachId, table.date),
  coachStatusIdx: index("coach_time_blocks_coach_status_idx").on(table.coachId, table.status),
}));

export const insertCoachTimeBlockSchema = createInsertSchema(coachTimeBlocks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoachTimeBlock = z.infer<typeof insertCoachTimeBlockSchema>;
export type CoachTimeBlock = typeof coachTimeBlocks.$inferSelect;

// ==================== PHASE 3: PUSH NOTIFICATIONS ====================

// Push Device Tokens - Store Expo push tokens
export const pushDeviceTokens = pgTable("push_device_tokens", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id),
  playerId: varchar("player_id").references(() => players.id),
  
  token: text("token").notNull(),
  platform: text("platform").notNull(), // ios | android | web
  deviceName: text("device_name"),
  
  isActive: boolean("is_active").default(true),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPushDeviceTokenSchema = createInsertSchema(pushDeviceTokens).omit({ id: true, createdAt: true, lastUsedAt: true });
export type InsertPushDeviceToken = z.infer<typeof insertPushDeviceTokenSchema>;
export type PushDeviceToken = typeof pushDeviceTokens.$inferSelect;

// Notification Preferences - User notification settings
export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull().unique(),
  
  sessionReminders: boolean("session_reminders").default(true),
  feedbackRequests: boolean("feedback_requests").default(true),
  packageExpiry: boolean("package_expiry").default(true),
  loadWarnings: boolean("load_warnings").default(true),
  chatMessages: boolean("chat_messages").default(true),
  
  reminderMinutesBefore: integer("reminder_minutes_before").default(30),
  quietHoursStart: integer("quiet_hours_start"), // e.g., 22 for 10 PM
  quietHoursEnd: integer("quiet_hours_end"), // e.g., 7 for 7 AM
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;

// Scheduled Notifications - For reminders and alerts
export const scheduledNotifications = pgTable("scheduled_notifications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  
  type: text("type").notNull(), // session_reminder | feedback_request | package_expiry | load_warning
  scheduledFor: timestamp("scheduled_for").notNull(),
  
  title: text("title").notNull(),
  body: text("body").notNull(),
  data: jsonb("data"), // Additional payload data
  
  status: text("status").default("pending"), // pending | sent | failed | cancelled
  sentAt: timestamp("sent_at"),
  error: text("error"),
  
  relatedEntityType: text("related_entity_type"), // session | package | player
  relatedEntityId: varchar("related_entity_id"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScheduledNotificationSchema = createInsertSchema(scheduledNotifications).omit({ id: true, createdAt: true });
export type InsertScheduledNotification = z.infer<typeof insertScheduledNotificationSchema>;
export type ScheduledNotification = typeof scheduledNotifications.$inferSelect;

// ==================== PHASE 3: BILLING & PAYMENTS ====================

// Billing Accounts - Stripe customer per academy
export const billingAccounts = pgTable("billing_accounts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull().unique(),
  
  stripeCustomerId: text("stripe_customer_id"),
  stripeAccountId: text("stripe_account_id"), // For Stripe Connect
  
  billingEmail: text("billing_email"),
  billingName: text("billing_name"),
  
  status: text("status").default("active"), // active | suspended | cancelled
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBillingAccountSchema = createInsertSchema(billingAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBillingAccount = z.infer<typeof insertBillingAccountSchema>;
export type BillingAccount = typeof billingAccounts.$inferSelect;

// Subscription Plans - Academy subscription tiers
export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  name: text("name").notNull(), // Starter | Pro | Enterprise
  stripePriceId: text("stripe_price_id"),
  
  monthlyPrice: numeric("monthly_price").notNull(),
  yearlyPrice: numeric("yearly_price"),
  currency: text("currency").default("USD"),
  
  maxCoaches: integer("max_coaches").default(1),
  maxPlayers: integer("max_players").default(50),
  maxLocations: integer("max_locations").default(1),
  
  features: jsonb("features"), // Array of feature flags
  
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({ id: true, createdAt: true });
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;

// Subscriptions - Active academy subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  planId: varchar("plan_id").references(() => subscriptionPlans.id).notNull(),
  
  stripeSubscriptionId: text("stripe_subscription_id"),
  
  status: text("status").default("active"), // active | past_due | cancelled | trialing
  billingPeriod: text("billing_period").default("monthly"), // monthly | yearly
  
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  trialEndsAt: timestamp("trial_ends_at"),
  cancelledAt: timestamp("cancelled_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// Invoices - Generated invoices for packages or sessions
export const invoices = pgTable("invoices", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  playerId: varchar("player_id").references(() => players.id),
  // Task #698: FK to packages dropped — packages table is inert post Task #682.
  // Column kept; lots endpoint LEFT JOINs invoices.package_id = credit_lots.source_package_id.
  packageId: varchar("package_id"),
  sessionId: varchar("session_id").references(() => sessions.id), // For pay-per-lesson invoices
  
  invoiceNumber: text("invoice_number").notNull(),
  stripeInvoiceId: text("stripe_invoice_id"),
  
  invoiceType: text("invoice_type").default("manual"), // manual | session | package | monthly
  
  amount: numeric("amount").notNull(),
  currency: text("currency").default("AED"),
  
  status: text("status").default("pending"), // draft | pending | paid | void | uncollectible
  dueDate: date("due_date"),
  paidAt: timestamp("paid_at"),
  
  lineItems: jsonb("line_items"), // Array of line items
  notes: text("notes"),
  paymentMethod: text("payment_method").default("cash"), // cash | bank_transfer | stripe
  
  billToName: text("bill_to_name"),
  billToEmail: text("bill_to_email"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// Payments - Payment records (Manual payments for MVP - cash & bank transfer)
export const payments = pgTable("payments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  playerId: varchar("player_id").references(() => players.id),
  invoiceId: varchar("invoice_id").references(() => invoices.id),
  
  payerName: text("payer_name"),
  
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  
  amount: numeric("amount").notNull(),
  currency: text("currency").default("AED"),
  
  status: text("status").default("pending"), // pending | confirmed | rejected
  paymentMethod: text("payment_method"), // cash | bank_transfer
  paymentDate: timestamp("payment_date").defaultNow(),
  
  receivedBy: varchar("received_by").references(() => coaches.id),
  confirmedBy: varchar("confirmed_by").references(() => coaches.id),
  confirmedAt: timestamp("confirmed_at"),
  rejectedBy: varchar("rejected_by").references(() => coaches.id),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  proofUrl: text("proof_url"),
  notes: text("notes"),

  // Task #975 — link a payments row back to a package and record who/why
  // a coach or admin booked the row. Lets the player Payments tab show
  // coach-recorded payments and lets us guard against double-marking.
  packageId: varchar("package_id"),
  source: text("source"), // 'player' | 'coach_mark_paid' | 'coach_manual_cash'
  recordedByUserId: varchar("recorded_by_user_id"),

  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Credit Transactions - Track credit usage for session joins, cancellations, and make-up credits
export const creditTransactions = pgTable("credit_transactions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id),
  sessionId: varchar("session_id").references(() => sessions.id),
  // Task #698: FK to packages dropped — packages table is inert post Task #682.
  packageId: varchar("package_id"), // Which package the credits came from/went to (denormalized)
  sessionPlayerId: varchar("session_player_id").references(() => sessionPlayers.id), // Links to specific session_player record for uniqueness
  
  type: text("type").notNull(), // credit | debit | refund | make_up_grant | make_up_used
  creditType: text("credit_type"), // group | private | semi_private | court - type of credits being transacted
  amount: numeric("amount").notNull(), // positive for credit, negative for debit (supports 0.5, 1.5 etc)
  reason: text("reason").notNull(), // session_consumed | session_debt | session_settlement | session_cancel | make_up_granted | make_up_lesson_used | package_purchased | admin_adjustment
  
  // Unique event key for idempotency: "consume:<sessionPlayerId>" prevents duplicate consumptions
  eventKey: varchar("event_key"),
  
  balanceBefore: integer("balance_before"),
  balanceAfter: integer("balance_after"),
  
  metadata: jsonb("metadata"), // Additional context like session type, payment method
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Prevent duplicate credit transactions for the same player/session/reason combination
  // This is critical for billing correctness under concurrent writes
  index("credit_transactions_player_session_idx").on(table.playerId, table.sessionId),
  index("credit_transactions_package_idx").on(table.packageId),
  index("credit_transactions_credit_type_idx").on(table.creditType),
  // Partial expression index to accelerate the unsettled-debt aggregation
  // used by getPlayersCreditBalances on the Players list hot path.
  // Created in DB via CREATE INDEX CONCURRENTLY (Task #628).
  index("credit_transactions_unsettled_debt_idx")
    .on(table.playerId, table.creditType)
    .where(sql`amount < 0
      AND COALESCE(metadata->>'settled', 'false') != 'true'
      AND COALESCE(metadata->>'cancelled', 'false') != 'true'`),
  // BULLETPROOF: eventKey unique constraint prevents duplicate consumptions at DB level
  unique("credit_transactions_event_key_unique").on(table.eventKey),
]);

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({ id: true, createdAt: true });
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;

// Player Subscriptions - What players SHOULD pay (contracts, not auto-payments)
// These are administrative records representing billing agreements, not Stripe subscriptions
export const playerSubscriptions = pgTable("player_subscriptions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  planName: text("plan_name").notNull(), // e.g., "Weekly Training", "Monthly Unlimited"
  price: numeric("price").notNull(),
  currency: text("currency").default("AED"),
  
  billingPeriod: text("billing_period").default("monthly"), // weekly | monthly
  sessionsPerPeriod: integer("sessions_per_period"), // Optional - number of sessions included
  
  status: text("status").default("active"), // active | paused | cancelled
  
  startDate: date("start_date").notNull(),
  endDate: date("end_date"), // Nullable - ongoing if null
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlayerSubscriptionSchema = createInsertSchema(playerSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayerSubscription = z.infer<typeof insertPlayerSubscriptionSchema>;
export type PlayerSubscription = typeof playerSubscriptions.$inferSelect;

// Refunds - Refund records
export const refunds = pgTable("refunds", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  paymentId: varchar("payment_id").references(() => payments.id).notNull(),
  
  stripeRefundId: text("stripe_refund_id"),
  
  amount: numeric("amount").notNull(),
  reason: text("reason"), // duplicate | fraudulent | requested_by_customer | other
  notes: text("notes"),
  
  status: text("status").default("pending"), // pending | succeeded | failed
  processedBy: varchar("processed_by").references(() => coaches.id),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRefundSchema = createInsertSchema(refunds).omit({ id: true, createdAt: true });
export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type Refund = typeof refunds.$inferSelect;

// Coach Payouts - Monthly payments to coaches
export const coachPayouts = pgTable("coach_payouts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),
  
  hoursWorked: numeric("hours_worked").default("0"),
  hourlyRate: numeric("hourly_rate").notNull(),
  grossAmount: numeric("gross_amount").notNull(),
  
  status: text("status").default("pending"), // pending | approved | paid | declined
  declineReason: text("decline_reason"),
  
  paidAt: timestamp("paid_at"),
  paidBy: varchar("paid_by").references(() => coaches.id),
  paymentMethod: text("payment_method"), // bank_transfer | cash | cheque
  paymentReference: text("payment_reference"),
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCoachPayoutSchema = createInsertSchema(coachPayouts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoachPayout = z.infer<typeof insertCoachPayoutSchema>;
export type CoachPayout = typeof coachPayouts.$inferSelect;

// ==================== DIAGNOSTICS ====================

// Diagnostic Reports - Error reports from app crashes
export const diagnosticReports = pgTable("diagnostic_reports", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  errorId: text("error_id").notNull(), // Client-generated UUID for deduplication
  
  userId: varchar("user_id").references(() => users.id),
  academyId: varchar("academy_id").references(() => academies.id),
  userRole: text("user_role"), // platform_owner | academy_owner | coach | player
  
  severity: text("severity").default("error"), // error | warning | critical
  
  message: text("message").notNull(),
  stack: text("stack"),
  screen: text("screen"), // Current screen/route name
  
  context: jsonb("context"), // Device info, app version, etc.
  userComment: text("user_comment"), // Optional comment from user
  
  platform: text("platform"), // ios | android | web
  appVersion: text("app_version"),
  deviceInfo: text("device_info"),
  
  status: text("status").default("new"), // new | investigating | resolved | ignored
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDiagnosticReportSchema = createInsertSchema(diagnosticReports).omit({ id: true, createdAt: true });
export type InsertDiagnosticReport = z.infer<typeof insertDiagnosticReportSchema>;
export type DiagnosticReport = typeof diagnosticReports.$inferSelect;

// ==================== PLAYER BOOKING SYSTEM ====================

// Booking Requests - Player lesson requests (pending approval)
export const bookingRequests = pgTable("booking_requests", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  academyId: varchar("academy_id").references(() => academies.id),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id), // null = "any available coach"
  locationId: varchar("location_id").references(() => locations.id),
  courtId: varchar("court_id").references(() => courts.id),
  
  requestedStart: timestamp("requested_start").notNull(),
  requestedEnd: timestamp("requested_end").notNull(),
  duration: integer("duration").notNull(), // minutes
  
  sessionType: text("session_type").notNull(), // private | semi | group
  
  playerNote: text("player_note"), // Optional message from player
  
  status: text("status").default("pending"), // pending | approved | declined | cancelled
  
  respondedBy: varchar("responded_by").references(() => coaches.id),
  respondedAt: timestamp("responded_at"),
  responseNote: text("response_note"), // Reason for decline or alternative suggestion
  
  sessionId: varchar("session_id").references(() => sessions.id), // Set when approved
  
  // Booking approval flow enhancements
  expiresAt: timestamp("expires_at"), // When coach's response window expires
  declineReason: text("decline_reason"), // Preset reason: schedule_conflict | skill_mismatch | court_unavailable | personal | response_timeout
  coachWelcomeMessage: text("coach_welcome_message"), // Optional welcome msg when approving
  
  // Counter-proposal fields
  counterProposedStart: timestamp("counter_proposed_start"),
  counterProposedEnd: timestamp("counter_proposed_end"),
  counterProposedAt: timestamp("counter_proposed_at"),
  counterProposalStatus: text("counter_proposal_status"), // pending | accepted | declined
  
  // Pre-confirm quick message
  coachPreConfirmMessage: text("coach_pre_confirm_message"),
  playerPreConfirmReply: text("player_pre_confirm_reply"),
  
  // Deduplication for 24h pre-lesson reminder push
  preLessonReminderSentAt: timestamp("pre_lesson_reminder_sent_at"),

  // External court booking (Dubai community courts) — manual stop-gap until API integration
  courtBookingStatus: text("court_booking_status"), // 'academy_court' | 'external_booked' | 'external_pending'
  courtBookingNote: text("court_booking_note"),
  courtBookingUrl: text("court_booking_url"),

  // Task #1093 — How the player intends to pay for the lesson when the
  // request is approved. 'credits' (deduct from wallet on approval — default
  // / legacy behaviour), 'pay_later' (cash/bank transfer settled by coach
  // off-line). Card payments don't go through this table — they materialise
  // a session directly via the Stripe webhook.
  // Task #1100 — once the coach taps "Mark paid" on a pay_later booking we
  // flip this column to 'paid' so the "Awaiting payment" pill clears (and a
  // confirmed payments row is recorded as the money-side audit trail).
  paymentIntent: text("payment_intent"), // 'credits' | 'pay_later' | 'paid' | null

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBookingRequestSchema = createInsertSchema(bookingRequests).omit({ id: true, createdAt: true, updatedAt: true, respondedBy: true, respondedAt: true });
export type InsertBookingRequest = z.infer<typeof insertBookingRequestSchema>;
export type BookingRequest = typeof bookingRequests.$inferSelect;

// ==================== PARENT PORTAL ====================

// Parent-Player Relationships - Links parents to their children
export const parentPlayerRelations = pgTable("parent_player_relations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  parentUserId: varchar("parent_user_id").references(() => users.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  relationship: text("relationship").default("parent"), // parent | guardian | sponsor
  isPrimary: boolean("is_primary").default(true), // Primary contact for this player
  
  canViewInvoices: boolean("can_view_invoices").default(true),
  canViewProgress: boolean("can_view_progress").default(true),
  canReceiveNotifications: boolean("can_receive_notifications").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertParentPlayerRelationSchema = createInsertSchema(parentPlayerRelations).omit({ id: true, createdAt: true });
export type InsertParentPlayerRelation = z.infer<typeof insertParentPlayerRelationSchema>;
export type ParentPlayerRelation = typeof parentPlayerRelations.$inferSelect;

// Parent Settings - Parent-specific preferences
export const parentSettings = pgTable("parent_settings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  
  invoiceEmail: text("invoice_email"), // Separate email for invoices (optional)
  preferredLanguage: text("preferred_language").default("en"),
  
  // Payment Notification Preferences
  notifyInvoiceCreated: boolean("notify_invoice_created").default(true),
  notifyPaymentReminder: boolean("notify_payment_reminder").default(true),
  notifyPaymentOverdue: boolean("notify_payment_overdue").default(true),
  notifyPaymentConfirmed: boolean("notify_payment_confirmed").default(true),
  
  // Reminder Settings
  reminderDaysBefore: integer("reminder_days_before").default(3), // Days before due date
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertParentSettingsSchema = createInsertSchema(parentSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertParentSettings = z.infer<typeof insertParentSettingsSchema>;
export type ParentSettings = typeof parentSettings.$inferSelect;

// Payment Reminders - Scheduled payment reminder notifications
export const paymentReminders = pgTable("payment_reminders", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  invoiceId: varchar("invoice_id").references(() => invoices.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  reminderType: text("reminder_type").notNull(), // created | reminder | overdue | confirmed
  scheduledFor: timestamp("scheduled_for").notNull(),
  
  status: text("status").default("pending"), // pending | sent | cancelled
  sentAt: timestamp("sent_at"),
  
  notificationId: varchar("notification_id"), // Reference to push notification sent
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPaymentReminderSchema = createInsertSchema(paymentReminders).omit({ id: true, createdAt: true, sentAt: true });
export type InsertPaymentReminder = z.infer<typeof insertPaymentReminderSchema>;
export type PaymentReminder = typeof paymentReminders.$inferSelect;

// Coach Payment Rules - How coaches get paid
export const coachPaymentRules = pgTable("coach_payment_rules", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  coachId: varchar("coach_id").references(() => coaches.id).notNull().unique(),
  academyId: varchar("academy_id").references(() => academies.id),
  
  paymentType: text("payment_type").notNull().default("hourly"), // hourly | commission | hybrid
  
  // Hourly rate settings
  hourlyRate: numeric("hourly_rate"), // Base hourly rate
  privateSessionRate: numeric("private_session_rate"), // Rate for private lessons
  groupSessionRate: numeric("group_session_rate"), // Rate for group lessons
  
  // Commission settings  
  commissionPercentage: numeric("commission_percentage"), // % of session price
  
  // Hybrid settings (fixed + commission)
  hybridBaseRate: numeric("hybrid_base_rate"), // Fixed base per session
  hybridCommissionPercentage: numeric("hybrid_commission_percentage"), // Additional % on top
  
  currency: text("currency").default("AED"),
  
  isActive: boolean("is_active").default(true),
  effectiveFrom: timestamp("effective_from").defaultNow(),
  effectiveTo: timestamp("effective_to"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCoachPaymentRuleSchema = createInsertSchema(coachPaymentRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoachPaymentRule = z.infer<typeof insertCoachPaymentRuleSchema>;
export type CoachPaymentRule = typeof coachPaymentRules.$inferSelect;

// Coach Earnings - Calculated earnings per session
export const coachEarnings = pgTable("coach_earnings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id),
  sessionId: varchar("session_id").references(() => sessions.id),
  
  amount: numeric("amount").notNull(),
  currency: text("currency").default("AED"),
  
  // Calculation details
  calculationType: text("calculation_type").notNull(), // hourly | commission | hybrid | manual
  sessionDuration: integer("session_duration"), // minutes
  sessionPrice: numeric("session_price"), // original session price
  
  // Status
  status: text("status").default("pending"), // pending | confirmed | paid
  confirmedAt: timestamp("confirmed_at"),
  paidAt: timestamp("paid_at"),
  
  // Period tracking
  earningMonth: integer("earning_month").notNull(), // 1-12
  earningYear: integer("earning_year").notNull(),
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCoachEarningSchema = createInsertSchema(coachEarnings).omit({ id: true, createdAt: true });
export type InsertCoachEarning = z.infer<typeof insertCoachEarningSchema>;
export type CoachEarning = typeof coachEarnings.$inferSelect;

// ==================== COACH REVIEW SYSTEM ====================

// Review Categories (1-5 rating each)
export const reviewCategories = ["coachingQuality", "communication", "withKidsBeginners", "reliability", "feedbackMotivation"] as const;
export type ReviewCategory = typeof reviewCategories[number];

// Player age categories for semi-anonymous display
export const reviewerAgeCategories = ["kid", "teen", "adult"] as const;
export type ReviewerAgeCategory = typeof reviewerAgeCategories[number];

// Coach Reviews - Player reviews of coaches (only after 3+ sessions)
export const coachReviews = pgTable("coach_reviews", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id),
  
  // Category ratings (1-5)
  coachingQuality: integer("coaching_quality").notNull(),
  communication: integer("communication").notNull(),
  withKidsBeginners: integer("with_kids_beginners").notNull(),
  reliability: integer("reliability").notNull(),
  feedbackMotivation: integer("feedback_motivation").notNull(),
  
  // Calculated overall score (average of 5 categories)
  overallScore: numeric("overall_score").notNull(),
  
  // Guided text responses (optional)
  whatDoesWell: text("what_does_well"),
  bestForPlayerType: text("best_for_player_type"),
  
  // Semi-anonymous reviewer info (visible to public)
  reviewerAgeCategory: text("reviewer_age_category"), // kid | teen | adult
  reviewerLevel: text("reviewer_level"), // red | orange | green | yellow
  
  // Validation metadata
  sessionCountAtReview: integer("session_count_at_review").notNull(), // How many sessions player had with coach
  
  // Visibility & moderation
  isVisible: boolean("is_visible").default(false), // Only visible after 3+ reviews exist
  isHidden: boolean("is_hidden").default(false), // Hidden by moderation
  hiddenReason: text("hidden_reason"),
  hiddenBy: varchar("hidden_by"),
  hiddenAt: timestamp("hidden_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  coachIdx: index("coach_reviews_coach_idx").on(table.coachId),
  playerIdx: index("coach_reviews_player_idx").on(table.playerId),
  visibleIdx: index("coach_reviews_visible_idx").on(table.isVisible, table.isHidden),
}));

export const insertCoachReviewSchema = createInsertSchema(coachReviews).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  isVisible: true,
  isHidden: true,
  hiddenReason: true,
  hiddenBy: true,
  hiddenAt: true,
});

export const submitReviewSchema = z.object({
  coachId: z.string().min(1),
  coachingQuality: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  withKidsBeginners: z.number().int().min(1).max(5),
  reliability: z.number().int().min(1).max(5),
  feedbackMotivation: z.number().int().min(1).max(5),
  whatDoesWell: z.string().max(500).optional(),
  bestForPlayerType: z.string().max(200).optional(),
});

export type InsertCoachReview = z.infer<typeof insertCoachReviewSchema>;
export type CoachReview = typeof coachReviews.$inferSelect;
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

// Review Responses - Coach replies to reviews
export const reviewResponses = pgTable("review_responses", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  reviewId: varchar("review_id").references(() => coachReviews.id).notNull().unique(),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  
  responseText: text("response_text").notNull(),
  
  // Moderation
  isHidden: boolean("is_hidden").default(false),
  hiddenReason: text("hidden_reason"),
  hiddenBy: varchar("hidden_by"),
  hiddenAt: timestamp("hidden_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReviewResponseSchema = createInsertSchema(reviewResponses).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  isHidden: true,
  hiddenReason: true,
  hiddenBy: true,
  hiddenAt: true,
});
export type InsertReviewResponse = z.infer<typeof insertReviewResponseSchema>;
export type ReviewResponse = typeof reviewResponses.$inferSelect;

// Review Flags - Moderation flags for reviews
export const reviewFlags = pgTable("review_flags", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  reviewId: varchar("review_id").references(() => coachReviews.id).notNull(),
  flaggedBy: varchar("flagged_by").references(() => users.id).notNull(),
  
  reason: text("reason").notNull(), // inappropriate | fake | spam | other
  details: text("details"),
  
  status: text("status").default("pending"), // pending | reviewed | dismissed | action_taken
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  actionTaken: text("action_taken"),
  internalNote: text("internal_note"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReviewFlagSchema = createInsertSchema(reviewFlags).omit({ 
  id: true, 
  createdAt: true,
  status: true,
  reviewedBy: true,
  reviewedAt: true,
  actionTaken: true,
  internalNote: true,
});
export type InsertReviewFlag = z.infer<typeof insertReviewFlagSchema>;
export type ReviewFlag = typeof reviewFlags.$inferSelect;

// Review Prompts - Track when to show review prompts to players
export const reviewPrompts = pgTable("review_prompts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  playerId: varchar("player_id").references(() => players.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  
  // Trigger info
  triggerType: text("trigger_type").notNull(), // session_threshold | package_complete | month_milestone
  triggerAt: timestamp("trigger_at").notNull(), // When to show prompt
  
  // Status
  status: text("status").default("pending"), // pending | shown | completed | dismissed | expired
  shownAt: timestamp("shown_at"),
  completedAt: timestamp("completed_at"),
  dismissedAt: timestamp("dismissed_at"),
  
  // Link to resulting review
  reviewId: varchar("review_id").references(() => coachReviews.id),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  playerCoachIdx: index("review_prompts_player_coach_idx").on(table.playerId, table.coachId),
  statusIdx: index("review_prompts_status_idx").on(table.status),
}));

export const insertReviewPromptSchema = createInsertSchema(reviewPrompts).omit({ 
  id: true, 
  createdAt: true,
  shownAt: true,
  completedAt: true,
  dismissedAt: true,
  reviewId: true,
});
export type InsertReviewPrompt = z.infer<typeof insertReviewPromptSchema>;
export type ReviewPrompt = typeof reviewPrompts.$inferSelect;

// Aggregated Coach Review Stats (for quick display on coach profiles)
export const coachReviewStats = pgTable("coach_review_stats", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  coachId: varchar("coach_id").references(() => coaches.id).notNull().unique(),
  
  // Overall stats
  totalReviews: integer("total_reviews").default(0),
  visibleReviews: integer("visible_reviews").default(0), // Reviews meeting visibility threshold
  averageOverall: numeric("average_overall"),
  
  // Category averages
  avgCoachingQuality: numeric("avg_coaching_quality"),
  avgCommunication: numeric("avg_communication"),
  avgWithKidsBeginners: numeric("avg_with_kids_beginners"),
  avgReliability: numeric("avg_reliability"),
  avgFeedbackMotivation: numeric("avg_feedback_motivation"),
  
  // Breakdown by reviewer type
  kidReviewCount: integer("kid_review_count").default(0),
  teenReviewCount: integer("teen_review_count").default(0),
  adultReviewCount: integer("adult_review_count").default(0),
  
  // Level breakdown
  redLevelCount: integer("red_level_count").default(0),
  orangeLevelCount: integer("orange_level_count").default(0),
  greenLevelCount: integer("green_level_count").default(0),
  yellowLevelCount: integer("yellow_level_count").default(0),
  
  // Best-for tags (calculated from reviews)
  bestForTags: jsonb("best_for_tags").$type<string[]>().default([]), // e.g., ["kids", "beginners", "red level"]
  
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const insertCoachReviewStatsSchema = createInsertSchema(coachReviewStats).omit({ id: true, lastUpdated: true });
export type InsertCoachReviewStats = z.infer<typeof insertCoachReviewStatsSchema>;
export type CoachReviewStats = typeof coachReviewStats.$inferSelect;

// ==================== 3-LAYER PRICING SYSTEM ====================
// Layer 1: Academy Pricing - What players/parents pay per session type
// Layer 2: Coach Compensation - What coaches earn (per academy contract)
// Layer 3: Session Snapshots - Frozen prices at booking time

// Layer 1: Academy Pricing - Set by academy admin, visible to players
export const academyPricing = pgTable("academy_pricing", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  
  sessionType: text("session_type").notNull(), // private | semi_private | group | physical | activity
  
  pricePerSession: numeric("price_per_session").notNull(),
  currency: text("currency").default("AED"),
  
  // Per-person vs per-session pricing
  isPerPerson: boolean("is_per_person").default(false), // true = price is per participant, false = flat rate per session
  
  // Duration-based pricing (optional - for hourly rates)
  duration: integer("duration"), // minutes - if null, flat rate per session
  pricePerHour: numeric("price_per_hour"), // Alternative: hourly rate
  
  // For versioning - when prices change, old sessions keep old prices
  effectiveFrom: date("effective_from").notNull(),
  effectiveUntil: date("effective_until"), // null = currently active
  
  isActive: boolean("is_active").default(true),
  
  notes: text("notes"), // Internal notes (e.g., "Summer discount rate")
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("academy_pricing_academy_idx").on(table.academyId),
  index("academy_pricing_type_idx").on(table.sessionType),
  index("academy_pricing_active_idx").on(table.isActive),
]);

export const insertAcademyPricingSchema = createInsertSchema(academyPricing).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAcademyPricing = z.infer<typeof insertAcademyPricingSchema>;
export type AcademyPricing = typeof academyPricing.$inferSelect;

// Layer 2: Coach Compensation - What coaches earn per academy (contract)
// One coach can work for multiple academies with different rates
export const coachContracts = pgTable("coach_contracts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  
  // Payment type
  payType: text("pay_type").notNull().default("hourly"), // hourly | per_session | percentage
  
  // Rate based on pay type
  hourlyRate: numeric("hourly_rate"), // If payType = hourly
  sessionRate: numeric("session_rate"), // If payType = per_session
  percentageRate: numeric("percentage_rate"), // If payType = percentage (e.g., 60 = 60% of session price)
  
  currency: text("currency").default("AED"),
  
  // Session type specific rates (optional - overrides default)
  privateRate: numeric("private_rate"),
  semiPrivateRate: numeric("semi_private_rate"),
  groupRate: numeric("group_rate"),
  
  // Contract period
  effectiveFrom: date("effective_from").notNull(),
  effectiveUntil: date("effective_until"), // null = ongoing
  
  // Status
  status: text("status").default("active"), // active | paused | terminated
  
  notes: text("notes"), // Internal notes about the contract
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("coach_contracts_coach_idx").on(table.coachId),
  index("coach_contracts_academy_idx").on(table.academyId),
  index("coach_contracts_status_idx").on(table.status),
]);

export const insertCoachContractSchema = createInsertSchema(coachContracts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoachContract = z.infer<typeof insertCoachContractSchema>;
export type CoachContract = typeof coachContracts.$inferSelect;

// ==================== SOCIAL FEATURES ====================

// Community Groups (Discord-style micro-communities)
// `academyId` is nullable to support academy-independent group types such as
// `type='family'` (Task #1135), where members may be Free Players that don't
// belong to any academy. Class-derived groups (type='team') still always set
// it; the `syncCommunityGroupForSeries` helper enforces that.
export const communityGroups = pgTable("community_groups", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("level"), // academy | level | team | event | friends | family
  
  // For level/team groups - link to series
  seriesId: varchar("series_id").references(() => coachingSeries.id),
  // For family-type groups - link to the family this chat belongs to (Task #1135)
  familyGroupId: varchar("family_group_id"),
  
  // Group settings
  isPrivate: boolean("is_private").default(false),
  allowChat: boolean("allow_chat").default(true),
  allowPosts: boolean("allow_posts").default(true),
  
  // Visual
  avatarUrl: text("avatar_url"),
  coverUrl: text("cover_url"),
  accentColor: text("accent_color"), // hex color
  
  memberCount: integer("member_count").default(0),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("community_groups_academy_idx").on(table.academyId),
  index("community_groups_type_idx").on(table.type),
  index("community_groups_series_idx").on(table.seriesId),
  index("community_groups_family_idx").on(table.familyGroupId),
  // Task #1135 — guarantee at most one community group per family.
  // Partial unique so non-family rows (NULL family_group_id) are unaffected.
  uniqueIndex("community_groups_family_group_id_unique")
    .on(table.familyGroupId)
    .where(sql`${table.familyGroupId} IS NOT NULL`),
]);

export const insertCommunityGroupSchema = createInsertSchema(communityGroups).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCommunityGroup = z.infer<typeof insertCommunityGroupSchema>;
export type CommunityGroup = typeof communityGroups.$inferSelect;

// Group Memberships
export const groupMembers = pgTable("group_members", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").references(() => communityGroups.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  role: text("role").notNull().default("member"), // admin | moderator | member

  // How this membership was created. Used by `syncCommunityGroupForSeries` to
  // decide which members it owns (and is therefore allowed to remove on
  // re-sync) vs which were added out-of-band (manual coach invites, self
  // join, etc.). Class-derived sync inserts use 'class_sync'; everything
  // else stays the default 'manual' so guests aren't kicked out when the
  // underlying class is edited. (Task #1153)
  source: text("source").notNull().default("manual"), // manual | class_sync | family_sync | invite | self_join

  // Notification preferences
  mutedUntil: timestamp("muted_until"),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  
  // True when an admin manually invited this person into the group
  // (e.g. coach invited a parent or assistant into a class-derived group).
  // The series→group sync function leaves these rows alone so re-syncing
  // a class never silently kicks out manually-invited members.
  addedManually: boolean("added_manually").notNull().default(false),
  
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("group_members_group_idx").on(table.groupId),
  index("group_members_user_idx").on(table.userId),
]);

export const insertGroupMemberSchema = createInsertSchema(groupMembers).omit({ id: true, joinedAt: true });
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;
export type GroupMember = typeof groupMembers.$inferSelect;

// Group Events
export const groupEvents = pgTable("group_events", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").references(() => communityGroups.id).notNull(),
  creatorId: varchar("creator_id").references(() => users.id).notNull(),

  // Event type: booking | match | social
  eventType: text("event_type").notNull().default("social"),

  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  sport: text("sport"),

  // When
  eventDate: timestamp("event_date").notNull(),

  maxPlayers: integer("max_players"),

  // For match type: optional opponent (another member userId)
  opponentUserId: varchar("opponent_user_id").references(() => users.id),
  // Link to match challenge if auto-created
  matchChallengeId: varchar("match_challenge_id"),

  // Optional wager/prize amount for match events (display only, no payment processing)
  wager: numeric("wager"),
  wagerCurrency: text("wager_currency").default("AED"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("group_events_group_idx").on(table.groupId),
  index("group_events_date_idx").on(table.eventDate),
]);

export const insertGroupEventSchema = createInsertSchema(groupEvents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGroupEvent = z.infer<typeof insertGroupEventSchema>;
export type GroupEvent = typeof groupEvents.$inferSelect;

// Group Event RSVPs
export const groupEventRsvps = pgTable("group_event_rsvps", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => groupEvents.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),

  // going | maybe | not_going
  status: text("status").notNull().default("going"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("group_event_rsvps_event_idx").on(table.eventId),
  index("group_event_rsvps_user_idx").on(table.userId),
  unique("group_event_rsvps_event_user_unique").on(table.eventId, table.userId),
]);

export const insertGroupEventRsvpSchema = createInsertSchema(groupEventRsvps).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGroupEventRsvp = z.infer<typeof insertGroupEventRsvpSchema>;
export type GroupEventRsvp = typeof groupEventRsvps.$inferSelect;

// Posts (Moments) - Social feed content
export const posts = pgTable("posts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  // Nullable so Free Players (no academy) can author posts — e.g., country
  // Player-of-the-Week celebrations or shadow posts backing country-/global-
  // scope feed items.
  academyId: varchar("academy_id").references(() => academies.id),
  // When this row was lazily materialised from a system feed_item, this
  // field links back so authorisation can fall back on the original scope
  // (friends | squad | academy | country | global) instead of the much
  // coarser posts.visibility.
  feedItemId: varchar("feed_item_id"),

  // Context - what is this post about?
  contextType: text("context_type").notNull(), // training | match | event | group | achievement | free_play
  contextId: varchar("context_id"), // sessionId, eventId, groupId, etc.
  
  // Content
  caption: text("caption"), // max 280 chars
  mediaUrls: jsonb("media_urls").$type<string[]>().default([]), // array of image/video URLs
  mediaTypes: jsonb("media_types").$type<string[]>().default([]), // image | video per media
  
  // Visibility
  visibility: text("visibility").notNull().default("academy"), // public | academy | group | friends
  groupId: varchar("group_id").references(() => communityGroups.id), // if posted to specific group
  
  // Tags
  taggedUserIds: jsonb("tagged_user_ids").$type<string[]>().default([]),
  
  // Location (optional)
  locationName: text("location_name"), // e.g., "Academy Main Court"
  
  // Stats (denormalized for performance)
  cheerCount: integer("cheer_count").default(0),
  commentCount: integer("comment_count").default(0),
  
  // Status
  isHidden: boolean("is_hidden").default(false), // moderation
  isPinned: boolean("is_pinned").default(false), // pinned in group
  pinnedUntil: timestamp("pinned_until"), // when the pin auto-expires (Phase 3)

  // Phase 3 — Coach/Academy podium templates.
  // tip | announcement | drill | schedule_change | event_invite | coach_spotlight | lesson_recap | null
  postTemplate: text("post_template"),

  // Phase 3 — Lesson recap drafts: a coach-only draft is created when a
  // lesson completes (only if the coach opted in). It stays unpublished
  // (not visible in the feed) until the coach hits "Send recap" or
  // auto-publishes after the recap window.
  isDraft: boolean("is_draft").default(false),

  // Phase 3 — Recipient targeting for visibility='private' posts (e.g.
  // lesson recaps). When set, the post is also visible to each user in
  // this list — used by the player+parent feed query to surface recaps.
  recipientUserIds: varchar("recipient_user_ids").array(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("posts_author_idx").on(table.authorId),
  index("posts_academy_idx").on(table.academyId),
  index("posts_group_idx").on(table.groupId),
  index("posts_context_idx").on(table.contextType, table.contextId),
  index("posts_created_idx").on(table.createdAt),
  index("posts_template_idx").on(table.postTemplate),
]);

export const insertPostSchema = createInsertSchema(posts).omit({ id: true, createdAt: true, updatedAt: true, cheerCount: true, commentCount: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;

// Post Reactions (Cheers)
//
// A reaction is keyed by EITHER `postId` (manual moments / coach spotlights
// backed by a `posts` row) OR `feedItemId` (system feed items like
// match_result, level_up, quest_complete, tournament_result, open_match).
// Exactly one of the two should be set per row.
export const postReactions = pgTable("post_reactions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  postId: varchar("post_id").references(() => posts.id, { onDelete: "cascade" }),
  feedItemId: varchar("feed_item_id"),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  reactionType: text("reaction_type").notNull(), // clap | fire | tennis | muscle | star
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("post_reactions_post_idx").on(table.postId),
  index("post_reactions_feed_item_idx").on(table.feedItemId),
  index("post_reactions_user_idx").on(table.userId),
]);

export const insertPostReactionSchema = createInsertSchema(postReactions).omit({ id: true, createdAt: true });
export type InsertPostReaction = z.infer<typeof insertPostReactionSchema>;
export type PostReaction = typeof postReactions.$inferSelect;

// Post Comments
//
// A comment is keyed by EITHER `postId` (manual moments / coach spotlights
// backed by a `posts` row) OR `feedItemId` (system feed items like
// match_result, level_up, quest_complete, tournament_result, open_match).
// Exactly one of the two should be set per row.
export const postComments = pgTable("post_comments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  postId: varchar("post_id").references(() => posts.id, { onDelete: "cascade" }),
  feedItemId: varchar("feed_item_id"),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  
  // For kids: use quick comments (preset phrases)
  isQuickComment: boolean("is_quick_comment").default(false),
  quickCommentType: text("quick_comment_type"), // nice | lets_play | great | fire
  
  // For adults: free text
  text: text("text"),
  
  // Reply to another comment
  parentId: varchar("parent_id").references((): any => postComments.id),
  
  isHidden: boolean("is_hidden").default(false), // moderation

  // Phase 2 — resolved @mentions captured at write time so comment fan-out
  // and visible-tag rendering are O(1) without re-parsing text.
  mentionedUserIds: jsonb("mentioned_user_ids").$type<string[]>().notNull().default([]),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("post_comments_post_idx").on(table.postId),
  index("post_comments_feed_item_idx").on(table.feedItemId),
  index("post_comments_author_idx").on(table.authorId),
  index("post_comments_parent_idx").on(table.parentId),
  index("post_comments_post_created_idx").on(table.postId, table.createdAt),
]);

export const insertPostCommentSchema = createInsertSchema(postComments).omit({ id: true, createdAt: true });
export type InsertPostComment = z.infer<typeof insertPostCommentSchema>;
export type PostComment = typeof postComments.$inferSelect;

// ==================== AUTO-ACTIVITY FEED (Social Phase 1) ====================
//
// `feed_items` is the unified surface that powers Community → Feed for both
// academy players and Free Players. System events (matches played, level-ups,
// quest completions, tournament results, open matches, coach posts) are
// published here as feed items by `server/services/feed-publisher.ts`.
//
// Each item carries:
// - source_type / source_id  — uniquely identifies the underlying event so
//                              re-publishing the same event is a no-op.
// - scope                    — visibility band: friends | squad | academy |
//                              country | global. The feed query unions these.
// - country, academy_id      — denormalized scope keys, indexed for fast
//                              country-scoped queries (Free Player feed).
// - author_user_id /
//   author_player_id          — for friend-graph filters and rendering.
// - payload                   — JSON snapshot for fast rendering without
//                              joining the source table.
// - post_id                   — when the item is backed by a manual `posts`
//                              row (so cheers/comments live with the post).
export const feedItems = pgTable("feed_items", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sourceType: text("source_type").notNull(),
  sourceId: varchar("source_id").notNull(),
  scope: text("scope").notNull().default("academy"),
  country: text("country"),
  academyId: varchar("academy_id").references(() => academies.id),
  groupId: varchar("group_id").references(() => communityGroups.id),
  authorUserId: varchar("author_user_id").references(() => users.id),
  authorPlayerId: varchar("author_player_id").references(() => players.id),
  postId: varchar("post_id").references(() => posts.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  isHidden: boolean("is_hidden").default(false),
  // Denormalized engagement counters — kept in sync by the
  // /api/social/feed-items/:id reaction & comment endpoints. Manual moments
  // continue to track counts on `posts.cheer_count` / `posts.comment_count`.
  cheerCount: integer("cheer_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  occurredAt: timestamp("occurred_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("feed_items_source_unique").on(table.sourceType, table.sourceId),
  index("feed_items_country_created_idx").on(table.country, table.createdAt),
  index("feed_items_scope_country_created_idx").on(table.scope, table.country, table.createdAt),
  index("feed_items_academy_created_idx").on(table.academyId, table.createdAt),
  index("feed_items_author_created_idx").on(table.authorUserId, table.createdAt),
  index("feed_items_player_created_idx").on(table.authorPlayerId, table.createdAt),
  index("feed_items_group_created_idx").on(table.groupId, table.createdAt),
  index("feed_items_created_idx").on(table.createdAt),
]);

export const insertFeedItemSchema = createInsertSchema(feedItems).omit({ id: true, createdAt: true });
export type InsertFeedItem = z.infer<typeof insertFeedItemSchema>;
export type FeedItem = typeof feedItems.$inferSelect;

// Per-user preferences for which event types appear in the Community feed.
// Defaults are all-on so existing users see no change until they opt out of
// categories. The server reads these and narrows the feed_items query so the
// payload stays small for users who turn categories off.
export const userFeedPreferences = pgTable("user_feed_preferences", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  showMatches: boolean("show_matches").notNull().default(true),
  showLevelUps: boolean("show_level_ups").notNull().default(true),
  showQuests: boolean("show_quests").notNull().default(true),
  showTournaments: boolean("show_tournaments").notNull().default(true),
  showOpenMatches: boolean("show_open_matches").notNull().default(true),
  showCoachPosts: boolean("show_coach_posts").notNull().default(true),
  showFriendMoments: boolean("show_friend_moments").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("user_feed_preferences_user_idx").on(table.userId),
]);

export const insertUserFeedPreferenceSchema = createInsertSchema(userFeedPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserFeedPreference = z.infer<typeof insertUserFeedPreferenceSchema>;
export type UserFeedPreference = typeof userFeedPreferences.$inferSelect;

// Comment likes - tracks which users liked which comments
export const commentLikes = pgTable("comment_likes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").references(() => postComments.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("comment_likes_comment_idx").on(table.commentId),
  index("comment_likes_user_idx").on(table.userId),
]);

export const insertCommentLikeSchema = createInsertSchema(commentLikes).omit({ id: true, createdAt: true });
export type InsertCommentLike = z.infer<typeof insertCommentLikeSchema>;
export type CommentLike = typeof commentLikes.$inferSelect;

// Content reports - tracks user reports of posts/comments
export const contentReports = pgTable("content_reports", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  reporterUserId: varchar("reporter_user_id").notNull(),
  contentType: text("content_type").notNull().default("post"),
  contentId: varchar("content_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ContentReport = typeof contentReports.$inferSelect;

// Player blocks - tracks user block relationships
export const playerBlocks = pgTable("player_blocks", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  blockerUserId: varchar("blocker_user_id").notNull(),
  blockedUserId: varchar("blocked_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PlayerBlock = typeof playerBlocks.$inferSelect;

// Open to Play status
export const openToPlay = pgTable("open_to_play", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  
  // Availability window
  availableFrom: timestamp("available_from").notNull(),
  availableUntil: timestamp("available_until").notNull(),
  
  // Intent
  intent: text("intent").notNull().default("match"), // match | rally | practice
  
  // Location preference
  locationId: varchar("location_id").references(() => locations.id),
  locationName: text("location_name"),
  
  // Additional context
  message: text("message"), // short message like "Looking for hitting partner!"
  levelRange: text("level_range"), // e.g., "green-yellow"
  
  // Status
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("open_to_play_user_idx").on(table.userId),
  index("open_to_play_academy_idx").on(table.academyId),
  index("open_to_play_active_idx").on(table.isActive, table.availableUntil),
]);

export const insertOpenToPlaySchema = createInsertSchema(openToPlay).omit({ id: true, createdAt: true });
export type InsertOpenToPlay = z.infer<typeof insertOpenToPlaySchema>;
export type OpenToPlay = typeof openToPlay.$inferSelect;

// User Social Profile enhancements
export const userSocialProfiles = pgTable("user_social_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  
  // Display
  displayName: text("display_name"),
  bio: text("bio"), // max 160 chars
  avatarUrl: text("avatar_url"),
  coverUrl: text("cover_url"),
  
  // Gamification titles
  title: text("title"), // "Rising Star", "Club Icon", etc.
  titleUnlockedAt: timestamp("title_unlocked_at"),
  
  // Badge showcase (top 3)
  featuredBadges: jsonb("featured_badges").$type<string[]>().default([]),
  
  // Stats (denormalized)
  postCount: integer("post_count").default(0),
  cheerCount: integer("cheer_count").default(0), // total cheers received
  connectionCount: integer("connection_count").default(0),
  
  // Privacy settings
  profileVisibility: text("profile_visibility").default("academy"), // public | academy | friends
  showGlowScore: boolean("show_glow_score").default(true),
  showLevel: boolean("show_level").default(true),
  allowDMs: text("allow_dms").default("connections"), // everyone | connections | none
  
  // For kids: additional safety
  isKidProfile: boolean("is_kid_profile").default(false),
  parentApprovedDMs: boolean("parent_approved_dms").default(false),

  // Phase 2 — last time the user opened the Community feed. Drives the
  // unseen counter (cheers/comments/mentions on the user's own items)
  // and the Social tab badge.
  feedLastSeenAt: timestamp("feed_last_seen_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("user_social_profiles_user_idx").on(table.userId),
]);

// ==================== SOCIAL NOTIFICATION PREFERENCES (Phase 2) ====================
//
// Per-user opt-in flags for the four social notification categories. Defaults
// are conservative — cheers OFF (high volume / low signal) and
// comments/replies/mentions ON. A row is upserted on first read/write; the
// absence of a row is treated as the defaults.
export const playerSocialNotifPrefs = pgTable("player_social_notif_prefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  cheers: boolean("cheers").notNull().default(false),
  comments: boolean("comments").notNull().default(true),
  replies: boolean("replies").notNull().default(true),
  mentions: boolean("mentions").notNull().default(true),
  // Quiet-hours window (0-23 hour-of-day in viewer-local time). When both
  // are set, push notifications in this window are suppressed; in-app
  // notifications and the unseen badge are unaffected so the user still
  // sees them on next open.
  quietHoursStart: integer("quiet_hours_start"),
  quietHoursEnd: integer("quiet_hours_end"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PlayerSocialNotifPref = typeof playerSocialNotifPrefs.$inferSelect;

// ==================== COACH FOLLOWS (Task #1175) ====================
//
// Player → coach one-directional follow relationship. Unlike
// `player_connections` (bilateral, requires acceptance), following a public
// coach is unilateral: the player just opts in and the coach's
// country-scope tip/drill posts start showing up in their main feed.
//
// `followerUserId` references `users.id` so it works for both academy
// players and Free Players (no academy). `coachId` references `coaches.id`
// directly (not the coach's user record) because the public profile
// surface is keyed off `coaches`, including the Task #1112 quality gate.
export const coachFollows = pgTable("coach_follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  followerUserId: varchar("follower_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  coachId: varchar("coach_id")
    .references(() => coaches.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // One follow per (follower, coach) — re-following is a no-op via
  // ON CONFLICT in the route handler.
  uniquePair: uniqueIndex("coach_follows_unique_pair")
    .on(table.followerUserId, table.coachId),
  followerIdx: index("coach_follows_follower_idx").on(table.followerUserId),
  coachIdx: index("coach_follows_coach_idx").on(table.coachId),
}));

export type CoachFollow = typeof coachFollows.$inferSelect;

export const insertUserSocialProfileSchema = createInsertSchema(userSocialProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserSocialProfile = z.infer<typeof insertUserSocialProfileSchema>;
export type UserSocialProfile = typeof userSocialProfiles.$inferSelect;

// ==================== BADGE SYSTEM ====================

// Badge definitions - globally available badges
export const badges = pgTable("badges", {
  id: varchar("id").primaryKey(), // e.g., "rally_master", "first_session"
  
  // Display
  name: text("name").notNull(),
  description: text("description").notNull(),
  iconName: text("icon_name").notNull(), // Ionicons name
  iconColor: text("icon_color").default("#00D9FF"),
  rarity: text("rarity").default("common"), // common | uncommon | rare | epic | legendary
  
  // Category
  category: text("category").default("general"), // general | social | performance | consistency | milestone
  
  // Unlock criteria (if automatic)
  unlockCriteria: jsonb("unlock_criteria").$type<{
    type: string; // session_count | xp_total | streak | level | quest_complete | manual
    threshold?: number;
    questId?: string;
  }>(),
  
  // Display order
  order: integer("order").default(0),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBadgeSchema = createInsertSchema(badges).omit({ createdAt: true });
export type InsertBadge = z.infer<typeof insertBadgeSchema>;
export type Badge = typeof badges.$inferSelect;

// Player earned badges
export const playerBadges = pgTable("player_badges", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  badgeId: varchar("badge_id").references(() => badges.id).notNull(),
  
  earnedAt: timestamp("earned_at").defaultNow(),
  awardedBy: varchar("awarded_by").references(() => users.id), // null if automatic
  
  // For special badges with context
  context: jsonb("context"), // e.g., { questId: "...", sessionId: "..." }
}, (table) => [
  index("player_badges_player_idx").on(table.playerId),
  index("player_badges_badge_idx").on(table.badgeId),
  unique("player_badges_unique").on(table.playerId, table.badgeId),
]);

export const insertPlayerBadgeSchema = createInsertSchema(playerBadges).omit({ id: true, earnedAt: true });
export type InsertPlayerBadge = z.infer<typeof insertPlayerBadgeSchema>;
export type PlayerBadge = typeof playerBadges.$inferSelect;

// Available titles (unlockable by players)
export const titles = pgTable("titles", {
  id: varchar("id").primaryKey(), // e.g., "rising_star", "club_icon"
  
  name: text("name").notNull(), // Display name like "Rising Star"
  description: text("description").notNull(),
  
  // Rarity affects color/glow
  rarity: text("rarity").default("common"), // common | uncommon | rare | epic | legendary
  
  // Unlock criteria
  unlockCriteria: jsonb("unlock_criteria").$type<{
    type: string; // level | badge_count | xp_total | manual
    threshold?: number;
    badgeId?: string;
  }>(),
  
  order: integer("order").default(0),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTitleSchema = createInsertSchema(titles).omit({ createdAt: true });
export type InsertTitle = z.infer<typeof insertTitleSchema>;
export type Title = typeof titles.$inferSelect;

// Player unlocked titles
export const playerTitles = pgTable("player_titles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  titleId: varchar("title_id").references(() => titles.id).notNull(),
  
  unlockedAt: timestamp("unlocked_at").defaultNow(),
  isEquipped: boolean("is_equipped").default(false), // Only one title can be equipped (enforced in app logic)
}, (table) => [
  index("player_titles_player_idx").on(table.playerId),
  unique("player_titles_unique").on(table.playerId, table.titleId),
]);

export const insertPlayerTitleSchema = createInsertSchema(playerTitles).omit({ id: true, unlockedAt: true });
export type InsertPlayerTitle = z.infer<typeof insertPlayerTitleSchema>;
export type PlayerTitle = typeof playerTitles.$inferSelect;

// ==================== QUEST SYSTEM ====================

// Quest Templates - Definitions of available quests
export const questTemplates = pgTable("quest_templates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id), // null = global/platform-wide quests
  
  // Quest identity
  name: text("name").notNull(),
  description: text("description").notNull(),
  iconName: text("icon_name").notNull(), // Ionicons name (e.g., "tennisball", "flame", "trophy")
  iconColor: text("icon_color").default("#00D9FF"), // hex color
  
  // Quest type
  questType: text("quest_type").notNull().default("daily"), // daily | weekly | special | achievement
  category: text("category").default("training"), // training | social | performance | consistency
  
  // Completion criteria
  targetAction: text("target_action").notNull(), // complete_session | give_reaction | post_moment | practice_minutes | win_match | attend_consecutive
  targetCount: integer("target_count").notNull().default(1),
  targetMetadata: jsonb("target_metadata"), // Additional criteria like {sessionType: "private"}
  
  // Rewards
  xpReward: integer("xp_reward").default(50),
  currencyReward: integer("currency_reward").default(0), // in-app currency (Glow Coins)
  badgeId: varchar("badge_id"), // Optional badge awarded on completion
  
  // Difficulty & display
  difficulty: text("difficulty").default("easy"), // easy | medium | hard | legendary
  order: integer("order").default(0), // Display order
  
  // Availability
  isActive: boolean("is_active").default(true),
  startsAt: timestamp("starts_at"), // For time-limited quests
  endsAt: timestamp("ends_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("quest_templates_academy_idx").on(table.academyId),
  index("quest_templates_type_idx").on(table.questType, table.isActive),
]);

export const insertQuestTemplateSchema = createInsertSchema(questTemplates).omit({ id: true, createdAt: true });
export type InsertQuestTemplate = z.infer<typeof insertQuestTemplateSchema>;
export type QuestTemplate = typeof questTemplates.$inferSelect;

// Player Quests - Active quests assigned to players with progress
export const playerQuests = pgTable("player_quests", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  questTemplateId: varchar("quest_template_id").references(() => questTemplates.id).notNull(),
  
  // Progress tracking
  currentProgress: integer("current_progress").default(0),
  targetProgress: integer("target_progress").notNull(),
  
  // Status
  status: text("status").default("active"), // active | completed | expired | claimed
  
  // Timing
  assignedAt: timestamp("assigned_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  claimedAt: timestamp("claimed_at"), // When rewards were claimed
  expiresAt: timestamp("expires_at"), // For daily/weekly resets
  
  // For streak tracking
  streakDay: integer("streak_day").default(1),
  
  // Evidence (photo/video proof)
  evidenceUrl: text("evidence_url"),
  evidenceType: text("evidence_type"), // image | video
  
  // Rewards snapshot (in case template changes)
  xpReward: integer("xp_reward"),
  currencyReward: integer("currency_reward"),

  // Personalisation flag
  personalisedBy: text("personalised_by"), // 'weak_areas' | null

  // AI-generated reason why this quest was chosen for this player (1 sentence)
  aiReason: text("ai_reason"),
}, (table) => [
  index("player_quests_player_idx").on(table.playerId),
  index("player_quests_status_idx").on(table.playerId, table.status),
  index("player_quests_expires_idx").on(table.expiresAt),
]);

export const insertPlayerQuestSchema = createInsertSchema(playerQuests).omit({ id: true, assignedAt: true });
export type InsertPlayerQuest = z.infer<typeof insertPlayerQuestSchema>;
export type PlayerQuest = typeof playerQuests.$inferSelect;

// Daily Quest Slots - Track which quests were assigned each day
export const dailyQuestSlots = pgTable("daily_quest_slots", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  slotDate: date("slot_date").notNull(), // The date these quests are for
  
  // Quest assignments (up to 3 daily quests)
  quest1Id: varchar("quest_1_id").references(() => playerQuests.id),
  quest2Id: varchar("quest_2_id").references(() => playerQuests.id),
  quest3Id: varchar("quest_3_id").references(() => playerQuests.id),
  
  // Bonus quest (unlocked by completing all 3)
  bonusQuestId: varchar("bonus_quest_id").references(() => playerQuests.id),
  bonusUnlocked: boolean("bonus_unlocked").default(false),
  bonusClaimed: boolean("bonus_claimed").default(false), // True once chain bonus XP has been awarded
  
  // Completion tracking
  completedCount: integer("completed_count").default(0),
  allCompleted: boolean("all_completed").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("daily_quest_slots_player_date_idx").on(table.playerId, table.slotDate),
]);

export const insertDailyQuestSlotSchema = createInsertSchema(dailyQuestSlots).omit({ id: true, createdAt: true });
export type InsertDailyQuestSlot = z.infer<typeof insertDailyQuestSlotSchema>;
export type DailyQuestSlot = typeof dailyQuestSlots.$inferSelect;

// Quest Chain Bonus Claims - Persistent idempotency record for chain bonus XP awards
// One row per player + questType + periodKey (YYYY-WW for weekly, YYYY-MM for monthly, YYYY-MM-DD for daily)
export const questChainBonusClaims = pgTable("quest_chain_bonus_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  questType: text("quest_type").notNull(), // "daily" | "weekly" | "monthly"
  periodKey: text("period_key").notNull(), // e.g. "2026-04-08" or "2026-W15" or "2026-04"
  xpAwarded: integer("xp_awarded").notNull().default(50),
  claimedAt: timestamp("claimed_at").defaultNow(),
}, (table) => [
  uniqueIndex("quest_chain_bonus_claims_unique_idx").on(table.playerId, table.questType, table.periodKey),
]);

export type QuestChainBonusClaim = typeof questChainBonusClaims.$inferSelect;

// Player Streaks - Track daily quest completion streaks
export const playerStreaks = pgTable("player_streaks", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  currentStreak: integer("current_streak").default(0),
  longestStreak: integer("longest_streak").default(0),
  lastActiveDate: date("last_active_date"),
  streakShields: integer("streak_shields").default(0),
  totalDaysActive: integer("total_days_active").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("player_streaks_player_idx").on(table.playerId),
]);

export const insertPlayerStreakSchema = createInsertSchema(playerStreaks).omit({ id: true, updatedAt: true });
export type InsertPlayerStreak = z.infer<typeof insertPlayerStreakSchema>;
export type PlayerStreak = typeof playerStreaks.$inferSelect;

// ==================== SOCIAL PHASE 5 — LEADERBOARDS EXTENSION (Task #1125) ====================

// Player of the Week — auto-awarded each Monday by playerOfWeekJob.ts.
// One row per (scope, scopeId, weekStart). scope = "academy" | "country".
export const playerOfWeek = pgTable("player_of_week", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  scope: text("scope").notNull(), // "academy" | "country"
  scopeId: text("scope_id").notNull(), // academy UUID or 2-letter country code
  weekStart: date("week_start").notNull(), // Monday of the awarded week
  playerId: varchar("player_id").references(() => players.id).notNull(),
  xpEarned: integer("xp_earned").notNull().default(0),
  matchesPlayed: integer("matches_played").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("player_of_week_unique_idx").on(table.scope, table.scopeId, table.weekStart),
  index("player_of_week_player_idx").on(table.playerId),
  index("player_of_week_week_idx").on(table.weekStart),
]);

export const insertPlayerOfWeekSchema = createInsertSchema(playerOfWeek).omit({ id: true, createdAt: true });
export type InsertPlayerOfWeek = z.infer<typeof insertPlayerOfWeekSchema>;
export type PlayerOfWeek = typeof playerOfWeek.$inferSelect;

// Weekly Skill Challenge — platform owner sets a weekly title + description.
// Players submit by posting a Moment with the special tag (handled in social-features).
export const weeklySkillChallenges = pgTable("weekly_skill_challenges", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  weekStart: date("week_start").notNull().unique(), // Monday of the active week
  title: text("title").notNull(),
  description: text("description").notNull(),
  hashtag: text("hashtag").notNull().default("challenge:weekly"), // tag used to associate posts
  createdBy: varchar("created_by").references(() => users.id),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("weekly_skill_challenges_week_idx").on(table.weekStart),
  index("weekly_skill_challenges_active_idx").on(table.isActive),
]);

export const insertWeeklySkillChallengeSchema = createInsertSchema(weeklySkillChallenges).omit({ id: true, createdAt: true });
export type InsertWeeklySkillChallenge = z.infer<typeof insertWeeklySkillChallengeSchema>;
export type WeeklySkillChallenge = typeof weeklySkillChallenges.$inferSelect;

// ==================== SOCIAL PHASE 6 — DIGESTS / RECAPS / HIGHLIGHT REELS (Task #1126) ====================
//
// Per-player rolled-up snapshots produced by `server/services/digestJobs.ts`.
// Each row is the source of truth that backs a feed_items entry of the matching
// source_type (weekly_digest, monthly_digest, yearly_recap, highlight_reel).
// All payloads are denormalized JSON so the feed can render without joins.
//
// Idempotency: each table has a unique index on (player_id, period_key) so the
// Sunday cron can re-run without producing duplicates.

export const weeklyDigests = pgTable("weekly_digests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  weekStart: date("week_start").notNull(), // Monday (UTC) of the digest week
  weekEnd: date("week_end").notNull(),     // following Monday (exclusive)
  // Computed totals — kept as columns for cheap leaderboard-style queries.
  matchesPlayed: integer("matches_played").notNull().default(0),
  matchesWon: integer("matches_won").notNull().default(0),
  courtMinutes: integer("court_minutes").notNull().default(0), // sessions + match duration
  xpEarned: integer("xp_earned").notNull().default(0),
  questsCompleted: integer("quests_completed").notNull().default(0),
  levelChanges: integer("level_changes").notNull().default(0),
  friendsPlayedWith: integer("friends_played_with").notNull().default(0),
  // Full payload for rendering: top moment caption, friend names, etc.
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  // Foreign key to the inserted feed_items row (best-effort — null if publish failed).
  feedItemId: varchar("feed_item_id").references(() => feedItems.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("weekly_digests_player_week_unique").on(table.playerId, table.weekStart),
  index("weekly_digests_week_idx").on(table.weekStart),
  index("weekly_digests_player_idx").on(table.playerId),
]);

export const insertWeeklyDigestSchema = createInsertSchema(weeklyDigests).omit({ id: true, createdAt: true });
export type InsertWeeklyDigest = z.infer<typeof insertWeeklyDigestSchema>;
export type WeeklyDigest = typeof weeklyDigests.$inferSelect;

export const monthlyDigests = pgTable("monthly_digests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  monthStart: date("month_start").notNull(), // first-of-month (UTC)
  monthEnd: date("month_end").notNull(),     // first-of-next-month (exclusive)
  matchesPlayed: integer("matches_played").notNull().default(0),
  matchesWon: integer("matches_won").notNull().default(0),
  courtMinutes: integer("court_minutes").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  questsCompleted: integer("quests_completed").notNull().default(0),
  levelChanges: integer("level_changes").notNull().default(0),
  friendsPlayedWith: integer("friends_played_with").notNull().default(0),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  feedItemId: varchar("feed_item_id").references(() => feedItems.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("monthly_digests_player_month_unique").on(table.playerId, table.monthStart),
  index("monthly_digests_month_idx").on(table.monthStart),
  index("monthly_digests_player_idx").on(table.playerId),
]);

export const insertMonthlyDigestSchema = createInsertSchema(monthlyDigests).omit({ id: true, createdAt: true });
export type InsertMonthlyDigest = z.infer<typeof insertMonthlyDigestSchema>;
export type MonthlyDigest = typeof monthlyDigests.$inferSelect;

// Year-in-Tennis recap. One row per (player, year). The `payload` is the JSON
// the YearInTennisScreen reads to render its scrollable Spotify-Wrapped story.
export const yearlyRecaps = pgTable("yearly_recaps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  year: integer("year").notNull(),
  matchesPlayed: integer("matches_played").notNull().default(0),
  matchesWon: integer("matches_won").notNull().default(0),
  courtMinutes: integer("court_minutes").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  questsCompleted: integer("quests_completed").notNull().default(0),
  levelChanges: integer("level_changes").notNull().default(0),
  friendsPlayedWith: integer("friends_played_with").notNull().default(0),
  countryRank: integer("country_rank"), // null if not applicable
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  feedItemId: varchar("feed_item_id").references(() => feedItems.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("yearly_recaps_player_year_unique").on(table.playerId, table.year),
  index("yearly_recaps_year_idx").on(table.year),
  index("yearly_recaps_player_idx").on(table.playerId),
]);

export const insertYearlyRecapSchema = createInsertSchema(yearlyRecaps).omit({ id: true, createdAt: true });
export type InsertYearlyRecap = z.infer<typeof insertYearlyRecapSchema>;
export type YearlyRecap = typeof yearlyRecaps.$inferSelect;

// Auto-generated highlight reel for a logged match (≥3 score events). The
// `frames` array drives a 10-15 second client-side animation overlaying the
// score progression. Captions are an opt-in editing step.
export const highlightReels = pgTable("highlight_reels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  matchLogId: varchar("match_log_id").references(() => matchLogs.id, { onDelete: "cascade" }).notNull(),
  // Frames: each frame has { setIndex, playerScore, opponentScore, label, durationMs, kind }.
  frames: jsonb("frames").$type<Array<Record<string, unknown>>>().notNull().default([]),
  caption: text("caption"),
  durationMs: integer("duration_ms").notNull().default(12000),
  feedItemId: varchar("feed_item_id").references(() => feedItems.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("highlight_reels_match_unique").on(table.matchLogId),
  index("highlight_reels_player_idx").on(table.playerId),
]);

export const insertHighlightReelSchema = createInsertSchema(highlightReels).omit({ id: true, createdAt: true });
export type InsertHighlightReel = z.infer<typeof insertHighlightReelSchema>;
export type HighlightReel = typeof highlightReels.$inferSelect;

// ==================== GLOW MARKET / SHOP ====================

// Shop Categories (e.g., Rackets, Apparel, Accessories, Services)
export const shopCategories = pgTable("shop_categories", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id), // null = platform-wide
  
  name: text("name").notNull(),
  slug: text("slug").notNull(), // e.g., "rackets", "stringing", "apparel"
  description: text("description"),
  iconName: text("icon_name").default("pricetag"), // Ionicons name
  iconColor: text("icon_color").default("#00D9FF"),
  
  // Display
  order: integer("order").default(0),
  isActive: boolean("is_active").default(true),
  isFeatured: boolean("is_featured").default(false),
  
  // Type distinction
  type: text("type").default("product"), // product | service
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("shop_categories_academy_idx").on(table.academyId),
  unique("shop_categories_slug_unique").on(table.academyId, table.slug),
]);

export const insertShopCategorySchema = createInsertSchema(shopCategories).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShopCategory = z.infer<typeof insertShopCategorySchema>;
export type ShopCategory = typeof shopCategories.$inferSelect;

// Shop Products (physical items: rackets, gear, apparel)
export const shopProducts = pgTable("shop_products", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  categoryId: varchar("category_id").references(() => shopCategories.id),
  
  // Product details
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  shortDescription: text("short_description"), // For cards
  
  // Pricing
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: numeric("compare_at_price", { precision: 10, scale: 2 }), // Original price for sale display
  currency: text("currency").default("AED"),
  
  // Inventory
  sku: text("sku"),
  stockQuantity: integer("stock_quantity").default(0),
  trackInventory: boolean("track_inventory").default(true),
  allowBackorder: boolean("allow_backorder").default(false),
  
  // Media
  imageUrl: text("image_url"),
  images: jsonb("images").$type<string[]>().default([]),
  
  // Variants (e.g., sizes, colors)
  hasVariants: boolean("has_variants").default(false),
  variants: jsonb("variants").$type<{
    id: string;
    name: string;
    options: { value: string; price?: number; sku?: string; stock?: number }[];
  }[]>(),
  
  // Brand
  brand: varchar("brand", { length: 100 }),
  
  // Display
  isFeatured: boolean("is_featured").default(false),
  isActive: boolean("is_active").default(true),
  order: integer("order").default(0),
  
  // Metadata
  tags: jsonb("tags").$type<string[]>().default([]),
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("shop_products_academy_idx").on(table.academyId),
  index("shop_products_category_idx").on(table.categoryId),
  index("shop_products_featured_idx").on(table.isFeatured, table.isActive),
  unique("shop_products_slug_unique").on(table.academyId, table.slug),
]);

export const insertShopProductSchema = createInsertSchema(shopProducts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShopProduct = z.infer<typeof insertShopProductSchema>;
export type ShopProduct = typeof shopProducts.$inferSelect;

// Shop Services (stringing, coaching packages, massage, etc.)
export const shopServices = pgTable("shop_services", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  categoryId: varchar("category_id").references(() => shopCategories.id),
  
  // Service details
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  shortDescription: text("short_description"),
  
  // Pricing
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("AED"),
  
  // Service specifics
  durationMinutes: integer("duration_minutes"), // e.g., 60 for 1-hour massage
  requiresBooking: boolean("requires_booking").default(true),
  
  // Stringing-specific fields
  isStringingService: boolean("is_stringing_service").default(false),
  stringingOptions: jsonb("stringing_options").$type<{
    strings: { name: string; brand: string; price: number }[];
    tensionRange: { min: number; max: number };
  }>(),
  
  // Media
  imageUrl: text("image_url"),
  iconName: text("icon_name").default("build"),
  
  // Display
  isFeatured: boolean("is_featured").default(false),
  isActive: boolean("is_active").default(true),
  order: integer("order").default(0),
  
  // Metadata
  tags: jsonb("tags").$type<string[]>().default([]),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("shop_services_academy_idx").on(table.academyId),
  index("shop_services_category_idx").on(table.categoryId),
  unique("shop_services_slug_unique").on(table.academyId, table.slug),
]);

export const insertShopServiceSchema = createInsertSchema(shopServices).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShopService = z.infer<typeof insertShopServiceSchema>;
export type ShopService = typeof shopServices.$inferSelect;

// Shop Orders
export const shopOrders = pgTable("shop_orders", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  
  // Customer
  playerId: varchar("player_id").references(() => players.id),
  userId: varchar("user_id").references(() => users.id),
  
  // Order details
  orderNumber: text("order_number").notNull().unique(), // e.g., "GUS-2024-0001"
  
  // Totals
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  tax: numeric("tax", { precision: 10, scale: 2 }).default("0"),
  discount: numeric("discount", { precision: 10, scale: 2 }).default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("AED"),
  
  // Status
  status: text("status").default("pending"), // pending | confirmed | processing | ready | completed | cancelled
  paymentStatus: text("payment_status").default("pending"), // pending | paid | failed | refunded
  
  // Payment
  paymentMethod: text("payment_method"), // stripe | cash | bank_transfer
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  
  // Contact/Delivery info
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  
  // For services: booking info
  scheduledAt: timestamp("scheduled_at"),
  
  // Service provider assignment
  preferredProviderId: varchar("preferred_provider_id").references(() => serviceProviders.id),
  assignedProviderId: varchar("assigned_provider_id"),
  
  // Player rating (submitted after session is completed)
  playerRating: integer("player_rating"), // 1-5 star rating by the player
  playerRatingAt: timestamp("player_rating_at"), // when the rating was submitted
  
  // Audit
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("shop_orders_academy_idx").on(table.academyId),
  index("shop_orders_player_idx").on(table.playerId),
  index("shop_orders_status_idx").on(table.status),
]);

export const insertShopOrderSchema = createInsertSchema(shopOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShopOrder = z.infer<typeof insertShopOrderSchema>;
export type ShopOrder = typeof shopOrders.$inferSelect;

// Shop Order Items (line items in an order)
export const shopOrderItems = pgTable("shop_order_items", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => shopOrders.id).notNull(),
  
  // Item reference (one of these will be set)
  productId: varchar("product_id").references(() => shopProducts.id),
  serviceId: varchar("service_id").references(() => shopServices.id),
  
  // Item details (snapshot at time of order)
  itemType: text("item_type").notNull(), // product | service
  name: text("name").notNull(),
  description: text("description"),
  
  // Pricing
  quantity: integer("quantity").default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  
  // Variant info (if applicable)
  variantId: text("variant_id"),
  variantName: text("variant_name"),
  
  // Service-specific
  serviceDetails: jsonb("service_details").$type<{
    stringingTension?: number;
    stringChoice?: string;
    racketModel?: string;
    appointmentTime?: string;
  }>(),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("shop_order_items_order_idx").on(table.orderId),
]);

export const insertShopOrderItemSchema = createInsertSchema(shopOrderItems).omit({ id: true, createdAt: true });
export type InsertShopOrderItem = z.infer<typeof insertShopOrderItemSchema>;
export type ShopOrderItem = typeof shopOrderItems.$inferSelect;

// Player Wishlist
export const shopWishlist = pgTable("shop_wishlist", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  productId: varchar("product_id").references(() => shopProducts.id),
  serviceId: varchar("service_id").references(() => shopServices.id),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("shop_wishlist_player_idx").on(table.playerId),
  unique("shop_wishlist_unique_product").on(table.playerId, table.productId),
  unique("shop_wishlist_unique_service").on(table.playerId, table.serviceId),
]);

export const insertShopWishlistSchema = createInsertSchema(shopWishlist).omit({ id: true, createdAt: true });
export type InsertShopWishlist = z.infer<typeof insertShopWishlistSchema>;
export type ShopWishlist = typeof shopWishlist.$inferSelect;

// Service Providers (stringers, massage therapists, video analysts, etc.)
export const serviceProviders = pgTable("service_providers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),

  displayName: text("display_name").notNull(),
  bio: text("bio"),
  profilePhotoUrl: text("profile_photo_url"),
  phone: text("phone"),

  specializations: jsonb("specializations").$type<string[]>().default([]),
  serviceTypes: jsonb("service_types").$type<string[]>().default([]),

  isActive: boolean("is_active").default(true),
  isOnboarded: boolean("is_onboarded").default(false),
  rating: numeric("rating", { precision: 3, scale: 2 }).default("0"),
  totalBookings: integer("total_bookings").default(0),

  xp: integer("xp").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  streakCurrent: integer("streak_current").default(0).notNull(),
  streakBest: integer("streak_best").default(0).notNull(),
  streakLastDate: date("streak_last_date"),
  badges: jsonb("badges").$type<string[]>().default([]),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("service_providers_academy_idx").on(table.academyId),
  index("service_providers_user_idx").on(table.userId),
]);

export const insertServiceProviderSchema = createInsertSchema(serviceProviders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceProvider = z.infer<typeof insertServiceProviderSchema>;
export type ServiceProvider = typeof serviceProviders.$inferSelect;

// ==================== PROVIDER CLIENT BOOK ====================

export const providerClientNotes = pgTable("provider_client_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").references(() => serviceProviders.id, { onDelete: "cascade" }).notNull(),
  playerId: varchar("player_id").references(() => players.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  noteType: varchar("note_type", { length: 50 }).default("general"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("provider_client_notes_provider_player_idx").on(table.providerId, table.playerId),
]);

export const insertProviderClientNoteSchema = createInsertSchema(providerClientNotes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProviderClientNote = z.infer<typeof insertProviderClientNoteSchema>;
export type ProviderClientNote = typeof providerClientNotes.$inferSelect;

export const providerClientPreferences = pgTable("provider_client_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").references(() => serviceProviders.id, { onDelete: "cascade" }).notNull(),
  playerId: varchar("player_id").references(() => players.id, { onDelete: "cascade" }).notNull(),
  preferences: jsonb("preferences").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("provider_client_prefs_unique_idx").on(table.providerId, table.playerId),
]);

export const insertProviderClientPreferencesSchema = createInsertSchema(providerClientPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProviderClientPreferences = z.infer<typeof insertProviderClientPreferencesSchema>;
export type ProviderClientPreferences = typeof providerClientPreferences.$inferSelect;

// Provider weekly availability windows
export const providerAvailability = pgTable("provider_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").references(() => serviceProviders.id, { onDelete: "cascade" }).notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun, 1=Mon, ..., 6=Sat
  startTime: text("start_time").notNull(), // "09:00"
  endTime: text("end_time").notNull(), // "18:00"
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("provider_availability_provider_idx").on(table.providerId),
]);

export const insertProviderAvailabilitySchema = createInsertSchema(providerAvailability).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProviderAvailability = z.infer<typeof insertProviderAvailabilitySchema>;
export type ProviderAvailability = typeof providerAvailability.$inferSelect;

// Pending upsell requests: provider proposes an extra, player approves/declines
export const shopOrderUpsells = pgTable("shop_order_upsells", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => shopOrders.id, { onDelete: "cascade" }).notNull(),
  providerId: varchar("provider_id").references(() => serviceProviders.id, { onDelete: "cascade" }).notNull(),
  serviceId: varchar("service_id"), // optional link to catalog service
  label: text("label").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | declined
  createdAt: timestamp("created_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
}, (table) => [
  index("shop_order_upsells_order_idx").on(table.orderId),
  index("shop_order_upsells_provider_idx").on(table.providerId),
]);

export const insertShopOrderUpsellSchema = createInsertSchema(shopOrderUpsells).omit({ id: true, createdAt: true, respondedAt: true });
export type InsertShopOrderUpsell = z.infer<typeof insertShopOrderUpsellSchema>;
export type ShopOrderUpsell = typeof shopOrderUpsells.$inferSelect;

// ==================== COMMUNITY MARKETPLACE (C2C) ====================

// Marketplace Listings (player-to-player sales)
export const marketplaceListings = pgTable("marketplace_listings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  // Seller info
  sellerId: varchar("seller_id").references(() => players.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id), // Optional scope to academy
  
  // Listing details
  title: text("title").notNull(),
  description: text("description"),
  condition: text("condition").default("used"), // new | like_new | good | fair | used
  
  // Categorization
  category: text("category").notNull(), // rackets | shoes | gear | apparel | accessories
  brand: text("brand"),
  model: text("model"),
  
  // Pricing
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("AED"),
  isNegotiable: boolean("is_negotiable").default(true),
  
  // Media
  images: jsonb("images").$type<string[]>().default([]),
  
  // Status
  status: text("status").default("active"), // draft | pending_review | active | sold | expired | removed
  
  // Verification
  isVerified: boolean("is_verified").default(false),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  
  // Stats
  viewCount: integer("view_count").default(0),
  favoriteCount: integer("favorite_count").default(0),
  messageCount: integer("message_count").default(0),
  
  // Audit
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Auto-expire after X days
  soldAt: timestamp("sold_at"),
}, (table) => [
  index("marketplace_listings_seller_idx").on(table.sellerId),
  index("marketplace_listings_academy_idx").on(table.academyId),
  index("marketplace_listings_status_idx").on(table.status),
  index("marketplace_listings_category_idx").on(table.category),
]);

export const insertMarketplaceListingSchema = createInsertSchema(marketplaceListings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketplaceListing = z.infer<typeof insertMarketplaceListingSchema>;
export type MarketplaceListing = typeof marketplaceListings.$inferSelect;

// Marketplace Favorites (wishlisted items)
export const marketplaceFavorites = pgTable("marketplace_favorites", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  listingId: varchar("listing_id").references(() => marketplaceListings.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("marketplace_favorites_player_idx").on(table.playerId),
  unique("marketplace_favorites_unique").on(table.playerId, table.listingId),
]);

export const insertMarketplaceFavoriteSchema = createInsertSchema(marketplaceFavorites).omit({ id: true, createdAt: true });
export type InsertMarketplaceFavorite = z.infer<typeof insertMarketplaceFavoriteSchema>;
export type MarketplaceFavorite = typeof marketplaceFavorites.$inferSelect;

// Marketplace Messages (buyer-seller chat)
export const marketplaceMessages = pgTable("marketplace_messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id").references(() => marketplaceListings.id).notNull(),
  senderId: varchar("sender_id").references(() => players.id).notNull(),
  recipientId: varchar("recipient_id").references(() => players.id).notNull(),
  
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("marketplace_messages_listing_idx").on(table.listingId),
  index("marketplace_messages_sender_idx").on(table.senderId),
  index("marketplace_messages_recipient_idx").on(table.recipientId),
]);

export const insertMarketplaceMessageSchema = createInsertSchema(marketplaceMessages).omit({ id: true, createdAt: true });
export type InsertMarketplaceMessage = z.infer<typeof insertMarketplaceMessageSchema>;
export type MarketplaceMessage = typeof marketplaceMessages.$inferSelect;

// Seller Profiles (for marketplace)
export const sellerProfiles = pgTable("seller_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull().unique(),
  
  // Profile
  displayName: text("display_name"),
  bio: text("bio"),
  
  // Verification
  isVerified: boolean("is_verified").default(false),
  verificationLevel: text("verification_level").default("none"), // none | basic | id_verified | trusted
  verifiedAt: timestamp("verified_at"),
  
  // Stats
  totalSales: integer("total_sales").default(0),
  totalListings: integer("total_listings").default(0),
  averageRating: numeric("average_rating", { precision: 3, scale: 2 }),
  responseRate: integer("response_rate"), // Percentage
  responseTime: text("response_time"), // "within 1 hour", "within 24 hours", etc.
  
  // Trust
  joinedMarketplaceAt: timestamp("joined_marketplace_at").defaultNow(),
  lastActiveAt: timestamp("last_active_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("seller_profiles_player_idx").on(table.playerId),
]);

export const insertSellerProfileSchema = createInsertSchema(sellerProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSellerProfile = z.infer<typeof insertSellerProfileSchema>;
export type SellerProfile = typeof sellerProfiles.$inferSelect;

// ==================== GLOW LEVELING OS ====================
// Ball Level System: RED_3 → RED_2 → RED_1 → ORANGE_3 → ... → YELLOW_1
// 6 Pillars: Technical, Tactical, Physical, Mental, Social, Match
// Rubrics: 0=Not Yet, 1=Emerging, 2=Achieved

export const glowPillars = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"] as const;
export type GlowPillar = typeof glowPillars[number];

export const glowStages = ["RED", "ORANGE", "GREEN", "YELLOW"] as const;
export type GlowStage = typeof glowStages[number];

export const glowLanguageTiers = ["RED", "ORANGE", "GREEN", "YELLOW"] as const;
export type GlowLanguageTier = typeof glowLanguageTiers[number];

// Ball Levels - 12 levels total (RED_3 → YELLOW_1)
export const ballLevels = pgTable("ball_levels", {
  id: varchar("id").primaryKey(), // e.g., "RED_3", "ORANGE_2", "GREEN_1"
  stage: text("stage").notNull(), // RED, ORANGE, GREEN, YELLOW
  rank: integer("rank").notNull(), // 3, 2, 1 (3 = entry, 1 = graduate)
  languageTier: text("language_tier").notNull(), // Controls UI language/complexity
  displayNamePlayer: text("display_name_player").notNull(), // "Red 3"
  displayNameCoach: text("display_name_coach").notNull(), // "Red 3 (Entry)"
  identity: text("identity"), // Kid-friendly description: "Ik kan de bal raken"
  courtType: text("court_type"), // "mini court (36')", "3/4 court", "full court"
  ballType: text("ball_type"), // "Red foam / 75% low compression", etc.
  matchFormat: text("match_format"), // "Mini points to 7", "Best of 3 short sets"
  socialGoals: jsonb("social_goals").$type<string[]>(), // ["HIGH_FIVE", "TURN_TAKING"]
  rewardBadge: text("reward_badge"), // "Red Starter Unlocked"
  rewardUnlock: text("reward_unlock"), // Description of what unlocks
  
  // Promotion requirements (JSONB for flexibility)
  promotionToLevelId: varchar("promotion_to_level_id"), // Next level ID
  promotionRequirements: jsonb("promotion_requirements").$type<{
    skillAchievedCount: number;
    pillarMinimum: Record<string, number>;
    matchMinEvents?: number;
    matchType?: string;
    evidenceMinItems?: number;
  }>(),
  trialEnabled: boolean("trial_enabled").default(true),
  trialDays: integer("trial_days").default(14),
  
  // Technical court specifications (ITF/LTA reference data)
  technicalSpecs: jsonb("technical_specs").$type<{
    courtLengthM?: number;
    courtWidthM?: number;
    netHeightCm?: number;
    racketSizeLabel?: string;
    racketSizeInchMin?: number;
    racketSizeInchMax?: number;
    ageBand?: string;
    itfStageName?: string;
    ballDescription?: string;
    note?: string;
  }>(),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBallLevelSchema = createInsertSchema(ballLevels).omit({ createdAt: true });
export type InsertBallLevel = z.infer<typeof insertBallLevelSchema>;
export type BallLevel = typeof ballLevels.$inferSelect;

// DSS Speelsterkte Thresholds — KNLTB 2026 official rating boundaries
export const dssSpeelsterkteThresholds = pgTable("dss_speelsterkte_thresholds", {
  speelsterkte: integer("speelsterkte").primaryKey(),
  menSinglesMaxRating: numeric("men_singles_max_rating"),
  womenSinglesMaxRating: numeric("women_singles_max_rating"),
  menDoublesMaxRating: numeric("men_doubles_max_rating"),
  womenDoublesMaxRating: numeric("women_doubles_max_rating"),
  notes: text("notes"),
});

export type DssSpeelsterkteThreshold = typeof dssSpeelsterkteThresholds.$inferSelect;

// Glow Skills - All skills across all levels
export const glowSkills = pgTable("glow_skills", {
  id: varchar("id").primaryKey(), // e.g., "FH_CONTACT", "RALLY_COOP", "RESET_ROUTINE"
  pillar: text("pillar").notNull(), // TECHNIQUE, TACTICAL, PHYSICAL, MENTAL, SOCIAL, MATCH
  name: text("name").notNull(), // "Forehand contact"
  stage: text("stage").notNull(), // RED, ORANGE, GREEN, YELLOW (which stage this skill belongs to)
  description: text("description"), // Detailed description
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("glow_skills_pillar_idx").on(table.pillar),
  index("glow_skills_stage_idx").on(table.stage),
]);

export const insertGlowSkillSchema = createInsertSchema(glowSkills).omit({ createdAt: true });
export type InsertGlowSkill = z.infer<typeof insertGlowSkillSchema>;
export type GlowSkill = typeof glowSkills.$inferSelect;

// Skill Rubrics - Observable criteria for 0/1/2 scoring
export const skillRubrics = pgTable("skill_rubrics", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  skillId: varchar("skill_id").references(() => glowSkills.id).notNull(),
  score: integer("score").notNull(), // 0, 1, or 2
  observable: text("observable").notNull(), // What coach observes for this score
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("skill_rubrics_skill_idx").on(table.skillId),
  unique("skill_rubrics_skill_score").on(table.skillId, table.score),
]);

export const insertSkillRubricSchema = createInsertSchema(skillRubrics).omit({ id: true, createdAt: true });
export type InsertSkillRubric = z.infer<typeof insertSkillRubricSchema>;
export type SkillRubric = typeof skillRubrics.$inferSelect;

// Level Skills - Skills required per level with target scores
export const levelSkills = pgTable("level_skills", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  levelId: varchar("level_id").references(() => ballLevels.id).notNull(),
  skillId: varchar("skill_id").references(() => glowSkills.id).notNull(),
  targetScore: integer("target_score").notNull().default(2), // Target: 0, 1, or 2
  weight: numeric("weight", { precision: 3, scale: 2 }).default("1.00"), // For weighted average
  isRequired: boolean("is_required").default(true), // Must-have vs nice-to-have
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("level_skills_level_idx").on(table.levelId),
  index("level_skills_skill_idx").on(table.skillId),
  unique("level_skills_level_skill").on(table.levelId, table.skillId),
]);

export const insertLevelSkillSchema = createInsertSchema(levelSkills).omit({ id: true, createdAt: true });
export type InsertLevelSkill = z.infer<typeof insertLevelSkillSchema>;
export type LevelSkill = typeof levelSkills.$inferSelect;

// Level Tests - Trial tests required for level-up
export const levelTests = pgTable("level_tests", {
  id: varchar("id").primaryKey(), // e.g., "RED3_CONTACT_GATE"
  levelId: varchar("level_id").references(() => ballLevels.id).notNull(),
  name: text("name").notNull(), // "Contact Gate"
  testType: text("test_type").notNull(), // COACH_OBSERVED, MATCH_LOG, AUTO_TRACKED
  description: text("description"),
  metrics: jsonb("metrics").$type<{
    inPlayMin?: number;
    attempts?: number;
    minRallies?: number;
    rallyLen?: number;
    servesInMin?: number;
    zone?: string;
    minEvents?: number;
    format?: string;
    effortFlagsMin?: number;
    noQuit?: boolean;
    followsRules?: boolean;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("level_tests_level_idx").on(table.levelId),
]);

export const insertLevelTestSchema = createInsertSchema(levelTests).omit({ createdAt: true });
export type InsertLevelTest = z.infer<typeof insertLevelTestSchema>;
export type LevelTest = typeof levelTests.$inferSelect;

// Player Ball Level - Player's current level + trial state
export const playerBallLevels = pgTable("player_ball_levels", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  levelId: varchar("level_id").references(() => ballLevels.id).notNull(),
  status: text("status").notNull().default("active"), // active, trial, graduated, needs_support
  
  // Trial tracking
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  trialFromLevelId: varchar("trial_from_level_id").references(() => ballLevels.id),
  
  // History
  assignedAt: timestamp("assigned_at").defaultNow(),
  assignedBy: varchar("assigned_by"), // Coach/system who assigned
  previousLevelId: varchar("previous_level_id").references(() => ballLevels.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("player_ball_levels_player_idx").on(table.playerId),
  index("player_ball_levels_level_idx").on(table.levelId),
  index("player_ball_levels_status_idx").on(table.status),
]);

export const insertPlayerBallLevelSchema = createInsertSchema(playerBallLevels).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayerBallLevel = z.infer<typeof insertPlayerBallLevelSchema>;
export type PlayerBallLevel = typeof playerBallLevels.$inferSelect;

// Player Baseline - One-time intake assessment (Start Baseline feature)
export const playerBaselines = pgTable("player_baselines", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id),
  
  // Auto-suggested vs confirmed level
  suggestedLevelId: varchar("suggested_level_id").references(() => ballLevels.id), // System's suggestion
  confirmedLevelId: varchar("confirmed_level_id").references(() => ballLevels.id), // Coach's final decision
  confidenceScore: integer("confidence_score").default(50), // 0-100 confidence in the level
  
  // Intake questions responses
  tennisExperience: text("tennis_experience"), // 0-6m, 6-18m, 18m+
  playsCompetition: text("plays_competition"), // no, sometimes, often
  canRallyFive: boolean("can_rally_five"), // Can rally 5 balls over the net
  serveAbility: text("serve_ability"), // no, basic, consistent
  
  // Quick baseline - Per pillar ratings (0=not_yet, 1=developing, 2=meets, 3=above)
  techniqueRating: integer("technique_rating"),
  tacticalRating: integer("tactical_rating"),
  physicalRating: integer("physical_rating"),
  mentalRating: integer("mental_rating"),
  socialRating: integer("social_rating"),
  matchRating: integer("match_rating"),
  
  // Lock status
  status: text("status").notNull().default("pending"), // pending, confirmed, locked
  lockedAt: timestamp("locked_at"),
  lockedByCoachId: varchar("locked_by_coach_id").references(() => coaches.id),
  
  // Override tracking
  wasOverridden: boolean("was_overridden").default(false),
  overrideReason: text("override_reason"), // player_clearly_advanced, late_starter_athletic, other_academy, competition_experience, age_mismatch
  overrideNote: text("override_note"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("player_baselines_player_idx").on(table.playerId),
  index("player_baselines_academy_idx").on(table.academyId),
  index("player_baselines_status_idx").on(table.status),
]);

export const insertPlayerBaselineSchema = createInsertSchema(playerBaselines).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayerBaseline = z.infer<typeof insertPlayerBaselineSchema>;
export type PlayerBaseline = typeof playerBaselines.$inferSelect;

// Player Baseline Skill Scores - Deep baseline assessment skill-by-skill
// Stores detailed skill rubrics during one-time intake assessment
export const playerBaselineSkillScores = pgTable("player_baseline_skill_scores", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  baselineId: varchar("baseline_id").references(() => playerBaselines.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  // Skill identification
  pillar: text("pillar").notNull(), // TECHNIQUE, MOVEMENT, TACTICAL, MENTAL, SOCIAL, MATCH
  skillCategory: text("skill_category").notNull(), // e.g., forehand, backhand, serve, return, volley, overhead, footwork, rally_construction, etc.
  
  // Rating (0-3 rubric)
  rating: integer("rating"), // 0=not_yet, 1=developing, 2=meets, 3=above, NULL=not observed
  notObserved: boolean("not_observed").default(false), // Skip this skill for now
  
  // Evidence & notes
  notes: text("notes"),
  evidenceUrl: text("evidence_url"), // Link to video evidence
  
  // Context
  coachId: varchar("coach_id").references(() => coaches.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("player_baseline_skills_baseline_idx").on(table.baselineId),
  index("player_baseline_skills_player_idx").on(table.playerId),
  index("player_baseline_skills_pillar_idx").on(table.pillar),
]);

export const insertPlayerBaselineSkillScoreSchema = createInsertSchema(playerBaselineSkillScores).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayerBaselineSkillScore = z.infer<typeof insertPlayerBaselineSkillScoreSchema>;
export type PlayerBaselineSkillScore = typeof playerBaselineSkillScores.$inferSelect;

// Player Skill Scores - Time-series tracking of skill progress
export const playerSkillScores = pgTable("player_skill_scores", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  skillId: varchar("skill_id").references(() => glowSkills.id).notNull(),
  score: integer("score").notNull(), // 0, 1, or 2
  
  // Context
  sessionId: varchar("session_id").references(() => sessions.id),
  coachId: varchar("coach_id").references(() => coaches.id),
  
  // Weighted average tracking
  movingAverage: numeric("moving_average", { precision: 4, scale: 2 }), // Running weighted average
  observationCount: integer("observation_count").default(1), // How many times this skill has been scored
  
  note: text("note"), // Optional coach note
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("player_skill_scores_player_idx").on(table.playerId),
  index("player_skill_scores_skill_idx").on(table.skillId),
  index("player_skill_scores_session_idx").on(table.sessionId),
  index("player_skill_scores_created_idx").on(table.createdAt),
]);

export const insertPlayerSkillScoreSchema = createInsertSchema(playerSkillScores).omit({ id: true, createdAt: true });
export type InsertPlayerSkillScore = z.infer<typeof insertPlayerSkillScoreSchema>;
export type PlayerSkillScore = typeof playerSkillScores.$inferSelect;

// Player Pillar Progress - Aggregated progress per pillar
export const playerPillarProgress = pgTable("player_pillar_progress", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  pillar: text("pillar").notNull(), // TECHNIQUE, TACTICAL, PHYSICAL, MENTAL, SOCIAL, MATCH
  
  // Current state
  currentScore: numeric("current_score", { precision: 4, scale: 2 }).default("0.00"), // 0-2 average
  trend: text("trend").default("stable"), // improving, stable, declining
  lastSessionDelta: text("last_session_delta"), // +, -, =
  
  // Session tracking
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  lastSessionId: varchar("last_session_id").references(() => sessions.id),
  
  // Attribution: tracks what drove the most recent EMA update
  lastChangeSource: text("last_change_source"), // "coach_assessment" | "match" | "coach_verified_match"
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("player_pillar_progress_player_idx").on(table.playerId),
  unique("player_pillar_progress_unique").on(table.playerId, table.pillar),
]);

export const insertPlayerPillarProgressSchema = createInsertSchema(playerPillarProgress).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayerPillarProgress = z.infer<typeof insertPlayerPillarProgressSchema>;
export type PlayerPillarProgress = typeof playerPillarProgress.$inferSelect;

// Level Trials - Trial attempts with test results
export const levelTrials = pgTable("level_trials", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  fromLevelId: varchar("from_level_id").references(() => ballLevels.id).notNull(),
  toLevelId: varchar("to_level_id").references(() => ballLevels.id).notNull(),
  
  status: text("status").notNull().default("in_progress"), // in_progress, passed, failed, cancelled
  
  // Timing
  startedAt: timestamp("started_at").defaultNow(),
  endsAt: timestamp("ends_at").notNull(), // startedAt + trialDays
  completedAt: timestamp("completed_at"),
  
  // Test results
  testResults: jsonb("test_results").$type<{
    testId: string;
    passed: boolean;
    score?: number;
    maxScore?: number;
    completedAt?: string;
    coachId?: string;
    notes?: string;
  }[]>(),
  
  // Evidence
  evidenceCount: integer("evidence_count").default(0),
  matchCount: integer("match_count").default(0),
  
  // Outcome tracking
  evaluatedBy: varchar("evaluated_by").references(() => coaches.id),
  evaluationNotes: text("evaluation_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("level_trials_player_idx").on(table.playerId),
  index("level_trials_status_idx").on(table.status),
  index("level_trials_from_level_idx").on(table.fromLevelId),
  index("level_trials_to_level_idx").on(table.toLevelId),
]);

export const insertLevelTrialSchema = createInsertSchema(levelTrials).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLevelTrial = z.infer<typeof insertLevelTrialSchema>;
export type LevelTrial = typeof levelTrials.$inferSelect;

// Session Skill Feedback - New quick feedback per session (Effort/Execution/Understanding)
export const sessionSkillFeedback = pgTable("session_skill_feedback", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  
  // Quick ratings (1-5 stars or 0-2 scale)
  effort: integer("effort").notNull(), // 0, 1, 2
  execution: integer("execution").notNull(), // 0, 1, 2
  understanding: integer("understanding").notNull(), // 0, 1, 2
  
  // Overall progress indicator
  overall: text("overall").notNull(), // improved, stable, declined
  
  // Pillar quick ratings (optional, 0-2)
  techniquePillar: integer("technique_pillar"),
  tacticalPillar: integer("tactical_pillar"),
  physicalPillar: integer("physical_pillar"),
  mentalPillar: integer("mental_pillar"),
  socialPillar: integer("social_pillar"),
  matchPillar: integer("match_pillar"),
  
  // Skill ratings (JSONB for flexibility)
  skillRatings: jsonb("skill_ratings").$type<{
    skillId: string;
    score: number; // 0, 1, 2
  }[]>(),
  
  // Stroke-by-stroke feedback (per-shot feedback: forehand, backhand, serve, etc.)
  strokeFeedback: jsonb("stroke_feedback").$type<{
    stroke: string; // forehand | backhand | serve | volley | slice | smash | return | footwork
    rating: number; // 0=attention | 1=developing | 2=good
    note?: string;
  }[]>(),
  
  // Overall lesson intensity
  lessonIntensity: text("lesson_intensity"), // light | normal | intense
  
  // Per-player note (separate from the general note)
  playerNote: text("player_note"),
  
  // Trial readiness flag
  trialReady: boolean("trial_ready").default(false),
  
  // Notes
  note: text("note"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("session_skill_feedback_session_idx").on(table.sessionId),
  index("session_skill_feedback_player_idx").on(table.playerId),
  index("session_skill_feedback_coach_idx").on(table.coachId),
  unique("session_skill_feedback_unique").on(table.sessionId, table.playerId),
]);

export const insertSessionSkillFeedbackSchema = createInsertSchema(sessionSkillFeedback).omit({ id: true, createdAt: true });
export type InsertSessionSkillFeedback = z.infer<typeof insertSessionSkillFeedbackSchema>;
export type SessionSkillFeedback = typeof sessionSkillFeedback.$inferSelect;

// Coach Calibration - Tracks coach scoring accuracy/bias
export const coachCalibration = pgTable("coach_calibration", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull().unique(),
  
  // Bias tracking
  biasScore: numeric("bias_score", { precision: 4, scale: 2 }).default("0.00"), // -1 to +1 (negative = too harsh, positive = too lenient)
  calibrationCount: integer("calibration_count").default(0), // How many calibration clips rated
  lastCalibrationAt: timestamp("last_calibration_at"),
  
  // Anomaly flags
  bulkRatingFlag: boolean("bulk_rating_flag").default(false), // Flagged for bulk ratings
  consistencyScore: numeric("consistency_score", { precision: 4, scale: 2 }).default("1.00"), // 0-1 (1 = consistent)
  
  // Weight adjustment
  scoreWeight: numeric("score_weight", { precision: 3, scale: 2 }).default("1.00"), // Multiplier for this coach's scores
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("coach_calibration_coach_idx").on(table.coachId),
]);

export const insertCoachCalibrationSchema = createInsertSchema(coachCalibration).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoachCalibration = z.infer<typeof insertCoachCalibrationSchema>;
export type CoachCalibration = typeof coachCalibration.$inferSelect;

// ==================== LESSON TEMPLATES & DRILL BLOCKS ====================

// Lesson Templates - Pre-built lesson structures per level
export const lessonTemplates = pgTable("lesson_templates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id), // null = global templates
  levelId: varchar("level_id").references(() => ballLevels.id), // Target level (null = any level)
  
  // Template info
  name: text("name").notNull(), // "Red Ball Fundamentals", "Rally Master Session"
  description: text("description"),
  focus: text("focus").notNull(), // primary, technique, tactical, match_play, assessment
  
  // Duration
  durationMinutes: integer("duration_minutes").notNull().default(60),
  
  // Target settings
  minPlayers: integer("min_players").default(1),
  maxPlayers: integer("max_players").default(6),
  ageGroup: text("age_group"), // kids, juniors, teens, adults
  
  // Template metadata
  tags: jsonb("tags").$type<string[]>().default([]),
  isActive: boolean("is_active").default(true),
  usageCount: integer("usage_count").default(0),
  
  createdBy: varchar("created_by").references(() => coaches.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("lesson_templates_academy_idx").on(table.academyId),
  index("lesson_templates_level_idx").on(table.levelId),
  index("lesson_templates_focus_idx").on(table.focus),
]);

export const insertLessonTemplateSchema = createInsertSchema(lessonTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLessonTemplate = z.infer<typeof insertLessonTemplateSchema>;
export type LessonTemplate = typeof lessonTemplates.$inferSelect;

// Drill Blocks - Components of a lesson template
export const drillBlocks = pgTable("drill_blocks", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").references(() => lessonTemplates.id).notNull(),
  
  // Block info
  name: text("name").notNull(), // "Warm-up Rally", "Forehand Drill", "Match Play"
  description: text("description"),
  blockType: text("block_type").notNull(), // warmup, drill, game, cooldown, break, assessment
  
  // Timing
  orderIndex: integer("order_index").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  
  // Skill tags
  skillIds: jsonb("skill_ids").$type<string[]>().default([]), // Linked glow_skills
  pillars: jsonb("pillars").$type<string[]>().default([]), // TECHNIQUE, TACTICAL, etc.
  
  // Instructions
  coachInstructions: text("coach_instructions"),
  playerInstructions: text("player_instructions"),
  equipmentNeeded: jsonb("equipment_needed").$type<string[]>().default([]),
  
  // Variations
  variations: jsonb("variations").$type<{
    name: string;
    description: string;
    difficulty: string;
  }[]>().default([]),
  
  // Success criteria
  successCriteria: jsonb("success_criteria").$type<{
    metric: string;
    target: number;
    unit: string;
  }[]>(),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("drill_blocks_template_idx").on(table.templateId),
  index("drill_blocks_type_idx").on(table.blockType),
]);

export const insertDrillBlockSchema = createInsertSchema(drillBlocks).omit({ id: true, createdAt: true });
export type InsertDrillBlock = z.infer<typeof insertDrillBlockSchema>;
export type DrillBlock = typeof drillBlocks.$inferSelect;

// Generated Session Plans - Auto-generated lessons for sessions
export const sessionPlans = pgTable("session_plans", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id).notNull(),
  templateId: varchar("template_id").references(() => lessonTemplates.id),
  
  // Plan metadata
  status: text("status").notNull().default("draft"), // draft, active, completed, cancelled
  
  // Customized blocks (copy from template with modifications)
  blocks: jsonb("blocks").$type<{
    id: string;
    name: string;
    blockType: string;
    durationMinutes: number;
    orderIndex: number;
    skillIds: string[];
    coachInstructions?: string;
    playerInstructions?: string;
    equipmentNeeded?: string[];
    status: string; // pending, in_progress, completed, skipped
    startedAt?: string;
    completedAt?: string;
    notes?: string;
  }[]>().default([]),
  
  // Execution tracking
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  currentBlockIndex: integer("current_block_index").default(0),
  
  // Notes
  coachNotes: text("coach_notes"),
  
  generatedBy: varchar("generated_by").references(() => coaches.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("session_plans_session_idx").on(table.sessionId),
  index("session_plans_template_idx").on(table.templateId),
  unique("session_plans_session_unique").on(table.sessionId),
]);

export const insertSessionPlanSchema = createInsertSchema(sessionPlans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSessionPlan = z.infer<typeof insertSessionPlanSchema>;
export type SessionPlan = typeof sessionPlans.$inferSelect;

// ==================== MATCH LOGGING ====================

// Match Logs - Track player matches and results
export const matchLogs = pgTable("match_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  sessionId: varchar("session_id").references(() => sessions.id), // null = external match
  coachId: varchar("coach_id").references(() => coaches.id),
  
  // Match info
  matchType: text("match_type").notNull(), // singles, doubles, practice, tournament, friendly
  matchFormat: text("match_format").notNull(), // tiebreak_only, short_set, full_set, best_of_3
  courtSurface: text("court_surface"), // hard, clay, grass, indoor
  ballType: text("ball_type"), // red, orange, green, yellow
  
  // Opponent
  opponentName: text("opponent_name"),
  opponentPlayerId: varchar("opponent_player_id").references(() => players.id),
  opponentLevel: text("opponent_level"), // RED_3, ORANGE_2, etc.
  
  // Score
  playerScore: jsonb("player_score").$type<number[]>().notNull(), // [6, 3, 7] for sets
  opponentScore: jsonb("opponent_score").$type<number[]>().notNull(),
  result: text("result").notNull(), // won, lost, draw
  
  // Performance metrics
  aces: integer("aces").default(0),
  doubleFaults: integer("double_faults").default(0),
  winners: integer("winners").default(0),
  unforcedErrors: integer("unforced_errors").default(0),
  
  // Observations (linked to pillars)
  observations: jsonb("observations").$type<{
    pillar: string;
    rating: number; // 0, 1, 2
    note?: string;
  }[]>(),
  
  // Coach notes
  coachNotes: text("coach_notes"),
  playerNotes: text("player_notes"),
  
  // Timing
  playedAt: timestamp("played_at").notNull(),
  duration: integer("duration"), // minutes
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("match_logs_player_idx").on(table.playerId),
  index("match_logs_session_idx").on(table.sessionId),
  index("match_logs_played_at_idx").on(table.playedAt),
]);

export const insertMatchLogSchema = createInsertSchema(matchLogs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMatchLog = z.infer<typeof insertMatchLogSchema>;
export type MatchLog = typeof matchLogs.$inferSelect;

// ==================== EVIDENCE CAPTURE ====================

// Skill Evidence - Video clips linked to skill observations
export const skillEvidence = pgTable("skill_evidence", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  skillId: varchar("skill_id").references(() => glowSkills.id).notNull(),
  sessionId: varchar("session_id").references(() => sessions.id),
  trialId: varchar("trial_id").references(() => levelTrials.id),
  
  // Video info
  videoUrl: text("video_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  durationSeconds: integer("duration_seconds").notNull(), // 10 sec clips
  
  // Capture context
  captureType: text("capture_type").notNull(), // skill_demo, trial_gate, match_highlight, practice
  
  // Rating at time of capture
  skillScore: integer("skill_score"), // 0, 1, 2
  
  // Coach review
  reviewedBy: varchar("reviewed_by").references(() => coaches.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewScore: integer("review_score"), // 0, 1, 2 (coach validation)
  reviewNotes: text("review_notes"),
  
  // Status
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  
  capturedBy: varchar("captured_by").references(() => coaches.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("skill_evidence_player_idx").on(table.playerId),
  index("skill_evidence_skill_idx").on(table.skillId),
  index("skill_evidence_session_idx").on(table.sessionId),
  index("skill_evidence_trial_idx").on(table.trialId),
]);

export const insertSkillEvidenceSchema = createInsertSchema(skillEvidence).omit({ id: true, createdAt: true });
export type InsertSkillEvidence = z.infer<typeof insertSkillEvidenceSchema>;
export type SkillEvidence = typeof skillEvidence.$inferSelect;

// ==================== MULTI-LANGUAGE ROLE VIEWS ====================

// Role Message Templates - Different views for coach/player/parent
export const roleMessageTemplates = pgTable("role_message_templates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id), // null = global
  
  // Template key
  templateKey: text("template_key").notNull(), // feedback_summary, level_up, session_reminder, etc.
  
  // Role-specific messages
  coachMessage: text("coach_message").notNull(), // Technical language
  playerMessage: text("player_message").notNull(), // Fun, encouraging language
  parentMessage: text("parent_message").notNull(), // Informative, supportive language
  
  // Placeholders info
  placeholders: jsonb("placeholders").$type<string[]>().default([]), // {playerName}, {skillName}, {level}
  
  // Category
  category: text("category").notNull(), // feedback, progress, notification, celebration
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("role_message_templates_academy_idx").on(table.academyId),
  index("role_message_templates_key_idx").on(table.templateKey),
  unique("role_message_templates_unique").on(table.academyId, table.templateKey),
]);

export const insertRoleMessageTemplateSchema = createInsertSchema(roleMessageTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoleMessageTemplate = z.infer<typeof insertRoleMessageTemplateSchema>;
export type RoleMessageTemplate = typeof roleMessageTemplates.$inferSelect;

// Level Up Events - Track promotions with rewards
export const levelUpEvents = pgTable("level_up_events", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  // Level transition
  fromLevelId: varchar("from_level_id").references(() => ballLevels.id).notNull(),
  toLevelId: varchar("to_level_id").references(() => ballLevels.id).notNull(),
  trialId: varchar("trial_id").references(() => levelTrials.id),
  
  // Rewards earned
  xpAwarded: integer("xp_awarded").default(0),
  badgesAwarded: jsonb("badges_awarded").$type<string[]>().default([]),
  titleUnlocked: varchar("title_unlocked"),
  
  // Celebration status
  celebrationShown: boolean("celebration_shown").default(false),
  celebrationShownAt: timestamp("celebration_shown_at"),
  
  // Messages sent
  playerNotified: boolean("player_notified").default(false),
  parentNotified: boolean("parent_notified").default(false),
  
  promotedBy: varchar("promoted_by").references(() => coaches.id),
  promotedAt: timestamp("promoted_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("level_up_events_player_idx").on(table.playerId),
  index("level_up_events_from_level_idx").on(table.fromLevelId),
  index("level_up_events_to_level_idx").on(table.toLevelId),
]);

export const insertLevelUpEventSchema = createInsertSchema(levelUpEvents).omit({ id: true, createdAt: true });
export type InsertLevelUpEvent = z.infer<typeof insertLevelUpEventSchema>;
export type LevelUpEvent = typeof levelUpEvents.$inferSelect;

// ==================== MATCH INTELLIGENCE SYSTEM ====================

// Match playstyle tags for opponent scouting
export const playstyleTags = [
  "baseline_grinder",
  "aggressive_hitter",
  "serve_focused",
  "consistent_defender",
  "net_player",
  "counterpuncher",
  "all_court",
  "pusher",
  "big_server",
  "touch_player",
] as const;
export type PlaystyleTag = typeof playstyleTags[number];

// Match types
export const matchTypes = ["practice", "competitive", "tournament", "friendly", "league"] as const;
export type MatchType = typeof matchTypes[number];

// Match Opponents - Opponent profiles for scouting
export const matchOpponents = pgTable("match_opponents", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(), // The player who has this opponent
  
  // Opponent info
  name: text("name").notNull(),
  club: text("club"),
  glowRank: integer("glow_rank"), // If known from system
  externalRating: text("external_rating"), // UTR, NTRP, etc.
  
  // Playstyle profile
  playstyleTags: jsonb("playstyle_tags").$type<PlaystyleTag[]>().default([]),
  strongerSide: text("stronger_side"), // FH, BH, Neutral
  weakerSide: text("weaker_side"),
  
  // Patterns
  typicalPatterns: jsonb("typical_patterns").$type<string[]>().default([]), // Long rallies, Short points, Errors under pressure
  
  // Recent form (auto-calculated from matches)
  last5Matches: jsonb("last_5_matches").$type<{ result: "W" | "L"; date: string }[]>().default([]),
  winRate: integer("win_rate"), // Percentage against this opponent
  
  // Notes
  coachNotes: text("coach_notes"),
  playerNotes: text("player_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("match_opponents_player_idx").on(table.playerId),
]);

export const insertMatchOpponentSchema = createInsertSchema(matchOpponents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMatchOpponent = z.infer<typeof insertMatchOpponentSchema>;
export type MatchOpponent = typeof matchOpponents.$inferSelect;

// Match Plans - Pre-match strategy and check-in
export const matchPlans = pgTable("match_plans", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  opponentId: varchar("opponent_id").references(() => matchOpponents.id),
  matchId: varchar("match_id"), // Set after match is created
  
  // Scheduled match info
  scheduledDate: date("scheduled_date"),
  scheduledTime: text("scheduled_time"),
  venue: text("venue"),
  matchType: text("match_type").$type<MatchType>().default("competitive"),
  
  // Focus points (max 3)
  primaryTactic: text("primary_tactic"), // e.g., "Rally crosscourt to BH"
  mentalCue: text("mental_cue"), // e.g., "Stay patient first 5 shots"
  energyFocus: text("energy_focus"), // e.g., "Reset after every point"
  
  // Auto-suggested tactics based on opponent
  suggestedTactics: jsonb("suggested_tactics").$type<string[]>().default([]),
  
  // Pre-match check-in
  preMatchEnergy: text("pre_match_energy"), // low, ok, high
  preMatchMood: text("pre_match_mood"), // neutral, positive, fired_up
  preMatchConfidence: integer("pre_match_confidence"), // 1-10
  
  status: text("status").notNull().default("draft"), // draft, active, completed
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("match_plans_player_idx").on(table.playerId),
  index("match_plans_opponent_idx").on(table.opponentId),
  index("match_plans_date_idx").on(table.scheduledDate),
]);

export const insertMatchPlanSchema = createInsertSchema(matchPlans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMatchPlan = z.infer<typeof insertMatchPlanSchema>;
export type MatchPlan = typeof matchPlans.$inferSelect;

// Matches - Played match records
export const matches = pgTable("matches", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  opponentId: varchar("opponent_id").references(() => matchOpponents.id),
  planId: varchar("plan_id").references(() => matchPlans.id),
  academyId: varchar("academy_id").references(() => academies.id),
  
  // Match details
  matchDate: date("match_date").notNull(),
  matchType: text("match_type").$type<MatchType>().default("competitive"),
  surface: text("surface"), // hard, clay, grass, indoor
  venue: text("venue"),
  
  // Score
  result: text("result").notNull(), // win, loss
  score: text("score").notNull(), // e.g., "6-4 3-6 7-5"
  setsWon: integer("sets_won").default(0),
  setsLost: integer("sets_lost").default(0),
  gamesWon: integer("games_won").default(0),
  gamesLost: integer("games_lost").default(0),
  
  // Duration
  durationMinutes: integer("duration_minutes"),
  
  // Performance metrics
  aces: integer("aces").default(0),
  doubleFaults: integer("double_faults").default(0),
  winners: integer("winners").default(0),
  unforcedErrors: integer("unforced_errors").default(0),
  
  // Trust level
  trustLevel: text("trust_level").notNull().default("self_reported"), // self_reported, coach_verified, tournament
  verifiedBy: varchar("verified_by").references(() => coaches.id),
  verifiedAt: timestamp("verified_at"),
  
  // Glow Rank impact
  glowRankBefore: integer("glow_rank_before"),
  glowRankAfter: integer("glow_rank_after"),
  glowRankChange: integer("glow_rank_change").default(0),
  confidenceChange: integer("confidence_change").default(0),

  // External court booking — captured at match creation so the recap can
  // surface venue arrangements after the match completes.
  courtBookingStatus: text("court_booking_status"), // 'academy_court' | 'external_booked' | 'external_pending'
  courtBookingNote: text("court_booking_note"),
  courtBookingUrl: text("court_booking_url"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("matches_player_idx").on(table.playerId),
  index("matches_opponent_idx").on(table.opponentId),
  index("matches_date_idx").on(table.matchDate),
  index("matches_academy_idx").on(table.academyId),
]);

export const insertMatchSchema = createInsertSchema(matches).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matches.$inferSelect;

// Match Challenges - Player vs Player challenge system
export const matchChallenges = pgTable("match_challenges", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  challengerId: varchar("challenger_id").references(() => players.id).notNull(),
  opponentId: varchar("opponent_id").references(() => players.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id),
  matchType: text("match_type").notNull().default("singles"), // singles, doubles
  matchFormat: text("match_format").notNull().default("friendly"), // friendly, competitive, ranking
  matchDate: date("match_date").notNull(),
  matchTime: text("match_time").notNull(), // HH:MM format
  courtId: varchar("court_id").references(() => courts.id),
  courtName: text("court_name"), // for custom/external courts
  customLocation: text("custom_location"), // address for external courts
  message: text("message"), // optional challenge message
  status: text("status").notNull().default("pending"), // pending, accepted, declined, cancelled, completed
  respondedAt: timestamp("responded_at"),
  winnerPlayerId: varchar("winner_player_id").references(() => players.id),
  score: text("score"), // e.g., "6-4, 7-5"
  resultStatus: text("result_status"), // played, no_show, cancelled, skipped
  // External court booking (Dubai community courts) — manual stop-gap until API integration.
  // Status set by challenger when creating: 'academy_court' | 'external_booked' | 'external_pending'
  courtBookingStatus: text("court_booking_status"),
  courtBookingNote: text("court_booking_note"),
  courtBookingUrl: text("court_booking_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("match_challenges_challenger_idx").on(table.challengerId),
  index("match_challenges_opponent_idx").on(table.opponentId),
  index("match_challenges_status_idx").on(table.status),
  index("match_challenges_date_idx").on(table.matchDate),
]);

export const insertMatchChallengeSchema = createInsertSchema(matchChallenges).omit({ id: true, createdAt: true, updatedAt: true, respondedAt: true });
export type InsertMatchChallenge = z.infer<typeof insertMatchChallengeSchema>;
export type MatchChallenge = typeof matchChallenges.$inferSelect;

// Match Reflections - Post-match player input
export const matchReflections = pgTable("match_reflections", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  matchId: varchar("match_id").references(() => matches.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  // What worked (tap selection)
  whatWorked: jsonb("what_worked").$type<string[]>().default([]), // serve, return, forehand, backhand, volleys, movement, tactics, mental
  
  // What didn't work (tap selection)
  whatDidntWork: jsonb("what_didnt_work").$type<string[]>().default([]),
  
  // Biggest challenge (single selection)
  biggestChallenge: text("biggest_challenge"), // errors, nerves, fitness, opponent_strength, tactics, concentration
  
  // Post-match feeling
  postMatchEnergy: text("post_match_energy"), // exhausted, tired, ok, good, great
  postMatchMood: text("post_match_mood"), // frustrated, disappointed, neutral, satisfied, happy
  postMatchConfidence: integer("post_match_confidence"), // 1-10
  
  // Pre-match reflection
  preMatchMood: text("pre_match_mood"), // nervous, focused, flat, confident, excited
  preMatchConfidence: integer("pre_match_confidence"), // 1-10
  preMatchGoal: text("pre_match_goal"), // brief intention (max 80 chars)
  
  // Free text (optional, limited)
  keyTakeaway: text("key_takeaway"), // Max 100 chars
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("match_reflections_match_idx").on(table.matchId),
  index("match_reflections_player_idx").on(table.playerId),
]);

export const insertMatchReflectionSchema = createInsertSchema(matchReflections).omit({ id: true, createdAt: true });
export type InsertMatchReflection = z.infer<typeof insertMatchReflectionSchema>;
export type MatchReflection = typeof matchReflections.$inferSelect;

// Match Pillar Scores - 6-pillar performance per match
export const matchPillarScores = pgTable("match_pillar_scores", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  matchId: varchar("match_id").references(() => matches.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  // Pillar scores (0-100)
  technicalScore: integer("technical_score"), // Based on errors/winners
  tacticalScore: integer("tactical_score"), // Plan execution
  physicalScore: integer("physical_score"), // Stamina/movement
  mentalScore: integer("mental_score"), // Pressure points performance
  socialScore: integer("social_score"), // Fair play, sportsmanship
  matchScore: integer("match_score"), // Experience gained
  
  // Pillar status for display
  technicalStatus: text("technical_status"), // good, warning, poor
  tacticalStatus: text("tactical_status"),
  physicalStatus: text("physical_status"),
  mentalStatus: text("mental_status"),
  socialStatus: text("social_status"),
  matchStatus: text("match_status"),
  
  // Insights per pillar
  technicalInsight: text("technical_insight"),
  tacticalInsight: text("tactical_insight"),
  physicalInsight: text("physical_insight"),
  mentalInsight: text("mental_insight"),
  socialInsight: text("social_insight"),
  matchInsight: text("match_insight"),
  
  // Auto-generated or coach-provided
  source: text("source").notNull().default("auto"), // auto, coach
  coachId: varchar("coach_id").references(() => coaches.id),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("match_pillar_scores_match_idx").on(table.matchId),
  index("match_pillar_scores_player_idx").on(table.playerId),
]);

export const insertMatchPillarScoreSchema = createInsertSchema(matchPillarScores).omit({ id: true, createdAt: true });
export type InsertMatchPillarScore = z.infer<typeof insertMatchPillarScoreSchema>;
export type MatchPillarScore = typeof matchPillarScores.$inferSelect;

// Coach Match Reviews - Quick coach feedback
export const coachMatchReviews = pgTable("coach_match_reviews", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  matchId: varchar("match_id").references(() => matches.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  // Quick pillar feedback (thumbs up/down)
  technicalFeedback: text("technical_feedback"), // good, needs_work
  tacticalFeedback: text("tactical_feedback"),
  physicalFeedback: text("physical_feedback"),
  mentalFeedback: text("mental_feedback"),
  socialFeedback: text("social_feedback"),
  matchFeedback: text("match_feedback"),
  
  // Top improvements (max 3)
  topImprovements: jsonb("top_improvements").$type<string[]>().default([]),
  
  // Strength to reinforce (1)
  strengthToReinforce: text("strength_to_reinforce"),
  
  // Suggested next lesson focus (auto-generated or selected)
  suggestedLessonFocus: jsonb("suggested_lesson_focus").$type<string[]>().default([]),
  
  // Optional voice note or comment
  voiceNoteUrl: text("voice_note_url"),
  comment: text("comment"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("coach_match_reviews_match_idx").on(table.matchId),
  index("coach_match_reviews_coach_idx").on(table.coachId),
  index("coach_match_reviews_player_idx").on(table.playerId),
]);

export const insertCoachMatchReviewSchema = createInsertSchema(coachMatchReviews).omit({ id: true, createdAt: true });
export type InsertCoachMatchReview = z.infer<typeof insertCoachMatchReviewSchema>;
export type CoachMatchReview = typeof coachMatchReviews.$inferSelect;

// Pressure Moments - Auto-detected key moments in match
export const pressureMoments = pgTable("pressure_moments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  matchId: varchar("match_id").references(() => matches.id).notNull(),
  
  // Moment type
  momentType: text("moment_type").notNull(), // break_point, set_point, match_point, tiebreak, comeback
  
  // Context
  setNumber: integer("set_number"),
  gameScore: text("game_score"), // e.g., "5-4"
  pointScore: text("point_score"), // e.g., "30-40"
  
  // Outcome
  outcome: text("outcome").notNull(), // won, lost
  
  // Performance indicators
  confidenceLevel: integer("confidence_level"), // 1-10 at this moment
  errorIncrease: boolean("error_increase").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("pressure_moments_match_idx").on(table.matchId),
]);

export const insertPressureMomentSchema = createInsertSchema(pressureMoments).omit({ id: true, createdAt: true });
export type InsertPressureMoment = z.infer<typeof insertPressureMomentSchema>;
export type PressureMoment = typeof pressureMoments.$inferSelect;

// Match Training Suggestions - Auto-generated training focus
export const matchTrainingSuggestions = pgTable("match_training_suggestions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  matchId: varchar("match_id").references(() => matches.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  // Focus area
  focusArea: text("focus_area").notNull(), // backhand_under_pressure, serve_consistency, net_approaches
  pillar: text("pillar").notNull(), // technique, tactical, physical, mental, social, match
  
  // Priority
  priority: integer("priority").notNull().default(1), // 1 = highest
  
  // Duration
  suggestedWeeks: integer("suggested_weeks").default(2),
  
  // Related lesson templates
  relatedTemplateIds: jsonb("related_template_ids").$type<string[]>().default([]),
  
  // Status
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, dismissed
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("match_training_suggestions_match_idx").on(table.matchId),
  index("match_training_suggestions_player_idx").on(table.playerId),
]);

export const insertMatchTrainingSuggestionSchema = createInsertSchema(matchTrainingSuggestions).omit({ id: true, createdAt: true });
export type InsertMatchTrainingSuggestion = z.infer<typeof insertMatchTrainingSuggestionSchema>;
export type MatchTrainingSuggestion = typeof matchTrainingSuggestions.$inferSelect;

// ==================== PLAYER LEVEL SYSTEM (Solo Leveling) ====================
// This is the app engagement progression system, separate from tennis skill levels

// Player Level titles based on level ranges
export const playerLevelTitles = [
  "Rookie",      // 1-3
  "Player",      // 4-6
  "Competitor",  // 7-9
  "Strategist",  // 10-12
  "Champion",    // 13-15
  "Legend",      // 16-18
  "Elite",       // 19-20
] as const;
export type PlayerLevelTitle = typeof playerLevelTitles[number];

// XP action sources
export const xpActionSources = [
  "session_attendance",
  "feedback_received",
  "feedback_read",
  "match_played",
  "match_evaluation",
  "quest_daily",
  "quest_weekly",
  "streak_bonus",
  "profile_complete",
  "first_community_post",
  "first_friend_added",
  "level_up_bonus",
  "badge_earned",
  "skill_validation",
  "court_booking",
  "lesson_booking",
  "spotlight_weekly_winner",
  "spotlight_monthly_winner",
] as const;
export type XPActionSource = typeof xpActionSources[number];

// Player Level Thresholds - How much XP needed per level (configurable by platform owner)
export const playerLevelThresholds = pgTable("player_level_thresholds", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  level: integer("level").notNull().unique(), // 1, 2, 3, ... 20
  xpRequired: integer("xp_required").notNull(), // XP needed to reach this level (resets each level)
  title: text("title").notNull(), // Rookie, Player, Competitor, etc.
  
  // Optional rewards at this level
  badgeUnlock: text("badge_unlock"),
  titleUnlock: text("title_unlock"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("player_level_thresholds_level_idx").on(table.level),
]);

export const insertPlayerLevelThresholdSchema = createInsertSchema(playerLevelThresholds).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayerLevelThreshold = z.infer<typeof insertPlayerLevelThresholdSchema>;
export type PlayerLevelThreshold = typeof playerLevelThresholds.$inferSelect;

// Player Level XP Rules - How much XP each action gives (configurable by platform owner)
export const playerLevelXpRules = pgTable("player_level_xp_rules", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  actionSource: text("action_source").notNull().unique(), // session_attendance, feedback_received, etc.
  xpAmount: integer("xp_amount").notNull().default(10),
  description: text("description"),
  
  // Optional multipliers
  isOneTime: boolean("is_one_time").default(false), // Can only be earned once (e.g., profile_complete)
  cooldownMinutes: integer("cooldown_minutes"), // Prevent spam (e.g., can only earn XP every 60 minutes for same action)
  maxPerDay: integer("max_per_day"), // Daily cap for this action
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("player_level_xp_rules_source_idx").on(table.actionSource),
]);

export const insertPlayerLevelXpRuleSchema = createInsertSchema(playerLevelXpRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayerLevelXpRule = z.infer<typeof insertPlayerLevelXpRuleSchema>;
export type PlayerLevelXpRule = typeof playerLevelXpRules.$inferSelect;

// Feature unlock keys - all features in the app that can be gated by level
export const featureUnlockKeys = [
  // Core (always unlocked)
  "home_dashboard",
  "profile",
  "settings",
  "notifications",
  "help",
  "coach_chat",
  // Payments & Bookings (early unlock - important for academy)
  "credit_store",
  "lesson_booking",
  "my_lesson_requests",
  "parent_dashboard",
  "invoices",
  "payments",
  "schedule",
  // Engagement
  "quests",
  "coach_profile_view",
  "training_history",
  "skill_journey",
  "level_up_history",
  // Progress & Analysis
  "progress_overview",
  "skill_details",
  "match_preparation",
  "match_analysis",
  // Social
  "community_feed",
  "player_finder",
  "friends_list",
  "groups",
  "public_profile",
  "glow_leaderboard",
  "collection",
  // Shop & Marketplace
  "academy_shop",
  "marketplace",
  "my_listings",
  // Advanced
  "court_booking",
  "my_court_bookings",
  "academy_browser",
  "coach_directory",
] as const;
export type FeatureUnlockKey = typeof featureUnlockKeys[number];

// Player Feature Unlocks - Which level unlocks which feature (configurable by platform owner)
export const playerFeatureUnlocks = pgTable("player_feature_unlocks", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  featureKey: text("feature_key").notNull().unique(), // from featureUnlockKeys
  requiredLevel: integer("required_level").notNull().default(1),
  
  // UI metadata
  featureName: text("feature_name").notNull(), // Display name
  featureDescription: text("feature_description"), // Short description
  featureIcon: text("feature_icon"), // Ionicons icon name
  
  // Onboarding content
  onboardingTitle: text("onboarding_title"),
  onboardingDescription: text("onboarding_description"),
  onboardingTips: jsonb("onboarding_tips").$type<string[]>().default([]),
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("player_feature_unlocks_key_idx").on(table.featureKey),
  index("player_feature_unlocks_level_idx").on(table.requiredLevel),
]);

export const insertPlayerFeatureUnlockSchema = createInsertSchema(playerFeatureUnlocks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayerFeatureUnlock = z.infer<typeof insertPlayerFeatureUnlockSchema>;
export type PlayerFeatureUnlock = typeof playerFeatureUnlocks.$inferSelect;

// Player XP Events - Log of all XP transactions
export const playerXpEvents = pgTable("player_xp_events", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  // XP details
  actionSource: text("action_source").notNull(), // from xpActionSources
  xpAmount: integer("xp_amount").notNull(),
  
  // Context
  contextType: text("context_type"), // session, match, quest, etc.
  contextId: varchar("context_id"), // Reference to the related entity
  
  // Level at time of event
  levelAtEvent: integer("level_at_event").notNull(),
  xpBeforeEvent: integer("xp_before_event").notNull(),
  xpAfterEvent: integer("xp_after_event").notNull(),
  
  // Did this trigger a level up?
  triggeredLevelUp: boolean("triggered_level_up").default(false),
  newLevel: integer("new_level"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("player_xp_events_player_idx").on(table.playerId),
  index("player_xp_events_source_idx").on(table.actionSource),
  index("player_xp_events_created_idx").on(table.createdAt),
]);

export const insertPlayerXpEventSchema = createInsertSchema(playerXpEvents).omit({ id: true, createdAt: true });
export type InsertPlayerXpEvent = z.infer<typeof insertPlayerXpEventSchema>;
export type PlayerXpEvent = typeof playerXpEvents.$inferSelect;

// Player Level Up Events - Celebration tracking (separate from skill level ups)
export const playerLevelUpCelebrations = pgTable("player_level_up_celebrations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  
  // Level transition
  fromLevel: integer("from_level").notNull(),
  toLevel: integer("to_level").notNull(),
  newTitle: text("new_title"),
  
  // Rewards
  xpBonusAwarded: integer("xp_bonus_awarded").default(0),
  badgesAwarded: jsonb("badges_awarded").$type<string[]>().default([]),
  featuresUnlocked: jsonb("features_unlocked").$type<string[]>().default([]),
  
  // Celebration status
  celebrationShown: boolean("celebration_shown").default(false),
  celebrationShownAt: timestamp("celebration_shown_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("player_level_up_celebrations_player_idx").on(table.playerId),
  index("player_level_up_celebrations_pending_idx").on(table.celebrationShown),
]);

export const insertPlayerLevelUpCelebrationSchema = createInsertSchema(playerLevelUpCelebrations).omit({ id: true, createdAt: true });
export type InsertPlayerLevelUpCelebration = z.infer<typeof insertPlayerLevelUpCelebrationSchema>;
export type PlayerLevelUpCelebration = typeof playerLevelUpCelebrations.$inferSelect;

// Player Feature Unlock History - Track when features were unlocked
export const playerFeatureUnlockHistory = pgTable("player_feature_unlock_history", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  featureKey: text("feature_key").notNull(),
  
  unlockedAtLevel: integer("unlocked_at_level").notNull(),
  onboardingShown: boolean("onboarding_shown").default(false),
  onboardingShownAt: timestamp("onboarding_shown_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("player_feature_unlock_history_player_idx").on(table.playerId),
  unique("player_feature_unlock_history_unique").on(table.playerId, table.featureKey),
]);

// ==================== DEEP ASSESSMENT SYSTEM ====================
// Layer 2 - Expert Deep Assessment (optional, unlimited depth)
// Contains 140+ subskills organized by pillar for detailed coach assessment

// Deep Assessment Skill Definitions - Master list of all assessable subskills
export const deepAssessmentSkills = pgTable("deep_assessment_skills", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  // Skill identification
  pillar: text("pillar").notNull(), // TECHNIQUE, TACTICAL, PHYSICAL, MENTAL, SOCIAL, MATCH
  category: text("category").notNull(), // e.g., forehand, backhand, serve, return, volley, movement, etc.
  skillKey: text("skill_key").notNull().unique(), // Unique key like "tech_fh_grip", "tact_rally_patience"
  skillName: text("skill_name").notNull(), // Display name: "Grip type (Eastern/Semi/Western)"
  
  // Descriptions (multi-language ready)
  description: text("description"), // Coach-facing technical description
  playerDescription: text("player_description"), // Fun, encouraging description for player view
  parentDescription: text("parent_description"), // Informative description for parents
  
  // Scoring guide
  score0Description: text("score_0_description"), // What 0 (Not Yet) looks like
  score1Description: text("score_1_description"), // What 1 (Developing) looks like  
  score2Description: text("score_2_description"), // What 2 (Meets) looks like
  score3Description: text("score_3_description"), // What 3 (Above) looks like
  
  // Ball level applicability (which levels this skill applies to)
  applicableBallLevels: jsonb("applicable_ball_levels").$type<string[]>().default([]), // ["RED", "ORANGE", "GREEN", "YELLOW", "GLOW"]
  
  // Ordering & visibility
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  
  // System usage hints
  drivesXP: boolean("drives_xp").default(false), // Does scoring this skill award XP?
  drivesDrills: boolean("drives_drills").default(true), // Influences drill suggestions?
  drivesQuests: boolean("drives_quests").default(false), // Creates quests/challenges?
  promotionRequired: boolean("promotion_required").default(false), // Required for level promotion?
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("deep_assessment_skills_pillar_idx").on(table.pillar),
  index("deep_assessment_skills_category_idx").on(table.category),
  index("deep_assessment_skills_active_idx").on(table.isActive),
]);

export const insertDeepAssessmentSkillSchema = createInsertSchema(deepAssessmentSkills).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeepAssessmentSkill = z.infer<typeof insertDeepAssessmentSkillSchema>;
export type DeepAssessmentSkill = typeof deepAssessmentSkills.$inferSelect;

// Player Deep Assessments - Coach ratings for each skill per player
export const playerDeepAssessments = pgTable("player_deep_assessments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  skillId: varchar("skill_id").references(() => deepAssessmentSkills.id).notNull(),
  
  // Rating (0-3 scale)
  score: integer("score"), // 0=not_yet, 1=developing, 2=meets, 3=above, NULL=not assessed
  confidence: text("confidence").default("medium"), // low, medium, high
  
  // Evidence & notes
  notes: text("notes"),
  evidenceUrl: text("evidence_url"), // Link to video evidence
  
  // Assessment context
  coachId: varchar("coach_id").references(() => coaches.id),
  academyId: varchar("academy_id").references(() => academies.id),
  sessionId: varchar("session_id").references(() => sessions.id), // Optional: which session this was assessed in
  
  // History tracking
  previousScore: integer("previous_score"),
  assessmentCount: integer("assessment_count").default(1), // How many times this skill has been assessed
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("player_deep_assessments_player_idx").on(table.playerId),
  index("player_deep_assessments_skill_idx").on(table.skillId),
  index("player_deep_assessments_pillar_idx").on(table.coachId),
  unique("player_deep_assessments_unique").on(table.playerId, table.skillId),
]);

export const insertPlayerDeepAssessmentSchema = createInsertSchema(playerDeepAssessments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayerDeepAssessment = z.infer<typeof insertPlayerDeepAssessmentSchema>;
export type PlayerDeepAssessment = typeof playerDeepAssessments.$inferSelect;

// Deep Assessment Pillar Summaries - Aggregated progress per pillar for deep assessment
export const deepAssessmentPillarSummaries = pgTable("deep_assessment_pillar_summaries", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  pillar: text("pillar").notNull(), // TECHNIQUE, TACTICAL, PHYSICAL, MENTAL, SOCIAL, MATCH
  
  // Progress tracking
  totalSkills: integer("total_skills").default(0), // Total skills in this pillar
  assessedSkills: integer("assessed_skills").default(0), // How many have been scored
  averageScore: numeric("average_score", { precision: 4, scale: 2 }), // Average of scored skills
  
  // Score distribution
  score0Count: integer("score_0_count").default(0),
  score1Count: integer("score_1_count").default(0),
  score2Count: integer("score_2_count").default(0),
  score3Count: integer("score_3_count").default(0),
  
  // Confidence breakdown
  lowConfidenceCount: integer("low_confidence_count").default(0),
  mediumConfidenceCount: integer("medium_confidence_count").default(0),
  highConfidenceCount: integer("high_confidence_count").default(0),
  
  lastAssessedAt: timestamp("last_assessed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("deep_assessment_pillar_summaries_player_idx").on(table.playerId),
  unique("deep_assessment_pillar_summaries_unique").on(table.playerId, table.pillar),
]);

// ==================== COACH WELLNESS TRACKING ====================

// Coach Wellness Logs - Daily wellness tracking for coaches
export const coachWellnessLogs = pgTable("coach_wellness_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id),
  
  // Date of the wellness entry (one entry per day)
  date: date("date").notNull(),
  
  // Sleep tracking (in hours, 0-12)
  sleepHours: numeric("sleep_hours", { precision: 3, scale: 1 }),
  sleepQuality: text("sleep_quality"), // poor | fair | good | excellent
  
  // Nutrition tracking (1-5 scale)
  nutritionScore: integer("nutrition_score"), // 1=poor, 2=fair, 3=okay, 4=good, 5=excellent
  mealsCount: integer("meals_count"), // How many proper meals eaten
  hydrationLevel: text("hydration_level"), // low | moderate | good | excellent
  
  // Energy & mood
  energyLevel: integer("energy_level"), // 1-5 scale
  moodLevel: integer("mood_level"), // 1-5 scale
  stressLevel: integer("stress_level"), // 1-5 scale (1=low, 5=high)
  
  // Physical status
  physicalPain: boolean("physical_pain").default(false), // Any injuries/pain?
  painNotes: text("pain_notes"), // Description of pain if any
  
  // Optional notes
  notes: text("notes"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("coach_wellness_logs_coach_idx").on(table.coachId),
  index("coach_wellness_logs_date_idx").on(table.date),
  unique("coach_wellness_logs_coach_date").on(table.coachId, table.date),
]);

export const insertCoachWellnessLogSchema = createInsertSchema(coachWellnessLogs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoachWellnessLog = z.infer<typeof insertCoachWellnessLogSchema>;
export type CoachWellnessLog = typeof coachWellnessLogs.$inferSelect;

// ==================== PLAYER NOTIFICATIONS ====================

export const playerNotifications = pgTable("player_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  type: varchar("type", { length: 50 }).notNull().default("general"),
  data: json("data"),
  read: boolean("read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==================== PLAYER SPOTLIGHT (Player of the Week / Month) ====================

export const spotlightNominations = pgTable("spotlight_nominations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  nominatorPlayerId: varchar("nominator_player_id").references(() => players.id).notNull(),
  nominatedPlayerId: varchar("nominated_player_id").references(() => players.id).notNull(),
  reason: text("reason").notNull(),
  weekStart: date("week_start").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("spotlight_nom_academy_idx").on(table.academyId),
  index("spotlight_nom_week_idx").on(table.weekStart),
  index("spotlight_nom_nominator_idx").on(table.nominatorPlayerId),
  unique("spotlight_nom_unique_vote").on(table.nominatorPlayerId, table.weekStart),
]);

export const insertSpotlightNominationSchema = createInsertSchema(spotlightNominations).omit({ id: true, createdAt: true });
export type InsertSpotlightNomination = z.infer<typeof insertSpotlightNominationSchema>;
export type SpotlightNomination = typeof spotlightNominations.$inferSelect;

export const spotlightWeeklyWinners = pgTable("spotlight_weekly_winners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  weekStart: date("week_start").notNull(),
  totalVotes: integer("total_votes").notNull().default(0),
  topReason: text("top_reason"),
  xpAwarded: integer("xp_awarded").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("spotlight_weekly_academy_idx").on(table.academyId),
  unique("spotlight_weekly_unique").on(table.academyId, table.weekStart),
]);

export const insertSpotlightWeeklyWinnerSchema = createInsertSchema(spotlightWeeklyWinners).omit({ id: true, createdAt: true });
export type InsertSpotlightWeeklyWinner = z.infer<typeof insertSpotlightWeeklyWinnerSchema>;
export type SpotlightWeeklyWinner = typeof spotlightWeeklyWinners.$inferSelect;

export const spotlightMonthlyWinners = pgTable("spotlight_monthly_winners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  totalWeeklyWins: integer("total_weekly_wins").notNull().default(0),
  totalVotesAllWeeks: integer("total_votes_all_weeks").notNull().default(0),
  xpAwarded: integer("xp_awarded").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("spotlight_monthly_academy_idx").on(table.academyId),
  unique("spotlight_monthly_unique").on(table.academyId, table.month, table.year),
]);

export const insertSpotlightMonthlyWinnerSchema = createInsertSchema(spotlightMonthlyWinners).omit({ id: true, createdAt: true });
export type InsertSpotlightMonthlyWinner = z.infer<typeof insertSpotlightMonthlyWinnerSchema>;
export type SpotlightMonthlyWinner = typeof spotlightMonthlyWinners.$inferSelect;

// ==================== TOURNAMENTS & LADDERS ====================

export const tournaments = pgTable("tournaments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  name: text("name").notNull(),
  sport: text("sport").notNull().default("tennis"), // tennis | padel | pickleball
  type: text("type").notNull(),
  format: text("format").notNull(), // knockout | round_robin | group_knockout | americano
  gender: text("gender").default("open"), // open | male | female
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  startTime: text("start_time"), // e.g. "09:00"
  registrationDeadline: timestamp("registration_deadline"),
  location: text("location").notNull(),
  address: text("address"),
  description: text("description"),
  entryFee: numeric("entry_fee"),
  registrationFee: numeric("registration_fee"), // singles entry fee (alias / explicit)
  doublesRegistrationFee: numeric("doubles_registration_fee"), // doubles partner fee
  spotsTotal: integer("spots_total").notNull().default(32),
  categories: jsonb("categories").$type<string[]>().default([]), // e.g. ["beginner", "intermediate", "u18"]
  levelMin: numeric("level_min"), // e.g. 0
  levelMax: numeric("level_max"), // e.g. 2.5
  venueLat: numeric("venue_lat"), // latitude for distance calculation
  venueLng: numeric("venue_lng"), // longitude for distance calculation
  xpReward: integer("xp_reward").default(100), // XP awarded to tournament winner
  isPublic: boolean("is_public").notNull().default(false),
  status: text("status").notNull().default("upcoming"), // upcoming | registration_open | registration_closed | in_progress | completed | cancelled
  drawPublished: boolean("draw_published").default(false),
  americanoStandings: jsonb("americano_standings").$type<{ playerId: string; name: string; points: number; played: number }[]>(),
  winnerId: varchar("winner_id").references(() => players.id),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("tournaments_academy_idx").on(table.academyId),
  index("tournaments_status_idx").on(table.status),
]);

export const insertTournamentSchema = createInsertSchema(tournaments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournaments.$inferSelect;

export const tournamentParticipants = pgTable("tournament_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").references(() => tournaments.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  category: text("category"), // e.g. "beginner", "intermediate", "u18"
  seed: integer("seed"),
  status: text("status").notNull().default("registered"),
  registeredAt: timestamp("registered_at").defaultNow(),
}, (table) => [
  index("tp_tournament_idx").on(table.tournamentId),
  index("tp_player_idx").on(table.playerId),
  unique("tp_unique_entry").on(table.tournamentId, table.playerId),
]);

export const insertTournamentParticipantSchema = createInsertSchema(tournamentParticipants).omit({ id: true, registeredAt: true });
export type InsertTournamentParticipant = z.infer<typeof insertTournamentParticipantSchema>;
export type TournamentParticipant = typeof tournamentParticipants.$inferSelect;

export const tournamentMatches = pgTable("tournament_matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").references(() => tournaments.id).notNull(),
  round: text("round").notNull(),
  matchOrder: integer("match_order").notNull().default(0),
  player1Id: varchar("player1_id").references(() => players.id),
  player2Id: varchar("player2_id").references(() => players.id),
  score: text("score"),
  winnerId: varchar("winner_id").references(() => players.id),
  court: text("court"),
  scheduledTime: timestamp("scheduled_time"),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull().default("scheduled"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("tm_tournament_idx").on(table.tournamentId),
  index("tm_player1_idx").on(table.player1Id),
  index("tm_player2_idx").on(table.player2Id),
]);

export const insertTournamentMatchSchema = createInsertSchema(tournamentMatches).omit({ id: true, createdAt: true });
export type InsertTournamentMatch = z.infer<typeof insertTournamentMatchSchema>;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;

export const ladders = pgTable("ladders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Nullable: country-scoped ladders (Task #1039) are not tied to a single academy.
  academyId: varchar("academy_id").references(() => academies.id),
  // Task #1039 — Cross-Country Ladders.
  // `scope` controls the player pool. `academy` keeps the legacy behavior;
  // `country` opens the ladder to every active player in the country, per sport.
  scope: text("scope").notNull().default("academy"), // academy | country
  countryCode: text("country_code"), // ISO 3166-1 alpha-2 when scope=country
  // Sport for country ladders (tennis | padel | pickleball). Optional for legacy
  // academy ladders so existing rows do not need a value backfilled.
  sport: text("sport"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  challengeRange: integer("challenge_range").notNull().default(3),
  challengeWindowDays: integer("challenge_window_days").notNull().default(7),
  rules: jsonb("rules").$type<string[]>(),
  status: text("status").notNull().default("active"),
  // Nullable: country ladders are auto-created by the system and have no human creator.
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ladders_academy_idx").on(table.academyId),
  index("ladders_country_idx").on(table.scope, table.countryCode, table.sport),
  uniqueIndex("ladders_country_unique").on(table.scope, table.countryCode, table.sport),
]);

export const insertLadderSchema = createInsertSchema(ladders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLadder = z.infer<typeof insertLadderSchema>;
export type Ladder = typeof ladders.$inferSelect;

export const ladderPlayers = pgTable("ladder_players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ladderId: varchar("ladder_id").references(() => ladders.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  position: integer("position").notNull(),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("lp_ladder_idx").on(table.ladderId),
  index("lp_player_idx").on(table.playerId),
  unique("lp_unique_entry").on(table.ladderId, table.playerId),
]);

export const insertLadderPlayerSchema = createInsertSchema(ladderPlayers).omit({ id: true, joinedAt: true });
export type InsertLadderPlayer = z.infer<typeof insertLadderPlayerSchema>;
export type LadderPlayer = typeof ladderPlayers.$inferSelect;

export const ladderChallenges = pgTable("ladder_challenges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ladderId: varchar("ladder_id").references(() => ladders.id).notNull(),
  challengerId: varchar("challenger_id").references(() => players.id).notNull(),
  challengedId: varchar("challenged_id").references(() => players.id).notNull(),
  challengerPosition: integer("challenger_position").notNull(),
  challengedPosition: integer("challenged_position").notNull(),
  status: text("status").notNull().default("pending"),
  winnerId: varchar("winner_id").references(() => players.id),
  score: text("score"),
  deadline: timestamp("deadline"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("lc_ladder_idx").on(table.ladderId),
  index("lc_challenger_idx").on(table.challengerId),
  index("lc_challenged_idx").on(table.challengedId),
]);

export const insertLadderChallengeSchema = createInsertSchema(ladderChallenges).omit({ id: true, createdAt: true });
export type InsertLadderChallenge = z.infer<typeof insertLadderChallengeSchema>;
export type LadderChallenge = typeof ladderChallenges.$inferSelect;

// ==================== CORPORATE ACCOUNTS ====================

export const corporateAccounts = pgTable("corporate_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  creditBalance: integer("credit_balance").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("corporate_accounts_academy_idx").on(table.academyId),
  index("corporate_accounts_email_idx").on(table.contactEmail),
]);

export const insertCorporateAccountSchema = createInsertSchema(corporateAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export const corporateAccountInputSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  contactName: z.string().min(2, "Contact name is required"),
  contactEmail: z.string().email("Valid email is required"),
  creditBalance: z.number().int().min(0).default(0),
  notes: z.string().optional(),
});
export const addCorporateCreditsSchema = z.object({
  amount: z.number().int().min(1, "Amount must be at least 1"),
  notes: z.string().optional(),
});
export type InsertCorporateAccount = z.infer<typeof insertCorporateAccountSchema>;
export type CorporateAccount = typeof corporateAccounts.$inferSelect;
export type CorporateAccountInput = z.infer<typeof corporateAccountInputSchema>;

export const corporateMembers = pgTable("corporate_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  corporateAccountId: varchar("corporate_account_id").references(() => corporateAccounts.id).notNull(),
  playerId: varchar("player_id").references(() => players.id),
  inviteEmail: text("invite_email").notNull(),
  inviteToken: text("invite_token").unique(),
  inviteStatus: text("invite_status").notNull().default("pending"), // pending | accepted | declined
  invitedBy: varchar("invited_by").references(() => users.id).notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("corporate_members_account_idx").on(table.corporateAccountId),
  index("corporate_members_player_idx").on(table.playerId),
  index("corporate_members_token_idx").on(table.inviteToken),
]);

export const insertCorporateMemberSchema = createInsertSchema(corporateMembers).omit({ id: true, createdAt: true, acceptedAt: true });
export type InsertCorporateMember = z.infer<typeof insertCorporateMemberSchema>;
export type CorporateMember = typeof corporateMembers.$inferSelect;

export const corporateCreditTransactions = pgTable("corporate_credit_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  corporateAccountId: varchar("corporate_account_id").references(() => corporateAccounts.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  playerId: varchar("player_id").references(() => players.id),
  sessionId: varchar("session_id").references(() => sessions.id),
  sessionPlayerId: varchar("session_player_id"), // idempotency key for booking debits
  type: text("type").notNull(), // credit | debit
  amount: integer("amount").notNull(),
  balanceBefore: integer("balance_before").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  reason: text("reason").notNull(), // top_up | session_debit | admin_adjustment
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("corp_credit_tx_account_idx").on(table.corporateAccountId),
  index("corp_credit_tx_player_idx").on(table.playerId),
  uniqueIndex("corp_credit_tx_session_player_uniq").on(table.sessionPlayerId),
]);

export const insertCorporateCreditTransactionSchema = createInsertSchema(corporateCreditTransactions).omit({ id: true, createdAt: true });
export type InsertCorporateCreditTransaction = z.infer<typeof insertCorporateCreditTransactionSchema>;
export type CorporateCreditTransaction = typeof corporateCreditTransactions.$inferSelect;

// ==================== BETA FEEDBACK ====================

export const betaFeedback = pgTable("beta_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id),
  playerName: text("player_name").notNull(),
  category: text("category").notNull(), // bug | idea | compliment
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("bf_player_idx").on(table.playerId),
  index("bf_created_idx").on(table.createdAt),
]);

export const insertBetaFeedbackSchema = createInsertSchema(betaFeedback).omit({ id: true, createdAt: true });
export type InsertBetaFeedback = z.infer<typeof insertBetaFeedbackSchema>;
export type BetaFeedback = typeof betaFeedback.$inferSelect;

// ==================== VIDEO FEEDBACK ====================

export interface VideoAnnotation {
  timestamp: number; // seconds into the video
  text: string;
}

export const videoFeedback = pgTable("video_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  sessionId: varchar("session_id").references(() => sessions.id), // optional
  academyId: varchar("academy_id").references(() => academies.id),
  title: text("title").notNull(),
  videoUrl: text("video_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  annotations: jsonb("annotations").$type<VideoAnnotation[]>().default([]),
  messageId: varchar("message_id"), // references messages.id (set after chat message is created)
  conversationId: varchar("conversation_id"), // references conversations.id
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("vf_coach_idx").on(table.coachId),
  index("vf_player_idx").on(table.playerId),
  index("vf_academy_idx").on(table.academyId),
  index("vf_created_idx").on(table.createdAt),
]);

export const insertVideoFeedbackSchema = createInsertSchema(videoFeedback).omit({ id: true, createdAt: true });
export const videoFeedbackInputSchema = z.object({
  playerId: z.string().min(1, "Player is required"),
  sessionId: z.string().optional(),
  title: z.string().min(1, "Title is required").max(200),
  videoUrl: z.string().min(1, "Video URL is required"),
  thumbnailUrl: z.string().optional(),
  annotations: z.array(z.object({
    timestamp: z.number().min(0),
    text: z.string().min(1).max(500),
  })).default([]),
});
export type InsertVideoFeedback = z.infer<typeof insertVideoFeedbackSchema>;
export type VideoFeedback = typeof videoFeedback.$inferSelect;
export type VideoFeedbackInput = z.infer<typeof videoFeedbackInputSchema>;

// ==================== EQUIPMENT RENTAL & SHOP ====================

export const equipment = pgTable("equipment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),

  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("rental"), // rental | sale

  // Pricing
  priceCredits: integer("price_credits"), // cost in credits (null = not available via credits)
  priceCash: numeric("price_cash", { precision: 10, scale: 2 }), // cost in cash (null = not available for cash)
  currency: text("currency").default("AED"),

  // Inventory
  quantity: integer("quantity").notNull().default(1),
  availableQuantity: integer("available_quantity").notNull().default(1),

  // Media
  photoUrl: text("photo_url"),

  // Status
  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("equipment_academy_idx").on(table.academyId),
  index("equipment_type_idx").on(table.type),
]);

export const insertEquipmentSchema = createInsertSchema(equipment).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type Equipment = typeof equipment.$inferSelect;

export const equipmentRentals = pgTable("equipment_rentals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  equipmentId: varchar("equipment_id").references(() => equipment.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),

  // Rental window
  reservedFrom: timestamp("reserved_from").notNull(),
  reservedUntil: timestamp("reserved_until").notNull(),
  returnedAt: timestamp("returned_at"),

  // Status: reserved | active | returned | overdue | cancelled
  status: text("status").notNull().default("reserved"),

  // Payment
  paymentMethod: text("payment_method").notNull().default("credits"), // credits | cash
  amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }),
  creditsUsed: integer("credits_used"),

  notes: text("notes"),
  transactionType: text("transaction_type").notNull().default("rental"), // rental | purchase
  checkedOutBy: varchar("checked_out_by"), // staff userId who checked out
  checkedInBy: varchar("checked_in_by"),  // staff userId who checked in

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("eq_rentals_equipment_idx").on(table.equipmentId),
  index("eq_rentals_player_idx").on(table.playerId),
  index("eq_rentals_academy_idx").on(table.academyId),
  index("eq_rentals_status_idx").on(table.status),
]);

export const insertEquipmentRentalSchema = createInsertSchema(equipmentRentals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEquipmentRental = z.infer<typeof insertEquipmentRentalSchema>;
export type EquipmentRental = typeof equipmentRentals.$inferSelect;

// ==================== PLAY PARTNER FINDER ====================

export const playRequests = pgTable("play_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").references(() => players.id).notNull(),
  sport: text("sport").notNull().default("tennis"), // tennis | padel | squash | pickleball | badminton
  scheduledAt: timestamp("scheduled_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  location: text("location").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  spotsTotal: integer("spots_total").notNull().default(1),
  spotsFilled: integer("spots_filled").notNull().default(0),
  levelMin: integer("level_min"),
  levelMax: integer("level_max"),
  notes: text("notes"),
  status: text("status").notNull().default("open"), // open | full | cancelled | expired
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("play_requests_creator_idx").on(table.creatorId),
  index("play_requests_status_idx").on(table.status),
  index("play_requests_sport_idx").on(table.sport),
  index("play_requests_scheduled_idx").on(table.scheduledAt),
]);

export const insertPlayRequestSchema = createInsertSchema(playRequests).omit({ id: true, createdAt: true, spotsFilled: true });
export const playRequestInputSchema = z.object({
  sport: z.enum(["tennis", "padel", "squash", "pickleball", "badminton"]).default("tennis"),
  scheduledAt: z.string().min(1, "Date/time is required"),
  expiresAt: z.string().optional(),
  location: z.string().min(1, "Location is required"),
  lat: z.number().optional(),
  lng: z.number().optional(),
  spotsTotal: z.number().int().min(1).max(10).default(1),
  levelMin: z.number().int().min(1).max(10).optional(),
  levelMax: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(500).optional(),
});
export type InsertPlayRequest = z.infer<typeof insertPlayRequestSchema>;
export type PlayRequest = typeof playRequests.$inferSelect;
export type PlayRequestInput = z.infer<typeof playRequestInputSchema>;

export const playRequestParticipants = pgTable("play_request_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").references(() => playRequests.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  status: text("status").notNull().default("joined"), // joined | left
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("prp_request_idx").on(table.requestId),
  index("prp_player_idx").on(table.playerId),
  uniqueIndex("prp_request_player_uniq").on(table.requestId, table.playerId),
]);

export const insertPlayRequestParticipantSchema = createInsertSchema(playRequestParticipants).omit({ id: true, joinedAt: true });
export type InsertPlayRequestParticipant = z.infer<typeof insertPlayRequestParticipantSchema>;
export type PlayRequestParticipant = typeof playRequestParticipants.$inferSelect;

// ==================== LIVE MATCHES ====================

export const liveMatches = pgTable("live_matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Participants
  creatorId: varchar("creator_id").references(() => players.id).notNull(),
  opponentIds: jsonb("opponent_ids").$type<string[]>().notNull().default([]),

  // Match settings
  sport: text("sport").notNull().default("tennis"), // tennis | padel | pickleball
  matchType: text("match_type").notNull().default("singles"), // singles | doubles
  matchFormat: text("match_format").notNull().default("best_of_3"), // best_of_1 | best_of_3 | best_of_5 | tiebreak_only
  scoringMode: text("scoring_mode").notNull().default("standard"), // standard | no_ad | super_tiebreak
  challengeId: varchar("challenge_id"), // optional link to match_challenges

  // Live score state (JSONB for flexibility)
  currentScore: jsonb("current_score").$type<{
    sets: Array<{ creator: number; opponent: number }>;
    currentGame: { creator: number; opponent: number; server?: "creator" | "opponent" };
    setsWon: { creator: number; opponent: number };
    pointHistory: Array<{ point: number; winner: "creator" | "opponent"; timestamp: string }>;
  }>().default(sql`'{"sets":[{"creator":0,"opponent":0}],"currentGame":{"creator":0,"opponent":0},"setsWon":{"creator":0,"opponent":0},"pointHistory":[]}'::jsonb`),

  // Match result
  status: text("status").notNull().default("live"), // live | completed | abandoned
  winnerId: varchar("winner_id").references(() => players.id),
  setScoreSummary: text("set_score_summary"), // e.g. "6-4, 7-5"
  gamesDiff: integer("games_diff").default(0),

  // MMR impact (filled after completion)
  mmrDeltaCreator: integer("mmr_delta_creator"),
  mmrDeltaOpponent: integer("mmr_delta_opponent"),
  previousMmrCreator: integer("previous_mmr_creator"),
  previousMmrOpponent: integer("previous_mmr_opponent"),
  newMmrCreator: integer("new_mmr_creator"),
  newMmrOpponent: integer("new_mmr_opponent"),
  previousRankCreator: integer("previous_rank_creator"),
  newRankCreator: integer("new_rank_creator"),

  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("live_matches_creator_idx").on(table.creatorId),
  index("live_matches_status_idx").on(table.status),
  index("live_matches_started_idx").on(table.startedAt),
]);

export const insertLiveMatchSchema = createInsertSchema(liveMatches).omit({ id: true, createdAt: true, completedAt: true });
export type InsertLiveMatch = z.infer<typeof insertLiveMatchSchema>;
export type LiveMatch = typeof liveMatches.$inferSelect;

// ==================== FAMILY GROUPS (Symmetric peer model — Task #1132) ====================
// Replaces the asymmetric `parent_player_relations`. Every account in a family
// is just a peer; `created_by_player_id` is purely informational (UI only as
// "Family creator: …"). Permissions are NEVER gated on it. The legacy
// `parent_player_relations` table is preserved unchanged for backward
// compatibility — read-only consumers (monthly reports, etc.) keep working.
export const familyGroups = pgTable("family_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdByPlayerId: varchar("created_by_player_id").references(() => players.id),
  name: text("name"), // optional display name, currently unused but reserved
  archivedAt: timestamp("archived_at"), // soft-delete when last member leaves
  createdAt: timestamp("created_at").defaultNow(),
});

export const familyMembers = pgTable("family_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyGroupId: varchar("family_group_id").references(() => familyGroups.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  // "creator" | "member" — display only, NEVER used for permission gating.
  roleLabel: text("role_label").default("member"),
  addedByPlayerId: varchar("added_by_player_id").references(() => players.id),
  // Stub for the Family B PIN system. Defaults to false until B ships, at
  // which point new invites/adds will set this to true.
  addedWithPin: boolean("added_with_pin").default(false),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => ({
  uniqueMember: uniqueIndex("family_members_group_player_unique").on(table.familyGroupId, table.playerId),
  byPlayer: index("family_members_by_player_idx").on(table.playerId),
}));

export type FamilyGroup = typeof familyGroups.$inferSelect;
export type FamilyMemberRow = typeof familyMembers.$inferSelect;

// ==================== FAMILY INVITE CODES ====================

export const familyInviteCodes = pgTable("family_invite_codes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // 6-8 char human-readable code
  parentPlayerId: varchar("parent_player_id").references(() => players.id).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  usedByPlayerId: varchar("used_by_player_id").references(() => players.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFamilyInviteCodeSchema = createInsertSchema(familyInviteCodes).omit({ id: true, createdAt: true, usedAt: true, usedByPlayerId: true });
export type InsertFamilyInviteCode = z.infer<typeof insertFamilyInviteCodeSchema>;
export type FamilyInviteCode = typeof familyInviteCodes.$inferSelect;

// ==================== SPECTATOR LINKS (Family H) ====================
//
// Read-only public web pages so non-account viewers (grandparents, godparents,
// extended family) can follow a player's progress without installing the app.
// One row = one shareable URL. Tokens are 32-char base64url (~192 bits of
// entropy), stored as plain text since they ARE the credential and revocation
// is by `revoked_at`. The owner can mint multiple links per player; they all
// surface the same content but can be revoked independently.
export const spectatorLinks = pgTable("spectator_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  // Who minted the link. May be the player themselves or another family member
  // (any member of the same family group can generate one for any other).
  createdByPlayerId: varchar("created_by_player_id").references(() => players.id).notNull(),
  // Unguessable URL fragment. 32 chars of base64url = 192 bits.
  token: text("token").notNull().unique(),
  // Optional human-readable label for the owner's UI ("Grandma Edith").
  label: text("label"),
  revokedAt: timestamp("revoked_at"),
  // Tracking — bumped on each successful GET /spectate/:token. No PII stored.
  lastViewedAt: timestamp("last_viewed_at"),
  viewCount: integer("view_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("spectator_links_player_idx").on(table.playerId),
  index("spectator_links_token_idx").on(table.token),
]);

export const insertSpectatorLinkSchema = createInsertSchema(spectatorLinks).omit({
  id: true,
  createdAt: true,
  revokedAt: true,
  lastViewedAt: true,
  viewCount: true,
});
export type InsertSpectatorLink = z.infer<typeof insertSpectatorLinkSchema>;
export type SpectatorLink = typeof spectatorLinks.$inferSelect;

// ==================== ACCOUNT PINS (Family B — per-account 4-digit PIN) ====================
// Each player optionally has a 4-digit PIN guarding profile-switch into their
// account. Family creators are PIN-mandatory; added members are PIN-optional
// (the inviter chooses default at invite time). Brute-force is throttled via
// failedAttempts + lockedUntil.
export const accountPins = pgTable("account_pins", {
  playerId: varchar("player_id")
    .primaryKey()
    .references(() => players.id, { onDelete: "cascade" }),
  pinHash: text("pin_hash").notNull(),
  pinSetAt: timestamp("pin_set_at").defaultNow().notNull(),
  pinRecoveryEmail: text("pin_recovery_email"), // defaults to user.email at write time
  failedAttempts: integer("failed_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AccountPin = typeof accountPins.$inferSelect;

// Single-use, 15-minute magic-link tokens for "Forgot PIN" recovery.
export const accountPinRecovery = pgTable("account_pin_recovery", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byTokenHash: index("account_pin_recovery_token_idx").on(t.tokenHash),
  byPlayer: index("account_pin_recovery_player_idx").on(t.playerId),
}));

export type AccountPinRecovery = typeof accountPinRecovery.$inferSelect;

// ==================== ACCOUNT GRADUATION (Family G — Task #1138) ====================
// One row per player who has graduated from a child-of-family account into a
// fully independent account. The row is the source of truth for "this account
// is owned by the graduate themselves" — Family E (spend-limit ownership)
// MUST consult this table before letting another family member edit limits.
// Lawrence stays in `family_members` after graduation; the family link is
// purely informational once `account_graduation` exists for him.
export const accountGraduation = pgTable("account_graduation", {
  // One graduation row per player. Idempotent: re-graduating is a no-op.
  playerId: varchar("player_id")
    .primaryKey()
    .references(() => players.id, { onDelete: "cascade" }),
  graduatedAt: timestamp("graduated_at").defaultNow().notNull(),
  // Who triggered the graduation — usually the parent, sometimes the graduate
  // themselves if they're the one driving it.
  graduatedByPlayerId: varchar("graduated_by_player_id")
    .references(() => players.id),
  // What the user.email value was BEFORE graduation, for audit/recovery.
  previousEmail: text("previous_email"),
});

export type AccountGraduation = typeof accountGraduation.$inferSelect;

// ==================== AI PROGRESS ENGINE ====================

// Per-session AI digest: what was practised, what went well, one focus area
export const sessionAiSummaries = pgTable("session_ai_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  summaryText: text("summary_text").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
}, (table) => [
  index("session_ai_summaries_session_idx").on(table.sessionId),
  index("session_ai_summaries_player_idx").on(table.playerId),
  unique("session_ai_summaries_session_player").on(table.sessionId, table.playerId),
]);

export const insertSessionAiSummarySchema = createInsertSchema(sessionAiSummaries).omit({ id: true, generatedAt: true });
export type InsertSessionAiSummary = z.infer<typeof insertSessionAiSummarySchema>;
export type SessionAiSummary = typeof sessionAiSummaries.$inferSelect;

// Per-player AI narrative: 30-day development summary + focus areas
export const playerAiInsights = pgTable("player_ai_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  narrativeText: text("narrative_text").notNull(),
  focusAreas: jsonb("focus_areas").$type<string[]>().notNull(),
  periodDays: integer("period_days").notNull().default(30),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
}, (table) => [
  index("player_ai_insights_player_idx").on(table.playerId),
  index("player_ai_insights_generated_idx").on(table.generatedAt),
]);

export const insertPlayerAiInsightSchema = createInsertSchema(playerAiInsights).omit({ id: true, generatedAt: true });
export type InsertPlayerAiInsight = z.infer<typeof insertPlayerAiInsightSchema>;
export type PlayerAiInsight = typeof playerAiInsights.$inferSelect;

// AI Coaching Chat — stores conversation history per session+player for review
export const sessionAiChats = pgTable("session_ai_chats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  messages: jsonb("messages").$type<{ role: "system" | "user" | "assistant"; content: string }[]>().notNull().default([]),
  committed: boolean("committed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("session_ai_chats_session_idx").on(table.sessionId),
  index("session_ai_chats_player_idx").on(table.playerId),
]);

export const insertSessionAiChatSchema = createInsertSchema(sessionAiChats).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSessionAiChat = z.infer<typeof insertSessionAiChatSchema>;
export type SessionAiChat = typeof sessionAiChats.$inferSelect;

// AI Coach Conversations — persistent cross-session conversation memory
export const aiCoachConversations = pgTable("ai_coach_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").references(() => coaches.id),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  role: text("role").notNull().$type<"user" | "assistant">(),
  content: text("content").notNull(),
  contextType: text("context_type").notNull().$type<"coach_session" | "player_self">(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("ai_coach_conversations_player_idx").on(table.playerId),
  index("ai_coach_conversations_coach_player_idx").on(table.coachId, table.playerId),
  index("ai_coach_conversations_context_type_idx").on(table.playerId, table.contextType, table.createdAt),
]);

export const insertAiCoachConversationSchema = createInsertSchema(aiCoachConversations).omit({ id: true, createdAt: true });
export type InsertAiCoachConversation = z.infer<typeof insertAiCoachConversationSchema>;
export type AiCoachConversation = typeof aiCoachConversations.$inferSelect;

// ==================== AI USAGE TRACKING ====================

export const AI_FEATURE_TYPES = ["chat", "session-plan", "report", "quest", "notification", "other"] as const;
export type AiFeatureType = typeof AI_FEATURE_TYPES[number];

export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  featureType: text("feature_type").notNull().$type<AiFeatureType>(),
  model: text("model").notNull().default("gpt-4o-mini"),
  promptTokens: integer("prompt_tokens").default(0),
  completionTokens: integer("completion_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  academyId: varchar("academy_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("ai_usage_logs_user_idx").on(table.userId),
  index("ai_usage_logs_academy_idx").on(table.academyId),
  index("ai_usage_logs_created_idx").on(table.createdAt),
  index("ai_usage_logs_feature_idx").on(table.featureType),
]);

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogs).omit({ id: true, createdAt: true });
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;

// ==================== AI PRO SUBSCRIPTION ====================

// Monthly AI usage tracking per player user
// Resets on the 1st of each month; free tier allows 5 calls/month
export const playerAiUsage = pgTable("player_ai_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // references users.id
  month: text("month").notNull(), // "YYYY-MM" e.g. "2026-04"
  callCount: integer("call_count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("player_ai_usage_user_month").on(table.userId, table.month),
  index("player_ai_usage_user_idx").on(table.userId),
]);

export const insertPlayerAiUsageSchema = createInsertSchema(playerAiUsage).omit({ id: true, updatedAt: true });
export type InsertPlayerAiUsage = z.infer<typeof insertPlayerAiUsageSchema>;
export type PlayerAiUsage = typeof playerAiUsage.$inferSelect;

// ==================== SESSION AI BRIEFS ====================

// Pre-session AI coaching brief — generated 30 minutes before the session starts
export const sessionAiBriefs = pgTable("session_ai_briefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => sessions.id),
  coachId: varchar("coach_id").notNull(),
  briefText: text("brief_text").notNull(),
  playerSummaries: jsonb("player_summaries").notNull().default(sql`'[]'::jsonb`),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
}, (table) => [
  unique("session_ai_briefs_session_uniq").on(table.sessionId),
  index("session_ai_briefs_session_idx").on(table.sessionId),
  index("session_ai_briefs_coach_idx").on(table.coachId),
]);

export const insertSessionAiBriefSchema = createInsertSchema(sessionAiBriefs).omit({ id: true, generatedAt: true });
export type InsertSessionAiBrief = z.infer<typeof insertSessionAiBriefSchema>;
export type SessionAiBrief = typeof sessionAiBriefs.$inferSelect;

// Player Session Reflections — Glow Mirror Layer 1
export const playerSessionReflections = pgTable("player_session_reflections", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  sessionId: varchar("session_id").references(() => sessions.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id),
  
  // How did the session feel overall (1-5)
  energyLevel: integer("energy_level"),
  
  // What was hardest (free text, optional)
  hardestPart: text("hardest_part"),
  
  // Key learning from this session (free text)
  keyLearning: text("key_learning"),
  
  // What to focus on next (free text)
  nextFocus: text("next_focus"),
  
  // Overall feeling (1-5)
  overallFeeling: integer("overall_feeling"),
  
  // AI-generated short summary from the answers
  aiSummary: text("ai_summary"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("player_session_reflections_player_idx").on(table.playerId),
  index("player_session_reflections_session_idx").on(table.sessionId),
]);

export const insertPlayerSessionReflectionSchema = createInsertSchema(playerSessionReflections).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayerSessionReflection = z.infer<typeof insertPlayerSessionReflectionSchema>;
export type PlayerSessionReflection = typeof playerSessionReflections.$inferSelect;

// ==================== GLOW MIRROR LAYER 2 — MONTHLY SELF-ASSESSMENT ====================

export const playerMonthlyAssessments = pgTable("player_monthly_assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id),
  // "YYYY-MM" — one per player per month
  monthYear: varchar("month_year", { length: 7 }).notNull(),
  status: varchar("status", { length: 20 }).default("in_progress"), // in_progress | completed
  // 5 guided questions
  strengthsAnswer: text("strengths_answer"),
  challengesAnswer: text("challenges_answer"),
  progressFeelAnswer: text("progress_feel_answer"),
  mindsetAnswer: text("mindset_answer"),
  nextFocusAnswer: text("next_focus_answer"),
  // Player self-rating per pillar: { technical: 7, physical: 5, tactical: 6, mental: 8, matchplay: 5 }
  pillarSelfRatings: jsonb("pillar_self_ratings"),
  // AI-generated 3-sentence summary
  aiSummary: text("ai_summary"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  unique("player_monthly_assessments_player_month_uniq").on(table.playerId, table.monthYear),
  index("player_monthly_assessments_player_idx").on(table.playerId),
]);

export const insertPlayerMonthlyAssessmentSchema = createInsertSchema(playerMonthlyAssessments).omit({ id: true, createdAt: true });
export type InsertPlayerMonthlyAssessment = z.infer<typeof insertPlayerMonthlyAssessmentSchema>;
export type PlayerMonthlyAssessment = typeof playerMonthlyAssessments.$inferSelect;

// ==================== MATCH READINESS ====================

export const playerMatchReadiness = pgTable("player_match_readiness", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  tournamentMatchId: varchar("tournament_match_id").references(() => tournamentMatches.id),
  matchDate: date("match_date").notNull(),
  readinessScore: integer("readiness_score").notNull(),
  topStrength: text("top_strength").notNull(),
  biggestGap: text("biggest_gap").notNull(),
  tacticalTips: jsonb("tactical_tips").$type<string[]>().notNull().default([]),
  dismissed: boolean("dismissed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("pmr_player_idx").on(table.playerId),
  index("pmr_match_date_idx").on(table.matchDate),
  uniqueIndex("pmr_player_matchdate_unique").on(table.playerId, table.matchDate),
]);

export const insertPlayerMatchReadinessSchema = createInsertSchema(playerMatchReadiness).omit({ id: true, createdAt: true });
export type InsertPlayerMatchReadiness = z.infer<typeof insertPlayerMatchReadinessSchema>;
export type PlayerMatchReadiness = typeof playerMatchReadiness.$inferSelect;

// ==================== GLOW PLANS — AI WEEKLY TRAINING PLANS ====================

export const playerAiTrainingPlans = pgTable("player_ai_training_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id),
  academyId: varchar("academy_id").references(() => academies.id),
  // ISO date string "YYYY-MM-DD" of the Monday that starts this week
  weekStartDate: date("week_start_date").notNull(),
  // JSONB: { focusAreas: [{ title, description, drillSuggestion, timeTarget, pillar, rationale }], overallRationale }
  planJson: jsonb("plan_json").$type<{
    focusAreas: {
      title: string;
      description: string;
      drillSuggestion: string;
      timeTarget: string;
      pillar: string;
      rationale: string;
    }[];
    overallRationale: string;
  }>(),
  status: text("status").notNull().default("draft"), // draft | active | archived
  coachNotes: text("coach_notes"), // coach can add/edit notes
  generatedAt: timestamp("generated_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
}, (table) => [
  index("player_ai_training_plans_player_idx").on(table.playerId),
  index("player_ai_training_plans_week_idx").on(table.weekStartDate),
  unique("player_ai_training_plans_player_week_uniq").on(table.playerId, table.weekStartDate),
]);

export const insertPlayerAiTrainingPlanSchema = createInsertSchema(playerAiTrainingPlans).omit({ id: true, generatedAt: true });
export type InsertPlayerAiTrainingPlan = z.infer<typeof insertPlayerAiTrainingPlanSchema>;
export type PlayerAiTrainingPlan = typeof playerAiTrainingPlans.$inferSelect;

// ==================== AI MONTHLY PARENT REPORTS ====================

export const playerMonthlyReports = pgTable("player_monthly_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  academyId: varchar("academy_id").references(() => academies.id),
  // "YYYY-MM" — one per player per month
  monthYear: varchar("month_year", { length: 7 }).notNull(),

  // Attendance summary
  sessionsAttended: integer("sessions_attended").notNull().default(0),
  sessionsTotal: integer("sessions_total").notNull().default(0),

  // Pillar progress highlights — top performing pillars this month
  pillarHighlights: jsonb("pillar_highlights").$type<{ pillar: string; score: number; trend: string }[]>().default([]),

  // AI-synthesised 2-3 sentence progress summary from coach notes
  aiProgressSummary: text("ai_progress_summary"),

  // Player's next Glow milestone (next ball level / next required skill)
  nextMilestone: text("next_milestone"),

  // Optional personal note added by the coach before finalising
  coachNote: text("coach_note"),

  // Coach who added the note (optional)
  coachId: varchar("coach_id").references(() => coaches.id),

  // Report lifecycle
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft | finalised

  // Reference to generated PDF (stored as base64 or URL)
  pdfUrl: text("pdf_url"),

  generatedAt: timestamp("generated_at").defaultNow(),
  finalisedAt: timestamp("finalised_at"),
}, (table) => [
  unique("player_monthly_reports_player_month_uniq").on(table.playerId, table.monthYear),
  index("player_monthly_reports_player_idx").on(table.playerId),
  index("player_monthly_reports_academy_idx").on(table.academyId),
  index("player_monthly_reports_status_idx").on(table.status),
]);

export const insertPlayerMonthlyReportSchema = createInsertSchema(playerMonthlyReports).omit({ id: true, generatedAt: true });
export type InsertPlayerMonthlyReport = z.infer<typeof insertPlayerMonthlyReportSchema>;
export type PlayerMonthlyReport = typeof playerMonthlyReports.$inferSelect;

// ==================== SESSION RATINGS ====================

export const sessionRatings = pgTable("session_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id).notNull(),
  playerId: varchar("player_id").references(() => players.id).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id),
  academyId: varchar("academy_id").references(() => academies.id),
  rating: integer("rating").notNull(), // 1–5
  comment: text("comment"), // optional, max 300 chars
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("session_ratings_session_id_idx").on(table.sessionId),
  index("session_ratings_player_id_idx").on(table.playerId),
  index("session_ratings_coach_id_idx").on(table.coachId),
  index("session_ratings_academy_id_idx").on(table.academyId),
  unique("session_ratings_session_id_player_id_unique").on(table.sessionId, table.playerId),
]);

export const insertSessionRatingSchema = createInsertSchema(sessionRatings).omit({ id: true, createdAt: true });
export const sessionRatingInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(300).optional(),
});
export type InsertSessionRating = z.infer<typeof insertSessionRatingSchema>;
export type SessionRating = typeof sessionRatings.$inferSelect;
export type SessionRatingInput = z.infer<typeof sessionRatingInputSchema>;

// ==================== SESSION INTAKE DATA ====================

// Stores structured pre-chat intake data collected before an AI coaching session
export const sessionIntakeData = pgTable("session_intake_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => sessions.id).notNull(),
  // Null for group-level intake; set for per-player intake
  playerId: varchar("player_id").references(() => players.id),
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),

  // Step 1: What was trained & intensity
  trainedSkills: jsonb("trained_skills").$type<string[]>().default([]),
  intensity: text("intensity"), // light | normal | intense

  // Step 2: Group dynamics (group/semi-private only, stored at session level, playerId = null)
  groupDynamics: jsonb("group_dynamics").$type<{
    overallFocus?: string;       // low | medium | high
    listeningCoachability?: string; // needs_work | ok | great
    groupEnergy?: string;        // flat | normal | electric
    groupCohesion?: string;      // fragmented | mixed | united
  }>(),

  // Step 2b: Player tags (group/semi-private; stored per player)
  playerTags: jsonb("player_tags").$type<string[]>(), // led_group | distracted | helped_others | struggled | stood_out

  // Step 3: Per-player pillar ratings
  pillarRatings: jsonb("pillar_ratings").$type<{
    effort?: string;    // needs_attention | developing | good
    technique?: string;
    tactical?: string;
    physical?: string;
    mental?: string;
  }>(),
  highlight: text("highlight"), // breakthrough | steady | tough_day

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("session_intake_data_session_idx").on(table.sessionId),
  index("session_intake_data_player_idx").on(table.playerId),
]);

export const insertSessionIntakeDataSchema = createInsertSchema(sessionIntakeData).omit({ id: true, createdAt: true });
export type InsertSessionIntakeData = z.infer<typeof insertSessionIntakeDataSchema>;
export type SessionIntakeData = typeof sessionIntakeData.$inferSelect;

// ==================== CURRICULUM INTELLIGENCE ====================

// Level Coaching Context - Failure points and progression checklists per level
export const levelCoachingContext = pgTable("level_coaching_context", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  levelId: varchar("level_id").references(() => ballLevels.id).notNull().unique(),
  failurePoints: jsonb("failure_points").$type<string[]>().default([]),
  progressionChecklist: jsonb("progression_checklist").$type<string[]>().default([]),
  operationalTargets: jsonb("operational_targets").$type<Record<string, string>>().default({}),
  tacticalConcepts: jsonb("tactical_concepts").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("level_coaching_context_level_idx").on(table.levelId),
]);

export const insertLevelCoachingContextSchema = createInsertSchema(levelCoachingContext).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLevelCoachingContext = z.infer<typeof insertLevelCoachingContextSchema>;
export type LevelCoachingContext = typeof levelCoachingContext.$inferSelect;

// Drills - Standardized drill library
export const drills = pgTable("drills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  skillArea: text("skill_area").notNull(), // TECHNIQUE, TACTICAL, PHYSICAL, MENTAL, SERVE, RETURN, etc.
  stageRange: jsonb("stage_range").$type<string[]>().notNull().default([]), // ["RED", "ORANGE"], ["GLOW"] etc.
  instruction: text("instruction").notNull(),
  repRange: text("rep_range"), // e.g. "3 sets of 10", "10 min", "20 balls"
  milestoneCriteria: text("milestone_criteria"), // Observable success criterion
  source: text("source"), // "USTA", "Tennis Australia", "KNLTB", "Glow", "ITF"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("drills_skill_area_idx").on(table.skillArea),
]);

export const insertDrillSchema = createInsertSchema(drills).omit({ id: true, createdAt: true });
export type InsertDrill = z.infer<typeof insertDrillSchema>;
export type Drill = typeof drills.$inferSelect;

// Slot Reservations — temporary holds (5 min TTL) to prevent double-booking race conditions
export const slotReservations = pgTable("slot_reservations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").notNull().references(() => academies.id, { onDelete: "cascade" }),
  coachId: varchar("coach_id").notNull().references(() => coaches.id, { onDelete: "cascade" }),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ==================== CREDIT SYSTEM V2 (Phase 1 — not yet wired up) ====================
// New foundation tables for the credit & package rebuild. These exist alongside
// the legacy `packages` and `credit_transactions` tables and are not yet read
// or written by any live route. Activation happens in later phases via the
// `academies.use_new_credit_system` feature flag.

// Per-(player, academy, type) running balance. Can be negative.
export const playerCreditBalance = pgTable("player_credit_balance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  academyId: varchar("academy_id").notNull().references(() => academies.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // group | semi_private | private
  credits: numeric("credits").notNull().default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("player_credit_balance_unique").on(table.playerId, table.academyId, table.type),
  index("player_credit_balance_academy_idx").on(table.academyId),
]);

export type PlayerCreditBalance = typeof playerCreditBalance.$inferSelect;

// One row per package purchase. Price is locked at purchase time.
// FIFO consumption: oldest non-expired lot first.
export const creditLots = pgTable("credit_lots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  academyId: varchar("academy_id").notNull().references(() => academies.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // group | semi_private | private
  qtyTotal: numeric("qty_total").notNull(),
  qtyRemaining: numeric("qty_remaining").notNull(),
  pricePerCredit: numeric("price_per_credit").notNull().default("0"),
  currency: text("currency").notNull().default("AED"),
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  sourceInvoiceId: varchar("source_invoice_id"),
  sourcePackageId: varchar("source_package_id"), // legacy packages.id during replay
  status: text("status").notNull().default("active"), // active | depleted | expired | refunded
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("credit_lots_player_type_idx").on(table.playerId, table.academyId, table.type),
  index("credit_lots_fifo_idx").on(table.playerId, table.academyId, table.type, table.purchasedAt),
  index("credit_lots_status_idx").on(table.status),
]);

export type CreditLot = typeof creditLots.$inferSelect;

// Immutable ledger. Every credit movement (purchase, consume, refund, makeup,
// manual, expiry) writes exactly one row. eventKey is UNIQUE to make all
// writes idempotent under concurrent load.
export const creditLedgerV2 = pgTable("credit_ledger_v2", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  academyId: varchar("academy_id").notNull().references(() => academies.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // group | semi_private | private | money
  delta: numeric("delta").notNull(), // positive = credit, negative = debit
  reason: text("reason").notNull(), // purchase | consume | refund | makeup | manual | expiry | money_charge | money_topup
  eventKey: varchar("event_key").notNull(),
  actorId: varchar("actor_id"),
  actorRole: text("actor_role"), // player | coach | admin | system
  sessionId: varchar("session_id"),
  sessionPlayerId: varchar("session_player_id"),
  lotId: varchar("lot_id"),
  invoiceId: varchar("invoice_id"),
  balanceAfter: numeric("balance_after").notNull(),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("credit_ledger_v2_event_key_unique").on(table.eventKey),
  index("credit_ledger_v2_player_idx").on(table.playerId, table.academyId, table.occurredAt),
  // Academy-time index for shadow-mode + replay academy-wide chronological scans.
  index("credit_ledger_v2_academy_time_idx").on(table.academyId, table.occurredAt),
  index("credit_ledger_v2_session_idx").on(table.sessionId),
  index("credit_ledger_v2_session_player_idx").on(table.sessionPlayerId),
]);

export type CreditLedgerV2 = typeof creditLedgerV2.$inferSelect;

// Phase 2 — shadow-mode comparison log. Every time the legacy credit hot path
// runs, the shadow runner also calls the new engine and records any divergence
// here for review before flipping `academies.use_new_credit_system`.
export const creditShadowDiff = pgTable("credit_shadow_diff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").notNull().references(() => academies.id, { onDelete: "cascade" }),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(), // consume | refund | balance
  sessionPlayerId: varchar("session_player_id"),
  sessionId: varchar("session_id"),
  type: text("type"), // group | semi_private | private — null for multi-type balance diffs
  legacyValue: jsonb("legacy_value").notNull(),
  newValue: jsonb("new_value").notNull(),
  diff: numeric("diff"), // signed numeric diff when both sides are scalars
  suspectedCause: text("suspected_cause"),
  context: jsonb("context"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("credit_shadow_diff_academy_idx").on(table.academyId, table.createdAt),
  index("credit_shadow_diff_player_idx").on(table.playerId, table.createdAt),
  index("credit_shadow_diff_scope_idx").on(table.scope),
]);

export type CreditShadowDiff = typeof creditShadowDiff.$inferSelect;

// Money wallet for visitor / cross-academy players (no credit packages).
// Negative balance = the player owes the academy money.
export const playerMoneyWallet = pgTable("player_money_wallet", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  academyId: varchar("academy_id").notNull().references(() => academies.id, { onDelete: "cascade" }),
  balance: numeric("balance").notNull().default("0"),
  currency: text("currency").notNull().default("AED"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("player_money_wallet_unique").on(table.playerId, table.academyId),
]);

export type PlayerMoneyWallet = typeof playerMoneyWallet.$inferSelect;

// ==================== WORLD/COUNTRY CHAT ROOMS (Task #1038) ====================
// Cross-academy chat rooms scoped to "world" or per-country (extensible to sport).
// Each room is backed by a `conversations` row of type "world_room" so we can
// reuse the existing messages + reactions infrastructure.

export const chatRooms = pgTable("chat_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull().unique(),
  scope: text("scope").notNull(), // world | country | sport
  countryCode: text("country_code"), // ISO 3166-1 alpha-2 when scope=country
  sport: text("sport"), // when scope=sport
  title: text("title").notNull(),
  flag: text("flag"), // emoji flag
  isPinnedDefault: boolean("is_pinned_default").notNull().default(false),
  mutedAt: timestamp("muted_at"), // room-wide mute (admin)
  mutedBy: varchar("muted_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("chat_rooms_country_unique").on(table.countryCode),
  index("chat_rooms_scope_idx").on(table.scope),
]);

export type ChatRoom = typeof chatRooms.$inferSelect;
export type InsertChatRoom = typeof chatRooms.$inferInsert;

export const chatRoomMutes = pgTable("chat_room_mutes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").references(() => chatRooms.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").notNull(),
  mutedUntil: timestamp("muted_until"), // null = indefinite
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("chat_room_mutes_unique").on(table.roomId, table.userId),
]);

export type ChatRoomMute = typeof chatRoomMutes.$inferSelect;

export const chatRoomReports = pgTable("chat_room_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").references(() => chatRooms.id, { onDelete: "cascade" }).notNull(),
  messageId: varchar("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(),
  reporterUserId: varchar("reporter_user_id").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("open"), // open | resolved | dismissed
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("chat_room_reports_room_idx").on(table.roomId),
  index("chat_room_reports_status_idx").on(table.status),
]);

export type ChatRoomReport = typeof chatRoomReports.$inferSelect;

// Public coaches can pin one promo message per country room per ISO week.
export const chatRoomCoachPins = pgTable("chat_room_coach_pins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").references(() => chatRooms.id, { onDelete: "cascade" }).notNull(),
  coachId: varchar("coach_id").references(() => coaches.id, { onDelete: "cascade" }).notNull(),
  messageId: varchar("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(),
  weekStart: date("week_start").notNull(), // Monday of the ISO week (UTC)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("chat_room_coach_pins_unique").on(table.roomId, table.coachId, table.weekStart),
  index("chat_room_coach_pins_room_idx").on(table.roomId),
]);

export type ChatRoomCoachPin = typeof chatRoomCoachPins.$inferSelect;

// Task #1047 — @mentions in world/country chat rooms.
// Records players mentioned in a room message so chips can be made tappable
// (link to the player's public profile) and so we can fan out notifications.
export const chatRoomMessageMentions = pgTable("chat_room_message_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(),
  playerId: varchar("player_id").references(() => players.id, { onDelete: "cascade" }).notNull(),
  handle: varchar("handle", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("chat_room_msg_mentions_unique").on(table.messageId, table.playerId),
  index("chat_room_msg_mentions_msg_idx").on(table.messageId),
  index("chat_room_msg_mentions_player_idx").on(table.playerId),
]);

export type ChatRoomMessageMention = typeof chatRoomMessageMentions.$inferSelect;

// Persistent log of series-group reminders sent by coaches. Used to enforce a
// per-(coach, series) rate limit (max 3 per trailing 60 minutes) that survives
// server restarts and is shared across instances.
export const seriesReminderLog = pgTable("series_reminder_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").notNull(),
  seriesId: varchar("series_id").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
}, (table) => [
  index("series_reminder_log_coach_series_sent_idx").on(table.coachId, table.seriesId, table.sentAt),
]);

export type SeriesReminderLog = typeof seriesReminderLog.$inferSelect;

// Task #1035 — Country Leaderboards Per Sport.
// Weekly snapshot of a player's rank in a (sport, scope, country) leaderboard
// so we can show a small +/- delta vs last week. We write at most one row per
// (sport, scope, country, player, week).
export const leaderboardSnapshots = pgTable("leaderboard_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sport: text("sport").notNull(),
  scope: text("scope").notNull(), // 'country' | 'global'
  country: text("country").notNull().default(""), // empty string for global scope
  playerId: varchar("player_id").notNull(),
  rank: integer("rank").notNull(),
  snapshotWeek: date("snapshot_week").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("leaderboard_snapshots_unique_idx").on(
    table.sport, table.scope, table.country, table.playerId, table.snapshotWeek,
  ),
  index("leaderboard_snapshots_lookup_idx").on(
    table.sport, table.scope, table.country, table.snapshotWeek,
  ),
]);

export type LeaderboardSnapshot = typeof leaderboardSnapshots.$inferSelect;

// ==================== FEATURE INTEREST (Task #1095) ====================
// Soft demand signal table — players tap "Notify me" on a "Coming soon" feature
// and we record one row per (player, feature). Used today only for an aggregate
// count tile on the platform-owner dashboard; later (Task #1093) we'll email
// these players when the feature ships.
export const featureInterest = pgTable("feature_interest", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(), // e.g. "online_card_payments"
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("feature_interest_player_feature_unique").on(table.playerId, table.featureKey),
]);

export type FeatureInterest = typeof featureInterest.$inferSelect;

// ==================== RELEASE NOTES CACHE (Task #1183) ====================
// Cache of OpenAI-generated "What's New" slides per (version, role, locale).
// Generated on demand by the release-notes-generator service from git commits
// since the previous version, then served by GET /api/release-notes.
// Cache is intentionally permanent — once a version is generated, the
// highlights never change for that version. A simple unique index acts as the
// composite primary key; we keep an auto id so it's easy to delete/regenerate
// individual rows during testing without dropping the whole table.
export const releaseNotesCache = pgTable("release_notes_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  version: text("version").notNull(),
  role: text("role").notNull(), // player | parent | coach | owner
  locale: text("locale").notNull(), // en | nl | id | ar
  fromVersion: text("from_version"), // previous version we diffed against
  slides: jsonb("slides").$type<Array<{
    id: string;
    icon: string;
    title: string;
    body: string;
  }>>().notNull(),
  commitSha: text("commit_sha"), // HEAD sha at generation time
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("release_notes_cache_unique_idx").on(
    table.version, table.role, table.locale,
  ),
]);

export type ReleaseNotesCache = typeof releaseNotesCache.$inferSelect;

