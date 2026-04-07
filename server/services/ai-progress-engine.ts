import { db } from "../db";
import { eq, and, desc, gte, inArray, count } from "drizzle-orm";
import OpenAI from "openai";
import {
  inSessionFeedback,
  sessionSkillFeedback,
  sessionSkillObservations,
  sessionPlayers,
  sessions,
  players,
  playerBallLevels,
  playerSkillScores,
  glowSkills,
  levelSkills,
  sessionAiSummaries,
  sessionAiBriefs,
  playerAiInsights,
  playerBaselineSkillScores,
  coaches,
  playerNotes,
  matchLogs,
  playerXpEvents,
  questTemplates,
  playerQuests as playerQuestsTable,
  tournamentMatches,
  playerSessionReflections,
  playerMonthlyAssessments,
  playerPillarProgress,
  playerBaselines,
} from "@shared/schema";
import type { QuestTemplate } from "@shared/schema";
import { logAiCall } from "../middleware/aiQuotaMiddleware";
import { getAcademyBudgetState } from "./aiBudgetService";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export const BUDGET_EXHAUSTED_MESSAGE =
  "AI coaching is paused until next month — your academy has reached its monthly AI token budget. Please contact your academy administrator.";

interface CallOpenAIResult {
  content: string | null;
  budgetExhausted: boolean;
}

async function callOpenAIWithBudget(
  userPrompt: string,
  systemPrompt: string,
  maxTokens: number = 600,
  context?: { userId?: string | null; featureType?: string; academyId?: string | null }
): Promise<CallOpenAIResult> {
  try {
    let actualMaxTokens = maxTokens;
    let actualSystemPrompt = systemPrompt;
    let actualUserPrompt = userPrompt;
    let budgetExhausted = false;

    if (context?.academyId) {
      const budgetState = await getAcademyBudgetState(context.academyId).catch(() => null);
      if (budgetState) {
        if (budgetState.status === "exhausted") {
          budgetExhausted = true;
        } else if (budgetState.status === "warning") {
          actualMaxTokens = Math.min(maxTokens, 200);
          actualSystemPrompt = systemPrompt + " Be extremely concise. Keep response under 150 words.";
          actualUserPrompt = userPrompt.length > 500 ? userPrompt.substring(0, 500) + "\n[Truncated for budget]" : userPrompt;
        }
      }
    }

    if (budgetExhausted) {
      return { content: null, budgetExhausted: true };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: actualSystemPrompt },
        { role: "user", content: actualUserPrompt },
      ],
      max_tokens: actualMaxTokens,
      temperature: 0.7,
    });

    if (context) {
      logAiCall({
        userId: context.userId ?? null,
        featureType: context.featureType ?? "other",
        model: "gpt-4o-mini",
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
        academyId: context.academyId ?? null,
      }).catch(() => {});
    }

    return { content: response.choices?.[0]?.message?.content || null, budgetExhausted: false };
  } catch (err) {
    console.error("[AIEngine] OpenAI call failed:", err);
    return { content: null, budgetExhausted: false };
  }
}

async function callOpenAI(
  userPrompt: string,
  systemPrompt: string,
  maxTokens: number = 600,
  context?: { userId?: string | null; featureType?: string; academyId?: string | null }
): Promise<string | null> {
  const result = await callOpenAIWithBudget(userPrompt, systemPrompt, maxTokens, context);
  return result.content;
}

export async function generateSessionDigest(
  sessionId: string,
  playerId: string
): Promise<void> {
  try {
    const existing = await db
      .select({ id: sessionAiSummaries.id })
      .from(sessionAiSummaries)
      .where(
        and(
          eq(sessionAiSummaries.sessionId, sessionId),
          eq(sessionAiSummaries.playerId, playerId)
        )
      )
      .limit(1);
    if (existing.length > 0) return;

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) return;

    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    if (!player) return;

    const feedbackNotes = await db
      .select()
      .from(inSessionFeedback)
      .where(
        and(
          eq(inSessionFeedback.sessionId, sessionId),
          eq(inSessionFeedback.playerId, playerId)
        )
      );

    const [skillFeedback] = await db
      .select()
      .from(sessionSkillFeedback)
      .where(
        and(
          eq(sessionSkillFeedback.sessionId, sessionId),
          eq(sessionSkillFeedback.playerId, playerId)
        )
      );

    const [attendance] = await db
      .select({ attendanceStatus: sessionPlayers.attendanceStatus })
      .from(sessionPlayers)
      .where(
        and(
          eq(sessionPlayers.sessionId, sessionId),
          eq(sessionPlayers.playerId, playerId)
        )
      );

    const [playerLevel] = await db
      .select({ levelId: playerBallLevels.levelId })
      .from(playerBallLevels)
      .where(eq(playerBallLevels.playerId, playerId))
      .orderBy(desc(playerBallLevels.assignedAt))
      .limit(1);

    // Skill scores recorded this session
    const sessionSkillScores = await db
      .select({
        skillName: glowSkills.name,
        score: playerSkillScores.score,
      })
      .from(playerSkillScores)
      .innerJoin(glowSkills, eq(playerSkillScores.skillId, glowSkills.id))
      .where(
        and(
          eq(playerSkillScores.playerId, playerId),
          eq(playerSkillScores.sessionId, sessionId)
        )
      );

    // Curriculum progress: compare required level skills against scores
    // Priority: session-specific scores, fallback to player's most recent scores
    let curriculumProgress = "";
    if (playerLevel?.levelId) {
      const required = await db
        .select({
          skillId: levelSkills.skillId,
          skillName: glowSkills.name,
          targetScore: levelSkills.targetScore,
          isRequired: levelSkills.isRequired,
        })
        .from(levelSkills)
        .innerJoin(glowSkills, eq(levelSkills.skillId, glowSkills.id))
        .where(and(eq(levelSkills.levelId, playerLevel.levelId), eq(levelSkills.isRequired, true)));

      // Session-specific score map (highest priority)
      const sessionScoreMap = new Map(sessionSkillScores.map((s) => [s.skillName, s.score]));

      // For skills not scored this session, get player's latest overall score
      const unscoreThisSession = required.filter((r) => !sessionScoreMap.has(r.skillName));
      const latestScoreMap = new Map<string, number>();
      for (const r of unscoreThisSession) {
        const [latest] = await db
          .select({ score: playerSkillScores.score })
          .from(playerSkillScores)
          .where(and(eq(playerSkillScores.playerId, playerId), eq(playerSkillScores.skillId, r.skillId)))
          .orderBy(desc(playerSkillScores.createdAt))
          .limit(1);
        if (latest) latestScoreMap.set(r.skillName, latest.score);
      }

      const met: string[] = [];
      const notMet: string[] = [];
      const noData: string[] = [];

      for (const r of required) {
        const score = sessionScoreMap.get(r.skillName) ?? latestScoreMap.get(r.skillName);
        if (score !== undefined) {
          const label = sessionScoreMap.has(r.skillName) ? "" : " (historical)";
          if (score >= r.targetScore) {
            met.push(`${r.skillName}${label} (${score}/${r.targetScore})`);
          } else {
            notMet.push(`${r.skillName}${label} (${score}/${r.targetScore})`);
          }
        } else {
          noData.push(r.skillName);
        }
      }

      const parts = [
        met.length > 0 ? `Met required: ${met.join(", ")}` : "",
        notMet.length > 0 ? `Still developing: ${notMet.join(", ")}` : "",
        noData.length > 0 ? `Not yet assessed: ${noData.join(", ")}` : "",
      ].filter(Boolean);

      if (parts.length > 0) curriculumProgress = parts.join(". ");
    }

    const ballLevel = playerLevel?.levelId || player.ballLevel || "unknown";
    const attendanceStatus = attendance?.attendanceStatus || "present";

    const feedbackList =
      feedbackNotes.map((f) => `${f.feedbackType}: ${f.message}`).join("; ") ||
      "no notes";

    const ratingsSummary = skillFeedback
      ? `Effort ${skillFeedback.effort}/2, Execution ${skillFeedback.execution}/2, Understanding ${skillFeedback.understanding}/2, Overall: ${skillFeedback.overall}`
      : "";

    const strokeDetails =
      skillFeedback?.strokeFeedback && Array.isArray(skillFeedback.strokeFeedback)
        ? (skillFeedback.strokeFeedback as { stroke: string; rating: number; note?: string }[])
            .map((s) => `${s.stroke} (${s.rating}/2${s.note ? " – " + s.note : ""})`)
            .join(", ")
        : "";

    const playerNote = skillFeedback?.playerNote || skillFeedback?.note || "";

    const prompt = `Player: ${player.name}, age ${player.age ?? "unknown"}, level ${ballLevel}
Session type: ${session.sessionType}, date: ${session.date}
Attendance: ${attendanceStatus}
Coach feedback notes: ${feedbackList}
${ratingsSummary ? `Skill ratings: ${ratingsSummary}` : ""}
${strokeDetails ? `Strokes worked on: ${strokeDetails}` : ""}
${playerNote ? `Coach note: ${playerNote}` : ""}
${curriculumProgress ? `Curriculum progress this session: ${curriculumProgress}` : ""}

Write a 2-3 sentence session digest for this player. Write it in third person (e.g., "[Name] worked on..."). Keep it positive, specific and actionable. Mention what was practised, what went well, and one clear area to continue working on. Never use emojis.`;

    const systemPrompt =
      "You are an expert tennis/padel/pickleball coaching assistant. Generate concise, encouraging, data-driven session digests for player development records. Never use emojis.";

    const summary = await callOpenAI(prompt, systemPrompt, 300, { featureType: "report", academyId: session.academyId ?? null });
    if (!summary) return;

    await db.insert(sessionAiSummaries).values({
      sessionId,
      playerId,
      summaryText: summary.trim(),
    });

    console.log(
      `[AIEngine] Session digest generated for player ${playerId}, session ${sessionId}`
    );
  } catch (error) {
    console.error("[AIEngine] Error generating session digest:", error);
  }
}

export async function generateProgressNarrative(
  playerId: string,
  academyId: string,
  days: number = 30
): Promise<{ narrative: string; focusAreas: string[] } | null> {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    if (!player) return null;

    const recentDigests = await db
      .select({ summaryText: sessionAiSummaries.summaryText, generatedAt: sessionAiSummaries.generatedAt })
      .from(sessionAiSummaries)
      .where(
        and(
          eq(sessionAiSummaries.playerId, playerId),
          gte(sessionAiSummaries.generatedAt, since)
        )
      )
      .orderBy(desc(sessionAiSummaries.generatedAt))
      .limit(5);

    const recentFeedback = await db
      .select({ feedbackType: inSessionFeedback.feedbackType, message: inSessionFeedback.message })
      .from(inSessionFeedback)
      .where(
        and(
          eq(inSessionFeedback.playerId, playerId),
          gte(inSessionFeedback.createdAt, since)
        )
      )
      .orderBy(desc(inSessionFeedback.createdAt))
      .limit(20);

    const [playerLevel] = await db
      .select({ levelId: playerBallLevels.levelId })
      .from(playerBallLevels)
      .where(eq(playerBallLevels.playerId, playerId))
      .orderBy(desc(playerBallLevels.assignedAt))
      .limit(1);

    let curriculumSkills: string[] = [];
    if (playerLevel?.levelId) {
      const levelSkillInfo = await db
        .select({
          skillName: glowSkills.name,
          pillar: glowSkills.pillar,
          targetScore: levelSkills.targetScore,
          isRequired: levelSkills.isRequired,
        })
        .from(levelSkills)
        .innerJoin(glowSkills, eq(levelSkills.skillId, glowSkills.id))
        .where(eq(levelSkills.levelId, playerLevel.levelId))
        .limit(10);

      curriculumSkills = levelSkillInfo.map(
        (s) =>
          `${s.skillName} (${s.pillar}, target ${s.targetScore}/2${s.isRequired ? ", required" : ""})`
      );
    }

    const recentSkillScores = await db
      .select({
        skillName: glowSkills.name,
        pillar: glowSkills.pillar,
        score: playerSkillScores.score,
        movingAverage: playerSkillScores.movingAverage,
      })
      .from(playerSkillScores)
      .innerJoin(glowSkills, eq(playerSkillScores.skillId, glowSkills.id))
      .where(
        and(
          eq(playerSkillScores.playerId, playerId),
          gte(playerSkillScores.createdAt, since)
        )
      )
      .orderBy(desc(playerSkillScores.createdAt))
      .limit(15);

    // Skill evidence captures (Skill Evidence Capture tool)
    const recentEvidenceCaptures = await db
      .select({
        direction: sessionSkillObservations.direction,
        effortLevel: sessionSkillObservations.effortLevel,
        note: sessionSkillObservations.note,
      })
      .from(sessionSkillObservations)
      .where(
        and(
          eq(sessionSkillObservations.playerId, playerId),
          gte(sessionSkillObservations.createdAt, since)
        )
      )
      .orderBy(desc(sessionSkillObservations.createdAt))
      .limit(10);

    // Quick/Deep assessment baseline scores
    const recentBaselineScores = await db
      .select({
        pillar: playerBaselineSkillScores.pillar,
        skillCategory: playerBaselineSkillScores.skillCategory,
        rating: playerBaselineSkillScores.rating,
      })
      .from(playerBaselineSkillScores)
      .where(
        and(
          eq(playerBaselineSkillScores.playerId, playerId),
          gte(playerBaselineSkillScores.createdAt, since)
        )
      )
      .orderBy(desc(playerBaselineSkillScores.createdAt))
      .limit(20);

    // Session skill feedback trend (effort/execution/understanding + stroke data)
    const recentSessionFeedback = await db
      .select({
        effort: sessionSkillFeedback.effort,
        execution: sessionSkillFeedback.execution,
        understanding: sessionSkillFeedback.understanding,
        overall: sessionSkillFeedback.overall,
        note: sessionSkillFeedback.note,
        strokeFeedback: sessionSkillFeedback.strokeFeedback,
      })
      .from(sessionSkillFeedback)
      .where(
        and(
          eq(sessionSkillFeedback.playerId, playerId),
          gte(sessionSkillFeedback.createdAt, since)
        )
      )
      .orderBy(desc(sessionSkillFeedback.createdAt))
      .limit(10);

    const ballLevel = playerLevel?.levelId || player.ballLevel || "unknown";
    const digestsText =
      recentDigests.map((d) => `- ${d.summaryText}`).join("\n") ||
      "No session digests available yet.";

    const feedbackFrequency = recentFeedback.reduce(
      (acc: Record<string, number>, f) => {
        acc[f.feedbackType] = (acc[f.feedbackType] || 0) + 1;
        return acc;
      },
      {}
    );
    const feedbackSummary =
      Object.entries(feedbackFrequency)
        .map(([k, v]) => `${k} (${v}x)`)
        .join(", ") || "none";

    const skillProgress =
      recentSkillScores.map((s) => `${s.skillName}: ${s.score}/2`).join(", ") ||
      "no skill data recorded";

    let sessionFeedbackTrend = "";
    if (recentSessionFeedback.length > 0) {
      const avgEffort = (recentSessionFeedback.reduce((s, f) => s + (f.effort ?? 1), 0) / recentSessionFeedback.length).toFixed(1);
      const avgExec = (recentSessionFeedback.reduce((s, f) => s + (f.execution ?? 1), 0) / recentSessionFeedback.length).toFixed(1);
      const avgUnderstanding = (recentSessionFeedback.reduce((s, f) => s + (f.understanding ?? 1), 0) / recentSessionFeedback.length).toFixed(1);
      const overallCounts = recentSessionFeedback.reduce((acc: Record<string, number>, f) => {
        if (f.overall) acc[f.overall] = (acc[f.overall] || 0) + 1;
        return acc;
      }, {});
      const overallTrend = Object.entries(overallCounts).map(([k, v]) => `${k}: ${v}x`).join(", ");

      const strokeTypes = new Set<string>();
      for (const f of recentSessionFeedback) {
        if (f.strokeFeedback && Array.isArray(f.strokeFeedback)) {
          (f.strokeFeedback as { stroke: string }[]).forEach((s) => strokeTypes.add(s.stroke));
        }
      }

      sessionFeedbackTrend = `Avg effort ${avgEffort}/2, execution ${avgExec}/2, understanding ${avgUnderstanding}/2 over ${recentSessionFeedback.length} sessions. Overall trend: ${overallTrend || "no data"}.${strokeTypes.size > 0 ? ` Strokes trained: ${[...strokeTypes].join(", ")}.` : ""}`;
    }

    // Evidence capture summary
    let evidenceSummary = "";
    if (recentEvidenceCaptures.length > 0) {
      const upCount = recentEvidenceCaptures.filter((e) => e.direction === "up").length;
      const downCount = recentEvidenceCaptures.filter((e) => e.direction === "down").length;
      const notes = recentEvidenceCaptures.filter((e) => e.note).map((e) => e.note).slice(0, 3).join("; ");
      evidenceSummary = `${recentEvidenceCaptures.length} evidence captures: ${upCount} improving, ${downCount} declining.${notes ? ` Notes: ${notes}` : ""}`;
    }

    // Baseline assessment summary
    let baselineSummary = "";
    if (recentBaselineScores.length > 0) {
      const byPillar = recentBaselineScores.reduce((acc: Record<string, number[]>, s) => {
        if (s.rating !== null) {
          acc[s.pillar] = acc[s.pillar] || [];
          acc[s.pillar].push(s.rating);
        }
        return acc;
      }, {});
      const pillarAvgs = Object.entries(byPillar)
        .map(([pillar, ratings]) => `${pillar} avg ${(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)}/3`)
        .join(", ");
      const topSkills = recentBaselineScores
        .filter((s) => s.rating !== null && s.rating >= 2)
        .slice(0, 3)
        .map((s) => s.skillCategory)
        .join(", ");
      baselineSummary = `Assessment data (${recentBaselineScores.length} skills scored): ${pillarAvgs}.${topSkills ? ` Proficient in: ${topSkills}` : ""}`;
    }

    const prompt = `Player: ${player.name}, age ${player.age ?? "unknown"}, ball level: ${ballLevel}
Period: last ${days} days

Recent session summaries:
${digestsText}

Feedback received: ${feedbackSummary}
${sessionFeedbackTrend ? `Session performance trend: ${sessionFeedbackTrend}` : ""}
Skill scores tracked: ${skillProgress}
${evidenceSummary ? `Skill evidence captures: ${evidenceSummary}` : ""}
${baselineSummary ? `Assessment scores: ${baselineSummary}` : ""}
Level curriculum skills (${ballLevel}): ${curriculumSkills.join(", ") || "none configured"}

Task 1: Write a 3-4 sentence progress narrative summarising development over the last ${days} days. Be specific about observed trends and curriculum alignment.
Task 2: Provide exactly 3 recommended focus areas for upcoming sessions, aligned to the curriculum skills listed above.

Return ONLY valid JSON (no markdown, no code block), like:
{"narrative": "...", "focusAreas": ["focus 1", "focus 2", "focus 3"]}`;

    const systemPrompt =
      "You are an expert tennis/sports development assistant for a multi-academy coaching platform. Generate data-driven, encouraging progress narratives. Return only valid JSON without markdown formatting. Never use emojis.";

    const response = await callOpenAI(prompt, systemPrompt, 700, { featureType: "report", academyId: academyId ?? null });
    if (!response) return null;

    try {
      const cleaned = response.trim().replace(/^```json\s*/, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.narrative && Array.isArray(parsed.focusAreas)) {
        return {
          narrative: parsed.narrative,
          focusAreas: parsed.focusAreas.slice(0, 3),
        };
      }
    } catch {
      return {
        narrative: response.trim(),
        focusAreas: [
          "Continue regular practice sessions",
          "Focus on curriculum skill development",
          "Work on competitive match play",
        ],
      };
    }

    return null;
  } catch (error) {
    console.error("[AIEngine] Error generating progress narrative:", error);
    return null;
  }
}


export interface PlayerAIContext {
  playerName: string;
  playerAge: number | null;
  ballLevel: string;
  sessionType: string;
  sessionDate: string;
  coachName: string;
  ageGroup: "young_child" | "child" | "teen" | "adult";
  attendanceStatus: string;
  // Curriculum skills for current level
  requiredSkills: { skillId: string; skillName: string; pillar: string; targetScore: number; currentScore: number | null; required: boolean }[];
  // Session summaries (up to 30)
  recentDigests: string[];
  // Coach Memory Hub notes (all — no cap)
  coachNotes: { category: string; content: string; pinned: boolean }[];
  // All skill mastery grouped by pillar
  skillsByPillar: { pillar: string; mastered: string[]; developing: string[]; notStarted: string[] }[];
  // Lifetime pillar averages
  pillarAverages: { pillar: string; avg: number }[];
  // Player goals from onboarding
  shortTermGoal: string | null;
  longTermDream: string | null;
  playStyle: string | null;
  // XP info
  xpLevel: number | null;
  xpTotal: number | null;
  // Level promotion readiness (% of required curriculum skills at target score)
  promotionReadiness: number | null;
  // Attendance
  attendanceRate: number | null;
  totalSessions: number;
  // Recent matches (last 5)
  recentMatches: { result: string; format: string; opponentLevel: string | null }[];
  // Recent in-session feedback notes (last 10)
  recentFeedbackNotes: { feedbackType: string; message: string }[];
  // Number of attended sessions (for data maturity)
  sessionCount: number;
  // Glow Mirror — Player session self-reflections (last 5)
  recentSessionReflections: {
    aiSummary: string | null;
    energyLevel: number | null;
    overallFeeling: number | null;
    hardestPart: string | null;
    keyLearning: string | null;
    nextFocus: string | null;
  }[];
  // Glow Mirror Layer 2 — Latest monthly self-assessment
  latestMonthlyAssessment?: {
    monthYear: string;
    aiSummary: string | null;
    strengthsAnswer: string | null;
    challengesAnswer: string | null;
    progressFeelAnswer: string | null;
    mindsetAnswer: string | null;
    nextFocusAnswer: string | null;
    pillarSelfRatings: Record<string, number> | null;
  } | null;
}

export async function buildPlayerAIContext(
  playerId: string,
  sessionId: string,
  coachId: string
): Promise<PlayerAIContext | null> {
  try {
    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    if (!player) return null;

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) return null;

    // Run independent queries in parallel
    const [
      coachRow,
      playerLevelRow,
      attendanceRow,
      allCoachNotes,
      recentDigests,
      // All historical skill scores (for pillar averages from full history)
      allSkillScoreHistory,
      // Full attendance history (no cap — used for true lifetime rate)
      sessionPlayerHistory,
      latestXpEvent,
      recentMatchRows,
      recentFeedbackRows,
      recentSessionReflections,
      latestMonthlyAssessmentRows,
    ] = await Promise.all([
      db.select({ name: coaches.name }).from(coaches).where(eq(coaches.id, coachId)).limit(1),
      db.select({ levelId: playerBallLevels.levelId }).from(playerBallLevels)
        .where(eq(playerBallLevels.playerId, playerId))
        .orderBy(desc(playerBallLevels.assignedAt)).limit(1),
      db.select({ attendanceStatus: sessionPlayers.attendanceStatus }).from(sessionPlayers)
        .where(and(eq(sessionPlayers.sessionId, sessionId), eq(sessionPlayers.playerId, playerId))),
      db.select({ category: playerNotes.category, content: playerNotes.content, isPinned: playerNotes.isPinned })
        .from(playerNotes)
        .where(eq(playerNotes.playerId, playerId))
        .orderBy(desc(playerNotes.isPinned), desc(playerNotes.createdAt)),
      db.select({ summaryText: sessionAiSummaries.summaryText })
        .from(sessionAiSummaries)
        .where(eq(sessionAiSummaries.playerId, playerId))
        .orderBy(desc(sessionAiSummaries.generatedAt)).limit(30),
      // Full score history (no cap) — used for pillar averages AND skill mastery classification
      db.select({ pillar: glowSkills.pillar, skillId: playerSkillScores.skillId, skillName: glowSkills.name, score: playerSkillScores.score })
        .from(playerSkillScores)
        .innerJoin(glowSkills, eq(playerSkillScores.skillId, glowSkills.id))
        .where(eq(playerSkillScores.playerId, playerId))
        .orderBy(desc(playerSkillScores.createdAt)),
      // Full attendance history — no cap
      db.select({ attendanceStatus: sessionPlayers.attendanceStatus })
        .from(sessionPlayers)
        .where(eq(sessionPlayers.playerId, playerId)),
      db.select({ levelAtEvent: playerXpEvents.levelAtEvent, xpAfterEvent: playerXpEvents.xpAfterEvent })
        .from(playerXpEvents)
        .where(eq(playerXpEvents.playerId, playerId))
        .orderBy(desc(playerXpEvents.createdAt)).limit(1),
      db.select({ result: matchLogs.result, matchFormat: matchLogs.matchFormat, opponentLevel: matchLogs.opponentLevel })
        .from(matchLogs)
        .where(eq(matchLogs.playerId, playerId))
        .orderBy(desc(matchLogs.createdAt)).limit(5),
      db.select({ feedbackType: inSessionFeedback.feedbackType, message: inSessionFeedback.message })
        .from(inSessionFeedback)
        .where(eq(inSessionFeedback.playerId, playerId))
        .orderBy(desc(inSessionFeedback.createdAt)).limit(10),
      // Recent session reflections (Glow Mirror Layer 1)
      db.select({
        aiSummary: playerSessionReflections.aiSummary,
        energyLevel: playerSessionReflections.energyLevel,
        overallFeeling: playerSessionReflections.overallFeeling,
        hardestPart: playerSessionReflections.hardestPart,
        keyLearning: playerSessionReflections.keyLearning,
        nextFocus: playerSessionReflections.nextFocus,
        createdAt: playerSessionReflections.createdAt,
      })
        .from(playerSessionReflections)
        .where(eq(playerSessionReflections.playerId, playerId))
        .orderBy(desc(playerSessionReflections.createdAt)).limit(5),
      // Glow Mirror Layer 2 — Latest completed monthly self-assessment
      db.select({
        monthYear: playerMonthlyAssessments.monthYear,
        aiSummary: playerMonthlyAssessments.aiSummary,
        strengthsAnswer: playerMonthlyAssessments.strengthsAnswer,
        challengesAnswer: playerMonthlyAssessments.challengesAnswer,
        progressFeelAnswer: playerMonthlyAssessments.progressFeelAnswer,
        mindsetAnswer: playerMonthlyAssessments.mindsetAnswer,
        nextFocusAnswer: playerMonthlyAssessments.nextFocusAnswer,
        pillarSelfRatings: playerMonthlyAssessments.pillarSelfRatings,
      })
        .from(playerMonthlyAssessments)
        .where(
          and(
            eq(playerMonthlyAssessments.playerId, playerId),
            eq(playerMonthlyAssessments.status, "completed")
          )
        )
        .orderBy(desc(playerMonthlyAssessments.createdAt)).limit(1),
    ]);

    const ballLevel = playerLevelRow[0]?.levelId || player.ballLevel || "unknown";

    // Get required skills for current level with current scores
    let requiredSkills: PlayerAIContext["requiredSkills"] = [];
    if (ballLevel && ballLevel !== "unknown") {
      const levelSkillsList = await db
        .select({
          skillId: levelSkills.skillId,
          skillName: glowSkills.name,
          pillar: glowSkills.pillar,
          targetScore: levelSkills.targetScore,
          isRequired: levelSkills.isRequired,
        })
        .from(levelSkills)
        .innerJoin(glowSkills, eq(levelSkills.skillId, glowSkills.id))
        .where(eq(levelSkills.levelId, ballLevel));

      for (const skill of levelSkillsList) {
        const [latestScore] = await db
          .select({ score: playerSkillScores.score, movingAverage: playerSkillScores.movingAverage })
          .from(playerSkillScores)
          .where(and(eq(playerSkillScores.playerId, playerId), eq(playerSkillScores.skillId, skill.skillId)))
          .orderBy(desc(playerSkillScores.createdAt)).limit(1);

        requiredSkills.push({
          skillId: skill.skillId,
          skillName: skill.skillName,
          pillar: skill.pillar || "Technical",
          targetScore: skill.targetScore || 2,
          currentScore: latestScore ? Number(latestScore.movingAverage || latestScore.score) : null,
          required: skill.isRequired ?? true,
        });
      }
    }

    // Age group
    const age = player.age ? Number(player.age) : null;
    let ageGroup: PlayerAIContext["ageGroup"] = "adult";
    if (age !== null) {
      if (age <= 8) ageGroup = "young_child";
      else if (age <= 12) ageGroup = "child";
      else if (age <= 17) ageGroup = "teen";
    }

    // Attendance rate — true lifetime rate (no cap)
    const attended = sessionPlayerHistory.filter((s) => s.attendanceStatus === "present").length;
    const totalSessions = sessionPlayerHistory.length;
    const attendanceRate = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : null;

    // Lifetime pillar averages — computed from ALL historical score entries (not deduplicated)
    const pillarSums = new Map<string, { sum: number; count: number }>();
    for (const s of allSkillScoreHistory) {
      const pillar = s.pillar || "Technical";
      const p = pillarSums.get(pillar) || { sum: 0, count: 0 };
      p.sum += Number(s.score);
      p.count += 1;
      pillarSums.set(pillar, p);
    }
    const pillarAverages = Array.from(pillarSums.entries()).map(([pillar, { sum, count }]) => ({
      pillar,
      avg: Math.round((sum / count) * 10) / 10,
    }));

    // Skill mastery by pillar — latest score per skill + curriculum "not started" skills
    const latestScoreBySkillId = new Map<string, { pillar: string; skillName: string; score: number }>();
    for (const s of allSkillScoreHistory) {
      if (!latestScoreBySkillId.has(s.skillId)) {
        latestScoreBySkillId.set(s.skillId, { pillar: s.pillar || "Technical", skillName: s.skillName, score: Number(s.score) });
      }
    }
    const scoredSkills = Array.from(latestScoreBySkillId.values());

    const pillarMap = new Map<string, { mastered: string[]; developing: string[]; notStarted: string[] }>();
    for (const s of scoredSkills) {
      if (!pillarMap.has(s.pillar)) pillarMap.set(s.pillar, { mastered: [], developing: [], notStarted: [] });
      const group = pillarMap.get(s.pillar)!;
      if (s.score >= 2) group.mastered.push(s.skillName);
      else if (s.score >= 1) group.developing.push(s.skillName);
      else group.notStarted.push(s.skillName);
    }

    // Add curriculum skills not yet scored as "notStarted"
    const scoredSkillIds = latestScoreBySkillId;
    for (const skill of requiredSkills) {
      const alreadyScored = Array.from(scoredSkillIds.values()).some((s) => s.skillName === skill.skillName);
      if (!alreadyScored) {
        const pillar = skill.pillar || "Technical";
        if (!pillarMap.has(pillar)) pillarMap.set(pillar, { mastered: [], developing: [], notStarted: [] });
        pillarMap.get(pillar)!.notStarted.push(skill.skillName);
      }
    }

    const skillsByPillar = Array.from(pillarMap.entries()).map(([pillar, g]) => ({ pillar, ...g }));

    // Promotion readiness = % of required skills meeting target score
    const required = requiredSkills.filter((s) => s.required);
    const mastered = required.filter((s) => s.currentScore !== null && s.currentScore >= s.targetScore);
    const promotionReadiness = required.length > 0 ? Math.round((mastered.length / required.length) * 100) : null;

    return {
      playerName: player.name,
      playerAge: age,
      ballLevel,
      sessionType: session.sessionType,
      sessionDate: session.startTime ? new Date(session.startTime).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      coachName: coachRow[0]?.name || "Coach",
      ageGroup,
      attendanceStatus: attendanceRow[0]?.attendanceStatus || "present",
      requiredSkills,
      recentDigests: recentDigests.map((d) => d.summaryText),
      coachNotes: allCoachNotes.map((n) => ({ category: n.category, content: n.content, pinned: n.isPinned })),
      skillsByPillar,
      pillarAverages,
      shortTermGoal: player.shortTermGoal || null,
      longTermDream: player.longTermDream || null,
      playStyle: player.playStyle || null,
      xpLevel: latestXpEvent[0]?.levelAtEvent ?? null,
      xpTotal: latestXpEvent[0]?.xpAfterEvent ?? null,
      promotionReadiness,
      attendanceRate,
      totalSessions,
      recentMatches: recentMatchRows.map((m) => ({ result: m.result, format: m.matchFormat, opponentLevel: m.opponentLevel })),
      recentFeedbackNotes: recentFeedbackRows.map((f) => ({ feedbackType: f.feedbackType, message: f.message })),
      sessionCount: attended,
      recentSessionReflections: recentSessionReflections.map((r) => ({
        aiSummary: r.aiSummary,
        energyLevel: r.energyLevel,
        overallFeeling: r.overallFeeling,
        hardestPart: r.hardestPart,
        keyLearning: r.keyLearning,
        nextFocus: r.nextFocus,
      })),
      latestMonthlyAssessment: latestMonthlyAssessmentRows[0]
        ? {
            monthYear: latestMonthlyAssessmentRows[0].monthYear,
            aiSummary: latestMonthlyAssessmentRows[0].aiSummary,
            strengthsAnswer: latestMonthlyAssessmentRows[0].strengthsAnswer,
            challengesAnswer: latestMonthlyAssessmentRows[0].challengesAnswer,
            progressFeelAnswer: latestMonthlyAssessmentRows[0].progressFeelAnswer,
            mindsetAnswer: latestMonthlyAssessmentRows[0].mindsetAnswer,
            nextFocusAnswer: latestMonthlyAssessmentRows[0].nextFocusAnswer,
            pillarSelfRatings: (latestMonthlyAssessmentRows[0].pillarSelfRatings as Record<string, number>) ?? null,
          }
        : null,
    };
  } catch (error) {
    console.error("[AIEngine] Error building player AI context:", error);
    return null;
  }
}

export function buildCoachingSystemPrompt(ctx: PlayerAIContext): string {
  const {
    playerName, playerAge, ballLevel, sessionType, ageGroup,
    requiredSkills, recentDigests, coachNotes, skillsByPillar, pillarAverages,
    shortTermGoal, longTermDream, playStyle, xpLevel, attendanceRate, totalSessions,
    promotionReadiness, recentMatches, recentFeedbackNotes, recentSessionReflections,
    latestMonthlyAssessment,
  } = ctx;

  const ageInstruction =
    ageGroup === "young_child"
      ? "Use very simple, encouraging language. Ask about fun, effort, and one concrete skill at a time."
      : ageGroup === "child"
      ? "Use clear, positive language. Focus on what they practised and how much they enjoyed it."
      : ageGroup === "teen"
      ? "Use technical tennis terms but keep it conversational. Ask about tactics, consistency, and competitive play."
      : "Use professional coaching language. Ask about technical details, tactical application, and mental aspects.";

  // Player portrait
  const portrait = [
    `${playerName}${playerAge ? `, age ${playerAge}` : ""} — ${ballLevel} ball level, ${sessionType} session.`,
    playStyle ? `Playing style: ${playStyle.replace(/_/g, " ")}.` : "",
    xpLevel ? `Level ${xpLevel} on the Glow platform.` : "",
    attendanceRate !== null ? `Attendance: ${attendanceRate}% across ${totalSessions} sessions.` : "",
    promotionReadiness !== null ? `Level promotion readiness: ${promotionReadiness}% of required curriculum skills mastered.` : "",
    shortTermGoal ? `Short-term goal: "${shortTermGoal}".` : "",
    longTermDream ? `Long-term dream: "${longTermDream}".` : "",
  ].filter(Boolean).join(" ");

  // Pillar averages
  const pillarSummary = pillarAverages.length > 0
    ? `Lifetime pillar averages (0-2): ${pillarAverages.map((p) => `${p.pillar} ${p.avg}`).join(", ")}.`
    : "";

  // Skill mastery summary (compact)
  const skillMastery = skillsByPillar.map((p) => {
    const parts: string[] = [];
    if (p.mastered.length > 0) parts.push(`mastered: ${p.mastered.slice(0, 4).join(", ")}`);
    if (p.developing.length > 0) parts.push(`developing: ${p.developing.slice(0, 4).join(", ")}`);
    return parts.length > 0 ? `${p.pillar} — ${parts.join("; ")}` : null;
  }).filter(Boolean).join(" | ");

  // Current curriculum skills needing work — include skillId so AI can output it in skillRatings
  const skillsNeeded = requiredSkills.length > 0
    ? `Current ${ballLevel} curriculum: ${requiredSkills.map((s) => `${s.skillId} "${s.skillName}" (${s.pillar}, ${s.currentScore !== null ? s.currentScore + "/2" : "unscored"}, target ${s.targetScore}/2${s.required ? ", required" : ""})`).join("; ")}.`
    : "";

  // Coach Memory Hub notes (all — no cap)
  const notesSection = coachNotes.length > 0
    ? `Coach notes about this player:\n${coachNotes.map((n) => `- [${n.category}${n.pinned ? ", pinned" : ""}] ${n.content}`).join("\n")}`
    : "";

  // Session summaries — all 30 for full longitudinal context
  const digestContext = recentDigests.length > 0
    ? `Session history (${recentDigests.length} sessions, latest first):\n${recentDigests.map((d, i) => `${i + 1}. ${d}`).join("\n")}`
    : "";

  // Recent feedback notes
  const feedbackContext = recentFeedbackNotes.length > 0
    ? `Recent coaching notes: ${recentFeedbackNotes.slice(0, 5).map((f) => f.message).join(" | ")}`
    : "";

  // Recent match results
  const matchContext = recentMatches.length > 0
    ? `Recent matches: ${recentMatches.map((m) => `${m.result} (${m.format}${m.opponentLevel ? ", vs " + m.opponentLevel : ""})`).join(", ")}.`
    : "";

  // Glow Mirror — Player self-reflections (most recent prominently surfaced)
  const reflectionContext = recentSessionReflections && recentSessionReflections.length > 0
    ? (() => {
        const latest = recentSessionReflections[0];
        const latestParts: string[] = [];
        if (latest.energyLevel) latestParts.push(`Energy ${latest.energyLevel}/5`);
        if (latest.overallFeeling) latestParts.push(`Feeling ${latest.overallFeeling}/5`);
        if (latest.hardestPart) latestParts.push(`Hardest: "${latest.hardestPart}"`);
        if (latest.keyLearning) latestParts.push(`Learned: "${latest.keyLearning}"`);
        if (latest.nextFocus) latestParts.push(`Next focus: "${latest.nextFocus}"`);
        const latestSummary = latest.aiSummary || latestParts.join(", ");

        const olderLines = recentSessionReflections.slice(1, 3).map((r, i) => {
          const parts: string[] = [];
          if (r.energyLevel) parts.push(`Energy ${r.energyLevel}/5`);
          if (r.overallFeeling) parts.push(`Feeling ${r.overallFeeling}/5`);
          if (r.hardestPart) parts.push(`Hardest: "${r.hardestPart}"`);
          if (r.keyLearning) parts.push(`Learned: "${r.keyLearning}"`);
          if (r.nextFocus) parts.push(`Focus: "${r.nextFocus}"`);
          return `  ${i + 2}. ${parts.join(", ")}`;
        });

        return `PLAYER VOICE — Most recent self-reflection: ${latestSummary}${olderLines.length > 0 ? "\nPrevious reflections:\n" + olderLines.join("\n") : ""}`;
      })()
    : "";

  // Glow Mirror Layer 2 — Monthly self-assessment voice + perception gap
  const monthlyVoiceContext = latestMonthlyAssessment
    ? (() => {
        const m = latestMonthlyAssessment;
        const lines: string[] = [];
        if (m.aiSummary) {
          lines.push(`PLAYER MONTHLY VOICE (${m.monthYear}): ${m.aiSummary}`);
        } else {
          if (m.strengthsAnswer) lines.push(`  What's going well: "${m.strengthsAnswer}"`);
          if (m.challengesAnswer) lines.push(`  Biggest challenge: "${m.challengesAnswer}"`);
          if (m.progressFeelAnswer) lines.push(`  Feels about progress: "${m.progressFeelAnswer}"`);
          if (m.mindsetAnswer) lines.push(`  Mindset/motivation: "${m.mindsetAnswer}"`);
          if (m.nextFocusAnswer) lines.push(`  Wants to focus on: "${m.nextFocusAnswer}"`);
        }

        // Perception gap — compare player self-ratings vs coach pillar averages
        if (m.pillarSelfRatings && pillarAverages) {
          const PILLAR_MAP: Record<string, string> = {
            technical: "Technical",
            physical: "Physical",
            tactical: "Tactical",
            mental: "Mental",
            matchplay: "Match",
          };
          const gaps: string[] = [];
          for (const [key, label] of Object.entries(PILLAR_MAP)) {
            const selfRating = m.pillarSelfRatings[key];
            const coachAvg = (pillarAverages as Record<string, number>)[label];
            if (selfRating !== undefined && coachAvg !== undefined && coachAvg > 0) {
              // Self-rating is 1-10, coach avg is 0-2 → scale coach to 1-10 (×5)
              const coachScaled = Math.round(coachAvg * 5);
              const gap = selfRating - coachScaled;
              if (Math.abs(gap) >= 2) {
                const direction = gap > 0 ? "overestimates" : "underestimates";
                gaps.push(`${label}: player rates ${selfRating}/10 vs coach's ${coachScaled}/10 (player ${direction})`);
              }
            }
          }
          if (gaps.length > 0) {
            lines.push(`PERCEPTION GAP (use to guide conversation, do not share raw numbers):\n  ${gaps.join("\n  ")}`);
          }
        }

        return lines.join("\n");
      })()
    : "";

  const summaryInstruction = `After 4-8 coach exchanges covering all six pillars (Technical, Tactical, Physical, Mental, Social, Match), say "Here is what I'll save" and propose a JSON summary inside a code block:
\`\`\`json
{
  "sessionNote": "One sentence summarising what was worked on today.",
  "overall": "improved",
  "effort": 2,
  "execution": 1,
  "understanding": 1,
  "techniquePillar": 1,
  "tacticalPillar": 2,
  "physicalPillar": 1,
  "mentalPillar": 2,
  "socialPillar": 1,
  "matchPillar": 0,
  "skillRatings": [{"skillId": "FH_CONTACT", "score": 1}],
  "levelUpFlag": false,
  "levelUpMessage": ""
}
\`\`\`
Values: overall = improved/stable/declined. All numeric fields = 0 (needs attention), 1 (developing), 2 (good). For skillRatings: use ONLY the skill IDs from the curriculum list above (e.g. "FH_CONTACT", "RALLY_8_PLUS"). Score 0 = needs attention, 1 = developing, 2 = mastered this session. Include only skills actually worked on. levelUpFlag = true only if 3+ required skills hit target score this session.`;

  return `You are an expert sports development AI assistant helping coach ${ctx.coachName} log a session for ${playerName}.

PLAYER PORTRAIT:
${portrait}
${pillarSummary}
${skillMastery ? `Skill mastery: ${skillMastery}.` : ""}
${skillsNeeded}
${notesSection}
${digestContext}
${feedbackContext}
${matchContext}
${reflectionContext}
${monthlyVoiceContext}

LANGUAGE RULE: ${ageInstruction}

YOUR JOB:
1. Ask what the main focus of today's session was.
2. Ask 1-2 targeted follow-up questions per turn. Each question MUST reference what the coach just said (e.g. if they said "backhand was lazy", ask "You mentioned the backhand was lazy — was that consistency or technique?"). Do NOT ask a generic question the coach just answered. Cover all six pillars before wrapping up:
   - TECHNICAL: stroke mechanics, consistency, shot quality
   - TACTICAL: decision-making, game strategy, patterns of play
   - PHYSICAL: energy levels, movement, stamina, footwork
   - MENTAL: focus, composure under pressure, confidence, resilience
   - SOCIAL: teamwork, communication, attitude, respect for coach/peers
   - MATCH (Competition): match performance, scoring, competitive pressure, results
3. Reference coach notes when relevant (e.g. "You've noted before that she struggles with composure — how was that today?").
4. IMPORTANT: Do NOT re-ask about facts already recorded in Coach Memory Hub notes. Instead, build on them (e.g. if the notes say backhand is weak, ask how the backhand went today — not whether it is weak).
5. Never ask more than 2 questions at once.
6. Keep responses under 3 sentences unless proposing the summary.
7. Never use emojis.
${summaryInstruction}`;
}


export type DataMaturityLevel = "none" | "basic" | "trends" | "full";

export interface DataMaturity {
  sessionCount: number;
  maturityLevel: DataMaturityLevel;
  nextMilestone: string;
}

export interface GlowMirrorSessionCheckin {
  energyLevel: number | null;
  overallFeeling: number | null;
  hardestPart: string | null;
  keyLearning: string | null;
  nextFocus: string | null;
}

export interface GlowMirrorMonthlyAssessment {
  monthYear: string;
  strengthsAnswer: string | null;
  challengesAnswer: string | null;
  progressFeelAnswer: string | null;
  mindsetAnswer: string | null;
  nextFocusAnswer: string | null;
  pillarSelfRatings: Record<string, number> | null;
  aiSummary: string | null;
}

export interface GlowMirrorPerceptionGap {
  pillar: string;
  selfRating: number;
  coachScore: number;
  gap: number;
}

export interface PlayerSelfAIContext {
  playerName: string;
  playerAge: number | null;
  ballLevel: string;
  xpLevel: number;
  totalXp: number;
  glowScore: number;
  shortTermGoal: string | null;
  longTermDream: string | null;
  playStyle: string | null;
  dominantHand: string | null;
  skillScores: { skillName: string; pillar: string; score: number; movingAverage: number | null }[];
  publicFeedback: { type: string; message: string }[];
  privateFeedback: { type: string; message: string }[];
  coachNotes: { category: string; content: string }[];
  sessionDigests: string[];
  attendanceRate: number | null;
  totalSessions: number;
  avgEffort: number | null;
  avgExecution: number | null;
  recentStrokes: string[];
  dataMaturity: DataMaturity;
  // Glow Mirror layers
  recentSessionCheckins: GlowMirrorSessionCheckin[];
  latestMonthlyAssessment: GlowMirrorMonthlyAssessment | null;
  perceptionGaps: GlowMirrorPerceptionGap[];
  glowMirrorLayers: { sessionCheckins: boolean; monthlyVoice: boolean; perceptionGaps: boolean };
}

export function computeDataMaturity(sessionCount: number): DataMaturity {
  if (sessionCount === 0) {
    return { sessionCount, maturityLevel: "none", nextMilestone: "Log your first session to unlock Basic advice" };
  }
  if (sessionCount < 4) {
    const remaining = 4 - sessionCount;
    return { sessionCount, maturityLevel: "basic", nextMilestone: `${remaining} more session${remaining === 1 ? "" : "s"} to unlock Trend analysis` };
  }
  if (sessionCount < 8) {
    const remaining = 8 - sessionCount;
    return { sessionCount, maturityLevel: "trends", nextMilestone: `${remaining} more session${remaining === 1 ? "" : "s"} to unlock Full personalised coaching` };
  }
  return { sessionCount, maturityLevel: "full", nextMilestone: "" };
}

export async function buildPlayerSelfAIContext(
  playerId: string
): Promise<PlayerSelfAIContext | null> {
  try {
    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    if (!player) return null;

    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Ball level
    const [levelRow] = await db
      .select({ levelId: playerBallLevels.levelId })
      .from(playerBallLevels)
      .where(eq(playerBallLevels.playerId, playerId))
      .orderBy(desc(playerBallLevels.assignedAt))
      .limit(1);
    const ballLevel = levelRow?.levelId || player.ballLevel || "unknown";

    // Latest skill scores (one per skill, most recent)
    const allScores = await db
      .select({
        skillName: glowSkills.name,
        pillar: glowSkills.pillar,
        score: playerSkillScores.score,
        movingAverage: playerSkillScores.movingAverage,
        createdAt: playerSkillScores.createdAt,
      })
      .from(playerSkillScores)
      .innerJoin(glowSkills, eq(playerSkillScores.skillId, glowSkills.id))
      .where(eq(playerSkillScores.playerId, playerId))
      .orderBy(desc(playerSkillScores.createdAt))
      .limit(50);

    // Deduplicate to latest score per skill
    const seenSkills = new Set<string>();
    const skillScores: PlayerSelfAIContext["skillScores"] = [];
    for (const s of allScores) {
      if (!seenSkills.has(s.skillName)) {
        seenSkills.add(s.skillName);
        skillScores.push({
          skillName: s.skillName,
          pillar: s.pillar || "Technical",
          score: Number(s.score),
          movingAverage: s.movingAverage !== null ? Number(s.movingAverage) : null,
        });
      }
    }

    // Coach feedback — include both public and private so AI has full coaching context
    // Private notes are instructed not to be revealed verbatim by the system prompt
    const feedbackRows = await db
      .select({
        feedbackType: inSessionFeedback.feedbackType,
        message: inSessionFeedback.message,
        visibility: inSessionFeedback.visibility,
        createdAt: inSessionFeedback.createdAt,
      })
      .from(inSessionFeedback)
      .where(eq(inSessionFeedback.playerId, playerId))
      .orderBy(desc(inSessionFeedback.createdAt))
      .limit(30);
    // Separate public (player-visible) from private (coach-only session notes)
    const publicFeedback = feedbackRows
      .filter((f) => f.visibility === "public")
      .map((f) => ({ type: f.feedbackType, message: f.message }));
    const privateFeedback = feedbackRows
      .filter((f) => f.visibility !== "public")
      .map((f) => ({ type: f.feedbackType, message: f.message }));

    // Coach long-form notes
    const noteRows = await db
      .select({ category: playerNotes.category, content: playerNotes.content })
      .from(playerNotes)
      .where(eq(playerNotes.playerId, playerId))
      .orderBy(desc(playerNotes.createdAt))
      .limit(10);
    const coachNotes = noteRows.map((n) => ({ category: n.category, content: n.content }));

    // Session digests
    const digestRows = await db
      .select({ summaryText: sessionAiSummaries.summaryText })
      .from(sessionAiSummaries)
      .where(eq(sessionAiSummaries.playerId, playerId))
      .orderBy(desc(sessionAiSummaries.generatedAt))
      .limit(5);
    const sessionDigests = digestRows.map((d) => d.summaryText);

    // Glow Mirror Layer 1 — last 5 session check-ins (player reflections)
    const checkinRows = await db
      .select({
        energyLevel: playerSessionReflections.energyLevel,
        overallFeeling: playerSessionReflections.overallFeeling,
        hardestPart: playerSessionReflections.hardestPart,
        keyLearning: playerSessionReflections.keyLearning,
        nextFocus: playerSessionReflections.nextFocus,
      })
      .from(playerSessionReflections)
      .where(eq(playerSessionReflections.playerId, playerId))
      .orderBy(desc(playerSessionReflections.createdAt))
      .limit(5);
    const recentSessionCheckins: GlowMirrorSessionCheckin[] = checkinRows.map((r) => ({
      energyLevel: r.energyLevel ?? null,
      overallFeeling: r.overallFeeling ?? null,
      hardestPart: r.hardestPart ?? null,
      keyLearning: r.keyLearning ?? null,
      nextFocus: r.nextFocus ?? null,
    }));

    // Glow Mirror Layer 2 — latest completed monthly self-assessment
    const [assessmentRow] = await db
      .select({
        monthYear: playerMonthlyAssessments.monthYear,
        strengthsAnswer: playerMonthlyAssessments.strengthsAnswer,
        challengesAnswer: playerMonthlyAssessments.challengesAnswer,
        progressFeelAnswer: playerMonthlyAssessments.progressFeelAnswer,
        mindsetAnswer: playerMonthlyAssessments.mindsetAnswer,
        nextFocusAnswer: playerMonthlyAssessments.nextFocusAnswer,
        pillarSelfRatings: playerMonthlyAssessments.pillarSelfRatings,
        aiSummary: playerMonthlyAssessments.aiSummary,
      })
      .from(playerMonthlyAssessments)
      .where(
        and(
          eq(playerMonthlyAssessments.playerId, playerId),
          eq(playerMonthlyAssessments.status, "completed")
        )
      )
      .orderBy(desc(playerMonthlyAssessments.createdAt))
      .limit(1);

    const latestMonthlyAssessment: GlowMirrorMonthlyAssessment | null = assessmentRow
      ? {
          monthYear: assessmentRow.monthYear,
          strengthsAnswer: assessmentRow.strengthsAnswer ?? null,
          challengesAnswer: assessmentRow.challengesAnswer ?? null,
          progressFeelAnswer: assessmentRow.progressFeelAnswer ?? null,
          mindsetAnswer: assessmentRow.mindsetAnswer ?? null,
          nextFocusAnswer: assessmentRow.nextFocusAnswer ?? null,
          pillarSelfRatings: (assessmentRow.pillarSelfRatings as Record<string, number>) ?? null,
          aiSummary: assessmentRow.aiSummary ?? null,
        }
      : null;

    // Glow Mirror Layer 3 — perception gaps (self-ratings vs coach pillar scores)
    const perceptionGaps: GlowMirrorPerceptionGap[] = [];
    if (latestMonthlyAssessment?.pillarSelfRatings && skillScores.length > 0) {
      const selfRatings = latestMonthlyAssessment.pillarSelfRatings;
      // Compute average coach score per pillar from skill scores (scores are 0-2, normalise to 0-10)
      const pillarSums: Record<string, { total: number; count: number }> = {};
      for (const s of skillScores) {
        const pillar = s.pillar.toLowerCase();
        if (!pillarSums[pillar]) pillarSums[pillar] = { total: 0, count: 0 };
        const scoreVal = s.movingAverage !== null ? s.movingAverage : s.score;
        // Convert 0-2 scale to 0-10 scale
        pillarSums[pillar].total += (scoreVal / 2) * 10;
        pillarSums[pillar].count += 1;
      }
      for (const [pillar, selfRating] of Object.entries(selfRatings)) {
        const pillarKey = pillar.toLowerCase();
        if (pillarSums[pillarKey]) {
          const coachScore = Math.round((pillarSums[pillarKey].total / pillarSums[pillarKey].count) * 10) / 10;
          const gap = Math.round((selfRating - coachScore) * 10) / 10;
          perceptionGaps.push({ pillar, selfRating, coachScore, gap });
        }
      }
      // Sort by absolute gap descending
      perceptionGaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    }

    // Attendance: count total sessions and attended in last 90 days
    const attendanceRows = await db
      .select({ attendanceStatus: sessionPlayers.attendanceStatus })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(
        and(
          eq(sessionPlayers.playerId, playerId),
          gte(sessions.startTime, since90)
        )
      );
    const totalSessions = attendanceRows.length;
    const attendedSessions = attendanceRows.filter(
      (r) => r.attendanceStatus === "present" || r.attendanceStatus === "late"
    ).length;
    const attendanceRate = totalSessions > 0 ? Math.round((attendedSessions / totalSessions) * 100) : null;

    // Recent effort/execution trends from session skill feedback
    const feedbackTrend = await db
      .select({
        effort: sessionSkillFeedback.effort,
        execution: sessionSkillFeedback.execution,
        strokeFeedback: sessionSkillFeedback.strokeFeedback,
      })
      .from(sessionSkillFeedback)
      .where(
        and(
          eq(sessionSkillFeedback.playerId, playerId),
          gte(sessionSkillFeedback.createdAt, since30)
        )
      )
      .orderBy(desc(sessionSkillFeedback.createdAt))
      .limit(8);

    let avgEffort: number | null = null;
    let avgExecution: number | null = null;
    const recentStrokes = new Set<string>();

    if (feedbackTrend.length > 0) {
      avgEffort = Math.round(
        (feedbackTrend.reduce((s, f) => s + (f.effort ?? 1), 0) / feedbackTrend.length) * 10
      ) / 10;
      avgExecution = Math.round(
        (feedbackTrend.reduce((s, f) => s + (f.execution ?? 1), 0) / feedbackTrend.length) * 10
      ) / 10;
      for (const f of feedbackTrend) {
        if (f.strokeFeedback && Array.isArray(f.strokeFeedback)) {
          (f.strokeFeedback as { stroke: string }[]).forEach((s) => recentStrokes.add(s.stroke));
        }
      }
    }

    return {
      playerName: player.name,
      playerAge: player.age ? Number(player.age) : null,
      ballLevel,
      xpLevel: player.level ?? 1,
      totalXp: player.totalXp ?? 0,
      glowScore: player.glowScore ?? 0,
      shortTermGoal: player.shortTermGoal || null,
      longTermDream: player.longTermDream || null,
      playStyle: player.playStyle || null,
      dominantHand: player.dominantHand || null,
      skillScores,
      publicFeedback,
      privateFeedback,
      coachNotes,
      sessionDigests,
      attendanceRate,
      totalSessions,
      avgEffort,
      avgExecution,
      recentStrokes: [...recentStrokes],
      dataMaturity: computeDataMaturity(attendedSessions),
      recentSessionCheckins,
      latestMonthlyAssessment,
      perceptionGaps,
      glowMirrorLayers: {
        sessionCheckins: recentSessionCheckins.length > 0,
        monthlyVoice: latestMonthlyAssessment !== null,
        perceptionGaps: perceptionGaps.length > 0,
      },
    };
  } catch (error) {
    console.error("[AIEngine] Error building player self context:", error);
    return null;
  }
}

export function buildPlayerSelfSystemPrompt(ctx: PlayerSelfAIContext): string {
  const {
    playerName, playerAge, ballLevel, xpLevel, totalXp, glowScore,
    shortTermGoal, longTermDream, playStyle, dominantHand,
    skillScores, publicFeedback, privateFeedback, coachNotes, sessionDigests,
    attendanceRate, totalSessions, avgEffort, avgExecution, recentStrokes,
    dataMaturity, recentSessionCheckins, latestMonthlyAssessment, perceptionGaps,
  } = ctx;

  const skillLines = skillScores.length > 0
    ? skillScores
        .map((s) => `${s.skillName} (${s.pillar}): ${s.movingAverage !== null ? s.movingAverage.toFixed(1) : s.score}/2`)
        .join(", ")
    : "no skill data recorded yet";

  const feedbackLines = publicFeedback.length > 0
    ? publicFeedback.slice(0, 10).map((f) => `[${f.type}] ${f.message}`).join("; ")
    : "no public feedback yet";

  const privateFeedbackLines = privateFeedback.length > 0
    ? privateFeedback.slice(0, 10).map((f) => `[${f.type}] ${f.message}`).join("; ")
    : "none";

  const noteLines = coachNotes.length > 0
    ? coachNotes.slice(0, 10).map((n) => `[${n.category}] ${n.content}`).join("; ")
    : "no coach notes yet";

  const digestLines = sessionDigests.length > 0
    ? sessionDigests.slice(0, 5).join(" | ")
    : "no session summaries yet";

  const attendanceLine = attendanceRate !== null
    ? `${attendanceRate}% attendance rate over ${totalSessions} sessions`
    : "no session history yet";

  const effortLine = avgEffort !== null
    ? `Recent avg effort: ${avgEffort}/2, execution: ${avgExecution}/2`
    : "";

  const strokeLine = recentStrokes.length > 0
    ? `Recently worked on: ${recentStrokes.join(", ")}`
    : "";

  const goalLine = [
    shortTermGoal ? `Short-term goal: ${shortTermGoal}` : "",
    longTermDream ? `Long-term dream: ${longTermDream}` : "",
  ].filter(Boolean).join(". ");

  const profileLine = [
    playStyle ? `Playing style: ${playStyle}` : "",
    dominantHand ? `Dominant hand: ${dominantHand}` : "",
  ].filter(Boolean).join(". ");

  const maturityGuidance = dataMaturity.maturityLevel === "none"
    ? "DATA MATURITY — NONE (0 sessions): You have no coaching history for this player yet. Be transparent and friendly about this: acknowledge you don't have data on their game yet, give general tennis advice, and encourage them to complete sessions with their coach so you can personalise your guidance."
    : dataMaturity.maturityLevel === "basic"
    ? `DATA MATURITY — BASIC (${dataMaturity.sessionCount} session${dataMaturity.sessionCount === 1 ? "" : "s"}): You have limited coaching history. Phrase responses with appropriate humility, e.g. "Based on your ${dataMaturity.sessionCount} session${dataMaturity.sessionCount === 1 ? "" : "s"} so far..." or "I'm still getting to know your game, but...". Avoid confident trend statements.`
    : dataMaturity.maturityLevel === "trends"
    ? `DATA MATURITY — TRENDS (${dataMaturity.sessionCount} sessions): You have enough data to identify patterns. Reference specific data but note where you'd like more history for stronger conclusions.`
    : `DATA MATURITY — FULL (${dataMaturity.sessionCount} sessions): You have rich coaching history. Speak with full confidence referencing trends, patterns, and specific data points.`;

  // Glow Mirror Layer 1 — session check-in lines
  const checkinLines = recentSessionCheckins.length > 0
    ? recentSessionCheckins.map((c, i) => {
        const parts: string[] = [];
        if (c.overallFeeling !== null) parts.push(`feeling ${c.overallFeeling}/5`);
        if (c.energyLevel !== null) parts.push(`energy ${c.energyLevel}/5`);
        if (c.hardestPart) parts.push(`hardest: "${c.hardestPart}"`);
        if (c.keyLearning) parts.push(`key learning: "${c.keyLearning}"`);
        if (c.nextFocus) parts.push(`next focus: "${c.nextFocus}"`);
        return `Check-in ${i + 1}: ${parts.join(", ")}`;
      }).join(" | ")
    : "no session check-ins recorded yet";

  // Glow Mirror Layer 2 — monthly assessment
  let monthlyAssessmentLines = "no monthly self-assessment completed yet";
  if (latestMonthlyAssessment) {
    const ma = latestMonthlyAssessment;
    const parts: string[] = [`Month: ${ma.monthYear}`];
    if (ma.strengthsAnswer) parts.push(`Strengths (their words): "${ma.strengthsAnswer}"`);
    if (ma.challengesAnswer) parts.push(`Challenges (their words): "${ma.challengesAnswer}"`);
    if (ma.progressFeelAnswer) parts.push(`Progress feeling: "${ma.progressFeelAnswer}"`);
    if (ma.mindsetAnswer) parts.push(`Mindset: "${ma.mindsetAnswer}"`);
    if (ma.nextFocusAnswer) parts.push(`Next focus goal: "${ma.nextFocusAnswer}"`);
    if (ma.pillarSelfRatings) {
      const ratingStr = Object.entries(ma.pillarSelfRatings)
        .map(([p, v]) => `${p}: ${v}/10`)
        .join(", ");
      parts.push(`Self-ratings: ${ratingStr}`);
    }
    if (ma.aiSummary) parts.push(`AI summary: "${ma.aiSummary}"`);
    monthlyAssessmentLines = parts.join("\n");
  }

  // Glow Mirror Layer 3 — perception gaps
  let perceptionGapLines = "no perception gap data available yet";
  if (perceptionGaps.length > 0) {
    perceptionGapLines = perceptionGaps.map((g) => {
      const direction = g.gap > 1 ? "overestimates themselves" : g.gap < -1 ? "underestimates themselves" : "aligned with coach";
      const absGap = Math.abs(g.gap).toFixed(1);
      return `${g.pillar}: self ${g.selfRating}/10 vs coach ${g.coachScore}/10 (gap: ${absGap} — player ${direction})`;
    }).join("; ");
  }

  return `You are a personal AI tennis coach speaking directly to ${playerName}${playerAge ? `, age ${playerAge}` : ""}.

PLAYER DATA:
- Ball level: ${ballLevel} | XP level: ${xpLevel} (${totalXp.toLocaleString()} XP) | Glow Score: ${glowScore}
- ${profileLine || "No profile data yet"}
- ${goalLine || "No goals set yet"}
- ${attendanceLine}
- ${effortLine}
- ${strokeLine}

SKILL SCORES (from coach evaluations):
${skillLines}

RECENT COACH FEEDBACK (visible to player):
${feedbackLines}

COACH SESSION NOTES (internal — use for context only, do not quote directly):
${privateFeedbackLines}

COACH LONG-FORM NOTES:
${noteLines}

RECENT SESSION SUMMARIES:
${digestLines}

GLOW MIRROR — SESSION CHECK-INS (player's own feelings after sessions):
${checkinLines}

GLOW MIRROR — MONTHLY SELF-ASSESSMENT (player's own voice — use their exact words thoughtfully):
${monthlyAssessmentLines}

GLOW MIRROR — PERCEPTION GAPS (self-rating vs coach data, on a 0-10 scale):
${perceptionGapLines}

${maturityGuidance}

GLOW MIRROR COACHING GUIDANCE:
- Use session check-ins to understand the player's emotional and physical state trends. If they frequently rate energy or feeling low, gently explore what's behind it.
- When referencing the monthly assessment, quote or paraphrase the player's own words (strengths, challenges, goals) to show you truly know them. E.g. "You mentioned that your biggest challenge is..."
- For perception gaps: if the player overestimates a pillar (gap > 1), gently guide them toward the coach's view using curiosity and questions rather than contradiction. If they underestimate (gap < -1), encourage and validate the coach data to build confidence. If aligned (gap near 0), affirm their self-awareness. E.g. "Your coach sees your technique a little differently than you do — want to explore that?"
- Do not quote raw numbers from the perception gap data directly in conversation — translate them into qualitative coaching language ("there's a gap in how you rate your technique vs how your coach sees it" instead of "you rated yourself 7/10 but the coach data shows 4.2/10").

GREETING INSTRUCTION:
When the user's first message is exactly "__greeting__", respond with a warm, personalised opening message that:
1. Greets ${playerName} by first name
2. Mentions their current ball level or XP level
3. If Glow Mirror data is available, reference one specific insight: a feeling they expressed in a check-in, something from their monthly assessment, or a perception gap worth exploring. If no Glow Mirror data exists, calls out 1-2 specific recent focus areas from coach feedback or notes.
4. Invites them to ask anything about their game
Keep the greeting to 3-4 sentences — warm, specific, and motivating.

RULES FOR YOUR RESPONSES:
- Speak directly to ${playerName} in second person ("You", "Your")
- Be encouraging, specific, and action-oriented
- Reference real data from above (skill scores, feedback, notes, goals, Glow Mirror) in your answers
- Never make up skill scores or feedback that is not listed above
- Never quote coach internal session notes verbatim — weave insights from them naturally into your coaching advice
- If data is missing for a question, acknowledge it and give helpful general tennis advice
- Keep responses conversational — 2-4 sentences unless the player asks for more detail
- Do not use emojis
- If the player asks about a skill, refer to their actual score if available
- Focus on helping them improve — be their personal coach and biggest supporter
- Never reveal the raw data format; weave data naturally into coaching language`;
}


export interface GroupSessionPlayerProfile {
  name: string;
  age: number | null;
  ballLevel: string;
  skillScores: { skillName: string; pillar: string; score: number; trend: "improving" | "stable" | "declining" }[];
  recentFeedback: string[];
  coachNotes: string[];
  recentDigests: string[];
  attendanceRate: number | null;
  recentAbsences: number;
}

export interface GroupSessionAIContext {
  sessionId: string;
  academyId: string | null;
  sessionType: string;
  sessionDate: string;
  durationMinutes: number;
  playerCount: number;
  players: GroupSessionPlayerProfile[];
}

export interface SessionPlan {
  theme: string;
  rationale: string;
  playerBreakdown: { name: string; focus: string; flag?: string }[];
  drills: { title: string; description: string }[];
  flags: string[];
}

export async function buildGroupSessionAIContext(
  sessionId: string
): Promise<GroupSessionAIContext | null> {
  try {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session) return null;

    // Get all registered (non-guest) players in this session
    const spRows = await db
      .select({ playerId: sessionPlayers.playerId, isGuest: sessionPlayers.isGuest })
      .from(sessionPlayers)
      .where(and(eq(sessionPlayers.sessionId, sessionId), eq(sessionPlayers.isGuest, false)));

    if (spRows.length < 2) return null;

    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const playerProfiles: GroupSessionPlayerProfile[] = [];

    for (const sp of spRows) {
      if (!sp.playerId) continue;

      const [player] = await db.select().from(players).where(eq(players.id, sp.playerId));
      if (!player) continue;

      // Ball level
      const [levelRow] = await db
        .select({ levelId: playerBallLevels.levelId })
        .from(playerBallLevels)
        .where(eq(playerBallLevels.playerId, sp.playerId))
        .orderBy(desc(playerBallLevels.assignedAt))
        .limit(1);
      const ballLevel = levelRow?.levelId || player.ballLevel || "unknown";

      // Latest skill scores (top 5 by most recent)
      const rawScores = await db
        .select({
          skillName: glowSkills.name,
          pillar: glowSkills.pillar,
          score: playerSkillScores.score,
          movingAverage: playerSkillScores.movingAverage,
          createdAt: playerSkillScores.createdAt,
        })
        .from(playerSkillScores)
        .innerJoin(glowSkills, eq(playerSkillScores.skillId, glowSkills.id))
        .where(eq(playerSkillScores.playerId, sp.playerId))
        .orderBy(desc(playerSkillScores.createdAt))
        .limit(30);

      // Compute skill scores with trend by grouping by skill name, comparing latest vs previous
      const skillsByName = new Map<string, typeof rawScores>();
      for (const s of rawScores) {
        const key = s.skillName;
        if (!skillsByName.has(key)) skillsByName.set(key, []);
        skillsByName.get(key)!.push(s);
      }

      const skillScores: GroupSessionPlayerProfile["skillScores"] = [];
      for (const [skillName, entries] of skillsByName) {
        if (skillScores.length >= 6) break;
        const latest = entries[0];
        const prev = entries[1];
        const latestScore = Number(latest.movingAverage ?? latest.score);
        let trend: "improving" | "stable" | "declining" = "stable";
        if (prev) {
          const prevScore = Number(prev.movingAverage ?? prev.score);
          const delta = latestScore - prevScore;
          if (delta >= 0.15) trend = "improving";
          else if (delta <= -0.15) trend = "declining";
        }
        skillScores.push({
          skillName,
          pillar: latest.pillar || "Technical",
          score: latestScore,
          trend,
        });
      }

      // Recent coach session feedback (in-session feedback notes)
      const feedbackRows = await db
        .select({ feedbackType: inSessionFeedback.feedbackType, message: inSessionFeedback.message })
        .from(inSessionFeedback)
        .where(and(eq(inSessionFeedback.playerId, sp.playerId), gte(inSessionFeedback.createdAt, since30)))
        .orderBy(desc(inSessionFeedback.createdAt))
        .limit(5);
      const recentFeedback = feedbackRows.map((f) => `[${f.feedbackType}] ${f.message}`);

      // Coach long-form notes from playerNotes table
      const noteRows = await db
        .select({ category: playerNotes.category, content: playerNotes.content })
        .from(playerNotes)
        .where(eq(playerNotes.playerId, sp.playerId))
        .orderBy(desc(playerNotes.createdAt))
        .limit(3);
      const coachNotes = noteRows.map((n) => `[${n.category}] ${n.content}`);

      // Session digests
      const digestRows = await db
        .select({ summaryText: sessionAiSummaries.summaryText })
        .from(sessionAiSummaries)
        .where(eq(sessionAiSummaries.playerId, sp.playerId))
        .orderBy(desc(sessionAiSummaries.generatedAt))
        .limit(2);
      const recentDigests = digestRows.map((d) => d.summaryText);

      // Attendance in last 90 days
      const attRows = await db
        .select({ attendanceStatus: sessionPlayers.attendanceStatus })
        .from(sessionPlayers)
        .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
        .where(and(eq(sessionPlayers.playerId, sp.playerId), gte(sessions.startTime, since90)));
      const total = attRows.length;
      const present = attRows.filter(
        (r) => r.attendanceStatus === "present" || r.attendanceStatus === "late"
      ).length;
      const recentAbsences = attRows.filter(
        (r) => r.attendanceStatus === "absent"
      ).length;
      const attendanceRate = total > 0 ? Math.round((present / total) * 100) : null;

      playerProfiles.push({
        name: player.name,
        age: player.age ? Number(player.age) : null,
        ballLevel,
        skillScores,
        recentFeedback,
        coachNotes,
        recentDigests,
        attendanceRate,
        recentAbsences,
      });
    }

    if (playerProfiles.length < 2) return null;

    return {
      sessionId,
      academyId: session.academyId ?? null,
      sessionType: session.sessionType,
      sessionDate: session.startTime.toISOString().split("T")[0],
      durationMinutes: session.duration ?? 60,
      playerCount: playerProfiles.length,
      players: playerProfiles,
    };
  } catch (error) {
    console.error("[AIEngine] Error building group session context:", error);
    return null;
  }
}

export async function generateGroupSessionPlan(
  ctx: GroupSessionAIContext
): Promise<SessionPlan | null> {
  const playerLines = ctx.players.map((p) => {
    const skills = p.skillScores.length > 0
      ? p.skillScores.map((s) => `${s.skillName}(${s.score.toFixed(1)}/2, ${s.trend})`).join(", ")
      : "no skill data";
    const feedback = p.recentFeedback.length > 0 ? p.recentFeedback.slice(0, 3).join("; ") : "none";
    const notes = p.coachNotes.length > 0 ? p.coachNotes.slice(0, 2).join("; ") : "none";
    const digest = p.recentDigests.length > 0 ? p.recentDigests[0] : "none";
    const attendance = p.attendanceRate !== null ? `${p.attendanceRate}% attendance` : "attendance unknown";
    const absenceNote = p.recentAbsences >= 2 ? ` (${p.recentAbsences} recent absences)` : "";
    return `${p.name}${p.age ? ` (age ${p.age})` : ""} — ${p.ballLevel} ball level, ${attendance}${absenceNote}. Skills: ${skills}. Feedback: ${feedback}. Coach notes: ${notes}. Last session digest: ${digest}`;
  }).join("\n");

  const systemPrompt = `You are an expert tennis coach AI that creates precise session plans based on real player data. Respond ONLY with valid JSON matching the schema exactly — no extra text, no markdown, no code fences. Never use emojis.`;

  const userPrompt = `Create a pre-session coaching plan for a ${ctx.sessionType} session on ${ctx.sessionDate} (${ctx.durationMinutes} minutes) with ${ctx.playerCount} players.

PLAYER DATA:
${playerLines}

Return a JSON object with exactly this structure:
{
  "theme": "short session theme (4-7 words)",
  "rationale": "1-2 sentences explaining why this theme suits this group today",
  "playerBreakdown": [
    { "name": "player name", "focus": "specific focus for this player based on their data", "flag": "optional concern like returning from absence or skill gap" }
  ],
  "drills": [
    { "title": "drill name", "description": "what to do and why (1-2 sentences)" },
    { "title": "drill name", "description": "what to do and why (1-2 sentences)" },
    { "title": "drill name", "description": "what to do and why (1-2 sentences)" }
  ],
  "flags": ["any group-level observations or concerns (1-3 items)"]
}`;

  const raw = await callOpenAI(userPrompt, systemPrompt, 800, { featureType: "session-plan", academyId: ctx.academyId });
  if (!raw) return null;

  try {
    // Strip any accidental code fences
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as SessionPlan;
    if (!parsed.theme || !Array.isArray(parsed.drills)) return null;
    return parsed;
  } catch {
    console.error("[AIEngine] Failed to parse session plan JSON:", raw);
    return null;
  }
}

export async function storeProgressNarrative(
  playerId: string,
  academyId: string,
  days: number = 30
): Promise<void> {
  const result = await generateProgressNarrative(playerId, academyId, days);
  if (!result) return;

  await db.insert(playerAiInsights).values({
    playerId,
    narrativeText: result.narrative,
    focusAreas: result.focusAreas,
    periodDays: days,
  });

  console.log(`[AIEngine] Progress narrative stored for player ${playerId}`);
}

// ==================== AI QUEST PERSONALISATION ====================

/**
 * Checks if a player qualifies for personalised quest selection.
 * Requires at least 3 distinct coach-led baseline assessments on record.
 */
export async function qualifiesForPersonalisedQuests(playerId: string): Promise<boolean> {
  try {
    // Count distinct baseline assessment sessions (not individual skill rows)
    const [result] = await db
      .select({ total: count() })
      .from(playerBaselines)
      .where(eq(playerBaselines.playerId, playerId));
    return (result?.total ?? 0) >= 3;
  } catch {
    return false;
  }
}

/**
 * Maps a quest category to pillar names for relevance scoring.
 * Quest categories: training | social | performance | consistency | mental
 * Pillar names: TECHNIQUE | TACTICAL | PHYSICAL | MENTAL | SOCIAL | MATCH
 */
const CATEGORY_TO_PILLARS: Record<string, string[]> = {
  training: ["TECHNIQUE", "PHYSICAL"],
  social: ["SOCIAL"],
  performance: ["MATCH", "TACTICAL"],
  consistency: ["TECHNIQUE", "PHYSICAL", "MENTAL"],
  mental: ["MENTAL"],
};

/**
 * Ranks existing quest templates by relevance to the player's weakest pillar areas.
 * Uses playerPillarProgress EMA scores (or baseline skill averages as fallback) to
 * identify weak pillars, then selects quests whose categories target those pillars.
 * No AI is used — selection is purely data-driven.
 * Falls back to the first topN templates if data is insufficient.
 */
export async function pickPersonalisedQuests(
  playerId: string,
  templates: QuestTemplate[],
  topN: number = 3
): Promise<{ templates: QuestTemplate[]; personalisedBy: "weak_areas" | null }> {
  if (templates.length <= topN) {
    return { templates, personalisedBy: null };
  }

  try {
    // 1. Try to get pillar scores from playerPillarProgress (EMA-based)
    const pillarProgressRows = await db
      .select({
        pillar: playerPillarProgress.pillar,
        currentScore: playerPillarProgress.currentScore,
      })
      .from(playerPillarProgress)
      .where(eq(playerPillarProgress.playerId, playerId));

    let pillarScores: Record<string, number> = {};

    if (pillarProgressRows.length > 0) {
      for (const row of pillarProgressRows) {
        pillarScores[row.pillar] = Number(row.currentScore ?? 0);
      }
    } else {
      // Fallback: compute averages from playerBaselineSkillScores
      const baselineRows = await db
        .select({
          pillar: playerBaselineSkillScores.pillar,
          rating: playerBaselineSkillScores.rating,
        })
        .from(playerBaselineSkillScores)
        .where(eq(playerBaselineSkillScores.playerId, playerId));

      const byPillar: Record<string, number[]> = {};
      for (const row of baselineRows) {
        if (row.rating !== null) {
          byPillar[row.pillar] = byPillar[row.pillar] || [];
          byPillar[row.pillar].push(row.rating);
        }
      }
      for (const [pillar, ratings] of Object.entries(byPillar)) {
        pillarScores[pillar] = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      }
    }

    if (Object.keys(pillarScores).length === 0) {
      return { templates: templates.slice(0, topN), personalisedBy: null };
    }

    // 2. Rank templates by how well their category targets the player's weakest pillars
    // Lower pillar score → higher relevance weight for that pillar
    const maxScore = Math.max(...Object.values(pillarScores), 1);

    const scored = templates.map((template) => {
      const targetPillars = CATEGORY_TO_PILLARS[template.category ?? "training"] ?? [];
      let relevanceScore = 0;
      let pillarMatches = 0;

      for (const pillar of targetPillars) {
        if (pillar in pillarScores) {
          // Invert score: weaker pillar → higher relevance
          relevanceScore += maxScore - pillarScores[pillar];
          pillarMatches++;
        }
      }

      // Normalise by number of matched pillars; templates with no matching pillar data get neutral score
      const finalScore = pillarMatches > 0 ? relevanceScore / pillarMatches : maxScore / 2;

      return { template, finalScore };
    });

    // Sort descending by relevance score (highest → most relevant to weak areas)
    scored.sort((a, b) => b.finalScore - a.finalScore);

    const picked = scored.slice(0, topN).map((s) => s.template);

    console.log(
      `[QuestEngine] Personalised quests (weak-area) selected for player ${playerId}:`,
      picked.map((t) => t.name)
    );
    return { templates: picked, personalisedBy: "weak_areas" };
  } catch (error) {
    console.error("[QuestEngine] Error picking personalised quests:", error);
    return { templates: templates.slice(0, topN), personalisedBy: null };
  }
}

// ==================== PARENT PROGRESS LETTER ====================

export async function generateParentProgressLetter(
  playerId: string,
  monthLabel: string
): Promise<string | null> {
  try {
    const since = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    if (!player) return null;

    // Recent session digests
    const recentDigests = await db
      .select({ summaryText: sessionAiSummaries.summaryText, generatedAt: sessionAiSummaries.generatedAt })
      .from(sessionAiSummaries)
      .where(and(eq(sessionAiSummaries.playerId, playerId), gte(sessionAiSummaries.generatedAt, since)))
      .orderBy(desc(sessionAiSummaries.generatedAt))
      .limit(5);

    // Attendance this period
    const attendanceRows = await db
      .select({ attendanceStatus: sessionPlayers.attendanceStatus })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(and(eq(sessionPlayers.playerId, playerId), gte(sessions.startTime, since)));

    const totalSessions = attendanceRows.length;
    const attendedSessions = attendanceRows.filter(
      (r) => r.attendanceStatus === "present" || r.attendanceStatus === "late"
    ).length;

    // Latest skill scores
    const recentSkillScores = await db
      .select({
        skillName: glowSkills.name,
        pillar: glowSkills.pillar,
        score: playerSkillScores.score,
        movingAverage: playerSkillScores.movingAverage,
      })
      .from(playerSkillScores)
      .innerJoin(glowSkills, eq(playerSkillScores.skillId, glowSkills.id))
      .where(and(eq(playerSkillScores.playerId, playerId), gte(playerSkillScores.createdAt, since)))
      .orderBy(desc(playerSkillScores.createdAt))
      .limit(10);

    // Coach notes (parent-safe: only public/general notes)
    const coachNoteRows = await db
      .select({ category: playerNotes.category, content: playerNotes.content })
      .from(playerNotes)
      .where(and(eq(playerNotes.playerId, playerId), gte(playerNotes.createdAt, since)))
      .orderBy(desc(playerNotes.createdAt))
      .limit(5);

    // XP this month
    const xpData = await db
      .select({ totalXp: players.totalXp, level: players.level })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    const [playerLevel] = await db
      .select({ levelId: playerBallLevels.levelId })
      .from(playerBallLevels)
      .where(eq(playerBallLevels.playerId, playerId))
      .orderBy(desc(playerBallLevels.assignedAt))
      .limit(1);

    const ballLevel = playerLevel?.levelId || (player as any).ballLevel || "unknown";
    const firstName = player.name.split(" ")[0];
    const age = player.age ? Number(player.age) : null;

    const digestsText = recentDigests.length > 0
      ? recentDigests.map((d) => `- ${d.summaryText}`).join("\n")
      : "No session summaries recorded this month.";

    const skillText = recentSkillScores.length > 0
      ? recentSkillScores.map((s) => `${s.skillName}: ${s.movingAverage ?? s.score}/2`).join(", ")
      : "no skill data this month";

    const coachNoteText = coachNoteRows.length > 0
      ? coachNoteRows.map((n) => n.content).join(". ")
      : "";

    const attendanceText = totalSessions > 0
      ? `${attendedSessions} out of ${totalSessions} sessions attended`
      : "no sessions recorded this month";

    const xpLevel = xpData[0]?.level ?? 1;
    const totalXp = xpData[0]?.totalXp ?? 0;

    const userPrompt = `Write a warm, friendly progress letter to the parent of ${firstName}${age ? ` (age ${age})` : ""}, a tennis player at ${ballLevel} level, covering their progress during ${monthLabel}.

Data to draw from:
- Sessions this month: ${attendanceText}
- Skill scores: ${skillText}
- Session notes: ${digestsText}
${coachNoteText ? `- Coach observations: ${coachNoteText}` : ""}
- Current level: ${ballLevel}, XP level ${xpLevel} (${totalXp.toLocaleString()} XP total)

Write 3-4 short paragraphs:
1. A warm opening acknowledging ${firstName}'s month
2. What they focused on and what improved (reference specific skills or session observations, no technical jargon)
3. One or two concrete things parents can encourage at home (e.g., "encourage regular ball bouncing practice for 5-10 minutes a day")
4. A brief motivating close

Tone: warm, parent-friendly, positive but honest. No scores or numbers from the skill scores — translate them into plain language. No emojis. Address the letter to "Dear [Parent name]" using "Dear [First name]'s family" as the salutation. Sign off as "The Coaching Team at [Academy]".`;

    const systemPrompt = "You are a friendly sports academy communicator writing monthly progress letters to parents of junior tennis players. Your letters are warm, jargon-free, positive, and give parents clear, actionable ways to support their child at home. Never use emojis. Never mention internal scores or numbers.";

    const letter = await callOpenAI(userPrompt, systemPrompt, 700, { featureType: "report", academyId: player.academyId ?? null });
    return letter?.trim() || null;
  } catch (error) {
    console.error("[AIEngine] Error generating parent progress letter:", error);
    return null;
  }
}


export interface RosterPlayerSummary {
  playerId: string;
  playerName: string;
  ballLevel: string;
  age: number | null;
  attendanceRate: number | null;
  missedSessionsLast30: number;
  totalSessionsLast30: number;
  skillGaps: { skillName: string; pillar: string; score: number; target: number }[];
  trendDirection: "improving" | "declining" | "stable" | "insufficient_data";
  coachFlags: string[];
}

export interface RosterInsightsContext {
  totalPlayers: number;
  players: RosterPlayerSummary[];
  commonSkillGaps: { skillName: string; pillar: string; playerCount: number; totalPlayers: number }[];
  attendanceConcerns: { playerId: string; playerName: string; missedSessions: number }[];
  improvingPlayers: { playerId: string; playerName: string }[];
  decliningPlayers: { playerId: string; playerName: string }[];
}

export async function buildRosterInsightsContext(coachId: string): Promise<RosterInsightsContext | null> {
  try {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const coachPlayers = await db
      .select({
        id: players.id,
        name: players.name,
        ballLevel: players.ballLevel,
        age: players.age,
        status: players.status,
      })
      .from(players)
      .where(and(eq(players.coachId, coachId), eq(players.status, "active")));

    if (coachPlayers.length === 0) return null;

    const playerIds = coachPlayers.map((p) => p.id);

    // Get recent skill scores per player
    const allSkillScores = await db
      .select({
        playerId: playerSkillScores.playerId,
        skillName: glowSkills.name,
        pillar: glowSkills.pillar,
        score: playerSkillScores.score,
        movingAverage: playerSkillScores.movingAverage,
        createdAt: playerSkillScores.createdAt,
      })
      .from(playerSkillScores)
      .innerJoin(glowSkills, eq(playerSkillScores.skillId, glowSkills.id))
      .where(and(inArray(playerSkillScores.playerId, playerIds), gte(playerSkillScores.createdAt, since30)))
      .orderBy(desc(playerSkillScores.createdAt));

    // Get recent session attendance per player
    const recentSessionData = await db
      .select({
        playerId: sessionPlayers.playerId,
        attendanceStatus: sessionPlayers.attendanceStatus,
        sessionId: sessionPlayers.sessionId,
      })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(
        and(
          inArray(sessionPlayers.playerId, playerIds),
          gte(sessions.startTime, since30)
        )
      );

    // Get current ball levels from playerBallLevels table
    const ballLevelRows = await db
      .select({
        playerId: playerBallLevels.playerId,
        levelId: playerBallLevels.levelId,
      })
      .from(playerBallLevels)
      .where(inArray(playerBallLevels.playerId, playerIds))
      .orderBy(desc(playerBallLevels.assignedAt));

    const latestBallLevel = new Map<string, string>();
    for (const row of ballLevelRows) {
      if (!latestBallLevel.has(row.playerId)) {
        latestBallLevel.set(row.playerId, row.levelId);
      }
    }

    // Get level skill targets
    const allBallLevelIds = [...new Set(coachPlayers.map((p) => latestBallLevel.get(p.id) || p.ballLevel || "unknown"))];
    const levelSkillTargets = await db
      .select({
        levelId: levelSkills.levelId,
        skillName: glowSkills.name,
        pillar: glowSkills.pillar,
        targetScore: levelSkills.targetScore,
        isRequired: levelSkills.isRequired,
      })
      .from(levelSkills)
      .innerJoin(glowSkills, eq(levelSkills.skillId, glowSkills.id))
      .where(and(inArray(levelSkills.levelId, allBallLevelIds), eq(levelSkills.isRequired, true)));

    // Get coach notes/flags for players
    const coachNotes = await db
      .select({
        playerId: playerNotes.playerId,
        content: playerNotes.content,
        category: playerNotes.category,
        isPinned: playerNotes.isPinned,
      })
      .from(playerNotes)
      .where(
        and(
          inArray(playerNotes.playerId, playerIds),
          eq(playerNotes.coachId, coachId),
          eq(playerNotes.isPinned, true)
        )
      );

    // Aggregate data per player
    const playerSummaries: RosterPlayerSummary[] = [];

    for (const player of coachPlayers) {
      const effectiveLevel = latestBallLevel.get(player.id) || player.ballLevel || "unknown";
      const playerSessions = recentSessionData.filter((s) => s.playerId === player.id);
      const totalSessions = playerSessions.length;
      const attendedSessions = playerSessions.filter(
        (s) => s.attendanceStatus === "present" || s.attendanceStatus === "late"
      ).length;
      const missedSessions = playerSessions.filter((s) => s.attendanceStatus === "absent").length;
      const attendanceRate = totalSessions > 0 ? Math.round((attendedSessions / totalSessions) * 100) : null;

      // Get latest score per skill for this player
      const playerScores = allSkillScores.filter((s) => s.playerId === player.id);
      const latestScoreBySkill = new Map<string, number>();
      for (const score of playerScores) {
        if (!latestScoreBySkill.has(score.skillName)) {
          latestScoreBySkill.set(score.skillName, Number(score.movingAverage ?? score.score));
        }
      }

      // Calculate skill gaps against level targets
      const levelTargets = levelSkillTargets.filter((lt) => lt.levelId === effectiveLevel);
      const skillGaps: RosterPlayerSummary["skillGaps"] = [];
      for (const target of levelTargets) {
        const currentScore = latestScoreBySkill.get(target.skillName);
        if (currentScore !== undefined && currentScore < target.targetScore) {
          skillGaps.push({
            skillName: target.skillName,
            pillar: target.pillar || "Technical",
            score: currentScore,
            target: target.targetScore,
          });
        }
      }

      // Simple trend: compare oldest vs newest score in the period
      let trendDirection: RosterPlayerSummary["trendDirection"] = "insufficient_data";
      if (playerScores.length >= 2) {
        const oldest = playerScores[playerScores.length - 1];
        const newest = playerScores[0];
        const diff = Number(newest.movingAverage ?? newest.score) - Number(oldest.movingAverage ?? oldest.score);
        if (diff > 0.1) trendDirection = "improving";
        else if (diff < -0.1) trendDirection = "declining";
        else trendDirection = "stable";
      }

      // Get coach flags (pinned notes)
      const flags = coachNotes
        .filter((n) => n.playerId === player.id)
        .map((n) => `[${n.category}] ${n.content}`.substring(0, 80));

      playerSummaries.push({
        playerId: player.id,
        playerName: player.name,
        ballLevel: effectiveLevel,
        age: player.age ? Number(player.age) : null,
        attendanceRate,
        missedSessionsLast30: missedSessions,
        totalSessionsLast30: totalSessions,
        skillGaps,
        trendDirection,
        coachFlags: flags,
      });
    }

    // Aggregate common skill gaps across roster
    const skillGapCount = new Map<string, { pillar: string; count: number }>();
    for (const ps of playerSummaries) {
      for (const gap of ps.skillGaps) {
        const entry = skillGapCount.get(gap.skillName);
        if (entry) {
          entry.count++;
        } else {
          skillGapCount.set(gap.skillName, { pillar: gap.pillar, count: 1 });
        }
      }
    }

    const commonSkillGaps = [...skillGapCount.entries()]
      .map(([skillName, { pillar, count }]) => ({
        skillName,
        pillar,
        playerCount: count,
        totalPlayers: playerSummaries.length,
      }))
      .sort((a, b) => b.playerCount - a.playerCount)
      .slice(0, 5);

    const attendanceConcerns = playerSummaries
      .filter((p) => p.missedSessionsLast30 >= 2)
      .map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        missedSessions: p.missedSessionsLast30,
      }))
      .sort((a, b) => b.missedSessions - a.missedSessions);

    const improvingPlayers = playerSummaries
      .filter((p) => p.trendDirection === "improving")
      .map((p) => ({ playerId: p.playerId, playerName: p.playerName }));

    const decliningPlayers = playerSummaries
      .filter((p) => p.trendDirection === "declining")
      .map((p) => ({ playerId: p.playerId, playerName: p.playerName }));

    return {
      totalPlayers: playerSummaries.length,
      players: playerSummaries,
      commonSkillGaps,
      attendanceConcerns,
      improvingPlayers,
      decliningPlayers,
    };
  } catch (error) {
    console.error("[AIEngine] Error building roster insights context:", error);
    return null;
  }
}

export async function generateRosterInsights(coachId: string): Promise<{ insights: { text: string; playerIds: string[] }[]; generatedAt: string } | null> {
  try {
    const [coachRow] = await db
      .select({ academyId: coaches.academyId })
      .from(coaches)
      .where(eq(coaches.id, coachId))
      .limit(1);
    const rosterAcademyId = coachRow?.academyId ?? null;

    const context = await buildRosterInsightsContext(coachId);
    if (!context || context.totalPlayers === 0) return null;

    // Require at least one meaningful pattern: 3+ players sharing a common weakness or trend
    const hasMeaningfulPattern =
      context.commonSkillGaps.some((g) => g.playerCount >= 3) ||
      context.attendanceConcerns.length >= 3 ||
      context.improvingPlayers.length >= 3 ||
      context.decliningPlayers.length >= 3;

    if (!hasMeaningfulPattern) return null;

    // Build structured prompt
    const lines: string[] = [
      `Roster overview: ${context.totalPlayers} active players`,
    ];

    if (context.commonSkillGaps.length > 0) {
      lines.push(
        `Top skill gaps across roster: ${context.commonSkillGaps
          .map((g) => `${g.skillName} (${g.playerCount}/${g.totalPlayers} players)`)
          .join(", ")}`
      );
    }

    if (context.attendanceConcerns.length > 0) {
      lines.push(
        `Attendance concerns: ${context.attendanceConcerns
          .map((p) => `${p.playerName} (${p.missedSessions} missed sessions)`)
          .join(", ")}`
      );
    }

    if (context.improvingPlayers.length > 0) {
      lines.push(
        `Players improving: ${context.improvingPlayers.map((p) => p.playerName).join(", ")} (${context.improvingPlayers.length} players)`
      );
    }

    if (context.decliningPlayers.length > 0) {
      lines.push(
        `Players declining: ${context.decliningPlayers.map((p) => p.playerName).join(", ")} (${context.decliningPlayers.length} players)`
      );
    }

    // Add a sample of per-player summaries (skill gaps only)
    const playersWithGaps = context.players.filter((p) => p.skillGaps.length > 0).slice(0, 8);
    if (playersWithGaps.length > 0) {
      const playerLines = playersWithGaps.map(
        (p) => `  - ${p.playerName} (${p.ballLevel}): gaps in ${p.skillGaps.map((g) => g.skillName).join(", ")}`
      );
      lines.push("Per-player skill gaps:\n" + playerLines.join("\n"));
    }

    // Include coach flags (pinned notes) in the context
    const playersWithFlags = context.players.filter((p) => p.coachFlags.length > 0);
    if (playersWithFlags.length > 0) {
      const flagLines = playersWithFlags.map(
        (p) => `  - ${p.playerName}: ${p.coachFlags.join(" | ")}`
      );
      lines.push("Coach-flagged notes (pinned):\n" + flagLines.join("\n"));
    }

    const prompt = `You are a head tennis/sports coach reviewing your roster data for coaching intelligence.

${lines.join("\n")}

Generate EXACTLY 3 concise, actionable insights for the coach dashboard. Each insight should:
- Be 1-2 sentences max
- Reference specific numbers (e.g. "7 of 12 players", "3 sessions missed")
- Be immediately actionable (e.g. suggest a group session topic, flag a player to check in with)
- Cover different aspects: skill trends, attendance, or individual player progress
- Never use emojis

Also, for each insight, list which player IDs are most relevant (use the playerIds from the data below).

Player ID mapping:
${context.players.map((p) => `${p.playerName}: ${p.playerId}`).join("\n")}

Return ONLY valid JSON (no markdown), like:
[
  {"text": "insight text here", "playerIds": ["id1", "id2"]},
  {"text": "insight text here", "playerIds": ["id3"]},
  {"text": "insight text here", "playerIds": ["id4", "id5"]}
]`;

    const systemPrompt =
      "You are an expert sports analytics AI for a coaching platform. Generate concise, data-driven roster insights. Return only valid JSON without markdown formatting. Never use emojis.";

    const response = await callOpenAI(prompt, systemPrompt, 600, { featureType: "report", academyId: rosterAcademyId });
    if (!response) return null;

    const cleaned = response.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "").trim();
    let parsed: { text: string; playerIds: string[] }[];
    try {
      parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return null;
    } catch {
      return null;
    }

    const insights = parsed
      .filter((item) => item.text && typeof item.text === "string")
      .slice(0, 3)
      .map((item) => ({
        text: item.text.trim(),
        playerIds: Array.isArray(item.playerIds) ? item.playerIds : [],
      }));

    return {
      insights,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[AIEngine] Error generating roster insights:", error);
    return null;
  }
}

// ==================== MATCH READINESS SCORE ====================

export interface MatchReadinessResult {
  readinessScore: number;
  topStrength: string;
  biggestGap: string;
  tacticalTips: string[];
  rationale: string;
  generatedAt: string;
}

export async function buildMatchReadinessScore(
  playerId: string
): Promise<MatchReadinessResult | null> {
  try {
    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    if (!player) return null;

    const since28 = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

    // 1. Attendance consistency (last 4 weeks)
    const attendanceRows = await db
      .select({ attendanceStatus: sessionPlayers.attendanceStatus })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(
        and(
          eq(sessionPlayers.playerId, playerId),
          gte(sessions.startTime, since28)
        )
      );
    const totalSessions = attendanceRows.length;
    const attendedSessions = attendanceRows.filter(
      (r) => r.attendanceStatus === "present" || r.attendanceStatus === "late"
    ).length;
    const attendanceRate = totalSessions > 0 ? attendedSessions / totalSessions : 0;

    // 2. Skill scores vs pillar average
    const [levelRow] = await db
      .select({ levelId: playerBallLevels.levelId })
      .from(playerBallLevels)
      .where(eq(playerBallLevels.playerId, playerId))
      .orderBy(desc(playerBallLevels.assignedAt))
      .limit(1);
    const ballLevel = levelRow?.levelId || player.ballLevel || "unknown";

    let skillScoreAvg = 0;
    let topStrengthSkill = "";
    let biggestGapSkill = "";
    let skillLines = "";

    const latestSkillScores = await db
      .select({
        skillName: glowSkills.name,
        pillar: glowSkills.pillar,
        score: playerSkillScores.score,
        movingAverage: playerSkillScores.movingAverage,
      })
      .from(playerSkillScores)
      .innerJoin(glowSkills, eq(playerSkillScores.skillId, glowSkills.id))
      .where(eq(playerSkillScores.playerId, playerId))
      .orderBy(desc(playerSkillScores.createdAt))
      .limit(50);

    // Deduplicate — latest score per skill
    const seenSkills = new Set<string>();
    const deduped: { skillName: string; pillar: string; score: number }[] = [];
    for (const s of latestSkillScores) {
      if (!seenSkills.has(s.skillName)) {
        seenSkills.add(s.skillName);
        deduped.push({
          skillName: s.skillName,
          pillar: s.pillar || "Technical",
          score: Number(s.movingAverage ?? s.score),
        });
      }
    }

    if (deduped.length > 0) {
      skillScoreAvg = deduped.reduce((acc, s) => acc + s.score, 0) / deduped.length / 2;
      const sorted = [...deduped].sort((a, b) => b.score - a.score);
      topStrengthSkill = sorted[0]?.skillName || "";
      biggestGapSkill = sorted[sorted.length - 1]?.skillName || "";
      skillLines = deduped.map((s) => `${s.skillName} (${s.pillar}): ${s.score.toFixed(1)}/2`).join(", ");
    }

    // 3. Skill trend: compare most recent vs earlier scores per skill (improving/stable/declining)
    // latestSkillScores is ordered newest-first; build history groups BEFORE dedup
    let skillTrendScore = 0; // -1 = declining, 0 = stable, +1 = improving
    {
      const skillHistory = new Map<string, number[]>();
      for (const s of latestSkillScores) {
        const name = s.skillName;
        if (!skillHistory.has(name)) skillHistory.set(name, []);
        skillHistory.get(name)!.push(Number(s.movingAverage ?? s.score));
      }
      let improvingCount = 0;
      let decliningCount = 0;
      for (const [, scores] of skillHistory) {
        if (scores.length >= 2) {
          // scores[0] = most recent, scores[last] = oldest within the 50-row window
          const delta = scores[0] - scores[scores.length - 1];
          if (delta >= 0.1) improvingCount++;
          else if (delta <= -0.1) decliningCount++;
        }
      }
      if (improvingCount > decliningCount) skillTrendScore = 1;
      else if (decliningCount > improvingCount) skillTrendScore = -1;
    }

    // 4. Coach mental/tactical notes (playerNotes)
    const coachNoteRows = await db
      .select({ category: playerNotes.category, content: playerNotes.content })
      .from(playerNotes)
      .where(eq(playerNotes.playerId, playerId))
      .orderBy(desc(playerNotes.createdAt))
      .limit(10);

    const mentalNotes = coachNoteRows.filter((n) => n.category === "mental" || n.category === "general");
    const tacticalNotes = coachNoteRows.filter((n) => n.category === "technique" || n.category === "next-lesson");
    const coachNotesText = coachNoteRows.map((n) => `[${n.category}] ${n.content}`).join("; ") || "none";

    // Mental flag: deduct points if mental/confidence concerns are flagged
    const hasMentalConcern = mentalNotes.some(
      (n) => /\b(struggle|concern|anxious|nervous|confidence|inconsistent|mental|pressure)\b/i.test(n.content)
    );
    // Tactical flag: bonus if coach has positive tactical notes (e.g., "ready", "strong", "improved")
    const hasPositiveTacticalFlag = tacticalNotes.some(
      (n) => /\b(ready|strong|improved|good|excellent|solid|consistent)\b/i.test(n.content)
    );

    // 5. Recent match win rate from tournament_matches
    const recentMatches = await db
      .select({
        winnerId: tournamentMatches.winnerId,
        player1Id: tournamentMatches.player1Id,
        player2Id: tournamentMatches.player2Id,
        status: tournamentMatches.status,
      })
      .from(tournamentMatches)
      .where(
        and(
          eq(tournamentMatches.status, "completed"),
          gte(tournamentMatches.completedAt, since28)
        )
      )
      .limit(20);

    const playerMatches = recentMatches.filter(
      (m) => m.player1Id === playerId || m.player2Id === playerId
    );
    const wins = playerMatches.filter((m) => m.winnerId === playerId).length;
    const winRate = playerMatches.length > 0 ? wins / playerMatches.length : null;

    // 6. Recent session digests for context
    const recentDigests = await db
      .select({ summaryText: sessionAiSummaries.summaryText })
      .from(sessionAiSummaries)
      .where(eq(sessionAiSummaries.playerId, playerId))
      .orderBy(desc(sessionAiSummaries.generatedAt))
      .limit(4);
    const digestsText = recentDigests.map((d) => d.summaryText).join(" | ") || "no recent session summaries";

    // Calculate a base readiness score (0–100) algorithmically with all required inputs:
    // - Attendance consistency (last 4 weeks):   25 pts max
    // - Skill score average vs pillar target:    25 pts max
    // - Skill trend (improving/stable/declining): 15 pts max
    // - Coach mental/tactical flags:             15 pts max (penalty/bonus)
    // - Recent match win rate:                   20 pts max
    const attendancePts = Math.round(attendanceRate * 25);
    const skillPts = Math.round(skillScoreAvg * 25);
    // Trend: improving = 15, stable = 10, declining = 5
    const trendPts = skillTrendScore === 1 ? 15 : skillTrendScore === 0 ? 10 : 5;
    // Mental/tactical flag component: start at 10, +5 for positive tactical note, -10 for mental concern
    let mentalTacticalPts = 10;
    if (hasPositiveTacticalFlag) mentalTacticalPts = Math.min(15, mentalTacticalPts + 5);
    if (hasMentalConcern) mentalTacticalPts = Math.max(0, mentalTacticalPts - 10);
    const winRatePts = winRate !== null ? Math.round(winRate * 20) : 10;
    const baseScore = Math.min(100, Math.max(0, attendancePts + skillPts + trendPts + mentalTacticalPts + winRatePts));

    const skillTrendLabel = skillTrendScore === 1 ? "improving" : skillTrendScore === 0 ? "stable" : "declining";

    // Build prompt for AI to generate tactical tips, strength, gap
    const prompt = `Player: ${player.name}, level: ${ballLevel}
Attendance (last 4 weeks): ${Math.round(attendanceRate * 100)}% (${attendedSessions}/${totalSessions} sessions) → ${attendancePts}/25 pts
Skill scores: ${skillLines || "no data"} → ${skillPts}/25 pts
Skill trend (last 4 weeks): ${skillTrendLabel} → ${trendPts}/15 pts
Coach mental/tactical flags: mental concern=${hasMentalConcern}, positive tactical=${hasPositiveTacticalFlag} → ${mentalTacticalPts}/15 pts
Coach notes: ${coachNotesText}
Match win rate (last 4 weeks): ${winRate !== null ? `${Math.round(winRate * 100)}% (${wins}/${playerMatches.length} matches)` : "no recent match data"} → ${winRatePts}/20 pts
Algorithmic readiness score: ${baseScore}/100
Recent session summaries: ${digestsText}

You are generating a match readiness report for this player's upcoming tournament match.
Return ONLY valid JSON (no markdown), structured exactly as:
{
  "readinessScore": <integer 0-100>,
  "topStrength": "<one concise sentence about their strongest asset for competition>",
  "biggestGap": "<one concise sentence about the area most needing attention>",
  "tacticalTips": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "rationale": "<one-line rationale for the readiness score>"
}
The readinessScore should be close to the algorithmic estimate (${baseScore}) but can be adjusted ±10 based on qualitative context.
All text must be specific, actionable, and based on the data above. Never use emojis.`;

    const systemPrompt =
      "You are an expert sports coaching AI. Generate accurate, data-driven match readiness assessments for players preparing for tournament matches. Return only valid JSON without markdown. Never use emojis.";

    const response = await callOpenAI(prompt, systemPrompt, 500, { featureType: "report", academyId: player.academyId ?? null });
    if (!response) {
      return {
        readinessScore: baseScore,
        topStrength: topStrengthSkill ? `Strong ${topStrengthSkill} is a key weapon heading into the match.` : "Consistent training builds confidence.",
        biggestGap: biggestGapSkill ? `Focus on improving ${biggestGapSkill} under pressure.` : "Continue developing all-round consistency.",
        tacticalTips: [
          "Stick to high-percentage shots and reduce unforced errors.",
          "Control the pace early in each game to build confidence.",
          "Stay focused on each point and maintain a positive mindset.",
        ],
        rationale: `Readiness based on ${Math.round(attendanceRate * 100)}% attendance, average skill scores, and recent form.`,
        generatedAt: new Date().toISOString(),
      };
    }

    try {
      const cleaned = response.trim().replace(/^```json\s*/, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.readinessScore !== undefined && parsed.topStrength && parsed.biggestGap && Array.isArray(parsed.tacticalTips)) {
        return {
          readinessScore: Math.min(100, Math.max(0, Math.round(Number(parsed.readinessScore)))),
          topStrength: parsed.topStrength,
          biggestGap: parsed.biggestGap,
          tacticalTips: parsed.tacticalTips.slice(0, 3),
          rationale: parsed.rationale || `Score based on training consistency and skill data.`,
          generatedAt: new Date().toISOString(),
        };
      }
    } catch {
      // fallback
    }

    return {
      readinessScore: baseScore,
      topStrength: topStrengthSkill ? `Strong ${topStrengthSkill} is a key asset for the match.` : "Consistent attendance shows good preparation.",
      biggestGap: biggestGapSkill ? `Continue developing ${biggestGapSkill} to strengthen overall game.` : "Focus on consistency across all skills.",
      tacticalTips: [
        "Stick to high-percentage shots and keep errors low.",
        "Control the pace early to build match confidence.",
        "Stay process-focused — trust your training.",
      ],
      rationale: `Score based on ${Math.round(attendanceRate * 100)}% attendance and skill data.`,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[AIEngine] Error building match readiness score:", error);
    return null;
  }
}

// ==================== PRE-SESSION AI COACHING BRIEF ====================

export interface SessionBriefPlayerSummary {
  playerId: string;
  playerName: string;
  bullets: string[];
}

export interface SessionBriefResult {
  briefText: string;
  playerSummaries: SessionBriefPlayerSummary[];
}

export async function generateSessionBrief(sessionId: string): Promise<SessionBriefResult | null> {
  try {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!session || !session.coachId) return null;

    // Fetch enrolled players for this session
    let enrolled = await db
      .select({ playerId: sessionPlayers.playerId })
      .from(sessionPlayers)
      .where(eq(sessionPlayers.sessionId, sessionId));

    // Fallback: check series players if session has a seriesId
    if (enrolled.length === 0 && session.seriesId) {
      const { seriesPlayers } = await import("@shared/schema");
      const sp = await db
        .select({ playerId: seriesPlayers.playerId })
        .from(seriesPlayers)
        .where(eq(seriesPlayers.seriesId, session.seriesId));
      enrolled = sp;
    }

    if (enrolled.length === 0) {
      console.log(`[SessionBrief] No players enrolled in session ${sessionId}, skipping brief`);
      return null;
    }

    const playerIds = enrolled.map((e) => e.playerId).filter(Boolean) as string[];

    const playerSummaries: SessionBriefPlayerSummary[] = [];

    for (const playerId of playerIds) {
      const [player] = await db.select().from(players).where(eq(players.id, playerId));
      if (!player) continue;

      const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Glow Mirror Layer 1 — recent session check-ins (last 3)
      const recentReflections = await db
        .select({
          aiSummary: playerSessionReflections.aiSummary,
          energyLevel: playerSessionReflections.energyLevel,
          overallFeeling: playerSessionReflections.overallFeeling,
          hardestPart: playerSessionReflections.hardestPart,
          keyLearning: playerSessionReflections.keyLearning,
          nextFocus: playerSessionReflections.nextFocus,
        })
        .from(playerSessionReflections)
        .where(eq(playerSessionReflections.playerId, playerId))
        .orderBy(desc(playerSessionReflections.createdAt))
        .limit(3);

      // Glow Mirror Layer 2 — latest completed monthly assessment
      const [latestAssessment] = await db
        .select({
          monthYear: playerMonthlyAssessments.monthYear,
          aiSummary: playerMonthlyAssessments.aiSummary,
          strengthsAnswer: playerMonthlyAssessments.strengthsAnswer,
          challengesAnswer: playerMonthlyAssessments.challengesAnswer,
          mindsetAnswer: playerMonthlyAssessments.mindsetAnswer,
          pillarSelfRatings: playerMonthlyAssessments.pillarSelfRatings,
        })
        .from(playerMonthlyAssessments)
        .where(
          and(
            eq(playerMonthlyAssessments.playerId, playerId),
            eq(playerMonthlyAssessments.status, "completed")
          )
        )
        .orderBy(desc(playerMonthlyAssessments.createdAt))
        .limit(1);

      // Recent skill scores for pillar averages (for perception gap)
      const recentSkillScores = await db
        .select({
          pillar: glowSkills.pillar,
          score: playerSkillScores.score,
          movingAverage: playerSkillScores.movingAverage,
        })
        .from(playerSkillScores)
        .innerJoin(glowSkills, eq(playerSkillScores.skillId, glowSkills.id))
        .where(eq(playerSkillScores.playerId, playerId))
        .orderBy(desc(playerSkillScores.createdAt))
        .limit(50);

      // Compute perception gaps
      const perceptionGaps: { pillar: string; selfRating: number; coachScore: number; gap: number }[] = [];
      if (latestAssessment?.pillarSelfRatings && recentSkillScores.length > 0) {
        const selfRatings = latestAssessment.pillarSelfRatings as Record<string, number>;
        const pillarSums: Record<string, { total: number; count: number }> = {};
        for (const s of recentSkillScores) {
          const pillar = s.pillar.toLowerCase();
          if (!pillarSums[pillar]) pillarSums[pillar] = { total: 0, count: 0 };
          const scoreVal = s.movingAverage !== null ? s.movingAverage : s.score;
          pillarSums[pillar].total += (scoreVal / 2) * 10;
          pillarSums[pillar].count += 1;
        }
        for (const [pillar, selfRating] of Object.entries(selfRatings)) {
          const pillarKey = pillar.toLowerCase();
          if (pillarSums[pillarKey]) {
            const coachScore = Math.round((pillarSums[pillarKey].total / pillarSums[pillarKey].count) * 10) / 10;
            const gap = Math.round((selfRating - coachScore) * 10) / 10;
            perceptionGaps.push({ pillar, selfRating, coachScore, gap });
          }
        }
        perceptionGaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
      }

      // Recent coach feedback notes (last 5)
      const recentFeedback = await db
        .select({ feedbackType: inSessionFeedback.feedbackType, message: inSessionFeedback.message })
        .from(inSessionFeedback)
        .where(and(eq(inSessionFeedback.playerId, playerId), gte(inSessionFeedback.createdAt, since30)))
        .orderBy(desc(inSessionFeedback.createdAt))
        .limit(5);

      // Skip one-off private sessions with no prior data (per task out-of-scope spec)
      const hasAnyPriorData =
        recentReflections.length > 0 ||
        latestAssessment !== undefined ||
        recentSkillScores.length > 0 ||
        recentFeedback.length > 0;

      if (!hasAnyPriorData && session.sessionType === "private" && !session.seriesId) {
        console.log(`[SessionBrief] Skipping one-off private session player ${playerId} — no prior data`);
        continue;
      }

      // Build context strings
      const reflectionLines = recentReflections.map((r) => {
        const parts: string[] = [];
        if (r.aiSummary) parts.push(`Check-in summary: "${r.aiSummary}"`);
        else {
          if (r.energyLevel) parts.push(`Energy: ${r.energyLevel}/5`);
          if (r.hardestPart) parts.push(`Hardest part: "${r.hardestPart}"`);
          if (r.keyLearning) parts.push(`Key learning: "${r.keyLearning}"`);
          if (r.nextFocus) parts.push(`Next focus: "${r.nextFocus}"`);
        }
        return parts.join("; ");
      }).filter(Boolean).join(" | ");

      const assessmentLines = latestAssessment
        ? [
            latestAssessment.aiSummary ? `Monthly summary (${latestAssessment.monthYear}): "${latestAssessment.aiSummary}"` : null,
            latestAssessment.strengthsAnswer ? `Self-reported strengths: "${latestAssessment.strengthsAnswer}"` : null,
            latestAssessment.challengesAnswer ? `Self-reported challenges: "${latestAssessment.challengesAnswer}"` : null,
            latestAssessment.mindsetAnswer ? `Mindset note: "${latestAssessment.mindsetAnswer}"` : null,
          ].filter(Boolean).join("; ")
        : "No monthly assessment yet";

      const perceptionGapLines = perceptionGaps.length > 0
        ? perceptionGaps.slice(0, 3).map((g) =>
            `${g.pillar}: self-rates ${g.selfRating}/10 vs coach data ${g.coachScore}/10 (gap ${g.gap > 0 ? "+" : ""}${g.gap})`
          ).join("; ")
        : "No perception gap data";

      const feedbackLines = recentFeedback.length > 0
        ? recentFeedback.map((f) => `${f.feedbackType}: ${f.message}`).join("; ")
        : "No recent coach notes";

      const prompt = `Player: ${player.name}, age ${player.age ?? "unknown"}, level ${player.ballLevel || "unknown"}

Recent session check-ins (Glow Mirror):
${reflectionLines || "No check-ins yet"}

Monthly self-assessment:
${assessmentLines}

Perception gaps (self vs coach data):
${perceptionGapLines}

Recent coach feedback notes:
${feedbackLines}

Generate 2-3 concise coaching bullet points for the coach to focus on in today's session with this player. Each bullet must be directly actionable and specific. If there is a significant perception gap (absolute gap > 1.5), flag it. If the player mentioned a specific focus in their check-in, address it. Start each bullet with a dash (-). Never use emojis. Keep total response under 150 words.`;

      const systemPrompt = "You are an expert tennis/padel/pickleball coaching assistant. Generate pre-session coaching briefs to help coaches prepare. Be specific, data-driven, and concise. Never use emojis.";

      const bulletText = await callOpenAI(prompt, systemPrompt, 250, { featureType: "report", academyId: session.academyId ?? null });
      if (!bulletText) continue;

      const bullets = bulletText
        .split("\n")
        .map((l) => l.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean);

      playerSummaries.push({ playerId, playerName: player.name, bullets });
    }

    if (playerSummaries.length === 0) return null;

    // Generate overall session focus
    const overallPrompt = `You are preparing a coach for an upcoming session. Here are the per-player briefs:

${playerSummaries.map((ps) => `${ps.playerName}:\n${ps.bullets.map((b) => `- ${b}`).join("\n")}`).join("\n\n")}

Write 1-2 sentences summarising the overall coaching focus for this session. Be concise and actionable. Never use emojis.`;

    const overallText = await callOpenAI(overallPrompt, "You are an expert coaching assistant. Write brief, actionable session overviews. Never use emojis.", 150, { featureType: "report", academyId: session.academyId ?? null });
    const briefText = overallText?.trim() || `Pre-session brief for ${playerSummaries.length} player${playerSummaries.length > 1 ? "s" : ""}. Review individual player notes below.`;

    return { briefText, playerSummaries };
  } catch (error) {
    console.error("[AIEngine] Error generating session brief:", error);
    return null;
  }
}
