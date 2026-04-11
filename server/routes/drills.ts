import { Router, Response } from "express";
import { db } from "../db";
import { drills } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware, requireAcademy } from "../auth";

const router = Router();

router.get("/api/drills", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Support both snake_case (skill_area) and camelCase (skillArea) query params
    const skillArea = (req.query.skill_area || req.query.skillArea) as string | undefined;
    const { stage, search } = req.query;

    const allDrills = await db.select().from(drills);

    let filtered = allDrills;

    if (skillArea && typeof skillArea === "string") {
      filtered = filtered.filter(d => d.skillArea === skillArea);
    }

    if (stage && typeof stage === "string") {
      filtered = filtered.filter(d => d.stageRange && (d.stageRange as string[]).includes(stage));
    }

    if (search && typeof search === "string") {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(d =>
        d.name.toLowerCase().includes(searchLower) ||
        d.instruction.toLowerCase().includes(searchLower) ||
        (d.milestoneCriteria && d.milestoneCriteria.toLowerCase().includes(searchLower))
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

    if (!drill) {
      return res.status(404).json({ error: "Drill not found" });
    }

    res.json(drill);
  } catch (error) {
    console.error("[GET /api/drills/:id]", error);
    res.status(500).json({ error: "Failed to fetch drill" });
  }
});

export default router;
