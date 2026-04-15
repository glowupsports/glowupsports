import logger from "@/lib/logger";
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest } from "@/lib/query-client";

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
  photoUrl: string | null;
  specialty: string | null;
  bio: string | null;
}

interface Academy {
  id: string;
  name: string;
  slug: string;
  timezone?: string | null;
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
  skipReason?: string | null;
}

interface BlockedSession {
  id: string;
  courtId: string | null;
  startTime: string;
  endTime: string;
  blocked: true;
  blockedReason?: string;
  isCourtBlock?: boolean;
}

export interface SlotReservation {
  id: string;
  coachId: string;
  playerId: string;
  playerName: string;
  startTime: string;
  endTime: string;
  expiresAt: string;
}

interface CalendarData {
  ownSessions: Session[];
  blockedSessions: BlockedSession[];
  courts: Court[];
  locations: Location[];
  slotReservations?: SlotReservation[];
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
  isFetching: boolean;
  refetchCalendar: () => void;
}

const CoachContext = createContext<CoachContextType | undefined>(undefined);

const FOCUS_MODE_KEY = "@focus_mode";

const AUTO_MIGRATE_KEY = "@auto_migrate_done";

export function CoachProvider({ children }: { children: ReactNode }) {
  const { coach: authCoach, academy: authAcademy } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("day");
  const [timeGrid, setTimeGrid] = useState<30 | 60>(60);
  const [focusMode, setFocusModeState] = useState(false);
  const [insightsMode, setInsightsMode] = useState(false);
  const queryClient = useQueryClient();
  const hasMigrated = useRef(false);

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
    photoUrl: authCoach.photoUrl,
    specialty: authCoach.specialty,
    bio: authCoach.bio,
  } : null;

  const academy: Academy | null = authAcademy ? {
    id: authAcademy.id,
    name: authAcademy.name,
    slug: authAcademy.slug,
    timezone: authAcademy.timezone || "Asia/Dubai",
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

  // Auto-migrate recurring sessions to classes on coach login
  useEffect(() => {
    const autoMigrate = async () => {
      if (!authCoach?.id || hasMigrated.current) return;
      
      try {
        // Check if we've already migrated for this coach
        const migrated = await AsyncStorage.getItem(`${AUTO_MIGRATE_KEY}_${authCoach.id}`);
        if (migrated) {
          hasMigrated.current = true;
          return;
        }
        
        // Call migration endpoint silently
        const response = await apiRequest("POST", "/api/coach/series/migrate");
        if (response.ok) {
          const data = await response.json();
          logger.log(`Auto-migrated ${data.migratedCount} recurring sessions to classes`);
          
          // Mark as migrated for this coach
          await AsyncStorage.setItem(`${AUTO_MIGRATE_KEY}_${authCoach.id}`, "true");
          hasMigrated.current = true;
          
          // Invalidate series query to refresh the list
          if (data.migratedCount > 0) {
            queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
          }
        }
      } catch (error) {
        console.error("Auto-migration failed:", error);
      }
    };
    
    autoMigrate();
  }, [authCoach?.id, queryClient]);

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

  const { data: calendarData, isLoading, isFetching, refetch: refetchCalendar } = useQuery<CalendarData>({
    queryKey: [calendarQueryPath],
    enabled: !!coach?.id && !!calendarQueryPath,
    placeholderData: (previousData) => previousData, // Keep previous data visible while fetching new
    staleTime: 1000 * 60 * 2, // Consider data fresh for 2 minutes
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
        isFetching,
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
