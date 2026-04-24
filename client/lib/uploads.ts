import { Platform } from "react-native";

/**
 * Derive a sensible filename from a local URI, defaulting to a `.jpg` name.
 */
export function filenameFromUri(uri: string): string {
  return uri.split("/").pop() || "photo.jpg";
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
