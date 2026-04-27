import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Throttle in-memory cache: track last time we updated last_active_at per playerId
const lastActiveCache = new Map<string, number>();
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000; // update at most once per 5 min per player

function touchPlayerLastActive(playerId: string): void {
  const now = Date.now();
  const last = lastActiveCache.get(playerId) || 0;
  if (now - last < LAST_ACTIVE_THROTTLE_MS) return;
  lastActiveCache.set(playerId, now);
  // Fire and forget — never blocks the request
  import("./db").then(({ pool }) => {
    pool.query("UPDATE players SET last_active_at = NOW() WHERE id = $1", [playerId]).catch(() => {});
  }).catch(() => {});
}

if (!process.env.SESSION_SECRET) {
  throw new Error("[FATAL] SESSION_SECRET environment variable is not set. Server cannot start without a secure JWT secret.");
}
export const JWT_SECRET = process.env.SESSION_SECRET;
const JWT_EXPIRES_IN = "30d";
const REFRESH_TOKEN_EXPIRES_IN = "90d";
const SALT_ROUNDS = 12;

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  academyId: string | null;
  coachId: string | null;
  playerId: string | null;
  currentAcademyId?: string | null; // The active academy context (from X-Academy-Id header)
  type?: "access" | "refresh"; // Token type claim to distinguish access from refresh tokens
  familySwitch?: boolean; // Marks synthetic family-switch tokens (parent userId + child playerId)
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

export interface UserStorageInterface {
  getUserById(id: string): Promise<{ id: string; email: string; role: string; academyId: string | null; coachId: string | null; playerId: string | null; deleted?: boolean | null } | null>;
  isMaintenanceMode(): Promise<boolean>;
  isUserAcademyOwner(userId: string, academyId: string): Promise<boolean>;
  getPlayerEmail(playerId: string): Promise<string | null>;
  /** Returns true when targetPlayerId is a verified family member of callerPlayerId (supports parent↔child and sibling relationships) */
  isFamilyMember(callerPlayerId: string, targetPlayerId: string): Promise<boolean>;
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  
  if (!password || password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }
  if (password.length > 128) {
    errors.push("Password must be less than 128 characters");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: JWTPayload): string {
  const { type: _omit, ...rest } = payload;
  return jwt.sign({ ...rest, type: "access" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function generateRefreshToken(payload: JWTPayload): string {
  const { type: _omit, ...rest } = payload;
  return jwt.sign({ ...rest, type: "refresh" }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}

// Verify a refresh token — enforces expiry and checks the type claim
export function verifyRefreshToken(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    if (payload.type !== "refresh") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// Verify an access token. Rejects refresh tokens (type === "refresh").
// Accepts tokens without a type claim for backward compatibility with
// tokens issued before the type claim was introduced.
export function verifyToken(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    if (payload.type === "refresh") {
      // Refresh tokens must not be used to authorize API requests
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// Verify token but allow expired tokens (for legacy refresh fallback only).
// Returns the payload even if expired, but returns null if the signature is
// invalid or if the token is a refresh token (refresh tokens must go through
// verifyRefreshToken and are never accepted here).
export function verifyTokenAllowExpired(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as JWTPayload;
    if (payload.type === "refresh") {
      // Refresh tokens must not be accepted via this path — they have their own expiry
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// Middleware for the token refresh endpoint.
// Only accepts a valid, non-expired refresh token (type === "refresh").
// Access tokens are rejected — clients must have obtained a refresh token at login.
export function refreshAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.substring(7);

  // Only refresh tokens (type=refresh) are accepted here — enforces 90d expiry
  const refreshPayload = verifyRefreshToken(token);
  if (refreshPayload) {
    req.user = refreshPayload;
    return next();
  }

  res.status(401).json({ error: "Invalid or expired refresh token" });
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // Task #1398 — In-process dispatch from a player god-endpoint passes
  // the parent request's already-resolved `req.user` via these flags so
  // the child request can skip JWT re-verification entirely. The parent
  // request was authenticated normally before reaching the god-endpoint
  // handler, so this is safe.
  if ((req as any).__inProcessDispatch && (req as any).__inProcessUser) {
    req.user = (req as any).__inProcessUser;
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = payload;
  next();
}

let freshUserStorage: UserStorageInterface | null = null;

export function setFreshUserStorage(storage: UserStorageInterface): void {
  freshUserStorage = storage;
}

export async function authMiddlewareWithFreshData(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  // Task #1398 — In-process dispatch from a player god-endpoint already
  // ran this middleware on the parent request and can pass the
  // resolved `req.user` directly. Re-running this here would do another
  // 1-3 DB round-trips per sub-fetch (fresh user + family-link +
  // account-lock checks) for no security gain.
  if ((req as any).__inProcessDispatch && (req as any).__inProcessUser) {
    req.user = (req as any).__inProcessUser;
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  // Debug: log auth header status for certain endpoints
  if (req.path.includes("/play/")) {
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Read the X-Academy-Id header for multi-academy context
  const requestedAcademyId = req.headers["x-academy-id"] as string | undefined;

  // Fetch fresh user data from database to get current academyId/coachId/playerId
  if (freshUserStorage) {
    try {
      const freshUser = await freshUserStorage.getUserById(payload.userId);
      
      // SECURITY: If user no longer exists in database, reject the request
      // This prevents use of tokens for deleted/non-existent users
      if (!freshUser) {
        console.warn(`[Auth] User ${payload.userId} from token not found in database - rejecting`);
        res.status(401).json({ error: "User account not found. Please log in again." });
        return;
      }
      
      // SECURITY: Reject requests from deleted accounts
      if (freshUser.deleted === true) {
        console.warn(`[Auth] User ${payload.userId} account has been deleted - rejecting`);
        res.status(401).json({ error: "ACCOUNT_DELETED", message: "Your account has been deleted. Please create a new account to continue." });
        return;
      }
      
      if (freshUser) {
        // Determine the effective academy context
        let effectiveAcademyId = freshUser.academyId;
        
        // Platform owners can access any academy via the header
        if (freshUser.role === "platform_owner" && requestedAcademyId) {
          effectiveAcademyId = requestedAcademyId;
        }
        // Academy owners can access academies they own via the header
        else if (freshUser.role === "academy_owner" && requestedAcademyId) {
          // Validate that the user actually owns this academy
          const isOwner = await freshUserStorage.isUserAcademyOwner(freshUser.id, requestedAcademyId);
          if (isOwner) {
            effectiveAcademyId = requestedAcademyId;
          } else {
            // If they don't own it, reject the request with 403
            res.status(403).json({ error: "Access denied to this academy" });
            return;
          }
        }
        
        let effectivePlayerId = freshUser.playerId;

        // Family-switch synthetic tokens: the JWT carries the child's playerId while
        // the userId belongs to the parent.  Re-validate the family relationship
        // against the current DB state on every request (prevents stale-auth issues
        // if the family linkage is removed after token issuance).
        if (payload.familySwitch && payload.playerId && freshUser.playerId &&
            payload.playerId !== freshUser.playerId) {
          try {
            const isMember = await freshUserStorage.isFamilyMember(freshUser.playerId, payload.playerId);
            if (isMember) {
              effectivePlayerId = payload.playerId;
              if (payload.academyId) {
                effectiveAcademyId = payload.academyId;
              }
            } else {
              // Family link no longer valid — reject the request
              res.status(403).json({ error: "Family relationship no longer valid. Please switch back to your own account." });
              return;
            }
          } catch (familyErr) {
            console.error("[Auth] Family switch validation error:", familyErr);
            // On DB error, fall through to use freshUser.playerId (safe default)
          }
        } else {
          const requestedPlayerId = req.headers["x-active-player-id"] as string | undefined;
          if (requestedPlayerId && requestedPlayerId !== freshUser.playerId && freshUser.playerId) {
            try {
              const parentEmail = await freshUserStorage.getPlayerEmail(freshUser.playerId);
              if (parentEmail) {
                const childEmail = await freshUserStorage.getPlayerEmail(requestedPlayerId);
                if (childEmail === parentEmail) {
                  effectivePlayerId = requestedPlayerId;
                }
              }
            } catch (familyErr) {
              console.error("[Auth] Family player switch error:", familyErr);
            }
          }
        }

        // Family F — screen-time lock enforcement. If the effective player
        // is locked, reject every authenticated request with 401 LOCKED so
        // any active session forcibly drops back to the lobby. The lock
        // endpoint also closes WebSockets immediately for the sub-60s SLA.
        if (effectivePlayerId) {
          try {
            const { getAccountLockState } = await import("./lib/account-audit");
            const lockState = await getAccountLockState(effectivePlayerId);
            if (lockState.locked) {
              res.status(401).json({
                error: "ACCOUNT_LOCKED",
                locked: true,
                lockedUntil: lockState.lockedUntil?.toISOString() ?? null,
                lockedByPlayerId: lockState.lockedByPlayerId,
                reason: lockState.reason,
                message: "This account is taking a break.",
              });
              return;
            }
          } catch (lockErr) {
            // Best-effort — never let a lock-check DB error block the request.
            console.warn("[Auth] account-lock check failed:", lockErr);
          }
        }

        req.user = {
          userId: freshUser.id,
          email: freshUser.email,
          role: freshUser.role,
          academyId: freshUser.academyId,
          coachId: freshUser.coachId,
          playerId: effectivePlayerId,
          currentAcademyId: effectiveAcademyId,
          familySwitch: payload.familySwitch,
        };

        // Track last active time for player users (fire-and-forget, throttled to once per 5 min)
        if (effectivePlayerId) {
          touchPlayerLastActive(effectivePlayerId);
        }
        
        // Check maintenance mode for non-platform_owner users
        if (freshUser.role !== "platform_owner") {
          try {
            const isMaintenanceOn = await freshUserStorage.isMaintenanceMode();
            if (isMaintenanceOn) {
              res.status(503).json({
                error: "Platform is under maintenance",
                message: "Glow Up Sports is currently undergoing scheduled maintenance. Please try again later.",
                maintenance: true,
              });
              return;
            }
          } catch (maintenanceError) {
            console.error("Error checking maintenance mode:", maintenanceError);
          }
        }
        
        return next();
      }
    } catch (error) {
      console.error("Error fetching fresh user data:", error);
    }
  }

  // Fallback to JWT payload if fresh data fetch fails
  // SECURITY: Never trust X-Academy-Id header in fallback path - only use payload.academyId
  req.user = {
    ...payload,
    currentAcademyId: payload.academyId, // Only use validated academy from JWT, never trust header in fallback
  };
  
  // Also check maintenance mode for fallback path
  if (payload.role !== "platform_owner" && freshUserStorage) {
    try {
      const isMaintenanceOn = await freshUserStorage.isMaintenanceMode();
      if (isMaintenanceOn) {
        res.status(503).json({
          error: "Platform is under maintenance",
          message: "Glow Up Sports is currently undergoing scheduled maintenance. Please try again later.",
          maintenance: true,
        });
        return;
      }
    } catch (maintenanceError) {
      console.error("Error checking maintenance mode:", maintenanceError);
    }
  }
  
  next();
}

export function optionalAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  
  next();
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}

export function requireAcademy(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (!req.user.academyId) {
    res.status(403).json({ error: "Academy membership required" });
    return;
  }

  next();
}

export function createFreshUserMiddleware(storage: UserStorageInterface) {
  return async function freshUserMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    if (!req.user) {
      return next();
    }

    try {
      const freshUser = await storage.getUserById(req.user.userId);
      if (freshUser) {
        req.user = {
          userId: freshUser.id,
          email: freshUser.email,
          role: freshUser.role,
          academyId: freshUser.academyId,
          coachId: freshUser.coachId,
          playerId: freshUser.playerId,
        };
      }
    } catch (error) {
      console.error("Error fetching fresh user data:", error);
    }

    next();
  };
}

export interface StorageInterface {
  getPlayer(id: string, academyId?: string): Promise<any>;
  getCourt(id: string, academyId?: string): Promise<any>;
  getSession(id: string, academyId?: string): Promise<any>;
  getPackage(id: string, academyId?: string): Promise<any>;
  getCoachNotification(id: string, coachId?: string): Promise<any>;
}

export async function validatePlayerOwnership(
  playerId: string,
  academyId: string | null,
  storage: StorageInterface
): Promise<{ valid: boolean; player?: any }> {
  if (!academyId) {
    return { valid: false };
  }
  const player = await storage.getPlayer(playerId, academyId);
  return { valid: !!player, player };
}

export async function validateCourtOwnership(
  courtId: string,
  academyId: string | null,
  storage: StorageInterface
): Promise<{ valid: boolean; court?: any }> {
  if (!academyId) {
    return { valid: false };
  }
  const court = await storage.getCourt(courtId, academyId);
  return { valid: !!court, court };
}

export async function validateSessionOwnership(
  sessionId: string,
  academyId: string | null,
  storage: StorageInterface
): Promise<{ valid: boolean; session?: any }> {
  if (!academyId) {
    return { valid: false };
  }
  const session = await storage.getSession(sessionId, academyId);
  return { valid: !!session, session };
}

export async function validatePackageOwnership(
  packageId: string,
  academyId: string | null,
  storage: StorageInterface
): Promise<{ valid: boolean; pkg?: any }> {
  if (!academyId) {
    return { valid: false };
  }
  // Use getPackage with academyId for defense-in-depth
  const pkg = await storage.getPackage(packageId, academyId);
  return { valid: !!pkg, pkg };
}

export async function validateNotificationOwnership(
  notificationId: string,
  coachId: string | null,
  storage: StorageInterface
): Promise<{ valid: boolean; notification?: any }> {
  if (!coachId) {
    return { valid: false };
  }
  const notification = await storage.getCoachNotification(notificationId, coachId);
  return { valid: !!notification, notification };
}

// Feature unlock check interface - will be injected from routes
export interface FeatureUnlockChecker {
  isFeatureUnlocked(playerId: string, featureKey: string): Promise<boolean>;
}

let featureUnlockChecker: FeatureUnlockChecker | null = null;

export function setFeatureUnlockChecker(checker: FeatureUnlockChecker): void {
  featureUnlockChecker = checker;
}

const APPLE_REVIEW_EMAIL = "review@glowupsports.com";

export function isAppleReviewAccount(email?: string | null): boolean {
  return email === APPLE_REVIEW_EMAIL;
}

// ===========================================================
// SUBSCRIPTION TIER FEATURE GATES
// ===========================================================

/**
 * Cache: academy_id → { features, limits, planName }
 * TTL: 60 seconds so live changes reflect quickly.
 */
const tierCache = new Map<string, { data: any; expiresAt: number }>();
const TIER_CACHE_TTL_MS = 60_000;

async function getAcademyTierData(academyId: string): Promise<{
  planName: string;
  features: Record<string, boolean>;
  maxCoaches: number;
  maxPlayers: number;
  maxLocations: number;
} | null> {
  const cached = tierCache.get(academyId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const { pool } = await import("./db");
    const result = await pool.query(
      `SELECT sp.name, sp.features, sp.max_coaches, sp.max_players, sp.max_locations
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.academy_id = $1 AND s.status IN ('active','trialing')
       ORDER BY sp.monthly_price DESC
       LIMIT 1`,
      [academyId],
    );

    if (result.rows.length === 0) {
      // No active subscription → treat as Starter
      const starter = await pool.query(
        `SELECT name, features, max_coaches, max_players, max_locations FROM subscription_plans WHERE LOWER(name) = 'starter' ORDER BY sort_order LIMIT 1`,
      );
      const row = starter.rows[0];
      if (!row) return null;
      const data = {
        planName: row.name,
        features: row.features || {},
        maxCoaches: row.max_coaches,
        maxPlayers: row.max_players,
        maxLocations: row.max_locations,
      };
      tierCache.set(academyId, { data, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
      return data;
    }

    const row = result.rows[0];
    const data = {
      planName: row.name,
      features: row.features || {},
      maxCoaches: row.max_coaches,
      maxPlayers: row.max_players,
      maxLocations: row.max_locations,
    };
    tierCache.set(academyId, { data, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
    return data;
  } catch (err) {
    console.error("[TierGate] Error fetching tier data:", err);
    return null;
  }
}

export function invalidateTierCache(academyId: string): void {
  tierCache.delete(academyId);
}

/**
 * requireFeature("video_feedback") — 403 with upgradeRequired if feature flag is false.
 * Platform owners and Apple Review bypass this check.
 */
export function requireFeature(flagName: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Platform owner always has full access
    if (req.user.role === "platform_owner") return next();

    // Apple review bypass
    if (isAppleReviewAccount(req.user.email)) return next();

    const academyId = req.user.academyId;
    if (!academyId) return next(); // No academy context → pass through

    try {
      const tierData = await getAcademyTierData(academyId);
      if (!tierData) return next(); // Can't determine tier → fail open

      const hasFeature = tierData.features[flagName] === true;
      if (hasFeature) return next();

      // Determine which tier unlocks this feature
      const { pool } = await import("./db");
      const plans = await pool.query(
        `SELECT name, monthly_price, features FROM subscription_plans WHERE is_active = true ORDER BY sort_order ASC`,
      );
      let requiredTier = "pro";
      for (const plan of plans.rows) {
        if (plan.features?.[flagName] === true) {
          requiredTier = plan.name.toLowerCase();
          break;
        }
      }

      res.status(403).json({
        error: "Feature not available on your current plan",
        upgradeRequired: true,
        featureName: flagName,
        currentTier: tierData.planName.toLowerCase(),
        requiredTier,
      });
    } catch (err) {
      console.error("[TierGate] requireFeature error:", err);
      next(); // Fail open
    }
  };
}

/**
 * requirePlanLimit("maxCoaches", countFn) — checks that current count < limit.
 * Pass -1 as limit to mean "unlimited".
 */
export function requirePlanLimit(
  limitName: "maxCoaches" | "maxPlayers" | "maxLocations",
  getCurrentCount: (academyId: string) => Promise<number>,
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (req.user.role === "platform_owner") return next();
    if (isAppleReviewAccount(req.user.email)) return next();

    const academyId = req.user.academyId;
    if (!academyId) return next();

    try {
      const tierData = await getAcademyTierData(academyId);
      if (!tierData) return next();

      const limit = tierData[limitName] as number;
      if (limit === -1) return next(); // Unlimited

      const current = await getCurrentCount(academyId);
      if (current < limit) return next();

      const { pool } = await import("./db");
      const plans = await pool.query(
        `SELECT name, monthly_price, ${limitName === "maxCoaches" ? "max_coaches" : limitName === "maxPlayers" ? "max_players" : "max_locations"} AS plan_limit
         FROM subscription_plans WHERE is_active = true ORDER BY sort_order ASC`,
      );
      let requiredTier = "pro";
      for (const plan of plans.rows) {
        if (plan.plan_limit === -1 || plan.plan_limit > current) {
          requiredTier = plan.name.toLowerCase();
          break;
        }
      }

      res.status(403).json({
        error: `You have reached the ${limitName} limit for your current plan`,
        upgradeRequired: true,
        limitName,
        currentTier: tierData.planName.toLowerCase(),
        requiredTier,
      });
    } catch (err) {
      console.error("[TierGate] requirePlanLimit error:", err);
      next();
    }
  };
}

export function requireFeatureUnlock(featureKey: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (isAppleReviewAccount(req.user.email)) {
      return next();
    }

    if (!req.user.playerId) {
      return next();
    }

    if (!featureUnlockChecker) {
      console.error("[FeatureGate] Feature unlock checker not initialized");
      // Fail open for now but log error - could fail closed in production
      return next();
    }

    try {
      const isUnlocked = await featureUnlockChecker.isFeatureUnlocked(req.user.playerId, featureKey);
      
      if (!isUnlocked) {
        res.status(403).json({ 
          error: "Feature locked",
          featureKey,
          message: "This feature requires a higher player level to access"
        });
        return;
      }
      
      next();
    } catch (error) {
      console.error("[FeatureGate] Error checking feature unlock:", error);
      // Fail open on error to prevent blocking legitimate users
      next();
    }
  };
}

