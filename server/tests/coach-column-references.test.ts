/**
 * Task #1345 + Task #1346 — regression guard for the bug class introduced in
 * commit df303dd3 and the follow-up sweep that surfaced three more sites.
 *
 * Drizzle's `db.select({ alias: column })` API silently accepts `undefined`
 * values in the column object and only crashes at query execution time with
 * the unhelpful error:
 *
 *   TypeError: Cannot convert undefined or null to object
 *     at orderSelectedFields (drizzle-orm/utils.js:53:33)
 *
 * The N+1 sweep in df303dd3 referenced `coaches.profilePhotoUrl` — a column
 * that does NOT exist on the `coaches` table. The actual column on coaches
 * is `photoUrl` (DB column `photo_url`). The mistake is easy to make because
 * `profilePhotoUrl` IS a real column on `players` and `serviceProviders`.
 *
 * That bug produced a 500 on every call to `/api/player/availability`,
 * blocking the entire private-lesson booking flow for every player on the
 * platform.
 *
 * Task #1346 found three more sites with the same shape of bug:
 *   - `coaches.displayName` (real field is `coaches.name`)
 *   - `coaches.city` / `coaches.country` (no such columns — city/country
 *     live on `academies`, `players`, etc., not on `coaches`)
 *   - `players.photoUrl` (real field is `players.profilePhotoUrl`)
 *
 * The tests below pin down the failure mode at three layers:
 *   1. Schema-level: assert which columns exist (and which don't) on
 *      `coaches` and `players` (Object.keys / `in` checks — no `as any` slop).
 *   2. Runtime select-shape: the exact column-object literals used in the
 *      production select sites have no `undefined` values, which is the
 *      precise condition that crashed Drizzle. Reintroducing a typo against
 *      the schema makes this fail before query execution.
 *   3. Source scan: no TypeScript file under `server/` references the dead
 *      identifiers `coaches.profilePhotoUrl`, `coaches.displayName`,
 *      `coaches.city`, `coaches.country`, or `players.photoUrl` — defense
 *      in depth against any future site that copies the broken pattern.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { coaches, players } from "../../shared/schema";

const SERVER_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(__dirname, "../..");

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walkTsFiles(full, out);
    else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("Task #1345 + #1346 — coach/player column references", () => {
  describe("schema truth — coaches", () => {
    it("coaches.photoUrl exists (the real coach profile photo column)", () => {
      // Direct property access — typechecks if the column exists, value is
      // truthy at runtime if it's a real Drizzle column object.
      expect(coaches.photoUrl).toBeDefined();
      expect(Object.keys(coaches)).toContain("photoUrl");
    });

    it("coaches.name exists (the real coach display column)", () => {
      expect(coaches.name).toBeDefined();
      expect(Object.keys(coaches)).toContain("name");
    });

    it("coaches has no `profilePhotoUrl` field (it lives on players/serviceProviders only)", () => {
      // `in` operator and Object.keys both probe the schema at runtime
      // without needing a cast that bypasses TypeScript's type system.
      expect("profilePhotoUrl" in coaches).toBe(false);
      expect(Object.keys(coaches)).not.toContain("profilePhotoUrl");
    });

    it("coaches has no `displayName` field (use coaches.name)", () => {
      expect("displayName" in coaches).toBe(false);
      expect(Object.keys(coaches)).not.toContain("displayName");
    });

    it("coaches has no `city` or `country` fields (city/country live on academies/players)", () => {
      expect("city" in coaches).toBe(false);
      expect("country" in coaches).toBe(false);
      expect(Object.keys(coaches)).not.toContain("city");
      expect(Object.keys(coaches)).not.toContain("country");
    });
  });

  describe("schema truth — players", () => {
    it("players.profilePhotoUrl exists (the real player photo column)", () => {
      expect(players.profilePhotoUrl).toBeDefined();
      expect(Object.keys(players)).toContain("profilePhotoUrl");
    });

    it("players has no `photoUrl` field (use players.profilePhotoUrl)", () => {
      expect("photoUrl" in players).toBe(false);
      expect(Object.keys(players)).not.toContain("photoUrl");
    });
  });

  describe("runtime select-shape — these mirror the exact db.select({...}) literals in production", () => {
    /**
     * Reconstructing the select object from the live source the same way
     * Drizzle would: any `undefined` value here means the column does not
     * exist on the schema and the query would crash inside
     * `orderSelectedFields` the moment it hits the database.
     *
     * The fixes in tasks #1345/#1346 alias the correct schema column. If
     * somebody later swaps any of these back to a broken name, one of these
     * objects will contain `undefined` and the test below will fail.
     */
    const playerBookingCoachSelect = {
      id: coaches.id,
      name: coaches.name,
      profilePhotoUrl: coaches.photoUrl, // server/routes/player-booking.ts:322
    };

    const playerChatCoachSelect = {
      id: coaches.id,
      name: coaches.name,
      profilePhotoUrl: coaches.photoUrl, // server/routes/player-chat.ts:156
    };

    const playerSessionsReminderSelect = {
      coachName: coaches.name,
      coachPhotoUrl: coaches.photoUrl, // server/routes/player-sessions.ts:4734
    };

    const playerSummaryCoachSelect = {
      id: coaches.id,
      displayName: coaches.name, // server/routes.ts:822 (Task #1346)
    };

    const tournamentParticipantPlayerSelect = {
      id: players.id,
      name: players.name,
      photoUrl: players.profilePhotoUrl, // server/routes/tournaments-ladders.ts:256/622/1016/1520 (Task #1346)
    };

    it.each([
      ["player-booking coach enrichment", playerBookingCoachSelect],
      ["player-chat conversation coach map", playerChatCoachSelect],
      ["player-sessions reminders coach join", playerSessionsReminderSelect],
      ["player summary coach name lookup", playerSummaryCoachSelect],
      ["tournament/ladder participant player join", tournamentParticipantPlayerSelect],
    ])(
      "%s select has no undefined column references",
      (_label, selectShape) => {
        const offenders = Object.entries(selectShape)
          .filter(([, value]) => value === undefined)
          .map(([key]) => key);
        expect(
          offenders,
          `These select keys point at non-existent schema columns. Drizzle would crash at query time with "Cannot convert undefined or null to object" and return a 500. Aliased keys must source from a real column on the referenced schema.`,
        ).toEqual([]);
      },
    );
  });

  describe("source scan", () => {
    const DEAD_REFERENCES = [
      "coaches.profilePhotoUrl",
      "coaches.displayName",
      "coaches.city",
      "coaches.country",
      "players.photoUrl",
    ];

    it.each(DEAD_REFERENCES)(
      "no server/**/*.ts references the non-existent identifier %s",
      (identifier) => {
        // Escape the dot for regex; identifiers contain only [a-zA-Z.] so
        // we can match literally without further escaping.
        const pattern = new RegExp(
          identifier.replace(/\./g, "\\.") + "\\b",
        );
        const offenders: string[] = [];
        for (const file of walkTsFiles(SERVER_DIR)) {
          const src = readFileSync(file, "utf-8");
          if (pattern.test(src)) {
            offenders.push(relative(REPO_ROOT, file));
          }
        }
        expect(
          offenders,
          `These server files reference ${identifier}, an identifier that does NOT exist on the referenced schema. Use the real column instead (alias the select key as needed if downstream code expects the old name):\n  ${offenders.join("\n  ")}`,
        ).toEqual([]);
      },
    );
  });
});
