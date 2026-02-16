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
}

interface FamilyContextType {
  isFamily: boolean;
  isLoading: boolean;
  familyData: FamilyData | null;
  activePlayerId: string | null;
  setActivePlayer: (playerId: string) => void;
  refreshFamily: () => Promise<void>;
  setFamilyData: (data: FamilyData | null) => void;
  clearFamily: () => void;
}

const FamilyContext = createContext<FamilyContextType | undefined>(undefined);

interface FamilyProviderProps {
  children: ReactNode;
  playerId?: string | null;
}

export function FamilyProvider({ children, playerId }: FamilyProviderProps) {
  const [familyData, setFamilyData] = useState<FamilyData | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);
  const queryClient = useQueryClient();
  const mountedRef = useRef(true);

  const isFamily = familyData !== null && familyData.members.length > 1;

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
        console.log("[FamilyContext] Auth not ready yet");
        return false;
      }
      
      if (!response.ok) {
        console.log("[FamilyContext] Request failed:", response.status);
        setFamilyData(null);
        setHasFetched(true);
        return true;
      }
      
      const data = await response.json();
      
      if (!mountedRef.current) return false;
      
      setHasFetched(true);
      
      if (data.isFamily && data.family) {
        setFamilyData(data.family);
        setActivePlayerId((prev) => {
          if (prev && data.family.members.some((m: FamilyMember) => m.id === prev)) {
            return prev;
          }
          const currentMember = data.family.members.find((m: FamilyMember) => m.id === playerId);
          if (currentMember) return currentMember.id;
          if (data.family.members.length > 0) return data.family.members[0].id;
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
