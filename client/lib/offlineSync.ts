import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl } from "./query-client";

const OFFLINE_QUEUE_KEY = "coach_offline_queue";
const SYNC_STATUS_KEY = "coach_sync_status";
const MAX_RETRIES = 5;
const BASE_DELAY = 1000;

export interface QueuedAction {
  id: string;
  type: "attendance" | "session_update" | "session_create" | "feedback" | "note";
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
  lastError?: string;
  status: "pending" | "syncing" | "failed" | "conflict";
  conflictData?: Record<string, unknown>;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncAt?: string;
  lastError?: string;
}

let syncStatusListeners: ((status: SyncStatus) => void)[] = [];
let currentSyncStatus: SyncStatus = {
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
};

export function subscribeSyncStatus(listener: (status: SyncStatus) => void) {
  syncStatusListeners.push(listener);
  listener(currentSyncStatus);
  return () => {
    syncStatusListeners = syncStatusListeners.filter((l) => l !== listener);
  };
}

function notifySyncStatus(status: Partial<SyncStatus>) {
  currentSyncStatus = { ...currentSyncStatus, ...status };
  syncStatusListeners.forEach((l) => l(currentSyncStatus));
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const queue = await getQueue();
  return {
    ...currentSyncStatus,
    pendingCount: queue.filter((a) => a.status === "pending").length,
    failedCount: queue.filter((a) => a.status === "failed" || a.status === "conflict").length,
  };
}

async function getQueue(): Promise<QueuedAction[]> {
  try {
    const data = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  const status = await getSyncStatus();
  notifySyncStatus({ pendingCount: status.pendingCount, failedCount: status.failedCount });
}

export async function queueAction(action: Omit<QueuedAction, "id" | "createdAt" | "retries" | "status">): Promise<void> {
  const queue = await getQueue();
  const newAction: QueuedAction = {
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    retries: 0,
    status: "pending",
  };
  queue.push(newAction);
  await saveQueue(queue);
}

export async function removeAction(actionId: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((a) => a.id !== actionId);
  await saveQueue(filtered);
}

export async function clearFailedActions(): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((a) => a.status !== "failed" && a.status !== "conflict");
  await saveQueue(filtered);
}

async function processAction(action: QueuedAction): Promise<{ success: boolean; conflict?: boolean; serverData?: unknown }> {
  try {
    switch (action.type) {
      case "attendance": {
        const { sessionId, attendance } = action.payload as { sessionId: string; attendance: unknown[] };
        await apiRequest("POST", `/api/coach/sessions/${sessionId}/attendance`, { attendance });
        return { success: true };
      }
      case "session_update": {
        const { sessionId, ...data } = action.payload as { sessionId: string; [key: string]: unknown };
        await apiRequest("PATCH", `/api/coach/sessions/${sessionId}`, data);
        return { success: true };
      }
      case "session_create": {
        await apiRequest("POST", "/api/coach/sessions", action.payload);
        return { success: true };
      }
      case "feedback": {
        const { sessionId, ...feedbackData } = action.payload as { sessionId: string; [key: string]: unknown };
        await apiRequest("POST", `/api/coach/sessions/${sessionId}/feedback`, feedbackData);
        return { success: true };
      }
      case "note": {
        await apiRequest("POST", "/api/coach/notes", action.payload);
        return { success: true };
      }
      default:
        return { success: false };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.startsWith("409:") || message.toLowerCase().includes("conflict")) {
      return { success: false, conflict: true };
    }
    throw error;
  }
}

function calculateDelay(retries: number): number {
  const delay = BASE_DELAY * Math.pow(2, retries);
  const jitter = Math.random() * 1000;
  return Math.min(delay + jitter, 30000);
}

export async function processQueue(): Promise<{ processed: number; failed: number; conflicts: number }> {
  const queue = await getQueue();
  const pending = queue.filter((a) => a.status === "pending");
  
  if (pending.length === 0) {
    return { processed: 0, failed: 0, conflicts: 0 };
  }
  
  notifySyncStatus({ isSyncing: true });
  
  let processed = 0;
  let failed = 0;
  let conflicts = 0;
  
  for (const action of pending) {
    try {
      const result = await processAction(action);
      
      if (result.success) {
        await removeAction(action.id);
        processed++;
      } else if (result.conflict) {
        action.status = "conflict";
        action.conflictData = result.serverData as Record<string, unknown>;
        const updatedQueue = await getQueue();
        const idx = updatedQueue.findIndex((a) => a.id === action.id);
        if (idx >= 0) {
          updatedQueue[idx] = action;
          await saveQueue(updatedQueue);
        }
        conflicts++;
      }
    } catch (error) {
      action.retries++;
      action.lastError = error instanceof Error ? error.message : "Unknown error";
      
      if (action.retries >= MAX_RETRIES) {
        action.status = "failed";
        failed++;
      }
      
      const updatedQueue = await getQueue();
      const idx = updatedQueue.findIndex((a) => a.id === action.id);
      if (idx >= 0) {
        updatedQueue[idx] = action;
        await saveQueue(updatedQueue);
      }
      
      if (action.retries < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, calculateDelay(action.retries)));
      }
    }
  }
  
  notifySyncStatus({ 
    isSyncing: false, 
    lastSyncAt: new Date().toISOString(),
    lastError: failed > 0 ? `${failed} action(s) failed` : undefined,
  });
  
  return { processed, failed, conflicts };
}

export async function resolveConflict(
  actionId: string, 
  resolution: "use_local" | "use_server" | "discard"
): Promise<void> {
  const queue = await getQueue();
  const action = queue.find((a) => a.id === actionId);
  
  if (!action || action.status !== "conflict") {
    return;
  }
  
  switch (resolution) {
    case "use_local":
      action.status = "pending";
      action.retries = 0;
      action.conflictData = undefined;
      const updatedQueue = queue.map((a) => (a.id === actionId ? action : a));
      await saveQueue(updatedQueue);
      await processQueue();
      break;
    case "use_server":
    case "discard":
      await removeAction(actionId);
      break;
  }
}

export async function getConflicts(): Promise<QueuedAction[]> {
  const queue = await getQueue();
  return queue.filter((a) => a.status === "conflict");
}

export async function getFailedActions(): Promise<QueuedAction[]> {
  const queue = await getQueue();
  return queue.filter((a) => a.status === "failed");
}

export async function retryFailedAction(actionId: string): Promise<void> {
  const queue = await getQueue();
  const action = queue.find((a) => a.id === actionId);
  
  if (action && action.status === "failed") {
    action.status = "pending";
    action.retries = 0;
    const updatedQueue = queue.map((a) => (a.id === actionId ? action : a));
    await saveQueue(updatedQueue);
    await processQueue();
  }
}

export async function retryAllFailed(): Promise<void> {
  const queue = await getQueue();
  const updated = queue.map((a) => {
    if (a.status === "failed") {
      return { ...a, status: "pending" as const, retries: 0 };
    }
    return a;
  });
  await saveQueue(updated);
  await processQueue();
}

let syncIntervalId: ReturnType<typeof setInterval> | null = null;

export function startAutoSync(intervalMs = 30000): void {
  if (syncIntervalId) {
    return;
  }
  
  syncIntervalId = setInterval(async () => {
    if (currentSyncStatus.isOnline && !currentSyncStatus.isSyncing) {
      await processQueue();
    }
  }, intervalMs);
  
  processQueue();
}

export function stopAutoSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}

export function setOnlineStatus(isOnline: boolean): void {
  notifySyncStatus({ isOnline });
  if (isOnline && !currentSyncStatus.isSyncing) {
    processQueue();
  }
}
