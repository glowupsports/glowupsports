import { createServer, type IncomingMessage, type ServerResponse } from "http";

const port = parseInt(process.env.PORT || "5000", 10);
const log = console.log;

let expressApp: any = null;

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (expressApp) {
    return expressApp(req, res);
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok" }));
});

httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
  log(`express server serving on port ${port}`);
  log(`[Health] Server ready for health checks`);
  bootstrapFullServer().catch((err) => {
    console.error("[Server] Bootstrap failed:", err);
  });
});

async function bootstrapFullServer() {
  const express = (await import("express")).default;
  const { default: helmet } = await import("helmet");
  const Sentry = await import("@sentry/node");
  const { createProxyMiddleware } = await import("http-proxy-middleware");
  const fs = await import("fs");
  const path = await import("path");

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: 0.2,
      beforeSend(event) {
        if (process.env.NODE_ENV === "development") return null;
        return event;
      },
    });
    log("[Sentry] Server-side error tracking initialized");
  }

  const app = express();
  app.set("trust proxy", 1);

  app.get("/health", (_req: any, res: any) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/status", (_req: any, res: any) => {
    res.status(200).json({ status: "ok" });
  });

  setupSecurityHeaders(app, helmet);
  setupCors(app);
  setupBodyParsing(app, express);
  setupRequestLogging(app);
  setupExpoDevProxy(app, createProxyMiddleware);
  configureExpoAndLanding(app, fs, path, express);

  const { registerRoutes } = await import("./routes");
  await registerRoutes(app, httpServer);

  setupErrorHandler(app, Sentry);

  expressApp = app;
  log("[Server] Full initialization complete");

  const { startReminderScheduler, startDailyTipScheduler, startAutoSessionCompletionScheduler, startMonthlyReportScheduler, startDailyScheduleNotifier, startCreditExpiryReminderScheduler } = await import("./pushNotifications");

  startReminderScheduler();
  startDailyTipScheduler();
  startAutoSessionCompletionScheduler();
  startMonthlyReportScheduler();
  startDailyScheduleNotifier();
  startCreditExpiryReminderScheduler();

  setTimeout(async () => {
    try {
      const { repairAllPlayerCredits, auditAllPlayerCredits, repairGroupSessionTypes, cleanupGhostSessions } = await import("./storage");

      log("[RepairGroupTypes] Fixing group sessions wrongly converted...");
      const groupResult = await repairGroupSessionTypes();
      log(`[RepairGroupTypes] Complete: ${groupResult.fixed} fixed, ${groupResult.errors.length} errors`);

      try {
        const ghostResult = await cleanupGhostSessions();
        log(`[GhostCleanup] Cancelled ${ghostResult.cancelled} ghost sessions from ended/deleted series`);
      } catch (err) {
        console.error("[GhostCleanup] Failed:", err);
      }

      log("[StartupRepair] Running bulk credit repair...");
      const result = await repairAllPlayerCredits();
      log(`[StartupRepair] Complete: ${result.processed} processed, ${result.consumed} consumed, ${result.debts} debts, ${result.errors} errors`);

      log("[CreditAudit] Running ghost credit audit for ALL players...");
      await auditAllPlayerCredits();
    } catch (error) {
      console.error("[StartupRepair] Failed:", error);
    }
  }, 10000);
}

function setupSecurityHeaders(app: any, helmet: any) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));

  app.use((_req: any, res: any, next: any) => {
    res.header("X-Content-Type-Options", "nosniff");
    res.header("X-Frame-Options", "DENY");
    res.header("X-XSS-Protection", "1; mode=block");
    res.header("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    if (hostname.endsWith('.replit.dev') || hostname.endsWith('.repl.co') || hostname.endsWith('.replit.app') || hostname.endsWith('.spock.replit.dev')) {
      return true;
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function setupCors(app: any) {
  app.use((_req: any, res: any, next: any) => {
    const origin = _req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    } else if (!origin) {
      res.header("Access-Control-Allow-Origin", "*");
    }

    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, expo-platform, x-coaching-language");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Max-Age", "86400");

    if (_req.method === "OPTIONS") {
      return res.status(200).end();
    }

    next();
  });
}

function setupBodyParsing(app: any, expressModule: any) {
  app.use(expressModule.json({ limit: "50mb" }));
  app.use(expressModule.urlencoded({ extended: false, limit: "50mb" }));
}

function setupRequestLogging(app: any) {
  app.use((req: any, res: any, next: any) => {
    const start = Date.now();
    const reqId = `req_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;

    const originalJson = res.json;
    let responseBody: any;

    res.json = function (body: any) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
        const bodyPreview = responseBody
          ? JSON.stringify(responseBody).substring(0, 80)
          : "";
        console.log(
          `[${reqId}] ${req.method} ${req.path} ${res.statusCode} in ${duration}ms :: ${bodyPreview}…`,
        );
      }
    });

    next();
  });
}

function getAppName(): string {
  try {
    const pathMod = require("path");
    const fsMod = require("fs");
    const appJsonPath = pathMod.resolve(process.cwd(), "app.json");
    const appJson = JSON.parse(fsMod.readFileSync(appJsonPath, "utf-8"));
    return appJson?.expo?.name || "Glow Up Sports";
  } catch {
    return "Glow Up Sports";
  }
}

function renderLandingPage(
  landingPageTemplate: string,
  appName: string,
  req: any,
  res: any,
) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function setupExpoDevProxy(app: any, createProxyMiddleware: any) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  log("Setting up Expo dev server proxy on port 5000 -> 8081");

  const expoProxy = createProxyMiddleware({
    target: 'http://localhost:8081',
    changeOrigin: true,
    ws: true,
    logger: console,
    on: {
      error: (err: any, _req: any, res: any) => {
        log(`Expo proxy error: ${err.message} - Metro may still be starting`);
        if (res && typeof (res as any).writeHead === 'function' && !(res as any).headersSent) {
          (res as any).writeHead(503);
          (res as any).end('Metro bundler is starting up, please refresh in a moment...');
        }
      }
    }
  });

  const templateRoutes = ['/support', '/privacy', '/privacy-policy', '/delete-account'];
  app.use((req: any, res: any, next: any) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/uploads') || req.path.startsWith('/assets')) {
      return next();
    }
    if (templateRoutes.includes(req.path)) {
      return next();
    }
    if (req.path === '/manifest' && req.header('expo-platform')) {
      return next();
    }
    if (req.path.includes('.bundle')) {
      return expoProxy(req, res, next);
    }
    if (req.path === '/' || req.path.endsWith('.html') || req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.json') || req.path.endsWith('.png') || req.path.endsWith('.ico')) {
      return next();
    }
    return expoProxy(req, res, next);
  });
}

function configureExpoAndLanding(app: any, fs: any, path: any, expressModule?: any) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  let landingPageTemplate: string;
  try {
    landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  } catch {
    log("[Server] Landing page template not found, using fallback");
    landingPageTemplate = "<html><body><h1>Glow Up Sports</h1><p>Server is running.</p></body></html>";
  }
  const appName = getAppName();

  const privacyPolicyPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "privacy-policy.html",
  );
  const privacyPolicyTemplate = fs.existsSync(privacyPolicyPath)
    ? fs.readFileSync(privacyPolicyPath, "utf-8")
    : null;

  const deleteAccountPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "delete-account.html",
  );
  const deleteAccountTemplate = fs.existsSync(deleteAccountPath)
    ? fs.readFileSync(deleteAccountPath, "utf-8")
    : null;

  const supportPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "support.html",
  );
  const supportTemplate = fs.existsSync(supportPath)
    ? fs.readFileSync(supportPath, "utf-8")
    : null;

  log("Serving static Expo files with dynamic manifest routing");

  app.get("/privacy-policy", (_req: any, res: any) => {
    if (privacyPolicyTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(privacyPolicyTemplate);
    } else {
      res.status(404).send("Privacy policy not found");
    }
  });

  app.get("/privacy", (_req: any, res: any) => {
    if (privacyPolicyTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(privacyPolicyTemplate);
    } else {
      res.status(404).send("Privacy policy not found");
    }
  });

  app.get("/delete-account", (_req: any, res: any) => {
    if (deleteAccountTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(deleteAccountTemplate);
    } else {
      res.status(404).send("Account deletion page not found");
    }
  });

  app.get("/support", (_req: any, res: any) => {
    if (supportTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(supportTemplate);
    } else {
      res.status(404).send("Support page not found");
    }
  });

  const staticBuildDir = path.resolve(process.cwd(), "static-build");
  let latestBuildDir: string | null = null;

  if (fs.existsSync(staticBuildDir)) {
    const dirs = fs.readdirSync(staticBuildDir)
      .filter((d: string) => !isNaN(Number(d)))
      .sort((a: string, b: string) => Number(b) - Number(a));

    if (dirs.length > 0) {
      latestBuildDir = path.join(staticBuildDir, dirs[0]);
    }
  }

  if (latestBuildDir) {
    const staticMiddleware = expressModule || require("express");
    app.use("/_expo/static", staticMiddleware.static(path.join(latestBuildDir, "_expo", "static")));
  }

  const iosDir = path.resolve(staticBuildDir, "ios");
  const androidDir = path.resolve(staticBuildDir, "android");

  const serveStatic = (expressModule || require("express")).static;
  if (fs.existsSync(iosDir)) {
    app.use("/ios", serveStatic(iosDir));
  }
  if (fs.existsSync(androidDir)) {
    app.use("/android", serveStatic(androidDir));
  }

  app.get("/manifest", (req: any, res: any, next: any) => {
    const platform = req.header("expo-platform");
    if (!platform) return next();

    const manifestDir = platform === "ios" ? iosDir : androidDir;
    const manifestPath = path.join(manifestDir, "manifest.json");

    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      res.json(manifest);
    } else {
      res.status(404).json({ error: `No manifest found for platform: ${platform}` });
    }
  });

  app.get("/", (req: any, res: any) => {
    const platform = req.header("expo-platform");
    if (platform) {
      const manifestDir = platform === "ios" ? iosDir : androidDir;
      const manifestPath = path.join(manifestDir, "manifest.json");

      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        return res.json(manifest);
      }
    }
    renderLandingPage(landingPageTemplate, appName, req, res);
  });

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: any, Sentry: any) {
  app.use((err: unknown, _req: any, res: any, _next: any) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    if (process.env.SENTRY_DSN && Sentry && status >= 500) {
      Sentry.captureException(err);
    }

    res.status(status).json({ message });

    if (status >= 500) {
      console.error("[ServerError]", err);
    }
  });
}
