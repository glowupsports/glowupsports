import multer from "multer";
import path from "path";
import fs from "fs";

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

const imageFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, WebP, and HEIC images are allowed."));
  }
};

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
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/webp",
      "image/heic", "image/heif", "image/svg+xml",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Invalid file type. Logo must be PNG, JPEG, WebP, HEIC, or SVG."));
  },
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
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "video/mp4", "video/quicktime", "video/mov", "video/mpeg", "video/x-m4v", "video/3gpp", "video/webm",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only video files (MP4, MOV, WebM) are allowed."));
    }
  },
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
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif",
      "video/mp4", "video/quicktime", "video/mov", "video/mpeg", "video/x-m4v", "video/3gpp", "video/webm",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images (JPEG, PNG, WebP, HEIC, GIF) and videos (MP4, MOV, WebM) are allowed."));
    }
  },
});
