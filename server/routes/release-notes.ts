import type { Express, Request, Response } from "express";
import {
  getReleaseNotes,
  getServerAppVersions,
  normalizeLocale,
  normalizeRole,
} from "../services/release-notes-generator";

/**
 * GET /api/release-notes?role=player&since=1.3.4&locale=en[&fallback=1][&force=1]
 *
 * Returns the "What's New" slides for the current app version.
 *
 * Server-authoritative version handling (cost-abuse mitigation):
 *   - The cache key `version` is taken from app.json on the SERVER side, not
 *     from the client query, so attackers cannot spam unique versions to
 *     bypass the per-(version,role,locale) cache and trigger fresh OpenAI
 *     generations.
 *   - The client may still send a `version` hint; if it matches the
 *     server-known iOS or Android version we use it (so iOS-1.3.4 and
 *     Android-1.3.5 each get their own cache row), otherwise we silently
 *     pin to the server's primary version.
 *
 * Other knobs:
 *   - `fallback=1` → if generation produces no role-relevant slides, return
 *     canned "polish & reliability" slides. Used by the manual "View latest
 *     updates" Settings launcher. The auto boot-flow OMITS this so it gets
 *     an empty `slides` array and silently dismisses when there's nothing
 *     role-relevant to show.
 *   - `force=1` (cache-bypass + OpenAI re-generation) is admin-only via the
 *     `X-Admin-Secret` header (RELEASE_NOTES_ADMIN_SECRET env). Without a
 *     valid header it is silently ignored — never errors, so a curious client
 *     can't probe.
 *
 * Public endpoint — no auth required (release notes are not user-specific).
 */
export function registerReleaseNotesRoutes(app: Express): void {
  app.get("/api/release-notes", async (req: Request, res: Response) => {
    const versionHint = String(req.query.version || "").trim();
    const sinceRaw = String(req.query.since || "").trim();
    const role = normalizeRole(String(req.query.role || ""));
    const locale = normalizeLocale(String(req.query.locale || ""));
    const allowFallback = String(req.query.fallback || "") === "1";
    const forceRequested = String(req.query.force || "") === "1";

    // Cache-bypass is admin-only to prevent OpenAI-cost abuse via `?force=1`.
    const adminSecret = process.env.RELEASE_NOTES_ADMIN_SECRET;
    const headerSecret = String(req.headers["x-admin-secret"] || "");
    const force =
      forceRequested && !!adminSecret && headerSecret === adminSecret;

    // Server-authoritative version: only client hints in the allowlist are
    // honored, everything else is pinned to the primary build version.
    const serverVersions = getServerAppVersions();
    const version =
      versionHint && /^[\w.\-]{1,32}$/.test(versionHint) && serverVersions.all.has(versionHint)
        ? versionHint
        : serverVersions.primary;

    const fromVersion = sinceRaw && /^[\w.\-]{1,32}$/.test(sinceRaw) ? sinceRaw : null;

    try {
      const payload = await getReleaseNotes({
        version,
        role,
        locale,
        fromVersion,
        forceRegenerate: force,
        allowFallback,
      });
      // Cache for 1 hour at the edge — content for a fixed (version,role,locale)
      // never changes once cached.
      res.set("Cache-Control", "public, max-age=3600");
      return res.json({ ...payload, role, locale });
    } catch (err) {
      console.error("[release-notes] route error:", err);
      return res.status(500).json({ error: "Failed to load release notes" });
    }
  });
}
