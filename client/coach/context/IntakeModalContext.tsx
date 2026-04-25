import React, { createContext, useContext, useState, useCallback } from "react";
import type { IntakeResult } from "@/coach/components/IntakeFlowModal";

export interface PendingIntakeSession {
  sessionId: string;
  startTime: string;
  sessionType: string;
  players: { id: string; name: string; attendanceStatus?: string }[];
  playerCount: number;
  needsGroupDynamics: boolean;
  cardType: "private" | "semi_private" | "group";
}

interface IntakeCallbacks {
  onComplete: (result: IntakeResult) => void;
  onSaveOnly?: () => void;
}

interface IntakeModalContextValue {
  pendingIntakeSession: PendingIntakeSession | null;
  intakeCallbacks: IntakeCallbacks | null;
  openIntake: (session: PendingIntakeSession, callbacks: IntakeCallbacks) => void;
  closeIntake: () => void;
}

const IntakeModalContext = createContext<IntakeModalContextValue | null>(null);

export function IntakeModalProvider({ children }: { children: React.ReactNode }) {
  const [pendingIntakeSession, setPendingIntakeSession] = useState<PendingIntakeSession | null>(null);
  const [intakeCallbacks, setIntakeCallbacks] = useState<IntakeCallbacks | null>(null);

  const openIntake = useCallback((session: PendingIntakeSession, callbacks: IntakeCallbacks) => {
    setPendingIntakeSession(session);
    setIntakeCallbacks(callbacks);
  }, []);

  const closeIntake = useCallback(() => {
    setPendingIntakeSession(null);
    setIntakeCallbacks(null);
  }, []);

  return (
    <IntakeModalContext.Provider value={{ pendingIntakeSession, intakeCallbacks, openIntake, closeIntake }}>
      {children}
    </IntakeModalContext.Provider>
  );
}

export function useIntakeModal(): IntakeModalContextValue {
  const ctx = useContext(IntakeModalContext);
  if (!ctx) throw new Error("useIntakeModal must be used within IntakeModalProvider");
  return ctx;
}
