import { Router } from "express";
import type { Response } from "express";
import { db } from "../db";
import { coaches, sessions, locations, locationTravelTimes, sessionPlayers, coachingSeries, players } from "@shared/schema";
import { eq, and, gte, lte, isNotNull, asc, inArray, isNull, or, lt, desc } from "drizzle-orm";
import { authMiddlewareWithFreshData as authMiddleware, requireRole } from "../auth";
import type { AuthenticatedRequest } from "../auth";

const router = Router();

const SAME_LOCATION_KM = 0.3;
const LOCATION_FRESHNESS_MINUTES = 30;

router.patch("/api/coach/me/location", authMiddleware, requireRole("coach", "assistant", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { lat, lng } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "lat and lng must be numbers" });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }

    const coachId = req.user?.coachId;
    if (!coachId) {
      return res.status(400).json({ error: "Coach profile not found" });
    }

    await db.update(coaches)
      .set({
        lastLat: lat,
        lastLng: lng,
        lastLocationAt: new Date(),
      })
      .where(eq(coaches.id, coachId));

    return res.json({ success: true });
  } catch (err) {
    console.error("[CoachLocation] PATCH /api/coach/me/location error:", err);
    return res.status(500).json({ error: "Failed to update location" });
  }
});

router.get("/api/coach/me/next-session-eta", authMiddleware, requireRole("coach", "assistant", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user?.coachId;
    if (!coachId) {
      return res.status(400).json({ error: "Coach profile not found" });
    }

    const [coach] = await db.select({
      id: coaches.id,
      lastLat: coaches.lastLat,
      lastLng: coaches.lastLng,
      lastLocationAt: coaches.lastLocationAt,
      homeLocationId: coaches.homeLocationId,
    }).from(coaches).where(eq(coaches.id, coachId));

    if (!coach) {
      return res.status(404).json({ error: "Coach not found" });
    }

    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const upcomingSessions = await db.select({
      id: sessions.id,
      startTime: sessions.startTime,
      locationId: sessions.locationId,
    })
      .from(sessions)
      .where(
        and(
          eq(sessions.coachId, coachId),
          inArray(sessions.status, ["scheduled", "upcoming"]),
          gte(sessions.startTime, now),
          lte(sessions.startTime, todayEnd),
          isNotNull(sessions.locationId),
        )
      )
      .orderBy(asc(sessions.startTime))
      .limit(1);

    if (upcomingSessions.length === 0) {
      return res.json({ eta: null, reason: "no_upcoming_sessions" });
    }

    const nextSession = upcomingSessions[0];
    const sessionStart = new Date(nextSession.startTime);
    const minutesToSession = Math.round((sessionStart.getTime() - now.getTime()) / (1000 * 60));

    const [sessionLocation] = await db.select({
      id: locations.id,
      name: locations.name,
      lat: locations.lat,
      lng: locations.lng,
    }).from(locations).where(eq(locations.id, nextSession.locationId!));

    if (!sessionLocation) {
      return res.json({ eta: null, reason: "location_not_found" });
    }

    const destLat = sessionLocation.lat;
    const destLng = sessionLocation.lng;

    if (destLat === null || destLat === undefined || destLng === null || destLng === undefined) {
      return res.json({ eta: null, reason: "location_no_coordinates" });
    }

    if (coach.lastLat === null || coach.lastLat === undefined || coach.lastLng === null || coach.lastLng === undefined) {
      return res.json({
        sessionId: nextSession.id,
        locationName: sessionLocation.name,
        sessionStart: sessionStart.toISOString(),
        minutesToSession,
        eta: null,
        reason: "no_coach_location",
      });
    }

    const freshnessMs = LOCATION_FRESHNESS_MINUTES * 60 * 1000;
    if (coach.lastLocationAt !== null && coach.lastLocationAt !== undefined) {
      const ageMs = now.getTime() - new Date(coach.lastLocationAt).getTime();
      if (ageMs > freshnessMs) {
        return res.json({
          sessionId: nextSession.id,
          locationName: sessionLocation.name,
          sessionStart: sessionStart.toISOString(),
          minutesToSession,
          eta: null,
          reason: "stale_coach_location",
        });
      }
    }

    const coachLat = coach.lastLat;
    const coachLng = coach.lastLng;

    const distKm = haversineKm(coachLat, coachLng, destLat, destLng);
    if (distKm < SAME_LOCATION_KM) {
      return res.json({
        sessionId: nextSession.id,
        locationName: sessionLocation.name,
        sessionStart: sessionStart.toISOString(),
        minutesToSession,
        minutes: 0,
        sameLocation: true,
      });
    }

    let travelMinutes: number | null = null;

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      try {
        travelMinutes = await fetchDistanceMatrixMinutes(coachLat, coachLng, destLat, destLng, apiKey);
      } catch (mapsErr) {
        console.warn("[CoachLocation] Distance Matrix API failed, falling back to travel times table:", mapsErr);
      }
    }

    if (travelMinutes === null) {
      travelMinutes = await fallbackTravelMinutes(coachId, coachLat, coachLng, sessionLocation.id, coach.homeLocationId ?? null);
    }

    const shouldLeaveInMinutes = minutesToSession - travelMinutes;

    return res.json({
      sessionId: nextSession.id,
      locationName: sessionLocation.name,
      sessionStart: sessionStart.toISOString(),
      minutesToSession,
      minutes: travelMinutes,
      sameLocation: false,
      shouldLeaveInMinutes,
    });
  } catch (err) {
    console.error("[CoachLocation] GET /api/coach/me/next-session-eta error:", err);
    return res.status(500).json({ error: "Failed to compute ETA" });
  }
});

interface DistanceMatrixElement {
  status: string;
  duration_in_traffic?: { value: number; text: string };
  duration?: { value: number; text: string };
}

interface DistanceMatrixRow {
  elements?: DistanceMatrixElement[];
}

interface DistanceMatrixResponse {
  status: string;
  rows?: DistanceMatrixRow[];
}

async function fetchDistanceMatrixMinutes(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<number | null> {
  const origin = `${originLat},${originLng}`;
  const destination = `${destLat},${destLng}`;
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&departure_time=now&key=${apiKey}`;
  const mapsRes = await fetch(url);
  if (!mapsRes.ok) return null;
  const mapsData = await mapsRes.json() as DistanceMatrixResponse;
  if (mapsData.status !== "OK") return null;
  const element = mapsData.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") return null;
  const dur = element.duration_in_traffic ?? element.duration;
  if (!dur?.value) return null;
  return Math.round(dur.value / 60);
}

async function fallbackTravelMinutes(
  coachId: string,
  coachLat: number,
  coachLng: number,
  toLocationId: string,
  homeLocationId: string | null
): Promise<number> {
  let fromLocationId: string | null = homeLocationId;

  if (fromLocationId === null) {
    const allLocations = await db.select({
      id: locations.id,
      lat: locations.lat,
      lng: locations.lng,
    }).from(locations).where(isNotNull(locations.lat));

    let nearestId: string | null = null;
    let nearestDist = Infinity;
    for (const loc of allLocations) {
      if (loc.lat === null || loc.lat === undefined || loc.lng === null || loc.lng === undefined) continue;
      const d = haversineKm(coachLat, coachLng, loc.lat, loc.lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestId = loc.id;
      }
    }
    fromLocationId = nearestId;
  }

  if (fromLocationId !== null) {
    const [row] = await db.select({
      travelTimeMinutes: locationTravelTimes.travelTimeMinutes,
    })
      .from(locationTravelTimes)
      .where(
        and(
          eq(locationTravelTimes.coachId, coachId),
          eq(locationTravelTimes.fromLocationId, fromLocationId),
          eq(locationTravelTimes.toLocationId, toLocationId),
        )
      )
      .limit(1);

    if (row?.travelTimeMinutes !== undefined) return row.travelTimeMinutes;
  }

  const [anyRow] = await db.select({
    travelTimeMinutes: locationTravelTimes.travelTimeMinutes,
  })
    .from(locationTravelTimes)
    .where(
      and(
        eq(locationTravelTimes.coachId, coachId),
        eq(locationTravelTimes.toLocationId, toLocationId),
      )
    )
    .limit(1);

  if (anyRow?.travelTimeMinutes !== undefined) return anyRow.travelTimeMinutes;

  return 30;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// GET /api/coach/me/pending-attendance
// Returns completed sessions (last 60 days) that have at least one player with NULL attendance_status
router.get(
  "/api/coach/me/pending-attendance",
  authMiddleware,
  requireRole("coach", "assistant", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user?.coachId;
      if (!coachId) return res.status(403).json({ error: "Coach only" });

      const now = new Date();

      // Step 1: Find the 20 most-recent session IDs for this coach where at least one
      // session_player has NULL or 'pending' attendance_status.
      // Sessions must be completed (status='completed') or past end_time with no status set.
      const pendingSessionRows = await db
        .selectDistinct({ sessionId: sessionPlayers.sessionId, startTime: sessions.startTime })
        .from(sessionPlayers)
        .innerJoin(sessions, eq(sessions.id, sessionPlayers.sessionId))
        .where(
          and(
            eq(sessions.coachId, coachId),
            or(
              eq(sessions.status, "completed"),
              and(lt(sessions.endTime, now), isNull(sessions.status))
            ),
            or(
              isNull(sessionPlayers.attendanceStatus),
              eq(sessionPlayers.attendanceStatus, "pending")
            )
          )
        )
        .orderBy(desc(sessions.startTime))
        .limit(20);

      if (pendingSessionRows.length === 0) {
        return res.json([]);
      }

      const sessionIds = pendingSessionRows.map((r) => r.sessionId).filter(Boolean) as string[];

      // Step 2: Get session details + series title for each session
      const sessionDetails = await db
        .select({
          sessionId: sessions.id,
          startTime: sessions.startTime,
          endTime: sessions.endTime,
          sessionType: sessions.sessionType,
          seriesId: sessions.seriesId,
          seriesTitle: coachingSeries.title,
        })
        .from(sessions)
        .leftJoin(coachingSeries, eq(coachingSeries.id, sessions.seriesId))
        .where(inArray(sessions.id, sessionIds))
        .orderBy(desc(sessions.startTime));

      // Step 3: Get pending players (NULL or 'pending' attendance) for each session
      const pendingPlayers = await db
        .select({
          sessionId: sessionPlayers.sessionId,
          playerId: sessionPlayers.playerId,
          playerName: players.name,
        })
        .from(sessionPlayers)
        .innerJoin(players, eq(players.id, sessionPlayers.playerId))
        .where(
          and(
            inArray(sessionPlayers.sessionId, sessionIds),
            or(
              isNull(sessionPlayers.attendanceStatus),
              eq(sessionPlayers.attendanceStatus, "pending")
            )
          )
        );

      // Step 4: Merge
      const result = sessionDetails.map((sess) => ({
        sessionId: sess.sessionId,
        startTime: sess.startTime,
        endTime: sess.endTime,
        sessionType: sess.sessionType,
        seriesTitle: sess.seriesTitle ?? "Session",
        pendingPlayers: pendingPlayers
          .filter((p) => p.sessionId === sess.sessionId)
          .map((p) => ({ id: p.playerId, name: p.playerName })),
      }));

      // Filter out any session where pending players list is empty (already resolved race condition)
      const filtered = result.filter((r) => r.pendingPlayers.length > 0);

      res.json(filtered);
    } catch (err) {
      console.error("[pending-attendance] error:", err);
      res.status(500).json({ error: "Failed to fetch pending attendance" });
    }
  }
);

export { fetchDistanceMatrixMinutes, haversineKm, SAME_LOCATION_KM, LOCATION_FRESHNESS_MINUTES };

export default router;
