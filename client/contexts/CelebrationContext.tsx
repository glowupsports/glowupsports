import React, { createContext, useContext, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FirstActionCelebration, hasCelebrationBeenShown } from "@/components/FirstActionCelebration";
import { GlowColors, FunctionColors } from "@/constants/theme";

const CELEBRATIONS_KEY = "@glow_celebrations_shown";

interface CelebrationConfig {
  title: string;
  description: string;
  icon: string;
  iconColor?: string;
  xpReward?: number;
}

const MILESTONE_CELEBRATIONS: Record<string, CelebrationConfig> = {
  first_session_created: {
    title: "First Session Created!",
    description: "You've scheduled your first coaching session. Your players are going to love it!",
    icon: "calendar",
    iconColor: GlowColors.primary,
    xpReward: 50,
  },
  first_feedback_given: {
    title: "First Feedback Given!",
    description: "Great coaching starts with great feedback. Your player just received their first progress update.",
    icon: "chatbubble-ellipses",
    iconColor: FunctionColors.info,
    xpReward: 30,
  },
  first_player_added: {
    title: "First Player Added!",
    description: "Your academy just got its first player. The journey to greatness begins here.",
    icon: "person-add",
    iconColor: FunctionColors.success,
    xpReward: 40,
  },
  first_credit_package: {
    title: "First Credit Package Sold!",
    description: "Ka-ching! Your academy just processed its first credit package. Business is booming.",
    icon: "card",
    iconColor: FunctionColors.social,
    xpReward: 50,
  },
  first_attendance_marked: {
    title: "First Attendance Marked!",
    description: "You've marked your first attendance. Consistent tracking helps players improve.",
    icon: "checkmark-circle",
    iconColor: FunctionColors.success,
    xpReward: 20,
  },
  first_coach_added: {
    title: "First Coach Added!",
    description: "Your coaching team is growing. Together, you'll help more players reach their potential.",
    icon: "people",
    iconColor: FunctionColors.planning,
    xpReward: 40,
  },
  first_match_logged: {
    title: "First Match Logged!",
    description: "Match data is gold for improvement. Keep tracking to see your players grow.",
    icon: "trophy",
    iconColor: "#FFD700",
    xpReward: 30,
  },
  first_level_up: {
    title: "Level Up!",
    description: "A player just leveled up thanks to your coaching. This is what it's all about!",
    icon: "arrow-up-circle",
    iconColor: GlowColors.primary,
    xpReward: 60,
  },
};

interface CelebrationContextType {
  triggerCelebration: (milestoneKey: string) => Promise<void>;
  triggerCustomCelebration: (config: CelebrationConfig) => Promise<void>;
}

const CelebrationContext = createContext<CelebrationContextType>({
  triggerCelebration: async () => {},
  triggerCustomCelebration: async () => {},
});

export function useCelebration() {
  return useContext(CelebrationContext);
}

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<CelebrationConfig | null>(null);

  const triggerCelebration = useCallback(async (milestoneKey: string) => {
    const config = MILESTONE_CELEBRATIONS[milestoneKey];
    if (!config) return;

    const alreadyShown = await hasCelebrationBeenShown(config.title);
    if (alreadyShown) return;

    setCurrent(config);
    setVisible(true);
  }, []);

  const triggerCustomCelebration = useCallback(async (config: CelebrationConfig) => {
    const alreadyShown = await hasCelebrationBeenShown(config.title);
    if (alreadyShown) return;

    setCurrent(config);
    setVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setCurrent(null);
  }, []);

  return (
    <CelebrationContext.Provider value={{ triggerCelebration, triggerCustomCelebration }}>
      {children}
      {current ? (
        <FirstActionCelebration
          visible={visible}
          onClose={handleClose}
          title={current.title}
          description={current.description}
          icon={current.icon}
          iconColor={current.iconColor}
          xpReward={current.xpReward}
        />
      ) : null}
    </CelebrationContext.Provider>
  );
}
