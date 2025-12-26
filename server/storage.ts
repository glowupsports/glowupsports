import { db } from "./db";
import { eq, and, gte, lte, ne, or } from "drizzle-orm";
import {
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
} from "@shared/schema";

export const storage = {
  // ==================== COACHES ====================
  async getCoach(id: string): Promise<Coach | undefined> {
    const result = await db.select().from(coaches).where(eq(coaches.id, id));
    return result[0];
  },

  async getAllCoaches(): Promise<Coach[]> {
    return db.select().from(coaches);
  },

  async createCoach(data: InsertCoach): Promise<Coach> {
    const result = await db.insert(coaches).values(data).returning();
    return result[0];
  },

  // ==================== LOCATIONS ====================
  async getLocation(id: string): Promise<Location | undefined> {
    const result = await db.select().from(locations).where(eq(locations.id, id));
    return result[0];
  },

  async getAllLocations(): Promise<Location[]> {
    return db.select().from(locations);
  },

  async createLocation(data: InsertLocation): Promise<Location> {
    const result = await db.insert(locations).values(data).returning();
    return result[0];
  },

  // ==================== COURTS ====================
  async getCourt(id: string): Promise<Court | undefined> {
    const result = await db.select().from(courts).where(eq(courts.id, id));
    return result[0];
  },

  async getCourtsByLocation(locationId: string): Promise<Court[]> {
    return db.select().from(courts).where(eq(courts.locationId, locationId));
  },

  async getAllCourts(): Promise<Court[]> {
    return db.select().from(courts);
  },

  async createCourt(data: InsertCourt): Promise<Court> {
    const result = await db.insert(courts).values(data).returning();
    return result[0];
  },

  // ==================== PLAYERS ====================
  async getPlayer(id: string): Promise<Player | undefined> {
    const result = await db.select().from(players).where(eq(players.id, id));
    return result[0];
  },

  async getAllPlayers(): Promise<Player[]> {
    return db.select().from(players);
  },

  async searchPlayers(query: string): Promise<Player[]> {
    const allPlayers = await db.select().from(players);
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

  // ==================== SESSIONS ====================
  async getSession(id: string): Promise<Session | undefined> {
    const result = await db.select().from(sessions).where(eq(sessions.id, id));
    return result[0];
  },

  async getSessionsByCoach(coachId: string, startDate: Date, endDate: Date): Promise<Session[]> {
    return db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.coachId, coachId),
          gte(sessions.startTime, startDate),
          lte(sessions.startTime, endDate)
        )
      );
  },

  async getSessionsByDateRange(startDate: Date, endDate: Date): Promise<Session[]> {
    return db
      .select()
      .from(sessions)
      .where(
        and(
          gte(sessions.startTime, startDate),
          lte(sessions.startTime, endDate)
        )
      );
  },

  async getBlockedSessions(coachId: string, startDate: Date, endDate: Date): Promise<Session[]> {
    return db
      .select()
      .from(sessions)
      .where(
        and(
          ne(sessions.coachId, coachId),
          gte(sessions.startTime, startDate),
          lte(sessions.startTime, endDate)
        )
      );
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
  async checkCoachConflict(coachId: string, startTime: Date, endTime: Date, excludeSessionId?: string): Promise<boolean> {
    const conflicts = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.coachId, coachId),
          eq(sessions.status, "scheduled"),
          or(
            and(lte(sessions.startTime, startTime), gte(sessions.endTime, startTime)),
            and(lte(sessions.startTime, endTime), gte(sessions.endTime, endTime)),
            and(gte(sessions.startTime, startTime), lte(sessions.endTime, endTime))
          )
        )
      );
    
    if (excludeSessionId) {
      return conflicts.filter(s => s.id !== excludeSessionId).length > 0;
    }
    return conflicts.length > 0;
  },

  async checkCourtConflict(courtId: string, startTime: Date, endTime: Date, excludeSessionId?: string): Promise<boolean> {
    const conflicts = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.courtId, courtId),
          eq(sessions.status, "scheduled"),
          or(
            and(lte(sessions.startTime, startTime), gte(sessions.endTime, startTime)),
            and(lte(sessions.startTime, endTime), gte(sessions.endTime, endTime)),
            and(gte(sessions.startTime, startTime), lte(sessions.endTime, endTime))
          )
        )
      );
    
    if (excludeSessionId) {
      return conflicts.filter(s => s.id !== excludeSessionId).length > 0;
    }
    return conflicts.length > 0;
  },

  async checkPlayerConflict(playerId: string, startTime: Date, endTime: Date, excludeSessionId?: string): Promise<boolean> {
    // First get all sessions the player is in
    const playerSessions = await db
      .select({ sessionId: sessionPlayers.sessionId })
      .from(sessionPlayers)
      .where(eq(sessionPlayers.playerId, playerId));

    if (playerSessions.length === 0) return false;

    const sessionIds = playerSessions.map(ps => ps.sessionId);
    
    // Check if any of those sessions overlap with the proposed time
    const conflicts = await db
      .select()
      .from(sessions)
      .where(
        and(
          inArray(sessions.id, sessionIds),
          eq(sessions.status, "scheduled"),
          or(
            and(lte(sessions.startTime, startTime), gte(sessions.endTime, startTime)),
            and(lte(sessions.startTime, endTime), gte(sessions.endTime, endTime)),
            and(gte(sessions.startTime, startTime), lte(sessions.endTime, endTime))
          )
        )
      );
    
    if (excludeSessionId) {
      return conflicts.filter(s => s.id !== excludeSessionId).length > 0;
    }
    return conflicts.length > 0;
  },

  // ==================== SESSION PLAYERS ====================
  async getSessionPlayers(sessionId: string): Promise<SessionPlayer[]> {
    return db.select().from(sessionPlayers).where(eq(sessionPlayers.sessionId, sessionId));
  },

  async addPlayerToSession(data: InsertSessionPlayer): Promise<SessionPlayer> {
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
  async getPlayerHolidays(playerId: string): Promise<PlayerHoliday[]> {
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
};
