import { Platform, Alert } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import logger from "@/lib/logger";

const PRINT_TIMEOUT_MS = 30_000;
const SHARE_TIMEOUT_MS = 60_000;
const ANDROID_SHARE_SETTLE_MS = 250;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`__timeout__:${label}`));
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
    } catch (e) {
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
    "We couldn't open the share sheet in time. We can save the PDF to the app's files instead.",
  shareFailedTitle: "Couldn't share PDF",
  shareFailedMessage:
    "Sharing didn't open. We can save the PDF to the app's files instead.",
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
  try {
    if (Platform.OS !== "android") return null;
    const SAF: any = (FileSystem as any).StorageAccessFramework;
    if (!SAF) return null;
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm?.granted) return null;
    const safe = safeFilename(filename);
    const destUri = await SAF.createFileAsync(
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
  } catch (e) {
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
  } catch (e) {
    logger.warn("[sharePdf] copyToDocuments failed:", e);
    Alert.alert(strings.shareFailedTitle, strings.shareFailedMessage);
    return { status: "cancelled" };
  }
}

export async function sharePdf(opts: SharePdfOptions): Promise<SharePdfResult> {
  const strings: SharePdfStrings = { ...DEFAULT_STRINGS, ...(opts.strings ?? {}) };
  const safeName = safeFilename(opts.filename);

  let uri: string;
  try {
    logger.log("[sharePdf] printToFileAsync starting...");
    const result = await withTimeout(
      Print.printToFileAsync({ html: opts.html }),
      PRINT_TIMEOUT_MS,
      "print"
    );
    uri = result.uri;
    logger.log("[sharePdf] printed to:", uri);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const isTimeout = msg.startsWith("__timeout__:");
    Alert.alert(
      isTimeout ? strings.timeoutTitle : strings.printFailedTitle,
      isTimeout ? strings.timeoutMessage : strings.printFailedMessage
    );
    throw e;
  }

  // Rename for nicer share-sheet preview / saved filename.
  let finalUri = uri;
  try {
    const dir = FileSystem.cacheDirectory ?? "";
    if (dir) {
      const renamed = `${dir}${safeName}.pdf`;
      if (renamed !== uri) {
        try {
          await FileSystem.deleteAsync(renamed, { idempotent: true });
        } catch {}
        await FileSystem.copyAsync({ from: uri, to: renamed });
        finalUri = renamed;
      }
    }
  } catch (e) {
    logger.warn("[sharePdf] rename failed:", e);
  }

  const canShare = await Sharing.isAvailableAsync().catch(() => false);
  logger.log("[sharePdf] sharing available:", canShare);
  if (!canShare) {
    return await offerSaveFallback(finalUri, safeName, strings);
  }

  if (Platform.OS === "android" && opts.beforeShare) {
    try {
      await opts.beforeShare();
    } catch (e) {
      logger.warn("[sharePdf] beforeShare failed:", e);
    }
    await new Promise((r) => setTimeout(r, ANDROID_SHARE_SETTLE_MS));
  }

  try {
    await withTimeout(
      Sharing.shareAsync(finalUri, {
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
    return { status: "shared", uri: finalUri };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const isTimeout = msg.startsWith("__timeout__:");
    return await new Promise<SharePdfResult>((resolve) => {
      Alert.alert(
        isTimeout ? strings.timeoutTitle : strings.shareFailedTitle,
        isTimeout ? strings.timeoutMessage : strings.shareFailedMessage,
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
                resolve(await offerSaveFallback(finalUri, safeName, strings));
              } catch {
                resolve({ status: "cancelled" });
              }
            },
          },
        ]
      );
    });
  } finally {
    if (Platform.OS === "android" && opts.afterShare) {
      try {
        await opts.afterShare();
      } catch (e) {
        logger.warn("[sharePdf] afterShare failed:", e);
      }
    }
  }
}
