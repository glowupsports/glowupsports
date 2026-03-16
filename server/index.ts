import express from "express";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import * as Sentry from "@sentry/node";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
import { startReminderScheduler, startDailyTipScheduler, startMonthlyReportScheduler, startOnboardingEmailScheduler, startDailyScheduleNotifier, startCreditExpiryReminderScheduler, repairNullAttendance, fixHolidayOvercharges } from "./pushNotifications";

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
  console.log("[Sentry] Server-side error tracking initialized");
}

const app = express();
app.set('trust proxy', 1);
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupSecurityHeaders(app: express.Application) {
  // Use helmet for comprehensive security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled for Expo compatibility
    crossOriginEmbedderPolicy: false, // Disabled for API compatibility
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow Expo Go to load images
  }));
  
  // Additional custom headers
  app.use((req, res, next) => {
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
    
    // Allow all Replit domains (both .replit.dev and .repl.co variants)
    // Also allow any port on these domains (e.g., :5000 for API calls)
    if (hostname.endsWith('.replit.dev') || hostname.endsWith('.repl.co') || hostname.endsWith('.replit.app') || hostname.endsWith('.spock.replit.dev')) {
      return true;
    }
    
    // Allow localhost for development (any port)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origin = req.header("origin");

    if (origin && isAllowedOrigin(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Cache-Control, X-Academy-Id, X-Active-Player-Id");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const requestId = generateRequestId();
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    // Add request ID to response headers for tracing
    res.setHeader("X-Request-Id", requestId);
    (req as any).requestId = requestId;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      // Structured log format
      const logEntry = {
        timestamp: new Date().toISOString(),
        requestId,
        method: req.method,
        path,
        status: res.statusCode,
        duration,
        userAgent: req.get("user-agent")?.slice(0, 50),
      };

      // Compact single-line format for console
      let logLine = `[${requestId}] ${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 100) {
        logLine = logLine.slice(0, 99) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
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

function setupExpoDevProxy(app: express.Application) {
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
      error: (err, req, res) => {
        log(`Expo proxy error: ${err.message} - Metro may still be starting`);
        if (res && typeof (res as any).writeHead === 'function' && !(res as any).headersSent) {
          (res as any).writeHead(503);
          (res as any).end('Metro bundler is starting up, please refresh in a moment...');
        }
      }
    }
  });

  const templateRoutes = ['/support', '/privacy', '/privacy-policy', '/delete-account'];
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/uploads') || req.path.startsWith('/assets') || req.path.startsWith('/public')) {
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
    if (req.path === '/landing') {
      return next();
    }
    if (req.path === '/') {
      return next();
    }
    if (req.path.endsWith('.html') || req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.json') || req.path.endsWith('.png') || req.path.endsWith('.ico')) {
      return next();
    }
    return expoProxy(req, res, next);
  });
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
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

  app.get("/privacy-policy", (_req: Request, res: Response) => {
    if (privacyPolicyTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(privacyPolicyTemplate);
    } else {
      res.status(404).send("Privacy policy not found");
    }
  });

  app.get("/delete-account", (_req: Request, res: Response) => {
    if (deleteAccountTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(deleteAccountTemplate);
    } else {
      res.status(404).send("Delete account page not found");
    }
  });

  app.get("/support", (_req: Request, res: Response) => {
    if (supportTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(supportTemplate);
    } else {
      res.status(404).send("Support page not found");
    }
  });

  app.get("/privacy", (_req: Request, res: Response) => {
    if (privacyPolicyTemplate) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(privacyPolicyTemplate);
    } else {
      res.status(404).send("Privacy policy not found");
    }
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest" && req.path !== "/landing") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/landing") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    if (req.path === "/") {
      const distIndexPath = path.resolve(process.cwd(), "dist", "index.html");
      if (fs.existsSync(distIndexPath)) {
        return res.sendFile(distIndexPath);
      }
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
  app.use("/images", express.static(path.resolve(process.cwd(), "server/public/images")));
  // Try static-build first, then fall back to dist for static web files
  app.use(express.static(path.resolve(process.cwd(), "static-build")));
  app.use(express.static(path.resolve(process.cwd(), "dist")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    if (process.env.SENTRY_DSN && status >= 500) {
      Sentry.captureException(err);
    }

    res.status(status).json({ message });

    if (status >= 500) {
      console.error("[ServerError]", err);
    }
  });
}

(async () => {
  setupSecurityHeaders(app);
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  setupExpoDevProxy(app);
  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    async () => {
      log(`express server serving on port ${port}`);
      
      startReminderScheduler();
      startDailyTipScheduler();
      // Legacy startAutoSessionCompletionScheduler DISABLED — processAutoCompleteSession now handles
      // both session completion AND attendance+credit processing atomically (every 5 min)
      startMonthlyReportScheduler();
      startDailyScheduleNotifier();
      startCreditExpiryReminderScheduler();
      // Onboarding email scheduler DISABLED - was sending duplicate emails on every server restart
      
      // Run bulk credit repair on startup to fix any missing charges
      try {
        const { repairAllPlayerCredits, auditAllPlayerCredits, repairGroupSessionTypes } = await import("./storage");
        
        log("[RepairGroupTypes] Fixing group sessions wrongly converted...");
        const groupResult = await repairGroupSessionTypes();
        log(`[RepairGroupTypes] Complete: ${groupResult.fixed} fixed, ${groupResult.errors.length} errors`);
        
        // Cleanup ghost sessions from ended/deleted series
        try {
          const { cleanupGhostSessions } = await import("./storage");
          const ghostResult = await cleanupGhostSessions();
          log(`[GhostCleanup] Cancelled ${ghostResult.cancelled} ghost sessions from ended/deleted series`);
        } catch (err) {
          console.error("[GhostCleanup] Failed:", err);
        }
        
        log("[NullAttendanceRepair] Fixing completed sessions with NULL attendance...");
        await repairNullAttendance();
        
        log("[StartupRepair] Running bulk credit repair...");
        const result = await repairAllPlayerCredits();
        log(`[StartupRepair] Complete: ${result.processed} processed, ${result.consumed} consumed, ${result.debts} debts, ${result.errors} errors`);
        
        log("[HolidayOverchargeFix] Correcting any holiday sessions wrongly charged...");
        await fixHolidayOvercharges();
        
        log("[CreditAudit] Running ghost credit audit for ALL players...");
        await auditAllPlayerCredits();
        
        // SAFETY: Debts must NEVER be auto-cancelled — they track what players owe until a package is purchased
      } catch (error) {
        console.error("[StartupRepair] Failed:", error);
      }
    },
  );
})();
