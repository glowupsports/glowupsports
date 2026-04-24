/**
 * Security Audit Summary — Task #117 (March 2026)
 *
 * FIXED:
 * 1. Four admin endpoints in server/routes/player-social.ts lacked requireRole():
 *    - POST /api/admin/repair-private-adjusted  → requireRole("admin","platform_owner")
 *    - POST /api/admin/fix-series-titles-and-merge → requireRole("admin","platform_owner")
 *    - GET  /api/admin/credits/diagnose/:playerId → requireRole("admin","platform_owner")
 *    - POST /api/admin/seed-demo-data → requireRole("platform_owner")
 *    All four return 401 without a valid token; 403 if wrong role.
 *
 * 2. Three route handlers in player-social.ts exposed raw error.message strings in
 *    500 responses, potentially leaking internal DB/system details. Replaced with
 *    generic "Check server logs" messages.
 *
 * 3. POST /api/diagnostics/report (public, unauthenticated) had only the global
 *    300-req/15min rate limiter. Added a dedicated diagnosticsLimiter (20-req/15min)
 *    to prevent abuse. Added Zod schema (diagnosticsReportSchema) — malformed bodies
 *    now return 400 before any DB logic runs.
 *    POST /api/diagnostics/ui-issue (authenticated) also now validates via Zod schema.
 *
 * 4. PII/sensitive data sanitized from server logs:
 *    - emailService.ts [Email] Sent log: masked via maskEmail() (was full address)
 *    - emailService.ts OTP logs: masked via maskEmail() → "joh***@domain.com"
 *    - routes.ts [MonthlyReport] server log: user.email and playerId both removed
 *    - routes.ts [MonthlyReport] error 500 handler: error.message removed from response
 *    - pushNotifications.ts: monthly report error log no longer includes player.playerId
 *
 * VERIFIED OK (no changes needed):
 * - SQL injection: no raw template-literal user input in pool.query() calls (ORM used throughout)
 * - Auth middleware: all financial/credit, player data, and admin routes confirmed protected
 * - Rate limiting: auth routes (authLimiter 10/15min), global API (300/15min) in place
 * - Error handler (setupErrorHandler): already returns only { message }, no stack traces
 * - Helmet + custom security headers: correctly configured for Expo/API compatibility
 * - CORS: validates against allow-list of *.replit.dev, *.repl.co, *.replit.app, localhost
 */
import express from "express";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import * as Sentry from "@sentry/node";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
import { startReminderScheduler, startDailyTipScheduler, startMonthlyReportScheduler, startOnboardingEmailScheduler, startDailyScheduleNotifier, startCreditExpiryReminderScheduler, startWeeklyAIDigestScheduler, startMatchPrepNotificationScheduler, startGlowPlansScheduler, startBirthdayNotificationScheduler, processSessionMaintenance, fixHolidayOvercharges, fixAlmaZaleskiCredits, fixRouzbehGhostCredit } from "./pushNotifications";
import { startBookingExpiryJob } from "./bookingExpiryJob";
import { startPlayerOfWeekJob } from "./playerOfWeekJob";
import { startDigestJobs } from "./services/digestJobs";
import { startFeedPruneScheduler } from "./feedPruneJob";
import { startFamilyPickupNotificationsJob } from "./familyPickupNotificationsJob";

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
  // Use helmet for comprehensive security headers with CSP configured for Replit deployment
  const isDev = process.env.NODE_ENV === 'development';
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "wss:", "ws:", "https:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Allow embedding in Replit canvas iframes during development
        frameAncestors: isDev ? ["'self'", "https://*.spock.replit.dev", "https://*.replit.dev"] : ["'self'"],
      },
    },
    // Disable X-Frame-Options in dev so Replit canvas preview works (we handle it manually below)
    frameguard: !isDev,
    crossOriginEmbedderPolicy: false, // Disabled for API compatibility
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow Expo Go to load images
  }));
  
  // Additional custom headers
  app.use((req, res, next) => {
    res.header("X-Content-Type-Options", "nosniff");
    // Allow iframe embedding in development (Replit canvas preview) but block in production
    if (process.env.NODE_ENV !== 'development') {
      res.header("X-Frame-Options", "DENY");
    }
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

async function checkExpoPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    let body = '';
    const req = http.get(
      { hostname: '127.0.0.1', port, path: '/status', timeout: 1000 },
      (res: http.IncomingMessage) => {
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          const isExpo =
            body.includes('packager-status:running') ||
            String(res.headers['x-powered-by'] || '').toLowerCase().includes('expo') ||
            (String(res.headers['content-type'] || '').includes('application/json') && body.includes('packager'));
          resolve(isExpo);
        });
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

let cachedExpoPort: number | null = null;
let portCacheExpiry = 0;
const PORT_CACHE_TTL_MS = 5000;

async function resolveExpoPort(): Promise<number> {
  const now = Date.now();
  if (cachedExpoPort !== null && now < portCacheExpiry) {
    return cachedExpoPort;
  }
  const candidates = [8081, 8082];
  for (const port of candidates) {
    if (await checkExpoPort(port)) {
      if (cachedExpoPort !== port) {
        log(`Expo dev server detected on port ${port}`);
      }
      cachedExpoPort = port;
      portCacheExpiry = now + PORT_CACHE_TTL_MS;
      return port;
    }
  }
  const defaultPort = 8081;
  log(`Expo dev server not yet reachable on ports ${candidates.join(', ')}, defaulting to ${defaultPort}`);
  cachedExpoPort = defaultPort;
  portCacheExpiry = now + 1000;
  return defaultPort;
}

function setupExpoDevProxy(app: express.Application) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  log('Setting up Expo dev server proxy on port 5000 (dynamic port resolution enabled)');

  const proxyCache = new Map<number, ReturnType<typeof createProxyMiddleware>>();

  function getProxy(port: number) {
    if (!proxyCache.has(port)) {
      proxyCache.set(port, createProxyMiddleware({
        target: `http://localhost:${port}`,
        changeOrigin: true,
        ws: true,
        logger: console,
        on: {
          error: (err: Error, _req: http.IncomingMessage, res: http.ServerResponse) => {
            log(`Expo proxy error (port ${port}): ${err.message} - Metro may still be starting`);
            cachedExpoPort = null;
            portCacheExpiry = 0;
            if (!res.headersSent) {
              res.writeHead(503);
              res.end('Metro bundler is starting up, please refresh in a moment...');
            }
          }
        }
      }));
    }
    return proxyCache.get(port)!;
  }

  // Serve icon fonts directly from Express so the browser can load them without
  // hitting Metro's CORS/origin check (which blocks requests from the Replit domain).
  app.use("/fonts", express.static(
    path.resolve(process.cwd(), "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts"),
    { maxAge: "1d" }
  ));

  const templateRoutes = ['/support', '/privacy', '/privacy-policy', '/delete-account', '/dev-preview'];
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/uploads') || req.path.startsWith('/public')) {
      return next();
    }
    if (req.path.startsWith('/.well-known/') || req.path.startsWith('/group/') || req.path.startsWith('/invite/') || req.path.startsWith('/spectate/')) {
      return next();
    }
    if (templateRoutes.includes(req.path)) {
      return next();
    }
    if (req.path === '/manifest' && req.header('expo-platform')) {
      return next();
    }
    if (req.path === '/landing') {
      return next();
    }
    if (req.path.endsWith('.html') || req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.json') || req.path.endsWith('.png') || req.path.endsWith('.ico') || req.path.endsWith('.jpg') || req.path.endsWith('.jpeg') || req.path.endsWith('.svg') || req.path.endsWith('.webp') || req.path.endsWith('.gif')) {
      return next();
    }
    resolveExpoPort().then((port) => {
      getProxy(port)(req, res, next);
    }).catch(() => getProxy(8081)(req, res, next));
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

  // Task #750 — Password reset deep-link landing page. The email link points
  // here; we render a small page that auto-deep-links into the Glow Up Sports
  // app (`glowupsports://reset-password?token=...`) and offers a manual button
  // as fallback for users who don't have the app installed.
  app.get("/reset-password", (req: Request, res: Response) => {
    const rawToken = typeof req.query.token === "string" ? req.query.token : "";
    const safeToken = rawToken.replace(/[^A-Za-z0-9_\-]/g, "").slice(0, 200);
    const deepLink = safeToken ? `glowupsports://reset-password?token=${encodeURIComponent(safeToken)}` : "";
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset Your Password — Glow Up Sports</title>
<style>
  body{margin:0;background:#0A0A0B;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
  .card{max-width:420px;background:#16161A;border-radius:18px;padding:32px;text-align:center;}
  h1{margin:0 0 8px 0;font-size:24px;color:#32FF7E;}
  p{color:rgba(255,255,255,0.7);font-size:15px;line-height:1.5;}
  a.button{display:inline-block;margin-top:20px;background:#32FF7E;color:#0A0A0B;padding:14px 28px;border-radius:12px;font-weight:800;text-decoration:none;}
  .muted{margin-top:24px;font-size:13px;color:rgba(255,255,255,0.45);}
</style></head><body>
<div class="card">
  <h1>Reset your password</h1>
  ${safeToken ? `
    <p>Tap the button below to open Glow Up Sports and finish resetting your password.</p>
    <a class="button" href="${deepLink}">Open the app</a>
    <p class="muted">If the app doesn't open, install Glow Up Sports first, then tap the link in your email again. The link expires 30 minutes after you requested it.</p>
    <script>setTimeout(function(){ window.location.href = ${JSON.stringify(deepLink)}; }, 250);</script>
  ` : `
    <p>This link is missing a reset token. Open the link from the email we sent you, or request a new password reset from the app.</p>
  `}
</div>
</body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
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

  app.get("/.well-known/apple-app-site-association", (_req: Request, res: Response) => {
    const teamId = process.env.APPLE_TEAM_ID || "TEAMID";
    res.setHeader("Content-Type", "application/json");
    res.json({
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [`${teamId}.com.glowupsports.app`],
            components: [
              { "/": "/group/*", comment: "Group invite deep links" },
            ],
          },
        ],
      },
    });
  });

  app.get("/.well-known/assetlinks.json", (_req: Request, res: Response) => {
    const fingerprints = process.env.ANDROID_SHA256_FINGERPRINT
      ? [process.env.ANDROID_SHA256_FINGERPRINT]
      : [];
    res.setHeader("Content-Type", "application/json");
    res.json([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.glowupsports.app",
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ]);
  });

  app.get("/invite/:code", async (req: Request, res: Response) => {
    const rawCode = req.params.code || "";
    const safeCode = rawCode.replace(/[^a-zA-Z0-9\-_]/g, "");
    if (!safeCode) {
      return res.status(400).send("Invalid invite code");
    }
    const appStoreUrl = "https://apps.apple.com/app/glow-up-sports/id6744871692";
    const playStoreUrl = "https://play.google.com/store/apps/details?id=com.glowupsports.app";
    const iosSchemeUrl = `glowupsports://invite?token=${safeCode}`;
    const androidIntentUrl = `intent://invite?token=${safeCode}#Intent;scheme=glowupsports;package=com.glowupsports.app;S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end`;
    const ua = req.headers["user-agent"] || "";
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isAndroid = /android/i.test(ua);
    const appSchemeUrl = isAndroid ? androidIntentUrl : iosSchemeUrl;

    let playerName = "You";
    let academyName = "Glow Up Sports";
    try {
      const { storage: st } = await import("./storage");
      const invite = await st.getPlayerInvite(safeCode);
      if (invite && invite.status === "pending") {
        const player = await st.getPlayer(invite.playerId);
        if (player) playerName = player.name;
        const academy = await st.getAcademy(invite.academyId);
        if (academy) academyName = academy.name;
      }
    } catch {}

    const forwardedProto = req.header("x-forwarded-proto");
    const protocol = forwardedProto || req.protocol || "https";
    const forwardedHost = req.header("x-forwarded-host");
    const host = forwardedHost || req.get("host") || "";
    const baseUrl = `${protocol}://${host}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Invite — Glow Up Sports</title>
  <meta property="og:title" content="Your Glow Up Sports invite is ready" />
  <meta property="og:description" content="Hi ${escapeHtml(playerName)}! Tap to set up your account at ${escapeHtml(academyName)} on Glow Up Sports." />
  <meta property="og:image" content="${baseUrl}/assets/images/icon.png" />
  <meta property="og:type" content="website" />
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0C1118;
      color: #F0F4F8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #161D28;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .logo-mark {
      width: 64px; height: 64px; border-radius: 16px;
      background: #C8FF3D; display: flex; align-items: center;
      justify-content: center; margin: 0 auto 20px;
    }
    .logo-mark svg { width: 36px; height: 36px; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.5px; }
    .subtitle { font-size: 15px; color: #8A95A3; margin-bottom: 28px; line-height: 1.6; }
    .name-highlight { color: #C8FF3D; font-weight: 700; }
    .btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      width: 100%; padding: 14px 20px; border-radius: 12px; font-size: 15px;
      font-weight: 700; text-decoration: none; margin-bottom: 12px; transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-open { background: #C8FF3D; color: #000; }
    .btn-store { background: #111820; color: #F0F4F8; border: 1px solid rgba(255,255,255,0.1); }
    .divider { color: #445566; font-size: 13px; margin: 4px 0 16px; }
    .code-fallback { margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.07); padding-top: 20px; }
    .code-label { font-size: 11px; color: #556677; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; }
    .code-value { font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #C8FF3D; font-family: 'Courier New', monospace; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-mark">
      <svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M6 12a8 8 0 0 0 12 0"/>
        <path d="M12 2a8 8 0 0 0 0 20"/>
      </svg>
    </div>
    <h1>Welcome, <span class="name-highlight">${escapeHtml(playerName)}</span>!</h1>
    <p class="subtitle">Your spot at <strong style="color:#fff">${escapeHtml(academyName)}</strong> is ready. Tap below to create your account.</p>
    ${isAndroid ? `
    <a class="btn btn-open" href="${appSchemeUrl}">Claim Your Invite</a>
    <div class="divider">Don't have the app yet?</div>
    <a class="btn btn-store" href="${playStoreUrl}">Download on Google Play</a>
    ` : isIOS ? `
    <a class="btn btn-open" href="${appSchemeUrl}">Claim Your Invite</a>
    <div class="divider">Don't have the app yet?</div>
    <a class="btn btn-store" href="${appStoreUrl}">Download on the App Store</a>
    ` : `
    <a class="btn btn-store" href="${appStoreUrl}">Download on the App Store</a>
    `}
    <div class="code-fallback">
      <div class="code-label">Or enter this code manually in the app</div>
      <div class="code-value">${escapeHtml(safeCode)}</div>
    </div>
  </div>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  });

  app.get("/group/:groupId", (req: Request, res: Response) => {
    const rawGroupId = req.params.groupId || "";
    const safeGroupId = rawGroupId.replace(/[^a-zA-Z0-9\-_]/g, "");
    if (!safeGroupId) {
      return res.status(400).send("Invalid group ID");
    }
    const ua = req.headers["user-agent"] || "";
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isAndroid = /android/i.test(ua);
    const appSchemeUrl = `glowupsports://player/group/${safeGroupId}`;
    const appStoreUrl = "https://apps.apple.com/app/glow-up-sports/id6744871692";
    const playStoreUrl = "https://play.google.com/store/apps/details?id=com.glowupsports.app";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join Group — Glow Up Sports</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0C1118;
      color: #F0F4F8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #161D28;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .logo-mark {
      width: 64px;
      height: 64px;
      border-radius: 16px;
      background: #C8FF3D;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
    }
    .logo-mark svg { width: 36px; height: 36px; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.5px; }
    p { font-size: 15px; color: #8A95A3; margin-bottom: 28px; line-height: 1.6; }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 14px 20px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      margin-bottom: 12px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-open { background: #C8FF3D; color: #000; }
    .btn-ios { background: #111820; color: #F0F4F8; border: 1px solid rgba(255,255,255,0.1); }
    .btn-android { background: #111820; color: #F0F4F8; border: 1px solid rgba(255,255,255,0.1); }
    .divider { color: #445566; font-size: 13px; margin: 4px 0 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-mark">
      <svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M6 12a8 8 0 0 0 12 0"/>
        <path d="M12 2a8 8 0 0 0 0 20"/>
      </svg>
    </div>
    <h1>You're invited!</h1>
    <p>Someone shared a group with you on Glow Up Sports. Open the app to join.</p>
    ${isIOS || isAndroid ? `
    <a class="btn btn-open" href="${appSchemeUrl}" id="openApp">Open in Glow Up Sports</a>
    <div class="divider">Don't have the app?</div>
    <a class="btn ${isIOS ? "btn-ios" : "btn-android"}" href="${isIOS ? appStoreUrl : playStoreUrl}">
      ${isIOS ? "Download on the App Store" : "Get it on Google Play"}
    </a>
    ` : `
    <p style="margin-bottom: 16px;">Download the app to join this group:</p>
    <a class="btn btn-ios" href="${appStoreUrl}">Download on the App Store</a>
    <a class="btn btn-android" href="${playStoreUrl}">Get it on Google Play</a>
    `}
  </div>
  <script>
    (function() {
      var appUrl = ${JSON.stringify(appSchemeUrl)};
      var started = Date.now();
      var isIOS = ${isIOS};
      var isAndroid = ${isAndroid};
      var storeUrl = ${JSON.stringify(isIOS ? appStoreUrl : playStoreUrl)};
      if (!isIOS && !isAndroid) return;
      window.location.href = appUrl;
      var timer = setTimeout(function() {
        if (Date.now() - started < 2500) {
          window.location.href = storeUrl;
        }
      }, 1500);
      document.addEventListener('visibilitychange', function() {
        if (document.hidden) clearTimeout(timer);
      });
    })();
  </script>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
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
      if (process.env.NODE_ENV === 'development') {
        return next();
      }
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

  setupExpoDevProxy(app);

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));

  // Authenticated uploads file serving
  // Profile photos in the profile-photos subdirectory are served publicly (needed for public academy/coach profiles)
  app.use("/uploads/profile-photos", express.static(path.resolve(process.cwd(), "uploads/profile-photos")));

  // Social post media is public (community feed images)
  app.use("/uploads/social-posts", express.static(path.resolve(process.cwd(), "uploads/social-posts")));
  // Marketplace listing photos are public
  app.use("/uploads/marketplace-listings", express.static(path.resolve(process.cwd(), "uploads/marketplace-listings")));
  // Group event photos are public
  app.use("/uploads/group-events", express.static(path.resolve(process.cwd(), "uploads/group-events")));

  // All other uploads require a valid JWT token for ALL HTTP methods (GET, HEAD, etc.)
  const uploadsAuthGuard = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    let token: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else if (req.query.token && typeof req.query.token === "string") {
      // Allow token as query param for direct browser/WebView access
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const jwt = require("jsonwebtoken");
      const { JWT_SECRET } = require("./auth");
      jwt.verify(token, JWT_SECRET);
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
  app.use("/uploads", uploadsAuthGuard, express.static(path.resolve(process.cwd(), "uploads")));

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

  // Stripe webhook MUST be registered BEFORE express.json() so it receives raw Buffer
  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
      const signature = req.headers['stripe-signature'];
      if (!signature) return res.status(400).json({ error: 'Missing stripe-signature' });
      try {
        const { WebhookHandlers } = await import('./webhookHandlers');
        const sig = Array.isArray(signature) ? signature[0] : signature;
        await WebhookHandlers.processWebhook(req.body as Buffer, sig);
        res.status(200).json({ received: true });
      } catch (error: any) {
        console.error('[Stripe Webhook] Error:', error.message);
        res.status(400).json({ error: 'Webhook processing error' });
      }
    }
  );

  setupBodyParsing(app);
  setupRequestLogging(app);

  // Global API rate limiter — 300 requests per 15 minutes per IP
  const globalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });
  app.use("/api", globalApiLimiter);

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  // Initialize Stripe schema and sync after server is set up
  (async () => {
    try {
      const { runMigrations } = await import('stripe-replit-sync');
      const databaseUrl = process.env.DATABASE_URL;
      if (databaseUrl) {
        await runMigrations({ databaseUrl, schema: 'stripe' });
        log('[Stripe] Schema ready');

        const { getStripeSync } = await import('./stripeClient');
        const stripeSync = await getStripeSync();

        const domain = process.env.REPLIT_DOMAINS?.split(',')[0];
        if (domain) {
          const webhookUrl = `https://${domain}/api/stripe/webhook`;
          await stripeSync.findOrCreateManagedWebhook(webhookUrl);
          log(`[Stripe] Webhook configured: ${webhookUrl}`);
        }

        stripeSync.syncBackfill()
          .then(() => log('[Stripe] Data sync complete'))
          .catch((err: Error) => log(`[Stripe] Sync error: ${err.message}`));
      }
    } catch (err: any) {
      log(`[Stripe] Init warning: ${err.message}`);
    }
  })();

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    async () => {
      log(`express server serving on port ${port}`);

      // Task #905 — Drift watchdog for the player merge/delete code paths.
      // Runs once at boot, fully wrapped in try/catch internally; never blocks startup.
      try {
        const { auditPlayerForeignKeys } = await import("./startup/audit-player-fks");
        void auditPlayerForeignKeys();
      } catch (err) {
        log(`[PlayerFKAudit] failed to schedule: ${(err as Error)?.message ?? err}`);
      }

      startReminderScheduler();
      startDailyTipScheduler();
      startMatchPrepNotificationScheduler();
      startBookingExpiryJob();
      startPlayerOfWeekJob();
      // Task #1126 — weekly/monthly/yearly digests + family/coach digests.
      startDigestJobs();
      startFeedPruneScheduler();
      startFamilyPickupNotificationsJob();
      // Legacy startAutoSessionCompletionScheduler DISABLED — processAutoCompleteSession now handles
      // both session completion AND attendance+credit processing atomically (every 5 min)
      startMonthlyReportScheduler();
      startDailyScheduleNotifier();
      startCreditExpiryReminderScheduler();
      startWeeklyAIDigestScheduler();
      startGlowPlansScheduler();
      startBirthdayNotificationScheduler();
      // Onboarding email scheduler DISABLED - was sending duplicate emails on every server restart
      
      // Task #958 — V1 credit system fully retired. The legacy startup repair
      // scripts that read/wrote V1 `packages` and `credit_transactions`
      // (repairAllPlayerCredits, fixHolidayOvercharges, fixAlmaZaleskiCredits,
      // fixRouzbehGhostCredit, auditAllPlayerCredits, reconcilePackageCredits,
      // the negative-`remaining_credits` clamp, and the one-time
      // session_debt cleanup) no longer run on every boot. V2 owns the wallet
      // (player_credit_balance / credit_ledger_v2 / credit_lots_v2); drift is
      // detected by `processCreditDriftWatchdog` in the reminder scheduler and
      // backfilled via scripts/backfill-credit-drift.ts when needed.
      try {
        const { repairGroupSessionTypes, repairOrphanedSessionPlayers, cleanupGhostSessions } = await import("./storage");

        log("[RepairGroupTypes] Fixing group sessions wrongly converted...");
        const groupResult = await repairGroupSessionTypes();
        log(`[RepairGroupTypes] Complete: ${groupResult.fixed} fixed, ${groupResult.errors.length} errors`);

        // Cleanup ghost sessions from ended/deleted series
        try {
          const ghostResult = await cleanupGhostSessions();
          log(`[GhostCleanup] Cancelled ${ghostResult.cancelled} ghost sessions from ended/deleted series`);
        } catch (err) {
          console.error("[GhostCleanup] Failed:", err);
        }

        log("[SessionMaintenance] Running session maintenance (repair missing players, auto-attendance, cleanup, null attendance)...");
        await processSessionMaintenance();

        // Repair orphaned session_players: create records for completed series sessions after player joinedAt
        log("[OrphanedSPRepair] Checking for missing session_players in series...");
        const orphanResult = await repairOrphanedSessionPlayers();
        log(`[OrphanedSPRepair] Complete: ${orphanResult.created} created, ${orphanResult.failures.length} failures`);

        // SAFETY: Debts must NEVER be auto-cancelled — they track what players owe until a package is purchased
      } catch (error) {
        console.error("[StartupRepair] Failed:", error);
      }
      // Silence unused V1 imports retained for backwards-compat with other modules.
      void fixHolidayOvercharges;
      void fixAlmaZaleskiCredits;
      void fixRouzbehGhostCredit;

      // Glow Progress Connectivity: fix BALL_LEVEL_ENTRY_MAP, import Blue/Glow skills, backfill player_ball_levels
      try {
        const { runGlowProgressConnectivity } = await import("./migrations/glow-progress-connectivity");
        await runGlowProgressConnectivity();
      } catch (err) {
        console.error("[GlowProgressConnectivity] Startup migration failed:", err);
      }

      // One-off cleanup: strip invisible/zero-width Unicode and surrounding
      // whitespace from leading/trailing positions of players.name and
      // players.display_name. Cheap fast-path: a single SQL pre-check selects
      // only rows whose name actually starts/ends with an invisible or
      // whitespace char. In the steady state this returns 0 rows in a few ms
      // and the per-row JS sanitiser loop is skipped entirely, so this is
      // effectively a no-op on subsequent boots.
      try {
        const { db: dbInstance } = await import("./db");
        const { sql: sqlTag } = await import("drizzle-orm");
        const { sanitizeName } = await import("../shared/textSanitize");
        interface PlayerNameRow {
          id: string;
          name: string | null;
          display_name: string | null;
        }
        // Postgres regex character class matching the same set as
        // shared/textSanitize.ts plus standard whitespace at either end.
        const dirtyRows = await dbInstance.execute<PlayerNameRow>(sqlTag`
          SELECT id, name, display_name
          FROM players
          WHERE
            name ~ E'^[\\s\\u200B-\\u200F\\u2060\\uFEFF\\u00AD\\u180E]'
            OR name ~ E'[\\s\\u200B-\\u200F\\u2060\\uFEFF\\u00AD\\u180E]$'
            OR display_name ~ E'^[\\s\\u200B-\\u200F\\u2060\\uFEFF\\u00AD\\u180E]'
            OR display_name ~ E'[\\s\\u200B-\\u200F\\u2060\\uFEFF\\u00AD\\u180E]$'
        `);
        let nameFixed = 0;
        let dispFixed = 0;
        for (const row of dirtyRows.rows) {
          const updates: { name?: string; display_name?: string | null } = {};
          if (typeof row.name === "string") {
            const cleaned = sanitizeName(row.name);
            // Only update when something actually changed AND the result is
            // still non-empty (never blank out a name).
            if (cleaned && cleaned !== row.name) {
              updates.name = cleaned;
            }
          }
          if (typeof row.display_name === "string") {
            const cleaned = sanitizeName(row.display_name);
            if (cleaned !== row.display_name) {
              // display_name is allowed to become null/empty if it was only invisibles
              updates.display_name = cleaned || null;
            }
          }
          if (updates.name !== undefined && updates.display_name !== undefined) {
            await dbInstance.execute(sqlTag`UPDATE players SET name = ${updates.name}, display_name = ${updates.display_name} WHERE id = ${row.id}`);
            nameFixed++; dispFixed++;
          } else if (updates.name !== undefined) {
            await dbInstance.execute(sqlTag`UPDATE players SET name = ${updates.name} WHERE id = ${row.id}`);
            nameFixed++;
          } else if (updates.display_name !== undefined) {
            await dbInstance.execute(sqlTag`UPDATE players SET display_name = ${updates.display_name} WHERE id = ${row.id}`);
            dispFixed++;
          }
        }
        if (nameFixed > 0 || dispFixed > 0) {
          log(`[InvisibleCharCleanup] name: ${nameFixed} fixed, display_name: ${dispFixed} fixed`);
        }
      } catch (err) {
        console.error("[InvisibleCharCleanup] Startup migration failed:", err);
      }

      // Fix session capacity: correct wrong max_players values from before session-type-aware logic
      try {
        const { db } = await import("./db");
        const { sql: sqlTag } = await import("drizzle-orm");
        const privResult = await db.execute(sqlTag`
          UPDATE coaching_series
          SET max_players = 1
          WHERE session_type = 'private' AND max_players != 1
        `);
        const semiResult = await db.execute(sqlTag`
          UPDATE coaching_series
          SET max_players = 2
          WHERE session_type = 'semi_private' AND max_players > 3
        `);
        log(`[SessionCapacityFix] private: ${privResult.rowCount ?? 0} fixed, semi_private: ${semiResult.rowCount ?? 0} fixed`);
      } catch (err) {
        console.error("[SessionCapacityFix] Failed:", err);
      }

      // Repair: bootstrap provider_player conversations for any confirmed orders that missed initial creation
      try {
        const { repairMissingProviderConversations } = await import("./shop-routes");
        await repairMissingProviderConversations();
      } catch (err) {
        console.error("[ProviderChatRepair] Startup repair failed:", err);
      }

      // Repair: heal players who registered via invite but whose academy_id is NULL
      // (caused by a bug where academyId was passed as a 3rd arg to updatePlayer and silently ignored)
      try {
        const { db: dbInstance } = await import("./db");
        const { sql: sqlTag } = await import("drizzle-orm");
        const healResult = await dbInstance.execute(sqlTag`
          UPDATE players p
          SET academy_id = pi.academy_id
          FROM player_invites pi
          WHERE pi.player_id = p.id
            AND pi.status = 'claimed'
            AND p.academy_id IS NULL
            AND pi.academy_id IS NOT NULL
        `);
        const healed = healResult.rowCount ?? 0;
        if (healed > 0) {
          log(`[InviteAcademyRepair] Healed ${healed} player(s) with NULL academy_id from claimed invite records`);
        } else {
          log("[InviteAcademyRepair] No orphaned players found — skipping");
        }
      } catch (err) {
        console.error("[InviteAcademyRepair] Failed:", err);
      }

      // One-time fix: re-link "Maple" court to the Google-verified location that has coordinates
      // (Task #223 — court pointed to old location "Maple tennis court" with null lat/lng;
      //  correct location "Maple 1 Tennis Court" (id: 1e178e26-...) exists with lat/lng set)
      try {
        const { db: dbInstance } = await import("./db");
        const { sql: sqlTag } = await import("drizzle-orm");
        const mapleResult = await dbInstance.execute(sqlTag`
          UPDATE courts
          SET location_id = '1e178e26-2996-40e6-a186-36c58cd76efe'
          WHERE id = 'f0154208-e9c3-448d-a7cf-1a2f77e577d5'
            AND location_id != '1e178e26-2996-40e6-a186-36c58cd76efe'
        `);
        const fixed = mapleResult.rowCount ?? 0;
        if (fixed > 0) {
          log("[MapleCourtFix] Re-linked Maple court to correct location with coordinates");
        } else {
          log("[MapleCourtFix] Maple court already linked correctly — no action needed");
        }
      } catch (err) {
        console.error("[MapleCourtFix] Failed:", err);
      }

      // Migrate legacy player invite codes (16-char hex → 6-char short format)
      try {
        const { db: dbInstance } = await import("./db");
        const { playerInvites } = await import("../shared/schema");
        const { eq } = await import("drizzle-orm");
        const cryptoMod = await import("crypto");

        function genShortCode(): string {
          const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          let code = "";
          for (let i = 0; i < 6; i++) {
            code += chars[cryptoMod.randomInt(0, chars.length)];
          }
          return code;
        }

        // Load ALL invite codes across all statuses for global uniqueness checking
        const allInvites = await dbInstance.select({ inviteCode: playerInvites.inviteCode }).from(playerInvites);
        const usedCodes = new Set(allInvites.map((i) => i.inviteCode));

        const pendingInvites = await dbInstance
          .select()
          .from(playerInvites)
          .where(eq(playerInvites.status, "pending"));

        const legacyInvites = pendingInvites.filter(
          (inv) => !/^[A-Z0-9]{6}$/.test(inv.inviteCode),
        );

        if (legacyInvites.length === 0) {
          log("[MigrateInviteCodes] No legacy invite codes found — skipping");
        } else {
          let migratedCount = 0;
          let errorCount = 0;

          for (const inv of legacyInvites) {
            try {
              // Remove old code from set so it doesn't block its own replacement
              usedCodes.delete(inv.inviteCode);

              // Generate a globally unique code — retry indefinitely until we find one
              let newCode = genShortCode();
              while (usedCodes.has(newCode)) {
                newCode = genShortCode();
              }
              usedCodes.add(newCode);

              await dbInstance
                .update(playerInvites)
                .set({ inviteCode: newCode })
                .where(eq(playerInvites.id, inv.id));

              migratedCount++;
            } catch (rowErr) {
              errorCount++;
              console.error(`[MigrateInviteCodes] Failed to migrate invite ${inv.id}:`, rowErr);
            }
          }

          log(`[MigrateInviteCodes] Migrated ${migratedCount} legacy invite codes to short format (${errorCount} errors)`);
        }
      } catch (err) {
        console.error("[MigrateInviteCodes] Failed:", err);
      }

      // ── CancelledSessionGhostDebtFix ──────────────────────────────────────
      // One-time backfill: cancel any unsettled debt transactions whose linked
      // session has since been cancelled. Normally the session-cancel routes do
      // this, but the previous code guarded on !creditDeductedAt and missed debts
      // created by ensureCreditProcessed. This patch is idempotent — already-
      // cancelled transactions are skipped by the WHERE filter.
      try {
        const { db: dbGhost } = await import("./db");
        const { sql: sqlGhost } = await import("drizzle-orm");
        const ghostDebtResult = await dbGhost.execute(sqlGhost`
          UPDATE credit_transactions ct
          SET metadata = ct.metadata || jsonb_build_object(
            'cancelled', true,
            'cancelledAt', now()::text,
            'cancelReason', 'backfill_cancelled_session_ghost_debt'
          )
          FROM sessions s
          WHERE ct.session_id = s.id
            AND s.status = 'cancelled'
            AND ct.type = 'debit'
            AND ct.reason IN ('session_join_debt', 'session_debt', 'session_unpaid', 'session_booking')
            AND (ct.metadata->>'cancelled')::text IS DISTINCT FROM 'true'
            AND (ct.metadata->>'settled')::text IS DISTINCT FROM 'true'
        `);
        const fixed = (ghostDebtResult as any).rowCount ?? 0;
        if (fixed > 0) {
          log(`[CancelledSessionGhostDebtFix] Cancelled ${fixed} ghost debt transaction(s) tied to cancelled sessions`);
        } else {
          log(`[CancelledSessionGhostDebtFix] No ghost debts found — skipping`);
        }
      } catch (err) {
        console.error("[CancelledSessionGhostDebtFix] Failed:", err);
      }

      // ── CommunityGroupMemberCountBackfill ─────────────────────────────────
      // One-time backfill: recompute community_groups.member_count from the
      // actual rows in group_members. The list endpoint now reads counts live,
      // but the stored column is still kept in sync by join/leave handlers and
      // is used as a fallback in some clients — keep it consistent here.
      try {
        const { db: dbCounts } = await import("./db");
        const { sql: sqlCounts } = await import("drizzle-orm");
        const result: { rowCount?: number | null } = await dbCounts.execute(sqlCounts`
          UPDATE community_groups cg
          SET member_count = sub.cnt
          FROM (
            SELECT cg2.id AS group_id,
                   COALESCE(gm_counts.cnt, 0)::int AS cnt
            FROM community_groups cg2
            LEFT JOIN (
              SELECT group_id, COUNT(*)::int AS cnt
              FROM group_members
              GROUP BY group_id
            ) gm_counts ON gm_counts.group_id = cg2.id
          ) sub
          WHERE cg.id = sub.group_id
            AND COALESCE(cg.member_count, -1) <> sub.cnt
        `);
        const fixed = result.rowCount ?? 0;
        if (fixed > 0) {
          log(`[CommunityGroupMemberCountBackfill] Synced member_count on ${fixed} group(s)`);
        } else {
          log(`[CommunityGroupMemberCountBackfill] All groups already in sync`);
        }
      } catch (err) {
        console.error("[CommunityGroupMemberCountBackfill] Failed:", err);
      }

      // ── CommunityGroupForSeriesBackfill ──────────────────────────────────
      // Ensure every non-private coaching_series has a Community Group with
      // members matching active enrollment + assigned coach. Idempotent.
      try {
        const { backfillCommunityGroupsForSeries } = await import("./storage");
        await backfillCommunityGroupsForSeries();
      } catch (err) {
        console.error("[CommunityGroupForSeriesBackfill] Failed:", err);
      }

      // ── CommunityGroupJoinNotificationBackfill ───────────────────────────
      // Task #1143 — Task #1129 only fires the community_group_join prompt for
      // *new* enrollments. Players who were already in a class before that
      // shipped never see the prompt, so the new community surface stays
      // hidden for them. Walk every active series_players row once and
      // dispatch the same prompt; the helper is idempotent per player+group
      // so this is safe to run on every boot.
      try {
        const { backfillCommunityGroupJoinNotifications } = await import(
          "./storage"
        );
        await backfillCommunityGroupJoinNotifications();
      } catch (err) {
        console.error(
          "[CommunityGroupJoinNotificationBackfill] Failed:",
          err,
        );
      }
    },
  );
})();
