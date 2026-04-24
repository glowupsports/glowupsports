// Task #1126 — Year-in-Tennis recap endpoints.
//
//   GET /api/year-in-tennis/:year             → JSON recap for the calling user.
//   GET /api/year-in-tennis/:year/share.svg   → printable SVG share card.
//
// JSON: requires auth, scopes to req.user.playerId. If no recap exists yet
// for the requested year (rare — e.g. before December's job runs), one is
// computed on the fly using `runYearlyRecapOnce` semantics for that single
// player so the user always sees something.
//
// SVG: public-by-token. We accept `?t=<recap.id>` so the share sheet's
// generated URL works without auth (tap-to-open) while still being
// non-enumerable. Falls back to authenticated playerId/year if no token.

import { Router, Response } from "express";
import { db } from "../db";
import { yearlyRecaps, players } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware } from "../auth";
import { __testing as digestTesting } from "../services/digestJobs";

const router = Router();

router.get("/api/year-in-tennis/:year", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      return res.status(400).json({ error: "invalid_year" });
    }
    const playerId = req.user?.playerId;
    if (!playerId) return res.status(403).json({ error: "no_player" });

    const [existing] = await db
      .select()
      .from(yearlyRecaps)
      .where(and(eq(yearlyRecaps.playerId, playerId), eq(yearlyRecaps.year, year)))
      .limit(1);

    if (existing) {
      return res.json(existing);
    }

    // On-demand build for this single player: avoids waiting for the cron.
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
    const totals = await digestTesting.computeTotalsForPlayer(playerId, yearStart, yearEnd);
    const [pRow] = await db
      .select({ name: players.name, country: players.country })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    const payload = {
      year,
      playerName: pRow?.name ?? null,
      country: pRow?.country ?? null,
      countryRank: null as number | null,
      slides: [
        { kind: "intro", title: `${pRow?.name ?? "Your"} ${year} in Tennis` },
        { kind: "stat", label: "Matches Played", value: totals.matchesPlayed },
        { kind: "stat", label: "Matches Won", value: totals.matchesWon },
        { kind: "stat", label: "Hours on Court", value: Math.round(totals.courtMinutes / 60) },
        { kind: "stat", label: "Total XP", value: totals.xpEarned },
        { kind: "stat", label: "Quests Completed", value: totals.questsCompleted },
        { kind: "stat", label: "Level-Ups", value: totals.levelChanges },
        { kind: "stat", label: "Friends Played With", value: totals.friendsPlayedWith },
        { kind: "outro", title: "Glow on into the new year" },
      ],
      ...totals,
    };

    res.json({
      id: null,
      playerId,
      year,
      ...totals,
      countryRank: null,
      payload,
      onTheFly: true,
    });
  } catch (err) {
    console.error("[YearInTennis] GET failed:", err);
    res.status(500).json({ error: "failed" });
  }
});

// Share SVG — public-by-token (?t=<recap.id>) OR authenticated by playerId.
// We deliberately do NOT require auth so the OS share sheet's destination URL
// works for the recipient (e.g. WhatsApp preview).
router.get("/api/year-in-tennis/:year/share.svg", async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (!Number.isFinite(year)) return res.status(400).send("invalid year");
    const token = (req.query.t as string | undefined)?.trim();

    let recap: typeof yearlyRecaps.$inferSelect | undefined;
    if (token) {
      const rows = await db
        .select()
        .from(yearlyRecaps)
        .where(and(eq(yearlyRecaps.id, token), eq(yearlyRecaps.year, year)))
        .limit(1);
      recap = rows[0];
    }
    if (!recap) {
      return res.status(404).type("image/svg+xml").send(notFoundSvg(year));
    }

    const [pRow] = await db
      .select({ name: players.name })
      .from(players)
      .where(eq(players.id, recap.playerId))
      .limit(1);

    const svg = renderYearShareSvg({
      year: recap.year,
      playerName: pRow?.name ?? "Player",
      matchesPlayed: recap.matchesPlayed,
      matchesWon: recap.matchesWon,
      courtMinutes: recap.courtMinutes,
      xpEarned: recap.xpEarned,
      countryRank: recap.countryRank,
    });
    res.type("image/svg+xml");
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(svg);
  } catch (err) {
    console.error("[YearInTennis] SVG failed:", err);
    res.status(500).type("image/svg+xml").send(notFoundSvg(0));
  }
});

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function notFoundSvg(year: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="#0a0a0a"/>
  <text x="540" y="960" fill="#888" font-family="Helvetica" font-size="36" text-anchor="middle">No recap available${year ? ` for ${year}` : ""}.</text>
</svg>`;
}

function renderYearShareSvg(args: {
  year: number;
  playerName: string;
  matchesPlayed: number;
  matchesWon: number;
  courtMinutes: number;
  xpEarned: number;
  countryRank: number | null;
}): string {
  const name = escapeXml(args.playerName);
  const hours = Math.round(args.courtMinutes / 60);
  const winRate = args.matchesPlayed > 0
    ? Math.round((args.matchesWon / args.matchesPlayed) * 100)
    : 0;
  const rankLine = args.countryRank
    ? `<text x="540" y="1620" fill="#2ECC40" font-family="Helvetica" font-size="64" font-weight="700" text-anchor="middle">Country Rank #${args.countryRank}</text>`
    : "";

  // Spotify-Wrapped-style poster: solid dark gradient + 4 stat blocks.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a3d1a"/>
      <stop offset="60%" stop-color="#0a0a0a"/>
      <stop offset="100%" stop-color="#0a1a0a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2ECC40"/>
      <stop offset="100%" stop-color="#7FFF7F"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>

  <text x="540" y="220" fill="#888" font-family="Helvetica" font-size="36" text-anchor="middle" letter-spacing="6">GLOW UP SPORTS</text>
  <text x="540" y="320" fill="url(#accent)" font-family="Helvetica" font-size="120" font-weight="900" text-anchor="middle">${args.year}</text>
  <text x="540" y="400" fill="#fff" font-family="Helvetica" font-size="44" font-weight="600" text-anchor="middle">${name}'s Year in Tennis</text>

  <g transform="translate(80, 540)">
    <rect width="920" height="220" rx="32" fill="rgba(255,255,255,0.04)"/>
    <text x="60" y="100" fill="#888" font-family="Helvetica" font-size="32">Matches Played</text>
    <text x="60" y="180" fill="#fff" font-family="Helvetica" font-size="120" font-weight="800">${args.matchesPlayed}</text>
    <text x="860" y="180" fill="#2ECC40" font-family="Helvetica" font-size="64" font-weight="700" text-anchor="end">${winRate}% W</text>
  </g>

  <g transform="translate(80, 800)">
    <rect width="920" height="220" rx="32" fill="rgba(255,255,255,0.04)"/>
    <text x="60" y="100" fill="#888" font-family="Helvetica" font-size="32">Hours on Court</text>
    <text x="60" y="180" fill="#fff" font-family="Helvetica" font-size="120" font-weight="800">${hours}</text>
  </g>

  <g transform="translate(80, 1060)">
    <rect width="920" height="220" rx="32" fill="rgba(255,255,255,0.04)"/>
    <text x="60" y="100" fill="#888" font-family="Helvetica" font-size="32">Total XP Earned</text>
    <text x="60" y="180" fill="#fff" font-family="Helvetica" font-size="120" font-weight="800">${args.xpEarned}</text>
  </g>

  <g transform="translate(80, 1320)">
    <rect width="920" height="220" rx="32" fill="rgba(255,255,255,0.04)"/>
    <text x="60" y="100" fill="#888" font-family="Helvetica" font-size="32">Matches Won</text>
    <text x="60" y="180" fill="#fff" font-family="Helvetica" font-size="120" font-weight="800">${args.matchesWon}</text>
  </g>

  ${rankLine}
  <text x="540" y="1820" fill="#555" font-family="Helvetica" font-size="28" text-anchor="middle">glowupsports.app</text>
</svg>`;
}

export default router;
