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
