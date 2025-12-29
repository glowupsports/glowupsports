import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { Platform } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

const OFFLINE_ATTEMPTS_KEY = "coach_offline_attempts";
const OFFLINE_SYNC_ENABLED = false;

export interface OfflineAttempt {
  id: string;
  userId?: string;
  coachId?: string;
  screen: string;
  action: string;
  timestamp: string;
  offline: true;
}

interface NetworkContextType {
  isOffline: boolean;
  isConnected: boolean | null;
  connectionType: string | null;
  logOfflineAttempt: (attempt: Omit<OfflineAttempt, "id" | "timestamp" | "offline">) => Promise<void>;
  getOfflineAttempts: () => Promise<OfflineAttempt[]>;
  clearOfflineAttempts: () => Promise<void>;
  offlineSyncEnabled: boolean;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [connectionType, setConnectionType] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      const handleOnline = () => setIsConnected(true);
      const handleOffline = () => setIsConnected(false);
      
      setIsConnected(navigator.onLine);
      
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    } else {
      const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
        setIsConnected(state.isConnected);
        setConnectionType(state.type);
      });
      
      NetInfo.fetch().then((state: NetInfoState) => {
        setIsConnected(state.isConnected);
        setConnectionType(state.type);
      });
      
      return () => unsubscribe();
    }
  }, []);

  const isOffline = isConnected === false;

  const logOfflineAttempt = useCallback(async (attempt: Omit<OfflineAttempt, "id" | "timestamp" | "offline">) => {
    try {
      const stored = await AsyncStorage.getItem(OFFLINE_ATTEMPTS_KEY);
      const attempts: OfflineAttempt[] = stored ? JSON.parse(stored) : [];
      
      const newAttempt: OfflineAttempt = {
        ...attempt,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        offline: true,
      };
      
      attempts.push(newAttempt);
      
      if (attempts.length > 500) {
        attempts.splice(0, attempts.length - 500);
      }
      
      await AsyncStorage.setItem(OFFLINE_ATTEMPTS_KEY, JSON.stringify(attempts));
    } catch (error) {
      console.error("Failed to log offline attempt:", error);
    }
  }, []);

  const getOfflineAttempts = useCallback(async (): Promise<OfflineAttempt[]> => {
    try {
      const stored = await AsyncStorage.getItem(OFFLINE_ATTEMPTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  const clearOfflineAttempts = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(OFFLINE_ATTEMPTS_KEY);
    } catch (error) {
      console.error("Failed to clear offline attempts:", error);
    }
  }, []);

  return (
    <NetworkContext.Provider
      value={{
        isOffline,
        isConnected,
        connectionType,
        logOfflineAttempt,
        getOfflineAttempts,
        clearOfflineAttempts,
        offlineSyncEnabled: OFFLINE_SYNC_ENABLED,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return context;
}
