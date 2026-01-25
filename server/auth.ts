import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || "dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";
const SALT_ROUNDS = 12;

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  academyId: string | null;
  coachId: string | null;
  playerId: string | null;
  currentAcademyId?: string | null; // The active academy context (from X-Academy-Id header)
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

export interface UserStorageInterface {
  getUserById(id: string): Promise<{ id: string; email: string; role: string; academyId: string | null; coachId: string | null; playerId: string | null } | null>;
  isMaintenanceMode(): Promise<boolean>;
  isUserAcademyOwner(userId: string, academyId: string): Promise<boolean>;
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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

// Verify token but allow expired tokens (for refresh purposes)
// Returns the payload even if expired, but returns null if signature is invalid
export function verifyTokenAllowExpired(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as JWTPayload;
  } catch {
    return null;
  }
}

// Middleware that accepts expired tokens (for token refresh endpoint)
export function refreshAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyTokenAllowExpired(token);

  if (!payload) {
    res.status(401).json({ error: "Invalid token signature" });
    return;
  }

  req.user = payload;
  next();
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
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
        
        req.user = {
          userId: freshUser.id,
          email: freshUser.email,
          role: freshUser.role,
          academyId: freshUser.academyId,
          coachId: freshUser.coachId,
          playerId: freshUser.playerId,
          currentAcademyId: effectiveAcademyId, // The active academy context
        };
        
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

// Middleware factory to require a specific feature to be unlocked for the player
export function requireFeatureUnlock(featureKey: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Only apply to players
    if (!req.user.playerId) {
      // Non-players (coaches, owners) bypass feature gates
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

