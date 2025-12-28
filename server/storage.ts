import { db } from "./db";
import { eq, and, gte, lte, ne, or, inArray, ilike, sql, count } from "drizzle-orm";
import { desc, asc } from "drizzle-orm";
import {
  // Auth tables
  users,
  type User,
  type InsertUser,
  // Multi-academy structure
  academies,
  // Core tables
  coaches,
  locations,
  courts,
  players,
  packages,
  sessions,
  sessionPlayers,
  playerHolidays,
  sessionFeedback,
  auditLogs,
  offlineQueue,
  playerNotes,
  playerProgress,
  sessionTemplates,
  coachNotifications,
  recurringSeries,
  // Progress Engine V2
  skillDomains,
  playerSkillState,
  sessionSkillObservations,
  levelRequirements,
  coachStatsRollup,
  playerProgressFlags,
  domainAssessments,
  xpTransactions,
  // Coach XP System
  coachXpTransactions,
  // Glow Chat System
  conversations,
  conversationParticipants,
  messages,
  messageReactions,
  // Court Preferences System
  coachCourtPreferences,
  coachCourtRules,
  // Phase 3: Academy Management
  academySettings,
  academyInvites,
  coachAcademyMemberships,
  // Phase 3: Push Notifications
  pushDeviceTokens,
  notificationPreferences,
  scheduledNotifications,
  // Phase 3: Billing & Payments
  billingAccounts,
  subscriptionPlans,
  subscriptions,
  invoices,
  payments,
  refunds,
  // Academy types
  type Academy,
  type InsertAcademy,
  type Coach,
  type InsertCoach,
  type Location,
  type InsertLocation,
  type Court,
  type InsertCourt,
  type Player,
  type InsertPlayer,
  type Session,
  type InsertSession,
  type SessionPlayer,
  type InsertSessionPlayer,
  type PlayerHoliday,
  type InsertPlayerHoliday,
  type SessionFeedback,
  type InsertSessionFeedback,
  type AuditLog,
  type InsertAuditLog,
  type OfflineQueue,
  type InsertOfflineQueue,
  type PlayerNote,
  type InsertPlayerNote,
  type PlayerProgress,
  type InsertPlayerProgress,
  type Package,
  type InsertPackage,
  type SessionTemplate,
  type InsertSessionTemplate,
  type CoachNotification,
  type InsertCoachNotification,
  // Progress Engine V2 types
  type SkillDomain,
  type InsertSkillDomain,
  type PlayerSkillState,
  type InsertPlayerSkillState,
  type SessionSkillObservation,
  type InsertSessionSkillObservation,
  type LevelRequirement,
  type InsertLevelRequirement,
  type CoachStatsRollup,
  type InsertCoachStatsRollup,
  type PlayerProgressFlag,
  type InsertPlayerProgressFlag,
  type DomainAssessment,
  type InsertDomainAssessment,
  type XpTransaction,
  type InsertXpTransaction,
  type CoachXpTransaction,
  type InsertCoachXpTransaction,
  // Recurring Series types
  type RecurringSeries,
  type InsertRecurringSeries,
  // Glow Chat types
  type Conversation,
  type InsertConversation,
  type ConversationParticipant,
  type InsertConversationParticipant,
  type Message,
  type InsertMessage,
  type MessageReaction,
  type InsertMessageReaction,
  // Court Preferences types
  type CoachCourtPreference,
  type InsertCoachCourtPreference,
  type CoachCourtRules,
  type InsertCoachCourtRules,
  // Phase 3 types
  type AcademySettings,
  type InsertAcademySettings,
  type AcademyInvite,
  type InsertAcademyInvite,
  type CoachAcademyMembership,
  type InsertCoachAcademyMembership,
  type PushDeviceToken,
  type InsertPushDeviceToken,
  type NotificationPreference,
  type InsertNotificationPreference,
  type ScheduledNotification,
  type InsertScheduledNotification,
  type BillingAccount,
  type InsertBillingAccount,
  type SubscriptionPlan,
  type InsertSubscriptionPlan,
  type Subscription,
  type InsertSubscription,
  type Invoice,
  type InsertInvoice,
  type Payment,
  type InsertPayment,
  type Refund,
  type InsertRefund,
} from "@shared/schema";

export const storage = {
  // ==================== USERS (AUTH) ====================
  async getUserById(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return result[0];
  },

  async createUser(data: { 
    email: string; 
    password: string; 
    role: string; 
    academyId?: string | null; 
    coachId?: string | null; 
  }): Promise<User> {
    const result = await db.insert(users).values({
      email: data.email.toLowerCase(),
      password: data.password,
      role: data.role,
      academyId: data.academyId || null,
      coachId: data.coachId || null,
    }).returning();
    return result[0];
  },

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const result = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result[0];
  },

  async updateUserLastLogin(id: string): Promise<void> {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
  },

  // ==================== ACADEMIES ====================
  async getAcademy(id: string): Promise<Academy | undefined> {
    const result = await db.select().from(academies).where(eq(academies.id, id));
    return result[0];
  },

  async getAcademyBySlug(slug: string): Promise<Academy | undefined> {
    const result = await db.select().from(academies).where(eq(academies.slug, slug));
    return result[0];
  },

  async getAllAcademies(): Promise<Academy[]> {
    return db.select().from(academies);
  },

  async createAcademy(data: InsertAcademy): Promise<Academy> {
    const result = await db.insert(academies).values(data).returning();
    return result[0];
  },

  async updateAcademy(id: string, data: Partial<InsertAcademy>): Promise<Academy | undefined> {
    const result = await db.update(academies).set(data).where(eq(academies.id, id)).returning();
    return result[0];
  },

  // ==================== COACHES ====================
  async getCoach(id: string, academyId?: string): Promise<Coach | undefined> {
    const conditions = [eq(coaches.id, id)];
    if (academyId) {
      conditions.push(eq(coaches.academyId, academyId));
    }
    const result = await db.select().from(coaches).where(and(...conditions));
    return result[0];
  },

  async getAllCoaches(academyId?: string): Promise<Coach[]> {
    if (academyId) {
      return db.select().from(coaches).where(eq(coaches.academyId, academyId));
    }
    return db.select().from(coaches);
  },

  async createCoach(data: InsertCoach): Promise<Coach> {
    const result = await db.insert(coaches).values(data).returning();
    return result[0];
  },

  // ==================== LOCATIONS ====================
  async getLocation(id: string, academyId?: string): Promise<Location | undefined> {
    const conditions = [eq(locations.id, id)];
    if (academyId) {
      conditions.push(eq(locations.academyId, academyId));
    }
    const result = await db.select().from(locations).where(and(...conditions));
    return result[0];
  },

  async getAllLocations(academyId?: string): Promise<Location[]> {
    if (academyId) {
      return db.select().from(locations).where(eq(locations.academyId, academyId));
    }
    return db.select().from(locations);
  },

  async createLocation(data: InsertLocation): Promise<Location> {
    const result = await db.insert(locations).values(data).returning();
    return result[0];
  },

  // ==================== COURTS ====================
  async getCourt(id: string, academyId?: string): Promise<Court | undefined> {
    const conditions = [eq(courts.id, id)];
    if (academyId) {
      conditions.push(eq(courts.academyId, academyId));
    }
    const result = await db.select().from(courts).where(and(...conditions));
    return result[0];
  },

  async getCourtsByLocation(locationId: string, academyId?: string): Promise<Court[]> {
    const conditions = [eq(courts.locationId, locationId)];
    if (academyId) {
      conditions.push(eq(courts.academyId, academyId));
    }
    return db.select().from(courts).where(and(...conditions));
  },

  async getAllCourts(academyId?: string): Promise<Court[]> {
    if (academyId) {
      return db.select().from(courts).where(eq(courts.academyId, academyId));
    }
    return db.select().from(courts);
  },

  async createCourt(data: InsertCourt): Promise<Court> {
    const result = await db.insert(courts).values(data).returning();
    return result[0];
  },

  async updateCourt(id: string, data: Partial<InsertCourt>, academyId?: string): Promise<Court | undefined> {
    const conditions = [eq(courts.id, id)];
    if (academyId) {
      conditions.push(eq(courts.academyId, academyId));
    }
    const result = await db.update(courts).set(data).where(and(...conditions)).returning();
    return result[0];
  },

  async deleteCourt(id: string, academyId?: string): Promise<void> {
    const conditions = [eq(courts.id, id)];
    if (academyId) {
      conditions.push(eq(courts.academyId, academyId));
    }
    await db.delete(courts).where(and(...conditions));
  },

  // ==================== PLAYERS ====================
  async getPlayer(id: string, academyId?: string): Promise<Player | undefined> {
    const conditions = [eq(players.id, id)];
    if (academyId) {
      conditions.push(eq(players.academyId, academyId));
    }
    const result = await db.select().from(players).where(and(...conditions));
    return result[0];
  },

  async getAllPlayers(academyId?: string): Promise<Player[]> {
    if (academyId) {
      return db.select().from(players).where(eq(players.academyId, academyId));
    }
    return db.select().from(players);
  },

  async searchPlayers(query: string, academyId?: string): Promise<Player[]> {
    let allPlayers: Player[];
    if (academyId) {
      allPlayers = await db.select().from(players).where(eq(players.academyId, academyId));
    } else {
      allPlayers = await db.select().from(players);
    }
    const lowerQuery = query.toLowerCase();
    return allPlayers.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerQuery) ||
        (p.phone && p.phone.includes(query))
    );
  },

  async getAllPlayersPaginated(limit: number, offset: number, academyId?: string): Promise<{ players: Player[]; total: number }> {
    // Build where clause: academy filter if provided
    const whereClause = academyId ? eq(players.academyId, academyId) : undefined;
    
    const baseQuery = db.select().from(players);
    const countQuery = db.select({ count: count() }).from(players);
    
    const [playerList, countResult] = await Promise.all([
      whereClause 
        ? baseQuery.where(whereClause).orderBy(asc(players.name)).limit(limit).offset(offset)
        : baseQuery.orderBy(asc(players.name)).limit(limit).offset(offset),
      whereClause
        ? countQuery.where(whereClause)
        : countQuery
    ]);
    
    return { players: playerList, total: countResult[0]?.count || 0 };
  },

  async searchPlayersPaginated(query: string, limit: number, offset: number, academyId?: string): Promise<{ players: Player[]; total: number }> {
    const lowerQuery = `%${query.toLowerCase()}%`;
    const searchCondition = or(
      ilike(players.name, lowerQuery),
      ilike(players.phone, lowerQuery)
    );
    
    // Build where clause: search + optional academy filter
    const whereClause = academyId 
      ? and(searchCondition, eq(players.academyId, academyId))
      : searchCondition;
    
    const [playerList, countResult] = await Promise.all([
      db.select().from(players)
        .where(whereClause!)
        .orderBy(asc(players.name))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(players)
        .where(whereClause!)
    ]);
    
    return { players: playerList, total: countResult[0]?.count || 0 };
  },

  async createPlayer(data: InsertPlayer): Promise<Player> {
    const result = await db.insert(players).values(data).returning();
    return result[0];
  },

  async updatePlayer(id: string, data: Partial<InsertPlayer>): Promise<Player | undefined> {
    const result = await db.update(players).set(data).where(eq(players.id, id)).returning();
    return result[0];
  },

  async deletePlayer(id: string, academyId: string): Promise<boolean> {
    const result = await db
      .delete(players)
      .where(and(eq(players.id, id), eq(players.academyId, academyId)))
      .returning();
    return result.length > 0;
  },

  // ==================== PACKAGES ====================
  async getPackage(id: string, academyId?: string): Promise<Package | undefined> {
    // If academyId provided, verify package belongs to a player in that academy
    const result = await db.select().from(packages).where(eq(packages.id, id));
    const pkg = result[0];
    if (!pkg || !academyId) return pkg;
    
    // Verify the player belongs to this academy
    const player = await db.select().from(players).where(
      and(eq(players.id, pkg.playerId!), eq(players.academyId, academyId))
    );
    return player.length > 0 ? pkg : undefined;
  },

  async getPlayerPackages(playerId: string, academyId?: string): Promise<Package[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    return db.select().from(packages).where(eq(packages.playerId, playerId));
  },

  async getActivePlayerPackages(playerId: string, academyId?: string): Promise<Package[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    
    const today = new Date().toISOString().split("T")[0];
    const result = await db
      .select()
      .from(packages)
      .where(
        and(
          eq(packages.playerId, playerId),
          gte(packages.remainingCredits, 1)
        )
      );
    return result.filter(p => !p.expiryDate || p.expiryDate >= today);
  },

  async createPackage(data: InsertPackage): Promise<Package> {
    const result = await db.insert(packages).values(data).returning();
    return result[0];
  },

  async updatePackage(id: string, data: Partial<InsertPackage>, academyId?: string): Promise<Package | undefined> {
    // Verify ownership before update if academyId provided
    if (academyId) {
      const pkg = await this.getPackage(id, academyId);
      if (!pkg) return undefined;
    }
    const result = await db.update(packages).set(data).where(eq(packages.id, id)).returning();
    return result[0];
  },

  async deletePackage(id: string, academyId?: string): Promise<void> {
    // Verify ownership before delete if academyId provided
    if (academyId) {
      const pkg = await this.getPackage(id, academyId);
      if (!pkg) return;
    }
    await db.delete(packages).where(eq(packages.id, id));
  },

  async usePackageCredit(packageId: string, academyId?: string): Promise<Package | undefined> {
    const pkg = await this.getPackage(packageId, academyId);
    if (!pkg || pkg.remainingCredits <= 0) return undefined;
    
    const result = await db
      .update(packages)
      .set({ remainingCredits: pkg.remainingCredits - 1 })
      .where(eq(packages.id, packageId))
      .returning();
    return result[0];
  },

  async autoDeductPlayerCredit(playerId: string, academyId?: string): Promise<{ success: boolean; package?: Package; reason?: string }> {
    const activePackages = await this.getActivePlayerPackages(playerId, academyId);
    if (activePackages.length === 0) {
      return { success: false, reason: "no_active_package" };
    }
    
    // Sort by expiry date (soonest first) to use credits from expiring packages first
    const sortedPackages = activePackages.sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return 0;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return a.expiryDate.localeCompare(b.expiryDate);
    });
    
    const packageToUse = sortedPackages[0];
    const updatedPackage = await this.usePackageCredit(packageToUse.id, academyId);
    
    if (updatedPackage) {
      return { success: true, package: updatedPackage };
    }
    return { success: false, reason: "credit_deduction_failed" };
  },

  // ==================== SESSIONS ====================
  async getSession(id: string, academyId?: string): Promise<Session | undefined> {
    const conditions = [eq(sessions.id, id)];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    const result = await db.select().from(sessions).where(and(...conditions));
    return result[0];
  },

  async getSessionsByCoach(coachId: string, startDate: Date, endDate: Date, academyId?: string): Promise<Session[]> {
    const conditions = [
      eq(sessions.coachId, coachId),
      gte(sessions.startTime, startDate),
      lte(sessions.startTime, endDate)
    ];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    return db.select().from(sessions).where(and(...conditions));
  },

  async getAllSessionsByCoach(coachId: string, academyId?: string): Promise<Session[]> {
    const conditions = [eq(sessions.coachId, coachId)];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    return db.select().from(sessions).where(and(...conditions));
  },

  async getSessionsByDateRange(startDate: Date, endDate: Date, academyId?: string): Promise<Session[]> {
    const conditions = [
      gte(sessions.startTime, startDate),
      lte(sessions.startTime, endDate)
    ];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    return db.select().from(sessions).where(and(...conditions));
  },

  async getBlockedSessions(coachId: string, startDate: Date, endDate: Date, academyId?: string): Promise<Session[]> {
    const conditions = [
      ne(sessions.coachId, coachId),
      gte(sessions.startTime, startDate),
      lte(sessions.startTime, endDate)
    ];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    return db.select().from(sessions).where(and(...conditions));
  },

  async createSession(data: InsertSession): Promise<Session> {
    const result = await db.insert(sessions).values(data).returning();
    return result[0];
  },

  async updateSession(id: string, data: Partial<InsertSession>): Promise<Session | undefined> {
    const result = await db
      .update(sessions)
      .set(data)
      .where(eq(sessions.id, id))
      .returning();
    return result[0];
  },

  async cancelSession(id: string): Promise<Session | undefined> {
    const result = await db
      .update(sessions)
      .set({ status: "cancelled" })
      .where(eq(sessions.id, id))
      .returning();
    return result[0];
  },

  // Conflict checking
  async checkCoachConflict(coachId: string, startTime: Date, endTime: Date, excludeSessionId?: string, academyId?: string): Promise<boolean> {
    const conditions = [
      eq(sessions.coachId, coachId),
      eq(sessions.status, "scheduled"),
      or(
        and(lte(sessions.startTime, startTime), gte(sessions.endTime, startTime)),
        and(lte(sessions.startTime, endTime), gte(sessions.endTime, endTime)),
        and(gte(sessions.startTime, startTime), lte(sessions.endTime, endTime))
      )
    ];
    
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    
    const conflicts = await db.select().from(sessions).where(and(...conditions));
    
    if (excludeSessionId) {
      return conflicts.filter(s => s.id !== excludeSessionId).length > 0;
    }
    return conflicts.length > 0;
  },

  async checkCourtConflict(courtId: string, startTime: Date, endTime: Date, excludeSessionId?: string, academyId?: string): Promise<boolean> {
    const conditions = [
      eq(sessions.courtId, courtId),
      eq(sessions.status, "scheduled"),
      or(
        and(lte(sessions.startTime, startTime), gte(sessions.endTime, startTime)),
        and(lte(sessions.startTime, endTime), gte(sessions.endTime, endTime)),
        and(gte(sessions.startTime, startTime), lte(sessions.endTime, endTime))
      )
    ];
    
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    
    const conflicts = await db.select().from(sessions).where(and(...conditions));
    
    if (excludeSessionId) {
      return conflicts.filter(s => s.id !== excludeSessionId).length > 0;
    }
    return conflicts.length > 0;
  },

  async checkPlayerConflict(playerId: string, startTime: Date, endTime: Date, excludeSessionId?: string, academyId?: string): Promise<boolean> {
    // First get all sessions the player is in
    const playerSessions = await db
      .select({ sessionId: sessionPlayers.sessionId })
      .from(sessionPlayers)
      .where(eq(sessionPlayers.playerId, playerId));

    if (playerSessions.length === 0) return false;

    const sessionIds = playerSessions.map(ps => ps.sessionId).filter((id): id is string => id !== null);
    if (sessionIds.length === 0) return false;
    
    // Check if any of those sessions overlap with the proposed time
    const baseConditions = [
      inArray(sessions.id, sessionIds),
      eq(sessions.status, "scheduled"),
      or(
        and(lte(sessions.startTime, startTime), gte(sessions.endTime, startTime)),
        and(lte(sessions.startTime, endTime), gte(sessions.endTime, endTime)),
        and(gte(sessions.startTime, startTime), lte(sessions.endTime, endTime))
      )
    ];
    
    if (academyId) {
      baseConditions.push(eq(sessions.academyId, academyId));
    }
    
    const conflicts = await db
      .select()
      .from(sessions)
      .where(and(...baseConditions));
    
    if (excludeSessionId) {
      return conflicts.filter(s => s.id !== excludeSessionId).length > 0;
    }
    return conflicts.length > 0;
  },

  // ==================== SESSION PLAYERS ====================
  async getSessionPlayers(sessionId: string): Promise<SessionPlayer[]> {
    return db.select().from(sessionPlayers).where(eq(sessionPlayers.sessionId, sessionId));
  },

  async getSessionPlayersWithPlayerInfo(sessionId: string): Promise<Array<SessionPlayer & { player: { id: string; name: string; ballLevel: string | null } | null }>> {
    const result = await db
      .select({
        sessionPlayer: sessionPlayers,
        player: {
          id: players.id,
          name: players.name,
          ballLevel: players.ballLevel,
        },
      })
      .from(sessionPlayers)
      .leftJoin(players, eq(sessionPlayers.playerId, players.id))
      .where(eq(sessionPlayers.sessionId, sessionId));
    
    return result.map(r => ({
      ...r.sessionPlayer,
      player: r.player,
    }));
  },

  async getPlayerLastSession(playerId: string, academyId?: string): Promise<Session | null> {
    // Get all session IDs for this player
    const playerSessionEntries = await db
      .select({ sessionId: sessionPlayers.sessionId })
      .from(sessionPlayers)
      .where(eq(sessionPlayers.playerId, playerId));
    
    const sessionIds = playerSessionEntries
      .map(ps => ps.sessionId)
      .filter((id): id is string => id !== null);
    
    if (sessionIds.length === 0) return null;
    
    // Find the most recent session
    const conditions = [inArray(sessions.id, sessionIds)];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    
    const result = await db
      .select()
      .from(sessions)
      .where(and(...conditions))
      .orderBy(desc(sessions.startTime))
      .limit(1);
    
    return result[0] || null;
  },

  async getSessionPlayersWithDetails(sessionId: string, academyId?: string): Promise<Array<{
    id: string;
    name: string;
    level: string | null;
    ballLevel: string | null;
    skillLevel: number | null;
    status: string | null;
    lateMinutes: number | null;
    absentReason: string | null;
  }>> {
    const conditions = [eq(sessionPlayers.sessionId, sessionId)];
    if (academyId) {
      conditions.push(eq(players.academyId, academyId));
    }
    
    const result = await db
      .select({
        id: players.id,
        name: players.name,
        ballLevel: players.ballLevel,
        skillLevel: players.skillLevel,
        status: sessionPlayers.attendanceStatus,
        lateMinutes: sessionPlayers.lateMinutes,
        absentReason: sessionPlayers.absenceReason,
      })
      .from(sessionPlayers)
      .innerJoin(players, eq(sessionPlayers.playerId, players.id))
      .where(and(...conditions));
    
    return result.map(p => ({
      ...p,
      level: p.ballLevel || "green",
    }));
  },

  async addPlayerToSession(data: InsertSessionPlayer): Promise<SessionPlayer> {
    // Check if player is already in the session to prevent duplicates
    if (data.sessionId && data.playerId) {
      const existing = await db
        .select()
        .from(sessionPlayers)
        .where(
          and(
            eq(sessionPlayers.sessionId, data.sessionId),
            eq(sessionPlayers.playerId, data.playerId)
          )
        );
      if (existing.length > 0) {
        return existing[0]; // Return existing entry instead of creating duplicate
      }
    }
    const result = await db.insert(sessionPlayers).values(data).returning();
    return result[0];
  },

  async removePlayerFromSession(sessionId: string, playerId: string): Promise<void> {
    await db
      .delete(sessionPlayers)
      .where(
        and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        )
      );
  },

  async updateAttendance(
    sessionId: string,
    playerId: string,
    status: string,
    lateMinutes?: number,
    absenceReason?: string
  ): Promise<SessionPlayer | undefined> {
    const result = await db
      .update(sessionPlayers)
      .set({
        attendanceStatus: status,
        lateMinutes,
        absenceReason,
      })
      .where(
        and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        )
      )
      .returning();
    return result[0];
  },

  // ==================== PLAYER HOLIDAYS ====================
  async getPlayerHolidays(playerId: string, academyId?: string): Promise<PlayerHoliday[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    return db.select().from(playerHolidays).where(eq(playerHolidays.playerId, playerId));
  },

  async createPlayerHoliday(data: InsertPlayerHoliday): Promise<PlayerHoliday> {
    const result = await db.insert(playerHolidays).values(data).returning();
    return result[0];
  },

  // ==================== SESSION FEEDBACK ====================
  async getSessionFeedback(sessionId: string): Promise<SessionFeedback | undefined> {
    const result = await db.select().from(sessionFeedback).where(eq(sessionFeedback.sessionId, sessionId));
    return result[0];
  },

  async createSessionFeedback(data: InsertSessionFeedback): Promise<SessionFeedback> {
    const result = await db.insert(sessionFeedback).values(data).returning();
    return result[0];
  },

  // ==================== AUDIT LOGS ====================
  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const result = await db.insert(auditLogs).values(data).returning();
    return result[0];
  },

  async getAuditLogs(entityType: string, entityId?: string): Promise<AuditLog[]> {
    const conditions = [eq(auditLogs.entityType, entityType)];
    if (entityId) {
      conditions.push(eq(auditLogs.entityId, entityId));
    }
    return db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.timestamp));
  },

  // ==================== OFFLINE QUEUE ====================
  async addToOfflineQueue(data: InsertOfflineQueue): Promise<OfflineQueue> {
    const result = await db.insert(offlineQueue).values(data).returning();
    return result[0];
  },

  async getUnsynced(coachId: string): Promise<OfflineQueue[]> {
    return db
      .select()
      .from(offlineQueue)
      .where(and(eq(offlineQueue.coachId, coachId), eq(offlineQueue.synced, false)));
  },

  async markSynced(id: string): Promise<void> {
    await db.update(offlineQueue).set({ synced: true }).where(eq(offlineQueue.id, id));
  },

  // ==================== PLAYER NOTES ====================
  async getPlayerNotes(playerId: string, academyId?: string): Promise<PlayerNote[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    return db
      .select()
      .from(playerNotes)
      .where(eq(playerNotes.playerId, playerId))
      .orderBy(desc(playerNotes.isPinned), desc(playerNotes.createdAt));
  },

  async createPlayerNote(data: InsertPlayerNote): Promise<PlayerNote> {
    const noteData = {
      ...data,
      category: data.category || "general",
      isPinned: data.isPinned ?? false,
    };
    const result = await db.insert(playerNotes).values(noteData).returning();
    return result[0];
  },

  async deletePlayerNote(id: string): Promise<void> {
    await db.delete(playerNotes).where(eq(playerNotes.id, id));
  },

  async toggleNotePin(id: string, isPinned: boolean): Promise<PlayerNote> {
    const result = await db
      .update(playerNotes)
      .set({ isPinned: isPinned })
      .where(eq(playerNotes.id, id))
      .returning();
    return result[0];
  },

  // ==================== PLAYER PROGRESS ====================
  async getPlayerProgress(playerId: string, academyId?: string): Promise<PlayerProgress[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    return db
      .select()
      .from(playerProgress)
      .where(eq(playerProgress.playerId, playerId))
      .orderBy(desc(playerProgress.createdAt));
  },

  async createPlayerProgress(data: InsertPlayerProgress): Promise<PlayerProgress> {
    const result = await db.insert(playerProgress).values(data).returning();
    return result[0];
  },

  async getProgressSummary(playerId: string, academyId?: string): Promise<{ skillArea: string; avgRating: number; trend: string; glowScore?: number; domainScores?: { domain: string; score: number; trend: string }[] }[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    const progress = await db
      .select()
      .from(playerProgress)
      .where(eq(playerProgress.playerId, playerId))
      .orderBy(desc(playerProgress.createdAt));
    
    const skillAreas = ["forehand", "backhand", "serve", "volley", "movement", "mental"];
    const skills = skillAreas.map(area => {
      const areaProgress = progress.filter(p => p.skillArea === area);
      const avgRating = areaProgress.length > 0 
        ? areaProgress.reduce((sum, p) => sum + (p.rating || 0), 0) / areaProgress.length 
        : 0;
      const latestTrend = areaProgress[0]?.trend || "stable";
      return { skillArea: area, avgRating: Math.round(avgRating * 10) / 10, trend: latestTrend };
    });

    // Get domain skill states for weighted Glow Score
    const domainStatesWithNames = await db
      .select({
        progressValue: playerSkillState.progressValue,
        trend: playerSkillState.trend,
        domainName: skillDomains.name,
      })
      .from(playerSkillState)
      .leftJoin(skillDomains, eq(playerSkillState.domainId, skillDomains.id))
      .where(eq(playerSkillState.playerId, playerId));

    // Domain weights: Technical 30%, Mental 20%, Physical 20%, Social 15%, Tactical 15%
    const domainWeights: Record<string, number> = {
      technical: 0.30,
      mental: 0.20,
      physical: 0.20,
      social: 0.15,
      tactical: 0.15,
    };

    // Map domain names to scores
    const domainScores = ["technical", "mental", "physical", "social", "tactical"].map(domain => {
      const state = domainStatesWithNames.find(s => s.domainName?.toLowerCase() === domain);
      return {
        domain,
        score: state?.progressValue || 0,
        trend: state?.trend || "stable",
      };
    });

    // Calculate weighted Glow Score (0-100)
    let glowScore = 0;
    domainScores.forEach(d => {
      const weight = domainWeights[d.domain] || 0;
      glowScore += d.score * weight;
    });
    glowScore = Math.round(glowScore);

    // Return backward-compatible array with glowScore and domainScores on first element
    if (skills.length > 0) {
      return skills.map((skill, index) => 
        index === 0 
          ? { ...skill, glowScore, domainScores } 
          : skill
      );
    }
    return skills;
  },

  // ==================== SESSION TEMPLATES ====================
  async getSessionTemplates(coachId: string): Promise<SessionTemplate[]> {
    return db
      .select()
      .from(sessionTemplates)
      .where(eq(sessionTemplates.coachId, coachId))
      .orderBy(desc(sessionTemplates.createdAt));
  },

  async createSessionTemplate(data: InsertSessionTemplate): Promise<SessionTemplate> {
    const result = await db.insert(sessionTemplates).values(data).returning();
    return result[0];
  },

  async deleteSessionTemplate(id: string): Promise<void> {
    await db.delete(sessionTemplates).where(eq(sessionTemplates.id, id));
  },

  // ==================== COACH NOTIFICATIONS ====================
  async getCoachNotifications(coachId: string): Promise<CoachNotification[]> {
    return db
      .select()
      .from(coachNotifications)
      .where(eq(coachNotifications.coachId, coachId))
      .orderBy(desc(coachNotifications.createdAt));
  },

  async getCoachNotificationsPaginated(coachId: string, limit: number, offset: number): Promise<{ notifications: CoachNotification[]; total: number }> {
    const [notifications, countResult] = await Promise.all([
      db.select().from(coachNotifications)
        .where(eq(coachNotifications.coachId, coachId))
        .orderBy(desc(coachNotifications.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(coachNotifications)
        .where(eq(coachNotifications.coachId, coachId))
    ]);
    return { notifications, total: countResult[0]?.count || 0 };
  },

  async getCoachNotification(id: string, coachId?: string): Promise<CoachNotification | undefined> {
    const conditions = [eq(coachNotifications.id, id)];
    if (coachId) {
      conditions.push(eq(coachNotifications.coachId, coachId));
    }
    const result = await db.select().from(coachNotifications).where(and(...conditions));
    return result[0];
  },

  async createNotification(data: InsertCoachNotification): Promise<CoachNotification> {
    const result = await db.insert(coachNotifications).values(data).returning();
    return result[0];
  },

  async markNotificationRead(id: string, coachId?: string): Promise<void> {
    const conditions = [eq(coachNotifications.id, id)];
    if (coachId) {
      conditions.push(eq(coachNotifications.coachId, coachId));
    }
    await db.update(coachNotifications).set({ isRead: true }).where(and(...conditions));
  },

  async markAllNotificationsRead(coachId: string): Promise<void> {
    await db.update(coachNotifications).set({ isRead: true }).where(eq(coachNotifications.coachId, coachId));
  },

  async deleteNotification(id: string, coachId?: string): Promise<void> {
    const conditions = [eq(coachNotifications.id, id)];
    if (coachId) {
      conditions.push(eq(coachNotifications.coachId, coachId));
    }
    await db.delete(coachNotifications).where(and(...conditions));
  },

  // ==================== AUTO-RENEW ALERTS ====================
  async getAutoRenewAlerts(coachId: string): Promise<{ playerId: string; playerName: string; weekNumber: number; lastSessionDate: string }[]> {
    // Get all sessions grouped by recurring series (based on same time slot/player combo)
    // Find sessions where we're at week 9+ to alert for renewal
    const now = new Date();
    const tenWeeksAgo = new Date(now.getTime() - 10 * 7 * 24 * 60 * 60 * 1000);
    
    const coachSessions = await db
      .select()
      .from(sessions)
      .where(and(
        eq(sessions.coachId, coachId),
        gte(sessions.startTime, tenWeeksAgo),
        lte(sessions.startTime, now)
      ))
      .orderBy(desc(sessions.startTime));

    // Group sessions by dayOfWeek + time slot to detect recurring series
    const recurringGroups = new Map<string, Session[]>();
    for (const session of coachSessions) {
      const startTime = new Date(session.startTime);
      const dayOfWeek = startTime.getUTCDay();
      const hour = startTime.getUTCHours();
      const minute = startTime.getUTCMinutes();
      const key = `${dayOfWeek}-${hour}:${minute}`;
      
      if (!recurringGroups.has(key)) {
        recurringGroups.set(key, []);
      }
      recurringGroups.get(key)!.push(session);
    }

    const alerts: { playerId: string; playerName: string; weekNumber: number; lastSessionDate: string }[] = [];
    
    for (const [, groupSessions] of recurringGroups) {
      if (groupSessions.length >= 8) {
        // This is likely a recurring series
        const weekNumber = groupSessions.length;
        if (weekNumber >= 9 && weekNumber <= 10) {
          // Get players from the first session
          const sessionPlayerRecords = await db
            .select()
            .from(sessionPlayers)
            .where(eq(sessionPlayers.sessionId, groupSessions[0].id));
          
          for (const sp of sessionPlayerRecords) {
            if (sp.playerId) {
              const player = await db.select().from(players).where(eq(players.id, sp.playerId));
              if (player[0]) {
                alerts.push({
                  playerId: sp.playerId,
                  playerName: player[0].name,
                  weekNumber,
                  lastSessionDate: groupSessions[0].startTime.toISOString(),
                });
              }
            }
          }
        }
      }
    }

    return alerts;
  },

  // ==================== COACH UPDATE ====================
  async updateCoach(id: string, data: Partial<InsertCoach>): Promise<Coach> {
    const result = await db.update(coaches).set(data).where(eq(coaches.id, id)).returning();
    return result[0];
  },

  // ==================== PROGRESS ENGINE V2 ====================

  // Skill Domains
  async getAllSkillDomains(): Promise<SkillDomain[]> {
    return db.select().from(skillDomains).orderBy(asc(skillDomains.sortOrder));
  },

  async getSkillDomain(id: string): Promise<SkillDomain | undefined> {
    const result = await db.select().from(skillDomains).where(eq(skillDomains.id, id));
    return result[0];
  },

  async getSkillDomainByName(name: string): Promise<SkillDomain | undefined> {
    const result = await db.select().from(skillDomains).where(eq(skillDomains.name, name));
    return result[0];
  },

  async createSkillDomain(data: InsertSkillDomain): Promise<SkillDomain> {
    const result = await db.insert(skillDomains).values(data).returning();
    return result[0];
  },

  async seedSkillDomains(): Promise<void> {
    const existingDomains = await db.select().from(skillDomains);
    if (existingDomains.length > 0) return; // Already seeded

    const domains = [
      { name: "technical", displayName: "Technical", description: "Strokes, technique, consistency", icon: "tennisball-outline", color: "#2ECC40", sortOrder: 1 },
      { name: "mental", displayName: "Mental", description: "Focus, resilience, confidence", icon: "brain-outline", color: "#00D4FF", sortOrder: 2 },
      { name: "physical", displayName: "Physical", description: "Fitness, speed, endurance", icon: "fitness-outline", color: "#FFD700", sortOrder: 3 },
      { name: "social", displayName: "Social", description: "Teamwork, sportsmanship, communication", icon: "people-outline", color: "#FF6B6B", sortOrder: 4 },
      { name: "tactical", displayName: "Tactical", description: "Strategy, decision-making, game IQ", icon: "bulb-outline", color: "#9B59B6", sortOrder: 5 },
    ];

    for (const domain of domains) {
      await db.insert(skillDomains).values(domain);
    }
  },

  // Player Skill State
  async getPlayerSkillStates(playerId: string, academyId?: string): Promise<PlayerSkillState[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    return db
      .select()
      .from(playerSkillState)
      .where(eq(playerSkillState.playerId, playerId));
  },

  async getPlayerSkillState(playerId: string, domainId: string): Promise<PlayerSkillState | undefined> {
    const result = await db
      .select()
      .from(playerSkillState)
      .where(and(
        eq(playerSkillState.playerId, playerId),
        eq(playerSkillState.domainId, domainId)
      ));
    return result[0];
  },

  async upsertPlayerSkillState(data: InsertPlayerSkillState): Promise<PlayerSkillState> {
    // Check if state exists
    const existing = await db
      .select()
      .from(playerSkillState)
      .where(and(
        eq(playerSkillState.playerId, data.playerId),
        eq(playerSkillState.domainId, data.domainId)
      ));

    if (existing.length > 0) {
      const result = await db
        .update(playerSkillState)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(playerSkillState.id, existing[0].id))
        .returning();
      return result[0];
    }

    const result = await db.insert(playerSkillState).values(data).returning();
    return result[0];
  },

  async initializePlayerSkillStates(playerId: string): Promise<void> {
    const domains = await db.select().from(skillDomains);
    for (const domain of domains) {
      const existing = await db
        .select()
        .from(playerSkillState)
        .where(and(
          eq(playerSkillState.playerId, playerId),
          eq(playerSkillState.domainId, domain.id)
        ));
      
      if (existing.length === 0) {
        await db.insert(playerSkillState).values({
          playerId,
          domainId: domain.id,
          progressValue: 0,
          trend: "stable",
          momentum: "building",
          confidenceScore: 50,
        });
      }
    }
  },

  // Session Skill Observations
  async getSessionSkillObservations(sessionId: string): Promise<SessionSkillObservation[]> {
    return db
      .select()
      .from(sessionSkillObservations)
      .where(eq(sessionSkillObservations.sessionId, sessionId))
      .orderBy(desc(sessionSkillObservations.createdAt));
  },

  async getPlayerRecentObservations(playerId: string, limit: number = 10): Promise<SessionSkillObservation[]> {
    return db
      .select()
      .from(sessionSkillObservations)
      .where(eq(sessionSkillObservations.playerId, playerId))
      .orderBy(desc(sessionSkillObservations.createdAt))
      .limit(limit);
  },

  async getPlayerObservationTrends(playerId: string, days: number = 30): Promise<{
    domainId: string;
    history: { date: string; delta: number; direction: string }[];
    streakUp: number;
    streakDown: number;
    hasSpeedrunWarning: boolean;
    improvementRate: number;
    hasData: boolean;
  }[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const allDomains = await db.select().from(skillDomains);
    const observations = await db
      .select()
      .from(sessionSkillObservations)
      .where(and(
        eq(sessionSkillObservations.playerId, playerId),
        gte(sessionSkillObservations.createdAt, cutoffDate)
      ))
      .orderBy(asc(sessionSkillObservations.createdAt));
    
    const domainMap: Record<string, SessionSkillObservation[]> = {};
    
    // Initialize all domains with empty arrays
    for (const domain of allDomains) {
      domainMap[domain.id] = [];
    }
    
    for (const obs of observations) {
      if (!domainMap[obs.domainId]) domainMap[obs.domainId] = [];
      domainMap[obs.domainId].push(obs);
    }
    
    return Object.entries(domainMap).map(([domainId, obs]) => {
      const history = obs.map(o => ({
        date: o.createdAt?.toISOString().split('T')[0] || '',
        delta: o.appliedDelta || 0,
        direction: o.direction,
      }));
      
      let streakUp = 0, streakDown = 0, currentStreak = 0, lastDirection = '';
      const reversedObs = [...obs].reverse();
      for (const o of reversedObs) {
        if (o.direction === lastDirection || lastDirection === '') {
          currentStreak++;
          lastDirection = o.direction;
        } else break;
      }
      if (lastDirection === 'up') streakUp = currentStreak;
      if (lastDirection === 'down') streakDown = currentStreak;
      
      const upCount = obs.filter(o => o.direction === 'up').length;
      const totalCount = obs.length;
      const improvementRate = totalCount > 0 ? Math.round((upCount / totalCount) * 100) : 0;
      const hasSpeedrunWarning = improvementRate > 90 && totalCount >= 5;
      const hasData = obs.length > 0;
      
      return { domainId, history, streakUp, streakDown, hasSpeedrunWarning, improvementRate, hasData };
    });
  },

  async createSkillObservation(data: InsertSessionSkillObservation): Promise<SessionSkillObservation> {
    const result = await db.insert(sessionSkillObservations).values(data).returning();
    return result[0];
  },

  async getObservationCountForDomain(playerId: string, domainId: string, sessionCount: number = 3): Promise<{ upCount: number; downCount: number }> {
    // Get recent sessions for this player
    const recentObservations = await db
      .select()
      .from(sessionSkillObservations)
      .where(and(
        eq(sessionSkillObservations.playerId, playerId),
        eq(sessionSkillObservations.domainId, domainId)
      ))
      .orderBy(desc(sessionSkillObservations.createdAt))
      .limit(sessionCount);

    const upCount = recentObservations.filter(o => o.direction === "up").length;
    const downCount = recentObservations.filter(o => o.direction === "down").length;

    return { upCount, downCount };
  },

  async getRecentDownSessionsForPlayer(playerId: string, sessionLimit: number = 3): Promise<string[]> {
    // First, get the player's last N sessions (by chronological order)
    const allPlayerObservations = await db
      .select()
      .from(sessionSkillObservations)
      .where(eq(sessionSkillObservations.playerId, playerId))
      .orderBy(desc(sessionSkillObservations.createdAt));

    // Extract the last N distinct sessions chronologically
    const lastNSessions: string[] = [];
    for (const obs of allPlayerObservations) {
      if (!lastNSessions.includes(obs.sessionId)) {
        lastNSessions.push(obs.sessionId);
        if (lastNSessions.length >= sessionLimit) break;
      }
    }

    // Now check which of these last N sessions had "down" observations
    const sessionsWithDowns: string[] = [];
    for (const sessionId of lastNSessions) {
      const hasDown = allPlayerObservations.some(
        obs => obs.sessionId === sessionId && obs.direction === "down"
      );
      if (hasDown) {
        sessionsWithDowns.push(sessionId);
      }
    }

    return sessionsWithDowns;
  },

  async getPlayerDomainXpSummary(playerId: string): Promise<{ domainId: string; totalXp: number; observationCount: number; avgDelta: number; lastObservation: Date | null }[]> {
    const allDomains = await db.select().from(skillDomains);
    const observations = await db
      .select()
      .from(sessionSkillObservations)
      .where(eq(sessionSkillObservations.playerId, playerId));
    
    const domainMap: Record<string, { totalXp: number; count: number; lastDate: Date | null }> = {};
    
    // Initialize all domains with zero values
    for (const domain of allDomains) {
      domainMap[domain.id] = { totalXp: 0, count: 0, lastDate: null };
    }
    
    for (const obs of observations) {
      if (!domainMap[obs.domainId]) {
        domainMap[obs.domainId] = { totalXp: 0, count: 0, lastDate: null };
      }
      domainMap[obs.domainId].totalXp += obs.appliedDelta || 0;
      domainMap[obs.domainId].count += 1;
      const obsDate = obs.createdAt ? new Date(obs.createdAt) : null;
      if (obsDate && (!domainMap[obs.domainId].lastDate || obsDate > domainMap[obs.domainId].lastDate!)) {
        domainMap[obs.domainId].lastDate = obsDate;
      }
    }
    
    return Object.entries(domainMap).map(([domainId, data]) => ({
      domainId,
      totalXp: data.totalXp ?? 0,
      observationCount: data.count ?? 0,
      avgDelta: data.count > 0 ? Math.round((data.totalXp / data.count) * 10) / 10 : 0,
      lastObservation: data.lastDate,
    }));
  },

  // Level Requirements
  async getLevelRequirements(ballLevel: string): Promise<LevelRequirement[]> {
    return db
      .select()
      .from(levelRequirements)
      .where(eq(levelRequirements.ballLevel, ballLevel));
  },

  async getAllLevelRequirements(): Promise<LevelRequirement[]> {
    return db.select().from(levelRequirements);
  },

  async createLevelRequirement(data: InsertLevelRequirement): Promise<LevelRequirement> {
    const result = await db.insert(levelRequirements).values(data).returning();
    return result[0];
  },

  // Domain Assessments
  async getPlayerAssessments(playerId: string): Promise<DomainAssessment[]> {
    return db
      .select()
      .from(domainAssessments)
      .where(eq(domainAssessments.playerId, playerId))
      .orderBy(desc(domainAssessments.createdAt));
  },

  async createAssessment(data: InsertDomainAssessment): Promise<DomainAssessment> {
    const result = await db.insert(domainAssessments).values(data).returning();
    return result[0];
  },

  async getLatestAssessment(playerId: string, domainId: string): Promise<DomainAssessment | undefined> {
    const result = await db
      .select()
      .from(domainAssessments)
      .where(and(
        eq(domainAssessments.playerId, playerId),
        eq(domainAssessments.domainId, domainId)
      ))
      .orderBy(desc(domainAssessments.createdAt))
      .limit(1);
    return result[0];
  },

  // Coach Stats Rollup (V2)
  async getCoachStats(coachId: string): Promise<CoachStatsRollup | undefined> {
    const result = await db.select().from(coachStatsRollup).where(eq(coachStatsRollup.coachId, coachId));
    return result[0];
  },

  async upsertCoachStats(data: InsertCoachStatsRollup): Promise<CoachStatsRollup> {
    const existing = await db.select().from(coachStatsRollup).where(eq(coachStatsRollup.coachId, data.coachId));
    
    if (existing.length > 0) {
      const result = await db
        .update(coachStatsRollup)
        .set({ ...data, lastCalculatedAt: new Date() })
        .where(eq(coachStatsRollup.id, existing[0].id))
        .returning();
      return result[0];
    }

    const result = await db.insert(coachStatsRollup).values(data).returning();
    return result[0];
  },

  // Player Progress Flags (V2)
  async getPlayerFlags(playerId: string): Promise<PlayerProgressFlag[]> {
    return db
      .select()
      .from(playerProgressFlags)
      .where(and(
        eq(playerProgressFlags.playerId, playerId),
        eq(playerProgressFlags.isActive, true)
      ));
  },

  async createPlayerFlag(data: InsertPlayerProgressFlag): Promise<PlayerProgressFlag> {
    const result = await db.insert(playerProgressFlags).values(data).returning();
    return result[0];
  },

  async resolvePlayerFlag(id: string): Promise<void> {
    await db
      .update(playerProgressFlags)
      .set({ isActive: false, resolvedAt: new Date() })
      .where(eq(playerProgressFlags.id, id));
  },

  // XP Transactions
  async getPlayerXpTransactions(playerId: string, limit: number = 50, academyId?: string): Promise<XpTransaction[]> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return [];
    }
    return db
      .select()
      .from(xpTransactions)
      .where(eq(xpTransactions.playerId, playerId))
      .orderBy(desc(xpTransactions.createdAt))
      .limit(limit);
  },

  async createXpTransaction(data: InsertXpTransaction): Promise<XpTransaction> {
    const result = await db.insert(xpTransactions).values(data).returning();
    return result[0];
  },

  async getPlayerTotalXp(playerId: string, academyId?: string): Promise<number> {
    // Validate player belongs to academy if provided
    if (academyId) {
      const player = await db.select().from(players).where(
        and(eq(players.id, playerId), eq(players.academyId, academyId))
      );
      if (player.length === 0) return 0;
    }
    const transactions = await db
      .select()
      .from(xpTransactions)
      .where(eq(xpTransactions.playerId, playerId));
    
    return transactions.reduce((sum, t) => sum + t.xpAmount, 0);
  },

  // ==================== ANTI-ABUSE RULES ====================
  
  // Get player XP gained today (for daily cap)
  async getPlayerDailyXp(playerId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const transactions = await db
      .select()
      .from(xpTransactions)
      .where(and(
        eq(xpTransactions.playerId, playerId),
        gte(xpTransactions.createdAt, today)
      ));
    
    return transactions.reduce((sum, t) => sum + t.xpAmount, 0);
  },

  // Get coach observation patterns for pattern detection
  async getCoachObservationPatterns(coachId: string, sessionLimit: number = 30): Promise<{
    upRate: number;
    downRate: number;
    highEffortRate: number;
    totalObservations: number;
    isPatternAbuse: boolean;
  }> {
    const observations = await db
      .select()
      .from(sessionSkillObservations)
      .where(eq(sessionSkillObservations.coachId, coachId))
      .orderBy(desc(sessionSkillObservations.createdAt))
      .limit(sessionLimit * 5); // ~5 observations per session
    
    if (observations.length === 0) {
      return { upRate: 0, downRate: 0, highEffortRate: 0, totalObservations: 0, isPatternAbuse: false };
    }
    
    const upCount = observations.filter(o => o.direction === "up").length;
    const downCount = observations.filter(o => o.direction === "down").length;
    const highEffortCount = observations.filter(o => o.effortLevel === "high").length;
    
    const upRate = upCount / observations.length;
    const downRate = downCount / observations.length;
    const highEffortRate = highEffortCount / observations.length;
    
    // Pattern abuse detection: >80% ups with <5% downs = likely abuse
    // OR >90% high effort ratings
    const isPatternAbuse = (upRate > 0.8 && downRate < 0.05) || highEffortRate > 0.9;
    
    return {
      upRate,
      downRate,
      highEffortRate,
      totalObservations: observations.length,
      isPatternAbuse,
    };
  },

  // Update coach stats rollup for anti-abuse calibration
  async updateCoachStatsFromObservations(coachId: string): Promise<CoachStatsRollup> {
    const patterns = await this.getCoachObservationPatterns(coachId, 30);
    
    // Calculate severity factor: coaches who give too many ups get reduced impact
    let severityFactor = 1.0;
    if (patterns.upRate > 0.7) {
      severityFactor = 0.9; // 10% reduction for generous coaches
    }
    if (patterns.upRate > 0.85) {
      severityFactor = 0.8; // 20% reduction for very generous coaches
    }
    
    return this.upsertCoachStats({
      coachId,
      highEffortRate30: String(patterns.highEffortRate),
      upRate30: String(patterns.upRate),
      downRate30: String(patterns.downRate),
      avgUpPerSession: String(patterns.upRate * 5), // ~5 obs per session
      severityFactor: String(severityFactor),
      isHighEffortSpammer: patterns.highEffortRate > 0.85,
      isUpSpammer: patterns.upRate > 0.8 && patterns.downRate < 0.05,
    });
  },

  // Check if coach can observe a specific player (prevents self-boosting via family accounts)
  async checkCoachPlayerRelationship(coachId: string, playerId: string): Promise<{
    isSameAccount: boolean;
    isFrequentFlyer: boolean;
    observationCount30Days: number;
  }> {
    // Get coach's user ID
    const coach = await db.select().from(coaches).where(eq(coaches.id, coachId));
    if (!coach || coach.length === 0) {
      return { isSameAccount: false, isFrequentFlyer: false, observationCount30Days: 0 };
    }
    
    // Check how many times this coach has observed this player in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentObservations = await db
      .select()
      .from(sessionSkillObservations)
      .where(and(
        eq(sessionSkillObservations.coachId, coachId),
        eq(sessionSkillObservations.playerId, playerId),
        gte(sessionSkillObservations.createdAt, thirtyDaysAgo)
      ));
    
    // Frequent flyer: same coach giving >20 observations to same player in 30 days
    const isFrequentFlyer = recentObservations.length > 20;
    
    return {
      isSameAccount: false, // Would need user linking to implement fully
      isFrequentFlyer,
      observationCount30Days: recentObservations.length,
    };
  },

  // ==================== COACH XP SYSTEM ====================
  async getCoachXpTransactions(coachId: string, limit: number = 50): Promise<CoachXpTransaction[]> {
    return db
      .select()
      .from(coachXpTransactions)
      .where(eq(coachXpTransactions.coachId, coachId))
      .orderBy(desc(coachXpTransactions.createdAt))
      .limit(limit);
  },

  async addCoachXpTransaction(data: InsertCoachXpTransaction): Promise<CoachXpTransaction> {
    const result = await db.insert(coachXpTransactions).values(data).returning();
    return result[0];
  },

  async getCoachTotalXp(coachId: string): Promise<number> {
    const transactions = await db
      .select()
      .from(coachXpTransactions)
      .where(eq(coachXpTransactions.coachId, coachId));
    
    return transactions.reduce((sum, t) => sum + t.xpAmount, 0);
  },

  // Progress calculation helper
  async calculatePlayerLevelReadiness(playerId: string, targetLevel: string): Promise<{
    isReady: boolean;
    requirements: { domainId: string; domainName: string; required: string; current: string; met: boolean }[];
    sessionCount: number;
    minSessionsRequired: number;
  }> {
    const requirements = await db
      .select()
      .from(levelRequirements)
      .where(eq(levelRequirements.ballLevel, targetLevel));

    const skillStates = await db
      .select()
      .from(playerSkillState)
      .where(eq(playerSkillState.playerId, playerId));

    const domains = await db.select().from(skillDomains);
    const domainMap = new Map(domains.map(d => [d.id, d]));

    // Count sessions player has participated in
    const playerSessionCount = await db
      .select()
      .from(sessionPlayers)
      .where(eq(sessionPlayers.playerId, playerId));

    const results = requirements.map(req => {
      const state = skillStates.find(s => s.domainId === req.domainId);
      const domain = domainMap.get(req.domainId);
      
      const statusOrder = ["not_yet", "developing", "meets", "above"];
      const currentIndex = statusOrder.indexOf(state?.assessmentStatus || "not_yet");
      const requiredIndex = statusOrder.indexOf(req.minStatus);

      return {
        domainId: req.domainId,
        domainName: domain?.displayName || "Unknown",
        required: req.minStatus,
        current: state?.assessmentStatus || "not_yet",
        met: currentIndex >= requiredIndex,
      };
    });

    // Use the strictest (maximum) minSessions across all domain requirements
    const minSessionsRequired = requirements.reduce((max, req) => {
      const reqSessions = req.minSessionsAtLevel || 8;
      return Math.max(max, reqSessions);
    }, 8);
    
    const allRequirementsMet = results.every(r => r.met);
    const hasEnoughSessions = playerSessionCount.length >= minSessionsRequired;

    return {
      isReady: allRequirementsMet && hasEnoughSessions,
      requirements: results,
      sessionCount: playerSessionCount.length,
      minSessionsRequired,
    };
  },

  // ==================== GLOW CHAT SYSTEM ====================
  
  // Conversations
  async getConversation(id: string, coachId?: string, academyId?: string): Promise<Conversation | undefined> {
    const conditions = [eq(conversations.id, id)];
    if (coachId) {
      conditions.push(eq(conversations.coachId, coachId));
    }
    if (academyId) {
      conditions.push(eq(conversations.academyId, academyId));
    }
    const result = await db.select().from(conversations).where(and(...conditions));
    return result[0];
  },

  async getConversationsForCoach(coachId: string, academyId?: string): Promise<Conversation[]> {
    const participantConversations = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.coachId, coachId),
          eq(conversationParticipants.participantType, "coach")
        )
      );
    
    const conversationIds = participantConversations.map(p => p.conversationId);
    if (conversationIds.length === 0) return [];
    
    const conditions = [
      inArray(conversations.id, conversationIds),
      eq(conversations.isArchived, false)
    ];
    if (academyId) {
      conditions.push(eq(conversations.academyId, academyId));
    }
    
    return db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.lastMessageAt));
  },

  async getConversationsForPlayer(playerId: string, academyId?: string): Promise<Conversation[]> {
    const participantConversations = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.playerId, playerId),
          eq(conversationParticipants.participantType, "player")
        )
      );
    
    const conversationIds = participantConversations.map(p => p.conversationId);
    if (conversationIds.length === 0) return [];
    
    const conditions = [
      inArray(conversations.id, conversationIds),
      eq(conversations.isArchived, false)
    ];
    if (academyId) {
      conditions.push(eq(conversations.academyId, academyId));
    }
    
    return db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.lastMessageAt));
  },

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const result = await db.insert(conversations).values(data).returning();
    return result[0];
  },

  async updateConversation(id: string, data: Partial<InsertConversation>, coachId?: string): Promise<Conversation | undefined> {
    const conditions = [eq(conversations.id, id)];
    if (coachId) {
      conditions.push(eq(conversations.coachId, coachId));
    }
    const result = await db.update(conversations).set(data).where(and(...conditions)).returning();
    return result[0];
  },

  async getOrCreateCoachPlayerConversation(coachId: string, playerId: string, academyId?: string): Promise<Conversation> {
    // Check if conversation already exists
    const conditions = [
      eq(conversations.type, "coach_player"),
      eq(conversations.coachId, coachId),
      eq(conversations.playerId, playerId)
    ];
    if (academyId) {
      conditions.push(eq(conversations.academyId, academyId));
    }
    
    const existing = await db
      .select()
      .from(conversations)
      .where(and(...conditions));
    
    if (existing.length > 0) return existing[0];
    
    // Create new conversation with academyId
    const conv = await db.insert(conversations).values({
      type: "coach_player",
      coachId,
      playerId,
      academyId: academyId || null,
    }).returning();
    
    // Add participants with academyId for multi-tenant isolation
    await db.insert(conversationParticipants).values([
      { conversationId: conv[0].id, participantType: "coach", coachId, role: "owner", canPost: true, academyId: academyId || null },
      { conversationId: conv[0].id, participantType: "player", playerId, role: "member", canPost: true, academyId: academyId || null },
    ]);
    
    return conv[0];
  },

  // Participants
  async getConversationParticipants(conversationId: string, coachId?: string, academyId?: string): Promise<ConversationParticipant[]> {
    // If coachId provided, verify they have access to this conversation
    if (coachId) {
      const convConditions = [eq(conversations.id, conversationId), eq(conversations.coachId, coachId)];
      if (academyId) convConditions.push(eq(conversations.academyId, academyId));
      
      const conversation = await db.select().from(conversations).where(and(...convConditions));
      // Also check if coach is a participant
      if (conversation.length === 0) {
        const partConditions = [
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.coachId, coachId)
        ];
        if (academyId) partConditions.push(eq(conversationParticipants.academyId, academyId));
        
        const participantCheck = await db.select().from(conversationParticipants).where(and(...partConditions));
        if (participantCheck.length === 0) return [];
      }
    }
    
    // Filter by academyId if provided
    const conditions = [eq(conversationParticipants.conversationId, conversationId)];
    if (academyId) conditions.push(eq(conversationParticipants.academyId, academyId));
    
    return db.select().from(conversationParticipants).where(and(...conditions));
  },

  async addConversationParticipant(data: InsertConversationParticipant): Promise<ConversationParticipant> {
    const result = await db.insert(conversationParticipants).values(data).returning();
    return result[0];
  },

  async updateParticipantLastRead(conversationId: string, participantType: string, participantId: string): Promise<void> {
    if (participantType === "coach") {
      await db.update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.coachId, participantId)
          )
        );
    } else if (participantType === "player") {
      await db.update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.playerId, participantId)
          )
        );
    }
  },

  // Messages
  async getMessages(conversationId: string, limit: number = 50, coachId?: string, academyId?: string): Promise<Message[]> {
    // If coachId provided, verify they have access to this conversation
    if (coachId) {
      const convConditions = [eq(conversations.id, conversationId), eq(conversations.coachId, coachId)];
      if (academyId) convConditions.push(eq(conversations.academyId, academyId));
      
      const conversation = await db.select().from(conversations).where(and(...convConditions));
      if (conversation.length === 0) {
        const partConditions = [
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.coachId, coachId)
        ];
        if (academyId) partConditions.push(eq(conversationParticipants.academyId, academyId));
        
        const participantCheck = await db.select().from(conversationParticipants).where(and(...partConditions));
        if (participantCheck.length === 0) return [];
      }
    }
    
    // Add academyId filter if provided
    const msgConditions = [
      eq(messages.conversationId, conversationId),
      eq(messages.isDeleted, false)
    ];
    if (academyId) msgConditions.push(eq(messages.academyId, academyId));
    
    return db
      .select()
      .from(messages)
      .where(and(...msgConditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
  },

  async createMessage(data: InsertMessage, coachId?: string, academyId?: string): Promise<Message | null> {
    // If coachId provided, verify they have access to this conversation
    if (coachId) {
      const convConditions = [eq(conversations.id, data.conversationId), eq(conversations.coachId, coachId)];
      if (academyId) convConditions.push(eq(conversations.academyId, academyId));
      
      const conversation = await db.select().from(conversations).where(and(...convConditions));
      if (conversation.length === 0) {
        const partConditions = [
          eq(conversationParticipants.conversationId, data.conversationId),
          eq(conversationParticipants.coachId, coachId)
        ];
        if (academyId) partConditions.push(eq(conversationParticipants.academyId, academyId));
        
        const participantCheck = await db.select().from(conversationParticipants).where(and(...partConditions));
        if (participantCheck.length === 0) return null;
      }
    }
    
    // Include academyId in message data
    const messageData = academyId ? { ...data, academyId } : data;
    const result = await db.insert(messages).values(messageData).returning();
    
    // Update conversation last message
    await db.update(conversations).set({
      lastMessageAt: new Date(),
      lastMessagePreview: data.body.substring(0, 100),
    }).where(eq(conversations.id, data.conversationId));
    
    return result[0];
  },

  async deleteMessage(id: string): Promise<void> {
    await db.update(messages).set({ isDeleted: true }).where(eq(messages.id, id));
  },

  // Reactions
  async getMessageReactions(messageId: string, coachId?: string, academyId?: string): Promise<MessageReaction[]> {
    // If coachId provided, verify coach has access to the message's conversation
    if (coachId) {
      const msgConditions = [eq(messages.id, messageId)];
      if (academyId) msgConditions.push(eq(messages.academyId, academyId));
      
      const msg = await db.select().from(messages).where(and(...msgConditions));
      if (msg.length === 0) return [];
      const conversationId = msg[0].conversationId;
      
      const convConditions = [eq(conversations.id, conversationId), eq(conversations.coachId, coachId)];
      if (academyId) convConditions.push(eq(conversations.academyId, academyId));
      
      const conversation = await db.select().from(conversations).where(and(...convConditions));
      if (conversation.length === 0) {
        const partConditions = [
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.coachId, coachId)
        ];
        if (academyId) partConditions.push(eq(conversationParticipants.academyId, academyId));
        
        const participantCheck = await db.select().from(conversationParticipants).where(and(...partConditions));
        if (participantCheck.length === 0) return [];
      }
    }
    
    const reactionConditions = [eq(messageReactions.messageId, messageId)];
    if (academyId) reactionConditions.push(eq(messageReactions.academyId, academyId));
    
    return db.select().from(messageReactions).where(and(...reactionConditions));
  },

  async addReaction(data: InsertMessageReaction, coachId?: string, academyId?: string): Promise<MessageReaction | null> {
    // If coachId provided, verify coach has access to the message's conversation
    if (coachId) {
      const msgConditions = [eq(messages.id, data.messageId)];
      if (academyId) msgConditions.push(eq(messages.academyId, academyId));
      
      const msg = await db.select().from(messages).where(and(...msgConditions));
      if (msg.length === 0) return null;
      const conversationId = msg[0].conversationId;
      
      const convConditions = [eq(conversations.id, conversationId), eq(conversations.coachId, coachId)];
      if (academyId) convConditions.push(eq(conversations.academyId, academyId));
      
      const conversation = await db.select().from(conversations).where(and(...convConditions));
      if (conversation.length === 0) {
        const partConditions = [
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.coachId, coachId)
        ];
        if (academyId) partConditions.push(eq(conversationParticipants.academyId, academyId));
        
        const participantCheck = await db.select().from(conversationParticipants).where(and(...partConditions));
        if (participantCheck.length === 0) return null;
      }
    }
    
    // Include academyId in reaction data
    const reactionData = academyId ? { ...data, academyId } : data;
    const result = await db.insert(messageReactions).values(reactionData).returning();
    return result[0];
  },

  async removeReaction(messageId: string, reactorType: string, reactorId: string, emoji: string, coachId?: string, academyId?: string): Promise<boolean> {
    // If coachId provided, verify coach has access to the message's conversation
    if (coachId) {
      const msgConditions = [eq(messages.id, messageId)];
      if (academyId) msgConditions.push(eq(messages.academyId, academyId));
      
      const msg = await db.select().from(messages).where(and(...msgConditions));
      if (msg.length === 0) return false;
      const conversationId = msg[0].conversationId;
      
      const convConditions = [eq(conversations.id, conversationId), eq(conversations.coachId, coachId)];
      if (academyId) convConditions.push(eq(conversations.academyId, academyId));
      
      const conversation = await db.select().from(conversations).where(and(...convConditions));
      if (conversation.length === 0) {
        const partConditions = [
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.coachId, coachId)
        ];
        if (academyId) partConditions.push(eq(conversationParticipants.academyId, academyId));
        
        const participantCheck = await db.select().from(conversationParticipants).where(and(...partConditions));
        if (participantCheck.length === 0) return false;
      }
    }
    
    const baseConditions = [
      eq(messageReactions.messageId, messageId),
      eq(messageReactions.emoji, emoji)
    ];
    if (academyId) baseConditions.push(eq(messageReactions.academyId, academyId));
    
    if (reactorType === "coach") {
      await db.delete(messageReactions).where(
        and(...baseConditions, eq(messageReactions.reactorCoachId, reactorId))
      );
    } else {
      await db.delete(messageReactions).where(
        and(...baseConditions, eq(messageReactions.reactorPlayerId, reactorId))
      );
    }
    return true;
  },

  // Unread count
  async getUnreadCountForCoach(coachId: string): Promise<number> {
    const participations = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.coachId, coachId),
          eq(conversationParticipants.participantType, "coach")
        )
      );
    
    let unreadCount = 0;
    
    for (const p of participations) {
      const lastRead = p.lastReadAt || new Date(0);
      const unreadMessages = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, p.conversationId),
            gte(messages.createdAt, lastRead),
            ne(messages.senderCoachId, coachId),
            eq(messages.isDeleted, false)
          )
        );
      unreadCount += unreadMessages.length;
    }
    
    return unreadCount;
  },

  async getUnreadCountForPlayer(playerId: string): Promise<number> {
    const participations = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.playerId, playerId),
          eq(conversationParticipants.participantType, "player")
        )
      );
    
    let unreadCount = 0;
    
    for (const p of participations) {
      const lastRead = p.lastReadAt || new Date(0);
      const unreadMessages = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, p.conversationId),
            gte(messages.createdAt, lastRead),
            ne(messages.senderPlayerId, playerId),
            eq(messages.isDeleted, false)
          )
        );
      unreadCount += unreadMessages.length;
    }
    
    return unreadCount;
  },

  // ==================== RECURRING SERIES ====================
  async getRecurringSeries(id: string, academyId?: string): Promise<RecurringSeries | undefined> {
    const conditions = [eq(recurringSeries.id, id)];
    if (academyId) {
      conditions.push(eq(recurringSeries.academyId, academyId));
    }
    const result = await db.select().from(recurringSeries).where(and(...conditions));
    return result[0];
  },

  async getRecurringSeriesForCoach(coachId: string, academyId?: string): Promise<RecurringSeries[]> {
    const conditions = [eq(recurringSeries.coachId, coachId), eq(recurringSeries.isActive, true)];
    if (academyId) {
      conditions.push(eq(recurringSeries.academyId, academyId));
    }
    return db.select().from(recurringSeries).where(and(...conditions));
  },

  async createRecurringSeries(data: InsertRecurringSeries): Promise<RecurringSeries> {
    const result = await db.insert(recurringSeries).values(data).returning();
    return result[0];
  },

  async updateRecurringSeries(id: string, data: Partial<InsertRecurringSeries>, academyId?: string): Promise<RecurringSeries | undefined> {
    const conditions = [eq(recurringSeries.id, id)];
    if (academyId) {
      conditions.push(eq(recurringSeries.academyId, academyId));
    }
    const result = await db.update(recurringSeries).set(data).where(and(...conditions)).returning();
    return result[0];
  },

  async deleteRecurringSeries(id: string, academyId?: string): Promise<void> {
    const conditions = [eq(recurringSeries.id, id)];
    if (academyId) {
      conditions.push(eq(recurringSeries.academyId, academyId));
    }
    await db.update(recurringSeries).set({ isActive: false }).where(and(...conditions));
  },

  async createRecurringSessionInstances(
    seriesId: string,
    baseSession: Omit<InsertSession, 'startTime' | 'endTime'>,
    startDate: Date,
    weekCount: number,
    dayOfWeek: number,
    startTimeStr: string,
    duration: number,
    playerIds?: string[],
    academyId?: string
  ): Promise<{ sessions: Session[], skippedSessions: { sessionId: string, date: string, reason: string }[] }> {
    const createdSessions: Session[] = [];
    const skippedSessions: { sessionId: string, date: string, reason: string }[] = [];
    const [hours, minutes] = startTimeStr.split(':').map(Number);
    
    // Get player holidays if players specified
    const playerHolidaysMap: Map<string, PlayerHoliday[]> = new Map();
    if (playerIds && playerIds.length > 0) {
      for (const playerId of playerIds) {
        const holidays = await this.getPlayerHolidays(playerId, academyId);
        playerHolidaysMap.set(playerId, holidays);
      }
    }
    
    for (let week = 0; week < weekCount; week++) {
      const sessionDate = new Date(startDate);
      sessionDate.setDate(sessionDate.getDate() + (week * 7));
      
      // Adjust to correct day of week
      const currentDay = sessionDate.getDay();
      const daysToAdd = dayOfWeek - currentDay;
      sessionDate.setDate(sessionDate.getDate() + daysToAdd);
      
      // Set time
      const startTime = new Date(sessionDate);
      startTime.setHours(hours, minutes, 0, 0);
      
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + duration);
      
      // Check if any player is on holiday
      let isHoliday = false;
      if (playerIds && playerIds.length > 0) {
        for (const playerId of playerIds) {
          const holidays = playerHolidaysMap.get(playerId) || [];
          for (const h of holidays) {
            const hStart = new Date(h.startDate);
            const hEnd = new Date(h.endDate);
            hEnd.setHours(23, 59, 59);
            if (startTime >= hStart && startTime <= hEnd) {
              isHoliday = true;
              break;
            }
          }
          if (isHoliday) break;
        }
      }
      
      const session = await db.insert(sessions).values({
        ...baseSession,
        startTime,
        endTime,
        duration,
        isRecurring: true,
        recurringGroupId: seriesId,
        weekCount,
        isSkipped: isHoliday,
        skipReason: isHoliday ? 'holiday' : null,
        status: isHoliday ? 'cancelled' : 'scheduled',
      }).returning();
      
      createdSessions.push(session[0]);
      if (isHoliday) {
        skippedSessions.push({
          sessionId: session[0].id,
          date: startTime.toISOString(),
          reason: 'holiday',
        });
      }
    }
    
    return { sessions: createdSessions, skippedSessions };
  },

  async getSessionsByRecurringGroupId(recurringGroupId: string, academyId?: string): Promise<Session[]> {
    const conditions = [eq(sessions.recurringGroupId, recurringGroupId)];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    return db.select().from(sessions).where(and(...conditions)).orderBy(asc(sessions.startTime));
  },

  async deleteRecurringSessionInstances(recurringGroupId: string, fromDate?: Date, academyId?: string): Promise<void> {
    const conditions = [eq(sessions.recurringGroupId, recurringGroupId)];
    if (academyId) {
      conditions.push(eq(sessions.academyId, academyId));
    }
    if (fromDate) {
      conditions.push(gte(sessions.startTime, fromDate));
    }
    await db.update(sessions).set({ status: 'cancelled' }).where(and(...conditions));
  },

  // ==================== INSIGHTS API ====================
  
  async getAttendanceTrends(academyId: string, days: number = 30): Promise<{
    date: string;
    attended: number;
    absent: number;
    rate: number;
  }[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const attendanceRecords = await db
      .select()
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(and(
        eq(sessions.academyId, academyId),
        gte(sessions.startTime, cutoffDate),
        lte(sessions.startTime, new Date())
      ));
    
    const dailyStats: Record<string, { attended: number; absent: number }> = {};
    
    for (const record of attendanceRecords) {
      const date = record.sessions.startTime.toISOString().split('T')[0];
      if (!dailyStats[date]) dailyStats[date] = { attended: 0, absent: 0 };
      if (record.session_players.attendanceStatus === 'present') {
        dailyStats[date].attended++;
      } else {
        dailyStats[date].absent++;
      }
    }
    
    return Object.entries(dailyStats)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        attended: stats.attended,
        absent: stats.absent,
        rate: stats.attended + stats.absent > 0 
          ? Math.round((stats.attended / (stats.attended + stats.absent)) * 100) 
          : 0,
      }));
  },

  async getXpVelocity(academyId: string, days: number = 30): Promise<{
    date: string;
    totalXp: number;
    playerCount: number;
    avgXpPerPlayer: number;
  }[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const xpRecords = await db
      .select()
      .from(xpTransactions)
      .innerJoin(players, eq(xpTransactions.playerId, players.id))
      .where(and(
        eq(players.academyId, academyId),
        gte(xpTransactions.createdAt, cutoffDate)
      ));
    
    const dailyStats: Record<string, { totalXp: number; playerIds: Set<string> }> = {};
    
    for (const record of xpRecords) {
      const date = record.xp_transactions.createdAt?.toISOString().split('T')[0] || '';
      if (!dailyStats[date]) dailyStats[date] = { totalXp: 0, playerIds: new Set() };
      dailyStats[date].totalXp += record.xp_transactions.xpAmount;
      dailyStats[date].playerIds.add(record.players.id);
    }
    
    return Object.entries(dailyStats)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        totalXp: stats.totalXp,
        playerCount: stats.playerIds.size,
        avgXpPerPlayer: stats.playerIds.size > 0 ? Math.round(stats.totalXp / stats.playerIds.size) : 0,
      }));
  },

  async getCoachLoadStats(academyId: string, days: number = 7): Promise<{
    coachId: string;
    coachName: string;
    sessionCount: number;
    totalMinutes: number;
    playerCount: number;
    avgSessionsPerDay: number;
    loadLevel: 'light' | 'moderate' | 'heavy';
  }[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const coachSessions = await db
      .select()
      .from(sessions)
      .innerJoin(coaches, eq(sessions.coachId, coaches.id))
      .where(and(
        eq(sessions.academyId, academyId),
        gte(sessions.startTime, cutoffDate),
        ne(sessions.status, 'cancelled')
      ));
    
    const coachStats: Record<string, {
      name: string;
      sessions: number;
      minutes: number;
      playerIds: Set<string>;
    }> = {};
    
    for (const record of coachSessions) {
      const coachId = record.coaches.id;
      if (!coachStats[coachId]) {
        coachStats[coachId] = {
          name: record.coaches.name || 'Unknown Coach',
          sessions: 0,
          minutes: 0,
          playerIds: new Set(),
        };
      }
      coachStats[coachId].sessions++;
      coachStats[coachId].minutes += record.sessions.duration;
    }
    
    // Get player counts per coach
    const sessionPlayerRecords = await db
      .select()
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(and(
        eq(sessions.academyId, academyId),
        gte(sessions.startTime, cutoffDate)
      ));
    
    for (const sp of sessionPlayerRecords) {
      const session = coachSessions.find(cs => cs.sessions.id === sp.sessions.id);
      if (session && coachStats[session.coaches.id] && sp.session_players.playerId) {
        coachStats[session.coaches.id].playerIds.add(sp.session_players.playerId);
      }
    }
    
    return Object.entries(coachStats).map(([coachId, stats]) => {
      const avgSessionsPerDay = Math.round((stats.sessions / days) * 10) / 10;
      let loadLevel: 'light' | 'moderate' | 'heavy' = 'light';
      if (stats.minutes > 300 * days) loadLevel = 'heavy';
      else if (stats.minutes > 180 * days) loadLevel = 'moderate';
      
      return {
        coachId,
        coachName: stats.name,
        sessionCount: stats.sessions,
        totalMinutes: stats.minutes,
        playerCount: stats.playerIds.size,
        avgSessionsPerDay,
        loadLevel,
      };
    });
  },

  // ==================== COACH COURT PREFERENCES ====================
  async getCoachCourtPreferences(coachId: string): Promise<CoachCourtPreference[]> {
    const result = await db
      .select()
      .from(coachCourtPreferences)
      .where(eq(coachCourtPreferences.coachId, coachId))
      .orderBy(asc(coachCourtPreferences.priority));
    return result;
  },

  async getCoachCourtRules(coachId: string): Promise<CoachCourtRules | undefined> {
    const result = await db
      .select()
      .from(coachCourtRules)
      .where(eq(coachCourtRules.coachId, coachId));
    return result[0];
  },

  async upsertCoachCourtPreferences(
    coachId: string,
    preferences: { courtId: string; priority: number }[]
  ): Promise<void> {
    await db.delete(coachCourtPreferences).where(eq(coachCourtPreferences.coachId, coachId));
    
    if (preferences.length > 0) {
      await db.insert(coachCourtPreferences).values(
        preferences.map(p => ({
          coachId,
          courtId: p.courtId,
          priority: p.priority,
        }))
      );
    }
  },

  async upsertCoachCourtRules(
    coachId: string,
    rules: {
      preferredType?: string;
      daylightOnly?: boolean;
      maxSessionsPerCourtPerDay?: number;
      maxTotalSessionsPerDay?: number;
      fallbackBehavior?: string;
    }
  ): Promise<CoachCourtRules> {
    const existing = await db
      .select()
      .from(coachCourtRules)
      .where(eq(coachCourtRules.coachId, coachId));

    if (existing.length > 0) {
      const updated = await db
        .update(coachCourtRules)
        .set({
          preferredType: rules.preferredType ?? existing[0].preferredType,
          daylightOnly: rules.daylightOnly ?? existing[0].daylightOnly,
          maxSessionsPerCourtPerDay: rules.maxSessionsPerCourtPerDay ?? existing[0].maxSessionsPerCourtPerDay,
          maxTotalSessionsPerDay: rules.maxTotalSessionsPerDay ?? existing[0].maxTotalSessionsPerDay,
          fallbackBehavior: rules.fallbackBehavior ?? existing[0].fallbackBehavior,
          updatedAt: new Date(),
        })
        .where(eq(coachCourtRules.coachId, coachId))
        .returning();
      return updated[0];
    } else {
      const inserted = await db
        .insert(coachCourtRules)
        .values({
          coachId,
          preferredType: rules.preferredType ?? "no_preference",
          daylightOnly: rules.daylightOnly ?? false,
          maxSessionsPerCourtPerDay: rules.maxSessionsPerCourtPerDay ?? 8,
          maxTotalSessionsPerDay: rules.maxTotalSessionsPerDay ?? 10,
          fallbackBehavior: rules.fallbackBehavior ?? "suggest",
        })
        .returning();
      return inserted[0];
    }
  },

  // ==================== PHASE 3: ACADEMY SETTINGS ====================
  
  async getAcademySettings(academyId: string): Promise<AcademySettings | undefined> {
    const result = await db.select().from(academySettings).where(eq(academySettings.academyId, academyId));
    return result[0];
  },

  async createAcademySettings(data: InsertAcademySettings): Promise<AcademySettings> {
    const result = await db.insert(academySettings).values(data).returning();
    return result[0];
  },

  async updateAcademySettings(academyId: string, data: Partial<InsertAcademySettings>): Promise<AcademySettings | undefined> {
    const result = await db.update(academySettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(academySettings.academyId, academyId))
      .returning();
    return result[0];
  },

  async upsertAcademySettings(academyId: string, data: Partial<InsertAcademySettings>): Promise<AcademySettings> {
    const existing = await this.getAcademySettings(academyId);
    if (existing) {
      return (await this.updateAcademySettings(academyId, data))!;
    }
    return this.createAcademySettings({ ...data, academyId });
  },

  // ==================== PHASE 3: ACADEMY INVITES ====================

  async createAcademyInvite(data: InsertAcademyInvite): Promise<AcademyInvite> {
    const result = await db.insert(academyInvites).values(data).returning();
    return result[0];
  },

  async getAcademyInvite(id: string): Promise<AcademyInvite | undefined> {
    const result = await db.select().from(academyInvites).where(eq(academyInvites.id, id));
    return result[0];
  },

  async getAcademyInviteByCode(code: string): Promise<AcademyInvite | undefined> {
    const result = await db.select().from(academyInvites).where(eq(academyInvites.inviteCode, code));
    return result[0];
  },

  async getAcademyInvites(academyId: string): Promise<AcademyInvite[]> {
    return db.select().from(academyInvites)
      .where(eq(academyInvites.academyId, academyId))
      .orderBy(desc(academyInvites.createdAt));
  },

  async updateAcademyInvite(id: string, data: Partial<AcademyInvite>): Promise<AcademyInvite | undefined> {
    const result = await db.update(academyInvites).set(data).where(eq(academyInvites.id, id)).returning();
    return result[0];
  },

  async deleteAcademyInvite(id: string): Promise<void> {
    await db.delete(academyInvites).where(eq(academyInvites.id, id));
  },

  // ==================== PHASE 3: COACH MEMBERSHIPS ====================

  async createCoachMembership(data: InsertCoachAcademyMembership): Promise<CoachAcademyMembership> {
    const result = await db.insert(coachAcademyMemberships).values(data).returning();
    return result[0];
  },

  async getCoachMemberships(coachId: string): Promise<CoachAcademyMembership[]> {
    return db.select().from(coachAcademyMemberships)
      .where(and(
        eq(coachAcademyMemberships.coachId, coachId),
        eq(coachAcademyMemberships.isActive, true)
      ));
  },

  async getAcademyMembers(academyId: string): Promise<CoachAcademyMembership[]> {
    return db.select().from(coachAcademyMemberships)
      .where(and(
        eq(coachAcademyMemberships.academyId, academyId),
        eq(coachAcademyMemberships.isActive, true)
      ));
  },

  async updateCoachMembership(id: string, data: Partial<CoachAcademyMembership>): Promise<CoachAcademyMembership | undefined> {
    const result = await db.update(coachAcademyMemberships).set(data).where(eq(coachAcademyMemberships.id, id)).returning();
    return result[0];
  },

  async setPrimaryAcademy(coachId: string, academyId: string): Promise<void> {
    // First unset all as non-primary
    await db.update(coachAcademyMemberships)
      .set({ isPrimary: false })
      .where(eq(coachAcademyMemberships.coachId, coachId));
    // Set the new primary
    await db.update(coachAcademyMemberships)
      .set({ isPrimary: true })
      .where(and(
        eq(coachAcademyMemberships.coachId, coachId),
        eq(coachAcademyMemberships.academyId, academyId)
      ));
  },

  // ==================== PHASE 3: PUSH NOTIFICATIONS ====================

  async registerPushToken(data: InsertPushDeviceToken): Promise<PushDeviceToken> {
    // Check if token already exists, update if so
    const existing = await db.select().from(pushDeviceTokens).where(eq(pushDeviceTokens.token, data.token));
    if (existing.length > 0) {
      const updated = await db.update(pushDeviceTokens)
        .set({ isActive: true, lastUsedAt: new Date(), coachId: data.coachId })
        .where(eq(pushDeviceTokens.token, data.token))
        .returning();
      return updated[0];
    }
    const result = await db.insert(pushDeviceTokens).values(data).returning();
    return result[0];
  },

  async getCoachPushTokens(coachId: string): Promise<PushDeviceToken[]> {
    return db.select().from(pushDeviceTokens)
      .where(and(
        eq(pushDeviceTokens.coachId, coachId),
        eq(pushDeviceTokens.isActive, true)
      ));
  },

  async deactivatePushToken(token: string): Promise<void> {
    await db.update(pushDeviceTokens)
      .set({ isActive: false })
      .where(eq(pushDeviceTokens.token, token));
  },

  async getNotificationPreferences(coachId: string): Promise<NotificationPreference | undefined> {
    const result = await db.select().from(notificationPreferences).where(eq(notificationPreferences.coachId, coachId));
    return result[0];
  },

  async upsertNotificationPreferences(coachId: string, data: Partial<InsertNotificationPreference>): Promise<NotificationPreference> {
    const existing = await this.getNotificationPreferences(coachId);
    if (existing) {
      const result = await db.update(notificationPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(notificationPreferences.coachId, coachId))
        .returning();
      return result[0];
    }
    const result = await db.insert(notificationPreferences).values({ ...data, coachId }).returning();
    return result[0];
  },

  async createScheduledNotification(data: InsertScheduledNotification): Promise<ScheduledNotification> {
    const result = await db.insert(scheduledNotifications).values(data).returning();
    return result[0];
  },

  async getPendingNotifications(before: Date): Promise<ScheduledNotification[]> {
    return db.select().from(scheduledNotifications)
      .where(and(
        eq(scheduledNotifications.status, 'pending'),
        lte(scheduledNotifications.scheduledFor, before)
      ))
      .orderBy(asc(scheduledNotifications.scheduledFor));
  },

  async markNotificationSent(id: string, error?: string): Promise<void> {
    await db.update(scheduledNotifications)
      .set({
        status: error ? 'failed' : 'sent',
        sentAt: error ? null : new Date(),
        error: error || null,
      })
      .where(eq(scheduledNotifications.id, id));
  },

  // ==================== PHASE 3: BILLING ====================

  async getBillingAccount(academyId: string): Promise<BillingAccount | undefined> {
    const result = await db.select().from(billingAccounts).where(eq(billingAccounts.academyId, academyId));
    return result[0];
  },

  async createBillingAccount(data: InsertBillingAccount): Promise<BillingAccount> {
    const result = await db.insert(billingAccounts).values(data).returning();
    return result[0];
  },

  async updateBillingAccount(academyId: string, data: Partial<InsertBillingAccount>): Promise<BillingAccount | undefined> {
    const result = await db.update(billingAccounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(billingAccounts.academyId, academyId))
      .returning();
    return result[0];
  },

  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return db.select().from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true))
      .orderBy(asc(subscriptionPlans.sortOrder));
  },

  async getSubscription(academyId: string): Promise<Subscription | undefined> {
    const result = await db.select().from(subscriptions)
      .where(and(
        eq(subscriptions.academyId, academyId),
        eq(subscriptions.status, 'active')
      ));
    return result[0];
  },

  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const result = await db.insert(subscriptions).values(data).returning();
    return result[0];
  },

  async updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const result = await db.update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return result[0];
  },

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const result = await db.insert(invoices).values(data).returning();
    return result[0];
  },

  async getInvoices(academyId: string): Promise<Invoice[]> {
    return db.select().from(invoices)
      .where(eq(invoices.academyId, academyId))
      .orderBy(desc(invoices.createdAt));
  },

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const result = await db.select().from(invoices).where(eq(invoices.id, id));
    return result[0];
  },

  async updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const result = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    return result[0];
  },

  async createPayment(data: InsertPayment): Promise<Payment> {
    const result = await db.insert(payments).values(data).returning();
    return result[0];
  },

  async getPayments(academyId: string): Promise<Payment[]> {
    return db.select().from(payments)
      .where(eq(payments.academyId, academyId))
      .orderBy(desc(payments.createdAt));
  },

  async updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment | undefined> {
    const result = await db.update(payments).set(data).where(eq(payments.id, id)).returning();
    return result[0];
  },

  async createRefund(data: InsertRefund): Promise<Refund> {
    const result = await db.insert(refunds).values(data).returning();
    return result[0];
  },

  async getRefunds(paymentId: string): Promise<Refund[]> {
    return db.select().from(refunds).where(eq(refunds.paymentId, paymentId));
  },

  async generateInvoiceNumber(academyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await db.select().from(invoices)
      .where(and(
        eq(invoices.academyId, academyId),
        gte(invoices.createdAt, new Date(`${year}-01-01`))
      ));
    return `INV-${year}-${String(count.length + 1).padStart(4, '0')}`;
  },

  // ==================== HEALTH CHECK ====================
  
  async checkDatabaseHealth(): Promise<boolean> {
    try {
      await db.select().from(users).limit(1);
      return true;
    } catch (error) {
      console.error("Database health check failed:", error);
      return false;
    }
  },

  // ==================== PLAYER APP SPECIFIC HELPERS ====================

  async getPlayerSessionsWithDetails(
    playerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    id: string;
    startTime: Date;
    endTime: Date;
    sessionType: string | null;
    status: string | null;
    courtId: string | null;
    attended: string | null;
  }[]> {
    const result = await db
      .select({
        id: sessions.id,
        startTime: sessions.startTime,
        endTime: sessions.endTime,
        sessionType: sessions.sessionType,
        status: sessions.status,
        courtId: sessions.courtId,
        attended: sessionPlayers.attendanceStatus,
      })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(and(
        eq(sessionPlayers.playerId, playerId),
        gte(sessions.startTime, startDate),
        lte(sessions.endTime, endDate)
      ))
      .orderBy(sessions.startTime);
    return result;
  },

  async getPlayerFeedbackNotes(playerId: string, limit: number = 10): Promise<{
    id: string;
    content: string;
    category: string;
    createdAt: Date | null;
    coachId: string | null;
  }[]> {
    const result = await db
      .select({
        id: playerNotes.id,
        content: playerNotes.content,
        category: playerNotes.category,
        createdAt: playerNotes.createdAt,
        coachId: playerNotes.coachId,
      })
      .from(playerNotes)
      .where(eq(playerNotes.playerId, playerId))
      .orderBy(desc(playerNotes.createdAt))
      .limit(limit);
    return result;
  },

  async getPlayerXpTotal(playerId: string): Promise<{ totalXp: number; level: number }> {
    const player = await db.select().from(players).where(eq(players.id, playerId));
    if (!player[0]) return { totalXp: 0, level: 1 };
    return {
      totalXp: player[0].totalXp || 0,
      level: player[0].level || 1,
    };
  },

  async getPlayerXpHistory(playerId: string, limit: number = 20): Promise<{
    id: string;
    amount: number;
    reason: string | null;
    createdAt: Date | null;
  }[]> {
    const result = await db
      .select({
        id: xpTransactions.id,
        amount: xpTransactions.amount,
        reason: xpTransactions.reason,
        createdAt: xpTransactions.createdAt,
      })
      .from(xpTransactions)
      .where(eq(xpTransactions.playerId, playerId))
      .orderBy(desc(xpTransactions.createdAt))
      .limit(limit);
    return result;
  },

  async getPlayerMilestones(playerId: string): Promise<{
    id: string;
    type: string;
    title: string;
    date: Date | null;
  }[]> {
    const milestones: { id: string; type: string; title: string; date: Date | null }[] = [];
    
    // Get skill observations that represent major improvements
    const observations = await db
      .select({
        id: sessionSkillObservations.id,
        direction: sessionSkillObservations.direction,
        domainId: sessionSkillObservations.domainId,
        createdAt: sessionSkillObservations.createdAt,
      })
      .from(sessionSkillObservations)
      .where(and(
        eq(sessionSkillObservations.playerId, playerId),
        eq(sessionSkillObservations.direction, "up")
      ))
      .orderBy(desc(sessionSkillObservations.createdAt))
      .limit(20);
    
    for (const obs of observations) {
      milestones.push({
        id: obs.id,
        type: "skill_improvement",
        title: `Skill improved`,
        date: obs.createdAt,
      });
    }
    
    // Get XP milestones (large XP gains)
    const xpMilestones = await db
      .select({
        id: xpTransactions.id,
        amount: xpTransactions.amount,
        reason: xpTransactions.reason,
        createdAt: xpTransactions.createdAt,
      })
      .from(xpTransactions)
      .where(and(
        eq(xpTransactions.playerId, playerId),
        gte(xpTransactions.amount, 50)
      ))
      .orderBy(desc(xpTransactions.createdAt))
      .limit(10);
    
    for (const xp of xpMilestones) {
      milestones.push({
        id: xp.id,
        type: "xp_gain",
        title: xp.reason || `Earned ${xp.amount} XP`,
        date: xp.createdAt,
      });
    }
    
    // Sort by date
    milestones.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return b.date.getTime() - a.date.getTime();
    });
    
    return milestones.slice(0, 20);
  },

  async listSkillDomains(): Promise<SkillDomain[]> {
    return db.select().from(skillDomains);
  },

  async getPlayerDomainInsights(playerId: string, domainId: string): Promise<{
    recentHighlights: string[];
    focusAreas: string[];
    lastObservation: { direction: string; note: string | null; date: Date | null } | null;
    avgDelta: number;
    observationCount: number;
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const observations = await db
      .select()
      .from(sessionSkillObservations)
      .where(and(
        eq(sessionSkillObservations.playerId, playerId),
        eq(sessionSkillObservations.domainId, domainId),
        gte(sessionSkillObservations.createdAt, thirtyDaysAgo)
      ))
      .orderBy(desc(sessionSkillObservations.createdAt))
      .limit(20);
    
    if (observations.length === 0) {
      return {
        recentHighlights: [],
        focusAreas: [],
        lastObservation: null,
        avgDelta: 0,
        observationCount: 0,
      };
    }
    
    const recentHighlights: string[] = [];
    const focusAreas: string[] = [];
    
    for (const obs of observations) {
      if (obs.direction === "up" && obs.note && obs.effortLevel === "high") {
        if (!recentHighlights.includes(obs.note) && recentHighlights.length < 3) {
          recentHighlights.push(obs.note);
        }
      }
      if (obs.direction === "down" && obs.note) {
        if (!focusAreas.includes(obs.note) && focusAreas.length < 3) {
          focusAreas.push(obs.note);
        }
      }
    }
    
    const totalDelta = observations.reduce((sum, o) => sum + (o.appliedDelta || 0), 0);
    
    return {
      recentHighlights,
      focusAreas,
      lastObservation: {
        direction: observations[0].direction,
        note: observations[0].note,
        date: observations[0].createdAt,
      },
      avgDelta: observations.length > 0 ? Math.round((totalDelta / observations.length) * 10) / 10 : 0,
      observationCount: observations.length,
    };
  },
};
