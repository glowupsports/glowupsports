import { db } from "./db";
import { eq, and, gte, lte, ne, or, inArray } from "drizzle-orm";
import { desc } from "drizzle-orm";
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
  playerNotes,
  playerProgress,
  sessionTemplates,
  coachNotifications,
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
  type SessionTemplate,
  type InsertSessionTemplate,
  type CoachNotification,
  type InsertCoachNotification,
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

    const sessionIds = playerSessions.map(ps => ps.sessionId).filter((id): id is string => id !== null);
    if (sessionIds.length === 0) return false;
    
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

  async getSessionPlayersWithDetails(sessionId: string): Promise<Array<{
    id: string;
    name: string;
    level: string | null;
    ballLevel: string | null;
    skillLevel: number | null;
    status: string | null;
    lateMinutes: number | null;
    absentReason: string | null;
  }>> {
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
      .where(eq(sessionPlayers.sessionId, sessionId));
    
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

  // ==================== PLAYER NOTES ====================
  async getPlayerNotes(playerId: string): Promise<PlayerNote[]> {
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
  async getPlayerProgress(playerId: string): Promise<PlayerProgress[]> {
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

  async getProgressSummary(playerId: string): Promise<{ skillArea: string; avgRating: number; trend: string }[]> {
    const progress = await db
      .select()
      .from(playerProgress)
      .where(eq(playerProgress.playerId, playerId))
      .orderBy(desc(playerProgress.createdAt));
    
    const skillAreas = ["forehand", "backhand", "serve", "volley", "movement", "mental"];
    return skillAreas.map(area => {
      const areaProgress = progress.filter(p => p.skillArea === area);
      const avgRating = areaProgress.length > 0 
        ? areaProgress.reduce((sum, p) => sum + (p.rating || 0), 0) / areaProgress.length 
        : 0;
      const latestTrend = areaProgress[0]?.trend || "stable";
      return { skillArea: area, avgRating: Math.round(avgRating * 10) / 10, trend: latestTrend };
    });
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

  async createNotification(data: InsertCoachNotification): Promise<CoachNotification> {
    const result = await db.insert(coachNotifications).values(data).returning();
    return result[0];
  },

  async markNotificationRead(id: string): Promise<void> {
    await db.update(coachNotifications).set({ isRead: true }).where(eq(coachNotifications.id, id));
  },

  async markAllNotificationsRead(coachId: string): Promise<void> {
    await db.update(coachNotifications).set({ isRead: true }).where(eq(coachNotifications.coachId, coachId));
  },

  async deleteNotification(id: string): Promise<void> {
    await db.delete(coachNotifications).where(eq(coachNotifications.id, id));
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
};
