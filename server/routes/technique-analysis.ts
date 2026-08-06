import { Router } from "express";
import type { Response } from "express";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  type AuthenticatedRequest,
} from "../auth";
import { techniqueAnalysisUpload, wrapUploadHandler } from "../upload-middleware";
import { db, pool } from "../db";
import { players, coaches } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import OpenAI from "openai";
import { sendPushNotification, getPlayerPushTokens } from "../pushNotifications";
import {
  uploadToObjectStorage,
  deleteFromObjectStorage,
  objectKeyFromUrl,
  isObjectStorageEnabled,
  resolveMediaUrl,
} from "../objectStorage";

const execFileAsync = promisify(execFile);
const router = Router();

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const TECHNIQUE_VIDEO_DIR = path.join(process.cwd(), "uploads", "technique-videos");
const TECHNIQUE_THUMB_DIR = path.join(process.cwd(), "uploads", "technique-thumbs");

if (!fs.existsSync(TECHNIQUE_VIDEO_DIR)) fs.mkdirSync(TECHNIQUE_VIDEO_DIR, { recursive: true });
if (!fs.existsSync(TECHNIQUE_THUMB_DIR)) fs.mkdirSync(TECHNIQUE_THUMB_DIR, { recursive: true });

// ── 90-day retention enforcement ────────────────────────────────────────────
// Runs at startup and then every 24 h. Deletes analyses (and their media)
// that are older than 90 days, honouring the UI policy shown to players.
async function purgeExpiredAnalyses(): Promise<void> {
  try {
    const rows = await pool.query<{ id: string; video_url: string | null; thumbnail_url: string | null }>(
      `SELECT id, video_url, thumbnail_url
       FROM technique_analyses
       WHERE created_at < NOW() - INTERVAL '90 days'`
    );
    for (const row of rows.rows) {
      for (const url of [row.video_url, row.thumbnail_url]) {
        if (!url) continue;
        const objKey = objectKeyFromUrl(url);
        if (objKey) {
          // Object is in GCS — delete from Object Storage
          await deleteFromObjectStorage(objKey);
        } else {
          // Legacy local file — delete from disk
          const filePath = path.join(process.cwd(), url.replace(/^\//, ""));
          try { fs.unlinkSync(filePath); } catch { /* already gone */ }
        }
      }
      // Delete any residual local frame files
      if (row.video_url) {
        const baseName = path.parse(path.basename(row.video_url)).name;
        for (let i = 0; i < 20; i++) {
          const framePath = path.join(TECHNIQUE_THUMB_DIR, `${baseName}-frame-${i}.jpg`);
          try { fs.unlinkSync(framePath); } catch { /* already gone */ }
        }
      }
    }
    if (rows.rows.length > 0) {
      await pool.query(
        `DELETE FROM technique_analyses WHERE created_at < NOW() - INTERVAL '90 days'`
      );
      console.log(`[TechniqueAnalysis] Purged ${rows.rows.length} analyses older than 90 days`);
    }
  } catch (err) {
    console.error("[TechniqueAnalysis] Retention purge failed:", err);
  }
}

// Run once at startup, then every 24 hours
purgeExpiredAnalyses();
setInterval(purgeExpiredAnalyses, 24 * 60 * 60 * 1000);

const STROKE_CHECKPOINTS: Record<string, string[]> = {
  Serve: ["Toss Accuracy", "Racket Drop", "Contact Point", "Follow Through"],
  Forehand: ["Preparation", "Unit Turn", "Contact Point", "Follow Through"],
  Backhand: ["Grip and Setup", "Shoulder Turn", "Contact Point", "Follow Through"],
  Volley: ["Ready Position", "Punch Motion", "Contact Point", "Recovery"],
  Return: ["Ready Position", "Split Step", "Contact Point", "Recovery"],
  Overhead: ["Positioning", "Trophy Position", "Contact Point", "Follow Through"],
};

async function extractFrames(videoPath: string, baseName: string, _durationSec: number): Promise<string[]> {
  // Sample every 0.5 seconds for the first 10 seconds (up to 20 frames)
  const SAMPLE_INTERVAL = 0.5;
  const ANALYSIS_WINDOW = 10;
  const framePaths: string[] = [];
  let i = 0;
  while (i * SAMPLE_INTERVAL < ANALYSIS_WINDOW) {
    const timestamp = i * SAMPLE_INTERVAL;
    const framePath = path.join(TECHNIQUE_THUMB_DIR, `${baseName}-frame-${i}.jpg`);
    try {
      await execFileAsync("ffmpeg", [
        "-ss", String(timestamp.toFixed(2)),
        "-i", videoPath,
        "-vframes", "1",
        "-q:v", "4",
        "-vf", "scale=640:-1",
        framePath,
        "-y",
      ]);
      if (fs.existsSync(framePath)) {
        framePaths.push(framePath);
      }
    } catch {
    }
    i++;
  }
  return framePaths;
}

async function generateThumbnail(videoPath: string, thumbPath: string): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", [
      "-i", videoPath,
      "-ss", "00:00:01",
      "-vframes", "1",
      "-q:v", "2",
      "-vf", "scale=640:-1",
      thumbPath,
      "-y",
    ]);
    return fs.existsSync(thumbPath);
  } catch {
    return false;
  }
}

async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const result = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      videoPath,
    ]);
    const info = JSON.parse(result.stdout);
    return parseFloat(info.format?.duration ?? "10");
  } catch {
    return 10;
  }
}

async function frameToBase64(framePath: string): Promise<string | null> {
  try {
    const buf = fs.readFileSync(framePath);
    return buf.toString("base64");
  } catch {
    return null;
  }
}

interface CheckpointResult {
  name: string;
  rating: "Good" | "Needs Work" | "Focus Area";
  explanation: string;
}

interface AnalysisResult {
  overall_score: number;
  checkpoints: CheckpointResult[];
  tips: string[];
  key_frame_timestamp: number;
  key_frame_index: number;
}

async function runAIAnalysis(
  strokeType: string,
  framePaths: string[],
  durationSec: number
): Promise<AnalysisResult> {
  const checkpointNames = STROKE_CHECKPOINTS[strokeType] ?? STROKE_CHECKPOINTS.Forehand;

  const imageContents: OpenAI.ChatCompletionContentPartImage[] = [];
  // Use all extracted frames (up to 20 at 0.5s intervals across first 10s)
  const usedFrames = framePaths.slice(0, 20);
  for (const fp of usedFrames) {
    const b64 = await frameToBase64(fp);
    if (b64) {
      imageContents.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "low" },
      });
    }
  }

  if (imageContents.length === 0) {
    return mockAnalysis(strokeType, checkpointNames, durationSec);
  }

  const systemPrompt = `You are an expert tennis coach specializing in technique analysis. Analyze the provided video frames of a player's ${strokeType} and give structured feedback. Be specific, constructive, and encouraging. Always respond with valid JSON only.`;

  const userPrompt = `Analyze these ${imageContents.length} frames from a tennis player's ${strokeType}. Evaluate the following checkpoints: ${checkpointNames.join(", ")}.

Respond with ONLY this JSON structure (no markdown, no code blocks):
{
  "overall_score": <integer 0-100>,
  "checkpoints": [
    ${checkpointNames.map(n => `{"name": "${n}", "rating": "Good|Needs Work|Focus Area", "explanation": "<one concise sentence>"}`).join(",\n    ")}
  ],
  "tips": ["<tip 1 in plain language>", "<tip 2>", "<tip 3>"],
  "key_frame_index": <index 0-${imageContents.length - 1} of the most informative frame>
}

Rating guide: "Good" = executing well, "Needs Work" = minor improvements needed, "Focus Area" = primary area to practice.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            ...imageContents,
            { type: "text", text: userPrompt },
          ],
        },
      ],
      max_completion_tokens: 800,
      temperature: 0.4,
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as AnalysisResult;

    const keyIdx = Math.max(0, Math.min(parsed.key_frame_index ?? 0, usedFrames.length - 1));
    // Frames are sampled at 0.5s intervals starting from 0s
    parsed.key_frame_timestamp = keyIdx * 0.5;

    parsed.checkpoints = checkpointNames.map((name, i) => {
      const cp = parsed.checkpoints?.[i];
      return {
        name,
        rating: (["Good", "Needs Work", "Focus Area"].includes(cp?.rating ?? "")) ? cp.rating : "Needs Work",
        explanation: cp?.explanation ?? "Keep practicing this element.",
      };
    });

    parsed.tips = (parsed.tips ?? []).slice(0, 3);
    if (parsed.tips.length < 3) {
      parsed.tips.push("Focus on consistency in your stroke mechanics.");
    }

    parsed.overall_score = Math.max(0, Math.min(100, parsed.overall_score ?? 60));
    return parsed;
  } catch (err) {
    console.error("[TechniqueAnalysis] AI error:", err);
    return mockAnalysis(strokeType, checkpointNames, durationSec);
  }
}

function mockAnalysis(strokeType: string, checkpointNames: string[], _durationSec: number): AnalysisResult {
  return {
    overall_score: 65,
    checkpoints: checkpointNames.map((name, i) => ({
      name,
      rating: i === 0 ? "Good" : i === 1 ? "Needs Work" : "Focus Area",
      explanation: i === 0 ? "Solid execution of this element." : i === 1 ? "Room for improvement here." : "This is your primary area to develop.",
    })),
    tips: [
      `Practice your ${strokeType.toLowerCase()} stance and preparation before each swing.`,
      "Film yourself regularly to track improvement over time.",
      "Focus on one element at a time — small improvements compound quickly.",
    ],
    key_frame_timestamp: 2,
    key_frame_index: 0,
  };
}

async function runAnalysisInBackground(
  analysisId: string,
  videoPath: string,
  strokeType: string,
  playerId: string,
  baseName: string,
) {
  try {
    const durationSec = await getVideoDuration(videoPath);
    const cappedDuration = Math.min(durationSec, 30);

    const framePaths = await extractFrames(videoPath, baseName, cappedDuration);

    const result = await runAIAnalysis(strokeType, framePaths, cappedDuration);

    const thumbPath = path.join(TECHNIQUE_THUMB_DIR, `${baseName}-thumb.jpg`);
    await generateThumbnail(videoPath, thumbPath);

    // Upload video and thumbnail to Replit Object Storage (GCS)
    let finalVideoUrl: string | null = null;
    let finalThumbnailUrl: string | null = null;

    if (isObjectStorageEnabled()) {
      try {
        finalVideoUrl = await uploadToObjectStorage(
          videoPath,
          path.basename(videoPath),
          "technique-videos",
          "video/mp4"
        );
        // Delete local video after successful GCS upload
        try { fs.unlinkSync(videoPath); } catch { /* already gone */ }
      } catch (uploadErr) {
        console.error("[TechniqueAnalysis] GCS video upload failed, keeping local path:", uploadErr);
        finalVideoUrl = `/uploads/technique-videos/${path.basename(videoPath)}`;
      }

      if (fs.existsSync(thumbPath)) {
        try {
          finalThumbnailUrl = await uploadToObjectStorage(
            thumbPath,
            `${baseName}-thumb.jpg`,
            "technique-thumbs",
            "image/jpeg"
          );
          // Delete local thumbnail after successful GCS upload
          try { fs.unlinkSync(thumbPath); } catch { /* already gone */ }
        } catch (uploadErr) {
          console.error("[TechniqueAnalysis] GCS thumbnail upload failed, keeping local path:", uploadErr);
          finalThumbnailUrl = `/uploads/technique-thumbs/${baseName}-thumb.jpg`;
        }
      }
    } else {
      // Object Storage not configured — fall back to local paths
      finalVideoUrl = `/uploads/technique-videos/${path.basename(videoPath)}`;
      finalThumbnailUrl = fs.existsSync(thumbPath)
        ? `/uploads/technique-thumbs/${baseName}-thumb.jpg`
        : null;
    }

    await pool.query(
      `UPDATE technique_analyses
       SET status = 'completed',
           overall_score = $1,
           checkpoints = $2,
           tips = $3,
           key_frame_timestamp = $4,
           thumbnail_url = $5,
           video_url = $6,
           completed_at = NOW()
       WHERE id = $7`,
      [
        result.overall_score,
        JSON.stringify(result.checkpoints),
        JSON.stringify(result.tips),
        result.key_frame_timestamp,
        finalThumbnailUrl,
        finalVideoUrl,
        analysisId,
      ]
    );

    for (const fp of framePaths) {
      try { fs.unlinkSync(fp); } catch {}
    }

    const tokens = await getPlayerPushTokens(playerId);
    if (tokens.length > 0) {
      await sendPushNotification(
        tokens,
        "Technique Analysis Ready",
        `Your ${strokeType} analysis is complete. Tap to see your results.`,
        { screen: "TechniqueAnalysisResult", analysisId },
        playerId,
      );
    }

    await pool.query(
      `INSERT INTO player_notifications (id, player_id, type, title, body, data, created_at)
       VALUES (gen_random_uuid(), $1, 'technique_analysis', $2, $3, $4, NOW())
       ON CONFLICT DO NOTHING`,
      [
        playerId,
        "Technique Analysis Ready",
        `Your ${strokeType} analysis is complete. Tap to see your results.`,
        JSON.stringify({ analysisId }),
      ]
    );
  } catch (err) {
    console.error("[TechniqueAnalysis] Background analysis failed:", err);
    await pool.query(
      `UPDATE technique_analyses SET status = 'failed', error_message = $1 WHERE id = $2`,
      [String(err), analysisId]
    ).catch(() => {});
  }
}

router.post(
  "/api/player/me/technique-analyses",
  authMiddleware,
  requireRole("player"),
  wrapUploadHandler(techniqueAnalysisUpload.single("video"), {
    context: "TechniqueAnalysis",
    maxBytes: 200 * 1024 * 1024,
  }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video file uploaded", code: "NO_FILE" });
      }

      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player account required" });

      const strokeType = req.body.stroke_type as string;
      if (!strokeType || !STROKE_CHECKPOINTS[strokeType]) {
        return res.status(400).json({ error: "Invalid stroke_type. Must be one of: " + Object.keys(STROKE_CHECKPOINTS).join(", ") });
      }

      // Read the player's server-backed coach-share preference (authoritative source of truth)
      const [playerRow] = await db
        .select({ shareAnalysesWithCoach: players.shareAnalysesWithCoach })
        .from(players)
        .where(eq(players.id, playerId));
      const shareWithCoachDefault = playerRow?.shareAnalysesWithCoach ?? true;

      const videoPath = path.join(TECHNIQUE_VIDEO_DIR, req.file.filename);
      const durationSec = await getVideoDuration(videoPath);
      if (durationSec > 35) {
        fs.unlinkSync(videoPath);
        return res.status(400).json({
          error: "Video is too long. Maximum clip length is 30 seconds.",
          code: "VIDEO_TOO_LONG",
          durationSec: Math.round(durationSec),
        });
      }

      const videoUrl = `/uploads/technique-videos/${req.file.filename}`;

      const result = await pool.query(
        `INSERT INTO technique_analyses (id, player_id, stroke_type, video_url, status, share_with_coach, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'processing', $4, NOW())
         RETURNING id`,
        [playerId, strokeType, videoUrl, shareWithCoachDefault]
      );

      const analysisId = result.rows[0].id as string;
      const baseName = path.parse(req.file.filename).name;

      runAnalysisInBackground(analysisId, videoPath, strokeType, playerId, baseName);

      return res.json({ analysisId, status: "processing" });
    } catch (err) {
      console.error("[TechniqueAnalysis] Upload error:", err);
      return res.status(500).json({ error: "Failed to upload video" });
    }
  }
);

router.get(
  "/api/player/me/technique-analyses",
  authMiddleware,
  requireRole("player"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player account required" });

      const rows = await pool.query(
        `SELECT id, stroke_type, status, overall_score, checkpoints, tips,
                key_frame_timestamp, thumbnail_url, video_url, share_with_coach,
                created_at, completed_at, error_message
         FROM technique_analyses
         WHERE player_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [playerId]
      );

      const byStroke: Record<string, number[]> = {};
      const analyses = rows.rows.map((row: any) => {
        if (!byStroke[row.stroke_type]) byStroke[row.stroke_type] = [];
        byStroke[row.stroke_type].push(row.overall_score ?? 0);
        return row;
      });

      // Resolve private GCS object keys to signed URLs in parallel
      const withTrend = await Promise.all(
        analyses.map(async (row: any) => {
          const scores = byStroke[row.stroke_type];
          const idx = scores.indexOf(row.overall_score ?? 0);
          let trend: "improving" | "declining" | "stable" = "stable";
          if (idx < scores.length - 1 && row.status === "completed") {
            const prev = scores[idx + 1];
            const curr = row.overall_score ?? 0;
            if (curr > prev + 3) trend = "improving";
            else if (curr < prev - 3) trend = "declining";
          }
          const [video_url, thumbnail_url] = await Promise.all([
            resolveMediaUrl(row.video_url),
            resolveMediaUrl(row.thumbnail_url),
          ]);
          return { ...row, video_url, thumbnail_url, trend };
        })
      );

      return res.json({ analyses: withTrend });
    } catch (err) {
      console.error("[TechniqueAnalysis] List error:", err);
      return res.status(500).json({ error: "Failed to fetch analyses" });
    }
  }
);

router.get(
  "/api/player/me/technique-analyses/:id",
  authMiddleware,
  requireRole("player"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player account required" });

      const { id } = req.params;
      const rows = await pool.query(
        `SELECT id, stroke_type, status, overall_score, checkpoints, tips,
                key_frame_timestamp, thumbnail_url, video_url, share_with_coach,
                created_at, completed_at, error_message
         FROM technique_analyses
         WHERE id = $1 AND player_id = $2`,
        [id, playerId]
      );

      if (rows.rows.length === 0) return res.status(404).json({ error: "Analysis not found" });
      const row = rows.rows[0];
      const [video_url, thumbnail_url] = await Promise.all([
        resolveMediaUrl(row.video_url),
        resolveMediaUrl(row.thumbnail_url),
      ]);
      return res.json({ analysis: { ...row, video_url, thumbnail_url } });
    } catch (err) {
      console.error("[TechniqueAnalysis] Get error:", err);
      return res.status(500).json({ error: "Failed to fetch analysis" });
    }
  }
);

router.patch(
  "/api/player/me/technique-analyses/:id/share",
  authMiddleware,
  requireRole("player"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player account required" });

      const { id } = req.params;
      const { shareWithCoach } = req.body as { shareWithCoach: boolean };

      await pool.query(
        `UPDATE technique_analyses SET share_with_coach = $1 WHERE id = $2 AND player_id = $3`,
        [!!shareWithCoach, id, playerId]
      );

      return res.json({ ok: true });
    } catch (err) {
      console.error("[TechniqueAnalysis] Share toggle error:", err);
      return res.status(500).json({ error: "Failed to update sharing" });
    }
  }
);

router.get(
  "/api/player/me/technique-privacy",
  authMiddleware,
  requireRole("player"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) return res.status(403).json({ error: "Player account required" });

      const [row] = await db
        .select({ shareAnalysesWithCoach: players.shareAnalysesWithCoach })
        .from(players)
        .where(eq(players.id, playerId));

      return res.json({ shareAnalysesWithCoach: row?.shareAnalysesWithCoach ?? true });
    } catch (err) {
      console.error("[TechniqueAnalysis] Technique privacy fetch error:", err);
      return res.status(500).json({ error: "Failed to fetch privacy setting" });
    }
  }
);

router.get(
  "/api/coach/players/:playerId/technique-analyses",
  authMiddleware,
  requireRole("coach", "assistant", "academy_owner", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      const { playerId } = req.params;

      const [player] = await db
        .select({ coachId: players.coachId })
        .from(players)
        .where(eq(players.id, playerId));

      const coachRecord = coachId
        ? (await db.select({ academyId: coaches.academyId }).from(coaches).where(eq(coaches.id, coachId)))[0]
        : null;

      const isAssignedCoach = player?.coachId === coachId;
      const isPlatformOwner = req.user?.role === "platform_owner";

      // Academy owners may only view players whose assigned coach belongs to their academy
      let isAcademyAdmin = false;
      if (req.user?.role === "academy_owner" && coachRecord?.academyId) {
        const [playerCoachRecord] = player?.coachId
          ? await db.select({ academyId: coaches.academyId }).from(coaches).where(eq(coaches.id, player.coachId))
          : [];
        isAcademyAdmin = playerCoachRecord?.academyId === coachRecord.academyId;
      }

      if (!isAssignedCoach && !isAcademyAdmin && !isPlatformOwner) {
        return res.status(403).json({ error: "Not authorized to view this player's analyses" });
      }

      const rows = await pool.query(
        `SELECT id, stroke_type, status, overall_score, checkpoints, tips,
                key_frame_timestamp, thumbnail_url, created_at, completed_at
         FROM technique_analyses
         WHERE player_id = $1 AND share_with_coach = true AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT 20`,
        [playerId]
      );

      // Resolve private GCS object keys to signed URLs for thumbnails
      const resolved = await Promise.all(
        rows.rows.map(async (row: any) => {
          const thumbnail_url = await resolveMediaUrl(row.thumbnail_url);
          return { ...row, thumbnail_url };
        })
      );
      return res.json({ analyses: resolved });
    } catch (err) {
      console.error("[TechniqueAnalysis] Coach view error:", err);
      return res.status(500).json({ error: "Failed to fetch analyses" });
    }
  }
);

export default router;
