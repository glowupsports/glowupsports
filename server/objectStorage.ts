import { Storage } from "@google-cloud/storage";
import fs from "fs";

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";

if (!BUCKET_ID) {
  console.warn(
    "[ObjectStorage] DEFAULT_OBJECT_STORAGE_BUCKET_ID not set — uploads will fall back to local paths"
  );
}

let _storage: Storage | null = null;

function getStorage(): Storage {
  if (!_storage) _storage = new Storage();
  return _storage;
}

export function isObjectStorageEnabled(): boolean {
  return Boolean(BUCKET_ID);
}

/**
 * Upload a file from local disk to Replit Object Storage (GCS).
 * Files are stored under ".private/{subDir}/{fileName}" and are NOT
 * publicly accessible. Use resolveMediaUrl() to get a time-limited
 * signed URL for client consumption.
 *
 * @returns GCS object key of the form ".private/{subDir}/{fileName}"
 */
export async function uploadToObjectStorage(
  localPath: string,
  fileName: string,
  subDir: "technique-videos" | "technique-thumbs" | "court-screenshots" | "series-photos",
  contentType: string
): Promise<string> {
  if (!BUCKET_ID) throw new Error("Object Storage not configured");

  const objectKey = `.private/${subDir}/${fileName}`;
  const bucket = getStorage().bucket(BUCKET_ID);

  await bucket.upload(localPath, {
    destination: objectKey,
    contentType,
    metadata: { cacheControl: "private, no-store" },
  });

  // Object is under .private/ — do NOT call makePublic().
  // Access is controlled via signed URLs generated at read time.

  return objectKey;
}

/**
 * Generate a short-lived (1 hour) signed URL for a private GCS object.
 * Falls back to null if signing fails (e.g. permission not available).
 */
export async function getSignedUrl(objectKey: string, expiresMinutes = 60): Promise<string | null> {
  if (!BUCKET_ID || !objectKey) return null;
  try {
    const [url] = await getStorage()
      .bucket(BUCKET_ID)
      .file(objectKey)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + expiresMinutes * 60 * 1000,
      });
    return url;
  } catch (err) {
    console.error("[ObjectStorage] getSignedUrl failed:", err);
    return null;
  }
}

/**
 * Resolve a stored media value to a URL the client can use.
 *
 * Stored value formats:
 *   - ".private/..."     → new private GCS object → generate signed URL
 *   - "public/..."       → legacy public GCS object → return CDN URL (backward compat)
 *   - "https://storage.googleapis.com/..." → legacy full public URL → return as-is
 *   - "/uploads/..."     → legacy local file path → return as-is
 */
export async function resolveMediaUrl(storedValue: string | null): Promise<string | null> {
  if (!storedValue) return null;
  // Legacy local path — served by Express static middleware
  if (storedValue.startsWith("/uploads/")) return storedValue;
  // New private GCS object key
  if (storedValue.startsWith(".private/")) {
    return getSignedUrl(storedValue);
  }
  // Legacy public GCS object key (without bucket prefix)
  if (storedValue.startsWith("public/") && BUCKET_ID) {
    return `https://storage.googleapis.com/${BUCKET_ID}/${storedValue}`;
  }
  // Legacy full GCS URL (already a valid URL)
  if (storedValue.startsWith("https://storage.googleapis.com/")) {
    return storedValue;
  }
  return storedValue;
}

/**
 * Delete an object from Replit Object Storage.
 * Accepts either a raw object key (".private/..." or "public/...")
 * or a legacy full storage.googleapis.com URL.
 */
export async function deleteFromObjectStorage(objectKey: string): Promise<void> {
  if (!BUCKET_ID || !objectKey) return;
  try {
    await getStorage().bucket(BUCKET_ID).file(objectKey).delete();
  } catch {
    // Ignore "not found" errors
  }
}

/**
 * Extract the GCS object key from a stored media value.
 * Handles both legacy full URLs and new direct object keys.
 * Returns null if the value is not a GCS object.
 */
export function objectKeyFromUrl(storedValue: string): string | null {
  if (!storedValue) return null;
  // Direct object key formats
  if (storedValue.startsWith(".private/") || storedValue.startsWith("public/")) {
    return storedValue;
  }
  // Legacy full GCS URL
  if (BUCKET_ID) {
    const prefix = `https://storage.googleapis.com/${BUCKET_ID}/`;
    if (storedValue.startsWith(prefix)) return storedValue.slice(prefix.length);
  }
  return null;
}
