import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  // ==================== COACH CALENDAR API ====================

  // Get calendar for a date range
  app.get("/api/coach/calendar", async (req: Request, res: Response) => {
    try {
      const { date, view = "day", coachId } = req.query;
      
      if (!date || !coachId) {
        return res.status(400).json({ error: "date and coachId are required" });
      }

      const targetDate = new Date(date as string);
      let startDate: Date;
      let endDate: Date;

      switch (view) {
        case "week":
          const dayOfWeek = targetDate.getDay();
          startDate = new Date(targetDate);
          startDate.setDate(targetDate.getDate() - dayOfWeek);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 7);
          break;
        case "month":
          startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
          endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);
          break;
        default: // day
          startDate = new Date(targetDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(targetDate);
          endDate.setHours(23, 59, 59, 999);
      }

      // Get own sessions (full data)
      const ownSessions = await storage.getSessionsByCoach(coachId as string, startDate, endDate);
      
      // Get blocked sessions (other coaches, no details)
      const blockedSessions = await storage.getBlockedSessions(coachId as string, startDate, endDate);
      const blockedSessionsMinimal = blockedSessions.map(s => ({
        id: s.id,
        courtId: s.courtId,
        startTime: s.startTime,
        endTime: s.endTime,
        blocked: true,
      }));

      // Get courts
      const courts = await storage.getAllCourts();
      const locations = await storage.getAllLocations();

      res.json({
        ownSessions,
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

  // Create session
  app.post("/api/coach/sessions", async (req: Request, res: Response) => {
    try {
      const {
        coachId,
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
      const coachConflict = await storage.checkCoachConflict(coachId, start, end);
      if (coachConflict) {
        return res.status(409).json({ 
          error: "Coach conflict", 
          level: 3,
          message: "Coach is already booked for this time slot" 
        });
      }

      const courtConflict = await storage.checkCourtConflict(courtId, start, end);
      if (courtConflict) {
        return res.status(409).json({ 
          error: "Court conflict", 
          level: 3,
          message: "Court is already booked for this time slot" 
        });
      }

      // Create session
      const session = await storage.createSession({
        coachId,
        courtId,
        locationId,
        startTime: start,
        endTime: end,
        duration,
        sessionType,
        ballLevel,
        skillLevel,
        isRecurring: weekCount && weekCount > 1,
        weekCount,
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

      // Audit log
      await storage.createAuditLog({
        entityType: "session",
        entityId: session.id,
        action: "create",
        performedBy: coachId,
      });

      res.status(201).json(session);
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Update session
  app.patch("/api/coach/sessions/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { coachId, ...updates } = req.body;

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

        const coachConflict = await storage.checkCoachConflict(coachId, start, end, id);
        if (coachConflict) {
          return res.status(409).json({ error: "Coach conflict", level: 3 });
        }

        const courtId = updates.courtId || session.courtId;
        const courtConflict = await storage.checkCourtConflict(courtId!, start, end, id);
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
        performedBy: coachId,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  // Cancel session
  app.post("/api/coach/sessions/:id/cancel", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { coachId, reason } = req.body;

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
        performedBy: coachId,
      });

      res.json(cancelled);
    } catch (error) {
      console.error("Error cancelling session:", error);
      res.status(500).json({ error: "Failed to cancel session" });
    }
  });

  // Extend session
  app.post("/api/coach/sessions/:id/extend", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { coachId, minutes } = req.body;

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

      // Check if extension causes conflict
      const coachConflict = await storage.checkCoachConflict(coachId, session.endTime, newEndTime, id);
      if (coachConflict) {
        return res.status(409).json({ error: "Cannot extend - coach has another session" });
      }

      const courtConflict = await storage.checkCourtConflict(session.courtId!, session.endTime, newEndTime, id);
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
  app.post("/api/coach/sessions/:id/players", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { playerId, isGuest } = req.body;

      const session = await storage.getSession(id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
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
  app.delete("/api/coach/sessions/:id/players/:playerId", async (req: Request, res: Response) => {
    try {
      const { id, playerId } = req.params;

      await storage.removePlayerFromSession(id, playerId);

      res.status(204).send();
    } catch (error) {
      console.error("Error removing player:", error);
      res.status(500).json({ error: "Failed to remove player" });
    }
  });

  // Get session players
  app.get("/api/coach/sessions/:id/players", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const players = await storage.getSessionPlayers(id);
      res.json(players);
    } catch (error) {
      console.error("Error fetching players:", error);
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  // Save attendance (offline-safe)
  app.post("/api/coach/sessions/:id/attendance", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { playerId, status, lateMinutes, absenceReason } = req.body;

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

  // Save feedback
  app.post("/api/coach/sessions/:id/feedback", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { intensity, mood, focusTags, coachNotes } = req.body;

      const feedback = await storage.createSessionFeedback({
        sessionId: id,
        intensity,
        mood,
        focusTags: JSON.stringify(focusTags),
        coachNotes,
      });

      res.status(201).json(feedback);
    } catch (error) {
      console.error("Error saving feedback:", error);
      res.status(500).json({ error: "Failed to save feedback" });
    }
  });

  // Offline sync
  app.post("/api/coach/offline/sync", async (req: Request, res: Response) => {
    try {
      const { coachId, actions } = req.body;

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
  app.post("/api/player/holidays", async (req: Request, res: Response) => {
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

  // ==================== ADMIN/SETUP ENDPOINTS ====================

  // Get all coaches
  app.get("/api/coaches", async (req: Request, res: Response) => {
    try {
      const allCoaches = await storage.getAllCoaches();
      res.json(allCoaches);
    } catch (error) {
      console.error("Error fetching coaches:", error);
      res.status(500).json({ error: "Failed to fetch coaches" });
    }
  });

  // Create coach
  app.post("/api/coaches", async (req: Request, res: Response) => {
    try {
      const coach = await storage.createCoach(req.body);
      res.status(201).json(coach);
    } catch (error) {
      console.error("Error creating coach:", error);
      res.status(500).json({ error: "Failed to create coach" });
    }
  });

  // Get all locations
  app.get("/api/locations", async (req: Request, res: Response) => {
    try {
      const allLocations = await storage.getAllLocations();
      res.json(allLocations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  });

  // Create location
  app.post("/api/locations", async (req: Request, res: Response) => {
    try {
      const location = await storage.createLocation(req.body);
      res.status(201).json(location);
    } catch (error) {
      console.error("Error creating location:", error);
      res.status(500).json({ error: "Failed to create location" });
    }
  });

  // Get all courts
  app.get("/api/courts", async (req: Request, res: Response) => {
    try {
      const { locationId } = req.query;
      if (locationId) {
        const locationCourts = await storage.getCourtsByLocation(locationId as string);
        return res.json(locationCourts);
      }
      const allCourts = await storage.getAllCourts();
      res.json(allCourts);
    } catch (error) {
      console.error("Error fetching courts:", error);
      res.status(500).json({ error: "Failed to fetch courts" });
    }
  });

  // Create court
  app.post("/api/courts", async (req: Request, res: Response) => {
    try {
      const court = await storage.createCourt(req.body);
      res.status(201).json(court);
    } catch (error) {
      console.error("Error creating court:", error);
      res.status(500).json({ error: "Failed to create court" });
    }
  });

  // Get all players
  app.get("/api/players", async (req: Request, res: Response) => {
    try {
      const { search } = req.query;
      if (search) {
        const foundPlayers = await storage.searchPlayers(search as string);
        return res.json(foundPlayers);
      }
      const allPlayers = await storage.getAllPlayers();
      res.json(allPlayers);
    } catch (error) {
      console.error("Error fetching players:", error);
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  // Create player
  app.post("/api/players", async (req: Request, res: Response) => {
    try {
      const player = await storage.createPlayer(req.body);
      res.status(201).json(player);
    } catch (error) {
      console.error("Error creating player:", error);
      res.status(500).json({ error: "Failed to create player" });
    }
  });

  // Get single session with players
  app.get("/api/coach/sessions/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const session = await storage.getSession(id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const players = await storage.getSessionPlayers(id);
      res.json({ ...session, players });
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
