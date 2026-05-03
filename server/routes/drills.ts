import { Router, Response } from "express";
import { db } from "../db";
import { drills, playerSavedDrills, playerDrillLogs, coachAssignedDrills, coaches } from "../../shared/schema";
import { eq, and, desc, isNull, inArray, gte } from "drizzle-orm";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware, requireAcademy, requireRole } from "../auth";
import { awardXP } from "../services/xp-service";

const router = Router();

// ─── Public drill library (coach/academy-filtered) ─────────────────────────

router.get("/api/drills", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const skillArea = (req.query.skill_area || req.query.skillArea) as string | undefined;
    const category = req.query.category as string | undefined;
    const difficulty = req.query.difficulty as string | undefined;
    const { stage, search } = req.query;

    const allDrills = await db.select().from(drills);
    let filtered = allDrills;

    if (skillArea && typeof skillArea === "string") filtered = filtered.filter(d => d.skillArea === skillArea);
    if (category && typeof category === "string") filtered = filtered.filter(d => d.category === category);
    if (difficulty && typeof difficulty === "string") filtered = filtered.filter(d => d.difficulty === difficulty);
    if (stage && typeof stage === "string") {
      filtered = filtered.filter(d => d.stageRange && (d.stageRange as string[]).includes(stage));
    }
    if (search && typeof search === "string") {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(d =>
        d.name.toLowerCase().includes(searchLower) ||
        d.instruction.toLowerCase().includes(searchLower) ||
        (d.milestoneCriteria && d.milestoneCriteria.toLowerCase().includes(searchLower)) ||
        (d.description && d.description.toLowerCase().includes(searchLower))
      );
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ drills: filtered, total: filtered.length });
  } catch (error) {
    console.error("[GET /api/drills]", error);
    res.status(500).json({ error: "Failed to fetch drills" });
  }
});

router.get("/api/drills/:id", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const [drill] = await db.select().from(drills).where(eq(drills.id, id));
    if (!drill) return res.status(404).json({ error: "Drill not found" });
    res.json(drill);
  } catch (error) {
    console.error("[GET /api/drills/:id]", error);
    res.status(500).json({ error: "Failed to fetch drill" });
  }
});

// ─── Player drill endpoints ─────────────────────────────────────────────────

// GET all drills for player (grouped by category, with saved + assigned metadata)
router.get("/api/player/me/drills", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player access required" });

    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;

    const [allDrills, savedRows, assignedRows] = await Promise.all([
      db.select().from(drills),
      db.select().from(playerSavedDrills).where(eq(playerSavedDrills.playerId, playerId)),
      db
        .select({ cad: coachAssignedDrills, d: drills })
        .from(coachAssignedDrills)
        .innerJoin(drills, eq(coachAssignedDrills.drillId, drills.id))
        .where(and(
          eq(coachAssignedDrills.playerId, playerId),
          isNull(coachAssignedDrills.dismissedAt)
        ))
        .orderBy(desc(coachAssignedDrills.assignedAt)),
    ]);

    const savedIds = new Set(savedRows.map(r => r.drillId));

    let filtered = allDrills;
    if (category) filtered = filtered.filter(d => d.category === category);
    if (search) {
      const lower = search.toLowerCase();
      filtered = filtered.filter(d =>
        d.name.toLowerCase().includes(lower) ||
        (d.description && d.description.toLowerCase().includes(lower)) ||
        (d.skillTags && (d.skillTags as string[]).some(t => t.toLowerCase().includes(lower)))
      );
    }
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    const drillsWithMeta = filtered.map(d => ({ ...d, isSaved: savedIds.has(d.id) }));

    // Group by category
    const CATEGORIES = ["Serve", "Forehand", "Backhand", "Footwork", "Net Play", "Match Tactics", "Fitness & Conditioning", "Other"];
    const grouped: Record<string, typeof drillsWithMeta> = {};
    for (const cat of CATEGORIES) {
      const drillsInCat = drillsWithMeta.filter(d => d.category === cat);
      if (drillsInCat.length > 0) grouped[cat] = drillsInCat;
    }

    // Get coach names for assigned drills
    const assignedWithCoach = await Promise.all(
      assignedRows.map(async row => {
        const [coach] = await db.select({ name: coaches.name }).from(coaches).where(eq(coaches.id, row.cad.coachId));
        return { ...row.cad, drill: { ...row.d, isSaved: savedIds.has(row.d.id) }, coachName: coach?.name ?? "Your Coach" };
      })
    );

    res.json({ drills: drillsWithMeta, grouped, assigned: assignedWithCoach, savedIds: Array.from(savedIds) });
  } catch (error) {
    console.error("[GET /api/player/me/drills]", error);
    res.status(500).json({ error: "Failed to fetch drills" });
  }
});

// GET saved drills
router.get("/api/player/me/drills/saved", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player access required" });

    const rows = await db
      .select({ saved: playerSavedDrills, d: drills })
      .from(playerSavedDrills)
      .innerJoin(drills, eq(playerSavedDrills.drillId, drills.id))
      .where(eq(playerSavedDrills.playerId, playerId))
      .orderBy(desc(playerSavedDrills.createdAt));

    res.json({ saved: rows.map(r => ({ ...r.d, isSaved: true })) });
  } catch (error) {
    console.error("[GET /api/player/me/drills/saved]", error);
    res.status(500).json({ error: "Failed to fetch saved drills" });
  }
});

// GET assigned drills
router.get("/api/player/me/drills/assigned", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player access required" });

    const rows = await db
      .select({ cad: coachAssignedDrills, d: drills })
      .from(coachAssignedDrills)
      .innerJoin(drills, eq(coachAssignedDrills.drillId, drills.id))
      .where(and(
        eq(coachAssignedDrills.playerId, playerId),
        isNull(coachAssignedDrills.dismissedAt)
      ))
      .orderBy(desc(coachAssignedDrills.assignedAt));

    const result = await Promise.all(
      rows.map(async row => {
        const [coach] = await db.select({ name: coaches.name }).from(coaches).where(eq(coaches.id, row.cad.coachId));
        return { ...row.cad, drill: row.d, coachName: coach?.name ?? "Your Coach" };
      })
    );

    res.json({ assigned: result });
  } catch (error) {
    console.error("[GET /api/player/me/drills/assigned]", error);
    res.status(500).json({ error: "Failed to fetch assigned drills" });
  }
});

// POST toggle save/unsave drill
router.post("/api/player/me/drills/:id/save", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player access required" });
    const drillId = req.params.id;

    const [existing] = await db
      .select()
      .from(playerSavedDrills)
      .where(and(eq(playerSavedDrills.playerId, playerId), eq(playerSavedDrills.drillId, drillId)));

    if (existing) {
      await db.delete(playerSavedDrills).where(and(
        eq(playerSavedDrills.playerId, playerId),
        eq(playerSavedDrills.drillId, drillId)
      ));
      return res.json({ saved: false });
    } else {
      await db.insert(playerSavedDrills).values({ playerId, drillId }).onConflictDoNothing();
      return res.json({ saved: true });
    }
  } catch (error) {
    console.error("[POST /api/player/me/drills/:id/save]", error);
    res.status(500).json({ error: "Failed to toggle save" });
  }
});

// POST log drill completion (awards XP)
router.post("/api/player/me/drills/:id/log", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player access required" });
    const drillId = req.params.id;
    const { durationDone, rating, notes } = req.body;

    let xpResult: Awaited<ReturnType<typeof awardXP>> | null = null;
    try {
      xpResult = await awardXP(playerId, "drill_completion", "drill", `${drillId}_${Date.now()}`);
    } catch (xpErr) {
      console.error("[drill log] XP award failed (non-fatal):", xpErr);
    }
    const xpAwarded = xpResult?.xpAwarded ?? 0;

    const [log] = await db
      .insert(playerDrillLogs)
      .values({
        playerId,
        drillId,
        durationDone: durationDone ? Number(durationDone) : null,
        rating: rating ? Number(rating) : null,
        notes: notes ?? null,
        xpAwarded,
      })
      .returning();

    res.json({ log, xpAwarded, leveledUp: xpResult?.leveledUp ?? false });
  } catch (error) {
    console.error("[POST /api/player/me/drills/:id/log]", error);
    res.status(500).json({ error: "Failed to log drill" });
  }
});

// GET player drill stats (total logs, weekly logs, current streak)
router.get("/api/player/me/drills/stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player access required" });

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [allLogs, weeklyLogs] = await Promise.all([
      db.select({ id: playerDrillLogs.id, createdAt: playerDrillLogs.createdAt })
        .from(playerDrillLogs)
        .where(eq(playerDrillLogs.playerId, playerId))
        .orderBy(desc(playerDrillLogs.createdAt)),
      db.select({ id: playerDrillLogs.id })
        .from(playerDrillLogs)
        .where(and(eq(playerDrillLogs.playerId, playerId), gte(playerDrillLogs.createdAt, oneWeekAgo))),
    ]);

    // Compute streak: consecutive calendar days (today backwards) with at least one log
    const datesWithLogs = new Set(
      allLogs.map(log => {
        const d = new Date(log.createdAt!);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    );

    let streak = 0;
    const today = new Date();
    for (let i = 0; i <= 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (datesWithLogs.has(key)) {
        streak++;
      } else if (i === 0) {
        // today has no log yet — streak starts from yesterday
        continue;
      } else {
        break;
      }
    }

    res.json({ totalLogs: allLogs.length, weeklyLogs: weeklyLogs.length, currentStreak: streak });
  } catch (error) {
    console.error("[GET /api/player/me/drills/stats]", error);
    res.status(500).json({ error: "Failed to fetch drill stats" });
  }
});

// GET per-drill stats for a player (personal best duration, avg rating, total logs)
router.get("/api/player/me/drills/:id/stats", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player access required" });
    const drillId = req.params.id;

    const logs = await db
      .select({ durationDone: playerDrillLogs.durationDone, rating: playerDrillLogs.rating })
      .from(playerDrillLogs)
      .where(and(eq(playerDrillLogs.playerId, playerId), eq(playerDrillLogs.drillId, drillId)));

    const totalLogs = logs.length;
    const durations = logs.map(l => l.durationDone).filter((d): d is number => d !== null && d !== undefined);
    const ratings = logs.map(l => l.rating).filter((r): r is number => r !== null && r !== undefined);

    const bestDuration = durations.length > 0 ? Math.max(...durations) : null;
    const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;

    res.json({ totalLogs, bestDuration, avgRating });
  } catch (error) {
    console.error("[GET /api/player/me/drills/:id/stats]", error);
    res.status(500).json({ error: "Failed to fetch drill stats" });
  }
});

// POST dismiss assigned drill
router.post("/api/player/me/drills/assigned/:id/dismiss", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "Player access required" });
    const assignmentId = req.params.id;

    await db
      .update(coachAssignedDrills)
      .set({ dismissedAt: new Date() })
      .where(and(eq(coachAssignedDrills.id, assignmentId), eq(coachAssignedDrills.playerId, playerId)));

    res.json({ ok: true });
  } catch (error) {
    console.error("[POST dismiss assigned drill]", error);
    res.status(500).json({ error: "Failed to dismiss" });
  }
});

// ─── Coach drill endpoints ──────────────────────────────────────────────────

// GET drills for coach assignment picker
router.get("/api/coach/drills", authMiddleware, requireRole("coach", "assistant", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const allDrills = await db.select().from(drills);

    let filtered = allDrills;
    if (search) {
      const lower = search.toLowerCase();
      filtered = filtered.filter(d =>
        d.name.toLowerCase().includes(lower) ||
        (d.category && d.category.toLowerCase().includes(lower)) ||
        (d.description && d.description.toLowerCase().includes(lower))
      );
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ drills: filtered, total: filtered.length });
  } catch (error) {
    console.error("[GET /api/coach/drills]", error);
    res.status(500).json({ error: "Failed to fetch drills" });
  }
});

// POST assign drill to player
router.post("/api/coach/players/:playerId/drills/assign", authMiddleware, requireRole("coach", "assistant", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user?.coachId;
    if (!coachId) return res.status(403).json({ error: "Coach access required" });
    const { playerId } = req.params;
    const { drillId, message } = req.body;
    if (!drillId) return res.status(400).json({ error: "drillId required" });

    await db
      .insert(coachAssignedDrills)
      .values({ coachId, playerId, drillId, message: message ?? null })
      .onConflictDoNothing();

    res.json({ ok: true });
  } catch (error) {
    console.error("[POST assign drill]", error);
    res.status(500).json({ error: "Failed to assign drill" });
  }
});

// GET assigned drills for a player (coach view)
router.get("/api/coach/players/:playerId/drills/assigned", authMiddleware, requireRole("coach", "assistant", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const rows = await db
      .select({ cad: coachAssignedDrills, d: drills })
      .from(coachAssignedDrills)
      .innerJoin(drills, eq(coachAssignedDrills.drillId, drills.id))
      .where(eq(coachAssignedDrills.playerId, playerId))
      .orderBy(desc(coachAssignedDrills.assignedAt));

    const drillIds = [...new Set(rows.map(r => r.cad.drillId))];
    const logs = drillIds.length > 0
      ? await db
          .select()
          .from(playerDrillLogs)
          .where(and(eq(playerDrillLogs.playerId, playerId), inArray(playerDrillLogs.drillId, drillIds)))
      : [];

    const logsByDrillId: Record<string, typeof logs> = {};
    for (const log of logs) {
      if (!logsByDrillId[log.drillId]) logsByDrillId[log.drillId] = [];
      logsByDrillId[log.drillId].push(log);
    }

    const assigned = rows.map(r => {
      const drillLogs = (logsByDrillId[r.cad.drillId] ?? [])
        .slice()
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
      const completionCount = drillLogs.length;
      const ratingsWithValue = drillLogs.filter(l => l.rating !== null && l.rating !== undefined);
      const avgRating = ratingsWithValue.length > 0
        ? ratingsWithValue.reduce((sum, l) => sum + (l.rating ?? 0), 0) / ratingsWithValue.length
        : null;
      const lastLoggedAt = drillLogs.length > 0 && drillLogs[0].createdAt ? drillLogs[0].createdAt.toISOString() : null;
      const recentLogs = drillLogs.slice(0, 5).map(l => ({
        id: l.id,
        createdAt: l.createdAt ? l.createdAt.toISOString() : null,
        durationDone: l.durationDone,
        rating: l.rating,
        notes: l.notes,
      }));
      return {
        ...r.cad,
        drill: r.d,
        logSummary: { completionCount, avgRating, lastLoggedAt },
        recentLogs,
      };
    });

    res.json({ assigned });
  } catch (error) {
    console.error("[GET coach assigned drills]", error);
    res.status(500).json({ error: "Failed to fetch assigned drills" });
  }
});

// DELETE unassign a drill
router.delete("/api/coach/drills/assigned/:id", authMiddleware, requireRole("coach", "assistant", "platform_owner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const coachId = req.user?.coachId;
    if (!coachId) return res.status(403).json({ error: "Coach access required" });
    const { id } = req.params;

    await db
      .delete(coachAssignedDrills)
      .where(and(eq(coachAssignedDrills.id, id), eq(coachAssignedDrills.coachId, coachId)));

    res.json({ ok: true });
  } catch (error) {
    console.error("[DELETE assigned drill]", error);
    res.status(500).json({ error: "Failed to remove assignment" });
  }
});

export default router;
