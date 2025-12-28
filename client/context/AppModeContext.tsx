import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppMode = "player" | "coach" | "admin" | "owner";

interface AppModeContextType {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  availableModes: AppMode[];
  setAvailableModes: (modes: AppMode[]) => void;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

const APP_MODE_KEY = "@app_mode";

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>("coach");
  const [availableModes, setAvailableModesState] = useState<AppMode[]>(["coach"]);

  useEffect(() => {
    loadMode();
  }, []);

  const loadMode = async () => {
    try {
      const stored = await AsyncStorage.getItem(APP_MODE_KEY);
      if (stored === "player" || stored === "coach" || stored === "admin" || stored === "owner") {
        setModeState(stored);
      }
    } catch (error) {
      console.error("Failed to load app mode:", error);
    }
  };

  const setMode = async (newMode: AppMode) => {
    setModeState(newMode);
    await AsyncStorage.setItem(APP_MODE_KEY, newMode);
  };

  const setAvailableModes = (modes: AppMode[]) => {
    setAvailableModesState(modes);
  };

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
    case "owner":
      return ["owner", "admin", "coach", "player"];
    case "admin":
      return ["admin", "coach", "player"];
    case "coach":
      return ["coach", "player"];
    case "player":
      return ["player"];
    default:
      return ["player"];
  }
}

export function getDefaultModeForRole(role: string): AppMode {
  switch (role) {
    case "owner":
      return "owner";
    case "admin":
      return "admin";
    case "coach":
      return "coach";
    default:
      return "player";
  }
}
