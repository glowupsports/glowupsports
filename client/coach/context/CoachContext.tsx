import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

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

const COACH_STORAGE_KEY = "@coach_data";
const ACADEMY_STORAGE_KEY = "@academy_data";
const FOCUS_MODE_KEY = "@focus_mode";

export function CoachProvider({ children }: { children: ReactNode }) {
  const [coach, setCoachState] = useState<Coach | null>(null);
  const [academy, setAcademyState] = useState<Academy | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("day");
  const [timeGrid, setTimeGrid] = useState<30 | 60>(60);
  const [focusMode, setFocusModeState] = useState(false);
  const [insightsMode, setInsightsMode] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      try {
        const [storedCoach, storedAcademy, storedFocusMode] = await Promise.all([
          AsyncStorage.getItem(COACH_STORAGE_KEY),
          AsyncStorage.getItem(ACADEMY_STORAGE_KEY),
          AsyncStorage.getItem(FOCUS_MODE_KEY),
        ]);
        
        if (storedFocusMode && isMounted) {
          setFocusModeState(storedFocusMode === "true");
        }
        
        if (storedCoach && storedAcademy && isMounted) {
          setCoachState(JSON.parse(storedCoach));
          setAcademyState(JSON.parse(storedAcademy));
        } else if (isMounted) {
          // Fetch from /api/me endpoint (returns coach + academy context)
          const apiUrl = getApiUrl();
          const response = await fetch(new URL("/api/me", apiUrl).toString());
          if (response.ok && isMounted) {
            const data = await response.json();
            if (data.coach) {
              setCoachState(data.coach);
              await AsyncStorage.setItem(COACH_STORAGE_KEY, JSON.stringify(data.coach));
            }
            if (data.academy) {
              setAcademyState(data.academy);
              await AsyncStorage.setItem(ACADEMY_STORAGE_KEY, JSON.stringify(data.academy));
            }
          }
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    };
    
    loadData();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const setFocusMode = async (mode: boolean) => {
    setFocusModeState(mode);
    await AsyncStorage.setItem(FOCUS_MODE_KEY, mode.toString());
  };

  const setCoach = async (newCoach: Coach | null) => {
    setCoachState(newCoach);
    if (newCoach) {
      await AsyncStorage.setItem(COACH_STORAGE_KEY, JSON.stringify(newCoach));
    } else {
      await AsyncStorage.removeItem(COACH_STORAGE_KEY);
    }
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
