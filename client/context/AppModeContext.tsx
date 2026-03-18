import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppMode = "player" | "coach" | "admin" | "academy_owner" | "platform" | "service_provider";

interface AppModeContextType {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  availableModes: AppMode[];
  setAvailableModes: (modes: AppMode[], defaultMode?: AppMode) => void;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

const APP_MODE_KEY = "@app_mode";

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>("coach");
  const [availableModes, setAvailableModesState] = useState<AppMode[]>(["coach"]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    loadMode();
  }, []);

  const loadMode = async () => {
    try {
      const stored = await AsyncStorage.getItem(APP_MODE_KEY);
      if (
        stored === "player" ||
        stored === "coach" ||
        stored === "admin" ||
        stored === "academy_owner" ||
        stored === "platform" ||
        stored === "service_provider"
      ) {
        setModeState(stored as AppMode);
      }
      setIsInitialized(true);
    } catch (error) {
      console.error("Failed to load app mode:", error);
      setIsInitialized(true);
    }
  };

  const setMode = useCallback(async (newMode: AppMode) => {
    setModeState(newMode);
    await AsyncStorage.setItem(APP_MODE_KEY, newMode);
  }, []);

  const setAvailableModes = useCallback((modes: AppMode[], defaultMode?: AppMode) => {
    setAvailableModesState(modes);
    
    setModeState((currentMode) => {
      if (modes.includes(currentMode)) {
        return currentMode;
      }
      const newMode = defaultMode || modes[0] || "player";
      AsyncStorage.setItem(APP_MODE_KEY, newMode);
      return newMode;
    });
  }, []);

  return (
    <AppModeContext.Provider value={{ mode, setMode, availableModes, setAvailableModes }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error("useAppMode must be used within an AppModeProvider");
  }
  return context;
}

export function getModesForRole(role: string): AppMode[] {
  switch (role) {
    case "platform_owner":
      return ["platform", "academy_owner", "admin", "coach", "player", "service_provider"];
    case "owner":
    case "academy_owner":
      return ["academy_owner", "admin", "coach", "player"];
    case "admin":
      return ["admin", "coach", "player"];
    case "coach":
      return ["coach", "player"];
    case "player":
      return ["player"];
    case "service_provider":
      return ["service_provider"];
    default:
      return ["player"];
  }
}

export function getDefaultModeForRole(role: string): AppMode {
  switch (role) {
    case "platform_owner":
      return "platform";
    case "owner":
    case "academy_owner":
      return "academy_owner";
    case "admin":
      return "admin";
    case "coach":
      return "coach";
    case "service_provider":
      return "service_provider";
    default:
      return "player";
  }
}
