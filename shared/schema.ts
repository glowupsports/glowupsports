import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, numeric, boolean, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== AUTH TABLES ====================

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("coach"), // owner | coach | assistant
  academyId: varchar("academy_id"), // references academies.id (set after registration)
  coachId: varchar("coach_id"), // references coaches.id (links user to coach profile)
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  role: true,
  academyId: true,
  coachId: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  academyName: z.string().min(2).optional(), // For new academy creation
  role: z.enum(["owner", "coach", "assistant"]).default("coach"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

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
  role: text("role").default("coach"), // owner | coach | assistant
  homeLocationId: varchar("home_location_id"),
  hourlyRate: numeric("hourly_rate"),
  
  level: integer("level").default(1),
  totalXp: integer("total_xp").default(0),
  
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
  phone: text("phone"),
  ballLevel: text("ball_level"), // red/orange/green/yellow/glow
  skillLevel: integer("skill_level"), // 1/2/3
  membershipType: text("membership_type"),
  medicalNotes: text("medical_notes"),
  totalXp: integer("total_xp").default(0),
  level: integer("level").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true, createdAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
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
