import { useState, useEffect, useCallback } from "react";
import {
  SyncStatus,
  subscribeSyncStatus,
  processQueue,
  queueAction,
  getConflicts,
  getFailedActions,
  resolveConflict,
  retryFailedAction,
  retryAllFailed,
  startAutoSync,
  stopAutoSync,
  setOnlineStatus,
  QueuedAction,
} from "./offlineSync";

export function useOfflineSync() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
  });
  const [conflicts, setConflicts] = useState<QueuedAction[]>([]);
  const [failedActions, setFailedActions] = useState<QueuedAction[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus(setSyncStatus);
    startAutoSync(30000);
    
    return () => {
      unsubscribe();
      stopAutoSync();
    };
  }, []);

  useEffect(() => {
    const loadIssues = async () => {
      const [c, f] = await Promise.all([getConflicts(), getFailedActions()]);
      setConflicts(c);
      setFailedActions(f);
    };
    loadIssues();
  }, [syncStatus.pendingCount, syncStatus.failedCount]);

  const syncNow = useCallback(async () => {
    return processQueue();
  }, []);

  const queue = useCallback(
    async (type: QueuedAction["type"], payload: Record<string, unknown>) => {
      await queueAction({ type, payload });
    },
    []
  );

  const resolve = useCallback(
    async (actionId: string, resolution: "use_local" | "use_server" | "discard") => {
      await resolveConflict(actionId, resolution);
      const c = await getConflicts();
      setConflicts(c);
    },
    []
  );

  const retry = useCallback(async (actionId: string) => {
    await retryFailedAction(actionId);
    const f = await getFailedActions();
    setFailedActions(f);
  }, []);

  const retryAll = useCallback(async () => {
    await retryAllFailed();
    const f = await getFailedActions();
    setFailedActions(f);
  }, []);

  const updateOnlineStatus = useCallback((isOnline: boolean) => {
    setOnlineStatus(isOnline);
  }, []);

  return {
    syncStatus,
    conflicts,
    failedActions,
    syncNow,
    queue,
    resolve,
    retry,
    retryAll,
    updateOnlineStatus,
    hasPendingSync: syncStatus.pendingCount > 0,
    hasIssues: syncStatus.failedCount > 0 || conflicts.length > 0,
  };
}
