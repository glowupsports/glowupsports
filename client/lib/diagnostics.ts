import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import logger from "./logger";
import { getApiUrl } from "./query-client";
import { getAuthToken } from "./auth";

const PRODUCTION_FALLBACK_URL = "https://glow-up-sports--ltvjeugd.replit.app";
const PENDING_KEY = "pending_diagnostics";
const QUEUE_CAP = 5;
const SEND_TIMEOUT_MS = 10_000;
const DIAGNOSTICS_PATH = "/api/diagnostics/report";

export type DiagnosticsPayload = {
  errorId: string;
  message: string;
  stack?: string;
  severity: string;
  platform: string;
  appVersion: string;
  deviceInfo: string;
  context: Record<string, unknown>;
  userComment?: string;
};

function resolveDiagnosticsUrl(): string {
  let base = PRODUCTION_FALLBACK_URL;
  try {
    const apiUrl = getApiUrl();
    if (apiUrl && /^https?:\/\//.test(apiUrl)) {
      base = apiUrl;
    } else {
      console.warn("[Diagnostics] getApiUrl() returned invalid value, using production fallback");
    }
  } catch (err) {
    console.warn("[Diagnostics] getApiUrl() threw, using production fallback:", err);
  }
  try {
    return new URL(DIAGNOSTICS_PATH, base).toString();
  } catch (err) {
    console.warn("[Diagnostics] new URL() threw, using string concat fallback:", err);
    const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${trimmed}${DIAGNOSTICS_PATH}`;
  }
}

export function buildDiagnosticsPayload(args: {
  error: Error;
  errorId: string;
  userComment?: string;
}): DiagnosticsPayload {
  const { error, errorId, userComment } = args;
  return {
    errorId,
    message: error.message,
    stack: error.stack,
    severity: "error",
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version || "unknown",
    deviceInfo: Device.modelName || "unknown",
    context: {
      platform: Platform.OS,
      osVersion: Platform.Version,
      deviceBrand: Device.brand,
      deviceModel: Device.modelName,
      isDevice: Device.isDevice,
      expoVersion: Constants.expoConfig?.sdkVersion,
      appVersion: Constants.expoConfig?.version,
      timestamp: new Date().toISOString(),
    },
    userComment: userComment?.trim() || undefined,
  };
}

export async function sendDiagnosticsReport(
  payload: DiagnosticsPayload,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = resolveDiagnosticsUrl();
  const token = getAuthToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.ok) return { ok: true, status: response.status };

    let body = "";
    try {
      body = await response.text();
    } catch {}
    return {
      ok: false,
      status: response.status,
      error: body || `HTTP ${response.status}`,
    };
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    const isAbort = e?.name === "AbortError";
    return {
      ok: false,
      error: isAbort ? "Request timed out after 10s" : e?.message || "Network error",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function queueDiagnosticsReport(payload: DiagnosticsPayload): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    const queue: DiagnosticsPayload[] = raw ? JSON.parse(raw) : [];
    queue.push(payload);
    const trimmed = queue.slice(-QUEUE_CAP);
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.warn("[Diagnostics] Failed to queue report:", err);
  }
}

export async function drainPendingDiagnostics(): Promise<void> {
  let queue: DiagnosticsPayload[] = [];
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return;
    queue = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) {
      await AsyncStorage.removeItem(PENDING_KEY);
      return;
    }
  } catch (err) {
    console.warn("[Diagnostics] Failed to read pending queue:", err);
    return;
  }

  const remaining: DiagnosticsPayload[] = [];
  for (const payload of queue) {
    const result = await sendDiagnosticsReport(payload);
    if (!result.ok) remaining.push(payload);
  }

  try {
    if (remaining.length === 0) {
      await AsyncStorage.removeItem(PENDING_KEY);
      logger.log(`[Diagnostics] Drained ${queue.length} queued report(s)`);
    } else {
      await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
      logger.log(
        `[Diagnostics] Drained ${queue.length - remaining.length}/${queue.length}; ${remaining.length} remain queued`,
      );
    }
  } catch (err) {
    console.warn("[Diagnostics] Failed to update pending queue after drain:", err);
  }
}
