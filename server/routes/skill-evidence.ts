import { Router, Response } from "express";
import { db } from "../db";
import { skillEvidence, glowSkills, players } from "../../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { AuthenticatedRequest, authMiddlewareWithFreshData as authMiddleware, requireAcademy, validatePlayerOwnership } from "../auth";
import { storage as appStorage } from "../storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { UnsupportedMediaTypeError, wrapUploadHandler } from "../upload-middleware";

const router = Router();

// Configure multer for video uploads
const uploadDir = path.join(process.cwd(), "uploads", "evidence");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const EVIDENCE_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const EVIDENCE_MAX_BYTES = 50 * 1024 * 1024; // 50MB max

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: EVIDENCE_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (EVIDENCE_VIDEO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Throw the structured error so wrapUploadHandler returns a 415 with a
      // stable code instead of multer's generic 500.
      cb(new UnsupportedMediaTypeError(file.mimetype || "unknown", EVIDENCE_VIDEO_TYPES));
    }
  },
});

// Get player's skill evidence
router.get("/api/players/:playerId/evidence", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    const { skillId, status, limit = "50" } = req.query;
    
    // Validate player belongs to this academy
    const ownership = await validatePlayerOwnership(playerId, academyId, appStorage);
    if (!ownership.valid) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    let conditions = [eq(skillEvidence.playerId, playerId)];
    
    if (skillId) {
      conditions.push(eq(skillEvidence.skillId, skillId as string));
    }
    if (status) {
      conditions.push(eq(skillEvidence.status, status as string));
    }
    
    const evidence = await db
      .select({
        evidence: skillEvidence,
        skill: {
          id: glowSkills.id,
          name: glowSkills.name,
          pillar: glowSkills.pillar,
        },
      })
      .from(skillEvidence)
      .leftJoin(glowSkills, eq(skillEvidence.skillId, glowSkills.id))
      .where(and(...conditions))
      .orderBy(desc(skillEvidence.createdAt))
      .limit(parseInt(limit as string));
    
    res.json(evidence);
  } catch (error) {
    console.error("Error fetching evidence:", error);
    res.status(500).json({ error: "Failed to fetch evidence" });
  }
});

// Upload skill evidence video
router.post(
  "/api/players/:playerId/evidence",
  authMiddleware,
  requireAcademy,
  wrapUploadHandler(upload.single("video"), {
    context: "SkillEvidence",
    maxBytes: EVIDENCE_MAX_BYTES,
  }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { playerId } = req.params;
      const academyId = req.user!.academyId;
      const coachId = req.user!.coachId || req.user!.id;
      
      // Validate player belongs to this academy
      const ownership = await validatePlayerOwnership(playerId, academyId, appStorage);
      if (!ownership.valid) {
        return res.status(403).json({ error: "Access denied", code: "FORBIDDEN" });
      }
      
      const {
        skillId,
        sessionId,
        trialId,
        captureType,
        skillScore,
        durationSeconds = 10,
      } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ error: "No video file provided", code: "NO_FILE" });
      }
      
      if (!skillId || !captureType) {
        return res.status(400).json({
          error: "skillId and captureType are required",
          code: "MISSING_FIELDS",
        });
      }
      
      const videoUrl = `/uploads/evidence/${req.file.filename}`;
      
      const [evidence] = await db
        .insert(skillEvidence)
        .values({
          playerId,
          skillId,
          sessionId: sessionId || null,
          trialId: trialId || null,
          videoUrl,
          thumbnailUrl: null, // Could generate thumbnail later
          durationSeconds: parseInt(durationSeconds) || 10,
          captureType,
          skillScore: skillScore ? parseInt(skillScore) : null,
          capturedBy: coachId,
          status: "pending",
        })
        .returning();
      
      res.status(201).json(evidence);
    } catch (error) {
      console.error("[SkillEvidence] Error uploading evidence:", error);
      res.status(500).json({ error: "Failed to upload evidence", code: "UPLOAD_FAILED" });
    }
  }
);

// Create evidence record (for external video URLs)
router.post("/api/players/:playerId/evidence/record", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const academyId = req.user!.academyId;
    const coachId = req.user!.coachId || req.user!.id;
    
    // Validate player belongs to this academy
    const ownership = await validatePlayerOwnership(playerId, academyId, appStorage);
    if (!ownership.valid) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const {
      skillId,
      sessionId,
      trialId,
      captureType,
      skillScore,
      videoUrl,
      thumbnailUrl,
      durationSeconds = 10,
    } = req.body;
    
    if (!skillId || !captureType || !videoUrl) {
      return res.status(400).json({ error: "skillId, captureType, and videoUrl are required" });
    }
    
    const [evidence] = await db
      .insert(skillEvidence)
      .values({
        playerId,
        skillId,
        sessionId: sessionId || null,
        trialId: trialId || null,
        videoUrl,
        thumbnailUrl: thumbnailUrl || null,
        durationSeconds,
        captureType,
        skillScore: skillScore !== undefined ? skillScore : null,
        capturedBy: coachId,
        status: "pending",
      })
      .returning();
    
    res.status(201).json(evidence);
  } catch (error) {
    console.error("Error creating evidence record:", error);
    res.status(500).json({ error: "Failed to create evidence record" });
  }
});

// Review evidence (coach validation)
router.post("/api/evidence/:evidenceId/review", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { evidenceId } = req.params;
    const academyId = req.user!.academyId;
    const coachId = req.user!.coachId || req.user!.id;
    const { reviewScore, reviewNotes, approved } = req.body;
    
    // Get evidence with player info for ownership check
    const [existingEvidence] = await db
      .select({
        evidence: skillEvidence,
        playerAcademyId: players.academyId,
      })
      .from(skillEvidence)
      .leftJoin(players, eq(skillEvidence.playerId, players.id))
      .where(eq(skillEvidence.id, evidenceId));
    
    if (!existingEvidence) {
      return res.status(404).json({ error: "Evidence not found" });
    }
    
    // Validate player belongs to this academy
    if (existingEvidence.playerAcademyId !== academyId) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const [evidence] = await db
      .update(skillEvidence)
      .set({
        reviewedBy: coachId,
        reviewedAt: new Date(),
        reviewScore: reviewScore !== undefined ? reviewScore : null,
        reviewNotes: reviewNotes || null,
        status: approved ? "approved" : "rejected",
      })
      .where(eq(skillEvidence.id, evidenceId))
      .returning();
    
    res.json(evidence);
  } catch (error) {
    console.error("Error reviewing evidence:", error);
    res.status(500).json({ error: "Failed to review evidence" });
  }
});

// Get pending evidence for review (coach dashboard)
router.get("/api/evidence/pending", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const academyId = req.user!.academyId;
    
    // Get pending evidence for players in this academy
    const pendingEvidence = await db
      .select({
        evidence: skillEvidence,
        skill: {
          id: glowSkills.id,
          name: glowSkills.name,
          pillar: glowSkills.pillar,
        },
        player: {
          id: players.id,
          name: players.name,
        },
      })
      .from(skillEvidence)
      .leftJoin(glowSkills, eq(skillEvidence.skillId, glowSkills.id))
      .leftJoin(players, eq(skillEvidence.playerId, players.id))
      .where(and(
        eq(skillEvidence.status, "pending"),
        eq(players.academyId, academyId!)
      ))
      .orderBy(desc(skillEvidence.createdAt))
      .limit(50);
    
    res.json(pendingEvidence);
  } catch (error) {
    console.error("Error fetching pending evidence:", error);
    res.status(500).json({ error: "Failed to fetch pending evidence" });
  }
});

// Get evidence for a specific skill
router.get("/api/skills/:skillId/evidence", authMiddleware, requireAcademy, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { skillId } = req.params;
    const { playerId } = req.query;
    
    let conditions = [eq(skillEvidence.skillId, skillId)];
    if (playerId) {
      conditions.push(eq(skillEvidence.playerId, playerId as string));
    }
    
    const evidence = await db
      .select()
      .from(skillEvidence)
      .where(and(...conditions))
      .orderBy(desc(skillEvidence.createdAt))
      .limit(20);
    
    res.json(evidence);
  } catch (error) {
    console.error("Error fetching skill evidence:", error);
    res.status(500).json({ error: "Failed to fetch skill evidence" });
  }
});

export default router;
