import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sessions, players, academyPricing } from "@shared/schema";
import { eq, and, gte, lte, or, asc, desc, inArray, isNull } from "drizzle-orm";
import { 
  authMiddlewareWithFreshData as authMiddleware,
  JWTPayload 
} from "../auth";
import { apiCache, CACHE_KEYS, CACHE_TTL } from "../cache";

const router = Router();

interface AuthRequest extends Request {
  user?: JWTPayload;
}

function getWarningMessage(code: string): string {
  const messages: Record<string, string> = {
    no_contract: "No coach contract found for this academy",
    invalid_hourly_rate: "Coach contract has invalid hourly rate",
    invalid_session_rate: "Coach contract has invalid session rate",
    invalid_percentage_rate: "Coach contract has invalid percentage rate",
    missing_academy_id: "Session is missing academy assignment",
    missing_academy_pricing: "Academy has no pricing configured for this session type",
    unknown_pay_type: "Coach contract has unknown pay type",
  };
  return messages[code] || "Unknown configuration error";
}

  async function calculateSessionEarning(
  session: { id?: string; academyId?: string | null; duration?: number | null; sessionType?: string | null },
  coachId: string,
  contracts: any[],
  cachedData?: {
    sessionPlayersMap?: Map<string, number>;
    seriesPlayersMap?: Map<string, number>;
    getPricing?: (academyId: string, sessionType: string) => Promise<any>;
  }
): Promise<{ amount: number; currency: string; warning?: string; playerCount?: number }> {
  const sessionId = session.id;
  const academyId = session.academyId;
  const duration = session.duration || 60;
  const rawSessionType = session.sessionType || "private";
  
  const normalizeSessionType = (type: string): string => {
    const cleaned = type.toLowerCase().replace(/-/g, "_").trim();
    if (cleaned === "semi" || cleaned === "semi_private" || cleaned === "semi_private_adjusted") return "semi_private";
    if (cleaned === "private_adjusted") return "private";
    if (cleaned === "group_adjusted") return "group";
    return cleaned;
  };
  const sessionType = normalizeSessionType(rawSessionType);
  
  const contract = contracts.find((c: any) => c.academyId === academyId);
  
  if (!contract) {
    console.warn(`[Earnings] No contract found for coach ${coachId} at academy ${academyId}`);
    return { amount: 0, currency: "AED", warning: "no_contract" };
  }
  
  const currency = contract.currency || "AED";
  let amount = 0;
  
  let playerCount = 1;
  if (sessionType === "group" || sessionType === "semi_private") {
    if (cachedData?.sessionPlayersMap || cachedData?.seriesPlayersMap) {
      if (sessionId && cachedData.sessionPlayersMap) {
        const cachedCount = cachedData.sessionPlayersMap.get(sessionId);
        if (cachedCount && cachedCount > 0) {
          playerCount = cachedCount;
        }
      }
      if (playerCount === 1 && (session as any).seriesId && cachedData.seriesPlayersMap) {
        const cachedSeriesCount = cachedData.seriesPlayersMap.get((session as any).seriesId);
        if (cachedSeriesCount && cachedSeriesCount > 0) {
          playerCount = cachedSeriesCount;
        }
      }
    } else {
      if (sessionId) {
        const sessionPlayers = await storage.getSessionPlayers(sessionId);
        if (sessionPlayers.length > 0) {
          playerCount = sessionPlayers.length;
        }
      }
      if (playerCount === 1 && (session as any).seriesId) {
        const seriesPlayers = await storage.getSeriesPlayers((session as any).seriesId);
        const activeSeriesPlayers = seriesPlayers.filter((sp: any) => sp.status === "active");
        if (activeSeriesPlayers.length > 0) {
          playerCount = activeSeriesPlayers.length;
        }
      }
    }
  }
  
  if (sessionType === "private" && contract.privateRate) {
    amount = Number(contract.privateRate) || 0;
  } else if (sessionType === "semi_private" && contract.semiPrivateRate) {
    amount = Number(contract.semiPrivateRate) || 0;
  } else if (sessionType === "group" && contract.groupRate) {
    amount = Number(contract.groupRate) || 0;
  } else {
    switch (contract.payType) {
      case "hourly":
        const hourlyRate = Number(contract.hourlyRate);
        if (isNaN(hourlyRate) || hourlyRate <= 0) {
          console.warn(`[Earnings] Invalid hourly rate for contract ${contract.id}`);
          return { amount: 0, currency, warning: "invalid_hourly_rate" };
        }
        amount = hourlyRate * (duration / 60);
        break;
      case "per_session":
        const sessionRate = Number(contract.sessionRate);
        if (isNaN(sessionRate) || sessionRate <= 0) {
          console.warn(`[Earnings] Invalid session rate for contract ${contract.id}`);
          return { amount: 0, currency, warning: "invalid_session_rate" };
        }
        amount = sessionRate;
        break;
      case "percentage":
        const percentageRate = Number(contract.percentageRate);
        if (isNaN(percentageRate) || percentageRate <= 0) {
          console.warn(`[Earnings] Invalid percentage rate for contract ${contract.id}`);
          return { amount: 0, currency, warning: "invalid_percentage_rate" };
        }
        
        if (!academyId) {
          console.warn(`[Earnings] Percentage contract but no academyId on session`);
          return { amount: 0, currency, warning: "missing_academy_id" };
        }
        
        const pricing = cachedData?.getPricing ? await cachedData.getPricing(academyId, sessionType) : await storage.getAcademyPricingByType(academyId, sessionType);
        if (!pricing) {
          console.warn(`[Earnings] No academy pricing found for ${academyId} / ${sessionType}`);
          return { amount: 0, currency, warning: "missing_academy_pricing" };
        }
        
        let perPlayerPrice = 0;
        if (pricing.pricePerHour) {
          perPlayerPrice = Number(pricing.pricePerHour) * (duration / 60);
        } else {
          perPlayerPrice = Number(pricing.pricePerSession) || 0;
        }
        
        const totalSessionRevenue = perPlayerPrice * playerCount;
        amount = totalSessionRevenue * (percentageRate / 100);
        break;
      default:
        console.warn(`[Earnings] Unknown pay type: ${contract.payType}`);
        return { amount: 0, currency, warning: "unknown_pay_type" };
    }
  }
  
  return { amount, currency, playerCount };
}

router.get("/api/coach/earnings/summary", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const coachId = req.user!.coachId;
    if (!coachId) {
      return res.status(400).json({ error: "Coach ID required" });
    }
    
    const cacheKey = CACHE_KEYS.COACH_EARNINGS(coachId);
    const cached = apiCache.get(cacheKey);
    if (cached) {
      console.log('[Earnings PERF] Cache HIT for coach:', coachId);
      return res.json(cached);
    }
    
    const _perfStart = Date.now();
    console.log('[Earnings PERF] Starting calculation for coach:', coachId);
    
    const dateParam = req.query.date as string | undefined;
    const now = dateParam ? new Date(dateParam) : new Date(); const DUBAI_OFFSET = 4; const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    const contracts = await storage.getCoachContractsByCoach(coachId);
    
    const primaryContract = contracts[0];
    
    const completedSessions = await storage.getCoachCompletedSessionsForMonth(coachId, currentMonth, currentYear);
    
    const upcomingSessions = await storage.getCoachUpcomingSessionsForMonth(coachId, currentMonth, currentYear);
    

    console.log('[Earnings PERF] Fetching sessions:', Date.now() - _perfStart, 'ms, completed:', completedSessions.length, 'upcoming:', upcomingSessions.length);
    
    const allSessions = [...completedSessions, ...upcomingSessions];
    const allSessionIds = allSessions.map(s => s.id).filter(Boolean) as string[];
    const allSeriesIds = allSessions.map(s => (s as any).seriesId).filter(Boolean) as string[];
    
    const [sessionPlayersData, seriesPlayersData] = await Promise.all([
      storage.getSessionPlayersBatch(allSessionIds),
      storage.getSeriesPlayersBatch(allSeriesIds)
    ]);
    
    const sessionPlayersMap = new Map<string, number>();
    for (const sp of sessionPlayersData) {
      const count = sessionPlayersMap.get(sp.sessionId) || 0;
      sessionPlayersMap.set(sp.sessionId, count + 1);
    }
    
    const seriesPlayersMap = new Map<string, number>();
    for (const sp of seriesPlayersData) {
      if (sp.status === "active") {
        const count = seriesPlayersMap.get(sp.seriesId) || 0;
        seriesPlayersMap.set(sp.seriesId, count + 1);
      }
    }
    
    const normalizeSessionTypeLocal = (type: string): string => {
      const cleaned = (type || "private").toLowerCase().replace(/-/g, "_").trim();
      if (cleaned === "semi" || cleaned === "semi_private" || cleaned === "semi_private_adjusted") return "semi_private";
      if (cleaned === "private_adjusted") return "private";
      if (cleaned === "group_adjusted") return "group";
      return cleaned;
    };
    const pricingMap = new Map<string, any>();
    const academyIdSet = new Set<string>();
    const sessionTypeSet = new Set<string>();
    for (const s of allSessions) {
      if (s.academyId) {
        academyIdSet.add(s.academyId);
        sessionTypeSet.add(normalizeSessionTypeLocal((s as any).sessionType));
      }
    }
    if (academyIdSet.size > 0 && sessionTypeSet.size > 0) {
      const today = new Date().toISOString().split('T')[0];
      const pricingRows = await db.select().from(academyPricing)
        .where(and(
          inArray(academyPricing.academyId, Array.from(academyIdSet)),
          inArray(academyPricing.sessionType, Array.from(sessionTypeSet)),
          eq(academyPricing.isActive, true),
          lte(academyPricing.effectiveFrom, today),
          or(
            isNull(academyPricing.effectiveUntil),
            gte(academyPricing.effectiveUntil, today)
          )
        ))
        .orderBy(desc(academyPricing.effectiveFrom));
      for (const row of pricingRows) {
        const key = `${row.academyId}_${row.sessionType}`;
        if (!pricingMap.has(key)) pricingMap.set(key, row);
      }
    }
    const getAcademyPricingCached = async (academyId: string, sessionType: string) => {
      return pricingMap.get(`${academyId}_${sessionType}`) || null;
    };
    console.log('[Earnings PERF] Batch fetch done:', Date.now() - _perfStart, 'ms, sessions:', allSessionIds.length, 'series:', allSeriesIds.length, 'pricing:', pricingMap.size);
    
    const realizedByCurrency: Record<string, { amount: number; sessions: number }> = {};
    const projectedByCurrency: Record<string, { amount: number; sessions: number }> = {};
    const errors: Array<{ sessionId: string; code: string; message: string }> = [];
    
    const cachedData = { sessionPlayersMap, seriesPlayersMap, getPricing: getAcademyPricingCached };
    
    const [completedEarnings, upcomingEarnings] = await Promise.all([
      Promise.all(completedSessions.map(session => calculateSessionEarning(session, coachId, contracts, cachedData).then(e => ({ session, earning: e })))),
      Promise.all(upcomingSessions.map(session => calculateSessionEarning(session, coachId, contracts, cachedData).then(e => ({ session, earning: e }))))
    ]);
    
    console.log('[Earnings PERF] Parallel calculation done:', Date.now() - _perfStart, 'ms');
    
    for (const { session, earning } of completedEarnings) {
      if (earning.warning) {
        errors.push({
          sessionId: session.id,
          code: earning.warning,
          message: getWarningMessage(earning.warning),
        });
      }
      if (!realizedByCurrency[earning.currency]) {
        realizedByCurrency[earning.currency] = { amount: 0, sessions: 0 };
      }
      realizedByCurrency[earning.currency].amount += earning.amount;
      realizedByCurrency[earning.currency].sessions += 1;
    }
    
    for (const { session, earning } of upcomingEarnings) {
      if (earning.warning) {
        errors.push({
          sessionId: session.id,
          code: earning.warning,
          message: getWarningMessage(earning.warning),
        });
      }
      if (!projectedByCurrency[earning.currency]) {
        projectedByCurrency[earning.currency] = { amount: 0, sessions: 0 };
      }
      projectedByCurrency[earning.currency].amount += earning.amount;
      projectedByCurrency[earning.currency].sessions += 1;
    }
    
    const displayCurrency = primaryContract?.currency || "AED";
    
    const realizedData = realizedByCurrency[displayCurrency] || { amount: 0, sessions: 0 };
    const projectedData = projectedByCurrency[displayCurrency] || { amount: 0, sessions: 0 };
    
    const otherCurrencies = Object.keys({ ...realizedByCurrency, ...projectedByCurrency }).filter(c => c !== displayCurrency);
    
    if (otherCurrencies.length > 0) {
      console.warn(`[Earnings] Coach ${coachId} has earnings in multiple currencies: ${[displayCurrency, ...otherCurrencies].join(', ')}`);
    }
    
    let paymentRuleDisplay: { type: string; hourlyRate?: string; percentageRate?: string; currency: string; isDefault: boolean };
    if (primaryContract) {
      paymentRuleDisplay = {
        type: primaryContract.payType || "hourly",
        currency: primaryContract.currency || "AED",
        isDefault: false,
      };
      if (primaryContract.payType === "hourly") {
        paymentRuleDisplay.hourlyRate = primaryContract.hourlyRate;
      } else if (primaryContract.payType === "percentage") {
        paymentRuleDisplay.percentageRate = primaryContract.percentageRate;
      } else if (primaryContract.payType === "per_session") {
        paymentRuleDisplay.hourlyRate = primaryContract.sessionRate;
      }
    } else {
      paymentRuleDisplay = { type: "hourly", currency: "AED", isDefault: true };
    }
    
    const response = {
      realized: {
        amount: realizedData.amount.toFixed(2),
        currency: displayCurrency,
        sessionsCount: realizedData.sessions,
        status: "confirmed",
      },
      projected: {
        amount: projectedData.amount.toFixed(2),
        currency: displayCurrency,
        sessionsCount: projectedData.sessions,
        status: "pending",
      },
      total: {
        amount: (realizedData.amount + projectedData.amount).toFixed(2),
        currency: displayCurrency,
      },
      paymentRule: paymentRuleDisplay,
      period: {
        month: currentMonth,
        year: currentYear,
        monthName: now.toLocaleString("en-US", { month: "long" }),
      },
      ...(otherCurrencies.length > 0 ? {
        multiCurrencyBreakdown: {
          realized: Object.fromEntries(
            Object.entries(realizedByCurrency).map(([cur, data]) => [cur, { amount: data.amount.toFixed(2), sessions: data.sessions }])
          ),
          projected: Object.fromEntries(
            Object.entries(projectedByCurrency).map(([cur, data]) => [cur, { amount: data.amount.toFixed(2), sessions: data.sessions }])
          ),
        },
      } : {}),
      ...(errors.length > 0 ? { configErrors: errors } : {}),
    };
    
    apiCache.set(cacheKey, response, CACHE_TTL.COACH_EARNINGS);
    console.log('[Earnings PERF] Cache SET for coach:', coachId, 'Total time:', Date.now() - _perfStart, 'ms');
    
    res.json(response);
  } catch (error) {
    console.error("Error fetching coach earnings summary:", error);
    res.status(500).json({ error: "Failed to fetch earnings summary" });
  }
});

router.get("/api/coach/earnings/breakdown", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const coachId = req.user!.coachId;
    if (!coachId) {
      return res.status(400).json({ error: "Coach ID required" });
    }
    
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    
    const contracts = await storage.getCoachContractsByCoach(coachId);
    const primaryContract = contracts[0];
    const currency = primaryContract?.currency || "AED";
    
    const completedSessions = await storage.getCoachCompletedSessionsForMonth(coachId, month, year);
    
    const allSessionIds = completedSessions.map(s => s.id).filter(Boolean) as string[];
    const allSeriesIds = completedSessions.map(s => (s as any).seriesId).filter(Boolean) as string[];
    
    const [sessionPlayersData, seriesPlayersData] = await Promise.all([
      storage.getSessionPlayersBatch(allSessionIds),
      storage.getSeriesPlayersBatch(allSeriesIds)
    ]);
    
    const sessionPlayersMap = new Map<string, number>();
    for (const sp of sessionPlayersData) {
      const count = sessionPlayersMap.get(sp.sessionId) || 0;
      sessionPlayersMap.set(sp.sessionId, count + 1);
    }
    const seriesPlayersMap = new Map<string, number>();
    for (const sp of seriesPlayersData) {
      if (sp.status === "active") {
        const count = seriesPlayersMap.get(sp.seriesId) || 0;
        seriesPlayersMap.set(sp.seriesId, count + 1);
      }
    }
    const normalizeSessionTypeLocal = (type: string): string => {
      const cleaned = (type || "private").toLowerCase().replace(/-/g, "_").trim();
      if (cleaned === "semi" || cleaned === "semi_private" || cleaned === "semi_private_adjusted") return "semi_private";
      if (cleaned === "private_adjusted") return "private";
      if (cleaned === "group_adjusted") return "group";
      return cleaned;
    };
    const pricingMap = new Map<string, any>();
    const academyIdSet = new Set<string>();
    const sessionTypeSet = new Set<string>();
    for (const s of completedSessions) {
      if (s.academyId) {
        academyIdSet.add(s.academyId);
        sessionTypeSet.add(normalizeSessionTypeLocal((s as any).sessionType));
      }
    }
    if (academyIdSet.size > 0 && sessionTypeSet.size > 0) {
      const today = new Date().toISOString().split('T')[0];
      const pricingRows = await db.select().from(academyPricing)
        .where(and(
          inArray(academyPricing.academyId, Array.from(academyIdSet)),
          inArray(academyPricing.sessionType, Array.from(sessionTypeSet)),
          eq(academyPricing.isActive, true),
          lte(academyPricing.effectiveFrom, today),
          or(
            isNull(academyPricing.effectiveUntil),
            gte(academyPricing.effectiveUntil, today)
          )
        ))
        .orderBy(desc(academyPricing.effectiveFrom));
      for (const row of pricingRows) {
        const key = `${row.academyId}_${row.sessionType}`;
        if (!pricingMap.has(key)) pricingMap.set(key, row);
      }
    }
    const getPricingCached = async (academyId: string, sessionType: string) => {
      return pricingMap.get(`${academyId}_${sessionType}`) || null;
    };
    const cachedData = { sessionPlayersMap, seriesPlayersMap, getPricing: getPricingCached };
    
    const earnings = await Promise.all(
      completedSessions.map(session => calculateSessionEarning(session, coachId, contracts, cachedData).then(e => ({ session, earning: e })))
    );
    
    const breakdown = [];
    const totalsByCurrency: Record<string, { amount: number; sessions: number }> = {};
    
    for (const { session, earning } of earnings) {
      breakdown.push({
        id: session.id,
        date: session.startTime,
        sessionType: session.sessionType,
        duration: session.duration || 60,
        amount: earning.amount.toFixed(2),
        currency: earning.currency,
        status: "confirmed",
        ...(earning.warning ? { warning: earning.warning } : {}),
      });
      if (!totalsByCurrency[earning.currency]) {
        totalsByCurrency[earning.currency] = { amount: 0, sessions: 0 };
      }
      totalsByCurrency[earning.currency].amount += earning.amount;
      totalsByCurrency[earning.currency].sessions += 1;
    }
    
    const currencyData = totalsByCurrency[currency] || { amount: 0, sessions: 0 };
    const totalEarned = currencyData.amount;
    const sessionsInCurrency = currencyData.sessions;
    const avgPerLesson = sessionsInCurrency > 0 ? totalEarned / sessionsInCurrency : 0;
    
    let paymentRuleDisplay: { type: string; hourlyRate?: string; percentageRate?: string; currency: string; isDefault: boolean };
    if (primaryContract) {
      paymentRuleDisplay = {
        type: primaryContract.payType || "hourly",
        currency: primaryContract.currency || "AED",
        isDefault: false,
      };
      if (primaryContract.payType === "hourly") {
        paymentRuleDisplay.hourlyRate = primaryContract.hourlyRate;
      } else if (primaryContract.payType === "percentage") {
        paymentRuleDisplay.percentageRate = primaryContract.percentageRate;
      } else if (primaryContract.payType === "per_session") {
        paymentRuleDisplay.hourlyRate = primaryContract.sessionRate;
      }
    } else {
      paymentRuleDisplay = { type: "hourly", hourlyRate: "150", currency: "AED", isDefault: true };
    }
    
    const otherCurrencies = Object.keys(totalsByCurrency).filter(c => c !== currency);
    
    res.json({
      breakdown,
      summary: {
        totalEarned: totalEarned.toFixed(2),
        totalSessions: sessionsInCurrency,
        avgPerLesson: avgPerLesson.toFixed(2),
        currency,
      },
      paymentRule: paymentRuleDisplay,
      period: { month, year },
      ...(otherCurrencies.length > 0 ? {
        multiCurrencyBreakdown: Object.fromEntries(
          Object.entries(totalsByCurrency).map(([cur, data]) => [cur, { amount: data.amount.toFixed(2), sessions: data.sessions }])
        ),
      } : {}),
    });
  } catch (error) {
    console.error("Error fetching coach earnings breakdown:", error);
    res.status(500).json({ error: "Failed to fetch earnings breakdown" });
  }
});

router.get("/api/coach/earnings/history", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const coachId = req.user!.coachId;
    if (!coachId) {
      return res.status(400).json({ error: "Coach ID required" });
    }
    
    const contracts = await storage.getCoachContractsByCoach(coachId);
    const primaryContract = contracts[0];
    const currency = primaryContract?.currency || "AED";
    
    const now = new Date();
    
    const months = Array.from({ length: 6 }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { month: date.getMonth() + 1, year: date.getFullYear(), date };
    });
    
    const allMonthSessions = await Promise.all(
      months.map(m => storage.getCoachCompletedSessionsForMonth(coachId, m.month, m.year))
    );
    
    const allSessions = allMonthSessions.flat();
    const allSessionIds = allSessions.map(s => s.id).filter(Boolean) as string[];
    const allSeriesIds = allSessions.map(s => (s as any).seriesId).filter(Boolean) as string[];
    
    const [sessionPlayersData, seriesPlayersData] = await Promise.all([
      allSessionIds.length > 0 ? storage.getSessionPlayersBatch(allSessionIds) : Promise.resolve([]),
      allSeriesIds.length > 0 ? storage.getSeriesPlayersBatch(allSeriesIds) : Promise.resolve([])
    ]);
    
    const sessionPlayersMap = new Map<string, number>();
    for (const sp of sessionPlayersData) {
      const count = sessionPlayersMap.get(sp.sessionId) || 0;
      sessionPlayersMap.set(sp.sessionId, count + 1);
    }
    const seriesPlayersMap = new Map<string, number>();
    for (const sp of seriesPlayersData) {
      if (sp.status === "active") {
        const count = seriesPlayersMap.get(sp.seriesId) || 0;
        seriesPlayersMap.set(sp.seriesId, count + 1);
      }
    }
    const pricingCache = new Map<string, any>();
    const getPricingCached = async (academyId: string, sessionType: string) => {
      const key = `${academyId}_${sessionType}`;
      if (!pricingCache.has(key)) {
        pricingCache.set(key, await storage.getAcademyPricingByType(academyId, sessionType));
      }
      return pricingCache.get(key);
    };
    const cachedData = { sessionPlayersMap, seriesPlayersMap, getPricing: getPricingCached };
    
    const history = [];
    for (let i = 0; i < months.length; i++) {
      const { month, year, date } = months[i];
      const sessions = allMonthSessions[i];
      
      const earnings = await Promise.all(
        sessions.map(session => calculateSessionEarning(session, coachId, contracts, cachedData))
      );
      
      const earnedByCurrency: Record<string, { amount: number; sessions: number }> = {};
      for (const earning of earnings) {
        if (!earnedByCurrency[earning.currency]) {
          earnedByCurrency[earning.currency] = { amount: 0, sessions: 0 };
        }
        earnedByCurrency[earning.currency].amount += earning.amount;
        earnedByCurrency[earning.currency].sessions += 1;
      }
      
      const currencyData = earnedByCurrency[currency] || { amount: 0, sessions: 0 };
      const totalEarned = currencyData.amount;
      const sessionsInCurrency = currencyData.sessions;
      const avgPerLesson = sessionsInCurrency > 0 ? totalEarned / sessionsInCurrency : 0;
      
      const otherCurrencies = Object.keys(earnedByCurrency).filter(c => c !== currency);
      
      history.push({
        month,
        year,
        monthName: date.toLocaleString("en-US", { month: "long" }),
        totalEarned: totalEarned.toFixed(2),
        totalSessions: sessionsInCurrency,
        avgPerLesson: avgPerLesson.toFixed(2),
        currency,
        ...(otherCurrencies.length > 0 ? {
          multiCurrencyBreakdown: Object.fromEntries(
            Object.entries(earnedByCurrency).map(([cur, data]) => [cur, { amount: data.amount.toFixed(2), sessions: data.sessions }])
          ),
        } : {}),
      });
    }
    
    res.json({ history });
  } catch (error) {
    console.error("Error fetching coach earnings history:", error);
    res.status(500).json({ error: "Failed to fetch earnings history" });
  }
});

router.get("/api/coach/earnings/analytics", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const coachId = req.user!.coachId;
    if (!coachId) {
      return res.status(400).json({ error: "Coach ID required" });
    }

    const cacheKey = `coach_earnings_analytics_${coachId}`;
    const cached = apiCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const contracts = await storage.getCoachContractsByCoach(coachId);
    const primaryContract = contracts[0];
    const currency = primaryContract?.currency || "AED";

    const completedSessions = await storage.getCoachCompletedSessionsForMonth(coachId, currentMonth, currentYear);

    const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59);
    const cancelledSessions = await db.select().from(sessions)
      .where(and(
        eq(sessions.coachId, coachId),
        eq(sessions.status, "cancelled"),
        gte(sessions.startTime, startOfMonth),
        lte(sessions.startTime, endOfMonth)
      ));

    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevCompletedSessions = await storage.getCoachCompletedSessionsForMonth(coachId, prevMonth, prevYear);

    const yearlyMonthSessions = await Promise.all(
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        return storage.getCoachCompletedSessionsForMonth(coachId, m, currentYear);
      })
    );

    const allSessionsFlat = [...completedSessions, ...cancelledSessions, ...prevCompletedSessions, ...yearlyMonthSessions.flat()];
    const allSessionIds = [...new Set(allSessionsFlat.map(s => s.id).filter(Boolean))] as string[];
    const allSeriesIds = [...new Set(allSessionsFlat.map(s => (s as any).seriesId).filter(Boolean))] as string[];

    const [sessionPlayersData, seriesPlayersData] = await Promise.all([
      allSessionIds.length > 0 ? storage.getSessionPlayersBatch(allSessionIds) : Promise.resolve([]),
      allSeriesIds.length > 0 ? storage.getSeriesPlayersBatch(allSeriesIds) : Promise.resolve([])
    ]);

    const sessionPlayersMap = new Map<string, number>();
    for (const sp of sessionPlayersData) {
      const count = sessionPlayersMap.get(sp.sessionId) || 0;
      sessionPlayersMap.set(sp.sessionId, count + 1);
    }
    const seriesPlayersMap = new Map<string, number>();
    for (const sp of seriesPlayersData) {
      if (sp.status === "active") {
        const count = seriesPlayersMap.get(sp.seriesId) || 0;
        seriesPlayersMap.set(sp.seriesId, count + 1);
      }
    }
    const pricingCache = new Map<string, any>();
    const getPricingCached = async (academyId: string, sessionType: string) => {
      const key = `${academyId}_${sessionType}`;
      if (!pricingCache.has(key)) {
        pricingCache.set(key, await storage.getAcademyPricingByType(academyId, sessionType));
      }
      return pricingCache.get(key);
    };
    const cachedData = { sessionPlayersMap, seriesPlayersMap, getPricing: getPricingCached };

    const completedEarnings = await Promise.all(
      completedSessions.map(session => calculateSessionEarning(session, coachId, contracts, cachedData).then(e => ({ session, earning: e })))
    );

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayFullNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weekdayData: { earnings: number; sessions: number; hours: number }[] = Array.from({ length: 7 }, () => ({ earnings: 0, sessions: 0, hours: 0 }));

    const sessionTypeData: Record<string, { earnings: number; sessions: number }> = {};
    const peakHoursData = {
      morning: { earnings: 0, sessions: 0 },
      afternoon: { earnings: 0, sessions: 0 },
      evening: { earnings: 0, sessions: 0 },
    };
    const playerEarningsMap = new Map<string, { earnings: number; sessions: number }>();
    const weeklyData: { earnings: number; sessions: number }[] = Array.from({ length: 5 }, () => ({ earnings: 0, sessions: 0 }));
    const activeDates = new Set<string>();

    const completedSessionIds = new Set(completedSessions.map(s => s.id));

    for (const { session, earning } of completedEarnings) {
      const sessionDate = new Date(session.startTime!);
      const dayOfWeek = sessionDate.getDay();
      const hour = sessionDate.getHours();
      const dayOfMonth = sessionDate.getDate();
      const weekIndex = Math.min(Math.floor((dayOfMonth - 1) / 7), 4);
      const duration = session.duration || 60;

      weekdayData[dayOfWeek].earnings += earning.amount;
      weekdayData[dayOfWeek].sessions += 1;
      weekdayData[dayOfWeek].hours += duration / 60;

      const normalizeType = (type: string): string => {
        const cleaned = type.toLowerCase().replace(/-/g, "_").trim();
        if (cleaned === "semi" || cleaned === "semi_private" || cleaned === "semi_private_adjusted") return "semi_private";
        if (cleaned === "private_adjusted") return "private";
        if (cleaned === "group_adjusted") return "group";
        return cleaned;
      };
      const sType = normalizeType(session.sessionType || "private");
      if (!sessionTypeData[sType]) sessionTypeData[sType] = { earnings: 0, sessions: 0 };
      sessionTypeData[sType].earnings += earning.amount;
      sessionTypeData[sType].sessions += 1;

      if (hour >= 6 && hour <= 11) {
        peakHoursData.morning.earnings += earning.amount;
        peakHoursData.morning.sessions += 1;
      } else if (hour >= 12 && hour <= 16) {
        peakHoursData.afternoon.earnings += earning.amount;
        peakHoursData.afternoon.sessions += 1;
      } else if (hour >= 17 && hour <= 21) {
        peakHoursData.evening.earnings += earning.amount;
        peakHoursData.evening.sessions += 1;
      }

      weeklyData[weekIndex].earnings += earning.amount;
      weeklyData[weekIndex].sessions += 1;

      const dateStr = sessionDate.toISOString().split("T")[0];
      activeDates.add(dateStr);
    }

    for (const sp of sessionPlayersData) {
      if (!completedSessionIds.has(sp.sessionId)) continue;
      const matchingEarning = completedEarnings.find(e => e.session.id === sp.sessionId);
      if (!matchingEarning) continue;
      const playerCount = sessionPlayersMap.get(sp.sessionId) || 1;
      const perPlayerEarning = matchingEarning.earning.amount / playerCount;
      const existing = playerEarningsMap.get(sp.playerId) || { earnings: 0, sessions: 0 };
      existing.earnings += perPlayerEarning;
      existing.sessions += 1;
      playerEarningsMap.set(sp.playerId, existing);
    }

    const sortedPlayers = Array.from(playerEarningsMap.entries())
      .sort((a, b) => b[1].earnings - a[1].earnings)
      .slice(0, 5);

    const topPlayerIds = sortedPlayers.map(([pid]) => pid);
    const topPlayerRecords = topPlayerIds.length > 0 
      ? await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, topPlayerIds))
      : [];
    const playerNameMap = new Map(topPlayerRecords.map(p => [p.id, p.name]));
    const topPlayers = sortedPlayers.map(([playerId, data]) => ({
      playerId,
      playerName: playerNameMap.get(playerId) || "Unknown Player",
      earnings: Math.round(data.earnings),
      sessions: data.sessions,
    }));

    const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
    const weekdayBreakdown = weekdayOrder.map(i => ({
      day: dayNames[i],
      dayFull: dayFullNames[i],
      earnings: Math.round(weekdayData[i].earnings),
      sessions: weekdayData[i].sessions,
      hours: Math.round(weekdayData[i].hours * 10) / 10,
    }));

    const totalSessionTypeEarnings = Object.values(sessionTypeData).reduce((s, d) => s + d.earnings, 0);
    const typeLabels: Record<string, string> = { private: "Private", semi_private: "Semi-Private", group: "Group" };
    const sessionTypeBreakdown = Object.entries(sessionTypeData).map(([type, data]) => ({
      type,
      label: typeLabels[type] || type,
      earnings: Math.round(data.earnings),
      sessions: data.sessions,
      percentage: totalSessionTypeEarnings > 0 ? Math.round((data.earnings / totalSessionTypeEarnings) * 100) : 0,
    }));

    const peakHours = {
      morning: { earnings: Math.round(peakHoursData.morning.earnings), sessions: peakHoursData.morning.sessions, label: "6AM-12PM" },
      afternoon: { earnings: Math.round(peakHoursData.afternoon.earnings), sessions: peakHoursData.afternoon.sessions, label: "12PM-5PM" },
      evening: { earnings: Math.round(peakHoursData.evening.earnings), sessions: peakHoursData.evening.sessions, label: "5PM-10PM" },
    };

    const weeklyBreakdown = weeklyData.map((data, i) => {
      const weekStart = i * 7 + 1;
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const weekEnd = Math.min(weekStart + 6, daysInMonth);
      const startDate = new Date(currentYear, currentMonth - 1, weekStart);
      const endDate = new Date(currentYear, currentMonth - 1, weekEnd);
      const monthShort = startDate.toLocaleString("en-US", { month: "short" });
      return {
        week: i + 1,
        label: `Week ${i + 1}`,
        startDate: `${monthShort} ${weekStart}`,
        endDate: `${monthShort} ${weekEnd}`,
        earnings: Math.round(data.earnings),
        sessions: data.sessions,
      };
    });

    const currentMonthEarnings = completedEarnings.reduce((s, e) => s + e.earning.amount, 0);
    const currentMonthSessions = completedEarnings.length;

    const prevEarnings = await Promise.all(
      prevCompletedSessions.map(session => calculateSessionEarning(session, coachId, contracts, cachedData))
    );
    const previousMonthEarnings = prevEarnings.reduce((s, e) => s + e.amount, 0);
    const previousMonthSessions = prevEarnings.length;

    const changePercent = previousMonthEarnings > 0
      ? Math.round(((currentMonthEarnings - previousMonthEarnings) / previousMonthEarnings) * 1000) / 10
      : (currentMonthEarnings > 0 ? 100 : 0);
    const trend = changePercent > 0 ? "up" : changePercent < 0 ? "down" : "stable";

    const monthComparison = {
      currentMonth: { earnings: Math.round(currentMonthEarnings), sessions: currentMonthSessions },
      previousMonth: { earnings: Math.round(previousMonthEarnings), sessions: previousMonthSessions },
      changePercent,
      trend,
    };

    let yearlyEarningsTotal = 0;
    let yearlySessionsTotal = 0;
    let monthsTracked = 0;
    const monthlyEarningsForRecords: { month: number; year: number; earnings: number; sessions: number }[] = [];

    for (let i = 0; i < 12; i++) {
      const monthSessions = yearlyMonthSessions[i];
      if (monthSessions.length === 0) continue;
      monthsTracked++;
      const monthEarnings = await Promise.all(
        monthSessions.map(session => calculateSessionEarning(session, coachId, contracts, cachedData))
      );
      const monthTotal = monthEarnings.reduce((s, e) => s + e.amount, 0);
      yearlyEarningsTotal += monthTotal;
      yearlySessionsTotal += monthSessions.length;
      monthlyEarningsForRecords.push({ month: i + 1, year: currentYear, earnings: monthTotal, sessions: monthSessions.length });
    }

    const yearlyTotal = {
      earnings: Math.round(yearlyEarningsTotal),
      sessions: yearlySessionsTotal,
      monthsTracked,
    };

    const cancelledEarnings = await Promise.all(
      cancelledSessions.map(session => calculateSessionEarning(session, coachId, contracts, cachedData))
    );
    const estimatedLoss = cancelledEarnings.reduce((s, e) => s + e.amount, 0);
    const totalSessionsForRate = completedSessions.length + cancelledSessions.length;
    const cancellationRate = totalSessionsForRate > 0
      ? Math.round((cancelledSessions.length / totalSessionsForRate) * 100)
      : 0;

    const cancellationImpact = {
      cancelledSessions: cancelledSessions.length,
      estimatedLoss: Math.round(estimatedLoss),
      cancellationRate,
    };

    const totalHoursWorked = completedSessions.reduce((s, ses) => s + (ses.duration || 60) / 60, 0);
    const activeDaysCount = activeDates.size;
    const daysInCurrentMonth = new Date(currentYear, currentMonth, 0).getDate();
    const restDays = daysInCurrentMonth - activeDaysCount;
    const avgHoursPerDay = activeDaysCount > 0 ? Math.round((totalHoursWorked / activeDaysCount) * 10) / 10 : 0;
    const avgPerHour = totalHoursWorked > 0 ? Math.round(currentMonthEarnings / totalHoursWorked) : 0;

    let busiestDay = "Monday";
    let maxDaySessions = 0;
    for (let i = 0; i < 7; i++) {
      if (weekdayData[i].sessions > maxDaySessions) {
        maxDaySessions = weekdayData[i].sessions;
        busiestDay = dayFullNames[i];
      }
    }

    const workPatterns = {
      totalHoursWorked: Math.round(totalHoursWorked * 10) / 10,
      avgHoursPerDay,
      activeDays: activeDaysCount,
      restDays,
      busiestDay,
      avgPerHour,
    };

    const allCompletedSessionsEver = await db.select({ startTime: sessions.startTime }).from(sessions)
      .where(and(
        eq(sessions.coachId, coachId),
        or(eq(sessions.status, "completed"), lte(sessions.endTime, now))
      ))
      .orderBy(asc(sessions.startTime));

    const allDatesSet = new Set<string>();
    for (const s of allCompletedSessionsEver) {
      if (s.startTime) allDatesSet.add(new Date(s.startTime).toISOString().split("T")[0]);
    }
    const allDatesSorted = Array.from(allDatesSet).sort();

    let bestStreak = 0;
    let currentStreakCount = 0;
    for (let i = 0; i < allDatesSorted.length; i++) {
      if (i === 0) {
        currentStreakCount = 1;
      } else {
        const prev = new Date(allDatesSorted[i - 1]);
        const curr = new Date(allDatesSorted[i]);
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays === 1) {
          currentStreakCount++;
        } else {
          currentStreakCount = 1;
        }
      }
      bestStreak = Math.max(bestStreak, currentStreakCount);
    }

    let currentStreak = 0;
    const todayStr = now.toISOString().split("T")[0];
    const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().split("T")[0];
    if (allDatesSet.has(todayStr) || allDatesSet.has(yesterdayStr)) {
      const startCheck = allDatesSet.has(todayStr) ? todayStr : yesterdayStr;
      let checkDate = new Date(startCheck);
      while (allDatesSet.has(checkDate.toISOString().split("T")[0])) {
        currentStreak++;
        checkDate = new Date(checkDate.getTime() - 86400000);
      }
    }

    const avgMonthlyEarnings = monthlyEarningsForRecords.length > 0
      ? monthlyEarningsForRecords.reduce((s, m) => s + m.earnings, 0) / monthlyEarningsForRecords.length
      : 0;
    let consecutiveMonthsAboveAvg = 0;
    for (let i = monthlyEarningsForRecords.length - 1; i >= 0; i--) {
      if (monthlyEarningsForRecords[i].earnings >= avgMonthlyEarnings) {
        consecutiveMonthsAboveAvg++;
      } else {
        break;
      }
    }

    const streaks = { currentStreak, bestStreak, consecutiveMonthsAboveAvg };

    const milestones: any[] = [];
    const sessionMilestones = [
      { id: "first_100_sessions", count: 100, title: "Century Coach", description: "100 sessions completed", icon: "trophy" },
      { id: "first_500_sessions", count: 500, title: "500 Club", description: "500 sessions completed", icon: "star" },
      { id: "first_1000_sessions", count: 1000, title: "Grand Master", description: "1,000 sessions completed", icon: "crown" },
    ];
    for (const m of sessionMilestones) {
      const achieved = yearlySessionsTotal >= m.count;
      milestones.push({
        id: m.id, title: m.title, description: m.description, achieved, icon: m.icon,
        ...(!achieved ? { progress: Math.min(Math.round((yearlySessionsTotal / m.count) * 100), 99) } : {}),
      });
    }
    const earningsMilestones = [
      { id: "earned_50k", amount: 50000, title: "50K Earner", description: `Earned ${currency} 50,000+`, icon: "cash" },
      { id: "earned_100k", amount: 100000, title: "100K Club", description: `Earned ${currency} 100,000+`, icon: "diamond" },
      { id: "earned_250k", amount: 250000, title: "Quarter Million", description: `Earned ${currency} 250,000+`, icon: "gem" },
      { id: "earned_500k", amount: 500000, title: "Half Million", description: `Earned ${currency} 500,000+`, icon: "rocket" },
    ];
    for (const m of earningsMilestones) {
      const achieved = yearlyEarningsTotal >= m.amount;
      milestones.push({
        id: m.id, title: m.title, description: m.description, achieved, icon: m.icon,
        ...(!achieved ? { progress: Math.min(Math.round((yearlyEarningsTotal / m.amount) * 100), 99) } : {}),
      });
    }

    let bestMonth = { month: "January", year: currentYear, earnings: 0 };
    let bestDay = { date: now.toISOString().split("T")[0], earnings: 0 };
    let bestWeek = { weekStart: now.toISOString().split("T")[0], earnings: 0 };

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    for (const mr of monthlyEarningsForRecords) {
      if (mr.earnings > bestMonth.earnings) {
        bestMonth = { month: monthNames[mr.month - 1], year: mr.year, earnings: Math.round(mr.earnings) };
      }
    }

    const dailyEarnings = new Map<string, number>();
    for (const { session, earning } of completedEarnings) {
      const dateStr = new Date(session.startTime!).toISOString().split("T")[0];
      dailyEarnings.set(dateStr, (dailyEarnings.get(dateStr) || 0) + earning.amount);
    }
    for (const [dateStr, amount] of dailyEarnings) {
      if (amount > bestDay.earnings) {
        bestDay = { date: dateStr, earnings: Math.round(amount) };
      }
    }

    const weeklyEarningsMap = new Map<string, number>();
    for (const { session, earning } of completedEarnings) {
      const sessionDate = new Date(session.startTime!);
      const dayOfWeekOffset = (sessionDate.getDay() + 6) % 7;
      const weekStartDate = new Date(sessionDate);
      weekStartDate.setDate(weekStartDate.getDate() - dayOfWeekOffset);
      const weekKey = weekStartDate.toISOString().split("T")[0];
      weeklyEarningsMap.set(weekKey, (weeklyEarningsMap.get(weekKey) || 0) + earning.amount);
    }
    for (const [weekStart, amount] of weeklyEarningsMap) {
      if (amount > bestWeek.earnings) {
        bestWeek = { weekStart, earnings: Math.round(amount) };
      }
    }

    const isCurrentMonthRecord = monthlyEarningsForRecords.length > 0 &&
      currentMonthEarnings >= Math.max(...monthlyEarningsForRecords.map(m => m.earnings));

    const personalRecords = {
      bestMonth,
      bestDay,
      bestWeek,
      isCurrentMonthRecord,
    };

    const response = {
      weekdayBreakdown,
      sessionTypeBreakdown,
      peakHours,
      topPlayers,
      weeklyBreakdown,
      monthComparison,
      yearlyTotal,
      cancellationImpact,
      workPatterns,
      streaks,
      milestones,
      personalRecords,
      currency,
      period: { month: currentMonth, year: currentYear },
    };

    apiCache.set(cacheKey, response, 5 * 60 * 1000);
    res.json(response);
  } catch (error) {
    console.error("Error fetching coach earnings analytics:", error);
    res.status(500).json({ error: "Failed to fetch earnings analytics" });
  }
});

router.get("/api/coach/payment-rule", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const coachId = req.user!.coachId;
    if (!coachId) {
      return res.status(400).json({ error: "Coach ID required" });
    }
    
    const paymentRule = await storage.getCoachPaymentRule(coachId);
    
    if (!paymentRule) {
      return res.json({
        type: "hourly",
        hourlyRate: "150",
        currency: "AED",
        isDefault: true,
      });
    }
    
    res.json({
      type: paymentRule.paymentType,
      hourlyRate: paymentRule.hourlyRate,
      privateSessionRate: paymentRule.privateSessionRate,
      groupSessionRate: paymentRule.groupSessionRate,
      commissionPercentage: paymentRule.commissionPercentage,
      hybridBaseRate: paymentRule.hybridBaseRate,
      hybridCommissionPercentage: paymentRule.hybridCommissionPercentage,
      currency: paymentRule.currency,
      isDefault: false,
    });
  } catch (error) {
    console.error("Error fetching coach payment rule:", error);
    res.status(500).json({ error: "Failed to fetch payment rule" });
  }
});

export default router;
