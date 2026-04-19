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

async function ensureBucket() {
  if (bucketReady) return;
  const client = getClient();
  const { data: existing } = await client.storage.getBucket(BUCKET);
  if (!existing) {
    const { error } = await client.storage.createBucket(BUCKET, { public: true });
    if (error && !error.message.includes("already exists")) {
      throw new Error(`[SupabaseStorage] Failed to create bucket: ${error.message}`);
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
    throw new Error(`[SupabaseStorage] Upload failed: ${error.message}`);
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
