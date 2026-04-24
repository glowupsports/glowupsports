import { Router, Request, Response } from "express";
import { storage } from "../storage";
import {
  createVideoFeedback,
  getVideoFeedbackById,
  getVideoFeedbackForPlayer,
  getVideoFeedbackByCoach,
  updateVideoFeedbackMessageId,
} from "../storage";
import {
  authMiddlewareWithFreshData as authMiddleware,
  requireRole,
  type AuthenticatedRequest,
} from "../auth";
import { videoFeedbackUpload, wrapUploadHandler } from "../upload-middleware";
import { sendVideoFeedbackNotification } from "../pushNotifications";
import { db } from "../db";
import {
  conversations,
  messages,
  videoFeedbackInputSchema,
} from "../../shared/schema";
import { eq } from "drizzle-orm";
import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const router = Router();

async function generateVideoThumbnail(videoPath: string, thumbnailPath: string): Promise<boolean> {
  try {
    // Use execFile (not exec) with explicit arg array to prevent shell injection.
    // Both paths are server-controlled absolute paths derived from multer's filename,
    // so no user input reaches the shell.
    await execFileAsync("ffmpeg", [
      "-i", videoPath,
      "-ss", "00:00:01",
      "-vframes", "1",
      "-q:v", "2",
      thumbnailPath,
      "-y",
    ]);
    return true;
  } catch (err) {
    console.error("[VideoFeedback] Thumbnail generation failed:", err);
    return false;
  }
}

const VIDEO_FEEDBACK_DIR = path.join(process.cwd(), "uploads", "video-feedback");

// Upload video file
router.post(
  "/api/video-feedback/upload",
  authMiddleware,
  requireRole("coach", "assistant", "academy_owner", "platform_owner"),
  wrapUploadHandler(videoFeedbackUpload.single("video"), {
    context: "VideoFeedback",
    maxBytes: 200 * 1024 * 1024,
  }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video file uploaded", code: "NO_FILE" });
      }
      const videoUrl = `/uploads/video-feedback/${req.file.filename}`;

      // Generate thumbnail from video
      let thumbnailUrl: string | null = null;
      try {
        const baseName = path.parse(req.file.filename).name;
        const thumbnailFilename = `${baseName}-thumb.jpg`;
        const thumbnailPath = path.join(VIDEO_FEEDBACK_DIR, thumbnailFilename);
        const videoPath = path.join(VIDEO_FEEDBACK_DIR, req.file.filename);
        const generated = await generateVideoThumbnail(videoPath, thumbnailPath);
        if (generated) {
          thumbnailUrl = `/uploads/video-feedback/${thumbnailFilename}`;
        }
      } catch (thumbErr) {
        console.error("[VideoFeedback] Thumbnail error:", thumbErr);
      }

      return res.json({ videoUrl, thumbnailUrl });
    } catch (err: any) {
      console.error("[VideoFeedback] Upload error:", err);
      return res.status(500).json({ error: "Upload failed", code: "UPLOAD_FAILED" });
    }
  }
);

// Create video feedback and send to player via chat
router.post(
  "/api/video-feedback",
  authMiddleware,
  requireRole("coach", "assistant", "academy_owner", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(403).json({ error: "Coach profile not found" });
      }

      const coach = await storage.getCoach(coachId);
      if (!coach) {
        return res.status(403).json({ error: "Coach profile not found" });
      }

      const parseResult = videoFeedbackInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.issues.map((e) => e.message).join("; ");
        return res.status(400).json({ error: errors });
      }

      const { playerId, sessionId, title, videoUrl, thumbnailUrl, annotations } = parseResult.data;

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Ensure coach can only send feedback to players in their academy
      if (coach.academyId && player.academyId && coach.academyId !== player.academyId) {
        return res.status(403).json({ error: "Access denied: player is not in your academy" });
      }

      const academyId = coach.academyId || player.academyId || null;

      // Create video feedback record
      const feedback = await createVideoFeedback({
        coachId: coach.id,
        playerId,
        sessionId: sessionId || null,
        academyId,
        title,
        videoUrl,
        thumbnailUrl: thumbnailUrl || null,
        annotations: annotations || [],
      });

      // Get or create coach-player conversation
      const conversation = await storage.getOrCreateCoachPlayerConversation(
        coach.id,
        playerId,
        academyId || undefined
      );

      // Create the message body with video feedback metadata
      const messageBody = JSON.stringify({
        type: "video_feedback",
        feedbackId: feedback.id,
        title,
        videoUrl,
        thumbnailUrl: thumbnailUrl || null,
        annotations: annotations || [],
      });

      // Insert message into conversation
      const [message] = await db
        .insert(messages)
        .values({
          conversationId: conversation.id,
          academyId: academyId || null,
          senderType: "coach",
          senderCoachId: coach.id,
          body: messageBody,
          messageType: "video_feedback",
        })
        .returning();

      // Update conversation last message
      await db
        .update(conversations)
        .set({
          lastMessageAt: new Date(),
          lastMessagePreview: `Video feedback: ${title}`,
        })
        .where(eq(conversations.id, conversation.id));

      // Link message to video feedback record
      await updateVideoFeedbackMessageId(feedback.id, message.id, conversation.id);

      // Send push notification to player
      try {
        await sendVideoFeedbackNotification(playerId, coach.name, title);
      } catch (notifErr) {
        console.error("[VideoFeedback] Push notification failed:", notifErr);
      }

      return res.status(201).json({
        feedback: { ...feedback, messageId: message.id, conversationId: conversation.id },
      });
    } catch (err: any) {
      console.error("[VideoFeedback] Create error:", err);
      return res.status(500).json({ error: "Failed to create video feedback" });
    }
  }
);

// Get video feedback for a player (player view - their own feedback)
router.get(
  "/api/player/me/video-feedback",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const playerId = req.user!.playerId;
      if (!playerId) {
        return res.status(403).json({ error: "Player account required" });
      }
      const feedbackList = await getVideoFeedbackForPlayer(playerId);
      return res.json(feedbackList);
    } catch (err: any) {
      console.error("[VideoFeedback] Fetch player error:", err);
      return res.status(500).json({ error: "Failed to fetch video feedback" });
    }
  }
);

// Get single video feedback by ID
router.get(
  "/api/video-feedback/:id",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const feedback = await getVideoFeedbackById(req.params.id);
      if (!feedback) {
        return res.status(404).json({ error: "Video feedback not found" });
      }

      // Check access: coach who created it, the player it was sent to,
      // or an academy_owner/platform_owner from the same academy
      const coachId = req.user!.coachId;
      const playerId = req.user!.playerId;
      const role = req.user!.role;

      const isOwner = feedback.coachId === coachId;
      const isRecipient = feedback.playerId === playerId;

      if (!isOwner && !isRecipient) {
        if (role === "platform_owner") {
          // Full access
        } else if (role === "academy_owner" && coachId) {
          // Academy owner must be in the same academy as the feedback
          const ownerCoach = await storage.getCoach(coachId);
          if (!ownerCoach || ownerCoach.academyId !== feedback.academyId) {
            return res.status(403).json({ error: "Access denied" });
          }
        } else {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      return res.json(feedback);
    } catch (err: any) {
      console.error("[VideoFeedback] Fetch error:", err);
      return res.status(500).json({ error: "Failed to fetch video feedback" });
    }
  }
);

// Get all video feedback sent by the logged-in coach
router.get(
  "/api/coach/me/video-feedback",
  authMiddleware,
  requireRole("coach", "assistant", "academy_owner", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const coachId = req.user!.coachId;
      if (!coachId) {
        return res.status(403).json({ error: "Coach profile not found" });
      }
      const feedbackList = await getVideoFeedbackByCoach(coachId);
      return res.json(feedbackList);
    } catch (err: any) {
      console.error("[VideoFeedback] Fetch coach error:", err);
      return res.status(500).json({ error: "Failed to fetch video feedback" });
    }
  }
);

// Get video feedback for a specific player (coach view)
router.get(
  "/api/players/:playerId/video-feedback",
  authMiddleware,
  requireRole("coach", "assistant", "academy_owner", "platform_owner"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const role = req.user!.role;

      // Platform owners have full access
      if (role !== "platform_owner") {
        const coachId = req.user!.coachId;
        if (!coachId) {
          return res.status(403).json({ error: "Coach profile not found" });
        }
        const coach = await storage.getCoach(coachId);
        if (!coach) {
          return res.status(403).json({ error: "Coach profile not found" });
        }
        // Ensure the player belongs to the same academy as the coach
        const player = await storage.getPlayer(playerId);
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }
        if (coach.academyId && player.academyId && coach.academyId !== player.academyId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const feedbackList = await getVideoFeedbackForPlayer(playerId);
      return res.json(feedbackList);
    } catch (err: any) {
      console.error("[VideoFeedback] Fetch player coach error:", err);
      return res.status(500).json({ error: "Failed to fetch video feedback" });
    }
  }
);

export default router;
