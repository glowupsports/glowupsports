import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/coach/context/AuthContext";

interface Coach {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  homeLocationId: string | null;
  hourlyRate: string | null;
  level: number | null;
  totalXp: number | null;
  academyId: string | null;
}

interface Academy {
  id: string;
  name: string;
  slug: string;
}

interface Location {
  id: string;
  name: string;
  timezone: string | null;
}

interface Court {
  id: string;
  locationId: string | null;
  name: string;
  isActive: boolean | null;
}

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  locationId: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  ballLevel: string | null;
  skillLevel: number | null;
  isRecurring: boolean | null;
  paymentStatus: string | null;
  status: string | null;
}

interface BlockedSession {
  id: string;
  courtId: string | null;
  startTime: string;
  endTime: string;
  blocked: true;
}

interface CalendarData {
  ownSessions: Session[];
  blockedSessions: BlockedSession[];
  courts: Court[];
  locations: Location[];
  dateRange: { start: string; end: string };
}

interface CoachContextType {
  coach: Coach | null;
  academy: Academy | null;
  setCoach: (coach: Coach | null) => void;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  viewMode: "day" | "week" | "month";
  setViewMode: (mode: "day" | "week" | "month") => void;
  timeGrid: 30 | 60;
  setTimeGrid: (grid: 30 | 60) => void;
  focusMode: boolean;
  setFocusMode: (mode: boolean) => void;
  insightsMode: boolean;
  setInsightsMode: (mode: boolean) => void;
  calendarData: CalendarData | null;
  isLoading: boolean;
  refetchCalendar: () => void;
}

const CoachContext = createContext<CoachContextType | undefined>(undefined);

const FOCUS_MODE_KEY = "@focus_mode";

export function CoachProvider({ children }: { children: ReactNode }) {
  const { coach: authCoach, academy: authAcademy } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("day");
  const [timeGrid, setTimeGrid] = useState<30 | 60>(60);
  const [focusMode, setFocusModeState] = useState(false);
  const [insightsMode, setInsightsMode] = useState(false);

  const coach: Coach | null = authCoach ? {
    id: authCoach.id,
    name: authCoach.name,
    email: authCoach.email,
    phone: authCoach.phone,
    role: authCoach.role,
    homeLocationId: null,
    hourlyRate: null,
    level: authCoach.level,
    totalXp: authCoach.totalXp,
    academyId: authCoach.academyId,
  } : null;

  const academy: Academy | null = authAcademy ? {
    id: authAcademy.id,
    name: authAcademy.name,
    slug: authAcademy.slug,
  } : null;

  useEffect(() => {
    const loadFocusMode = async () => {
      try {
        const storedFocusMode = await AsyncStorage.getItem(FOCUS_MODE_KEY);
        if (storedFocusMode) {
          setFocusModeState(storedFocusMode === "true");
        }
      } catch (error) {
        console.error("Failed to load focus mode:", error);
      }
    };
    
    loadFocusMode();
  }, []);

  const setFocusMode = async (mode: boolean) => {
    setFocusModeState(mode);
    await AsyncStorage.setItem(FOCUS_MODE_KEY, mode.toString());
  };

  const setCoach = async (_newCoach: Coach | null) => {
    // Coach is now managed by AuthContext, this is a no-op for backwards compatibility
  };

  const dateStr = selectedDate.toISOString().split("T")[0];
  const calendarQueryPath = coach?.id 
    ? `/api/coach/calendar?coachId=${coach.id}&date=${dateStr}&view=${viewMode}` 
    : null;

  const { data: calendarData, isLoading, refetch: refetchCalendar } = useQuery<CalendarData>({
    queryKey: [calendarQueryPath],
    enabled: !!coach?.id && !!calendarQueryPath,
  });

  return (
    <CoachContext.Provider
      value={{
        coach,
        academy,
        setCoach,
        selectedDate,
        setSelectedDate,
        viewMode,
        setViewMode,
        timeGrid,
        setTimeGrid,
        focusMode,
        setFocusMode,
        insightsMode,
        setInsightsMode,
        calendarData: calendarData || null,
        isLoading,
        refetchCalendar,
      }}
    >
      {children}
    </CoachContext.Provider>
  );
}

export function useCoach() {
  const context = useContext(CoachContext);
  if (!context) {
    throw new Error("useCoach must be used within a CoachProvider");
  }
  return context;
}
