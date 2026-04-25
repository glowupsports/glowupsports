import { db } from "../db";
import { eq, and, desc, gte, lte, sql, count } from "drizzle-orm";
import OpenAI from "openai";
import {
  players,
  sessions,
  sessionPlayers,
  playerBallLevels,
  ballLevels,
  levelSkills,
  glowSkills,
  playerSkillScores,
  playerPillarProgress,
  inSessionFeedback,
  sessionAiSummaries,
  coaches,
  academies,
  playerMonthlyReports,
  parentPlayerRelations,
  users,
} from "@shared/schema";
import { logAiCall } from "../middleware/aiQuotaMiddleware";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function callOpenAI(
  userPrompt: string,
  systemPrompt: string,
  maxTokens: number = 400,
  context?: { userId?: string | null; featureType?: string; academyId?: string | null }
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

    if (context) {
      logAiCall({
        userId: context.userId ?? null,
        featureType: context.featureType ?? "report",
        model: "gpt-4o-mini",
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
        academyId: context.academyId ?? null,
      }).catch(() => {});
    }

    return response.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("[MonthlyReports] OpenAI call failed:", err);
    return null;
  }
}

function getMonthRange(monthYear: string): { start: Date; end: Date } {
  const [year, month] = monthYear.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);
  return { start, end };
}

export async function generateMonthlyReportForPlayer(
  playerId: string,
  monthYear: string,
  academyId?: string
): Promise<string | null> {
  try {
    const { start, end } = getMonthRange(monthYear);

    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    if (!player) {
      console.error(`[MonthlyReports] Player ${playerId} not found`);
      return null;
    }

    // The players table has no `parentUserId` column — the canonical
    // parent linkage lives in the parentPlayerRelations join table.
    {
      const parentRelations = await db
        .select()
        .from(parentPlayerRelations)
        .where(eq(parentPlayerRelations.playerId, playerId))
        .limit(1);
      if (parentRelations.length === 0) {
        console.log(`[MonthlyReports] Player ${playerId} has no linked parent — skipping`);
        return null;
      }
    }

    const playerRecords = await db
      .select({
        attendanceStatus: sessionPlayers.attendanceStatus,
        sessionId: sessionPlayers.sessionId,
      })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
      .where(
        and(
          eq(sessionPlayers.playerId, playerId),
          gte(sessions.startTime, start),
          lte(sessions.startTime, end)
        )
      );

    const sessionsTotal = playerRecords.length;
    const sessionsAttended = playerRecords.filter(
      (r) => r.attendanceStatus === "present" || r.attendanceStatus === "late"
    ).length;

    const pillarRows = await db
      .select({
        pillar: playerPillarProgress.pillar,
        currentScore: playerPillarProgress.currentScore,
        trend: playerPillarProgress.trend,
        lastUpdatedAt: playerPillarProgress.lastUpdatedAt,
      })
      .from(playerPillarProgress)
      .where(
        and(
          eq(playerPillarProgress.playerId, playerId),
          gte(playerPillarProgress.lastUpdatedAt, start),
          lte(playerPillarProgress.lastUpdatedAt, end)
        )
      );

    const pillarHighlights = pillarRows
      .sort((a, b) => (Number(b.currentScore) || 0) - (Number(a.currentScore) || 0))
      .slice(0, 3)
      .map((p) => ({
        pillar: p.pillar,
        score: Number(p.currentScore) || 0,
        trend: p.trend || "stable",
      }));

    const recentDigests = await db
      .select({ summaryText: sessionAiSummaries.summaryText })
      .from(sessionAiSummaries)
      .where(
        and(
          eq(sessionAiSummaries.playerId, playerId),
          gte(sessionAiSummaries.generatedAt, start),
          lte(sessionAiSummaries.generatedAt, end)
        )
      )
      .orderBy(desc(sessionAiSummaries.generatedAt))
      .limit(6);

    const feedbackNotes = await db
      .select({ feedbackType: inSessionFeedback.feedbackType, message: inSessionFeedback.message })
      .from(inSessionFeedback)
      .where(
        and(
          eq(inSessionFeedback.playerId, playerId),
          gte(inSessionFeedback.createdAt, start),
          lte(inSessionFeedback.createdAt, end)
        )
      )
      .orderBy(desc(inSessionFeedback.createdAt))
      .limit(10);

    const [currentLevel] = await db
      .select({ levelId: playerBallLevels.levelId })
      .from(playerBallLevels)
      .where(
        and(
          eq(playerBallLevels.playerId, playerId),
          eq(playerBallLevels.status, "active")
        )
      )
      .orderBy(desc(playerBallLevels.assignedAt))
      .limit(1);

    let nextMilestone = "Continue developing current skills";
    if (currentLevel?.levelId) {
      const [levelDetail] = await db
        // ballLevels has no `name` column; use displayNamePlayer (the
        // player-facing label like "Red 3"). Aliased as `name` to keep
        // the local variable shape unchanged.
        .select({ name: ballLevels.displayNamePlayer })
        .from(ballLevels)
        .where(eq(ballLevels.id, currentLevel.levelId));

      const requiredSkills = await db
        .select({
          skillId: levelSkills.skillId,
          skillName: glowSkills.name,
          targetScore: levelSkills.targetScore,
        })
        .from(levelSkills)
        .innerJoin(glowSkills, eq(levelSkills.skillId, glowSkills.id))
        .where(
          and(
            eq(levelSkills.levelId, currentLevel.levelId),
            eq(levelSkills.isRequired, true)
          )
        )
        .limit(10);

      if (requiredSkills.length > 0) {
        const recentScores = await db
          .select({
            skillId: playerSkillScores.skillId,
            score: playerSkillScores.score,
          })
          .from(playerSkillScores)
          .where(eq(playerSkillScores.playerId, playerId))
          .orderBy(desc(playerSkillScores.createdAt))
          .limit(50);

        const latestScoreBySkill = new Map<string, number>();
        for (const s of recentScores) {
          if (!latestScoreBySkill.has(s.skillId)) {
            latestScoreBySkill.set(s.skillId, s.score);
          }
        }

        const unmetSkills = requiredSkills.filter((rs) => {
          const latest = latestScoreBySkill.get(rs.skillId);
          if (latest === undefined) return true;
          return latest < (rs.targetScore ?? 7);
        });

        const skillsToShow = unmetSkills.length > 0 ? unmetSkills : requiredSkills;

        if (levelDetail) {
          nextMilestone = `Progress to ${levelDetail.name} level by mastering: ${skillsToShow
            .slice(0, 3)
            .map((s) => s.skillName)
            .join(", ")}`;
        }
      }
    }

    const digestsText =
      recentDigests.map((d) => `- ${d.summaryText}`).join("\n") ||
      "No session digests this month.";

    const feedbackText =
      feedbackNotes
        .slice(0, 5)
        .map((f) => `${f.feedbackType}: ${f.message}`)
        .join("; ") || "No coach notes recorded this month.";

    const pillarText =
      pillarHighlights.length > 0
        ? pillarHighlights
            .map((p) => `${p.pillar}: ${p.score.toFixed(1)}/2 (${p.trend})`)
            .join(", ")
        : "No pillar data this month.";

    const prompt = `Player: ${player.name || "Player"}, age ${player.age ?? "unknown"}, level ${currentLevel?.levelId || player.ballLevel || "unknown"}
Month: ${monthYear}
Sessions attended: ${sessionsAttended}/${sessionsTotal}
Pillar highlights: ${pillarText}

Session digests this month:
${digestsText}

Coach feedback notes: ${feedbackText}

Write a 2-3 sentence progress summary for the player's parent. Be warm, encouraging, specific, and mention attendance, one key strength, and one growth area. Write in third person. No emojis.`;

    const systemPrompt =
      "You are an expert tennis/sports coaching assistant generating monthly progress summaries for parents. Be warm, factual and encouraging. No emojis.";

    const aiProgressSummary = await callOpenAI(prompt, systemPrompt, 350, {
      featureType: "report",
      academyId: academyId ?? player.academyId,
    });

    const existingReport = await db
      .select({ id: playerMonthlyReports.id })
      .from(playerMonthlyReports)
      .where(
        and(
          eq(playerMonthlyReports.playerId, playerId),
          eq(playerMonthlyReports.monthYear, monthYear)
        )
      )
      .limit(1);

    const reportValues = {
      playerId,
      academyId: academyId ?? player.academyId ?? undefined,
      monthYear,
      sessionsAttended,
      sessionsTotal,
      pillarHighlights,
      aiProgressSummary: aiProgressSummary ?? undefined,
      nextMilestone,
      status: "draft" as const,
    };

    let reportId: string;

    if (existingReport.length > 0) {
      await db
        .update(playerMonthlyReports)
        .set({
          sessionsAttended,
          sessionsTotal,
          pillarHighlights,
          aiProgressSummary: aiProgressSummary ?? undefined,
          nextMilestone,
        })
        .where(eq(playerMonthlyReports.id, existingReport[0].id));
      reportId = existingReport[0].id;
      console.log(`[MonthlyReports] Updated report for player ${playerId}, month ${monthYear}`);
    } else {
      const [inserted] = await db
        .insert(playerMonthlyReports)
        .values(reportValues)
        .returning({ id: playerMonthlyReports.id });
      reportId = inserted.id;
      console.log(`[MonthlyReports] Created report for player ${playerId}, month ${monthYear}`);
    }

    return reportId;
  } catch (error) {
    console.error("[MonthlyReports] Error generating report:", error);
    return null;
  }
}

export async function generateMonthlyReportsForAcademy(
  academyId: string,
  monthYear: string
): Promise<{ generated: number; skipped: number }> {
  let generated = 0;
  let skipped = 0;

  try {
    // Players are linked to their parent user via the
    // `parentPlayerRelations` join table (no `parentUserId` column lives
    // on the players table itself). The parent-user check below is done
    // by intersecting against `linkedPlayerIds` populated from that table.
    const allPlayers = await db
      .select({ id: players.id })
      .from(players)
      .where(
        and(
          eq(players.academyId, academyId),
          eq(players.status, "active")
        )
      );

    const linkedPlayerIds = new Set<string>();

    const relationRows = await db
      .select({ playerId: parentPlayerRelations.playerId })
      .from(parentPlayerRelations)
      .innerJoin(players, eq(parentPlayerRelations.playerId, players.id))
      .where(eq(players.academyId, academyId));

    for (const row of relationRows) {
      linkedPlayerIds.add(row.playerId);
    }

    for (const player of allPlayers) {
      // Parent linkage is determined entirely by the
      // parentPlayerRelations join (already preloaded into
      // `linkedPlayerIds`). The legacy `parentUserId` column never
      // existed on the players table.
      const hasParent = linkedPlayerIds.has(player.id);
      if (!hasParent) {
        skipped++;
        continue;
      }

      const reportId = await generateMonthlyReportForPlayer(player.id, monthYear, academyId);
      if (reportId) {
        generated++;
      } else {
        skipped++;
      }
    }
  } catch (error) {
    console.error("[MonthlyReports] Error generating academy reports:", error);
  }

  return { generated, skipped };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getMonthLabel(monthYear: string): string {
  const [year, month] = monthYear.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function generateReportHtml(report: {
  monthYear: string;
  sessionsAttended: number;
  sessionsTotal: number;
  pillarHighlights?: { pillar: string; score: number; trend: string }[];
  aiProgressSummary?: string | null;
  nextMilestone?: string | null;
  coachNote?: string | null;
}, playerName: string, academyName: string): string {
  const monthLabel = getMonthLabel(report.monthYear);

  const attendanceRate =
    report.sessionsTotal > 0
      ? Math.round((report.sessionsAttended / report.sessionsTotal) * 100)
      : 0;

  const pillarsHtml = (report.pillarHighlights || [])
    .map(
      (p) => {
        const trendColor = p.trend === "improving" ? "#10b981" : p.trend === "declining" ? "#ef4444" : "#6b7280";
        const trendSymbol = p.trend === "improving" ? "&#9650;" : p.trend === "declining" ? "&#9660;" : "&#9670;";
        return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0;">
        <span style="font-weight:600;color:#1a1a2e;">${escapeHtml(p.pillar)}</span>
        <span style="color:#6366f1;font-weight:700;">${p.score.toFixed(1)}/2
          <span style="font-size:12px;margin-left:4px;color:${trendColor};">${trendSymbol}</span>
        </span>
      </div>`;
      }
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Monthly Report &mdash; ${escapeHtml(playerName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f7f8fc; color: #1a1a2e; }
    .page { max-width: 680px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #6366f1, #a855f7); padding: 32px 40px; color: #fff; }
    .header h1 { font-size: 26px; font-weight: 700; margin-bottom: 4px; }
    .header p { font-size: 14px; opacity: 0.85; }
    .badge { display: inline-block; background: rgba(255,255,255,0.2); border-radius: 20px; padding: 4px 14px; font-size: 13px; margin-top: 12px; }
    .body { padding: 32px 40px; }
    .section { margin-bottom: 28px; }
    .section h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; margin-bottom: 14px; }
    .stat-row { display: flex; gap: 16px; margin-bottom: 8px; }
    .stat-box { flex: 1; background: #f7f8fc; border-radius: 12px; padding: 16px; text-align: center; }
    .stat-num { font-size: 28px; font-weight: 700; color: #6366f1; }
    .stat-label { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .ai-summary { background: linear-gradient(135deg, #f0f0ff, #faf0ff); border-left: 4px solid #6366f1; border-radius: 8px; padding: 18px 20px; font-size: 15px; line-height: 1.7; color: #1a1a2e; }
    .milestone { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 18px; font-size: 14px; color: #065f46; }
    .milestone span { font-weight: 600; }
    .coach-note { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 14px 18px; font-size: 14px; color: #92400e; font-style: italic; }
    .footer { background: #f7f8fc; padding: 20px 40px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>${escapeHtml(playerName)}</h1>
      <p>${escapeHtml(academyName)}</p>
      <div class="badge">${escapeHtml(monthLabel)} Progress Report</div>
    </div>
    <div class="body">

      <div class="section">
        <h2>Attendance</h2>
        <div class="stat-row">
          <div class="stat-box">
            <div class="stat-num">${report.sessionsAttended}</div>
            <div class="stat-label">Sessions Attended</div>
          </div>
          <div class="stat-box">
            <div class="stat-num">${report.sessionsTotal}</div>
            <div class="stat-label">Total Scheduled</div>
          </div>
          <div class="stat-box">
            <div class="stat-num">${attendanceRate}%</div>
            <div class="stat-label">Attendance Rate</div>
          </div>
        </div>
      </div>

      ${
        report.aiProgressSummary
          ? `
      <div class="section">
        <h2>Progress Summary</h2>
        <div class="ai-summary">${escapeHtml(report.aiProgressSummary)}</div>
      </div>`
          : ""
      }

      ${
        (report.pillarHighlights || []).length > 0
          ? `
      <div class="section">
        <h2>Pillar Highlights</h2>
        ${pillarsHtml}
      </div>`
          : ""
      }

      ${
        report.nextMilestone
          ? `
      <div class="section">
        <h2>Next Milestone</h2>
        <div class="milestone"><span>Goal:</span> ${escapeHtml(report.nextMilestone)}</div>
      </div>`
          : ""
      }

      ${
        report.coachNote
          ? `
      <div class="section">
        <h2>Coach's Personal Note</h2>
        <div class="coach-note">&ldquo;${escapeHtml(report.coachNote)}&rdquo;</div>
      </div>`
          : ""
      }

    </div>
    <div class="footer">
      Generated by the academy's coaching platform &bull; ${escapeHtml(monthLabel)}
    </div>
  </div>
</body>
</html>`;
}

interface ReportData {
  monthYear: string;
  sessionsAttended: number;
  sessionsTotal: number;
  pillarHighlights?: { pillar: string; score: number; trend: string }[];
  aiProgressSummary?: string | null;
  nextMilestone?: string | null;
  coachNote?: string | null;
}

export function generateReportPdf(
  report: ReportData,
  playerName: string,
  academyName: string
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const PDFDocument = (await import("pdfkit")).default;
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 50, size: "A4" });

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const monthLabel = getMonthLabel(report.monthYear);
      const attendanceRate =
        report.sessionsTotal > 0
          ? Math.round((report.sessionsAttended / report.sessionsTotal) * 100)
          : 0;

      const INDIGO = "#6366f1";
      const DARK = "#1a1a2e";
      const GRAY = "#6b7280";
      const LIGHT_BG = "#f7f8fc";
      const GREEN_BG = "#065f46";
      const AMBER = "#92400e";

      doc.rect(0, 0, doc.page.width, 120).fill(INDIGO);
      doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold").text(playerName, 50, 35, { align: "left" });
      doc.fontSize(12).font("Helvetica").text(academyName, 50, 62, { align: "left" });
      doc.fontSize(11).text(`${monthLabel} Progress Report`, 50, 82, { align: "left" });
      doc.fillColor(DARK);

      let y = 145;

      doc.fontSize(9).font("Helvetica-Bold").fillColor(GRAY).text("ATTENDANCE", 50, y, { characterSpacing: 1 });
      y += 18;

      const statW = (doc.page.width - 100 - 30) / 3;
      const stats = [
        { label: "Sessions Attended", value: String(report.sessionsAttended) },
        { label: "Total Scheduled", value: String(report.sessionsTotal) },
        { label: "Attendance Rate", value: `${attendanceRate}%` },
      ];
      stats.forEach((s, i) => {
        const x = 50 + i * (statW + 15);
        doc.rect(x, y, statW, 60).fill(LIGHT_BG);
        doc.fontSize(24).font("Helvetica-Bold").fillColor(INDIGO).text(s.value, x, y + 8, { width: statW, align: "center" });
        doc.fontSize(10).font("Helvetica").fillColor(GRAY).text(s.label, x, y + 38, { width: statW, align: "center" });
      });
      doc.fillColor(DARK);
      y += 80;

      if (report.aiProgressSummary) {
        doc.fontSize(9).font("Helvetica-Bold").fillColor(GRAY).text("PROGRESS SUMMARY", 50, y, { characterSpacing: 1 });
        y += 18;
        doc.rect(50, y, doc.page.width - 100, 6).fill(INDIGO);
        y += 14;
        doc.fontSize(12).font("Helvetica").fillColor(DARK);
        const summaryHeight = doc.heightOfString(report.aiProgressSummary, { width: doc.page.width - 120 });
        doc.rect(50, y, doc.page.width - 100, summaryHeight + 24).fill("#f0f0ff");
        doc.text(report.aiProgressSummary, 62, y + 12, { width: doc.page.width - 120, align: "left" });
        y += summaryHeight + 40;
      }

      const highlights = report.pillarHighlights || [];
      if (highlights.length > 0) {
        doc.fontSize(9).font("Helvetica-Bold").fillColor(GRAY).text("PILLAR HIGHLIGHTS", 50, y, { characterSpacing: 1 });
        y += 18;
        highlights.forEach((p) => {
          const trendStr = p.trend === "improving" ? "(improving)" : p.trend === "declining" ? "(declining)" : "(stable)";
          const trendColor = p.trend === "improving" ? "#10b981" : p.trend === "declining" ? "#ef4444" : GRAY;
          doc.fontSize(11).font("Helvetica-Bold").fillColor(DARK).text(p.pillar, 50, y);
          doc.fontSize(11).font("Helvetica").fillColor(INDIGO).text(`${p.score.toFixed(1)}/2`, 300, y);
          doc.fontSize(10).font("Helvetica").fillColor(trendColor).text(trendStr, 370, y);
          doc.moveTo(50, y + 20).lineTo(doc.page.width - 50, y + 20).strokeColor("#e5e7eb").stroke();
          y += 28;
        });
        y += 10;
      }

      if (report.nextMilestone) {
        doc.fontSize(9).font("Helvetica-Bold").fillColor(GRAY).text("NEXT MILESTONE", 50, y, { characterSpacing: 1 });
        y += 18;
        const msHeight = doc.heightOfString(report.nextMilestone, { width: doc.page.width - 120 });
        doc.rect(50, y, doc.page.width - 100, msHeight + 24).fill("#f0fdf4");
        doc.fontSize(11).font("Helvetica-Bold").fillColor(GREEN_BG).text("Goal: ", 62, y + 12);
        doc.fontSize(11).font("Helvetica").fillColor(GREEN_BG).text(report.nextMilestone, 62, y + 12, { width: doc.page.width - 120 });
        y += msHeight + 40;
      }

      if (report.coachNote) {
        doc.fontSize(9).font("Helvetica-Bold").fillColor(GRAY).text("COACH'S PERSONAL NOTE", 50, y, { characterSpacing: 1 });
        y += 18;
        const noteHeight = doc.heightOfString(report.coachNote, { width: doc.page.width - 120 });
        doc.rect(50, y, doc.page.width - 100, noteHeight + 24).fill("#fff7ed");
        doc.fontSize(11).font("Helvetica-Oblique").fillColor(AMBER).text(`"${report.coachNote}"`, 62, y + 12, { width: doc.page.width - 120 });
        y += noteHeight + 40;
      }

      doc.fontSize(9).font("Helvetica").fillColor(GRAY)
        .text(`Generated by the academy's coaching platform · ${monthLabel}`, 50, doc.page.height - 60, {
          align: "center",
          width: doc.page.width - 100,
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
