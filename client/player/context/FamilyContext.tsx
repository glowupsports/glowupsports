import logger from "@/lib/logger";
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getApiUrl, getAuthHeaders, setActivePlayerOverride } from "@/lib/query-client";

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
}

interface FamilyData {
  parentEmail: string;
  members: FamilyMember[];
  outstandingTotal: number;
  isCallerParent?: boolean;
}

interface FamilyContextType {
  isFamily: boolean;
  isLoading: boolean;
  familyData: FamilyData | null;
  activePlayerId: string | null;
  isParent: boolean;
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
  // still gate parent-only actions correctly.
  const isParent = callerIsParent || familyData?.isCallerParent === true;
  // isFamily is true when there are multiple members OR when the caller is a parent
  // who can manage a family (even before any children are linked)
  const isFamily = familyData !== null && (familyData.members.length > 1 || isParent);

  const setActivePlayer = useCallback((newPlayerId: string) => {
    setActivePlayerId(newPlayerId);
    if (newPlayerId !== playerId) {
      setActivePlayerOverride(newPlayerId);
    } else {
      setActivePlayerOverride(null);
    }
    queryClient.clear();
  }, [queryClient, playerId]);

  const refreshFamily = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      const response = await fetch(`${getApiUrl()}/api/family/status`, {
        method: "GET",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      
      if (!mountedRef.current) return false;
      
      if (response.status === 401) {
        logger.log("[FamilyContext] Auth not ready yet");
        return false;
      }
      
      if (!response.ok) {
        logger.log("[FamilyContext] Request failed:", response.status);
        setFamilyData(null);
        setCallerIsParent(false);
        setHasFetched(true);
        return true;
      }
      
      const data: FamilyStatusResponse = await response.json();
      
      if (!mountedRef.current) return false;
      
      setHasFetched(true);
      setCallerIsParent(
        data.isCallerParent === true || data.family?.isCallerParent === true,
      );
      
      if (data.isFamily && data.family) {
        const family = data.family;
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
      } else {
        setFamilyData(null);
        if (playerId) {
          setActivePlayerId(playerId);
        }
      }
      
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
    let timeoutId: NodeJS.Timeout | null = null;
    
    const attemptFetch = async () => {
      const success = await refreshFamily();
      
      if (!success && retryCount < maxRetries && mountedRef.current) {
        retryCount++;
        timeoutId = setTimeout(attemptFetch, 1000);
      }
    };
    
    timeoutId = setTimeout(attemptFetch, 300);
    
    return () => {
      mountedRef.current = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
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
