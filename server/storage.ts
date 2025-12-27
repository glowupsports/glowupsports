import { db } from "./db";
import { eq, and, gte, lte, ne, or, inArray } from "drizzle-orm";
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
      { name: "technical", displayName: "Technical", description: "Strokes, technique, consistency", icon: "tennisball-outline", sortOrder: 1 },
      { name: "mental", displayName: "Mental", description: "Focus, resilience, confidence", icon: "brain-outline", sortOrder: 2 },
      { name: "physical", displayName: "Physical", description: "Fitness, speed, endurance", icon: "fitness-outline", sortOrder: 3 },
      { name: "social", displayName: "Social", description: "Teamwork, sportsmanship, communication", icon: "people-outline", sortOrder: 4 },
      { name: "tactical", displayName: "Tactical", description: "Strategy, decision-making, game IQ", icon: "bulb-outline", sortOrder: 5 },
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
};
