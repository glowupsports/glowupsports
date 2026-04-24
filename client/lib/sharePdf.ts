import { Platform, Alert } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { StorageAccessFramework } from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import logger from "@/lib/logger";

const PRINT_TIMEOUT_MS = 20_000;
const SHARE_TIMEOUT_MS = 30_000;
const ANDROID_SHARE_SETTLE_MS = 250;
const TIMEOUT_TAG = "__sharePdf_timeout__:";

function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error) return err.message.startsWith(TIMEOUT_TAG);
  if (typeof err === "string") return err.startsWith(TIMEOUT_TAG);
  return false;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${TIMEOUT_TAG}${label}`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function safeFilename(input: string): string {
  return (input || "Invoice")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "Invoice";
}

const imagePrepCache = new Map<string, Promise<string>>();

export async function prepareImageUri(
  dataUri: string,
  filenameHint = "logo.png"
): Promise<string> {
  if (!dataUri || !dataUri.startsWith("data:")) return dataUri;
  const cacheKey = `${filenameHint}::${dataUri.length}`;
  const existing = imagePrepCache.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<string> => {
    try {
      const m = dataUri.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!m) return dataUri;
      const base64 = m[2].replace(/\s+/g, "");
      const dir = FileSystem.cacheDirectory ?? "";
      if (!dir) return dataUri;
      const target = `${dir}${filenameHint}`;
      await FileSystem.writeAsStringAsync(target, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return target;
    } catch (e: unknown) {
      logger.warn("[sharePdf] prepareImageUri failed, using inline base64:", e);
      // Drop the cached failure so a retry can attempt again.
      imagePrepCache.delete(cacheKey);
      return dataUri;
    }
  })();

  imagePrepCache.set(cacheKey, promise);
  return promise;
}

export interface SharePdfStrings {
  timeoutTitle: string;
  timeoutMessage: string;
  shareFailedTitle: string;
  shareFailedMessage: string;
  printFailedTitle: string;
  printFailedMessage: string;
  savedTitle: string;
  savedMessageWithPath: string;
  retry: string;
  saveToFiles: string;
  cancel: string;
}

const DEFAULT_STRINGS: SharePdfStrings = {
  timeoutTitle: "Taking too long",
  timeoutMessage:
    "We couldn't open the share sheet in time. You can try again or save the PDF to the app's files instead.",
  shareFailedTitle: "Couldn't share PDF",
  shareFailedMessage:
    "Sharing didn't open. You can try again or save the PDF to the app's files instead.",
  printFailedTitle: "Couldn't generate PDF",
  printFailedMessage:
    "Something went wrong while building the PDF. Please try again.",
  savedTitle: "Saved",
  savedMessageWithPath: "Saved to:\n%s",
  retry: "Try again",
  saveToFiles: "Save to Files",
  cancel: "Cancel",
};

export interface SharePdfOptions {
  html: string;
  filename: string;
  /**
   * Called on Android right before opening the share sheet so a wrapping
   * <Modal> can be hidden — this avoids cases where the system share intent
   * resolves behind the modal and the spinner never clears.
   */
  beforeShare?: () => void | Promise<void>;
  /** Called after share completes/fails to restore the wrapping modal. */
  afterShare?: () => void | Promise<void>;
  strings?: Partial<SharePdfStrings>;
}

export interface SharePdfResult {
  status: "shared" | "saved" | "cancelled";
  uri?: string;
}

async function copyToDocuments(uri: string, filename: string): Promise<string> {
  const safe = safeFilename(filename);
  const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? "";
  const target = `${dir}${safe}.pdf`;
  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {}
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

async function trySaveViaSAF(
  uri: string,
  filename: string
): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  try {
    const perm =
      await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) return null;
    const safe = safeFilename(filename);
    const destUri = await StorageAccessFramework.createFileAsync(
      perm.directoryUri,
      `${safe}.pdf`,
      "application/pdf"
    );
    const data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(destUri, data, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return destUri;
  } catch (e: unknown) {
    logger.warn("[sharePdf] SAF save failed:", e);
    return null;
  }
}

async function offerSaveFallback(
  uri: string,
  filename: string,
  strings: SharePdfStrings
): Promise<SharePdfResult> {
  if (Platform.OS === "android") {
    const saved = await trySaveViaSAF(uri, filename);
    if (saved) {
      Alert.alert(strings.savedTitle, "PDF saved successfully.");
      return { status: "saved", uri: saved };
    }
  }
  try {
    const target = await copyToDocuments(uri, filename);
    Alert.alert(
      strings.savedTitle,
      strings.savedMessageWithPath.replace("%s", target)
    );
    return { status: "saved", uri: target };
  } catch (e: unknown) {
    logger.warn("[sharePdf] copyToDocuments failed:", e);
    Alert.alert(strings.shareFailedTitle, strings.shareFailedMessage);
    return { status: "cancelled" };
  }
}

async function printToFile(
  html: string,
  strings: SharePdfStrings
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const attempt = (): void => {
      logger.log("[sharePdf] printToFileAsync starting...");
      withTimeout(
        Print.printToFileAsync({ html }),
        PRINT_TIMEOUT_MS,
        "print"
      ).then(
        (result) => {
          logger.log("[sharePdf] printed to:", result.uri);
          resolve(result.uri);
        },
        (err: unknown) => {
          const timedOut = isTimeoutError(err);
          Alert.alert(
            timedOut ? strings.timeoutTitle : strings.printFailedTitle,
            timedOut ? strings.timeoutMessage : strings.printFailedMessage,
            [
              { text: strings.cancel, style: "cancel", onPress: () => reject(err) },
              { text: strings.retry, onPress: () => attempt() },
            ],
            { cancelable: false }
          );
        }
      );
    };
    attempt();
  });
}

async function renameToFriendly(uri: string, safeName: string): Promise<string> {
  try {
    const dir = FileSystem.cacheDirectory ?? "";
    if (!dir) return uri;
    const renamed = `${dir}${safeName}.pdf`;
    if (renamed === uri) return uri;
    try {
      await FileSystem.deleteAsync(renamed, { idempotent: true });
    } catch {}
    await FileSystem.copyAsync({ from: uri, to: renamed });
    return renamed;
  } catch (e: unknown) {
    logger.warn("[sharePdf] rename failed:", e);
    return uri;
  }
}

async function shareWithRetry(
  uri: string,
  safeName: string,
  strings: SharePdfStrings,
  opts: SharePdfOptions
): Promise<SharePdfResult> {
  if (Platform.OS === "android" && opts.beforeShare) {
    try {
      await opts.beforeShare();
    } catch (e: unknown) {
      logger.warn("[sharePdf] beforeShare failed:", e);
    }
    await new Promise((r) => setTimeout(r, ANDROID_SHARE_SETTLE_MS));
  }

  try {
    await withTimeout(
      Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: safeName,
        UTI: "com.adobe.pdf",
      }),
      SHARE_TIMEOUT_MS,
      "share"
    );
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    return { status: "shared", uri };
  } catch (e: unknown) {
    const timedOut = isTimeoutError(e);
    return await new Promise<SharePdfResult>((resolve) => {
      Alert.alert(
        timedOut ? strings.timeoutTitle : strings.shareFailedTitle,
        timedOut ? strings.timeoutMessage : strings.shareFailedMessage,
        [
          {
            text: strings.cancel,
            style: "cancel",
            onPress: () => resolve({ status: "cancelled" }),
          },
          {
            text: strings.saveToFiles,
            onPress: async () => {
              try {
                resolve(await offerSaveFallback(uri, safeName, strings));
              } catch {
                resolve({ status: "cancelled" });
              }
            },
          },
          {
            text: strings.retry,
            onPress: async () => {
              try {
                resolve(await shareWithRetry(uri, safeName, strings, opts));
              } catch {
                resolve({ status: "cancelled" });
              }
            },
          },
        ],
        { cancelable: false }
      );
    });
  } finally {
    if (Platform.OS === "android" && opts.afterShare) {
      try {
        await opts.afterShare();
      } catch (e: unknown) {
        logger.warn("[sharePdf] afterShare failed:", e);
      }
    }
  }
}

export async function sharePdf(opts: SharePdfOptions): Promise<SharePdfResult> {
  const strings: SharePdfStrings = { ...DEFAULT_STRINGS, ...(opts.strings ?? {}) };
  const safeName = safeFilename(opts.filename);

  // 1) Print to file (with timeout + retry).
  const rawUri = await printToFile(opts.html, strings);

  // 2) Rename to a clean filename for share-sheet preview / saved name.
  const finalUri = await renameToFriendly(rawUri, safeName);

  // 3) Share or fall back.
  const canShare = await Sharing.isAvailableAsync().catch(() => false);
  logger.log("[sharePdf] sharing available:", canShare);
  if (!canShare) {
    return await offerSaveFallback(finalUri, safeName, strings);
  }
  return await shareWithRetry(finalUri, safeName, strings, opts);
}
