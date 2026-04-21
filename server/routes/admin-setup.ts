import crypto from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
  import { db, pool } from "../db";
  import { storage } from "../storage";
  import {
    eq, sql, desc, and, ne, gt, gte, asc, inArray, notInArray,
    isNull, isNotNull, or, count, ilike, lte,
  } from "drizzle-orm";
  import {
    authMiddlewareWithFreshData as authMiddleware,
    requireRole,
    requireAcademy,
    requireFeatureUnlock,
    validatePlayerOwnership,
    validateCourtOwnership,
    validateSessionOwnership,
    validatePackageOwnership,
    validateNotificationOwnership,
    type AuthenticatedRequest,
  } from "../auth";
  import { z } from "zod";
  import { fromZodError } from "zod-validation-error";
  import { sanitizeNote, sanitizeMessage, sanitizeTemplateName, sanitizeTemplateContent } from "../utils/sanitize";
  import { deletePlayerWithUserWipe, wipeLinkedUserAfterMerge } from "../services/player-lifecycle";
  import { localTimeToUTC, utcToLocalTime, getTimezoneOffset, getFirstSessionDate, addDaysToLocalDate, getLocalDateParts, resolveLocalTimeToUTC, ensureResolvableLocalTime } from "../utils/timezone";
  import { apiCache, CACHE_KEYS, CACHE_TTL } from "../cache";
  import {
    users, coaches, players, academies, sessions, packages, coachingSeries, seriesPlayers,
    creditTransactions, invoices, payments, sessionPlayers, sessionWaitlist,
    locationTravelTimes, sessionFeedback, inSessionFeedback, sessionSkillObservations,
    sessionSkillFeedback, playerSessionCancellations, playerPillarProgress,
    coachXpTransactions, xpTransactions, playerBaselineSkillScores, playerBaselines,
    playerNotes, playerProgress, playerSubscriptions, playerLevelEvents,
    coachAvailability, availabilityExceptions, coachTimeBlocks, coachSettings,
    courtAvailability, courtAvailabilitySnapshots,
    bookingInvites, bookingInviteGuests, openMatches, openMatchSlots,
    matchRequests, playerBookingPreferences,
    courtBookings, matchLogs, playerCreditPackages, playerBallLevels,
    playerHolidays, coachWellnessLogs, insertCoachWellnessLogSchema,
    levelUpEvents, playerXpEvents, ballLevels, playerNotifications,
    spotlightNominations, spotlightWeeklyWinners, spotlightMonthlyWinners,
    posts as postsTable, postReactions as postReactionsTable,
    postComments as postCommentsTable, commentLikes as commentLikesTable,
    communityGroups as communityGroupsTable, groupMembers as groupMembersTable,
    openToPlay as openToPlayTable, userSocialProfiles as userSocialProfilesTable,
    questTemplates as questTemplatesTable, playerQuests as playerQuestsTable,
    dailyQuestSlots as dailyQuestSlotsTable, playerConnections,
    badges as badgesTable, playerBadges as playerBadgesTable,
    titles as titlesTable, playerTitles as playerTitlesTable,
    sessionPlans, providerInvites, serviceProviders, platformConfig, pushDeviceTokens,
    loginSchema, registerSchema, playerRegisterSchema, coachInviteRegisterSchema,
    academyApplicationInputSchema, insertSessionSchema, insertPlayerSchema, updatePlayerSchema,
    insertPackageSchema, insertPlayerNoteSchema, insertMessageSchema, insertMessageReactionSchema,
    submitReviewSchema,
  } from "@shared/schema";
  import { hashPassword, verifyPassword, generateToken } from "../auth";
  import { sendPlayerInviteEmail, sendWelcomeEmail } from "../emailService";
  import { sendPushNotification } from "../pushNotifications";
  import { awardXP } from "../services/xp-service";
  import { generateShortInviteCode } from "../utils/inviteCode";
  const router = Router();
  
  function parsePagination(query: { limit?: string; offset?: string; page?: string }) {
    const limit = Math.min(parseInt(query.limit as string) || 50, 100);
    const page = parseInt(query.page as string) || 1;
    const offset = query.offset ? parseInt(query.offset as string) : (page - 1) * limit;
    return { limit, offset };
  }
  function isBirthdayToday(dateOfBirth: string | Date | null): boolean {
    if (!dateOfBirth) return false;
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    return birthDate.getMonth() === today.getMonth() && birthDate.getDate() === today.getDate();
  }
    // ==================== ADMIN/SETUP ENDPOINTS ====================

  // Backfill debt transactions for past attended sessions
  // This creates debt records for players who attended sessions without credits
  router.post(
    "/api/admin/backfill-debts",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const role = req.user!.role;

        // Only allow academy owners and platform owners
        if (role !== "academy_owner" && role !== "platform_owner") {
          return res
            .status(403)
            .json({ error: "Only academy owners can run backfill" });
        }

        console.log(
          `[Backfill] Starting debt backfill for academy ${academyId}`,
        );
        const result = await storage.backfillDebtTransactions(academyId);

        res.json({
          success: true,
          message: `Backfill complete: ${result.debtsCreated} debts created, ${result.skipped} skipped`,
          ...result,
        });
      } catch (error) {
        console.error("Error running debt backfill:", error);
        res.status(500).json({ error: "Failed to run debt backfill" });
      }
    },
  );

  // Get all sessions for admin schedule
  router.get(
    "/api/sessions",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const role = req.user?.role;
        const academyId = req.user?.currentAcademyId;

        if (!academyId && role !== "platform_owner") {
          return res.status(403).json({ error: "Academy membership required" });
        }

        let allSessions;
        if (academyId) {
          allSessions = await storage.getSessionsByAcademy(academyId);
        } else {
          allSessions = [];
        }

        const sessionsWithPlayers = await Promise.all(
          allSessions.map(async (session) => {
            const players = await storage.getSessionPlayers(session.id);
            return {
              ...session,
              players: players.map((p: any) => ({ id: p.id, name: p.name })),
            };
          }),
        );

        res.json(sessionsWithPlayers);
      } catch (error) {
        console.error("Error fetching sessions:", error);
        res.status(500).json({ error: "Failed to fetch sessions" });
      }
    },
  );

  // Get all coaches
  router.get(
    "/api/coaches",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const role = req.user?.role;
        const academyId = req.user?.currentAcademyId;

        if (role !== "platform_owner" && !academyId) {
          return res.status(403).json({ error: "Academy membership required" });
        }

        if (!academyId) {
          return res.json([]);
        }

        const allCoaches = await storage.getAllCoaches(academyId);
        res.json(allCoaches);
      } catch (error) {
        console.error("Error fetching coaches:", error);
        res.status(500).json({ error: "Failed to fetch coaches" });
      }
    },
  );

  // Create coach
  router.post(
    "/api/coaches",
    authMiddleware,
    requireRole("academy_owner", "platform_owner", "admin"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        const { hourlyRate, ...coachData } = req.body;

        // Create the coach record (hourlyRate still saved on coach for backwards compatibility)
        const coach = await storage.createCoach({
          ...coachData,
          academyId,
          hourlyRate,
        });

        // Also create the academy membership with the hourly rate
        if (academyId) {
          await storage.createCoachMembership({
            coachId: coach.id,
            academyId,
            role: req.body.role || "coach",
            isActive: true,
            isPrimary: true,
            hourlyRate: hourlyRate ? String(hourlyRate) : undefined,
            sessionBillingMode: "academy_managed",
            payoutType: "per_hour",
          });
        }

        res.status(201).json(coach);
      } catch (error) {
        console.error("Error creating coach:", error);
        res.status(500).json({ error: "Failed to create coach" });
      }
    },
  );

  // Get all locations
  router.get(
    "/api/locations",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        const allLocations = await storage.getAllLocations(
          academyId ?? undefined,
        );
        res.json(allLocations);
      } catch (error) {
        console.error("Error fetching locations:", error);
        res.status(500).json({ error: "Failed to fetch locations" });
      }
    },
  );

  // Create location
  router.post(
    "/api/locations",
    authMiddleware,
    requireRole("academy_owner", "platform_owner", "admin"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        // Whitelist allowed fields — academyId is always forced from auth context
        const { name, address, city, country, mapUrl, notes, isActive } = req.body;
        const location = await storage.createLocation({
          name, address, city, country, mapUrl, notes, isActive,
          academyId,
        });
        res.status(201).json(location);
      } catch (error) {
        console.error("Error creating location:", error);
        res.status(500).json({ error: "Failed to create location" });
      }
    },
  );

  // Update location
  router.patch(
    "/api/locations/:id",
    authMiddleware,
    requireRole("academy_owner", "platform_owner", "admin", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;
        // Whitelist allowed fields — never permit academyId or id to be overwritten
        const { name, address, city, country, mapUrl, notes, isActive } = req.body;
        const allowedUpdates: Record<string, any> = {};
        if (name !== undefined) allowedUpdates.name = name;
        if (address !== undefined) allowedUpdates.address = address;
        if (city !== undefined) allowedUpdates.city = city;
        if (country !== undefined) allowedUpdates.country = country;
        if (mapUrl !== undefined) allowedUpdates.mapUrl = mapUrl;
        if (notes !== undefined) allowedUpdates.notes = notes;
        if (isActive !== undefined) allowedUpdates.isActive = isActive;
        const location = await storage.updateLocation(
          id,
          allowedUpdates,
          academyId ?? undefined,
        );
        if (!location) {
          return res.status(404).json({ error: "Location not found" });
        }
        res.json(location);
      } catch (error) {
        console.error("Error updating location:", error);
        res.status(500).json({ error: "Failed to update location" });
      }
    },
  );

  // Delete location
  router.delete(
    "/api/locations/:id",
    authMiddleware,
    requireRole("academy_owner", "platform_owner", "admin", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        // Check if location has courts
        const courtsAtLocation = await storage.getCourtsByLocation(
          id,
          academyId ?? undefined,
        );
        if (courtsAtLocation && courtsAtLocation.length > 0) {
          return res
            .status(400)
            .json({
              error:
                "Cannot delete location with courts. Move or delete courts first.",
            });
        }

        await storage.deleteLocation(id, academyId ?? undefined);
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting location:", error);
        res.status(500).json({ error: "Failed to delete location" });
      }
    },
  );

  // Get all courts
  router.get(
    "/api/courts",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        const { locationId } = req.query;
        if (locationId) {
          const locationCourts = await storage.getCourtsByLocation(
            locationId as string,
            academyId ?? undefined,
          );
          return res.json(locationCourts);
        }
        const allCourts = await storage.getAllCourts(academyId ?? undefined);
        res.json(allCourts);
      } catch (error) {
        console.error("Error fetching courts:", error);
        res.status(500).json({ error: "Failed to fetch courts" });
      }
    },
  );

  // Create court
  router.post(
    "/api/courts",
    authMiddleware,
    requireRole("academy_owner", "platform_owner", "admin", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const { name, sport } = req.body;
        if (!name || !name.trim()) {
          return res.status(400).json({ error: "Court name is required" });
        }

        const VALID_COURT_SPORTS = ["tennis", "padel", "pickleball", "multi"];
        if (sport && !VALID_COURT_SPORTS.includes(sport)) {
          return res.status(400).json({ error: `Invalid sport. Must be one of: ${VALID_COURT_SPORTS.join(", ")}` });
        }

        // Check for duplicate court name within academy
        const existingCourt = await storage.getCourtByName(
          name.trim(),
          academyId,
        );
        if (existingCourt) {
          return res
            .status(409)
            .json({ error: `A court named "${name.trim()}" already exists` });
        }

        const court = await storage.createCourt({
          ...req.body,
          name: name.trim(),
          academyId,
        });
        res.status(201).json(court);
      } catch (error) {
        console.error("Error creating court:", error);
        res.status(500).json({ error: "Failed to create court" });
      }
    },
  );

  // Update court
  router.patch(
    "/api/courts/:id",
    authMiddleware,
    requireRole("academy_owner", "platform_owner", "admin", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validateCourtOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Court not found" });
        }

        const VALID_COURT_SPORTS = ["tennis", "padel", "pickleball", "multi"];
        if (req.body.sport && !VALID_COURT_SPORTS.includes(req.body.sport)) {
          return res.status(400).json({ error: `Invalid sport. Must be one of: ${VALID_COURT_SPORTS.join(", ")}` });
        }

        const court = await storage.updateCourt(
          id,
          req.body,
          academyId ?? undefined,
        );
        if (!court) {
          return res.status(404).json({ error: "Court not found" });
        }
        res.json(court);
      } catch (error) {
        console.error("Error updating court:", error);
        res.status(500).json({ error: "Failed to update court" });
      }
    },
  );

  // Preview what deleting a court will do (hard vs soft)
  router.get(
    "/api/courts/:id/delete-preview",
    authMiddleware,
    requireRole("academy_owner", "platform_owner", "admin", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validateCourtOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Court not found" });
        }

        const dependents = await storage.getCourtDependents(id);
        const willArchive = dependents.total > 0;
        res.json({
          willArchive,
          dependents: dependents.counts,
          totalReferences: dependents.total,
        });
      } catch (error) {
        console.error("Error previewing court delete:", error);
        res.status(500).json({ error: "Failed to preview court deletion" });
      }
    },
  );

  // Delete court (hard delete if no history, soft delete/archive otherwise)
  router.delete(
    "/api/courts/:id",
    authMiddleware,
    requireRole("academy_owner", "platform_owner", "admin", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validateCourtOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Court not found" });
        }

        const dependents = await storage.getCourtDependents(id);

        if (dependents.total > 0) {
          // Soft delete: archive the court so historical records keep resolving
          const updated = await storage.softDeleteCourt(id, academyId ?? undefined);
          if (!updated) {
            return res.status(404).json({ error: "Court not found" });
          }
          return res.json({
            success: true,
            archived: true,
            dependents: dependents.counts,
            totalReferences: dependents.total,
            message: "Court has history and was archived instead of deleted.",
          });
        }

        try {
          await storage.deleteCourt(id, academyId ?? undefined);
        } catch (err) {
          // Foreign-key violations from tables we don't yet check explicitly
          const e = err as { code?: string; message?: string };
          const msg = String(e?.message ?? "");
          if (e?.code === "23503" || /foreign key|violates/i.test(msg)) {
            const recheck = await storage.getCourtDependents(id);
            const updated = await storage.softDeleteCourt(
              id,
              academyId ?? undefined,
            );
            if (!updated) {
              return res.status(409).json({
                error:
                  "Court is referenced by other records and could not be deleted or archived. Please remove the references first.",
                dependents: recheck.counts,
                totalReferences: recheck.total,
              });
            }
            return res.json({
              success: true,
              archived: true,
              dependents: recheck.counts,
              totalReferences: recheck.total,
              message:
                "Court is referenced by other records and was archived instead of deleted.",
            });
          }
          throw err;
        }

        res.json({ success: true, archived: false });
      } catch (error) {
        const e = error as { message?: string };
        console.error("Error deleting court:", error);
        res
          .status(500)
          .json({ error: e?.message || "Failed to delete court" });
      }
    },
  );

  // Resolve or auto-create a location from venue coordinates (for court linking)
  router.post(
    "/api/courts/resolve-location",
    authMiddleware,
    requireRole("academy_owner", "platform_owner", "admin", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const { lat, lng, name, address, placeId } = req.body;
        if (typeof lat !== "number" || typeof lng !== "number") {
          return res.status(400).json({ error: "lat and lng are required numbers" });
        }

        // Haversine distance in metres between two lat/lng points
        const haversineMetres = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
          const R = 6371000;
          const toRad = (d: number) => (d * Math.PI) / 180;
          const dLat = toRad(lat2 - lat1);
          const dLng = toRad(lng2 - lng1);
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };

        // Find the closest existing location for this academy within 200m
        const allLocations = await storage.getAllLocations(academyId);
        let nearby: typeof allLocations[number] | undefined;
        let nearbyDist = Infinity;
        for (const loc of allLocations) {
          if (loc.lat == null || loc.lng == null) continue;
          const dist = haversineMetres(lat, lng, loc.lat, loc.lng);
          if (dist <= 200 && dist < nearbyDist) {
            nearby = loc;
            nearbyDist = dist;
          }
        }

        if (nearby) {
          return res.json({
            locationId: nearby.id,
            locationName: nearby.name,
            isNew: false,
          });
        }

        // No existing location within 200m — create one
        const newLocation = await storage.createLocation({
          academyId,
          name: name || address || "Unnamed Venue",
          address: address || undefined,
          lat,
          lng,
          googlePlaceId: placeId || undefined,
          isActive: true,
        });

        return res.json({
          locationId: newLocation.id,
          locationName: newLocation.name,
          isNew: true,
        });
      } catch (error) {
        console.error("Error resolving location:", error);
        res.status(500).json({ error: "Failed to resolve location" });
      }
    },
  );

  // Reorder courts (update positions)
  router.post(
    "/api/courts/reorder",
    authMiddleware,
    requireRole("academy_owner", "platform_owner", "admin", "coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        if (!academyId) {
          return res.status(400).json({ error: "Academy ID required" });
        }

        const { courtIds } = req.body as { courtIds: string[] };
        if (!Array.isArray(courtIds) || courtIds.length === 0) {
          return res.status(400).json({ error: "courtIds array required" });
        }

        // Load academy's courts to validate all IDs belong to this academy
        const academyCourts = await storage.getAllCourts(academyId);
        const academyCourtIds = new Set(academyCourts.map((c) => c.id));

        // Validate all provided court IDs belong to this academy
        for (const courtId of courtIds) {
          if (!academyCourtIds.has(courtId)) {
            return res.status(403).json({ error: "Invalid court ID" });
          }
        }

        // Update each court's position based on index in array
        for (let i = 0; i < courtIds.length; i++) {
          await storage.updateCourt(courtIds[i], { position: i }, academyId);
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Error reordering courts:", error);
        res.status(500).json({ error: "Failed to reorder courts" });
      }
    },
  );

  // Get all players with last lesson date (supports optional pagination and credits)
  router.get(
    "/api/players",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const role = req.user?.role;
        const academyId = req.user?.currentAcademyId;

        if (role !== "platform_owner" && !academyId) {
          return res.status(403).json({ error: "Academy membership required" });
        }

        // Always filter by academyId if set, even for platform_owner
        // This ensures consistency with delete/edit operations that require academy membership
        const effectiveAcademyId = academyId || undefined;
        const { search, paginated, withCredits, status: statusFilter } = req.query;
        const usePagination = paginated === "true";
        const includeCredits = withCredits === "true";
        // status filter: "inactive" for past players, "active" for active (default), or undefined for all
        const playerStatusFilter = statusFilter as string | undefined;

        let playerList: any[];
        let total = 0;

        // Normalize status filter to a known value (push down into SQL where supported).
        const normalizedStatus: "active" | "inactive" | "pending_payment" | "all" =
          playerStatusFilter === "inactive"
            ? "inactive"
            : playerStatusFilter === "pending_payment"
              ? "pending_payment"
              : playerStatusFilter === "all"
                ? "all"
                : "active";

        if (usePagination) {
          const { limit, offset } = parsePagination(req.query as any);
          if (search) {
            const result = await storage.searchPlayersPaginated(
              search as string,
              limit,
              offset,
              effectiveAcademyId,
            );
            playerList = result.players;
            total = result.total;
          } else {
            const result = await storage.getAllPlayersPaginated(
              limit,
              offset,
              effectiveAcademyId,
            );
            playerList = result.players;
            total = result.total;
          }
          // Pagination paths still apply in-memory status filtering (legacy behavior).
          if (normalizedStatus === "inactive") {
            playerList = playerList.filter((p) => p.status === "inactive");
          } else if (normalizedStatus === "pending_payment") {
            playerList = playerList.filter((p) => p.status === "pending_payment");
          } else if (normalizedStatus === "active") {
            playerList = playerList.filter(
              (p) => p.status !== "inactive" && p.status !== "pending_payment"
            );
          }
        } else {
          // Backward compatible: return all players as array
          if (search) {
            playerList = await storage.searchPlayers(
              search as string,
              effectiveAcademyId,
            );
            if (normalizedStatus === "inactive") {
              playerList = playerList.filter((p) => p.status === "inactive");
            } else if (normalizedStatus === "pending_payment") {
              playerList = playerList.filter((p) => p.status === "pending_payment");
            } else if (normalizedStatus === "active") {
              playerList = playerList.filter(
                (p) => p.status !== "inactive" && p.status !== "pending_payment"
              );
            }
          } else if (includeCredits) {
            playerList = await storage.getAllPlayersWithCredits(
              effectiveAcademyId,
              normalizedStatus,
            );
          } else {
            playerList = await storage.getAllPlayers(effectiveAcademyId);
            if (normalizedStatus === "inactive") {
              playerList = playerList.filter((p) => p.status === "inactive");
            } else if (normalizedStatus === "pending_payment") {
              playerList = playerList.filter((p) => p.status === "pending_payment");
            } else if (normalizedStatus === "active") {
              playerList = playerList.filter(
                (p) => p.status !== "inactive" && p.status !== "pending_payment"
              );
            }
          }
        }

        // Batch fetch supplementary data for all players in PARALLEL.
        // Combine active+paused group counts into one query that groups by status.
        const playerIds = playerList.map((p) => p.id);
        const [lastLessonMap, groupRows] = await Promise.all([
          storage.getPlayersLastSessions(playerIds),
          playerIds.length > 0
            ? db
                .select({
                  playerId: seriesPlayers.playerId,
                  status: seriesPlayers.status,
                  cnt: count(),
                })
                .from(seriesPlayers)
                .innerJoin(
                  coachingSeries,
                  eq(seriesPlayers.seriesId, coachingSeries.id),
                )
                .where(
                  and(
                    inArray(seriesPlayers.playerId, playerIds),
                    inArray(seriesPlayers.status, ["active", "paused"]),
                    eq(coachingSeries.status, "active"),
                  ),
                )
                .groupBy(seriesPlayers.playerId, seriesPlayers.status)
            : Promise.resolve([] as Array<{ playerId: string | null; status: string | null; cnt: number }>),
        ]);

        const activeGroupMap = new Map<string, number>();
        const pausedGroupMap = new Map<string, number>();
        for (const row of groupRows) {
          if (!row.playerId) continue;
          if (row.status === "active") {
            activeGroupMap.set(row.playerId, Number(row.cnt));
          } else if (row.status === "paused") {
            pausedGroupMap.set(row.playerId, Number(row.cnt));
          }
        }

        // Map player data with last lesson dates and lesson-status fields
        const playersWithLessonDates = playerList.map((player) => ({
          ...player,
          lastLessonDate: lastLessonMap.get(player.id)?.startTime || null,
          activeGroupsCount: activeGroupMap.get(player.id) ?? 0,
          pausedGroupsCount: pausedGroupMap.get(player.id) ?? 0,
          // onHoliday: true if player status is "holiday" OR if paused in all their active series
          onHoliday:
            player.status === "holiday" ||
            ((pausedGroupMap.get(player.id) ?? 0) > 0 &&
              (activeGroupMap.get(player.id) ?? 0) === 0),
        }));

        if (usePagination) {
          const { limit, offset } = parsePagination(req.query as any);
          res.json({
            data: playersWithLessonDates,
            pagination: {
              total,
              limit,
              offset,
              hasMore: offset + playerList.length < total,
            },
          });
        } else {
          res.json(playersWithLessonDates);
        }
      } catch (error) {
        console.error("Error fetching players:", error);
        res.status(500).json({ error: "Failed to fetch players" });
      }
    },
  );

  // Create player
  router.post(
    "/api/players",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId;
        const player = await storage.createPlayer({ ...req.body, academyId });

        // Generate player invite code
        const inviteCode = generateShortInviteCode();
        const playerInvite = await storage.createPlayerInvite({
          playerId: player.id,
          academyId: academyId!,
          inviteCode,
          status: "pending",
          parentName: req.body.parentName || null,
          parentPhone: req.body.parentPhone || null,
          expiresAt: null, // No expiry for player invites
        });

        // Send invite email with code if player has email (non-blocking)
        if (player.email) {
          const academy = academyId
            ? await storage.getAcademy(academyId)
            : null;
          const coach = player.coachId
            ? await storage.getCoach(player.coachId)
            : null;
          const proto = req.header("x-forwarded-proto") || req.protocol || "https";
          const host = req.header("x-forwarded-host") || req.get("host") || "";
          const inviteLinkBaseUrl = `${proto}://${host}`;
          sendPlayerInviteEmail({
            to: player.email,
            playerName: player.name,
            academyName: academy?.name || "your academy",
            inviteCode,
            coachName: coach?.name,
            inviteLinkBaseUrl,
            theme: academy?.theme ?? null,
          }).catch((err) =>
            console.error("Failed to send player invite email:", err),
          );
        }

        // Return player with invite code
        res.status(201).json({
          ...player,
          inviteCode: playerInvite.inviteCode,
        });
      } catch (error) {
        console.error("Error creating player:", error);
        res.status(500).json({ error: "Failed to create player" });
      }
    },
  );

  // Get player invite link
  router.get(
    "/api/players/:id/invite",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        // Validate player ownership
        const { valid, player } = await validatePlayerOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid || !player) {
          return res.status(404).json({ error: "Player not found" });
        }

        // If the player has already completed onboarding they have signed up — no invite needed
        if (player.onboardingCompleted) {
          return res.json({ status: "claimed" });
        }

        // Check for existing invite
        let invite = await storage.getPlayerInviteByPlayerId(id);

        // If no pending invite exists, create one
        if (!invite) {
          const inviteCode = generateShortInviteCode();
          invite = await storage.createPlayerInvite({
            playerId: id,
            academyId: academyId!,
            inviteCode,
            status: "pending",
            expiresAt: null,
          });
        }

        res.json({
          inviteCode: invite.inviteCode,
          status: invite.status,
          createdAt: invite.createdAt,
        });
      } catch (error) {
        console.error("Error getting player invite:", error);
        res.status(500).json({ error: "Failed to get player invite" });
      }
    },
  );

  // Send invite email to player
  router.post(
    "/api/players/:id/send-invite-email",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid, player } = await validatePlayerOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid || !player) {
          return res.status(404).json({ error: "Player not found" });
        }

        if (!player.email) {
          return res.json({ success: true, sent: false, reason: "no_email" });
        }

        // Get or create invite code
        let invite = await storage.getPlayerInviteByPlayerId(id);
        if (!invite) {
          const inviteCode = generateShortInviteCode();
          invite = await storage.createPlayerInvite({
            playerId: id,
            academyId: academyId!,
            inviteCode,
            status: "pending",
            expiresAt: null,
          });
        }

        // Only send if invite is still pending (not already accepted/revoked)
        if (invite.status !== "pending") {
          return res.json({ success: true, sent: false, reason: "invite_not_pending" });
        }

        const academy = academyId ? await storage.getAcademy(academyId) : null;
        const coach = player.coachId
          ? await storage.getCoach(player.coachId)
          : null;

        const proto = req.header("x-forwarded-proto") || req.protocol || "https";
        const host = req.header("x-forwarded-host") || req.get("host") || "";
        const inviteLinkBaseUrl = `${proto}://${host}`;
        const result = await sendPlayerInviteEmail({
          to: player.email,
          playerName: player.name,
          academyName: academy?.name || "your academy",
          inviteCode: invite.inviteCode,
          coachName: coach?.name,
          inviteLinkBaseUrl,
          theme: academy?.theme ?? null,
        });

        if (!result.success) {
          console.error("[send-invite-email] Failed:", result.error);
          return res.status(500).json({ error: "Failed to send invite email" });
        }

        res.json({ success: true, sent: true, sentTo: player.email });
      } catch (error) {
        console.error("Error sending player invite email:", error);
        res.status(500).json({ error: "Failed to send invite email" });
      }
    },
  );

  // Regenerate player invite link
  router.post(
    "/api/players/:id/invite/regenerate",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        // Validate player ownership
        const { valid, player } = await validatePlayerOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid || !player) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Revoke existing pending invites
        const existingInvite = await storage.getPlayerInviteByPlayerId(id);
        if (existingInvite) {
          await storage.updatePlayerInvite(existingInvite.id, {
            status: "revoked",
          });
        }

        // Create new invite
        const inviteCode = generateShortInviteCode();
        const newInvite = await storage.createPlayerInvite({
          playerId: id,
          academyId: academyId!,
          inviteCode,
          status: "pending",
          expiresAt: null,
        });

        res.json({
          inviteCode: newInvite.inviteCode,
          status: newInvite.status,
          createdAt: newInvite.createdAt,
        });
      } catch (error) {
        console.error("Error regenerating player invite:", error);
        res.status(500).json({ error: "Failed to regenerate player invite" });
      }
    },
  );

  // Public preview endpoint — returns player name + academy name for a pending invite token
  router.get("/api/player-invites/:code/preview", async (req: Request, res: Response) => {
    try {
      const rawCode = req.params.code || "";
      const safeCode = rawCode.replace(/[^a-zA-Z0-9\-_]/g, "");
      if (!safeCode) {
        return res.status(400).json({ error: "Invalid invite code" });
      }

      const invite = await storage.getPlayerInvite(safeCode);
      if (!invite || invite.status !== "pending") {
        return res.status(404).json({ error: "Invite not found or already claimed" });
      }

      const player = await storage.getPlayer(invite.playerId);
      const academy = await storage.getAcademy(invite.academyId);

      return res.json({
        playerName: player?.name || "Player",
        academyName: academy?.name || "Academy",
        playerId: invite.playerId,
      });
    } catch (error) {
      console.error("[player-invites/preview] Error:", error);
      return res.status(500).json({ error: "Failed to fetch invite preview" });
    }
  });

  // Claim player invite (public endpoint for parents/players to link their account)
  router.post("/api/player-invite/claim", async (req: Request, res: Response) => {
    try {
      const { inviteCode, userId } = req.body;

      if (!inviteCode || !userId) {
        return res
          .status(400)
          .json({ error: "Invite code and user ID are required" });
      }

      const invite = await storage.getPlayerInvite(inviteCode);
      if (!invite) {
        return res.status(404).json({ error: "Invalid invite code" });
      }

      if (invite.status !== "pending") {
        return res
          .status(400)
          .json({ error: "This invite has already been claimed or expired" });
      }

      // Claim the invite
      const claimedInvite = await storage.claimPlayerInvite(inviteCode, userId);
      if (!claimedInvite) {
        return res.status(400).json({ error: "Failed to claim invite" });
      }

      // Get player details
      const player = await storage.getPlayer(invite.playerId);

      res.json({
        success: true,
        player: player ? { id: player.id, name: player.name } : null,
        academyId: invite.academyId,
      });
    } catch (error) {
      console.error("Error claiming player invite:", error);
      res.status(500).json({ error: "Failed to claim invite" });
    }
  });

  // Validate player invite (public endpoint to check if invite is valid)
  router.get("/api/player-invite/:code", async (req: Request, res: Response) => {
    try {
      const { code } = req.params;

      const invite = await storage.getPlayerInvite(code);
      if (!invite) {
        return res.status(404).json({ error: "Invalid invite code" });
      }

      // Get player and academy details
      const player = await storage.getPlayer(invite.playerId);
      const academy = await storage.getAcademy(invite.academyId);

      res.json({
        valid: invite.status === "pending",
        status: invite.status,
        playerName: player?.name || null,
        academyName: academy?.name || null,
      });
    } catch (error) {
      console.error("Error validating player invite:", error);
      res.status(500).json({ error: "Failed to validate invite" });
    }
  });

  // Get squad members (other players in same academy for private chat)
  router.get(
    "/api/players/squad-members",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user?.currentAcademyId;
        const playerId = req.user?.playerId;

        // If player doesn't have an academy yet, return empty array gracefully
        if (!academyId) {
          return res.json({ friends: [], pendingRequests: [] });
        }

        // Get all players in the same academy
        const allPlayers = await storage.getPlayersByAcademy(academyId);

        // Filter out current player and return basic info
        const squadMembers = allPlayers
          .filter((p: any) => p.id !== playerId)
          .map((p: any) => ({
            id: p.id,
            firstName: p.firstName || p.name?.split(" ")[0] || "Player",
            lastName: p.lastName || p.name?.split(" ").slice(1).join(" ") || "",
            profilePhotoUrl: p.profilePhotoUrl ?? null,
          }));

        res.json(squadMembers);
      } catch (error) {
        console.error("Error fetching squad members:", error);
        res.status(500).json({ error: "Failed to fetch squad members" });
      }
    },
  );

  // Get single player
  router.get(
    "/api/players/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid, player } = await validatePlayerOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid || !player) {
          return res.status(404).json({ error: "Player not found" });
        }

        res.json(player);
      } catch (error) {
        console.error("Error fetching player:", error);
        res.status(500).json({ error: "Failed to fetch player" });
      }
    },
  );

  // Update player
  router.patch(
    "/api/players/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Validate and transform the update data
        const parseResult = updatePlayerSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "Validation failed",
            details: fromZodError(parseResult.error).message,
          });
        }

        const updateData = { ...parseResult.data };
        // Recalculate age from dateOfBirth so subsequent session logic uses the correct age group
        if (updateData.dateOfBirth) {
          const birth = new Date(updateData.dateOfBirth);
          const now = new Date();
          let calculatedAge = now.getFullYear() - birth.getFullYear();
          const m = now.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) calculatedAge--;
          updateData.age = calculatedAge >= 0 ? calculatedAge : null;
        } else if (updateData.dateOfBirth === null) {
          // DOB explicitly cleared — clear derived age too to avoid stale values
          updateData.age = null;
        }

        const updated = await storage.updatePlayer(id, updateData);
        res.json(updated);
      } catch (error) {
        console.error("Error updating player:", error);
        res.status(500).json({ error: "Failed to update player" });
      }
    },
  );

  // Toggle audit verification for a player (coach marks player as reviewed)
  router.post(
    "/api/players/:id/audit-verify",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Check current audit status
        const player = await storage.getPlayer(id);
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }

        const isCurrentlyVerified = !!player.auditVerifiedAt;

        if (isCurrentlyVerified) {
          // Unverify
          await db.execute(sql`
          UPDATE players SET audit_verified_at = NULL, audit_verified_by = NULL WHERE id = ${id}
        `);
          res.json({
            auditVerified: false,
            auditVerifiedAt: null,
            auditVerifiedBy: null,
          });
        } else {
          // Verify
          const now = new Date();
          await db.execute(sql`
          UPDATE players SET audit_verified_at = ${now}, audit_verified_by = ${coachId} WHERE id = ${id}
        `);
          res.json({
            auditVerified: true,
            auditVerifiedAt: now.toISOString(),
            auditVerifiedBy: coachId,
          });
        }
      } catch (error) {
        console.error("Error toggling audit verification:", error);
        res.status(500).json({ error: "Failed to toggle audit verification" });
      }
    },
  );

  // Delete player (permanently removes all associated data)
  router.delete(
    "/api/players/:id",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const coachId = req.user!.coachId;
        const academyId = req.user!.academyId!;

        const result = await deletePlayerWithUserWipe(id, academyId);
        if (!result.deleted) {
          return res.status(404).json({ error: "Player not found" });
        }

        await storage.createAuditLog({
          entityType: "player",
          entityId: id,
          action: "delete",
          performedBy: coachId!,
          metadata: JSON.stringify({
            academyId,
            deletedAt: new Date().toISOString(),
            wipedUserIds: result.wipedUserIds,
            keptUserIds: result.keptUserIds,
            userCleanupError: result.userCleanupError,
          }),
        });

        res.json({
          success: true,
          message: "Player deleted",
          userCleanupError: result.userCleanupError,
        });
      } catch (error) {
        console.error("Error deleting player:", error);
        res.status(500).json({ error: "Failed to delete player" });
      }
    },
  );

  // Merge player accounts — moves all data from source into target, then deletes source
  router.post(
    "/api/players/:sourceId/merge-into/:targetId",
    authMiddleware,
    requireRole("academy_owner", "platform_owner", "admin", "coach"),
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { sourceId, targetId } = req.params;
        const academyId = req.user!.academyId!;
        const coachId = req.user!.coachId;

        if (sourceId === targetId) {
          return res.status(400).json({ error: "Source and target players must be different" });
        }

        const { valid: sourceValid, player: sourcePlayer } = await validatePlayerOwnership(sourceId, academyId, storage);
        if (!sourceValid || !sourcePlayer) {
          return res.status(404).json({ error: "Source player not found" });
        }

        const { valid: targetValid, player: targetPlayer } = await validatePlayerOwnership(targetId, academyId, storage);
        if (!targetValid || !targetPlayer) {
          return res.status(404).json({ error: "Target player not found" });
        }

        // Check for user account conflicts
        const [sourceUser] = await db.select({ id: users.id }).from(users).where(eq(users.playerId, sourceId));
        const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.playerId, targetId));

        const userWarning = sourceUser && targetUser
          ? `Both players had user accounts; the source account link was removed.`
          : null;

        // Single atomic transaction: transfer all historical data to target, delete all
        // non-transferable source rows in the correct FK order, then delete source player.
        // MAINTENANCE: When new player_* tables are added to the schema, mirror them in
        // Part A (reassign) or Part B (delete) below, following the same FK ordering used
        // in storage.deletePlayer to avoid FK violations on the final DELETE FROM players.
        // Use the `ifTable(...)` helper for newly-added tables so older databases that
        // haven't run db:push for the latest migrations stay safe (no-op).
        // To audit drift, run this query in psql and diff against the tables touched here:
        //   SELECT DISTINCT tc.table_name
        //   FROM information_schema.table_constraints tc
        //   JOIN information_schema.constraint_column_usage ccu
        //     ON ccu.constraint_name = tc.constraint_name
        //   WHERE tc.constraint_type='FOREIGN KEY'
        //     AND ccu.table_name='players' AND ccu.column_name='id';
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Pre-fetch the set of tables that actually exist in this database so
          // we can safely no-op operations against tables that haven't been
          // migrated yet (e.g. a dev DB that hasn't run db:push since the
          // schema added a new player_* table). This keeps the merge endpoint
          // robust as new player-referencing tables roll out across envs.
          const existingTablesRes = await client.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
          );
          const existingTables = new Set<string>(
            (existingTablesRes.rows as { table_name: string }[]).map(r => r.table_name)
          );
          const ifTable = async (name: string, sql: string, params: unknown[]) => {
            if (existingTables.has(name)) await client.query(sql, params);
          };

          // ================================================================
          // PART A — Transfer historical/coaching data from source to target
          // ================================================================

          // session_players: dedup-first (unique on session_id + player_id).
          // Task #674 fix: when both source and target have a row for the same
          // session, the row with real coaching data wins (non-null
          // attendance_status). Old behaviour kept the target unconditionally,
          // which silently dropped attendance + V2 ledger debits when a freshly
          // added target had empty/scheduled rows in shared series.
          await client.query(
            `DELETE FROM session_players sp_target
             USING session_players sp_source
             WHERE sp_target.player_id = $1
               AND sp_source.player_id = $2
               AND sp_target.session_id = sp_source.session_id
               AND sp_target.attendance_status IS NULL
               AND sp_source.attendance_status IS NOT NULL`,
            [targetId, sourceId]
          );
          // Now whatever target rows survive are the "winning" ones — drop any
          // remaining source rows that conflict with them, then move the rest.
          await client.query(
            `DELETE FROM session_players WHERE player_id = $1 AND session_id IN (
               SELECT session_id FROM session_players WHERE player_id = $2
             )`,
            [sourceId, targetId]
          );
          await client.query(`UPDATE session_players SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // series_players: dedup-first (unique on series_id + player_id).
          // Task #674 fix: prefer status='active' over 'left' when source and
          // target both have a row for the same series.
          await client.query(
            `DELETE FROM series_players sp_target
             USING series_players sp_source
             WHERE sp_target.player_id = $1
               AND sp_source.player_id = $2
               AND sp_target.series_id = sp_source.series_id
               AND sp_target.status = 'left'
               AND sp_source.status = 'active'`,
            [targetId, sourceId]
          );
          await client.query(
            `DELETE FROM series_players WHERE player_id = $1 AND series_id IN (
               SELECT series_id FROM series_players WHERE player_id = $2
             )`,
            [sourceId, targetId]
          );
          await client.query(`UPDATE series_players SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // V2 credit system (Task #682): repoint immutable history (lots + ledger)
          // onto the target. credit_lots has no unique-on-player constraint, and
          // credit_ledger_v2's eventKey is globally unique, so straight UPDATE is safe.
          await client.query(`UPDATE credit_lots SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE credit_ledger_v2 SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          // Aggregates have UNIQUE(player_id, academy_id[, type]); drop both
          // sides and rebuild the target's rows from the (now repointed) ledger
          // inside this transaction. The credit-reconcile watchdog only DETECTS
          // drift — it does not write — so the rebuild has to happen here.
          await client.query(`DELETE FROM player_credit_balance WHERE player_id IN ($1, $2)`, [sourceId, targetId]);
          // Capture existing wallet currency per academy (target preferred,
          // falling back to source) before we delete, so the rebuild keeps
          // non-AED wallets intact instead of silently coercing to AED.
          const walletCurrencyRows = await client.query(
            `SELECT academy_id, currency FROM player_money_wallet
             WHERE player_id IN ($1, $2)
             ORDER BY (player_id = $1) DESC`,
            [targetId, sourceId]
          );
          const walletCurrencyByAcademy = new Map<string, string>();
          for (const row of walletCurrencyRows.rows as { academy_id: string; currency: string }[]) {
            if (!walletCurrencyByAcademy.has(row.academy_id)) {
              walletCurrencyByAcademy.set(row.academy_id, row.currency);
            }
          }
          await client.query(`DELETE FROM player_money_wallet WHERE player_id IN ($1, $2)`, [sourceId, targetId]);
          await client.query(
            `INSERT INTO player_credit_balance (player_id, academy_id, type, credits, updated_at)
             SELECT player_id, academy_id, type, COALESCE(SUM(delta), 0), NOW()
             FROM credit_ledger_v2
             WHERE player_id = $1 AND type IN ('group', 'semi_private', 'private')
             GROUP BY player_id, academy_id, type`,
            [targetId]
          );
          const moneyAggregates = await client.query(
            `SELECT academy_id, COALESCE(SUM(delta), 0) AS balance
             FROM credit_ledger_v2
             WHERE player_id = $1 AND type = 'money'
             GROUP BY academy_id`,
            [targetId]
          );
          for (const agg of moneyAggregates.rows as { academy_id: string; balance: string | number }[]) {
            const currency = walletCurrencyByAcademy.get(agg.academy_id) ?? 'AED';
            await client.query(
              `INSERT INTO player_money_wallet (player_id, academy_id, balance, currency, updated_at)
               VALUES ($1, $2, $3, $4, NOW())`,
              [targetId, agg.academy_id, agg.balance, currency]
            );
          }
          await client.query(`UPDATE invoices SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE payments SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // Task #906: credit_shadow_diff — diagnostic log from the shadow-mode
          // credit engine runner. Immutable per-player audit trail, no unique
          // constraint on player_id, so straight UPDATE is safe. Transfer to
          // keep the target's shadow-diff history consistent after merge.
          await ifTable("credit_shadow_diff",
            `UPDATE credit_shadow_diff SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // Core coaching records
          await client.query(`UPDATE player_notes SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_subscriptions SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_level_events SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_progress SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_holidays SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_session_cancellations SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // Gamification, skill & progress
          await client.query(`UPDATE player_badges SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_titles SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_quests SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE daily_quest_slots SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_streaks SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_ball_levels SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_pillar_progress SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_baselines SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_baseline_skill_scores SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE xp_transactions SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_xp_events SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_level_up_celebrations SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_feature_unlock_history SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_skill_state SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_progress_flags SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_skill_scores SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_deep_assessments SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE deep_assessment_pillar_summaries SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_notifications SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // Feedback & observations
          // NOTE: session_feedback has no player_id column — it is session-level data (intensity/mood/coach_notes).
          // in_session_feedback: dedup ai_session_note first (partial unique on session_id+player_id WHERE feedback_type='ai_session_note')
          await client.query(
            `DELETE FROM in_session_feedback
             WHERE player_id = $1
               AND feedback_type = 'ai_session_note'
               AND session_id IN (
                 SELECT session_id FROM in_session_feedback
                 WHERE player_id = $2 AND feedback_type = 'ai_session_note'
               )`,
            [sourceId, targetId]
          );
          await client.query(`UPDATE in_session_feedback SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          // session_skill_feedback: dedup first (unique on session_id+player_id)
          await client.query(
            `DELETE FROM session_skill_feedback
             WHERE player_id = $1
               AND session_id IN (
                 SELECT session_id FROM session_skill_feedback WHERE player_id = $2
               )`,
            [sourceId, targetId]
          );
          await client.query(`UPDATE session_skill_feedback SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE session_skill_observations SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE skill_evidence SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // Assessments & group membership
          await client.query(`UPDATE domain_assessments SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE lesson_group_members SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE adult_skill_assessments SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // Level events & trials
          await client.query(`UPDATE level_up_events SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE level_trials SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // ----------------------------------------------------------------
          // Task #900: additional player_* / player-referencing tables that
          // accumulated since the merge endpoint was last audited. Each entry
          // is gated on `existingTables` so older databases that haven't run
          // db:push for the newest schema migrations stay safe (no-op).
          // ----------------------------------------------------------------

          // Legacy V1 billing — immutable history, transfer to target
          await ifTable("packages",
            `UPDATE packages SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await ifTable("credit_transactions",
            `UPDATE credit_transactions SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // Provider marketplace coaching artifacts (no unique on player_id alone in current schema)
          await ifTable("provider_client_notes",
            `UPDATE provider_client_notes SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          // provider_client_preferences: UNIQUE(provider_id, player_id) — dedup first.
          await ifTable("provider_client_preferences",
            `DELETE FROM provider_client_preferences WHERE player_id = $1 AND provider_id IN (
               SELECT provider_id FROM provider_client_preferences WHERE player_id = $2
             )`, [sourceId, targetId]);
          await ifTable("provider_client_preferences",
            `UPDATE provider_client_preferences SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // Corporate membership & ledger — historical, transfer
          await ifTable("corporate_members",
            `UPDATE corporate_members SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await ifTable("corporate_credit_transactions",
            `UPDATE corporate_credit_transactions SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // Equipment rentals, video & beta feedback — historical
          await ifTable("equipment_rentals",
            `UPDATE equipment_rentals SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await ifTable("video_feedback",
            `UPDATE video_feedback SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await ifTable("beta_feedback",
            `UPDATE beta_feedback SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // AI tables — transfer; dedup the ones with composite uniques first.
          // session_ai_summaries: UNIQUE(session_id, player_id)
          await ifTable("session_ai_summaries",
            `DELETE FROM session_ai_summaries WHERE player_id = $1 AND session_id IN (
               SELECT session_id FROM session_ai_summaries WHERE player_id = $2
             )`, [sourceId, targetId]);
          await ifTable("session_ai_summaries",
            `UPDATE session_ai_summaries SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await ifTable("player_ai_insights",
            `UPDATE player_ai_insights SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await ifTable("session_ai_chats",
            `UPDATE session_ai_chats SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await ifTable("ai_coach_conversations",
            `UPDATE ai_coach_conversations SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await ifTable("player_session_reflections",
            `UPDATE player_session_reflections SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          // player_monthly_assessments: UNIQUE(player_id, month_year)
          await ifTable("player_monthly_assessments",
            `DELETE FROM player_monthly_assessments WHERE player_id = $1 AND month_year IN (
               SELECT month_year FROM player_monthly_assessments WHERE player_id = $2
             )`, [sourceId, targetId]);
          await ifTable("player_monthly_assessments",
            `UPDATE player_monthly_assessments SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          // player_match_readiness: UNIQUE(player_id, match_date) — dedup first.
          await ifTable("player_match_readiness",
            `DELETE FROM player_match_readiness WHERE player_id = $1 AND match_date IN (
               SELECT match_date FROM player_match_readiness WHERE player_id = $2
             )`, [sourceId, targetId]);
          await ifTable("player_match_readiness",
            `UPDATE player_match_readiness SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          // player_ai_training_plans: UNIQUE(player_id, week_start_date) — original bug from Task #900
          await ifTable("player_ai_training_plans",
            `DELETE FROM player_ai_training_plans WHERE player_id = $1 AND week_start_date IN (
               SELECT week_start_date FROM player_ai_training_plans WHERE player_id = $2
             )`, [sourceId, targetId]);
          await ifTable("player_ai_training_plans",
            `UPDATE player_ai_training_plans SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          // player_monthly_reports: UNIQUE(player_id, month_year)
          await ifTable("player_monthly_reports",
            `DELETE FROM player_monthly_reports WHERE player_id = $1 AND month_year IN (
               SELECT month_year FROM player_monthly_reports WHERE player_id = $2
             )`, [sourceId, targetId]);
          await ifTable("player_monthly_reports",
            `UPDATE player_monthly_reports SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          // session_ratings: UNIQUE(session_id, player_id)
          await ifTable("session_ratings",
            `DELETE FROM session_ratings WHERE player_id = $1 AND session_id IN (
               SELECT session_id FROM session_ratings WHERE player_id = $2
             )`, [sourceId, targetId]);
          await ifTable("session_ratings",
            `UPDATE session_ratings SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await ifTable("session_intake_data",
            `UPDATE session_intake_data SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // Spotlight winners — historical recognition records.
          // UNIQUE(academy_id, week_start) and UNIQUE(academy_id, month, year):
          // if both source and target won the same period, target wins; drop source.
          await ifTable("spotlight_weekly_winners",
            `DELETE FROM spotlight_weekly_winners WHERE player_id = $1
               AND (academy_id, week_start) IN (
                 SELECT academy_id, week_start FROM spotlight_weekly_winners WHERE player_id = $2
               )`, [sourceId, targetId]);
          await ifTable("spotlight_weekly_winners",
            `UPDATE spotlight_weekly_winners SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await ifTable("spotlight_monthly_winners",
            `DELETE FROM spotlight_monthly_winners WHERE player_id = $1
               AND (academy_id, month, year) IN (
                 SELECT academy_id, month, year FROM spotlight_monthly_winners WHERE player_id = $2
               )`, [sourceId, targetId]);
          await ifTable("spotlight_monthly_winners",
            `UPDATE spotlight_monthly_winners SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);

          // Family invite codes — transfer both parent + used-by sides
          // (`code` is globally unique, no per-player constraint to dedup).
          await ifTable("family_invite_codes",
            `UPDATE family_invite_codes SET parent_player_id = $1 WHERE parent_player_id = $2`, [targetId, sourceId]);
          await ifTable("family_invite_codes",
            `UPDATE family_invite_codes SET used_by_player_id = $1 WHERE used_by_player_id = $2`, [targetId, sourceId]);

          // ---------- end Task #900 transfers ----------

          // Player connections: delete both sides to avoid self/duplicate links
          await client.query(`DELETE FROM player_connections WHERE player1_id = $1 OR player2_id = $1`, [sourceId]);

          // ================================================================
          // PART B — Delete non-transferable source rows (FK-ordered)
          // Mirrors storage.deletePlayer ordering to ensure safe deletion.
          // Tables already updated in Part A are no-ops here (0 rows matched).
          // ================================================================

          // Leaf tables with no outbound FKs to other player-owned tables
          // player_invites: reassign to target (historical invite record)
          await client.query(`UPDATE player_invites SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`DELETE FROM booking_requests WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM join_requests WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM academy_transfer_requests WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM conversation_participants WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM message_reactions WHERE reactor_player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM coach_reviews WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM review_prompts WHERE player_id = $1`, [sourceId]);
          // player_matches: reassign both sides; delete if source and target matched each other
          await client.query(
            `DELETE FROM player_matches WHERE
               (initiator_id = $1 AND receiver_id = $2) OR
               (initiator_id = $2 AND receiver_id = $1)`,
            [sourceId, targetId]
          );
          await client.query(`UPDATE player_matches SET initiator_id = $1 WHERE initiator_id = $2`, [targetId, sourceId]);
          await client.query(`UPDATE player_matches SET receiver_id = $1 WHERE receiver_id = $2`, [targetId, sourceId]);
          await client.query(`DELETE FROM booking_invite_guests WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM open_match_slots WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM play_request_participants WHERE player_id = $1`, [sourceId]);
          await client.query(
            `DELETE FROM match_requests WHERE player_id = $1 OR invited_player_id = $1 OR matched_with_player_id = $1`,
            [sourceId]
          );
          // player_booking_preferences: dedup then reassign
          await client.query(
            `DELETE FROM player_booking_preferences WHERE player_id = $1 AND EXISTS (
               SELECT 1 FROM player_booking_preferences WHERE player_id = $2
             )`,
            [sourceId, targetId]
          );
          await client.query(`UPDATE player_booking_preferences SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          await client.query(`DELETE FROM adult_glow_matches WHERE player_id = $1 OR opponent_id = $1`, [sourceId]);
          await client.query(`DELETE FROM session_waitlist WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM squad_members WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM shop_wishlist WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM match_logs WHERE player_id = $1 OR opponent_player_id = $1`, [sourceId]);
          await client.query(
            `DELETE FROM match_challenges WHERE challenger_id = $1 OR opponent_id = $1 OR winner_player_id = $1`,
            [sourceId]
          );
          await client.query(`DELETE FROM tournament_participants WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM ladder_players WHERE player_id = $1`, [sourceId]);
          await client.query(
            `DELETE FROM ladder_challenges WHERE challenger_id = $1 OR challenged_id = $1 OR winner_id = $1`,
            [sourceId]
          );

          // Tables referencing other player-owned rows (delete in dependent order)
          // daily_quest_slots → player_quests (already transferred, so 0-row no-ops)
          // level_trials referenced by level_up_events (already transferred, so 0-row no-ops)

          // match sub-tables before matches
          await client.query(`DELETE FROM match_pillar_scores WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM match_reflections WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM coach_match_reviews WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM match_training_suggestions WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM match_plans WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM matches WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM match_opponents WHERE player_id = $1`, [sourceId]);

          // Marketplace — must clean ALL inbound rows on source's listings
          // (messages + favourites from any user, and source's own messages
          // / favourites pointing at other people's listings) BEFORE deleting
          // the listings themselves, because both child tables FK to
          // marketplace_listings.id with no ON DELETE CASCADE.
          await ifTable("marketplace_messages",
            `DELETE FROM marketplace_messages
             WHERE sender_id = $1 OR recipient_id = $1
                OR listing_id IN (SELECT id FROM marketplace_listings WHERE seller_id = $1)`,
            [sourceId]);
          await ifTable("marketplace_favorites",
            `DELETE FROM marketplace_favorites
             WHERE player_id = $1
                OR listing_id IN (SELECT id FROM marketplace_listings WHERE seller_id = $1)`,
            [sourceId]);
          await client.query(`DELETE FROM marketplace_listings WHERE seller_id = $1`, [sourceId]);
          await client.query(`DELETE FROM seller_profiles WHERE player_id = $1`, [sourceId]);

          // Play requests: delete other participants on source-created requests first
          await client.query(
            `DELETE FROM play_request_participants WHERE request_id IN (
               SELECT id FROM play_requests WHERE creator_id = $1
             )`,
            [sourceId]
          );
          await client.query(`DELETE FROM play_requests WHERE creator_id = $1`, [sourceId]);

          // Live matches
          await client.query(`UPDATE live_matches SET winner_id = NULL WHERE winner_id = $1`, [sourceId]);
          await client.query(`DELETE FROM live_matches WHERE creator_id = $1`, [sourceId]);

          // Tournament matches & tournaments (SET NULL, don't delete tournament rows)
          await client.query(`UPDATE tournament_matches SET winner_id = NULL WHERE winner_id = $1`, [sourceId]);
          await client.query(`UPDATE tournament_matches SET player1_id = NULL WHERE player1_id = $1`, [sourceId]);
          await client.query(`UPDATE tournament_matches SET player2_id = NULL WHERE player2_id = $1`, [sourceId]);
          await client.query(`UPDATE tournaments SET winner_id = NULL WHERE winner_id = $1`, [sourceId]);

          // Booking invites where source is host
          await client.query(
            `DELETE FROM booking_invite_guests WHERE invite_id IN (
               SELECT id FROM booking_invites WHERE host_player_id = $1
             )`,
            [sourceId]
          );
          await client.query(`DELETE FROM booking_invites WHERE host_player_id = $1`, [sourceId]);

          // Open matches where source is host
          await client.query(
            `DELETE FROM open_match_slots WHERE match_id IN (
               SELECT id FROM open_matches WHERE host_player_id = $1
             )`,
            [sourceId]
          );
          await client.query(`DELETE FROM open_matches WHERE host_player_id = $1`, [sourceId]);

          // Court bookings (after booking_invites and open_matches)
          await client.query(`DELETE FROM court_bookings WHERE player_id = $1`, [sourceId]);

          // Chat messages and conversations
          await client.query(`DELETE FROM messages WHERE sender_player_id = $1`, [sourceId]);
          await client.query(`UPDATE conversations SET player_id = NULL WHERE player_id = $1`, [sourceId]);
          await client.query(`DELETE FROM parent_player_relations WHERE player_id = $1`, [sourceId]);

          // Billing (payments already transferred, so refund subquery returns 0 rows)
          await client.query(`DELETE FROM payment_reminders WHERE player_id = $1`, [sourceId]);
          await client.query(
            `DELETE FROM refunds WHERE payment_id IN (
               SELECT id FROM payments WHERE player_id = $1
             )`,
            [sourceId]
          );
          // Shop orders (not transferred — delete with items first)
          await client.query(
            `DELETE FROM shop_order_items WHERE order_id IN (
               SELECT id FROM shop_orders WHERE player_id = $1
             )`,
            [sourceId]
          );
          await client.query(`DELETE FROM shop_orders WHERE player_id = $1`, [sourceId]);

          // ----------------------------------------------------------------
          // Task #900: ephemeral / device-bound rows that should NOT transfer.
          // All gated on `existingTables` so missing tables stay no-op safe.
          // ----------------------------------------------------------------

          // Push tokens are bound to the source's device + user account.
          await ifTable("push_device_tokens",
            `DELETE FROM push_device_tokens WHERE player_id = $1`, [sourceId]);

          // (marketplace_messages + marketplace_favorites are cleaned up
          // earlier, before marketplace_listings is deleted, to satisfy the
          // listings.id FK on those tables.)

          // Quest chain bonus claims are gamification artifacts; drop source's.
          await ifTable("quest_chain_bonus_claims",
            `DELETE FROM quest_chain_bonus_claims WHERE player_id = $1`, [sourceId]);

          // Task #906: slot_reservations — ephemeral 5-min TTL holds on court
          // slots. NEVER transfer (would resurrect a stale hold on the target);
          // just drop the source's outstanding holds.
          await ifTable("slot_reservations",
            `DELETE FROM slot_reservations WHERE player_id = $1`, [sourceId]);

          // Spotlight nominations: drop both sides
          // (UNIQUE(nominator, week_start) means transfer would conflict).
          await ifTable("spotlight_nominations",
            `DELETE FROM spotlight_nominations WHERE nominator_player_id = $1 OR nominated_player_id = $1`,
            [sourceId]);

          // ---------- end Task #900 deletes ----------

          // ================================================================
          // PART C — User link & source player deletion
          // ================================================================

          if (sourceUser && !targetUser) {
            await client.query(`UPDATE users SET player_id = $1 WHERE player_id = $2`, [targetId, sourceId]);
          } else {
            // Both have users, or source has no user: unlink source to clear FK
            await client.query(`UPDATE users SET player_id = NULL WHERE player_id = $1`, [sourceId]);
          }

          await client.query(`DELETE FROM players WHERE id = $1`, [sourceId]);

          await client.query("COMMIT");
        } catch (txError) {
          await client.query("ROLLBACK");
          throw txError;
        } finally {
          client.release();
        }

        // Task #909: wipe the orphaned source user row. When both source
        // and target had user accounts, the transaction above set
        // users.player_id = NULL on the source user — that row is now a
        // dangling auth ghost. Hard-delete it if and only if the account is
        // player-only (no coach/academy role) and not a family-lobby parent
        // managing other children. Best-effort; never rolls back the merge.
        let mergeUserCleanup: Awaited<ReturnType<typeof wipeLinkedUserAfterMerge>> | null = null;
        if (sourceUser && targetUser) {
          try {
            // Call the wipe helper directly by user id. We captured
            // sourceUser.id before the merge, so we don't need to look it
            // up via the now-nulled users.player_id. sourcePlayerId is
            // passed only to scope the family-lobby safety check.
            mergeUserCleanup = await wipeLinkedUserAfterMerge(
              sourceUser.id,
              sourceId,
            );
          } catch (err) {
            console.error("[MergePlayers] source user wipe failed:", err);
            mergeUserCleanup = {
              userCleanupError:
                err instanceof Error ? err.message : String(err),
              wipedUserIds: [],
              keptUserIds: [],
            };
          }
        }

        await storage.createAuditLog({
          entityType: "player",
          entityId: sourceId,
          action: "merge",
          performedBy: coachId!,
          metadata: JSON.stringify({
            mergedIntoPlayerId: targetId,
            academyId,
            userWarning,
            wipedUserIds: mergeUserCleanup?.wipedUserIds ?? [],
            keptUserIds: mergeUserCleanup?.keptUserIds ?? [],
            userCleanupError: mergeUserCleanup?.userCleanupError ?? null,
          }),
        });

        res.json({
          success: true,
          targetId,
          userWarning,
          userCleanupError: mergeUserCleanup?.userCleanupError ?? null,
        });
      } catch (error) {
        console.error("Error merging players:", error);
        res.status(500).json({ error: "Failed to merge players" });
      }
    },
  );

  // Archive player (move to inactive/past)
  router.post(
    "/api/players/:id/archive",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const targetStatus =
          req.body?.status === "pending_payment" ? "pending_payment" : "inactive";
        await db
          .update(players)
          .set({ status: targetStatus })
          .where(eq(players.id, id));
        res.json({ success: true, message: "Player archived" });
      } catch (error) {
        console.error("Error archiving player:", error);
        res.status(500).json({ error: "Failed to archive player" });
      }
    },
  );

  // Restore player (move back to active)
  router.post(
    "/api/players/:id/restore",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        await db.update(players).set({ status: "active" }).where(eq(players.id, id));
        res.json({ success: true, message: "Player restored" });
      } catch (error) {
        console.error("Error restoring player:", error);
        res.status(500).json({ error: "Failed to restore player" });
      }
    },
  );

  // ===================== PLAYER BASELINES (Start Baseline Feature) =====================

  // Get player baseline
  router.get(
    "/api/players/:id/baseline",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid, player } = await validatePlayerOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid || !player) {
          return res.status(404).json({ error: "Player not found" });
        }

        const baseline = await storage.getPlayerBaseline(id);
        res.json({ baseline: baseline || null, player });
      } catch (error) {
        console.error("Error fetching player baseline:", error);
        res.status(500).json({ error: "Failed to fetch baseline" });
      }
    },
  );

  // Calculate suggested level based on age and intake questions
  router.post(
    "/api/players/:id/baseline/suggest-level",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;
        const {
          tennisExperience,
          playsCompetition,
          canRallyFive,
          serveAbility,
        } = req.body;

        const { valid, player } = await validatePlayerOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid || !player) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Calculate age from DOB or use age field
        let age = player.age;
        if (!age && player.dateOfBirth) {
          const dob = new Date(player.dateOfBirth);
          const today = new Date();
          age = today.getFullYear() - dob.getFullYear();
          const m = today.getMonth() - dob.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
            age--;
          }
        }
        age = age || 10; // Default to 10 if no age data
        const isAdult = age >= 18;

        // Auto-level suggestion based on age (recommended track)
        // Blue: 2-4, Red: 4-8, Orange: 8-10, Green: 10-12, Yellow: 12-18, Glow: 18+
        let suggestedStage: string;
        if (isAdult) {
          suggestedStage = "GLOW";
        } else if (age < 4) {
          suggestedStage = "BLUE";
        } else if (age < 8) {
          suggestedStage = "RED";
        } else if (age < 10) {
          suggestedStage = "ORANGE";
        } else if (age < 12) {
          suggestedStage = "GREEN";
        } else {
          suggestedStage = "YELLOW";
        }

        // Adjust based on intake questions
        // GLOW has ranks 9→1, others have 3→1
        let suggestedRank = isAdult ? 9 : 3; // Start at entry level
        let confidenceScore = 50;

        // Tennis experience adjustment
        if (tennisExperience === "18m+") {
          if (isAdult) {
            suggestedRank = Math.max(5, suggestedRank - 2); // Adults move faster with experience
          } else {
            suggestedRank = Math.max(1, suggestedRank - 1);
          }
          confidenceScore += 15;
        } else if (tennisExperience === "6-18m") {
          if (isAdult) {
            suggestedRank = Math.max(7, suggestedRank - 1);
          } else {
            suggestedRank = Math.max(2, suggestedRank);
          }
          confidenceScore += 10;
        }

        // Competition experience adjustment
        if (playsCompetition === "often") {
          if (isAdult) {
            suggestedRank = Math.max(3, suggestedRank - 2);
          } else {
            suggestedRank = Math.max(1, suggestedRank - 1);
          }
          confidenceScore += 15;
        } else if (playsCompetition === "sometimes") {
          confidenceScore += 10;
        }

        // Rally ability
        if (canRallyFive === true) {
          confidenceScore += 10;
          // If can rally but in BLUE, ready for RED
          if (suggestedStage === "BLUE" && tennisExperience !== "0-6m") {
            suggestedStage = "RED";
            suggestedRank = 3;
          }
          // If can rally but in RED, might be ready for ORANGE
          else if (suggestedStage === "RED" && tennisExperience !== "0-6m") {
            suggestedStage = "ORANGE";
            suggestedRank = 3;
          }
        }

        // Serve ability
        if (serveAbility === "consistent") {
          confidenceScore += 10;
          if (isAdult) {
            suggestedRank = Math.max(1, suggestedRank - 2);
          } else {
            suggestedRank = Math.max(1, suggestedRank - 1);
          }
        } else if (serveAbility === "basic") {
          confidenceScore += 5;
        }

        confidenceScore = Math.min(100, confidenceScore);

        // Construct level ID (e.g., "RED_3", "GLOW_9")
        const suggestedLevelId = `${suggestedStage}_${suggestedRank}`;

        res.json({
          suggestedLevelId,
          suggestedStage,
          suggestedRank,
          confidenceScore,
          age,
          isAdult,
          inputsUsed: {
            tennisExperience,
            playsCompetition,
            canRallyFive,
            serveAbility,
          },
        });
      } catch (error) {
        console.error("Error calculating suggested level:", error);
        res.status(500).json({ error: "Failed to calculate suggested level" });
      }
    },
  );

  // Create or update player baseline
  router.post(
    "/api/players/:id/baseline",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;
        const coachId = req.user!.coachId;

        const { valid, player } = await validatePlayerOwnership(
          id,
          academyId,
          storage,
        );
        if (!valid || !player) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Check if baseline already exists and is locked
        const existingBaseline = await storage.getPlayerBaseline(id);
        if (existingBaseline?.status === "locked") {
          return res
            .status(403)
            .json({
              error: "Baseline is locked. Request unlock from admin to modify.",
            });
        }

        const {
          suggestedLevelId,
          confirmedLevelId,
          confidenceScore,
          tennisExperience,
          playsCompetition,
          canRallyFive,
          serveAbility,
          techniqueRating,
          tacticalRating,
          physicalRating,
          mentalRating,
          socialRating,
          matchRating,
          overrideReason,
          overrideNote,
          deepSkillScores, // Deep baseline skill-by-skill scores
          checkedSkillIds, // Quick baseline checked skill IDs from card-based flow
        } = req.body;

        const wasOverridden =
          confirmedLevelId &&
          suggestedLevelId &&
          confirmedLevelId !== suggestedLevelId;

        if (existingBaseline) {
          // Update existing baseline
          const updated = await storage.updatePlayerBaseline(
            existingBaseline.id,
            {
              suggestedLevelId,
              confirmedLevelId,
              confidenceScore,
              tennisExperience,
              playsCompetition,
              canRallyFive,
              serveAbility,
              techniqueRating,
              tacticalRating,
              physicalRating,
              mentalRating,
              socialRating,
              matchRating,
              wasOverridden,
              overrideReason: wasOverridden ? overrideReason : null,
              overrideNote: wasOverridden ? overrideNote : null,
              status: "confirmed",
            },
          );

          // Also update the player's ball level
          if (confirmedLevelId) {
            const [stage, rank] = confirmedLevelId.split("_");
            await storage.updatePlayer(id, {
              ballLevel: stage.toLowerCase(),
              skillLevel: parseInt(rank, 10),
            });
          }

          // Save deep skill scores if provided
          if (deepSkillScores && typeof deepSkillScores === "object") {
            // Delete existing scores for this baseline
            await db
              .delete(playerBaselineSkillScores)
              .where(
                eq(playerBaselineSkillScores.baselineId, existingBaseline.id),
              );

            // Insert new scores
            const scoreEntries = Object.entries(deepSkillScores) as [
              string,
              { rating: number | null; notObserved: boolean; notes?: string },
            ][];
            for (const [skillId, scoreData] of scoreEntries) {
              if (scoreData.rating !== null || scoreData.notObserved) {
                // Extract pillar and category from skill ID
                const pillarMap: Record<string, string> = {
                  fh: "TECHNIQUE",
                  bh: "TECHNIQUE",
                  sv: "TECHNIQUE",
                  rt: "TECHNIQUE",
                  vl: "TECHNIQUE",
                  oh: "TECHNIQUE",
                  mv: "MOVEMENT",
                  tc: "TACTICAL",
                  mn: "MENTAL",
                  sc: "SOCIAL",
                  mt: "MATCH",
                };
                const prefix = skillId.split("_")[0];
                const pillar = pillarMap[prefix] || "TECHNIQUE";

                await db.insert(playerBaselineSkillScores).values({
                  baselineId: existingBaseline.id,
                  playerId: id,
                  pillar,
                  skillCategory: skillId,
                  rating: scoreData.rating,
                  notObserved: scoreData.notObserved,
                  notes: scoreData.notes || null,
                  coachId: coachId || null,
                });
              }
            }
          }

          // Save checked skill IDs from quick baseline flow as initial achievements
          if (
            checkedSkillIds &&
            Array.isArray(checkedSkillIds) &&
            checkedSkillIds.length > 0
          ) {
            for (const skillId of checkedSkillIds) {
              // Check if skill score already exists
              const existing = await db
                .select()
                .from(playerSkillScores)

                .where(
                  and(
                    eq(playerSkillScores.playerId, id),
                    eq(playerSkillScores.skillId, skillId),
                  ),
                )
                .limit(1);

              if (existing.length === 0) {
                // Create initial skill score with score 2 (Meets expectations) as baseline achievement
                await db.insert(playerSkillScores).values({
                  playerId: id,
                  skillId,
                  score: 2, // "Meets" level as confirmed during baseline
                  movingAverage: 2,
                  observationType: "baseline",
                  coachId: coachId || null,
                  notes: "Confirmed during baseline assessment",
                });
              }
            }
          }

          res.json(updated);
        } else {
          // Create new baseline
          const baseline = await storage.createPlayerBaseline({
            playerId: id,
            academyId: academyId!,
            suggestedLevelId,
            confirmedLevelId,
            confidenceScore,
            tennisExperience,
            playsCompetition,
            canRallyFive,
            serveAbility,
            techniqueRating,
            tacticalRating,
            physicalRating,
            mentalRating,
            socialRating,
            matchRating,
            wasOverridden,
            overrideReason: wasOverridden ? overrideReason : null,
            overrideNote: wasOverridden ? overrideNote : null,
            status: "confirmed",
          });

          // Also update the player's ball level
          if (confirmedLevelId) {
            const [stage, rank] = confirmedLevelId.split("_");
            await storage.updatePlayer(id, {
              ballLevel: stage.toLowerCase(),
              skillLevel: parseInt(rank, 10),
            });
          }

          // Save deep skill scores if provided
          if (deepSkillScores && typeof deepSkillScores === "object") {
            const scoreEntries = Object.entries(deepSkillScores) as [
              string,
              { rating: number | null; notObserved: boolean; notes?: string },
            ][];
            for (const [skillId, scoreData] of scoreEntries) {
              if (scoreData.rating !== null || scoreData.notObserved) {
                const pillarMap: Record<string, string> = {
                  fh: "TECHNIQUE",
                  bh: "TECHNIQUE",
                  sv: "TECHNIQUE",
                  rt: "TECHNIQUE",
                  vl: "TECHNIQUE",
                  oh: "TECHNIQUE",
                  mv: "MOVEMENT",
                  tc: "TACTICAL",
                  mn: "MENTAL",
                  sc: "SOCIAL",
                  mt: "MATCH",
                };
                const prefix = skillId.split("_")[0];
                const pillar = pillarMap[prefix] || "TECHNIQUE";

                await db.insert(playerBaselineSkillScores).values({
                  baselineId: baseline.id,
                  playerId: id,
                  pillar,
                  skillCategory: skillId,
                  rating: scoreData.rating,
                  notObserved: scoreData.notObserved,
                  notes: scoreData.notes || null,
                  coachId: coachId || null,
                });
              }
            }
          }

          // Save checked skill IDs from quick baseline flow as initial achievements
          if (
            checkedSkillIds &&
            Array.isArray(checkedSkillIds) &&
            checkedSkillIds.length > 0
          ) {
            for (const skillId of checkedSkillIds) {
              // Check if skill score already exists
              const existing = await db
                .select()
                .from(playerSkillScores)

                .where(
                  and(
                    eq(playerSkillScores.playerId, id),
                    eq(playerSkillScores.skillId, skillId),
                  ),
                )
                .limit(1);

              if (existing.length === 0) {
                // Create initial skill score with score 2 (Meets expectations) as baseline achievement
                await db.insert(playerSkillScores).values({
                  playerId: id,
                  skillId,
                  score: 2, // "Meets" level as confirmed during baseline
                  movingAverage: 2,
                  observationType: "baseline",
                  coachId: coachId || null,
                  notes: "Confirmed during baseline assessment",
                });
              }
            }
          }

          res.status(201).json(baseline);
        }
      } catch (error) {
        console.error("Error saving player baseline:", error);
        res.status(500).json({ error: "Failed to save baseline" });
      }
    },
  );

  // Lock player baseline
  router.post(
    "/api/players/:id/baseline/lock",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;
        const coachId = req.user!.coachId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const baseline = await storage.getPlayerBaseline(id);
        if (!baseline) {
          return res
            .status(404)
            .json({ error: "No baseline found for this player" });
        }

        if (baseline.status === "locked") {
          return res.status(400).json({ error: "Baseline is already locked" });
        }

        const locked = await storage.lockPlayerBaseline(baseline.id, coachId!);
        res.json(locked);
      } catch (error) {
        console.error("Error locking baseline:", error);
        res.status(500).json({ error: "Failed to lock baseline" });
      }
    },
  );

  // Unlock player baseline (admin/owner only)
  router.post(
    "/api/players/:id/baseline/unlock",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;
        const role = req.user!.role;

        // Only platform owner or academy admins can unlock
        if (role !== "platform_owner" && role !== "academy_owner") {
          return res
            .status(403)
            .json({ error: "Only academy owners can unlock baselines" });
        }

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const baseline = await storage.getPlayerBaseline(id);
        if (!baseline) {
          return res
            .status(404)
            .json({ error: "No baseline found for this player" });
        }

        if (baseline.status !== "locked") {
          return res.status(400).json({ error: "Baseline is not locked" });
        }

        const unlocked = await storage.unlockPlayerBaseline(baseline.id);
        res.json(unlocked);
      } catch (error) {
        console.error("Error unlocking baseline:", error);
        res.status(500).json({ error: "Failed to unlock baseline" });
      }
    },
  );

  // Reset/Reopen player baseline (allows starting a new baseline)
  router.delete(
    "/api/players/:id/baseline",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const baseline = await storage.getPlayerBaseline(id);
        if (!baseline) {
          return res
            .status(404)
            .json({ error: "No baseline found for this player" });
        }

        // Delete the baseline (this allows a new baseline to be created)
        await db
          .delete(playerBaselineSkillScores)
          .where(eq(playerBaselineSkillScores.baselineId, baseline.id));
        await db
          .delete(playerBaselines)
          .where(eq(playerBaselines.id, baseline.id));

        res.json({ success: true, message: "Baseline reset successfully" });
      } catch (error) {
        console.error("Error resetting baseline:", error);
        res.status(500).json({ error: "Failed to reset baseline" });
      }
    },
  );

  // Get academy baseline stats
  router.get(
    "/api/academy/baseline-stats",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const stats = await storage.getAcademyBaselineStats(academyId);
        res.json(stats);
      } catch (error) {
        console.error("Error fetching baseline stats:", error);
        res.status(500).json({ error: "Failed to fetch baseline stats" });
      }
    },
  );

  // Get players without baseline
  router.get(
    "/api/academy/players-without-baseline",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const academyId = req.user!.academyId!;
        const players = await storage.getPlayersWithoutBaseline(academyId);
        res.json(players);
      } catch (error) {
        console.error("Error fetching players without baseline:", error);
        res.status(500).json({ error: "Failed to fetch players" });
      }
    },
  );

  // Get all ball levels
  router.get(
    "/api/ball-levels",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const levels = await storage.getAllBallLevels();
        res.json(levels);
      } catch (error) {
        console.error("Error fetching ball levels:", error);
        res.status(500).json({ error: "Failed to fetch ball levels" });
      }
    },
  );

  // ===================== DEEP ASSESSMENT (Layer 2) =====================

  // Get all deep assessment skills (optionally filtered by pillar)
  router.get(
    "/api/deep-assessment/skills",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { pillar, ballLevel } = req.query;

        let skills;
        if (ballLevel && typeof ballLevel === "string") {
          skills = await storage.getDeepAssessmentSkillsByBallLevel(ballLevel);
        } else if (pillar && typeof pillar === "string") {
          skills = await storage.getDeepAssessmentSkills(pillar);
        } else {
          skills = await storage.getDeepAssessmentSkills();
        }

        // Group by pillar and category
        const grouped: Record<string, Record<string, typeof skills>> = {};
        for (const skill of skills) {
          if (!grouped[skill.pillar]) {
            grouped[skill.pillar] = {};
          }
          if (!grouped[skill.pillar][skill.category]) {
            grouped[skill.pillar][skill.category] = [];
          }
          grouped[skill.pillar][skill.category].push(skill);
        }

        res.json({ skills, grouped });
      } catch (error) {
        console.error("Error fetching deep assessment skills:", error);
        res.status(500).json({ error: "Failed to fetch skills" });
      }
    },
  );

  // Get player's deep assessment with all skills
  router.get(
    "/api/players/:id/deep-assessment",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        // Get all skills and player's assessments
        const allSkills = await storage.getDeepAssessmentSkills();
        const playerAssessments = await storage.getPlayerDeepAssessments(id);
        const summary = await storage.getPlayerDeepAssessmentSummary(id);

        // Create assessment map
        const assessmentMap = new Map(
          playerAssessments.map((a) => [a.skillId, a]),
        );

        // Combine skills with assessments
        const skillsWithAssessments = allSkills.map((skill) => ({
          ...skill,
          assessment: assessmentMap.get(skill.id) || null,
        }));

        // Group by pillar and category
        const grouped: Record<
          string,
          Record<string, typeof skillsWithAssessments>
        > = {};
        for (const skill of skillsWithAssessments) {
          if (!grouped[skill.pillar]) {
            grouped[skill.pillar] = {};
          }
          if (!grouped[skill.pillar][skill.category]) {
            grouped[skill.pillar][skill.category] = [];
          }
          grouped[skill.pillar][skill.category].push(skill);
        }

        res.json({
          playerId: id,
          skills: skillsWithAssessments,
          grouped,
          summary,
          totalSkills: allSkills.length,
          assessedSkills: playerAssessments.filter((a) => a.score !== null)
            .length,
        });
      } catch (error) {
        console.error("Error fetching player deep assessment:", error);
        res.status(500).json({ error: "Failed to fetch deep assessment" });
      }
    },
  );

  // Save/update a skill assessment for a player
  router.post(
    "/api/players/:id/deep-assessment",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId!;
        const coachId = req.user!.coachId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const { skillId, score, confidence, notes, evidenceUrl, sessionId } =
          req.body;

        if (!skillId) {
          return res.status(400).json({ error: "skillId is required" });
        }

        const assessment = await storage.upsertPlayerDeepAssessment({
          playerId: id,
          skillId,
          score,
          confidence: confidence || "medium",
          notes,
          evidenceUrl,
          coachId,
          academyId,
          sessionId,
        });

        res.json(assessment);
      } catch (error) {
        console.error("Error saving deep assessment:", error);
        res.status(500).json({ error: "Failed to save assessment" });
      }
    },
  );

  // Bulk save multiple assessments for a player
  router.post(
    "/api/players/:id/deep-assessment/bulk",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId!;
        const coachId = req.user!.coachId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const { assessments } = req.body;

        if (!Array.isArray(assessments)) {
          return res
            .status(400)
            .json({ error: "assessments array is required" });
        }

        const { checkForScoringAnomaly } = await import("../services/coach-calibration-engine");

        const results = [];
        for (const item of assessments) {
          const assessment = await storage.upsertPlayerDeepAssessment({
            playerId: id,
            skillId: item.skillId,
            score: item.score,
            confidence: item.confidence || "medium",
            notes: item.notes,
            evidenceUrl: item.evidenceUrl,
            coachId,
            academyId,
            sessionId: item.sessionId,
          });
          results.push(assessment);

          // Run calibration anomaly detection silently in the background
          if (coachId && item.skillId && item.score !== undefined) {
            checkForScoringAnomaly(
              coachId,
              item.skillId,
              item.sessionId || `deep-assessment-${Date.now()}`,
              id,
              item.score
            ).catch(err => {
              console.error("Error running calibration anomaly check on deep assessment:", err);
            });
          }
        }

        res.json({ saved: results.length, assessments: results });
      } catch (error) {
        console.error("Error bulk saving deep assessments:", error);
        res.status(500).json({ error: "Failed to save assessments" });
      }
    },
  );

  // Get deep assessment summary for a player
  router.get(
    "/api/players/:id/deep-assessment/summary",
    authMiddleware,
    requireAcademy,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const academyId = req.user!.academyId;

        const { valid } = await validatePlayerOwnership(id, academyId, storage);
        if (!valid) {
          return res.status(404).json({ error: "Player not found" });
        }

        const summary = await storage.getPlayerDeepAssessmentSummary(id);
        res.json(summary);
      } catch (error) {
        console.error("Error fetching deep assessment summary:", error);
        res.status(500).json({ error: "Failed to fetch summary" });
      }
    },
  );

export default router;
