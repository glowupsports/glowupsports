import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, numeric, boolean, date, jsonb, index } from "drizzle-orm/pg-core";
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
});

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
  dateOfBirth: z.string().optional(),
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
  role: z.enum(["platform_owner", "academy_owner", "coach", "assistant", "player"]).default("coach"),
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
  address: text("address"),
  
  // Academy Settings
  defaultSessionLength: integer("default_session_length").default(60),
  xpVisibleToPlayers: boolean("xp_visible_to_players").default(true),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  
  // Freelance Support
  isFreelance: boolean("is_freelance").default(false), // True if this is a coach's personal freelance academy
  freelanceOwnerCoachId: varchar("freelance_owner_coach_id"), // Coach ID who owns this freelance academy
  allowFreelanceCoaches: text("allow_freelance_coaches").default("allow"), // allow | review_required | disallow
  
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
  
  // Parent Dashboard PIN Protection
  parentDashboardPin: text("parent_dashboard_pin").default("1234"), // 4-digit PIN, default 1234
  pinChangedAt: timestamp("pin_changed_at"), // When PIN was last changed (null = never changed, must change on first use)
  
  // Freelance Coach Support
  isFreelance: boolean("is_freelance").default(false), // Coach can run their own personal academy
  personalAcademyId: varchar("personal_academy_id"), // ID of auto-created personal academy for freelancers
  selfServiceRate: numeric("self_service_rate"), // Rate for self-managed sessions (personal academy)
  
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

// Locations
export const locations = pgTable("locations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id),
  name: text("name").notNull(),
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
  
  // Booking Rules
  maxBookingDurationHours: integer("max_booking_duration_hours").default(2),
  minBookingDurationMinutes: integer("min_booking_duration_minutes").default(60),
  cancelWindowHours: integer("cancel_window_hours").default(24), // hours before start time
  guestsAllowed: boolean("guests_allowed").default(false),
  requiresApproval: boolean("requires_approval").default(false), // academy must approve booking
  
  // Operating Hours (JSON for flexibility)
  operatingHours: jsonb("operating_hours").$type<{
    [day: string]: { open: string; close: string; closed?: boolean };
  }>(),
  
  // XP Rewards (game layer)
  xpRewardPerHour: integer("xp_reward_per_hour").default(10),
  
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
  totalXp: integer("total_xp").default(0),
  level: integer("level").default(1),
  glowScore: integer("glow_score").default(0),
  streak: integer("streak").default(0),
  
  onboardingCompleted: boolean("onboarding_completed").default(false),
  motivationType: text("motivation_type"), // fun/improve/compete/unsure
  experienceLevel: text("experience_level"), // new/6-12months/1-3years/3-5years/5-10years/10-20years/20+years
  dominantHand: text("dominant_hand"), // left/right
  backhandType: text("backhand_type"), // single/double
  enjoymentTags: jsonb("enjoyment_tags").$type<string[]>(), // max 3 selections
  focusGoals: jsonb("focus_goals").$type<string[]>(), // multi-select
  selfConfidenceFlags: jsonb("self_confidence_flags").$type<string[]>(), // optional self-check
  
  // Social Profile Fields (Game Character)
  profilePhotoUrl: text("profile_photo_url"),
  displayName: text("display_name"), // Optional nickname
  preferredPlayType: text("preferred_play_type"), // singles/doubles/both
  openToPlay: boolean("open_to_play").default(false), // Findable for matches
  typicalPlayTimes: jsonb("typical_play_times").$type<string[]>(), // morning/afternoon/evening/weekend
  preferredCities: jsonb("preferred_cities").$type<string[]>(), // cities/areas
  matchPreference: text("match_preference"), // casual/training/competitive
  privacyLevel: text("privacy_level").default("platform"), // public/platform/academy
  bio: text("bio"), // Short player bio
  lastActiveAt: timestamp("last_active_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true, createdAt: true });
export const updatePlayerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email("Invalid email format").optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  age: z.number().int().min(0, "Age must be positive").max(120, "Age must be realistic").optional().nullable(),
  dateOfBirth: z.string().optional().nullable(), // ISO date string (YYYY-MM-DD)
  ballLevel: z.enum(["red", "orange", "green", "yellow", "glow"]).optional().nullable(),
  skillLevel: z.number().int().min(1).max(3).optional().nullable(),
  membershipType: z.string().optional().nullable(),
  medicalNotes: z.string().optional().nullable(),
  coachId: z.string().optional().nullable(),
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
  privacyLevel: z.enum(["public", "platform", "academy"]).optional(),
  bio: z.string().max(500).optional().nullable(),
}).transform((data) => ({
  ...data,
  email: data.email === "" ? null : data.email,
}));
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type UpdatePlayer = z.infer<typeof updatePlayerSchema>;
export type Player = typeof players.$inferSelect;

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

// Player Connections - Track who has played together
export const playerConnections = pgTable("player_connections", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  
  player1Id: varchar("player1_id").references(() => players.id).notNull(),
  player2Id: varchar("player2_id").references(() => players.id).notNull(),
  
  // Stats
  matchesPlayed: integer("matches_played").default(0),
  lastPlayedAt: timestamp("last_played_at"),
  
  // Relationship (optional)
  connectionType: text("connection_type"), // friend/rival/training_partner
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  player1Idx: index("player_connections_player1_idx").on(table.player1Id),
  player2Idx: index("player_connections_player2_idx").on(table.player2Id),
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
  
  // Optional: Link package to specific class - credits only valid for this class
  // If null, credits can be used for any class the player is member of
  seriesId: varchar("series_id"),
  
  totalCredits: integer("total_credits").notNull(),
  remainingCredits: integer("remaining_credits").notNull(),
  
  price: numeric("price"), // Price paid for this package
  currency: text("currency").default("AED"),
  
  purchaseDate: timestamp("purchase_date").defaultNow(),
  expiryDate: date("expiry_date"),
  
  status: text("status").default("active"), // active | expired | depleted
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  playerIdx: index("packages_player_idx").on(table.playerId),
  seriesIdx: index("packages_series_idx").on(table.seriesId),
  statusIdx: index("packages_status_idx").on(table.status),
}));

export const insertPackageSchema = createInsertSchema(packages).omit({ id: true, createdAt: true });
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packages.$inferSelect;

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
  skillLevel: integer("skill_level"),
  
  title: text("title"), // Display name like "Sunset Rally", "Glow Doubles"
  maxPlayers: integer("max_players").default(4), // Max players for group sessions
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
  
  googleCalendarEventId: text("google_calendar_event_id"), // External Google Calendar event ID for sync
  
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
  skillLevel: integer("skill_level"),
  maxPlayers: integer("max_players").default(4), // Max capacity
  
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
  linkedPackageId: varchar("linked_package_id").references(() => packages.id),
  
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
  
  xpAwarded: integer("xp_awarded"),
  notes: text("notes"),
});

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
  
  status: text("status").default("waiting"), // waiting/promoted/cancelled/expired
  promotedAt: timestamp("promoted_at"), // When they got a spot
  
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
  type: text("type").notNull(), // coach_player, coach_parent, coach_coach, group
  title: text("title"), // For group chats
  
  // Academy scoping for multi-tenant isolation
  academyId: varchar("academy_id").references(() => academies.id),
  
  // Context for coach_player chats
  playerId: varchar("player_id").references(() => players.id),
  coachId: varchar("coach_id").references(() => coaches.id),
  
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
  
  // Participant can be coach, player, or parent (parent links to player)
  participantType: text("participant_type").notNull(), // coach, player, parent
  coachId: varchar("coach_id").references(() => coaches.id),
  playerId: varchar("player_id").references(() => players.id),
  
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
  senderType: text("sender_type"), // coach, player, parent, system
  senderCoachId: varchar("sender_coach_id").references(() => coaches.id),
  senderPlayerId: varchar("sender_player_id").references(() => players.id),
  
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
  packageId: varchar("package_id").references(() => packages.id),
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
  
  type: text("type").notNull(), // credit | debit | refund | make_up_grant | make_up_used
  amount: integer("amount").notNull(), // positive for credit, negative for debit
  reason: text("reason").notNull(), // session_join | session_cancel | make_up_granted | make_up_lesson_used | package_purchased | admin_adjustment
  
  balanceBefore: integer("balance_before"),
  balanceAfter: integer("balance_after"),
  
  metadata: jsonb("metadata"), // Additional context like session type, payment method
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Prevent duplicate credit transactions for the same player/session/reason combination
  // This is critical for billing correctness under concurrent writes
  index("credit_transactions_player_session_idx").on(table.playerId, table.sessionId),
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
