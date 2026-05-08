import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { queryClient, setSupervisorQueryCoachId, setCoachReadOnlyMode } from "@/lib/query-client";
import { useAppMode } from "@/context/AppModeContext";
import { useAuth } from "@/coach/context/AuthContext";

export interface SupervisorCoach {
  id: string;
  name: string;
  photoUrl?: string | null;
  role?: string | null;
  academyId?: string | null;
}

interface SupervisorModeContextType {
  supervisorCoach: SupervisorCoach | null;
  setSupervisorCoach: (coach: SupervisorCoach | null) => void;
  isReadOnly: boolean;
  showCoachPicker: boolean;
  setShowCoachPicker: (visible: boolean) => void;
}

const SupervisorModeContext = createContext<SupervisorModeContextType | undefined>(undefined);

export function SupervisorModeProvider({ children }: { children: ReactNode }) {
  const [supervisorCoach, setSupervisorCoachState] = useState<SupervisorCoach | null>(null);
  const [showCoachPicker, setShowCoachPicker] = useState(false);
  const { mode } = useAppMode();
  const { user } = useAuth();
  const isOwnerRole = user?.role === "academy_owner" || user?.role === "platform_owner" || user?.role === "owner";

  // Auto-clear supervisor state whenever the owner navigates away from coach mode
  // (e.g. via mode switcher). This prevents read-only mutation blocking from leaking
  // into academy_owner / player / admin surfaces.
  useEffect(() => {
    if (mode !== "coach" && supervisorCoach !== null) {
      setSupervisorCoachState(null);
      setSupervisorQueryCoachId(null);
      setCoachReadOnlyMode(false);
    }
  }, [mode, supervisorCoach]);

  const setSupervisorCoach = (coach: SupervisorCoach | null) => {
    setSupervisorCoachState(coach);
    const shouldBeReadOnly = coach !== null && !isOwnerRole;
    // Sync module-level flags so query-client injects supervisorCoachId and
    // blocks write mutations immediately (no hook delay)
    setSupervisorQueryCoachId(coach?.id ?? null);
    setCoachReadOnlyMode(shouldBeReadOnly);
    // Invalidate all /api/coach/ queries so they refetch with the new supervisorCoachId
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/coach/");
      },
    });
  };

  return (
    <SupervisorModeContext.Provider
      value={{
        supervisorCoach,
        setSupervisorCoach,
        isReadOnly: supervisorCoach !== null && !isOwnerRole,
        showCoachPicker,
        setShowCoachPicker,
      }}
    >
      {children}
    </SupervisorModeContext.Provider>
  );
}

export function useSupervisorMode() {
  const context = useContext(SupervisorModeContext);
  if (!context) {
    throw new Error("useSupervisorMode must be used within a SupervisorModeProvider");
  }
  return context;
}
