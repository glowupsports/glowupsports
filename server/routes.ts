import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { 
  hashPassword, 
  verifyPassword, 
  generateToken, 
  authMiddleware, 
  requireRole, 
  requireAcademy,
  validatePlayerOwnership,
  validateCourtOwnership,
  validateSessionOwnership,
  validatePackageOwnership,
  validateNotificationOwnership,
  type AuthenticatedRequest 
} from "./auth";
import { loginSchema, registerSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export async function registerRoutes(app: Express): Promise<Server> {
  // ==================== AUTH ENDPOINTS ====================
  
  app.post("/auth/register", authLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const { email, password, name, academyName, role } = parsed.data;

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: "Email already registered" });
      }

      const hashedPassword = await hashPassword(password);

      let academyId: string | null = null;
      let coachId: string | null = null;

      if (academyName) {
        const slug = academyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const existingAcademy = await storage.getAcademyBySlug(slug);
        if (existingAcademy) {
          return res.status(409).json({ error: "Academy name already taken" });
        }
        
        const academy = await storage.createAcademy({ name: academyName, slug, ownerId: null });
        academyId = academy.id;
        
        const coach = await storage.createCoach({ 
          name, 
          email, 
          academyId, 
          role: "owner",
          level: 1,
          totalXp: 0,
        });
        coachId = coach.id;
        
        await storage.updateAcademy(academyId, { ownerId: coachId });
      }

      const user = await storage.createUser({
        email,
        password: hashedPassword,
        role: academyName ? "owner" : role,
        academyId,
        coachId,
      });

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        academyId: user.academyId,
        coachId: user.coachId,
      });

      res.status(201).json({ 
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          academyId: user.academyId,
          coachId: user.coachId,
        }
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/auth/login", authLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const { email, password } = parsed.data;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const validPassword = await verifyPassword(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      await storage.updateUserLastLogin(user.id);

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        academyId: user.academyId,
        coachId: user.coachId,
      });

      res.json({ 
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          academyId: user.academyId,
          coachId: user.coachId,
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // ==================== COACH CALENDAR API ====================

  // Get calendar for a date range
  app.get("/api/coach/calendar", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { date, view = "day" } = req.query;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      
      if (!date || !coachId) {
        return res.status(400).json({ error: "date is required" });
      }

      // Parse date string as UTC to avoid timezone issues
      const dateStr = date as string;
      const [year, month, day] = dateStr.split("-").map(Number);
      const targetDate = new Date(Date.UTC(year, month - 1, day));
      let startDate: Date;
      let endDate: Date;

      switch (view) {
        case "week":
          const dayOfWeek = targetDate.getUTCDay();
          startDate = new Date(targetDate);
          startDate.setUTCDate(targetDate.getUTCDate() - dayOfWeek);
          startDate.setUTCHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setUTCDate(startDate.getUTCDate() + 7);
          endDate.setUTCHours(23, 59, 59, 999);
          break;
        case "month":
          startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
          endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
          break;
        default: // day
          startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
          endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
      }

      // Get own sessions (full data) - filtered by academy
      const ownSessions = await storage.getSessionsByCoach(coachId as string, startDate, endDate, academyId ?? undefined);
      
      // Fetch players for each session using efficient join query
      const sessionsWithPlayers = await Promise.all(
        ownSessions.map(async (session) => {
          const players = await storage.getSessionPlayersWithDetails(session.id, academyId ?? undefined);
          return {
            ...session,
            players,
          };
        })
      );
      
      // Get blocked sessions (other coaches, no details) - filtered by academy
      const blockedSessions = await storage.getBlockedSessions(coachId as string, startDate, endDate, academyId ?? undefined);
      const blockedSessionsMinimal = blockedSessions.map(s => ({
        id: s.id,
        courtId: s.courtId,
        startTime: s.startTime,
        endTime: s.endTime,
        blocked: true,
      }));

      // Get courts - filtered by academy
      const courts = await storage.getAllCourts(academyId ?? undefined);
      const locations = await storage.getAllLocations(academyId ?? undefined);

      res.json({
        ownSessions: sessionsWithPlayers,
        blockedSessions: blockedSessionsMinimal,
        courts,
        locations,
        dateRange: { start: startDate, end: endDate },
      });
    } catch (error) {
      console.error("Error fetching calendar:", error);
      res.status(500).json({ error: "Failed to fetch calendar" });
    }
  });

  // Check for conflicts before booking
  app.get("/api/coach/sessions/check-conflict", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { courtId, startTime, endTime, playerIds, excludeSessionId } = req.query;
      const coachId = req.user!.coachId;

      if (!courtId || !coachId || !startTime || !endTime) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const start = new Date(startTime as string);
      const end = new Date(endTime as string);
      const conflicts: string[] = [];

      const academyId = req.user?.academyId ?? undefined;

      // Check coach conflict
      const coachConflict = await storage.checkCoachConflict(
        coachId as string, 
        start, 
        end, 
        excludeSessionId as string | undefined,
        academyId
      );
      if (coachConflict) {
        conflicts.push("Coach is already booked for this time");
      }

      // Check court conflict
      const courtConflict = await storage.checkCourtConflict(
        courtId as string, 
        start, 
        end,
        excludeSessionId as string | undefined,
        academyId
      );
      if (courtConflict) {
        conflicts.push("Court is already booked for this time");
      }

      // Check player conflicts if provided
      if (playerIds) {
        const playerIdArray = Array.isArray(playerIds) ? playerIds : [playerIds];
        for (const playerId of playerIdArray) {
          const playerConflict = await storage.checkPlayerConflict(
            playerId as string, 
            start, 
            end,
            excludeSessionId as string | undefined,
            academyId
          );
          if (playerConflict) {
            conflicts.push(`Player is already booked for this time`);
            break;
          }
        }
      }

      // Check travel time from previous session
      interface Warning {
        level: 1 | 2 | 3;
        type: string;
        message: string;
      }
      const warnings: Warning[] = [];
      
      // Get adjacent sessions for the coach on the same day
      const dayStart = new Date(start);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(start);
      dayEnd.setHours(23, 59, 59, 999);
      const coachSessions = await storage.getSessionsByCoach(coachId as string, dayStart, dayEnd);
      
      for (const session of coachSessions) {
        if (excludeSessionId && session.id === excludeSessionId) continue;
        
        const sessionStart = new Date(session.startTime);
        const sessionEnd = new Date(session.endTime);
        const requiredTravelTime = session.travelTime || 0;
        
        // Check if session ends just before new session
        if (sessionEnd <= start) {
          const gapMinutes = (start.getTime() - sessionEnd.getTime()) / 60000;
          if (gapMinutes < requiredTravelTime) {
            warnings.push({
              level: 2,
              type: "travel_time",
              message: `Not enough travel time (${Math.round(gapMinutes)}m available, ${requiredTravelTime}m needed)`,
            });
          } else if (gapMinutes < 5) {
            warnings.push({
              level: 1,
              type: "tight_schedule",
              message: `Only ${Math.round(gapMinutes)} minutes between sessions`,
            });
          }
        }
        
        // Check if new session ends just before existing session
        if (end <= sessionStart) {
          const gapMinutes = (sessionStart.getTime() - end.getTime()) / 60000;
          if (gapMinutes < requiredTravelTime) {
            warnings.push({
              level: 2,
              type: "travel_time",
              message: `Not enough travel time to next session (${Math.round(gapMinutes)}m available)`,
            });
          } else if (gapMinutes < 5) {
            warnings.push({
              level: 1,
              type: "tight_schedule",
              message: `Only ${Math.round(gapMinutes)} minutes before next session`,
            });
          }
        }
      }

      // Add Level 3 conflicts
      conflicts.forEach((conflict) => {
        warnings.push({ level: 3, type: "conflict", message: conflict });
      });

      res.json({ 
        conflicts,
        warnings,
        hasConflicts: conflicts.length > 0,
        maxWarningLevel: warnings.length > 0 ? Math.max(...warnings.map(w => w.level)) : 0,
      });
    } catch (error) {
      console.error("Error checking conflicts:", error);
      res.status(500).json({ error: "Failed to check conflicts" });
    }
  });

  // Create session
  app.post("/api/coach/sessions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      const {
        courtId,
        locationId,
        startTime,
        duration,
        sessionType,
        ballLevel,
        skillLevel,
        weekCount,
        travelTime,
        playerIds,
      } = req.body;

      if (!coachId || !courtId || !startTime || !duration || !sessionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const start = new Date(startTime);
      const end = new Date(start.getTime() + duration * 60000);

      // Check conflicts
      const coachConflict = await storage.checkCoachConflict(coachId, start, end, undefined, academyId ?? undefined);
      if (coachConflict) {
        return res.status(409).json({ 
          error: "Coach conflict", 
          level: 3,
          message: "Coach is already booked for this time slot" 
        });
      }

      const courtConflict = await storage.checkCourtConflict(courtId, start, end, undefined, academyId ?? undefined);
      if (courtConflict) {
        return res.status(409).json({ 
          error: "Court conflict", 
          level: 3,
          message: "Court is already booked for this time slot" 
        });
      }

      // Create sessions (single or recurring)
      const sessionsToCreate = weekCount && weekCount > 1 ? weekCount : 1;
      const recurringGroupId = sessionsToCreate > 1 ? crypto.randomUUID() : null;
      const createdSessions = [];
      const skippedWeeks: number[] = [];

      for (let week = 0; week < sessionsToCreate; week++) {
        const weekStart = new Date(start.getTime() + week * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + duration * 60000);

        // Check conflicts for each week
        const weekCoachConflict = await storage.checkCoachConflict(coachId, weekStart, weekEnd, undefined, academyId ?? undefined);
        const weekCourtConflict = await storage.checkCourtConflict(courtId, weekStart, weekEnd, undefined, academyId ?? undefined);
        
        if (weekCoachConflict || weekCourtConflict) {
          skippedWeeks.push(week + 1);
          continue;
        }

        const session = await storage.createSession({
          academyId,
          coachId,
          courtId,
          locationId,
          startTime: weekStart,
          endTime: weekEnd,
          duration,
          sessionType,
          ballLevel,
          skillLevel,
          isRecurring: sessionsToCreate > 1,
          recurringGroupId,
          weekCount: sessionsToCreate,
          travelTime: travelTime || 0,
          paymentStatus: "unpaid",
          status: "scheduled",
        });

        // Add players if provided
        if (playerIds && Array.isArray(playerIds)) {
          for (const playerId of playerIds) {
            await storage.addPlayerToSession({
              sessionId: session.id,
              playerId,
            });
          }
        }

        createdSessions.push(session);
      }

      if (createdSessions.length === 0) {
        return res.status(409).json({ 
          error: "All time slots have conflicts",
          message: "Could not create any sessions due to conflicts"
        });
      }

      // Audit log
      await storage.createAuditLog({
        entityType: "session",
        entityId: createdSessions[0].id,
        action: sessionsToCreate > 1 ? `create_recurring_${createdSessions.length}` : "create",
        performedBy: coachId,
      });

      // For recurring sessions, return summary with skipped weeks info
      if (sessionsToCreate > 1) {
        res.status(201).json({
          sessions: createdSessions,
          summary: {
            requested: sessionsToCreate,
            created: createdSessions.length,
            skippedWeeks: skippedWeeks,
          }
        });
      } else {
        res.status(201).json(createdSessions[0]);
      }
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Update session
  app.patch("/api/coach/sessions/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const updates = req.body;

      const session = await storage.getSession(id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check ownership
      if (session.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized to modify this session" });
      }

      // If time changed, check conflicts
      if (updates.startTime || updates.duration) {
        const start = updates.startTime ? new Date(updates.startTime) : session.startTime;
        const duration = updates.duration || session.duration;
        const end = new Date(start.getTime() + duration * 60000);
        const academyId = req.user?.academyId ?? undefined;

        const coachConflict = await storage.checkCoachConflict(coachId!, start, end, id, academyId);
        if (coachConflict) {
          return res.status(409).json({ error: "Coach conflict", level: 3 });
        }

        const courtId = updates.courtId || session.courtId;
        const courtConflict = await storage.checkCourtConflict(courtId!, start, end, id, academyId);
        if (courtConflict) {
          return res.status(409).json({ error: "Court conflict", level: 3 });
        }

        updates.endTime = end;
      }

      const updated = await storage.updateSession(id, updates);

      await storage.createAuditLog({
        entityType: "session",
        entityId: id,
        action: "update",
        performedBy: coachId!,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  // Cancel session
  app.post("/api/coach/sessions/:id/cancel", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const { reason } = req.body;

      const session = await storage.getSession(id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const cancelled = await storage.cancelSession(id);

      await storage.createAuditLog({
        entityType: "session",
        entityId: id,
        action: "cancel",
        performedBy: coachId!,
      });

      res.json(cancelled);
    } catch (error) {
      console.error("Error cancelling session:", error);
      res.status(500).json({ error: "Failed to cancel session" });
    }
  });

  // Extend session
  app.post("/api/coach/sessions/:id/extend", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const { minutes } = req.body;

      if (!minutes || ![15, 30].includes(minutes)) {
        return res.status(400).json({ error: "Invalid extension minutes" });
      }

      const session = await storage.getSession(id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.coachId !== coachId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const newEndTime = new Date(session.endTime.getTime() + minutes * 60000);
      const academyId = req.user?.academyId ?? undefined;

      // Check if extension causes conflict
      const coachConflict = await storage.checkCoachConflict(coachId!, session.endTime, newEndTime, id, academyId);
      if (coachConflict) {
        return res.status(409).json({ error: "Cannot extend - coach has another session" });
      }

      const courtConflict = await storage.checkCourtConflict(session.courtId!, session.endTime, newEndTime, id, academyId);
      if (courtConflict) {
        return res.status(409).json({ error: "Cannot extend - court is booked" });
      }

      const updated = await storage.updateSession(id, {
        endTime: newEndTime,
        duration: session.duration + minutes,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error extending session:", error);
      res.status(500).json({ error: "Failed to extend session" });
    }
  });

  // Add players to session
  app.post("/api/coach/sessions/:id/players", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { playerId, isGuest } = req.body;
      const academyId = req.user!.academyId;

      const { valid: sessionValid } = await validateSessionOwnership(id, academyId, storage);
      if (!sessionValid) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Validate player belongs to same academy (unless guest)
      if (playerId && !isGuest) {
        const { valid: playerValid } = await validatePlayerOwnership(playerId, academyId, storage);
        if (!playerValid) {
          return res.status(404).json({ error: "Player not found" });
        }
      }

      const sessionPlayer = await storage.addPlayerToSession({
        sessionId: id,
        playerId,
        isGuest: isGuest || false,
      });

      res.status(201).json(sessionPlayer);
    } catch (error) {
      console.error("Error adding player:", error);
      res.status(500).json({ error: "Failed to add player" });
    }
  });

  // Remove player from session
  app.delete("/api/coach/sessions/:id/players/:playerId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, playerId } = req.params;
      const academyId = req.user!.academyId;

      const { valid: sessionValid } = await validateSessionOwnership(id, academyId, storage);
      if (!sessionValid) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Validate player belongs to same academy
      const { valid: playerValid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!playerValid) {
        return res.status(404).json({ error: "Player not found" });
      }

      await storage.removePlayerFromSession(id, playerId);

      res.status(204).send();
    } catch (error) {
      console.error("Error removing player:", error);
      res.status(500).json({ error: "Failed to remove player" });
    }
  });

  // Get session players with player details (using efficient JOIN)
  app.get("/api/coach/sessions/:id/players", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;

      const { valid } = await validateSessionOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Session not found" });
      }

      const playersWithDetails = await storage.getSessionPlayersWithPlayerInfo(id);
      res.json(playersWithDetails);
    } catch (error) {
      console.error("Error fetching players:", error);
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  // Save attendance (offline-safe)
  app.post("/api/coach/sessions/:id/attendance", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { playerId, status, lateMinutes, absenceReason } = req.body;
      const academyId = req.user!.academyId;

      const { valid } = await validateSessionOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Session not found" });
      }

      const updated = await storage.updateAttendance(
        id,
        playerId,
        status,
        lateMinutes,
        absenceReason
      );

      res.json(updated);
    } catch (error) {
      console.error("Error saving attendance:", error);
      res.status(500).json({ error: "Failed to save attendance" });
    }
  });

  // Save feedback and award XP
  app.post("/api/coach/sessions/:id/feedback", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { intensity, mood, focusTags, coachNotes } = req.body;
      const academyId = req.user!.academyId;

      // Get session details with ownership validation
      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Create feedback record
      const feedback = await storage.createSessionFeedback({
        sessionId: id,
        intensity,
        mood,
        focusTags: JSON.stringify(focusTags || []),
        coachNotes,
      });

      // Mark session as completed
      await storage.updateSession(id, { status: "completed" });

      // Award Coach XP based on session type
      const COACH_XP_REWARDS: Record<string, number> = {
        private: 25,
        semi_private: 35,
        group: 50,
        camp: 75,
        team_training: 60,
        clinic: 45,
        match: 30,
        assessment: 40,
      };
      const coachXp = COACH_XP_REWARDS[session.sessionType] || 20;
      
      if (session.coachId) {
        await storage.addCoachXpTransaction({
          coachId: session.coachId,
          xpAmount: coachXp,
          source: "session_feedback",
          description: `Completed ${session.sessionType} session with feedback`,
          sessionId: id,
        });
        
        // Update coach total XP
        const coach = await storage.getCoach(session.coachId);
        if (coach) {
          const newTotalXp = (coach.totalXp || 0) + coachXp;
          let newLevel = 1;
          let xpThreshold = 500;
          let accumulatedXp = 0;
          while (accumulatedXp + xpThreshold <= newTotalXp) {
            accumulatedXp += xpThreshold;
            newLevel++;
            xpThreshold = 500 + (newLevel - 1) * 100;
          }
          await storage.updateCoach(session.coachId, { totalXp: newTotalXp, level: newLevel });
        }
      }

      // Award Player XP for each player in session
      const PLAYER_XP_REWARDS: Record<string, number> = {
        private: 30,
        semi_private: 25,
        group: 20,
        camp: 35,
        team_training: 25,
        clinic: 20,
        match: 40,
        assessment: 15,
      };
      const playerXp = PLAYER_XP_REWARDS[session.sessionType] || 15;
      
      const sessionPlayers = await storage.getSessionPlayers(id);
      for (const sp of sessionPlayers) {
        if (sp.playerId && sp.attendanceStatus === "present") {
          await storage.createXpTransaction({
            playerId: sp.playerId,
            xpAmount: playerXp,
            source: "session_complete",
            description: `Attended ${session.sessionType} session`,
            sessionId: id,
          });
          
          // Update player total XP
          const player = await storage.getPlayer(sp.playerId);
          if (player) {
            const newTotalXp = (player.totalXp || 0) + playerXp;
            await storage.updatePlayer(sp.playerId, { totalXp: newTotalXp });
          }
        }
      }

      res.status(201).json({ 
        feedback, 
        xpAwarded: { coach: coachXp, playerCount: sessionPlayers.filter(sp => sp.attendanceStatus === "present").length } 
      });
    } catch (error) {
      console.error("Error saving feedback:", error);
      res.status(500).json({ error: "Failed to save feedback" });
    }
  });

  // Offline sync
  app.post("/api/coach/offline/sync", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const { actions } = req.body;

      const results = [];
      for (const action of actions) {
        try {
          // Process each offline action
          switch (action.type) {
            case "attendance":
              await storage.updateAttendance(
                action.sessionId,
                action.playerId,
                action.status,
                action.lateMinutes,
                action.absenceReason
              );
              break;
            case "feedback":
              await storage.createSessionFeedback({
                sessionId: action.sessionId,
                intensity: action.intensity,
                mood: action.mood,
                focusTags: action.focusTags,
                coachNotes: action.coachNotes,
              });
              break;
          }
          results.push({ id: action.id, success: true });
        } catch (err) {
          results.push({ id: action.id, success: false, error: (err as Error).message });
        }
      }

      res.json({ synced: results });
    } catch (error) {
      console.error("Error syncing offline actions:", error);
      res.status(500).json({ error: "Failed to sync" });
    }
  });

  // ==================== PLAYER API ====================

  // Set holiday
  app.post("/api/player/holidays", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, startDate, endDate } = req.body;

      const holiday = await storage.createPlayerHoliday({
        playerId,
        startDate,
        endDate,
      });

      res.status(201).json(holiday);
    } catch (error) {
      console.error("Error creating holiday:", error);
      res.status(500).json({ error: "Failed to create holiday" });
    }
  });

  // ==================== AUTH/ME ENDPOINTS ====================

  // Get current user with coach and academy context (authenticated)
  app.get("/api/me", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      
      let coach = null;
      let academy = null;
      
      if (user.coachId) {
        coach = await storage.getCoach(user.coachId);
      }
      
      if (user.academyId) {
        academy = await storage.getAcademy(user.academyId);
      }
      
      res.json({
        user: {
          id: user.userId,
          email: user.email,
          role: user.role,
          academyId: user.academyId,
          coachId: user.coachId,
        },
        coach: coach ? {
          id: coach.id,
          name: coach.name,
          email: coach.email,
          phone: coach.phone,
          role: coach.role,
          level: coach.level,
          totalXp: coach.totalXp,
          academyId: coach.academyId,
        } : null,
        academy: academy ? {
          id: academy.id,
          name: academy.name,
          slug: academy.slug,
        } : null,
      });
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ error: "Failed to fetch current user" });
    }
  });

  // DEMO MODE: Get demo coach without auth (for development only)
  // TODO: Remove this endpoint before production
  app.get("/api/demo/me", async (req: Request, res: Response) => {
    try {
      const allCoaches = await storage.getAllCoaches();
      if (allCoaches.length === 0) {
        res.status(404).json({ error: "No coach found" });
        return;
      }
      
      const coach = allCoaches.find(c => c.name === "Coach Alex") || allCoaches[0];
      let academy = null;
      
      if (coach.academyId) {
        academy = await storage.getAcademy(coach.academyId);
      }
      
      res.json({
        coach: {
          id: coach.id,
          name: coach.name,
          email: coach.email,
          phone: coach.phone,
          role: coach.role,
          level: coach.level,
          totalXp: coach.totalXp,
          academyId: coach.academyId,
        },
        academy: academy ? {
          id: academy.id,
          name: academy.name,
          slug: academy.slug,
        } : null,
      });
    } catch (error) {
      console.error("Error fetching demo coach:", error);
      res.status(500).json({ error: "Failed to fetch demo coach" });
    }
  });

  // ==================== ADMIN/SETUP ENDPOINTS ====================

  // Get all coaches
  app.get("/api/coaches", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const allCoaches = await storage.getAllCoaches(academyId ?? undefined);
      res.json(allCoaches);
    } catch (error) {
      console.error("Error fetching coaches:", error);
      res.status(500).json({ error: "Failed to fetch coaches" });
    }
  });

  // Create coach
  app.post("/api/coaches", authMiddleware, requireRole("owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const coach = await storage.createCoach({ ...req.body, academyId });
      res.status(201).json(coach);
    } catch (error) {
      console.error("Error creating coach:", error);
      res.status(500).json({ error: "Failed to create coach" });
    }
  });

  // Get all locations
  app.get("/api/locations", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const allLocations = await storage.getAllLocations(academyId ?? undefined);
      res.json(allLocations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  // Create location
  app.post("/api/locations", authMiddleware, requireRole("owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const location = await storage.createLocation({ ...req.body, academyId });
      res.status(201).json(location);
    } catch (error) {
      console.error("Error creating location:", error);
      res.status(500).json({ error: "Failed to create location" });
    }
  });

  // Get all courts
  app.get("/api/courts", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const { locationId } = req.query;
      if (locationId) {
        const locationCourts = await storage.getCourtsByLocation(locationId as string, academyId ?? undefined);
        return res.json(locationCourts);
      }
      const allCourts = await storage.getAllCourts(academyId ?? undefined);
      res.json(allCourts);
    } catch (error) {
      console.error("Error fetching courts:", error);
      res.status(500).json({ error: "Failed to fetch courts" });
    }
  });

  // Create court
  app.post("/api/courts", authMiddleware, requireRole("owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const court = await storage.createCourt({ ...req.body, academyId });
      res.status(201).json(court);
    } catch (error) {
      console.error("Error creating court:", error);
      res.status(500).json({ error: "Failed to create court" });
    }
  });

  // Update court
  app.patch("/api/courts/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validateCourtOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Court not found" });
      }
      
      const court = await storage.updateCourt(id, req.body, academyId ?? undefined);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      res.json(court);
    } catch (error) {
      console.error("Error updating court:", error);
      res.status(500).json({ error: "Failed to update court" });
    }
  });

  // Delete court
  app.delete("/api/courts/:id", authMiddleware, requireRole("owner"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validateCourtOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Court not found" });
      }
      
      await storage.deleteCourt(id, academyId ?? undefined);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting court:", error);
      res.status(500).json({ error: "Failed to delete court" });
    }
  });

  // Get all players with last lesson date
  app.get("/api/players", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const { search } = req.query;
      let playerList;
      if (search) {
        playerList = await storage.searchPlayers(search as string, academyId ?? undefined);
      } else {
        playerList = await storage.getAllPlayers(academyId ?? undefined);
      }
      
      // Enhance each player with their last lesson date
      const playersWithLessonDates = await Promise.all(
        playerList.map(async (player) => {
          const lastLesson = await storage.getPlayerLastSession(player.id);
          return {
            ...player,
            lastLessonDate: lastLesson?.startTime || null,
          };
        })
      );
      
      res.json(playersWithLessonDates);
    } catch (error) {
      console.error("Error fetching players:", error);
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  // Create player
  app.post("/api/players", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId;
      const player = await storage.createPlayer({ ...req.body, academyId });
      res.status(201).json(player);
    } catch (error) {
      console.error("Error creating player:", error);
      res.status(500).json({ error: "Failed to create player" });
    }
  });

  // ===================== PACKAGES / CREDITS =====================
  app.get("/api/players/:playerId/packages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const pkgs = await storage.getPlayerPackages(playerId);
      res.json(pkgs);
    } catch (error) {
      console.error("Error fetching packages:", error);
      res.status(500).json({ error: "Failed to fetch packages" });
    }
  });

  app.get("/api/players/:playerId/packages/active", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const pkgs = await storage.getActivePlayerPackages(playerId);
      res.json(pkgs);
    } catch (error) {
      console.error("Error fetching active packages:", error);
      res.status(500).json({ error: "Failed to fetch active packages" });
    }
  });

  app.post("/api/packages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, totalCredits, remainingCredits, expiryDate } = req.body;
      const academyId = req.user!.academyId;
      
      if (!playerId || totalCredits === undefined) {
        return res.status(400).json({ error: "playerId and totalCredits are required" });
      }
      
      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const pkg = await storage.createPackage({
        playerId,
        totalCredits,
        remainingCredits: remainingCredits ?? totalCredits,
        expiryDate: expiryDate || null,
      });
      res.status(201).json(pkg);
    } catch (error) {
      console.error("Error creating package:", error);
      res.status(500).json({ error: "Failed to create package" });
    }
  });

  app.patch("/api/packages/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePackageOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Package not found" });
      }
      
      const pkg = await storage.updatePackage(id, req.body, academyId ?? undefined);
      if (!pkg) {
        return res.status(404).json({ error: "Package not found" });
      }
      res.json(pkg);
    } catch (error) {
      console.error("Error updating package:", error);
      res.status(500).json({ error: "Failed to update package" });
    }
  });

  app.delete("/api/packages/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePackageOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Package not found" });
      }
      
      await storage.deletePackage(id, academyId ?? undefined);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting package:", error);
      res.status(500).json({ error: "Failed to delete package" });
    }
  });

  app.post("/api/packages/:id/use", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePackageOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Package not found" });
      }
      
      const pkg = await storage.usePackageCredit(id, academyId ?? undefined);
      if (!pkg) {
        return res.status(400).json({ error: "No credits remaining or package not found" });
      }
      res.json(pkg);
    } catch (error) {
      console.error("Error using package credit:", error);
      res.status(500).json({ error: "Failed to use package credit" });
    }
  });

  // Get single session with players
  app.get("/api/coach/sessions/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid, session } = await validateSessionOwnership(id, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const players = await storage.getSessionPlayers(id);
      res.json({ ...session, players });
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });
  
  // Update session (for drag-and-drop reschedule)
  app.patch("/api/sessions/:sessionId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { startTime, endTime, courtId } = req.body;
      const academyId = req.user!.academyId;
      
      const { valid, session } = await validateSessionOwnership(sessionId, academyId, storage);
      if (!valid || !session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const updateData: Record<string, any> = {};
      if (startTime) updateData.startTime = startTime;
      if (endTime) updateData.endTime = endTime;
      if (courtId !== undefined) updateData.courtId = courtId;
      
      const updatedSession = await storage.updateSession(sessionId, updateData);
      res.json(updatedSession);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  // ==================== PLAYER NOTES (COACH MEMORY HUB) ====================

  // Get notes for a player
  app.get("/api/players/:id/notes", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const notes = await storage.getPlayerNotes(id, academyId);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching player notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Add a note for a player
  app.post("/api/players/:id/notes", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      const { content, category, sessionId } = req.body;
      
      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Content is required" });
      }

      if (!id) {
        return res.status(400).json({ error: "Player ID is required" });
      }

      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }

      const note = await storage.createPlayerNote({
        playerId: id,
        coachId: coachId || null,
        content: content.trim(),
        category: category || "general",
        sessionId: sessionId || null,
        isPinned: false,
      });
      res.status(201).json(note);
    } catch (error) {
      console.error("Error creating player note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Delete a player note
  app.delete("/api/players/:playerId/notes/:noteId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, noteId } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      await storage.deletePlayerNote(noteId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting player note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Toggle note pin
  app.patch("/api/players/:playerId/notes/:noteId/pin", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, noteId } = req.params;
      const { isPinned } = req.body;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(playerId, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const note = await storage.toggleNotePin(noteId, isPinned);
      res.json(note);
    } catch (error) {
      console.error("Error toggling note pin:", error);
      res.status(500).json({ error: "Failed to toggle pin" });
    }
  });

  // ==================== PLAYER PROGRESS ====================

  // Get progress history for a player
  app.get("/api/players/:id/progress", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const progress = await storage.getPlayerProgress(id, academyId);
      res.json(progress);
    } catch (error) {
      console.error("Error fetching player progress:", error);
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  });

  // Get progress summary for a player (aggregated by skill area)
  app.get("/api/players/:id/progress/summary", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const summary = await storage.getProgressSummary(id, academyId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching progress summary:", error);
      res.status(500).json({ error: "Failed to fetch progress summary" });
    }
  });

  // Add progress entry for a player
  app.post("/api/players/:id/progress", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const academyId = req.user!.academyId;
      const { skillArea, rating, trend, notes, sessionId } = req.body;
      
      if (!skillArea) {
        return res.status(400).json({ error: "Skill area is required" });
      }

      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }

      const progress = await storage.createPlayerProgress({
        playerId: id,
        coachId,
        sessionId,
        skillArea,
        rating,
        trend: trend || "stable",
        notes,
      });
      res.status(201).json(progress);
    } catch (error) {
      console.error("Error creating player progress:", error);
      res.status(500).json({ error: "Failed to create progress" });
    }
  });

  // Get all players with their progress summary (for coaching dashboard)
  app.get("/api/coach/players/progress", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const allPlayers = await storage.getAllPlayers();
      const playersWithProgress = await Promise.all(
        allPlayers.map(async (player) => {
          const summary = await storage.getProgressSummary(player.id, player.academyId || undefined);
          const notes = await storage.getPlayerNotes(player.id, player.academyId || undefined);
          const totalXp = await storage.getPlayerTotalXp(player.id, player.academyId || undefined);
          const pinnedNotes = notes.filter(n => n.isPinned);
          const recentNote = notes[0];
          return {
            ...player,
            progressSummary: summary,
            pinnedNotes,
            recentNote,
            totalNotes: notes.length,
            totalXp,
          };
        })
      );
      res.json(playersWithProgress);
    } catch (error) {
      console.error("Error fetching players with progress:", error);
      res.status(500).json({ error: "Failed to fetch players with progress" });
    }
  });

  // ==================== SESSION TEMPLATES API ====================

  // Get all session templates for a coach
  app.get("/api/coach/templates", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "coachId is required" });
      }
      const templates = await storage.getSessionTemplates(coachId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Create a session template
  app.post("/api/coach/templates", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const { name, sessionType, duration, ballLevel, skillLevel, defaultPlayerIds, notes } = req.body;
      
      if (!coachId || !name || !sessionType || !duration) {
        return res.status(400).json({ error: "name, sessionType, and duration are required" });
      }

      const template = await storage.createSessionTemplate({
        coachId,
        name,
        sessionType,
        duration,
        ballLevel,
        skillLevel,
        defaultPlayerIds,
        notes,
      });
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  // Delete a session template
  app.delete("/api/coach/templates/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteSessionTemplate(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // ==================== NOTIFICATIONS API ====================

  // Get notifications for a coach
  app.get("/api/coach/notifications", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "coachId is required" });
      }
      const notifications = await storage.getCoachNotifications(coachId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Mark notification as read
  app.patch("/api/coach/notifications/:id/read", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const { valid } = await validateNotificationOwnership(id, coachId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      await storage.markNotificationRead(id, coachId ?? undefined);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ error: "Failed to mark notification read" });
    }
  });

  // Mark all notifications as read
  app.post("/api/coach/notifications/mark-all-read", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "coachId is required" });
      }
      await storage.markAllNotificationsRead(coachId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications read:", error);
      res.status(500).json({ error: "Failed to mark all notifications read" });
    }
  });

  // Delete notification
  app.delete("/api/coach/notifications/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      const { valid } = await validateNotificationOwnership(id, coachId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      await storage.deleteNotification(id, coachId ?? undefined);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  // Get auto-renew alerts (sessions near week 9/10)
  app.get("/api/coach/auto-renew-alerts", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(400).json({ error: "coachId is required" });
      }
      const alerts = await storage.getAutoRenewAlerts(coachId);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching auto-renew alerts:", error);
      res.status(500).json({ error: "Failed to fetch auto-renew alerts" });
    }
  });

  // ==================== COACH PROFILE API ====================

  // Get coach profile
  app.get("/api/coach/profile/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coach = await storage.getCoach(id);
      if (!coach) {
        return res.status(404).json({ error: "Coach not found" });
      }
      res.json(coach);
    } catch (error) {
      console.error("Error fetching coach profile:", error);
      res.status(500).json({ error: "Failed to fetch coach profile" });
    }
  });

  // Update coach profile
  app.patch("/api/coach/profile/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const updated = await storage.updateCoach(id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating coach profile:", error);
      res.status(500).json({ error: "Failed to update coach profile" });
    }
  });

  // ==================== COACH XP SYSTEM ====================

  // Get coach XP and level
  app.get("/api/coach/:id/xp", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coach = await storage.getCoach(id);
      if (!coach) {
        return res.status(404).json({ error: "Coach not found" });
      }
      
      const totalXp = coach.totalXp || 0;
      const level = coach.level || 1;
      
      // Calculate XP thresholds using same logic as POST (level up loop)
      // Each level requires: 500 + (level-1) * 100 XP
      // Level 1->2: 500 XP, Level 2->3: 600 XP, Level 3->4: 700 XP, etc.
      let accumulatedXp = 0;
      for (let lvl = 1; lvl < level; lvl++) {
        accumulatedXp += 500 + (lvl - 1) * 100;
      }
      const xpForCurrentLevel = accumulatedXp;
      const requiredForLevel = 500 + (level - 1) * 100;
      const currentLevelXp = Math.max(0, totalXp - xpForCurrentLevel);
      const xpPercent = Math.min(100, Math.max(0, Math.round((currentLevelXp / requiredForLevel) * 100)));
      
      // Get recent transactions
      const transactions = await storage.getCoachXpTransactions(id, 10);
      
      res.json({
        level,
        totalXp,
        currentLevelXp,
        requiredForLevel,
        xpPercent,
        transactions,
      });
    } catch (error) {
      console.error("Error fetching coach XP:", error);
      res.status(500).json({ error: "Failed to fetch coach XP" });
    }
  });

  // Award coach XP (internal endpoint for session completion, feedback, etc.)
  app.post("/api/coach/:id/xp", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { xpAmount, source, description, sessionId, metadata } = req.body;
      
      if (!xpAmount || !source) {
        return res.status(400).json({ error: "xpAmount and source are required" });
      }
      
      // Add XP transaction
      await storage.addCoachXpTransaction({
        coachId: id,
        xpAmount,
        source,
        description,
        sessionId,
        metadata,
      });
      
      // Update coach total XP and check for level up
      const coach = await storage.getCoach(id);
      if (coach) {
        const newTotalXp = (coach.totalXp || 0) + xpAmount;
        
        // Calculate new level
        let newLevel = 1;
        let xpThreshold = 500;
        let accumulatedXp = 0;
        while (accumulatedXp + xpThreshold <= newTotalXp) {
          accumulatedXp += xpThreshold;
          newLevel++;
          xpThreshold = 500 + (newLevel - 1) * 100;
        }
        
        await storage.updateCoach(id, { totalXp: newTotalXp, level: newLevel });
        
        res.json({
          success: true,
          newTotalXp,
          newLevel,
          leveledUp: newLevel > (coach.level || 1),
        });
      } else {
        res.status(404).json({ error: "Coach not found" });
      }
    } catch (error) {
      console.error("Error awarding coach XP:", error);
      res.status(500).json({ error: "Failed to award coach XP" });
    }
  });

  // Get coach stats (sessions count, players count, streak)
  app.get("/api/coach/:id/stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      // Get all sessions for this coach
      const allSessions = await storage.getAllSessionsByCoach(id);
      const completedSessions = allSessions.filter(s => s.status === "completed");
      
      // Get unique player count from session players (parallel fetch for efficiency)
      const playerIds = new Set<string>();
      const sessionPlayerResults = await Promise.all(
        allSessions.map(session => storage.getSessionPlayers(session.id))
      );
      sessionPlayerResults.flat().forEach(sp => {
        if (sp.playerId) playerIds.add(sp.playerId);
      });
      
      // Calculate streak (consecutive days with completed sessions)
      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const sortedSessions = completedSessions
        .filter(s => new Date(s.startTime) <= today)
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
      
      if (sortedSessions.length > 0) {
        let checkDate = new Date(today);
        const sessionDates = new Set(sortedSessions.map(s => {
          const d = new Date(s.startTime);
          d.setHours(0, 0, 0, 0);
          return d.getTime();
        }));
        
        while (sessionDates.has(checkDate.getTime())) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        }
      }
      
      res.json({
        sessionsCount: completedSessions.length,
        playersCount: playerIds.size,
        streak,
        totalSessionsScheduled: allSessions.length,
      });
    } catch (error) {
      console.error("Error fetching coach stats:", error);
      res.status(500).json({ error: "Failed to fetch coach stats" });
    }
  });

  // ==================== PROGRESS ENGINE V2 API ====================

  // Get all skill domains
  app.get("/api/progress/domains", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Seed domains if not present
      await storage.seedSkillDomains();
      const domains = await storage.getAllSkillDomains();
      res.json(domains);
    } catch (error) {
      console.error("Error fetching skill domains:", error);
      res.status(500).json({ error: "Failed to fetch skill domains" });
    }
  });

  // Get player skill states (current progress per domain)
  app.get("/api/players/:id/skill-state", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      // Initialize skill states if not present
      await storage.seedSkillDomains();
      await storage.initializePlayerSkillStates(id);
      
      const states = await storage.getPlayerSkillStates(id, academyId);
      const domains = await storage.getAllSkillDomains();
      
      // Merge domain info with state
      const statesWithDomains = states.map(state => {
        const domain = domains.find(d => d.id === state.domainId);
        return {
          ...state,
          domain: domain || null,
        };
      });
      
      res.json(statesWithDomains);
    } catch (error) {
      console.error("Error fetching player skill states:", error);
      res.status(500).json({ error: "Failed to fetch skill states" });
    }
  });

  // Submit skill observations for a session
  app.post("/api/coach/sessions/:sessionId/observations", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const coachId = req.user!.coachId;
      const { playerId, observations } = req.body;
      // observations: [{ domainId, direction: 'up'|'stable'|'down', effortLevel: 'high'|'normal'|'low', note? }]

      if (!playerId || !coachId || !observations || !Array.isArray(observations)) {
        return res.status(400).json({ error: "playerId and observations array required" });
      }

      const results = [];
      let skillImprovementXp = 0;
      const effortLevels: string[] = [];

      // Count observations per session for diminishing returns
      const observationCounts: Record<string, number> = {};
      
      // Track sessions with downs for down-guard (per session basis)
      const recentDownSessions = await storage.getRecentDownSessionsForPlayer(playerId, 3);
      
      // Track if we've already applied a down in this session
      let downAppliedThisSession = false;

      for (const obs of observations) {
        const { domainId, direction, effortLevel, note } = obs;
        
        // Track effort levels (we'll use average for session XP)
        effortLevels.push(effortLevel);
        
        // Get current state
        const currentState = await storage.getPlayerSkillState(playerId, domainId);
        
        // Calculate diminishing return factor
        const countKey = `${sessionId}-${playerId}-${domainId}`;
        observationCounts[countKey] = (observationCounts[countKey] || 0) + 1;
        const obsCount = observationCounts[countKey];
        const diminishingFactors = [1.0, 0.7, 0.5, 0.3, 0.3];
        const diminishingFactor = diminishingFactors[Math.min(obsCount - 1, 4)];

        // Calculate raw delta
        let rawDelta = 0;
        if (direction === "up") rawDelta = 5;
        else if (direction === "down") rawDelta = -3;
        // stable = 0

        // Calculate effort multiplier for this observation's delta
        let effortMultiplier = 1.0;
        if (effortLevel === "high") effortMultiplier = 1.2;
        else if (effortLevel === "low") effortMultiplier = 0.8;

        // Check for down-guard (max 1 effective down per 3 sessions - on session basis)
        let wasDownGuarded = false;
        if (direction === "down") {
          // Check if we already have a down in last 3 sessions OR already applied one this session
          const hasRecentDown = recentDownSessions.length >= 1 && !recentDownSessions.includes(sessionId);
          if (hasRecentDown || downAppliedThisSession) {
            wasDownGuarded = true;
            rawDelta = 0; // Convert to stable
          } else {
            // This is the first down in this session and no recent down sessions
            downAppliedThisSession = true;
          }
        }

        // Check cooldown (if up was given recently, reduce impact)
        let wasCooldownApplied = false;
        if (direction === "up" && currentState?.lastUpDate) {
          const hoursSinceLastUp = (Date.now() - new Date(currentState.lastUpDate).getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastUp < 48) { // Within 48 hours
            wasCooldownApplied = true;
            rawDelta = Math.round(rawDelta * 0.5);
          }
        }

        // Calculate applied delta
        let appliedDelta = Math.round(rawDelta * effortMultiplier * diminishingFactor);

        // Confidence guard: prevent hard drops
        if (appliedDelta < 0 && currentState?.confidenceScore && currentState.confidenceScore < 30) {
          appliedDelta = 0; // Don't allow drops when confidence is low
        }

        // Create observation record
        const observation = await storage.createSkillObservation({
          sessionId,
          playerId,
          coachId,
          domainId,
          direction,
          effortLevel,
          note,
          rawDelta,
          appliedDelta,
          wasDownGuarded,
          wasCooldownApplied,
          diminishingReturnFactor: String(diminishingFactor),
        });
        results.push(observation);

        // Update player skill state
        const newProgressValue = Math.max(0, Math.min(100, (currentState?.progressValue || 0) + appliedDelta));
        
        // Calculate new trend based on recent observations
        const recentObs = await storage.getPlayerRecentObservations(playerId, 5);
        const domainObs = recentObs.filter(o => o.domainId === domainId);
        const upCount = domainObs.filter(o => o.direction === "up").length;
        const downCount = domainObs.filter(o => o.direction === "down").length;
        
        let newTrend = "stable";
        if (upCount >= 3) newTrend = "improving";
        else if (downCount >= 2) newTrend = "focus";

        // Calculate momentum
        let newMomentum = "building";
        if (upCount >= 4) newMomentum = "strong";
        else if (downCount >= 2 || (upCount === 0 && domainObs.length >= 3)) newMomentum = "slowing";

        // Update confidence score
        let newConfidence = currentState?.confidenceScore || 50;
        if (direction === "up") newConfidence = Math.min(100, newConfidence + 5);
        else if (direction === "down") newConfidence = Math.max(0, newConfidence - 3);

        await storage.upsertPlayerSkillState({
          playerId,
          domainId,
          progressValue: newProgressValue,
          trend: newTrend,
          momentum: newMomentum,
          confidenceScore: newConfidence,
          lastUpDate: direction === "up" ? new Date() : currentState?.lastUpDate || undefined,
          upCountRecent: direction === "up" ? (currentState?.upCountRecent || 0) + 1 : currentState?.upCountRecent || 0,
          downCountRecent: direction === "down" ? (currentState?.downCountRecent || 0) + 1 : currentState?.downCountRecent || 0,
        });

        // Calculate skill improvement XP bonus (per upward observation)
        if (direction === "up") {
          skillImprovementXp += 5;
        }
      }

      // Calculate session effort multiplier based on most common effort level
      const effortCounts = { high: 0, normal: 0, low: 0 };
      for (const level of effortLevels) {
        if (level === "high") effortCounts.high++;
        else if (level === "low") effortCounts.low++;
        else effortCounts.normal++;
      }
      
      // Use the most frequent effort level for session XP
      let sessionEffortMultiplier = 1.0;
      if (effortCounts.high >= effortCounts.normal && effortCounts.high >= effortCounts.low) {
        sessionEffortMultiplier = 1.2;
      } else if (effortCounts.low >= effortCounts.normal && effortCounts.low >= effortCounts.high) {
        sessionEffortMultiplier = 0.8;
      }
      
      // Calculate total XP: Base 10 per session (once) + effort multiplier + skill improvement bonuses
      const baseSessionXp = Math.round(10 * sessionEffortMultiplier);
      const totalXpGained = baseSessionXp + skillImprovementXp;

      // Create XP transaction
      if (totalXpGained > 0) {
        await storage.createXpTransaction({
          playerId,
          sessionId,
          xpAmount: totalXpGained,
          source: "session",
          description: `Session: ${baseSessionXp} base + ${skillImprovementXp} skill bonus`,
        });
      }

      res.status(201).json({ 
        observations: results, 
        xpGained: totalXpGained,
        message: `${results.length} observations recorded` 
      });
    } catch (error) {
      console.error("Error creating skill observations:", error);
      res.status(500).json({ error: "Failed to create observations" });
    }
  });

  // Get session observations
  app.get("/api/coach/sessions/:sessionId/observations", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const observations = await storage.getSessionSkillObservations(sessionId);
      res.json(observations);
    } catch (error) {
      console.error("Error fetching session observations:", error);
      res.status(500).json({ error: "Failed to fetch observations" });
    }
  });

  // Create assessment for a player
  app.post("/api/players/:id/assessments", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const { domainId, status, notes, isBaseline } = req.body;

      if (!coachId || !domainId || !status) {
        return res.status(400).json({ error: "domainId and status required" });
      }

      // Get previous status
      const latestAssessment = await storage.getLatestAssessment(id, domainId);
      const previousStatus = latestAssessment?.status || null;

      const assessment = await storage.createAssessment({
        playerId: id,
        coachId,
        domainId,
        status,
        previousStatus,
        notes,
        isBaseline: isBaseline || !latestAssessment, // First assessment is always baseline
      });

      // Update player skill state with new assessment
      await storage.upsertPlayerSkillState({
        playerId: id,
        domainId,
        assessmentStatus: status,
        lastAssessmentDate: new Date(),
      });

      res.status(201).json(assessment);
    } catch (error) {
      console.error("Error creating assessment:", error);
      res.status(500).json({ error: "Failed to create assessment" });
    }
  });

  // Get player assessments
  app.get("/api/players/:id/assessments", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const assessments = await storage.getPlayerAssessments(id);
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      res.status(500).json({ error: "Failed to fetch assessments" });
    }
  });

  // Get level requirements
  app.get("/api/progress/levels", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requirements = await storage.getAllLevelRequirements();
      res.json(requirements);
    } catch (error) {
      console.error("Error fetching level requirements:", error);
      res.status(500).json({ error: "Failed to fetch level requirements" });
    }
  });

  // Get level readiness for a player
  app.get("/api/players/:id/level-readiness/:level", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, level } = req.params;
      const readiness = await storage.calculatePlayerLevelReadiness(id, level);
      res.json(readiness);
    } catch (error) {
      console.error("Error calculating level readiness:", error);
      res.status(500).json({ error: "Failed to calculate level readiness" });
    }
  });

  // Get player XP and transactions
  app.get("/api/players/:id/xp", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const totalXp = await storage.getPlayerTotalXp(id, academyId);
      const transactions = await storage.getPlayerXpTransactions(id, 20, academyId);
      res.json({ totalXp, transactions });
    } catch (error) {
      console.error("Error fetching player XP:", error);
      res.status(500).json({ error: "Failed to fetch XP" });
    }
  });

  // Freeze/unfreeze player progress
  app.post("/api/players/:id/progress-freeze", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      const { freeze, reason } = req.body;

      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Player not found" });
      }

      const skillStates = await storage.getPlayerSkillStates(id, academyId);
      
      for (const state of skillStates) {
        await storage.upsertPlayerSkillState({
          playerId: id,
          domainId: state.domainId,
          isFrozen: freeze,
          freezeReason: freeze ? reason : null,
        });
      }

      res.json({ success: true, frozen: freeze, reason });
    } catch (error) {
      console.error("Error updating progress freeze:", error);
      res.status(500).json({ error: "Failed to update progress freeze" });
    }
  });

  // ==================== GLOW CHAT API ====================
  
  // Get all conversations for a coach
  app.get("/api/coaches/:id/conversations", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      
      // Verify the authenticated coach is requesting their own conversations
      if (id !== coachId) {
        return res.status(404).json({ error: "Conversations not found" });
      }
      
      const conversations = await storage.getConversationsForCoach(id);
      
      // Enrich with participant info
      const enriched = await Promise.all(
        conversations.map(async (conv) => {
          const participants = await storage.getConversationParticipants(conv.id, coachId!);
          
          // Get player name for conversations with a player
          let playerName = null;
          if (conv.playerId) {
            const player = await storage.getPlayer(conv.playerId);
            playerName = player?.name;
          }
          
          return { ...conv, participants, playerName };
        })
      );
      
      // Add sample conversations for different types if they don't exist
      const hasAcademy = enriched.some(c => c.type === "academy");
      const hasAdmin = enriched.some(c => c.type === "admin");
      const hasSquad = enriched.some(c => c.type === "squad");
      const hasCoachCoach = enriched.some(c => c.type === "coach_coach");
      
      const sampleConversations: any[] = [];
      
      if (!hasAcademy) {
        sampleConversations.push({
          id: "sample-academy",
          type: "academy",
          title: "Academy Announcements",
          playerId: null,
          coachId: id,
          lastMessageAt: new Date().toISOString(),
          lastMessagePreview: "Welcome to the winter training program!",
          isArchived: false,
          participants: [],
          playerName: null,
        });
      }
      
      if (!hasAdmin) {
        sampleConversations.push({
          id: "sample-admin",
          type: "admin",
          title: "Staff Chat",
          playerId: null,
          coachId: id,
          lastMessageAt: new Date().toISOString(),
          lastMessagePreview: "Court 3 maintenance scheduled for tomorrow",
          isArchived: false,
          participants: [],
          playerName: null,
        });
      }
      
      if (!hasSquad) {
        sampleConversations.push({
          id: "sample-squad-1",
          type: "squad",
          title: "Red 2 Squad",
          playerId: null,
          coachId: id,
          lastMessageAt: new Date().toISOString(),
          lastMessagePreview: "Great practice today everyone!",
          isArchived: false,
          participants: [],
          playerName: null,
        });
      }
      
      if (!hasCoachCoach) {
        sampleConversations.push({
          id: "sample-coach-maria",
          type: "coach_coach",
          title: "Coach Maria",
          playerId: null,
          coachId: id,
          lastMessageAt: new Date().toISOString(),
          lastMessagePreview: "Did you see the new training schedule?",
          isArchived: false,
          participants: [],
          playerName: null,
        });
      }
      
      res.json([...enriched, ...sampleConversations]);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get all conversations for a player
  app.get("/api/players/:id/conversations", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const academyId = req.user!.academyId;
      
      // Verify player belongs to this academy
      const { valid } = await validatePlayerOwnership(id, academyId, storage);
      if (!valid) {
        return res.status(404).json({ error: "Conversations not found" });
      }
      
      const conversations = await storage.getConversationsForPlayer(id);
      
      // Enrich with coach name
      const enriched = await Promise.all(
        conversations.map(async (conv) => {
          let coachName = null;
          if (conv.coachId) {
            const coach = await storage.getCoach(conv.coachId);
            coachName = coach?.name;
          }
          return { ...conv, coachName };
        })
      );
      
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching player conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get or create a coach-player conversation
  app.post("/api/conversations/coach-player", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const { playerId } = req.body;
      
      if (!coachId || !playerId) {
        return res.status(400).json({ error: "playerId required" });
      }
      
      const conversation = await storage.getOrCreateCoachPlayerConversation(coachId!, playerId);
      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Create a new conversation
  app.post("/api/conversations", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const { type, playerId, title } = req.body;
      
      if (!type || !coachId) {
        return res.status(400).json({ error: "type required" });
      }
      
      // For coach_player type, use the existing method
      if (type === "coach_player" && playerId) {
        const conversation = await storage.getOrCreateCoachPlayerConversation(coachId!, playerId);
        return res.json(conversation);
      }
      
      // For other types, create a new conversation
      const conversation = await storage.createConversation({
        type,
        playerId: playerId || null,
        coachId,
        title: title || null,
      });
      
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Get all squads (hardcoded for now)
  app.get("/api/squads", authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const squads = [
        { id: "squad-red-1", name: "Red 1" },
        { id: "squad-red-2", name: "Red 2" },
        { id: "squad-orange-1", name: "Orange 1" },
        { id: "squad-orange-2", name: "Orange 2" },
        { id: "squad-yellow", name: "Yellow" },
        { id: "squad-green", name: "Green" },
      ];
      res.json(squads);
    } catch (error) {
      console.error("Error fetching squads:", error);
      res.status(500).json({ error: "Failed to fetch squads" });
    }
  });

  // Get messages for a conversation
  app.get("/api/conversations/:id/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const coachId = req.user!.coachId;
      const limit = parseInt(req.query.limit as string) || 50;
      
      // Handle sample conversations with sample messages
      if (id.startsWith("sample-")) {
        const sampleMessages = getSampleMessages(id);
        return res.json(sampleMessages);
      }
      
      // Verify coach has access to this conversation
      const conversation = await storage.getConversation(id, coachId ?? undefined);
      if (!conversation) {
        // Check if coach is a participant
        const participants = await storage.getConversationParticipants(id, coachId!);
        const isParticipant = participants.some(p => p.coachId === coachId);
        if (!isParticipant) {
          return res.status(404).json({ error: "Conversation not found" });
        }
      }
      
      const messages = await storage.getMessages(id, limit, coachId!);
      
      // Enrich with reactions
      const enriched = await Promise.all(
        messages.map(async (msg) => {
          const reactions = await storage.getMessageReactions(msg.id, coachId!);
          return { ...msg, reactions };
        })
      );
      
      res.json(enriched.reverse()); // Return oldest first for chat UI
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });
  
  // Helper function for sample messages
  function getSampleMessages(conversationId: string) {
    const now = new Date();
    const hour = 60 * 60 * 1000;
    
    if (conversationId === "sample-academy") {
      return [
        {
          id: "msg-academy-1",
          conversationId,
          senderType: "system",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Sarah M. leveled up to Level 3! Great progress in Technical skills.",
          messageType: "system",
          createdAt: new Date(now.getTime() - 3 * hour).toISOString(),
          reactions: [],
        },
        {
          id: "msg-academy-2",
          conversationId,
          senderType: "coach",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Welcome to the winter training program! Looking forward to an amazing season.",
          messageType: "text",
          createdAt: new Date(now.getTime() - 2 * hour).toISOString(),
          reactions: [],
        },
        {
          id: "msg-academy-3",
          conversationId,
          senderType: "system",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Jake T. earned the 'Rally Master' badge for 50+ consecutive serves!",
          messageType: "system",
          createdAt: new Date(now.getTime() - 1 * hour).toISOString(),
          reactions: [],
        },
        {
          id: "msg-academy-4",
          conversationId,
          senderType: "system",
          senderCoachId: null,
          senderPlayerId: null,
          body: "New weekly challenge: Complete 3 sessions this week for bonus XP!",
          messageType: "system",
          createdAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
          reactions: [],
        },
      ];
    }
    
    if (conversationId === "sample-admin") {
      return [
        {
          id: "msg-admin-1",
          conversationId,
          senderType: "coach",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Court 3 maintenance scheduled for tomorrow morning.",
          messageType: "text",
          createdAt: new Date(now.getTime() - 2 * hour).toISOString(),
          reactions: [],
        },
        {
          id: "msg-admin-2",
          conversationId,
          senderType: "coach",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Updated holiday schedule posted on the board.",
          messageType: "text",
          createdAt: new Date(now.getTime() - hour).toISOString(),
          reactions: [],
        },
      ];
    }
    
    if (conversationId === "sample-squad-1") {
      return [
        {
          id: "msg-squad-1",
          conversationId,
          senderType: "coach",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Great practice today everyone! See you Thursday.",
          messageType: "text",
          createdAt: new Date(now.getTime() - hour).toISOString(),
          reactions: [],
        },
      ];
    }
    
    if (conversationId === "sample-coach-maria") {
      return [
        {
          id: "msg-coach-1",
          conversationId,
          senderType: "coach",
          senderCoachId: null,
          senderPlayerId: null,
          body: "Did you see the new training schedule?",
          messageType: "text",
          createdAt: new Date(now.getTime() - hour).toISOString(),
          reactions: [],
        },
      ];
    }
    
    return [];
  }

  // Send a message
  app.post("/api/conversations/:id/messages", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: conversationId } = req.params;
      const coachId = req.user!.coachId;
      const { senderType, senderCoachId, senderPlayerId, body, messageType, replyToId } = req.body;
      
      if (!body || !senderType) {
        return res.status(400).json({ error: "body and senderType required" });
      }
      
      // Verify coach has access to this conversation
      const conversation = await storage.getConversation(conversationId, coachId ?? undefined);
      if (!conversation) {
        const participants = await storage.getConversationParticipants(conversationId, coachId!);
        const isParticipant = participants.some(p => p.coachId === coachId);
        if (!isParticipant) {
          return res.status(404).json({ error: "Conversation not found" });
        }
      }
      
      const message = await storage.createMessage({
        conversationId,
        senderType,
        senderCoachId: senderCoachId || null,
        senderPlayerId: senderPlayerId || null,
        body,
        messageType: messageType || "text",
        replyToId: replyToId || null,
      }, coachId!);
      
      if (!message) {
        return res.status(403).json({ error: "Access denied to conversation" });
      }
      
      // Award XP for coach sending messages (engagement)
      if (senderType === "coach" && senderCoachId) {
        await storage.addCoachXpTransaction({
          coachId: senderCoachId,
          xpAmount: 2, // Small XP for chat engagement
          source: "chat_message",
          description: "Sent a message to player",
        });
      }
      
      res.status(201).json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Mark conversation as read
  app.post("/api/conversations/:id/read", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: conversationId } = req.params;
      const { participantType, participantId } = req.body;
      
      await storage.updateParticipantLastRead(conversationId, participantType, participantId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking conversation read:", error);
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  // Add reaction to message
  app.post("/api/messages/:id/reactions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: messageId } = req.params;
      const coachId = req.user!.coachId;
      const { reactorType, reactorCoachId, reactorPlayerId, emoji } = req.body;
      
      if (!emoji || !reactorType) {
        return res.status(400).json({ error: "emoji and reactorType required" });
      }
      
      const reaction = await storage.addReaction({
        messageId,
        reactorType,
        reactorCoachId: reactorCoachId || null,
        reactorPlayerId: reactorPlayerId || null,
        emoji,
      }, coachId!);
      
      if (!reaction) {
        return res.status(403).json({ error: "Access denied to message" });
      }
      
      res.status(201).json(reaction);
    } catch (error) {
      console.error("Error adding reaction:", error);
      res.status(500).json({ error: "Failed to add reaction" });
    }
  });

  // Remove reaction from message
  app.delete("/api/messages/:id/reactions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id: messageId } = req.params;
      const coachId = req.user!.coachId;
      const { reactorType, reactorId, emoji } = req.body;
      
      const success = await storage.removeReaction(messageId, reactorType, reactorId, emoji, coachId!);
      if (!success) {
        return res.status(403).json({ error: "Access denied to message" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing reaction:", error);
      res.status(500).json({ error: "Failed to remove reaction" });
    }
  });

  // Get unread count for coach
  app.get("/api/coaches/:id/unread-count", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const count = await storage.getUnreadCountForCoach(id);
      res.json({ unreadCount: count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // Get unread count for player
  app.get("/api/players/:id/unread-count", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const count = await storage.getUnreadCountForPlayer(id);
      res.json({ unreadCount: count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
