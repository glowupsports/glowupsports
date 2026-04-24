import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "social-posts";

let supabase: ReturnType<typeof createClient> | null = null;
let bucketReady = false;

function getClient() {
  if (!supabase) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("[SupabaseStorage] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

/**
 * Error thrown by Supabase storage helpers. Carries a stable `code` and the
 * underlying Supabase status code so route handlers can map to an
 * appropriate HTTP status without leaking Supabase internals to the client.
 */
export class SupabaseStorageError extends Error {
  code: "BUCKET_UNAVAILABLE" | "UPLOAD_FAILED";
  statusCode?: number;
  details?: string;
  constructor(
    message: string,
    code: "BUCKET_UNAVAILABLE" | "UPLOAD_FAILED",
    opts?: { statusCode?: number; details?: string },
  ) {
    super(message);
    this.name = "SupabaseStorageError";
    this.code = code;
    this.statusCode = opts?.statusCode;
    this.details = opts?.details;
  }
}

async function ensureBucket() {
  if (bucketReady) return;
  const client = getClient();
  const { data: existing, error: getErr } = await client.storage.getBucket(BUCKET);

  // `getBucket` returns an error for non-existent buckets ("Bucket not found").
  // Treat that as "needs creating" rather than fatal.
  const notFound =
    !!getErr &&
    (getErr.message?.toLowerCase().includes("not found") ||
      (getErr as { statusCode?: number }).statusCode === 404);

  if (!existing || notFound) {
    const { error } = await client.storage.createBucket(BUCKET, { public: true });
    if (error) {
      const msg = error.message || "";
      // Race / pre-existing bucket — not fatal.
      if (!msg.toLowerCase().includes("already exists") && !msg.toLowerCase().includes("duplicate")) {
        const errWithMeta = error as { message: string; statusCode?: number; name?: string };
        console.error("[SupabaseStorage] Failed to create bucket", {
          bucket: BUCKET,
          message: errWithMeta.message,
          name: errWithMeta.name,
          statusCode: errWithMeta.statusCode,
        });
        throw new SupabaseStorageError(
          `Failed to ensure storage bucket: ${errWithMeta.message}`,
          "BUCKET_UNAVAILABLE",
          { statusCode: errWithMeta.statusCode, details: errWithMeta.message },
        );
      }
    }
  } else if (!existing.public) {
    await client.storage.updateBucket(BUCKET, { public: true });
  }
  bucketReady = true;
}

export async function uploadToSupabase(
  fileBuffer: Buffer,
  originalName: string,
  mimetype: string
): Promise<string> {
  await ensureBucket();
  const client = getClient();

  const ext = originalName.includes(".")
    ? originalName.substring(originalName.lastIndexOf("."))
    : mimetype.includes("video") ? ".mp4" : ".jpg";
  const filename = `post-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

  const { error } = await client.storage
    .from(BUCKET)
    .upload(filename, fileBuffer, {
      contentType: mimetype,
      upsert: false,
    });

  if (error) {
    const errWithMeta = error as { message: string; name?: string; statusCode?: number };
    console.error("[SupabaseStorage] Upload failed", {
      bucket: BUCKET,
      filename,
      mimetype,
      bufferSize: fileBuffer?.length,
      message: errWithMeta.message,
      name: errWithMeta.name,
      statusCode: errWithMeta.statusCode,
    });
    throw new SupabaseStorageError(
      `Upload failed: ${errWithMeta.message}`,
      "UPLOAD_FAILED",
      { statusCode: errWithMeta.statusCode, details: errWithMeta.message },
    );
  }

  const { data } = client.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

export async function uploadToSupabaseWithPath(
  fileBuffer: Buffer,
  storagePath: string,
  mimetype: string
): Promise<string> {
  await ensureBucket();
  const client = getClient();

  const { error } = await client.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: mimetype,
      upsert: true,
    });

  if (error) {
    // Supabase StorageError exposes name/statusCode but the typed surface is
    // narrow; widen via a typed structural type rather than `any`.
    const errWithMeta = error as { message: string; name?: string; statusCode?: number };
    console.error("[SupabaseStorage] Upload failed", {
      bucket: BUCKET,
      storagePath,
      mimetype,
      bufferSize: fileBuffer?.length,
      message: errWithMeta.message,
      name: errWithMeta.name,
      statusCode: errWithMeta.statusCode,
    });
    throw new Error(`[SupabaseStorage] Upload failed: ${errWithMeta.message}`);
  }

  const { data } = client.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function uploadFileToSupabase(filePath: string, originalName: string, mimetype: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  return uploadToSupabase(buffer, originalName, mimetype);
}

export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}
