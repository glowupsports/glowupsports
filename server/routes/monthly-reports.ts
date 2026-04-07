import { Router, Response } from "express";
import { db } from "../db";
import {
  playerMonthlyReports,
  players,
  parentPlayerRelations,
  academies,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  AuthenticatedRequest,
  authMiddlewareWithFreshData as authMiddleware,
  requireAcademy,
} from "../auth";
import { generateMonthlyReportForPlayer, generateReportHtml, generateReportPdf } from "../services/monthly-parent-reports";

const router = Router();

function getCurrentMonthYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}


router.get(
  "/api/parent/children/:playerId/reports",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { playerId } = req.params;

      const parentRelation = await db
        .select({ id: parentPlayerRelations.id })
        .from(parentPlayerRelations)
        .where(
          and(
            eq(parentPlayerRelations.parentUserId, userId),
            eq(parentPlayerRelations.playerId, playerId)
          )
        )
        .limit(1);

      const player = await db
        .select({ parentUserId: players.parentUserId })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      const isLinked =
        parentRelation.length > 0 ||
        (player.length > 0 && player[0].parentUserId === userId);

      if (!isLinked) {
        return res.status(403).json({ error: "Access denied" });
      }

      const reports = await db
        .select()
        .from(playerMonthlyReports)
        .where(
          and(
            eq(playerMonthlyReports.playerId, playerId),
            eq(playerMonthlyReports.status, "finalised")
          )
        )
        .orderBy(desc(playerMonthlyReports.monthYear))
        .limit(24);

      res.json(reports);
    } catch (error) {
      console.error("[MonthlyReports] Error fetching parent reports:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  }
);

router.get(
  "/api/parent/children/:playerId/reports/:reportId",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { playerId, reportId } = req.params;

      const parentRelation = await db
        .select({ id: parentPlayerRelations.id })
        .from(parentPlayerRelations)
        .where(
          and(
            eq(parentPlayerRelations.parentUserId, userId),
            eq(parentPlayerRelations.playerId, playerId)
          )
        )
        .limit(1);

      const player = await db
        .select({ parentUserId: players.parentUserId, firstName: players.firstName, lastName: players.lastName, name: players.name, academyId: players.academyId })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      const isLinked =
        parentRelation.length > 0 ||
        (player.length > 0 && player[0].parentUserId === userId);

      if (!isLinked) {
        return res.status(403).json({ error: "Access denied" });
      }

      const [report] = await db
        .select()
        .from(playerMonthlyReports)
        .where(
          and(
            eq(playerMonthlyReports.id, reportId),
            eq(playerMonthlyReports.playerId, playerId),
            eq(playerMonthlyReports.status, "finalised")
          )
        )
        .limit(1);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      res.json(report);
    } catch (error) {
      console.error("[MonthlyReports] Error fetching report:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  }
);

router.get(
  "/api/parent/children/:playerId/reports/:reportId/preview",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { playerId, reportId } = req.params;

      const parentRelation = await db
        .select({ id: parentPlayerRelations.id })
        .from(parentPlayerRelations)
        .where(
          and(
            eq(parentPlayerRelations.parentUserId, userId),
            eq(parentPlayerRelations.playerId, playerId)
          )
        )
        .limit(1);

      const [playerRow] = await db
        .select({
          parentUserId: players.parentUserId,
          firstName: players.firstName,
          lastName: players.lastName,
          name: players.name,
          academyId: players.academyId,
        })
        .from(players)
        .where(eq(players.id, playerId));

      const isLinked =
        parentRelation.length > 0 ||
        (playerRow && playerRow.parentUserId === userId);

      if (!isLinked) {
        return res.status(403).json({ error: "Access denied" });
      }

      const [report] = await db
        .select()
        .from(playerMonthlyReports)
        .where(
          and(
            eq(playerMonthlyReports.id, reportId),
            eq(playerMonthlyReports.playerId, playerId),
            eq(playerMonthlyReports.status, "finalised")
          )
        )
        .limit(1);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      const playerName = playerRow?.name || `${playerRow?.firstName || ""} ${playerRow?.lastName || ""}`.trim() || "Player";
      let academyName = "Academy";
      if (report.academyId) {
        const [academy] = await db.select({ name: academies.name }).from(academies).where(eq(academies.id, report.academyId));
        if (academy) academyName = academy.name;
      }

      const html = generateReportHtml(report, playerName, academyName);
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error) {
      console.error("[MonthlyReports] Error generating parent preview:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  }
);

router.get(
  "/api/parent/children/:playerId/reports/:reportId/pdf",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { playerId, reportId } = req.params;

      const parentRelation = await db
        .select({ id: parentPlayerRelations.id })
        .from(parentPlayerRelations)
        .where(
          and(
            eq(parentPlayerRelations.parentUserId, userId),
            eq(parentPlayerRelations.playerId, playerId)
          )
        )
        .limit(1);

      const [playerRow] = await db
        .select({
          parentUserId: players.parentUserId,
          firstName: players.firstName,
          lastName: players.lastName,
          name: players.name,
          academyId: players.academyId,
        })
        .from(players)
        .where(eq(players.id, playerId));

      const isLinked =
        parentRelation.length > 0 ||
        (playerRow && playerRow.parentUserId === userId);

      if (!isLinked) {
        return res.status(403).json({ error: "Access denied" });
      }

      const [report] = await db
        .select()
        .from(playerMonthlyReports)
        .where(
          and(
            eq(playerMonthlyReports.id, reportId),
            eq(playerMonthlyReports.playerId, playerId),
            eq(playerMonthlyReports.status, "finalised")
          )
        )
        .limit(1);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      const playerName = playerRow?.name || `${playerRow?.firstName || ""} ${playerRow?.lastName || ""}`.trim() || "Player";

      let academyName = "Tennis Academy";
      if (report.academyId) {
        const [academy] = await db
          .select({ name: academies.name })
          .from(academies)
          .where(eq(academies.id, report.academyId));
        if (academy) academyName = academy.name;
      }

      const pdfBuffer = await generateReportPdf(report, playerName, academyName);
      const filename = `monthly-report-${report.monthYear}-${playerName.replace(/\s+/g, "-")}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("[MonthlyReports] Error generating PDF:", error);
      res.status(500).json({ error: "Failed to generate report PDF" });
    }
  }
);

router.get(
  "/api/coach/players/:playerId/monthly-reports",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user!.academyId!;

      const [player] = await db
        .select({ academyId: players.academyId })
        .from(players)
        .where(eq(players.id, playerId));

      if (!player || player.academyId !== academyId) {
        return res.status(404).json({ error: "Player not found" });
      }

      const reports = await db
        .select()
        .from(playerMonthlyReports)
        .where(eq(playerMonthlyReports.playerId, playerId))
        .orderBy(desc(playerMonthlyReports.monthYear))
        .limit(24);

      res.json(reports);
    } catch (error) {
      console.error("[MonthlyReports] Error fetching coach reports:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  }
);

router.get(
  "/api/coach/players/:playerId/monthly-reports/:reportId",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, reportId } = req.params;
      const academyId = req.user!.academyId!;

      const [player] = await db
        .select({ academyId: players.academyId, firstName: players.firstName, lastName: players.lastName, name: players.name })
        .from(players)
        .where(eq(players.id, playerId));

      if (!player || player.academyId !== academyId) {
        return res.status(404).json({ error: "Player not found" });
      }

      const [report] = await db
        .select()
        .from(playerMonthlyReports)
        .where(
          and(
            eq(playerMonthlyReports.id, reportId),
            eq(playerMonthlyReports.playerId, playerId)
          )
        )
        .limit(1);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      const playerName = player.name || `${player.firstName || ""} ${player.lastName || ""}`.trim();
      let academyName = "Tennis Academy";
      const [academy] = await db.select({ name: academies.name }).from(academies).where(eq(academies.id, academyId));
      if (academy) academyName = academy.name;

      res.json({ ...report, playerName, academyName });
    } catch (error) {
      console.error("[MonthlyReports] Error fetching report:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  }
);

router.patch(
  "/api/coach/players/:playerId/monthly-reports/:reportId/note",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, reportId } = req.params;
      const academyId = req.user!.academyId!;
      const coachId = req.user!.coachId;
      const { coachNote } = req.body;

      if (typeof coachNote !== "string") {
        return res.status(400).json({ error: "coachNote must be a string" });
      }

      const [player] = await db
        .select({ academyId: players.academyId })
        .from(players)
        .where(eq(players.id, playerId));

      if (!player || player.academyId !== academyId) {
        return res.status(404).json({ error: "Player not found" });
      }

      const [report] = await db
        .select({ id: playerMonthlyReports.id })
        .from(playerMonthlyReports)
        .where(
          and(
            eq(playerMonthlyReports.id, reportId),
            eq(playerMonthlyReports.playerId, playerId)
          )
        )
        .limit(1);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      const trimmedNote = coachNote.trim();
      await db
        .update(playerMonthlyReports)
        .set({
          coachNote: trimmedNote.length > 0 ? trimmedNote : null,
          coachId: coachId ?? undefined,
        })
        .where(eq(playerMonthlyReports.id, reportId));

      res.json({ success: true });
    } catch (error) {
      console.error("[MonthlyReports] Error saving coach note:", error);
      res.status(500).json({ error: "Failed to save coach note" });
    }
  }
);

router.post(
  "/api/coach/players/:playerId/monthly-reports/:reportId/finalise",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, reportId } = req.params;
      const academyId = req.user!.academyId!;

      const [player] = await db
        .select({ academyId: players.academyId })
        .from(players)
        .where(eq(players.id, playerId));

      if (!player || player.academyId !== academyId) {
        return res.status(404).json({ error: "Player not found" });
      }

      const [report] = await db
        .select({ id: playerMonthlyReports.id })
        .from(playerMonthlyReports)
        .where(
          and(
            eq(playerMonthlyReports.id, reportId),
            eq(playerMonthlyReports.playerId, playerId)
          )
        )
        .limit(1);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      const pdfRef = `/api/parent/children/${playerId}/reports/${reportId}/pdf`;
      await db
        .update(playerMonthlyReports)
        .set({
          status: "finalised",
          finalisedAt: new Date(),
          pdfUrl: pdfRef,
        })
        .where(eq(playerMonthlyReports.id, reportId));

      res.json({ success: true });
    } catch (error) {
      console.error("[MonthlyReports] Error finalising report:", error);
      res.status(500).json({ error: "Failed to finalise report" });
    }
  }
);

router.post(
  "/api/coach/players/:playerId/monthly-reports/generate",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user!.academyId!;
      const { monthYear } = req.body;

      const targetMonth = monthYear || getCurrentMonthYear();

      const [player] = await db
        .select({ academyId: players.academyId })
        .from(players)
        .where(eq(players.id, playerId));

      if (!player || player.academyId !== academyId) {
        return res.status(404).json({ error: "Player not found" });
      }

      const reportId = await generateMonthlyReportForPlayer(playerId, targetMonth, academyId);

      if (!reportId) {
        return res.status(500).json({ error: "Failed to generate report" });
      }

      const [report] = await db
        .select()
        .from(playerMonthlyReports)
        .where(eq(playerMonthlyReports.id, reportId));

      res.json(report);
    } catch (error) {
      console.error("[MonthlyReports] Error triggering report generation:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

router.get(
  "/api/coach/players/:playerId/monthly-reports/:reportId/preview",
  authMiddleware,
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId, reportId } = req.params;
      const academyId = req.user!.academyId!;

      const [player] = await db
        .select({
          academyId: players.academyId,
          firstName: players.firstName,
          lastName: players.lastName,
          name: players.name,
        })
        .from(players)
        .where(eq(players.id, playerId));

      if (!player || player.academyId !== academyId) {
        return res.status(404).json({ error: "Player not found" });
      }

      const [report] = await db
        .select()
        .from(playerMonthlyReports)
        .where(
          and(
            eq(playerMonthlyReports.id, reportId),
            eq(playerMonthlyReports.playerId, playerId)
          )
        )
        .limit(1);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      const playerName = player.name || `${player.firstName || ""} ${player.lastName || ""}`.trim();
      let academyName = "Tennis Academy";
      const [academy] = await db.select({ name: academies.name }).from(academies).where(eq(academies.id, academyId));
      if (academy) academyName = academy.name;

      const html = generateReportHtml(report, playerName, academyName);
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error) {
      console.error("[MonthlyReports] Error generating preview:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  }
);

export default router;
