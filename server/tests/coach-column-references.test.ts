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
 * The two assertions below pin down both halves of the failure mode:
 *   1. The `photoUrl` field must exist on the coaches schema (so the fix
 *      stays valid if the column is ever renamed).
 *   2. None of the three known consumers (player-booking, player-chat,
 *      player-sessions) may reference the non-existent `coaches.profilePhotoUrl`
 *      again — if someone reintroduces the typo this test fails before
 *      production ever sees a 500.
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
  it("coaches.photoUrl exists (the real coach profile photo column)", () => {
    expect((coaches as any).photoUrl).toBeDefined();
  });

  it("coaches has no `profilePhotoUrl` field (lives on players/serviceProviders only)", () => {
    expect((coaches as any).profilePhotoUrl).toBeUndefined();
  });

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
      `These server files reference coaches.profilePhotoUrl, a column that does NOT exist on the coaches schema. Drizzle accepts undefined in db.select({...}) silently and then crashes at query time with "Cannot convert undefined or null to object" inside orderSelectedFields, returning a 500. Use coaches.photoUrl instead (alias the select key as profilePhotoUrl if downstream code expects that name):\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
