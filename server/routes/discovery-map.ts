import { Router, Request, Response } from "express";
import { db } from "../db";
import { sql, and, eq, gte, lte, ne, inArray, isNotNull, gt } from "drizzle-orm";
import {
  academies, locations, sessions, openMatches, openMatchSlots,
  courtBookings, courts, tournaments, players,
} from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  type JWTPayload,
} from "../auth";

const router = Router();

interface AuthRequest extends Request {
  user?: JWTPayload;
}

type PinType = "academy" | "lesson" | "match" | "tournament";

interface MapPin {
  id: string;
  type: PinType;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  country?: string | null;
  city?: string | null;
  meta?: Record<string, unknown>;
}

function parseBbox(raw: unknown): { minLat: number; minLng: number; maxLat: number; maxLng: number } | null {
  if (typeof raw !== "string" || !raw) return null;
  const parts = raw.split(",").map((p) => parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  // Accept either "minLat,minLng,maxLat,maxLng" or "lat1,lng1,lat2,lng2"
  const [a, b, c, d] = parts;
  return {
    minLat: Math.min(a, c),
    maxLat: Math.max(a, c),
    minLng: Math.min(b, d),
    maxLng: Math.max(b, d),
  };
}

// Approximate centroids for popular countries. Looked up by ISO-2/ISO-3 code or
// English name (case-insensitive). Used as a fallback map center when a player
// hasn't granted location access.
const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  US: { lat: 39.5, lng: -98.35 }, USA: { lat: 39.5, lng: -98.35 }, "UNITED STATES": { lat: 39.5, lng: -98.35 },
  CA: { lat: 56.13, lng: -106.35 }, CAN: { lat: 56.13, lng: -106.35 }, CANADA: { lat: 56.13, lng: -106.35 },
  GB: { lat: 54.0, lng: -2.0 }, UK: { lat: 54.0, lng: -2.0 }, "UNITED KINGDOM": { lat: 54.0, lng: -2.0 },
  FR: { lat: 46.6, lng: 2.2 }, FRA: { lat: 46.6, lng: 2.2 }, FRANCE: { lat: 46.6, lng: 2.2 },
  DE: { lat: 51.16, lng: 10.45 }, DEU: { lat: 51.16, lng: 10.45 }, GERMANY: { lat: 51.16, lng: 10.45 },
  ES: { lat: 40.46, lng: -3.75 }, ESP: { lat: 40.46, lng: -3.75 }, SPAIN: { lat: 40.46, lng: -3.75 },
  IT: { lat: 41.87, lng: 12.57 }, ITA: { lat: 41.87, lng: 12.57 }, ITALY: { lat: 41.87, lng: 12.57 },
  NL: { lat: 52.13, lng: 5.29 }, NLD: { lat: 52.13, lng: 5.29 }, NETHERLANDS: { lat: 52.13, lng: 5.29 },
  CH: { lat: 46.82, lng: 8.23 }, CHE: { lat: 46.82, lng: 8.23 }, SWITZERLAND: { lat: 46.82, lng: 8.23 },
  PT: { lat: 39.4, lng: -8.22 }, PRT: { lat: 39.4, lng: -8.22 }, PORTUGAL: { lat: 39.4, lng: -8.22 },
  IE: { lat: 53.41, lng: -8.24 }, IRL: { lat: 53.41, lng: -8.24 }, IRELAND: { lat: 53.41, lng: -8.24 },
  AU: { lat: -25.27, lng: 133.78 }, AUS: { lat: -25.27, lng: 133.78 }, AUSTRALIA: { lat: -25.27, lng: 133.78 },
  NZ: { lat: -40.9, lng: 174.89 }, NZL: { lat: -40.9, lng: 174.89 }, "NEW ZEALAND": { lat: -40.9, lng: 174.89 },
  AE: { lat: 23.42, lng: 53.85 }, ARE: { lat: 23.42, lng: 53.85 }, "UNITED ARAB EMIRATES": { lat: 23.42, lng: 53.85 }, UAE: { lat: 23.42, lng: 53.85 },
  IN: { lat: 20.59, lng: 78.96 }, IND: { lat: 20.59, lng: 78.96 }, INDIA: { lat: 20.59, lng: 78.96 },
  CN: { lat: 35.86, lng: 104.19 }, CHN: { lat: 35.86, lng: 104.19 }, CHINA: { lat: 35.86, lng: 104.19 },
  JP: { lat: 36.2, lng: 138.25 }, JPN: { lat: 36.2, lng: 138.25 }, JAPAN: { lat: 36.2, lng: 138.25 },
  KR: { lat: 35.91, lng: 127.77 }, KOR: { lat: 35.91, lng: 127.77 }, "SOUTH KOREA": { lat: 35.91, lng: 127.77 },
  SG: { lat: 1.35, lng: 103.82 }, SGP: { lat: 1.35, lng: 103.82 }, SINGAPORE: { lat: 1.35, lng: 103.82 },
  HK: { lat: 22.32, lng: 114.17 }, HKG: { lat: 22.32, lng: 114.17 }, "HONG KONG": { lat: 22.32, lng: 114.17 },
  MX: { lat: 23.63, lng: -102.55 }, MEX: { lat: 23.63, lng: -102.55 }, MEXICO: { lat: 23.63, lng: -102.55 },
  BR: { lat: -14.24, lng: -51.93 }, BRA: { lat: -14.24, lng: -51.93 }, BRAZIL: { lat: -14.24, lng: -51.93 },
  AR: { lat: -38.42, lng: -63.62 }, ARG: { lat: -38.42, lng: -63.62 }, ARGENTINA: { lat: -38.42, lng: -63.62 },
  ZA: { lat: -30.56, lng: 22.94 }, ZAF: { lat: -30.56, lng: 22.94 }, "SOUTH AFRICA": { lat: -30.56, lng: 22.94 },
};

function countryCentroid(raw: string): { lat: number; lng: number } | null {
  const k = raw.trim().toUpperCase();
  return COUNTRY_CENTROIDS[k] ?? null;
}

// Normalize country values (codes or names) to a stable display key for clustering.
function normalizeCountryKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = raw.trim().toUpperCase();
  if (k.length === 0) return null;
  // If it's a known alias, return the longest known alias name (e.g. "UNITED STATES")
  // Pick the first matching name (non-2/3 letter code) for display, else uppercase code.
  if (COUNTRY_CENTROIDS[k]) {
    const name = Object.keys(COUNTRY_CENTROIDS).find(
      (key) => key.length > 3 && COUNTRY_CENTROIDS[key].lat === COUNTRY_CENTROIDS[k].lat &&
               COUNTRY_CENTROIDS[key].lng === COUNTRY_CENTROIDS[k].lng,
    );
    return name ?? k;
  }
  return k;
}

// Reverse-lookup: nearest country centroid (within ~1500km) for a coordinate.
// Used as a fallback for tournaments which only have venueLat/Lng (no country column).
function nearestCountry(lat: number, lng: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const [name, c] of Object.entries(COUNTRY_CENTROIDS)) {
    if (name.length <= 3) continue; // prefer the long-name entries for display
    const dLat = lat - c.lat;
    const dLng = lng - c.lng;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) { bestD = d; best = name; }
  }
  // ~15° = ~1500km cap so a far-away pin doesn't get falsely attributed
  return bestD <= 15 * 15 ? best : null;
}

type DoubleCol = typeof locations.lat;

function inBboxSql(latCol: DoubleCol, lngCol: DoubleCol, bbox: ReturnType<typeof parseBbox>) {
  if (!bbox) return undefined;
  return and(
    isNotNull(latCol),
    isNotNull(lngCol),
    gte(latCol, bbox.minLat),
    lte(latCol, bbox.maxLat),
    gte(lngCol, bbox.minLng),
    lte(lngCol, bbox.maxLng),
  );
}

// GET /api/discovery/map?bbox=minLat,minLng,maxLat,maxLng&types=academies,lessons,matches,tournaments&limit=500
router.get("/api/discovery/map", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const bbox = parseBbox(req.query.bbox);
    const limit = Math.min(parseInt((req.query.limit as string) || "500", 10) || 500, 2000);
    const typesRaw = (req.query.types as string) || "academies,lessons,matches,tournaments";
    const wanted = new Set(typesRaw.split(",").map((s) => s.trim().toLowerCase()));

    const pins: MapPin[] = [];

    // ----- Academies -----
    if (wanted.has("academies")) {
      // First location row per academy that has lat/lng (using DISTINCT ON via raw SQL)
      const rows = await db.execute(sql`
        SELECT DISTINCT ON (a.id)
          a.id AS id,
          a.name AS name,
          a.city AS city,
          a.country AS country,
          a.average_rating AS rating,
          l.lat AS lat,
          l.lng AS lng
        FROM academies a
        INNER JOIN locations l ON l.academy_id = a.id
        WHERE l.lat IS NOT NULL AND l.lng IS NOT NULL
          AND COALESCE(a.profile_visibility, 'public') = 'public'
          ${bbox ? sql`AND l.lat BETWEEN ${bbox.minLat} AND ${bbox.maxLat}
                       AND l.lng BETWEEN ${bbox.minLng} AND ${bbox.maxLng}` : sql``}
        ORDER BY a.id, l.created_at ASC
        LIMIT ${limit}
      `);
      const academyRows = (rows as { rows?: {
        id: string; name: string; city: string | null; country: string | null;
        rating: string | number | null; lat: number | string | null; lng: number | string | null;
      }[] }).rows ?? [];
      for (const r of academyRows) {
        const lat = Number(r.lat);
        const lng = Number(r.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const country = normalizeCountryKey(r.country) ?? nearestCountry(lat, lng);
        pins.push({
          id: `academy:${r.id}`,
          type: "academy",
          lat,
          lng,
          title: r.name,
          subtitle: [r.city, r.country].filter(Boolean).join(", ") || undefined,
          country,
          city: r.city || null,
          meta: { academyId: r.id, rating: r.rating ? Number(r.rating) : null },
        });
      }
    }

    // ----- Lessons (open group/semi-private sessions in the future with spots) -----
    if (wanted.has("lessons")) {
      const sessionRows = await db
        .select({
          id: sessions.id,
          title: sessions.title,
          sessionType: sessions.sessionType,
          startTime: sessions.startTime,
          maxPlayers: sessions.maxPlayers,
          ballLevel: sessions.ballLevel,
          academyId: sessions.academyId,
          academyCountry: academies.country,
          academyCity: academies.city,
          locationName: locations.name,
          lat: locations.lat,
          lng: locations.lng,
        })
        .from(sessions)
        .innerJoin(locations, eq(sessions.locationId, locations.id))
        .innerJoin(academies, eq(sessions.academyId, academies.id))
        .where(
          and(
            inArray(sessions.sessionType, ["group", "semi_private"]),
            eq(sessions.status, "scheduled"),
            gt(sessions.startTime, new Date()),
            // Only "open" lessons: at least one spot left.
            sql`(
              SELECT COUNT(*) FROM session_players sp
              WHERE sp.session_id = ${sessions.id}
                AND (sp.attendance_status IS NULL OR sp.attendance_status <> 'absent')
            ) < ${sessions.maxPlayers}`,
            inBboxSql(locations.lat, locations.lng, bbox),
          )
        )
        .limit(limit);
      for (const s of sessionRows) {
        if (s.lat == null || s.lng == null) continue;
        const lat = Number(s.lat);
        const lng = Number(s.lng);
        const country = normalizeCountryKey(s.academyCountry) ?? nearestCountry(lat, lng);
        pins.push({
          id: `lesson:${s.id}`,
          type: "lesson",
          lat,
          lng,
          title: s.title || (s.sessionType === "group" ? "Group lesson" : "Semi-private lesson"),
          subtitle: s.locationName || undefined,
          country,
          city: s.academyCity || null,
          meta: {
            sessionId: s.id,
            startTime: s.startTime,
            maxPlayers: s.maxPlayers,
            ballLevel: s.ballLevel,
            academyId: s.academyId,
          },
        });
      }
    }

    // ----- Open matches (via courtBookings → courts → locations) -----
    if (wanted.has("matches")) {
      const matchRows = await db
        .select({
          id: openMatches.id,
          title: openMatches.title,
          matchType: openMatches.matchType,
          maxPlayers: openMatches.maxPlayers,
          currentPlayers: openMatches.currentPlayers,
          requiredBallLevel: openMatches.requiredBallLevel,
          visibility: openMatches.visibility,
          date: courtBookings.date,
          startTime: courtBookings.startTime,
          locationName: locations.name,
          academyCountry: academies.country,
          academyCity: academies.city,
          lat: locations.lat,
          lng: locations.lng,
        })
        .from(openMatches)
        .innerJoin(courtBookings, eq(openMatches.bookingId, courtBookings.id))
        .innerJoin(courts, eq(courtBookings.courtId, courts.id))
        .innerJoin(locations, eq(courts.locationId, locations.id))
        .leftJoin(academies, eq(locations.academyId, academies.id))
        .where(
          and(
            eq(openMatches.status, "open"),
            ne(openMatches.visibility, "friends_only"),
            inBboxSql(locations.lat, locations.lng, bbox),
          )
        )
        .limit(limit);
      for (const m of matchRows) {
        if (m.lat == null || m.lng == null) continue;
        const lat = Number(m.lat);
        const lng = Number(m.lng);
        const country = normalizeCountryKey(m.academyCountry) ?? nearestCountry(lat, lng);
        pins.push({
          id: `match:${m.id}`,
          type: "match",
          lat,
          lng,
          title: m.title || (m.matchType === "doubles" ? "Open doubles match" : "Open match"),
          subtitle: m.locationName || undefined,
          country,
          city: m.academyCity || null,
          meta: {
            matchId: m.id,
            matchType: m.matchType,
            spotsLeft: (m.maxPlayers ?? 2) - (m.currentPlayers ?? 1),
            ballLevel: m.requiredBallLevel,
            date: m.date,
            startTime: m.startTime,
          },
        });
      }
    }

    // ----- Public tournaments -----
    if (wanted.has("tournaments")) {
      const tRows = await db
        .select({
          id: tournaments.id,
          name: tournaments.name,
          sport: tournaments.sport,
          startDate: tournaments.startDate,
          endDate: tournaments.endDate,
          location: tournaments.location,
          spotsTotal: tournaments.spotsTotal,
          status: tournaments.status,
          venueLat: tournaments.venueLat,
          venueLng: tournaments.venueLng,
        })
        .from(tournaments)
        .where(
          and(
            eq(tournaments.isPublic, true),
            inArray(tournaments.status, ["upcoming", "registration_open", "in_progress"]),
            isNotNull(tournaments.venueLat),
            isNotNull(tournaments.venueLng),
            bbox
              ? and(
                  gte(sql`${tournaments.venueLat}::float`, bbox.minLat),
                  lte(sql`${tournaments.venueLat}::float`, bbox.maxLat),
                  gte(sql`${tournaments.venueLng}::float`, bbox.minLng),
                  lte(sql`${tournaments.venueLng}::float`, bbox.maxLng),
                )
              : undefined,
          )
        )
        .limit(limit);
      for (const t of tRows) {
        const lat = t.venueLat != null ? Number(t.venueLat) : null;
        const lng = t.venueLng != null ? Number(t.venueLng) : null;
        if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const country = nearestCountry(lat, lng);
        pins.push({
          id: `tournament:${t.id}`,
          type: "tournament",
          lat,
          lng,
          title: t.name,
          subtitle: t.location || undefined,
          country,
          city: null,
          meta: {
            tournamentId: t.id,
            sport: t.sport,
            startDate: t.startDate,
            endDate: t.endDate,
            status: t.status,
          },
        });
      }
    }

    let defaultCenter: { lat: number; lng: number; source: "player_country" } | null = null;
    if (req.user?.playerId) {
      try {
        const p = await db.select({ country: players.country }).from(players).where(eq(players.id, req.user.playerId)).limit(1);
        const country = p[0]?.country;
        if (country) {
          const c = countryCentroid(country);
          if (c) defaultCenter = { ...c, source: "player_country" };
        }
      } catch {
        // non-fatal
      }
    }

    res.json({ pins, count: pins.length, defaultCenter });
  } catch (error) {
    console.error("[DiscoveryMap] error:", error);
    res.status(500).json({ error: "Failed to fetch discovery map data" });
  }
});

export default router;
