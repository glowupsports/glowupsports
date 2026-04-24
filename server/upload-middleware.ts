import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request, Response, NextFunction } from "express";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const COURT_PHOTOS_DIR = path.join(UPLOADS_DIR, "court-photos");
const PROFILE_PHOTOS_DIR = path.join(UPLOADS_DIR, "profile-photos");
const SOCIAL_POSTS_DIR = path.join(UPLOADS_DIR, "social-posts");
const VIDEO_FEEDBACK_DIR = path.join(UPLOADS_DIR, "video-feedback");

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(COURT_PHOTOS_DIR)) fs.mkdirSync(COURT_PHOTOS_DIR, { recursive: true });
if (!fs.existsSync(PROFILE_PHOTOS_DIR)) fs.mkdirSync(PROFILE_PHOTOS_DIR, { recursive: true });
if (!fs.existsSync(SOCIAL_POSTS_DIR)) fs.mkdirSync(SOCIAL_POSTS_DIR, { recursive: true });
if (!fs.existsSync(VIDEO_FEEDBACK_DIR)) fs.mkdirSync(VIDEO_FEEDBACK_DIR, { recursive: true });

/**
 * Thrown by `fileFilter` callbacks when a file's mimetype isn't on the
 * allowed list. `wrapUploadHandler` discriminates on this so it can return a
 * proper 415 with a stable error code, instead of multer's generic 500.
 *
 * Mirrors the per-route version in `server/routes/social-features.ts` (kept
 * around as a sibling so that file's local upload setup still type-checks).
 */
export class UnsupportedMediaTypeError extends Error {
  mimetype: string;
  allowed?: string[];
  constructor(mimetype: string, allowed?: string[]) {
    super(`Unsupported media type: ${mimetype}`);
    this.name = "UnsupportedMediaTypeError";
    this.mimetype = mimetype;
    this.allowed = allowed;
  }
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ACADEMY_LOGO_TYPES = [...IMAGE_TYPES, "image/svg+xml"];
const SOCIAL_POST_TYPES = [
  ...IMAGE_TYPES,
  "image/gif",
  "video/mp4", "video/quicktime", "video/mov", "video/mpeg",
  "video/x-m4v", "video/3gpp", "video/webm",
];
const VIDEO_FEEDBACK_TYPES = [
  "video/mp4", "video/quicktime", "video/mov", "video/mpeg",
  "video/x-m4v", "video/3gpp", "video/webm",
];

function makeMimeFilter(allowed: string[]) {
  return (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Throwing the structured error lets `wrapUploadHandler` return a 415
      // with a stable code instead of a generic 500.
      cb(new UnsupportedMediaTypeError(file.mimetype || "unknown", allowed));
    }
  };
}

const imageFilter = makeMimeFilter(IMAGE_TYPES);

export const courtPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, COURT_PHOTOS_DIR),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `court-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter,
});

export const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter,
});

export const paymentProofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFilter,
});

// Academy logo uploader — accepts SVG in addition to raster formats so owners
// can upload a vector wordmark. Stored in memory and inlined as a data URI on
// the academy record (see /api/academy/logo).
export const academyLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: makeMimeFilter(ACADEMY_LOGO_TYPES),
});

const SAFE_VIDEO_EXTENSIONS: Record<string, string> = {
  ".mp4": ".mp4", ".mov": ".mov", ".m4v": ".m4v",
  ".mpeg": ".mpeg", ".3gp": ".3gp", ".webm": ".webm",
};

export const videoFeedbackUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, VIDEO_FEEDBACK_DIR),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const rawExt = path.extname(file.originalname).toLowerCase();
      const safeExt = SAFE_VIDEO_EXTENSIONS[rawExt] || ".mp4";
      cb(null, `vf-${uniqueSuffix}${safeExt}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB limit for videos
  fileFilter: makeMimeFilter(VIDEO_FEEDBACK_TYPES),
});

export const socialPostUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, SOCIAL_POSTS_DIR),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `post-${uniqueSuffix}${path.extname(file.originalname) || ".jpg"}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: makeMimeFilter(SOCIAL_POST_TYPES),
});

type MulterMiddleware = (req: Request, res: Response, cb: (err?: unknown) => void) => void;

export interface WrapUploadOptions {
  /** Short context tag used in server logs. e.g. "ProfilePhoto", "CourtPhoto". */
  context: string;
  /** Multer field byte limit so the 413 message can quote the cap. */
  maxBytes: number;
  /** Friendly description of the cap (e.g. "5 MB"). Defaults to `${MB} MB`. */
  maxBytesLabel?: string;
}

/**
 * Wraps a multer middleware so file-size and file-type rejections come back
 * as proper 413/415 responses with a stable error code, rather than the
 * generic 500 + "Failed to upload" the client used to see. Mirrors the
 * pattern from `socialPostUploadHandler` (Task #1253) so every upload route
 * speaks the same `{ error, code }` contract.
 *
 *   413 FILE_TOO_LARGE         — multer LIMIT_FILE_SIZE
 *   415 UNSUPPORTED_MEDIA_TYPE — UnsupportedMediaTypeError from fileFilter
 *   400 + multer code          — other multer errors (LIMIT_UNEXPECTED_FILE etc)
 *   500 UPLOAD_FAILED          — anything else
 */
export function wrapUploadHandler(
  multerMiddleware: MulterMiddleware,
  options: WrapUploadOptions,
) {
  const labelMb = Math.round(options.maxBytes / (1024 * 1024));
  const friendlyMax = options.maxBytesLabel || `${labelMb} MB`;
  return function wrapped(req: Request, res: Response, next: NextFunction) {
    multerMiddleware(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          console.warn(`[${options.context}] Upload rejected: file too large`, {
            maxBytes: options.maxBytes,
            field: err.field,
          });
          return res.status(413).json({
            error: `File too large. Maximum size is ${friendlyMax}.`,
            code: "FILE_TOO_LARGE",
            maxBytes: options.maxBytes,
          });
        }
        console.warn(`[${options.context}] Multer error during upload`, {
          code: err.code,
          message: err.message,
        });
        return res.status(400).json({
          error: err.message || "Upload failed",
          code: err.code || "UPLOAD_FAILED",
        });
      }
      if (err instanceof UnsupportedMediaTypeError) {
        console.warn(`[${options.context}] Upload rejected: unsupported media type`, {
          mimetype: err.mimetype,
          allowed: err.allowed,
        });
        return res.status(415).json({
          error: "This file type isn't supported.",
          code: "UNSUPPORTED_MEDIA_TYPE",
          mimetype: err.mimetype,
        });
      }
      console.error(`[${options.context}] Unexpected upload middleware error`, err);
      return res.status(500).json({ error: "Upload failed", code: "UPLOAD_FAILED" });
    });
  };
}
