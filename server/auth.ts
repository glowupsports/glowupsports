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
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
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

