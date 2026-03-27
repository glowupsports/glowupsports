import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many invite attempts. Please wait 15 minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isRateLimited(userId: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(userId);
    if (!timestamps) return false;
    const valid = timestamps.filter(t => now - t < this.windowMs);
    this.requests.set(userId, valid);
    return valid.length >= this.maxRequests;
  }

  recordRequest(userId: string): void {
    const now = Date.now();
    const timestamps = this.requests.get(userId) || [];
    const valid = timestamps.filter(t => now - t < this.windowMs);
    valid.push(now);
    this.requests.set(userId, valid);
  }
}

export const chatRateLimiter = new RateLimiter(5, 10000);
export const postRateLimiter = new RateLimiter(3, 60000);

export const diagnosticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many diagnostic reports submitted. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const adminRepairLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many admin repair requests. Please wait before retrying." },
  standardHeaders: true,
  legacyHeaders: false,
});
