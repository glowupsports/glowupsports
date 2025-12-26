import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type AppMode = "player" | "coach";

interface AppModeContextType {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

const APP_MODE_KEY = "@app_mode";

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>("coach"); // Default to coach for now

  useEffect(() => {
    loadMode();
  }, []);

  const loadMode = async () => {
    try {
      const stored = await AsyncStorage.getItem(APP_MODE_KEY);
      if (stored === "player" || stored === "coach") {
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

  return (
    <AppModeContext.Provider value={{ mode, setMode }}>
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
