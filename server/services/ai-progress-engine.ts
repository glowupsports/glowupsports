import { db } from "../db";
import { eq, and, desc, gte } from "drizzle-orm";
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
  playerAiInsights,
  playerBaselineSkillScores,
  coaches,
  playerNotes,
} from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function callOpenAI(
  userPrompt: string,
  systemPrompt: string,
  maxTokens: number = 600
): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });
    return response.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("[AIEngine] OpenAI call failed:", err);
    return null;
  }
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

    const summary = await callOpenAI(prompt, systemPrompt, 300);
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
  _academyId: string,
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

    const response = await callOpenAI(prompt, systemPrompt, 700);
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

// ==================== AI COACHING CHAT ====================

export interface PlayerAIContext {
  playerName: string;
  playerAge: number | null;
  ballLevel: string;
  sessionType: string;
  sessionDate: string;
  coachName: string;
  requiredSkills: { skillName: string; pillar: string; targetScore: number; currentScore: number | null; required: boolean }[];
  recentDigests: string[];
  attendanceStatus: string;
  ageGroup: "young_child" | "child" | "teen" | "adult";
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

    const [coach] = await db.select({ name: coaches.name }).from(coaches).where(eq(coaches.id, coachId));

    const [playerLevel] = await db
      .select({ levelId: playerBallLevels.levelId })
      .from(playerBallLevels)
      .where(eq(playerBallLevels.playerId, playerId))
      .orderBy(desc(playerBallLevels.assignedAt))
      .limit(1);

    const ballLevel = playerLevel?.levelId || player.ballLevel || "unknown";

    const [attendance] = await db
      .select({ attendanceStatus: sessionPlayers.attendanceStatus })
      .from(sessionPlayers)
      .where(and(eq(sessionPlayers.sessionId, sessionId), eq(sessionPlayers.playerId, playerId)));

    // Get required skills for current level
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
        .where(eq(levelSkills.levelId, ballLevel))
        .limit(8);

      // Get player's current score for each skill
      for (const skill of levelSkillsList) {
        const [latestScore] = await db
          .select({ score: playerSkillScores.score, movingAverage: playerSkillScores.movingAverage })
          .from(playerSkillScores)
          .where(and(eq(playerSkillScores.playerId, playerId), eq(playerSkillScores.skillId, skill.skillId)))
          .orderBy(desc(playerSkillScores.createdAt))
          .limit(1);

        requiredSkills.push({
          skillName: skill.skillName,
          pillar: skill.pillar || "Technical",
          targetScore: skill.targetScore || 2,
          currentScore: latestScore ? Number(latestScore.movingAverage || latestScore.score) : null,
          required: skill.isRequired ?? true,
        });
      }
    }

    // Recent digests
    const recentDigests = await db
      .select({ summaryText: sessionAiSummaries.summaryText })
      .from(sessionAiSummaries)
      .where(eq(sessionAiSummaries.playerId, playerId))
      .orderBy(desc(sessionAiSummaries.generatedAt))
      .limit(3);

    // Determine age group
    const age = player.age ? Number(player.age) : null;
    let ageGroup: PlayerAIContext["ageGroup"] = "adult";
    if (age !== null) {
      if (age <= 8) ageGroup = "young_child";
      else if (age <= 12) ageGroup = "child";
      else if (age <= 17) ageGroup = "teen";
    }

    return {
      playerName: player.name,
      playerAge: age,
      ballLevel,
      sessionType: session.sessionType,
      sessionDate: session.date || new Date().toISOString().split("T")[0],
      coachName: coach?.name || "Coach",
      requiredSkills,
      recentDigests: recentDigests.map((d) => d.summaryText),
      attendanceStatus: attendance?.attendanceStatus || "present",
      ageGroup,
    };
  } catch (error) {
    console.error("[AIEngine] Error building player AI context:", error);
    return null;
  }
}

export function buildCoachingSystemPrompt(ctx: PlayerAIContext): string {
  const { playerName, playerAge, ballLevel, sessionType, ageGroup, requiredSkills, recentDigests } = ctx;

  const ageInstruction =
    ageGroup === "young_child"
      ? "Use very simple, encouraging language. Ask about fun, effort, and one concrete skill at a time. Avoid technical jargon."
      : ageGroup === "child"
      ? "Use clear, positive language with concrete examples. Focus on what they practised and how much they enjoyed it."
      : ageGroup === "teen"
      ? "Use technical tennis terms but keep it conversational. Ask about tactics, consistency and competitive play."
      : "Use professional coaching language. Ask about technical details, tactical application, and mental aspects.";

  const levelContext = `${playerName} is currently at ${ballLevel} ball level, attending a ${sessionType} session.`;

  const skillsNeeded = requiredSkills.length > 0
    ? `For the ${ballLevel} curriculum, key skills to cover: ${requiredSkills.map((s) => `${s.skillName} (${s.pillar}, current: ${s.currentScore !== null ? s.currentScore + "/2" : "not yet scored"}, target: ${s.targetScore}/2, ${s.required ? "required" : "optional"})`).join("; ")}.`
    : "";

  const digestContext = recentDigests.length > 0
    ? `Recent sessions: ${recentDigests.slice(0, 2).join(" | ")}`
    : "";

  const summaryInstruction = `After 3-6 coach exchanges, say "Here is what I'll save" and propose a JSON summary inside a code block like this:
\`\`\`json
{
  "sessionNote": "A sentence summarising what was worked on.",
  "overall": "improved",
  "effort": 2,
  "execution": 1,
  "understanding": 1,
  "skillRatings": [{"skillName": "...", "score": 1}],
  "levelUpFlag": false,
  "levelUpMessage": ""
}
\`\`\`
Values: overall = improved/stable/declined. effort/execution/understanding = 0 (attention needed), 1 (developing), 2 (good). levelUpFlag = true only if 3+ required skills were met at target score this session.`;

  return `You are a sports development AI coach assistant helping a coach log a session for ${playerName}${playerAge ? `, age ${playerAge}` : ""}.
${levelContext}
${skillsNeeded}
${digestContext}

Language rule: ${ageInstruction}
Start by asking what was the main focus of today's session.
Ask targeted follow-ups about the skills listed above — check if they were worked on and how well the player responded.
Never ask more than 2 questions at once.
Keep responses under 3 sentences per turn unless proposing the summary.
Never use emojis.
${summaryInstruction}`;
}

// ==================== PLAYER SELF AI COACH ====================

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
  coachNotes: { category: string; content: string }[];
  sessionDigests: string[];
  attendanceRate: number | null;
  totalSessions: number;
  avgEffort: number | null;
  avgExecution: number | null;
  recentStrokes: string[];
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

    // Public coach feedback
    const feedbackRows = await db
      .select({ feedbackType: inSessionFeedback.feedbackType, message: inSessionFeedback.message })
      .from(inSessionFeedback)
      .where(
        and(
          eq(inSessionFeedback.playerId, playerId),
          eq(inSessionFeedback.visibility, "public"),
          gte(inSessionFeedback.createdAt, since90)
        )
      )
      .orderBy(desc(inSessionFeedback.createdAt))
      .limit(20);
    const publicFeedback = feedbackRows.map((f) => ({ type: f.feedbackType, message: f.message }));

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
      coachNotes,
      sessionDigests,
      attendanceRate,
      totalSessions,
      avgEffort,
      avgExecution,
      recentStrokes: [...recentStrokes],
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
    skillScores, publicFeedback, coachNotes, sessionDigests,
    attendanceRate, totalSessions, avgEffort, avgExecution, recentStrokes,
  } = ctx;

  const skillLines = skillScores.length > 0
    ? skillScores
        .map((s) => `${s.skillName} (${s.pillar}): ${s.movingAverage !== null ? s.movingAverage.toFixed(1) : s.score}/2`)
        .join(", ")
    : "no skill data recorded yet";

  const feedbackLines = publicFeedback.length > 0
    ? publicFeedback.slice(0, 8).map((f) => `[${f.type}] ${f.message}`).join("; ")
    : "no public feedback yet";

  const noteLines = coachNotes.length > 0
    ? coachNotes.slice(0, 5).map((n) => `[${n.category}] ${n.content}`).join("; ")
    : "no coach notes yet";

  const digestLines = sessionDigests.length > 0
    ? sessionDigests.slice(0, 3).join(" | ")
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

RECENT COACH FEEDBACK (public):
${feedbackLines}

COACH NOTES:
${noteLines}

RECENT SESSION SUMMARIES:
${digestLines}

GREETING INSTRUCTION:
When the user's first message is exactly "__greeting__", respond with a warm, personalised opening message that:
1. Greets ${playerName} by first name
2. Mentions their current ball level or XP level
3. Calls out 1-2 specific recent focus areas drawn from coach feedback, notes, or strokes worked on (use real data)
4. Invites them to ask anything about their game
Keep the greeting to 3-4 sentences — warm, specific, and motivating.

RULES FOR YOUR RESPONSES:
- Speak directly to ${playerName} in second person ("You", "Your")
- Be encouraging, specific, and action-oriented
- Reference real data from above (skill scores, feedback, notes, goals) in your answers
- Never make up skill scores or feedback that is not listed above
- If data is missing for a question, acknowledge it and give helpful general tennis advice
- Keep responses conversational — 2-4 sentences unless the player asks for more detail
- Do not use emojis
- If the player asks about a skill, refer to their actual score if available
- Focus on helping them improve — be their personal coach and biggest supporter
- Never reveal the raw data format; weave data naturally into coaching language`;
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
