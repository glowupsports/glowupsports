import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface ScheduleFocusContextType {
  focusSessionId: string | null;
  focusToken: number;
  setFocusSession: (id: string | null) => void;
  clearFocusSession: () => void;
}

const ScheduleFocusContext = createContext<ScheduleFocusContextType>({
  focusSessionId: null,
  focusToken: 0,
  setFocusSession: () => {},
  clearFocusSession: () => {},
});

export function ScheduleFocusProvider({ children }: { children: ReactNode }) {
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState<number>(0);

  const setFocusSession = useCallback((id: string | null) => {
    setFocusSessionId(id);
    setFocusToken((t) => t + 1);
  }, []);

  const clearFocusSession = useCallback(() => {
    setFocusSessionId(null);
  }, []);

  return (
    <ScheduleFocusContext.Provider value={{ focusSessionId, focusToken, setFocusSession, clearFocusSession }}>
      {children}
    </ScheduleFocusContext.Provider>
  );
}

export function useScheduleFocus() {
  return useContext(ScheduleFocusContext);
}
