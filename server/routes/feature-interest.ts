// Task #1095 — "Online card payments — coming soon" interest capture.
//
// Two endpoints:
//   POST /api/players/me/feature-interest  (player)   — upsert one row.
//   GET  /api/platform/feature-interest/counts (platform_owner) — aggregate counts.
//
// Kept intentionally tiny: a soft demand signal table. Task #1093 will read it
// to email interested players when online card payments go live.

import { Router, type Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { featureInterest } from "@shared/schema";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  type AuthenticatedRequest,
} from "../auth";
import { storage } from "../storage";

const router = Router();

// Whitelist of allowed feature_key values. Keeps the endpoint from being abused
// to write arbitrary strings into the table.
const ALLOWED_FEATURE_KEYS = new Set<string>([
  "online_card_payments",
]);

router.post(
  "/api/players/me/feature-interest",
  authMiddleware,
  requireRole("player"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser || !freshUser.playerId) {
        return res.status(403).json({ error: "Player profile required" });
      }

      const featureKey = String(req.body?.featureKey ?? "").trim();
      if (!ALLOWED_FEATURE_KEYS.has(featureKey)) {
        return res.status(400).json({ error: "Unknown feature_key" });
      }

      // Upsert: unique on (player_id, feature_key). DO NOTHING keeps the
      // original created_at and is idempotent.
      await db
        .insert(featureInterest)
        .values({ playerId: freshUser.playerId, featureKey })
        .onConflictDoNothing({
          target: [featureInterest.playerId, featureInterest.featureKey],
        });

      return res.json({ recorded: true, featureKey });
    } catch (error) {
      console.error("[feature-interest] POST failed:", error);
      return res.status(500).json({ error: "Failed to record interest" });
    }
  },
);

// GET — single row for the current player, listing every feature_key they've
// already tapped Notify-me on. The client uses this to suppress the link on
// every surface so the player only ever taps once.
router.get(
  "/api/players/me/feature-interest",
  authMiddleware,
  requireRole("player"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tokenUser = req.user!;
      const freshUser = await storage.getUserById(tokenUser.userId);
      if (!freshUser || !freshUser.playerId) {
        return res.json({ featureKeys: [] });
      }

      const rows = await db.execute(sql`
        SELECT feature_key
        FROM feature_interest
        WHERE player_id = ${freshUser.playerId}
      `);

      const featureKeys = (rows.rows as Array<{ feature_key: string }>).map(
        (r) => r.feature_key,
      );
      return res.json({ featureKeys });
    } catch (error) {
      console.error("[feature-interest] GET self failed:", error);
      return res.status(500).json({ error: "Failed to load feature interest" });
    }
  },
);

// Task #1097 — list endpoint for the platform-owner drill-down screen.
// Returns one row per (player, feature_key) tap with player name, academy
// (id + name; nullable for academy-less players) and timestamp. Supports an
// optional ?featureKey=... filter and ?format=csv export. No pagination yet —
// the table is tiny and ordered by created_at desc; revisit if it grows.
router.get(
  "/api/platform/feature-interest",
  authMiddleware,
  requireRole("platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const featureKeyFilter = String(req.query.featureKey ?? "").trim();
      if (featureKeyFilter.length > 0 && !ALLOWED_FEATURE_KEYS.has(featureKeyFilter)) {
        return res.status(400).json({ error: "Unknown feature_key" });
      }
      const useFilter = featureKeyFilter.length > 0;

      const rows = useFilter
        ? await db.execute(sql`
            SELECT fi.id,
                   fi.feature_key,
                   fi.created_at,
                   fi.player_id,
                   p.name AS player_name,
                   a.id   AS academy_id,
                   a.name AS academy_name
            FROM feature_interest fi
            JOIN players p     ON p.id = fi.player_id
            LEFT JOIN academies a ON a.id = p.academy_id
            WHERE fi.feature_key = ${featureKeyFilter}
            ORDER BY fi.created_at DESC
          `)
        : await db.execute(sql`
            SELECT fi.id,
                   fi.feature_key,
                   fi.created_at,
                   fi.player_id,
                   p.name AS player_name,
                   a.id   AS academy_id,
                   a.name AS academy_name
            FROM feature_interest fi
            JOIN players p     ON p.id = fi.player_id
            LEFT JOIN academies a ON a.id = p.academy_id
            ORDER BY fi.created_at DESC
          `);

      type Row = {
        id: string;
        feature_key: string;
        created_at: string | Date;
        player_id: string;
        player_name: string | null;
        academy_id: string | null;
        academy_name: string | null;
      };
      const items = (rows.rows as Row[]).map((r) => ({
        id: r.id,
        featureKey: r.feature_key,
        createdAt:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
        playerId: r.player_id,
        playerName: r.player_name ?? "",
        academyId: r.academy_id,
        academyName: r.academy_name ?? "",
      }));

      if (String(req.query.format ?? "").toLowerCase() === "csv") {
        const escape = (v: unknown) => {
          const s = v === null || v === undefined ? "" : String(v);
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        };
        const header = "feature_key,player_name,academy_name,created_at";
        const lines = items.map((it) =>
          [it.featureKey, it.playerName, it.academyName, it.createdAt]
            .map(escape)
            .join(","),
        );
        const csv = [header, ...lines].join("\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="feature-interest.csv"`,
        );
        return res.send(csv);
      }

      return res.json({ items });
    } catch (error) {
      console.error("[feature-interest] list failed:", error);
      return res.status(500).json({ error: "Failed to load feature interest" });
    }
  },
);

router.get(
  "/api/platform/feature-interest/counts",
  authMiddleware,
  requireRole("platform_owner"),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const rows = await db.execute(sql`
        SELECT feature_key, COUNT(*)::int AS count
        FROM feature_interest
        GROUP BY feature_key
      `);

      const counts: Record<string, number> = {};
      for (const r of rows.rows as Array<{ feature_key: string; count: number }>) {
        counts[r.feature_key] = Number(r.count) || 0;
      }
      return res.json({ counts });
    } catch (error) {
      console.error("[feature-interest] counts failed:", error);
      return res.status(500).json({ error: "Failed to load counts" });
    }
  },
);

export default router;
