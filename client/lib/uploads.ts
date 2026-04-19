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
 * - Native: uses `expo-file-system` `File` (which implements `Blob`) and the
 *   `FormData.append(name, blob, filename)` overload. Per Replit's Expo
 *   guidelines, native uploads must use `expo-file-system` `File` rather than
 *   the legacy `{ uri, name, type }` object.
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

  // Native: expo-file-system File extends/implements Blob, so it fits the
  // standard `FormData.append(name, blob, filename)` signature. Its
  // constructor only accepts URI parts, so name/type are passed via the
  // FormData call and inferred mime respectively.
  const { File } = await import("expo-file-system");
  const efsFile = new File(uri);
  form.append(field, efsFile as unknown as Blob, filename);
}
