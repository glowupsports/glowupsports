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
  password: z.string().min(8, "Password must be at least 8 characters"),
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
  ownerId: varchar("owner_id"), // references coaches.id (set after coach creation)
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
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCoachSchema = createInsertSchema(coaches).omit({ id: true, createdAt: true });
export type InsertCoach = z.infer<typeof insertCoachSchema>;
export type Coach = typeof coaches.$inferSelect;

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
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCourtSchema = createInsertSchema(courts).omit({ id: true, createdAt: true });
export type InsertCourt = z.infer<typeof insertCourtSchema>;
export type Court = typeof courts.$inferSelect;

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
}).transform((data) => ({
  ...data,
  email: data.email === "" ? null : data.email,
}));
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type UpdatePlayer = z.infer<typeof updatePlayerSchema>;
export type Player = typeof players.$inferSelect;

// Packages (Credits)
export const packages = pgTable("packages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").references(() => players.id),
  totalCredits: integer("total_credits").notNull(),
  remainingCredits: integer("remaining_credits").notNull(),
  expiryDate: date("expiry_date"),
});

export const insertPackageSchema = createInsertSchema(packages).omit({ id: true });
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
  
  isRecurring: boolean("is_recurring").default(false),
  recurringGroupId: varchar("recurring_group_id"),
  weekCount: integer("week_count"), // 1/5/10/15/20
  isModifiedFromSeries: boolean("is_modified_from_series").default(false), // edited individually
  isSkipped: boolean("is_skipped").default(false), // manually skipped
  skipReason: text("skip_reason"), // holiday/weather/other
  
  travelTime: integer("travel_time").default(0), // minutes
  
  paymentStatus: text("payment_status").default("unpaid"), // paid/unpaid/partial/package
  price: numeric("price"),
  
  status: text("status").default("scheduled"), // scheduled/cancelled/completed
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Recurring Session Series
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

// Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // session/player/etc
  entityId: varchar("entity_id"),
  action: text("action").notNull(), // create/update/delete/move
  performedBy: varchar("performed_by"),
  metadata: text("metadata"), // JSON string with additional context
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

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
  coachId: varchar("coach_id").references(() => coaches.id).notNull(),
  
  weekday: integer("weekday").notNull(), // 0=Sunday, 1=Monday, etc.
  startTime: text("start_time").notNull(), // HH:MM format
  endTime: text("end_time").notNull(), // HH:MM format
  
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
  
  role: text("role").default("coach"), // platform_owner | academy_owner | coach | assistant
  isActive: boolean("is_active").default(true),
  isPrimary: boolean("is_primary").default(false), // default academy for this coach
  
  joinedAt: timestamp("joined_at").defaultNow(),
  leftAt: timestamp("left_at"),
});

export const insertCoachAcademyMembershipSchema = createInsertSchema(coachAcademyMemberships).omit({ id: true, joinedAt: true });
export type InsertCoachAcademyMembership = z.infer<typeof insertCoachAcademyMembershipSchema>;
export type CoachAcademyMembership = typeof coachAcademyMemberships.$inferSelect;

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

// Invoices - Generated invoices for packages
export const invoices = pgTable("invoices", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  playerId: varchar("player_id").references(() => players.id),
  packageId: varchar("package_id").references(() => packages.id),
  
  invoiceNumber: text("invoice_number").notNull(),
  stripeInvoiceId: text("stripe_invoice_id"),
  
  amount: numeric("amount").notNull(),
  currency: text("currency").default("AED"),
  
  status: text("status").default("draft"), // draft | pending | paid | void | uncollectible
  dueDate: date("due_date"),
  paidAt: timestamp("paid_at"),
  
  lineItems: jsonb("line_items"), // Array of line items
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// Payments - Payment records
export const payments = pgTable("payments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  academyId: varchar("academy_id").references(() => academies.id).notNull(),
  invoiceId: varchar("invoice_id").references(() => invoices.id),
  
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  
  amount: numeric("amount").notNull(),
  currency: text("currency").default("AED"),
  
  status: text("status").default("pending"), // pending | succeeded | failed | refunded
  paymentMethod: text("payment_method"), // card | cash | bank_transfer
  
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

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
