import type { Express, Request, Response } from "express";
import {
  getAppVersionConfig,
  getAppVersionConfigForPlatform,
  type AppPlatform,
} from "../config/appVersion";

/**
 * GET /api/app-version[?platform=ios|android]
 *
 * Public endpoint, no DB call. Returns the current store version + the
 * minimum supported version + the store URL per platform. Used by the
 * client `ForceUpdateGate` (Task #1321) at cold start (and on long
 * background → foreground transitions) to decide whether to:
 *   - do nothing (`ok`)
 *   - show a dismissible soft prompt (`soft`)
 *   - render a blocking full-screen gate (`force`)
 *
 * Cached for 5 minutes at the edge so 1000 cold starts don't fan out
 * into 1000 backend hits. Client also keeps a react-query staleTime of
 * ~5 min on top of that.
 */
export function registerAppVersionRoutes(app: Express): void {
  app.get("/api/app-version", (req: Request, res: Response) => {
    const rawPlatform = String(req.query.platform || "")
      .trim()
      .toLowerCase();
    const platform: AppPlatform | null =
      rawPlatform === "ios"
        ? "ios"
        : rawPlatform === "android"
          ? "android"
          : null;

    res.set("Cache-Control", "public, max-age=300");

    if (platform) {
      const cfg = getAppVersionConfigForPlatform(platform);
      return res.json({ platform, ...cfg });
    }

    return res.json(getAppVersionConfig());
  });
}
