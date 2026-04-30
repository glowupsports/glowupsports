import logger from "@/lib/logger";
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { InteractionManager, Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl, getAuthHeaders, setActivePlayerOverride } from "@/lib/query-client";
// Task #1455 — `deferredHydrateAndPersist` is no longer wired into the
// active-player switch path. The persisted god-cache replay was a
// player-only extra that coach/admin/owner roles never ran; on iOS
// Fabric it stalled the JS bridge during cold start and tab-switch.
// `clearGodCache` is still called when switching family member so any
// snapshot from a previous child can't bleed into the next one.
import {
  clearGodCache,
} from "@/lib/queryCachePersist";

// Task #1455 — defer the family bootstrap fetch off the cold-start
// critical path. FamilyProvider mounts above EVERY player tab (see
// PlayerNavigator.tsx) so without this, its useEffect fired its
// network call (/api/family/me/group + /api/family/status) on the
// same JS-bridge tick that the home god-query is competing for.
// Coach has no equivalent and loads instantly. We mirror the same
// InteractionManager-or-timeout pattern queryCachePersist used for
// hydrate. Idempotent: the per-call `ran` flag means both paths
// firing collapse to a single setReady.
const FAMILY_BOOTSTRAP_DEFER_MS = Platform.OS === "ios" ? 600 : 50;

function scheduleAfterPaint(flipFn: () => void): () => void {
  let ran = false;
  const flip = () => {
    if (ran) return;
    ran = true;
    flipFn();
  };
  let interactionHandle: { cancel: () => void } | null = null;
  try {
    interactionHandle = InteractionManager.runAfterInteractions(flip);
  } catch {
    // RN web shim sometimes throws — the timeout below covers it.
  }
  const timeoutId = setTimeout(flip, FAMILY_BOOTSTRAP_DEFER_MS);
  return () => {
    clearTimeout(timeoutId);
    try {
      interactionHandle?.cancel();
    } catch {
      // ignore
    }
  };
}

export interface FamilyMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  ballLevel: string | null;
  nextSession: {
    date: string;
    type: string;
  } | null;
  outstandingBalance: number;
  lastActiveAt: string | null;
  chatEnabled: boolean | null;
  communityEnabled: boolean | null;
  // Family G — Task #1138 — graduation surface fields. Server attaches these
  // to /api/family/me/group; null when DOB unknown.
  dateOfBirth?: string | null;
  daysUntilEighteen?: number | null;
  graduated?: boolean;
  graduatedAt?: string | null;
}

interface FamilyData {
  parentEmail: string;
  members: FamilyMember[];
  outstandingTotal: number;
  isCallerParent?: boolean;
  // Symmetric family-group fields, sourced from /api/family/me/group.
  familyGroupId?: string | null;
  creatorPlayerId?: string | null;
  creatorName?: string | null;
  creatorEmail?: string | null;
}

interface FamilyContextType {
  isFamily: boolean;
  isLoading: boolean;
  familyData: FamilyData | null;
  activePlayerId: string | null;
  isParent: boolean;
  // True when the caller belongs to a family (single-member groups count).
  // In the symmetric model every member can add/remove. Use `isParent` only
  // for legacy parental-controls UI; use `isFamilyMember` for the new
  // member-management surfaces (Add Player, invite, etc.).
  isFamilyMember: boolean;
  isFamilyCreator: boolean;
  setActivePlayer: (playerId: string) => void;
  refreshFamily: () => Promise<void>;
  setFamilyData: (data: FamilyData | null) => void;
  clearFamily: () => void;
}

// Top-level shape returned by /api/family/status. The endpoint always reports
// whether the caller is a parent — even when isFamily is false — so the UI can
// gate parent-only actions independently of having a populated family.
interface FamilyStatusResponse {
  isFamily: boolean;
  isCallerParent?: boolean;
  family?: FamilyData;
}

const FamilyContext = createContext<FamilyContextType | undefined>(undefined);

interface FamilyProviderProps {
  children: ReactNode;
  playerId?: string | null;
}

export function FamilyProvider({ children, playerId }: FamilyProviderProps) {
  const [familyData, setFamilyData] = useState<FamilyData | null>(null);
  const [callerIsParent, setCallerIsParent] = useState<boolean>(false);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);
  const queryClient = useQueryClient();
  const mountedRef = useRef(true);

  // Parent status survives an empty `familyData` so the empty state can
  // still gate parent-only actions correctly. `isParent` is preserved for
  // legacy parental-controls UI; for member management use `isFamilyMember`.
  const isParent = callerIsParent || familyData?.isCallerParent === true;
  // The caller is a family member whenever the family endpoint reports them
  // as one. Solo players are a family of one (auto-created at /me/group).
  const isFamilyMember = familyData !== null;
  const isFamilyCreator =
    !!familyData?.creatorPlayerId &&
    !!playerId &&
    familyData.creatorPlayerId === playerId;
  // isFamily is true when there are multiple members OR when the caller is a parent
  // who can manage a family (even before any children are linked)
  const isFamily = familyData !== null && (familyData.members.length > 1 || isParent);

  const setActivePlayer = useCallback((newPlayerId: string) => {
    const outgoingPlayerId = activePlayerId;
    setActivePlayerId(newPlayerId);
    if (newPlayerId !== playerId) {
      setActivePlayerOverride(newPlayerId);
    } else {
      setActivePlayerOverride(null);
    }
    // Task #1387 — wipe persisted god-cache for the OUTGOING family
    // member before the new one mounts, otherwise the next cold start
    // could hydrate the wrong child's data into the active session.
    // Fire-and-forget: cancellation token in queryCachePersist already
    // guarantees no in-flight hydrate can race past this clear.
    void clearGodCache(outgoingPlayerId ?? undefined);
    queryClient.clear();

    // Task #1455 — `deferredHydrateAndPersist` removed. We no longer
    // replay the persisted god-cache for the new member; the home /
    // profile / progress god-queries refetch from the server on first
    // mount, which on iOS Fabric is faster (and far more predictable)
    // than the AsyncStorage read + cache replay it used to do. The
    // `clearGodCache` above is still important so any leftover blob
    // for the outgoing member doesn't bleed into the next cold start.
  }, [queryClient, playerId, activePlayerId]);

  const refreshFamily = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);

      // /api/family/me/group is the authoritative source for membership in
      // the symmetric model. /api/family/status is fetched in parallel only
      // to enrich each member with legacy data (outstanding balances + the
      // legacy isCallerParent gate that drives the parental-controls UI).
      const [groupResp, statusResp] = await Promise.all([
        fetch(`${getApiUrl()}/api/family/me/group`, {
          method: "GET",
          headers: getAuthHeaders(),
          credentials: "include",
        }),
        fetch(`${getApiUrl()}/api/family/status`, {
          method: "GET",
          headers: getAuthHeaders(),
          credentials: "include",
        }).catch(() => null),
      ]);

      if (!mountedRef.current) return false;

      if (groupResp.status === 401) {
        logger.log("[FamilyContext] Auth not ready yet");
        return false;
      }

      if (!groupResp.ok) {
        logger.log("[FamilyContext] /me/group request failed:", groupResp.status);
        setFamilyData(null);
        setCallerIsParent(false);
        setHasFetched(true);
        return true;
      }

      const groupJson = await groupResp.json();
      const groupMembers: FamilyMember[] = Array.isArray(groupJson?.members)
        ? (groupJson.members as FamilyMember[])
        : [];

      // Pull legacy supplemental data. A non-OK response here is fine — we
      // simply lose the per-member balances and parent flag until the
      // legacy endpoints are decommissioned.
      let statusData: FamilyStatusResponse | null = null;
      if (statusResp && statusResp.ok) {
        try {
          statusData = (await statusResp.json()) as FamilyStatusResponse;
        } catch (e) {
          logger.log("[FamilyContext] /api/family/status parse failed:", e);
        }
      }

      if (!mountedRef.current) return false;

      setHasFetched(true);
      setCallerIsParent(
        statusData?.isCallerParent === true || statusData?.family?.isCallerParent === true,
      );

      if (groupMembers.length === 0) {
        setFamilyData(null);
        if (playerId) setActivePlayerId(playerId);
        return true;
      }

      // Enrich each /me/group member with the matching balance/etc from the
      // legacy /status payload (when available). Members from /me/group
      // remain the source of truth for the roster.
      const statusById = new Map<string, FamilyMember>();
      for (const m of statusData?.family?.members ?? []) {
        statusById.set(m.id, m);
      }
      const enrichedMembers: FamilyMember[] = groupMembers.map((m) => {
        const supplemental = statusById.get(m.id);
        if (!supplemental) return m;
        return {
          ...m,
          outstandingBalance: supplemental.outstandingBalance ?? m.outstandingBalance,
          nextSession: supplemental.nextSession ?? m.nextSession,
          chatEnabled: supplemental.chatEnabled ?? m.chatEnabled,
          communityEnabled: supplemental.communityEnabled ?? m.communityEnabled,
          lastActiveAt: supplemental.lastActiveAt ?? m.lastActiveAt,
        };
      });

      const family: FamilyData = {
        parentEmail:
          statusData?.family?.parentEmail ??
          (groupJson?.group?.creatorEmail ?? ""),
        members: enrichedMembers,
        outstandingTotal: statusData?.family?.outstandingTotal ?? 0,
        isCallerParent: statusData?.family?.isCallerParent ?? false,
        familyGroupId: groupJson?.group?.id ?? null,
        creatorPlayerId: groupJson?.group?.createdByPlayerId ?? null,
        creatorName: groupJson?.group?.creatorName ?? null,
        creatorEmail: groupJson?.group?.creatorEmail ?? null,
      };

      setFamilyData(family);
      setActivePlayerId((prev) => {
        if (prev && family.members.some((m: FamilyMember) => m.id === prev)) {
          return prev;
        }
        const currentMember = family.members.find((m: FamilyMember) => m.id === playerId);
        if (currentMember) return currentMember.id;
        if (family.members.length > 0) return family.members[0].id;
        return prev;
      });

      return true;
    } catch (error) {
      console.error("[FamilyContext] Failed to refresh family:", error);
      if (mountedRef.current) {
        setFamilyData(null);
        setCallerIsParent(false);
        if (playerId) {
          setActivePlayerId(playerId);
        }
        setHasFetched(true);
      }
      return true;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [playerId]);

  useEffect(() => {
    mountedRef.current = true;

    if (!playerId) {
      setIsLoading(false);
      return;
    }

    setActivePlayerId(playerId);

    let retryCount = 0;
    const maxRetries = 5;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const attemptFetch = async () => {
      const success = await refreshFamily();

      if (!success && retryCount < maxRetries && mountedRef.current) {
        retryCount++;
        retryTimeoutId = setTimeout(attemptFetch, 1000);
      }
    };

    // Task #1455 — defer the very first family bootstrap fetch past
    // the cold-start paint. Previously this fired through a fixed
    // 300ms setTimeout which still landed in the same JS-bridge burst
    // as the home god-query and the auth /me round-trip. Coach has
    // nothing comparable and loads cleanly. We now wait until either
    // InteractionManager drains (the splash + first commit have
    // settled) or the 600ms iOS hard-timeout, whichever fires first.
    // Subsequent retries from a transient 401 still use the fast
    // 1000ms backoff above — the deferral applies only to the
    // initial mount.
    const cancelDefer = scheduleAfterPaint(() => {
      if (!mountedRef.current) return;
      void attemptFetch();
    });

    return () => {
      mountedRef.current = false;
      cancelDefer();
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [playerId, refreshFamily]);

  const clearFamily = useCallback(() => {
    setFamilyData(null);
    setCallerIsParent(false);
    setActivePlayerId(null);
    setHasFetched(false);
  }, []);

  return (
    <FamilyContext.Provider
      value={{
        isFamily,
        isLoading,
        familyData,
        activePlayerId,
        isParent,
        isFamilyMember,
        isFamilyCreator,
        setActivePlayer,
        refreshFamily: async () => { await refreshFamily(); },
        setFamilyData,
        clearFamily,
      }}
    >
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  const context = useContext(FamilyContext);
  if (context === undefined) {
    throw new Error("useFamily must be used within a FamilyProvider");
  }
  return context;
}
