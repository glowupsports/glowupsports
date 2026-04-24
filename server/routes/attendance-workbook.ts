import { Router, type Response } from "express";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  requireAcademy,
  type AuthenticatedRequest,
} from "../auth";
import { buildAttendanceWorkbook } from "../services/attendanceWorkbook";
import { db } from "../db";
import { coachingSeries } from "@shared/schema";
import { eq, asc } from "drizzle-orm";

const router = Router();

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function parseDateOrNull(s: unknown): Date | null {
  if (typeof s !== "string" || !s.trim()) return null;
  // Accept YYYY-MM-DD or ISO datetime
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Lightweight series listing for the workbook filter UI.
// Returns all coaching series in the admin's academy (any status), sorted by title.
router.get(
  "/api/admin/reports/attendance-workbook/series",
  authMiddleware,
  requireRole("admin", "academy_owner", "platform_owner"),
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;
      const rows = await db
        .select({
          id: coachingSeries.id,
          title: coachingSeries.title,
          status: coachingSeries.status,
          ballLevel: coachingSeries.ballLevel,
          sessionType: coachingSeries.sessionType,
        })
        .from(coachingSeries)
        .where(eq(coachingSeries.academyId, academyId))
        .orderBy(asc(coachingSeries.title));
      res.setHeader("Cache-Control", "no-store");
      return res.json({ series: rows });
    } catch (err) {
      console.error("[attendance-workbook] series list failed:", err);
      return res.status(500).json({ error: "Failed to load series" });
    }
  },
);

router.get(
  "/api/admin/reports/attendance-workbook.xlsx",
  authMiddleware,
  requireRole("admin", "academy_owner", "platform_owner"),
  requireAcademy,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const academyId = req.user!.academyId!;

      const now = new Date();
      const defaultTo = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      );
      const defaultFrom = new Date(defaultTo.getTime() - 90 * 24 * 60 * 60 * 1000);

      const fromParam = parseDateOrNull(req.query.from);
      const toParam = parseDateOrNull(req.query.to);

      const from = fromParam
        ? new Date(
            Date.UTC(
              fromParam.getUTCFullYear(),
              fromParam.getUTCMonth(),
              fromParam.getUTCDate(),
              0,
              0,
              0,
              0,
            ),
          )
        : defaultFrom;
      const to = toParam
        ? new Date(
            Date.UTC(
              toParam.getUTCFullYear(),
              toParam.getUTCMonth(),
              toParam.getUTCDate(),
              23,
              59,
              59,
              999,
            ),
          )
        : defaultTo;

      if (from.getTime() > to.getTime()) {
        return res
          .status(400)
          .json({ error: "`from` must be on or before `to`" });
      }

      const ballLevel =
        typeof req.query.ballLevel === "string" && req.query.ballLevel.trim()
          ? req.query.ballLevel.trim()
          : undefined;
      const seriesId =
        typeof req.query.seriesId === "string" && req.query.seriesId.trim()
          ? req.query.seriesId.trim()
          : undefined;

      const buffer = await buildAttendanceWorkbook({
        academyId,
        from,
        to,
        ballLevel,
        seriesId,
      });

      const filename = `academy-attendance_${formatYmd(from)}_${formatYmd(to)}.xlsx`;
      res.setHeader("Content-Type", XLSX_MIME);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(buffer);
    } catch (err) {
      console.error("[attendance-workbook] generation failed:", err);
      return res
        .status(500)
        .json({ error: "Failed to generate attendance workbook" });
    }
  },
);

export default router;
