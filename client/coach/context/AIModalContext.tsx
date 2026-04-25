import React, { createContext, useContext, useState, useCallback } from "react";

export interface AIModalState {
  sessionId: string;
  playerId: string;
  playerName: string;
  sessionType: string;
  remainingPlayers: { id: string; name: string }[];
}

interface AIModalContextValue {
  openAIChat: (state: AIModalState) => void;
  closeAIChat: () => void;
  state: AIModalState | null;
}

const AIModalContext = createContext<AIModalContextValue | null>(null);

export function AIModalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AIModalState | null>(null);

  const openAIChat = useCallback((newState: AIModalState) => {
    setState(newState);
  }, []);

  const closeAIChat = useCallback(() => {
    setState(null);
  }, []);

  return (
    <AIModalContext.Provider value={{ openAIChat, closeAIChat, state }}>
      {children}
    </AIModalContext.Provider>
  );
}

export function useAIModal(): AIModalContextValue {
  const ctx = useContext(AIModalContext);
  if (!ctx) throw new Error("useAIModal must be used within AIModalProvider");
  return ctx;
}
