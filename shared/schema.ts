import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, numeric, boolean, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== EXISTING TABLES ====================

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ==================== COACH APP TABLES ====================

// Coaches
export const coaches = pgTable("coaches", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  homeLocationId: varchar("home_location_id"),
  hourlyRate: numeric("hourly_rate"),
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
  locationId: varchar("location_id").references(() => locations.id),
  name: text("name").notNull(),
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
  name: text("name").notNull(),
  phone: text("phone"),
  ballLevel: text("ball_level"), // red/orange/green/yellow/glow
  skillLevel: integer("skill_level"), // 1/2/3
  membershipType: text("membership_type"),
  medicalNotes: text("medical_notes"),
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
