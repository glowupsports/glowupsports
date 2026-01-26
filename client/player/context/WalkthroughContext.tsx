import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const WALKTHROUGH_KEY = "@glow_walkthrough_completed";

interface WalkthroughStep {
  id: string;
  title: string;
  message: string;
  targetElement?: string;
}

interface ScreenWalkthrough {
  screenName: string;
  steps: WalkthroughStep[];
}

const walkthroughData: Record<string, ScreenWalkthrough> = {
  Home: {
    screenName: "Home",
    steps: [
      {
        id: "home_welcome",
        title: "Welcome to Your Tennis Hub!",
        message: "This is your home screen. See your player stats, upcoming sessions, and quick actions all in one place.",
      },
      {
        id: "home_book",
        title: "Book Your First Session",
        message: "Tap 'Book Lesson' to schedule a session with a coach. You'll earn XP for every session!",
      },
      {
        id: "home_discover",
        title: "Discover Content",
        message: "Scroll down to find lessons, drills, and tips from coaches to help you improve.",
      },
    ],
  },
  Social: {
    screenName: "Social",
    steps: [
      {
        id: "social_intro",
        title: "Connect with Players",
        message: "This is your social hub. Find other players, join groups, and share your tennis journey!",
      },
      {
        id: "social_groups",
        title: "Join Groups",
        message: "Tap on groups to find players at your level or with similar interests.",
      },
    ],
  },
  Play: {
    screenName: "Play",
    steps: [
      {
        id: "play_intro",
        title: "Ready to Play?",
        message: "Book courts, find players for a match, or join open games in your area.",
      },
      {
        id: "play_court",
        title: "Book a Court",
        message: "Need a court? Tap 'Book Court' to reserve one at your academy.",
      },
    ],
  },
  Schedule: {
    screenName: "Schedule",
    steps: [
      {
        id: "schedule_intro",
        title: "Your Tennis Calendar",
        message: "View all your upcoming sessions, matches, and bookings in one place.",
      },
    ],
  },
  Progress: {
    screenName: "Progress",
    steps: [
      {
        id: "progress_intro",
        title: "Track Your Journey",
        message: "Watch your tennis skills grow! See your level, XP, and achievements here.",
      },
      {
        id: "progress_glow",
        title: "Your Glow Score",
        message: "Your Glow Score reflects your overall progress. Complete sessions and challenges to increase it!",
      },
    ],
  },
  Profile: {
    screenName: "Profile",
    steps: [
      {
        id: "profile_intro",
        title: "Your Profile",
        message: "Customize your profile, manage settings, and view your tennis achievements.",
      },
    ],
  },
};

interface WalkthroughContextValue {
  isWalkthroughActive: boolean;
  currentScreen: string | null;
  currentStepIndex: number;
  currentStep: WalkthroughStep | null;
  totalSteps: number;
  hasSeenScreen: (screenName: string) => boolean;
  startWalkthrough: (screenName: string) => void;
  nextStep: () => void;
  skipWalkthrough: () => void;
  resetWalkthrough: () => Promise<void>;
}

const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const [completedScreens, setCompletedScreens] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    loadCompletedScreens();
  }, []);

  const loadCompletedScreens = async () => {
    try {
      const stored = await AsyncStorage.getItem(WALKTHROUGH_KEY);
      if (stored) {
        setCompletedScreens(new Set(JSON.parse(stored)));
      }
    } catch (error) {
      console.warn("Failed to load walkthrough state:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCompletedScreens = async (screens: Set<string>) => {
    try {
      await AsyncStorage.setItem(WALKTHROUGH_KEY, JSON.stringify([...screens]));
    } catch (error) {
      console.warn("Failed to save walkthrough state:", error);
    }
  };

  const hasSeenScreen = useCallback((screenName: string) => {
    return completedScreens.has(screenName);
  }, [completedScreens]);

  const startWalkthrough = useCallback((screenName: string) => {
    if (!walkthroughData[screenName] || completedScreens.has(screenName)) {
      return;
    }
    setCurrentScreen(screenName);
    setCurrentStepIndex(0);
  }, [completedScreens]);

  const nextStep = useCallback(() => {
    if (!currentScreen) return;
    
    const screenData = walkthroughData[currentScreen];
    if (!screenData) return;

    if (currentStepIndex < screenData.steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      const newCompleted = new Set(completedScreens);
      newCompleted.add(currentScreen);
      setCompletedScreens(newCompleted);
      saveCompletedScreens(newCompleted);
      setCurrentScreen(null);
      setCurrentStepIndex(0);
    }
  }, [currentScreen, currentStepIndex, completedScreens]);

  const skipWalkthrough = useCallback(() => {
    if (!currentScreen) return;
    
    const newCompleted = new Set(completedScreens);
    newCompleted.add(currentScreen);
    setCompletedScreens(newCompleted);
    saveCompletedScreens(newCompleted);
    setCurrentScreen(null);
    setCurrentStepIndex(0);
  }, [currentScreen, completedScreens]);

  const resetWalkthrough = async () => {
    setCompletedScreens(new Set());
    await AsyncStorage.removeItem(WALKTHROUGH_KEY);
  };

  const currentStep = currentScreen 
    ? walkthroughData[currentScreen]?.steps[currentStepIndex] || null 
    : null;
  
  const totalSteps = currentScreen 
    ? walkthroughData[currentScreen]?.steps.length || 0 
    : 0;

  if (isLoading) {
    return <>{children}</>;
  }

  return (
    <WalkthroughContext.Provider
      value={{
        isWalkthroughActive: !!currentScreen,
        currentScreen,
        currentStepIndex,
        currentStep,
        totalSteps,
        hasSeenScreen,
        startWalkthrough,
        nextStep,
        skipWalkthrough,
        resetWalkthrough,
      }}
    >
      {children}
    </WalkthroughContext.Provider>
  );
}

export function useWalkthrough(): WalkthroughContextValue {
  const context = useContext(WalkthroughContext);
  if (!context) {
    return {
      isWalkthroughActive: false,
      currentScreen: null,
      currentStepIndex: 0,
      currentStep: null,
      totalSteps: 0,
      hasSeenScreen: () => true,
      startWalkthrough: () => {},
      nextStep: () => {},
      skipWalkthrough: () => {},
      resetWalkthrough: async () => {},
    };
  }
  return context;
}
