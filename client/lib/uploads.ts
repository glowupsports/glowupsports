import { Platform } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File as FsFile } from "expo-file-system";

/**
 * Derive a sensible filename from a local URI, defaulting to a `.jpg` name.
 */
export function filenameFromUri(uri: string): string {
  return uri.split("/").pop() || "photo.jpg";
}

/**
 * Server-side cap for Community "Moment" uploads (see
 * `SOCIAL_POST_MAX_BYTES` in `server/routes/social-features.ts`). Mirrored
 * here so the client can preflight before submitting.
 */
export const MOMENT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Target ceiling for compressed photos before upload. We aim well under the
 * 50 MB hard cap so headroom remains for HEIC originals that re-encode to
 * larger-than-expected JPEGs and so the upload itself stays fast on cellular.
 */
const PHOTO_TARGET_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Longest-edge ceiling for re-encoded photos. 2048px keeps full-screen
 * landscape detail (more than enough for a feed image) while bringing a
 * modern 12-megapixel HEIC down to a few MB at JPEG quality ~0.7.
 */
const PHOTO_MAX_EDGE = 2048;

/**
 * Quality ladder used when iteratively shrinking a photo. We start at 0.8
 * (visually indistinguishable for most content) and step down only if the
 * file is still above `PHOTO_TARGET_MAX_BYTES`.
 */
const PHOTO_QUALITY_LADDER = [0.8, 0.65, 0.5, 0.4];

/**
 * Returns the size in bytes of a local file referenced by URI, or `null` if
 * we can't determine it (e.g. the platform/scheme isn't supported). Intended
 * for cheap preflight checks before constructing FormData.
 *
 * - Native: uses `expo-file-system`'s `File(uri).size`.
 * - Web: fetches the URI (data:/blob:/http:) and reads `blob.size`.
 */
export async function getMediaSizeBytes(uri: string): Promise<number | null> {
  try {
    if (Platform.OS === "web") {
      const res = await fetch(uri);
      const blob = await res.blob();
      return typeof blob.size === "number" ? blob.size : null;
    }
    const file = new FsFile(uri);
    const size = file.size;
    return typeof size === "number" && size >= 0 ? size : null;
  } catch {
    return null;
  }
}

export type CompressImageResult = {
  uri: string;
  width: number;
  height: number;
  /** Final size in bytes, or `null` if it couldn't be measured. */
  size: number | null;
  /** True if the returned URI is a freshly re-encoded copy. */
  compressed: boolean;
};

export type CompressImageOptions = {
  /**
   * Original asset width in pixels (from e.g. `ImagePicker` result). Used to
   * choose the correct edge to resize so we don't accidentally upscale a
   * photo that's already smaller than `PHOTO_MAX_EDGE`. Optional — when
   * omitted we fall back to capping the width.
   */
  width?: number;
  /** Original asset height in pixels. */
  height?: number;
};

/**
 * Computes the resize argument for `ImageManipulatorContext.resize`.
 *
 * - If we know the source dimensions, we cap the longest edge at
 *   `PHOTO_MAX_EDGE` and skip resizing entirely when the image is already
 *   smaller (so we never upscale).
 * - If we don't know the dimensions, we cap width at `PHOTO_MAX_EDGE` as a
 *   best-effort fallback (legacy behavior).
 */
function pickResizeArg(opts?: CompressImageOptions):
  | { width?: number; height?: number }
  | null {
  const w = opts?.width;
  const h = opts?.height;
  if (typeof w === "number" && w > 0 && typeof h === "number" && h > 0) {
    const longest = Math.max(w, h);
    if (longest <= PHOTO_MAX_EDGE) return null; // already small enough
    if (w >= h) return { width: PHOTO_MAX_EDGE };
    return { height: PHOTO_MAX_EDGE };
  }
  return { width: PHOTO_MAX_EDGE };
}

/**
 * Re-encode a picked or captured photo so it sits comfortably under the
 * Community "Moment" upload cap. Caps the longest edge at `PHOTO_MAX_EDGE`
 * (without ever upscaling) and progressively lowers JPEG quality until
 * either the target size is hit or the quality ladder is exhausted.
 *
 * Returns the (possibly new) URI plus measured dimensions/size. On any
 * failure (unsupported platform, broken URI, native module hiccup) we fall
 * back to the original URI so upload still proceeds and the existing 413
 * safety net catches anything still oversized.
 */
export async function compressImageForMoment(
  uri: string,
  opts?: CompressImageOptions,
): Promise<CompressImageResult> {
  try {
    const resizeArg = pickResizeArg(opts);
    let lastResult: { uri: string; width: number; height: number } | null = null;
    let lastSize: number | null = null;

    for (const quality of PHOTO_QUALITY_LADDER) {
      const ctx = ImageManipulator.manipulate(uri);
      if (resizeArg) {
        // `resize` preserves aspect ratio when only one edge is provided.
        // Web's canvas-based fallback accepts the same signature.
        ctx.resize(resizeArg);
      }
      const image = await ctx.renderAsync();
      const saved = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: quality,
      });
      lastResult = { uri: saved.uri, width: saved.width, height: saved.height };
      lastSize = await getMediaSizeBytes(saved.uri);
      if (lastSize == null || lastSize <= PHOTO_TARGET_MAX_BYTES) {
        break;
      }
    }

    if (lastResult) {
      return {
        uri: lastResult.uri,
        width: lastResult.width,
        height: lastResult.height,
        size: lastSize,
        compressed: true,
      };
    }
  } catch {
    // Fall through to the original URI below.
  }

  const fallbackSize = await getMediaSizeBytes(uri);
  return {
    uri,
    width: opts?.width ?? 0,
    height: opts?.height ?? 0,
    size: fallbackSize,
    compressed: false,
  };
}

/**
 * Format a byte count as a short, user-facing string (e.g. "12.4 MB").
 * Returns `null` when size is unknown so callers can hide the hint cleanly.
 */
export function formatMediaSize(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

/**
 * Infer an image mime type from a filename's extension. Falls back to
 * `image/jpeg`.
 */
export function imageMimeFromFilename(filename: string): string {
  const match = /\.(\w+)$/.exec(filename);
  const ext = match ? match[1].toLowerCase().replace("jpg", "jpeg") : "jpeg";
  return `image/${ext}`;
}

/**
 * Append a picked image to FormData in the platform-correct way.
 *
 * - Web: builds a standard `File` blob from the URI (data:, blob:, or http:).
 * - Native (iOS/Android): uses the React Native FormData `{ uri, name, type }`
 *   shape, as documented in `replit.md` (`<file_uploads_and_rendering>`).
 *   RN's FormData polyfill only serializes the multipart body correctly when
 *   the value is this object shape — passing a Blob/EFS `File` instance
 *   results in an empty body (Android) or `[object Blob]` (iOS), which is
 *   why the previous EFS-File-as-Blob implementation silently failed on
 *   Android (see Task #832).
 */
export async function appendImageToFormData(
  form: FormData,
  field: string,
  uri: string,
  fallbackType = "image/jpeg",
): Promise<void> {
  const filename = filenameFromUri(uri);

  if (Platform.OS === "web") {
    const res = await fetch(uri);
    const blob = await res.blob();
    const ext = (blob.type || fallbackType).split("/")[1] || "jpg";
    const webFile = new window.File([blob], `photo.${ext}`, {
      type: blob.type || fallbackType,
    });
    form.append(field, webFile);
    return;
  }

  const type = imageMimeFromFilename(filename) || fallbackType;
  // RN FormData typings reject the `{ uri, name, type }` object literal even
  // though the runtime requires it. Cast through `any` to match the RN
  // polyfill's expected shape.
  form.append(field, { uri, name: filename, type } as any);
}

/**
 * Append a picked image OR video to FormData in the platform-correct way.
 *
 * Mirrors `appendImageToFormData` but accepts an explicit mediaType so the
 * caller can drive whether we treat the asset as an image or a video. Used by
 * the Community "Moment" upload flow which supports both.
 *
 * - Web: builds a standard `File` blob with the correct filename and mimetype
 *   so multer parses `originalname`/`mimetype` correctly (a bare Blob with no
 *   `.type` lands on the server as `application/octet-stream`, which fails the
 *   fileFilter and surfaces as a generic 500).
 * - Native (iOS/Android): uses the RN FormData `{ uri, name, type }` shape.
 */
export async function appendMediaToFormData(
  form: FormData,
  field: string,
  uri: string,
  mediaType: "image" | "video",
): Promise<void> {
  const fallbackType = mediaType === "video" ? "video/mp4" : "image/jpeg";
  const fallbackExt = mediaType === "video" ? "mp4" : "jpg";

  const rawFilename = filenameFromUri(uri);
  const hasExt = /\.[a-zA-Z0-9]+$/.test(rawFilename);
  const filename = hasExt ? rawFilename : `${mediaType === "video" ? "video" : "photo"}.${fallbackExt}`;

  if (Platform.OS === "web") {
    const res = await fetch(uri);
    const blob = await res.blob();
    const resolvedType = blob.type && blob.type !== "application/octet-stream" ? blob.type : fallbackType;
    const ext = (resolvedType.split("/")[1] || fallbackExt).split(";")[0];
    const safeName = `${mediaType === "video" ? "video" : "photo"}-${Date.now()}.${ext}`;
    const webFile = new window.File([blob], safeName, { type: resolvedType });
    form.append(field, webFile);
    return;
  }

  const inferredType =
    mediaType === "image"
      ? imageMimeFromFilename(filename) || fallbackType
      : (() => {
          const m = /\.(\w+)$/.exec(filename);
          const ext = (m ? m[1] : fallbackExt).toLowerCase();
          if (ext === "mov") return "video/quicktime";
          if (ext === "m4v") return "video/x-m4v";
          if (ext === "3gp" || ext === "3gpp") return "video/3gpp";
          if (ext === "webm") return "video/webm";
          return `video/${ext || fallbackExt}`;
        })();

  // RN FormData typings reject the `{ uri, name, type }` object literal even
  // though the runtime requires it. Cast through `any` to match the RN
  // polyfill's expected shape.
  form.append(field, { uri, name: filename, type: inferredType } as any);
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadWithProgressOptions {
  url: string;
  formData: FormData;
  headers?: Record<string, string>;
  onProgress?: (event: UploadProgress) => void;
  signal?: AbortSignal;
  withCredentials?: boolean;
}

export interface UploadWithProgressResult {
  status: number;
  ok: boolean;
  body: any;
  rawText: string;
}

/**
 * POST a multipart `FormData` body via `XMLHttpRequest`, exposing real upload
 * progress events. The `fetch` API on both web and React Native does not emit
 * upload progress, so for any flow that needs a progress bar (e.g. the
 * Community Moment media upload) we fall back to XHR.
 *
 * - Mirrors `apiFetch` semantics: passes auth headers verbatim, defaults to
 *   `withCredentials: true`, and never sets `Content-Type` (so XHR computes
 *   the multipart boundary itself).
 * - Supports cancellation through an `AbortSignal`. An aborted upload rejects
 *   with an `AbortError`-named error so callers can distinguish user-cancelled
 *   uploads from genuine network failures.
 */
export function uploadWithProgress({
  url,
  formData,
  headers,
  onProgress,
  signal,
  withCredentials = true,
}: UploadWithProgressOptions): Promise<UploadWithProgressResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let abortHandler: (() => void) | null = null;

    const cleanup = () => {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    };

    xhr.open("POST", url);

    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        if (value != null) xhr.setRequestHeader(key, value);
      }
    }

    xhr.withCredentials = withCredentials;

    if (xhr.upload && onProgress) {
      // RN/web both fire upload progress events with `{lengthComputable,
      // loaded, total}`. Type as `any` because RN's lib doesn't ship a
      // ProgressEvent global.
      xhr.upload.onprogress = (event: any) => {
        if (event && event.lengthComputable && event.total > 0) {
          const percent = Math.min(
            100,
            Math.max(0, Math.round((event.loaded / event.total) * 100)),
          );
          onProgress({ loaded: event.loaded, total: event.total, percent });
        }
      };
    }

    xhr.onload = () => {
      cleanup();
      const rawText = xhr.responseText || "";
      let body: any = null;
      if (rawText) {
        try {
          body = JSON.parse(rawText);
        } catch {
          body = null;
        }
      }
      resolve({
        status: xhr.status,
        ok: xhr.status >= 200 && xhr.status < 300,
        body,
        rawText,
      });
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error("Network error during upload"));
    };

    xhr.ontimeout = () => {
      cleanup();
      reject(new Error("Upload timed out"));
    };

    xhr.onabort = () => {
      cleanup();
      const err = new Error("Upload aborted");
      (err as any).name = "AbortError";
      reject(err);
    };

    if (signal) {
      if (signal.aborted) {
        try {
          xhr.abort();
        } catch {
          // ignore
        }
        return;
      }
      abortHandler = () => {
        try {
          xhr.abort();
        } catch {
          // ignore
        }
      };
      signal.addEventListener("abort", abortHandler);
    }

    xhr.send(formData as any);
  });
}
