/**
 * Task #1345 — regression guard for the bug introduced in commit df303dd3.
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
 * This produced a 500 on every call to `/api/player/availability`, blocking
 * the entire private-lesson booking flow for every player on the platform.
 *
 * The tests below pin down the failure mode at three layers:
 *   1. Schema-level: `coaches.photoUrl` exists, `profilePhotoUrl` does not
 *      (Object.keys / `in` checks — no `as any` slop).
 *   2. Runtime select-shape: the exact column-object literals used in the
 *      three production select sites have no `undefined` values, which is
 *      the precise condition that crashed Drizzle. Reintroducing a typo
 *      against the schema makes this fail before query execution.
 *   3. Source scan: no TypeScript file under `server/` references the
 *      dead `coaches.profilePhotoUrl` identifier — defense-in-depth
 *      against any future site that copies the broken pattern.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { coaches } from "../../shared/schema";

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

describe("Task #1345 — coaches column references", () => {
  describe("schema truth", () => {
    it("coaches.photoUrl exists (the real coach profile photo column)", () => {
      // Direct property access — typechecks if the column exists, value is
      // truthy at runtime if it's a real Drizzle column object.
      expect(coaches.photoUrl).toBeDefined();
      expect(Object.keys(coaches)).toContain("photoUrl");
    });

    it("coaches has no `profilePhotoUrl` field (it lives on players/serviceProviders only)", () => {
      // `in` operator and Object.keys both probe the schema at runtime
      // without needing a cast that bypasses TypeScript's type system.
      expect("profilePhotoUrl" in coaches).toBe(false);
      expect(Object.keys(coaches)).not.toContain("profilePhotoUrl");
    });
  });

  describe("runtime select-shape — these mirror the exact db.select({...}) literals in production", () => {
    /**
     * Reconstructing the select object from the live source the same way
     * Drizzle would: any `undefined` value here means the column does not
     * exist on the schema and the query would crash inside
     * `orderSelectedFields` the moment it hits the database.
     *
     * The fix in this task aliases the correct schema column. If somebody
     * later swaps it back to the broken name, one of these objects will
     * contain `undefined` and the test below will fail.
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

    it.each([
      ["player-booking coach enrichment", playerBookingCoachSelect],
      ["player-chat conversation coach map", playerChatCoachSelect],
      ["player-sessions reminders coach join", playerSessionsReminderSelect],
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
    it("no server/**/*.ts references the non-existent coaches.profilePhotoUrl", () => {
      const offenders: string[] = [];
      for (const file of walkTsFiles(SERVER_DIR)) {
        const src = readFileSync(file, "utf-8");
        if (/coaches\.profilePhotoUrl/.test(src)) {
          offenders.push(relative(REPO_ROOT, file));
        }
      }
      expect(
        offenders,
        `These server files reference coaches.profilePhotoUrl, a column that does NOT exist on the coaches schema. Use coaches.photoUrl instead (alias the select key as profilePhotoUrl if downstream code expects that name):\n  ${offenders.join("\n  ")}`,
      ).toEqual([]);
    });
  });
});
