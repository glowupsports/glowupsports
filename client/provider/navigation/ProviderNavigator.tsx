import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { SwipeableTabBar, TabConfig } from "@/components/SwipeableTabBar";
import ProviderDashboardScreen from "@/provider/screens/ProviderDashboardScreen";
import ProviderBookingsScreen from "@/provider/screens/ProviderBookingsScreen";
import ProviderBookingDetailScreen from "@/provider/screens/ProviderBookingDetailScreen";
import ProviderProfileScreen from "@/provider/screens/ProviderProfileScreen";
import ProviderScheduleScreen from "@/provider/screens/ProviderScheduleScreen";
import ProviderEarningsScreen from "@/provider/screens/ProviderEarningsScreen";
import ProviderClientsScreen from "@/provider/screens/ProviderClientsScreen";
import ProviderClientDetailScreen from "@/provider/screens/ProviderClientDetailScreen";
import ProviderOnboardingScreen from "@/provider/screens/ProviderOnboardingScreen";
import ProviderMessagesScreen from "@/provider/screens/ProviderMessagesScreen";
import ProviderChatScreen from "@/provider/screens/ProviderChatScreen";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { useAppMode, getDefaultModeForRole } from "@/context/AppModeContext";

export type ProviderStackParamList = {
  ProviderTabs: undefined;
  ProviderBookingDetail: { orderId: string };
  ProviderClientDetail: { playerId: string };
  ProviderChat: { orderId: string };
};

const Stack = createNativeStackNavigator<ProviderStackParamList>();

const PROVIDER_TABS: TabConfig[] = [
  {
    key: "Today",
    icon: "home-outline",
    iconFocused: "home",
    label: "Today",
    component: ProviderDashboardScreen,
  },
  {
    key: "Schedule",
    icon: "calendar-outline",
    iconFocused: "calendar",
    label: "Schedule",
    component: ProviderScheduleScreen,
  },
  {
    key: "Clients",
    icon: "people-outline",
    iconFocused: "people",
    label: "Clients",
    component: ProviderClientsScreen,
  },
  {
    key: "Messages",
    icon: "chatbubble-outline",
    iconFocused: "chatbubble",
    label: "Messages",
    component: ProviderMessagesScreen,
  },
  {
    key: "Earnings",
    icon: "cash-outline",
    iconFocused: "cash",
    label: "Earnings",
    component: ProviderEarningsScreen,
  },
  {
    key: "Profile",
    icon: "person-outline",
    iconFocused: "person",
    label: "Profile",
    component: ProviderProfileScreen,
  },
];

interface ProviderProfile {
  isOnboarded: boolean;
  specializations: string[];
}

function ProviderTabs() {
  const [, setCurrentTab] = useState("Today");

  const handlePageChange = useCallback((_index: number, key: string) => {
    setCurrentTab(key);
  }, []);

  return (
    <SwipeableTabBar
      tabs={PROVIDER_TABS}
      primaryColor={Colors.dark.primary}
      secondaryColor={Colors.dark.primary}
      onPageChange={handlePageChange}
    />
  );
}

function ProviderTabsWrapper() {
  const { user } = useAuth();
  const { setMode } = useAppMode();
  const fallbackTriggered = useRef(false);

  const { data: profile, isLoading, error } = useQuery<ProviderProfile>({
    queryKey: ["/api/provider/me"],
  });

  useEffect(() => {
    if (
      !fallbackTriggered.current &&
      error &&
      (error as Error)?.message?.startsWith("403") &&
      user?.role === "platform_owner"
    ) {
      fallbackTriggered.current = true;
      const defaultMode = getDefaultModeForRole("platform_owner");
      setMode(defaultMode);
    }
  }, [error, user?.role, setMode]);

  if (isLoading) {
    return <View style={styles.loadingContainer} />;
  }

  if (profile && !profile.isOnboarded) {
    return <ProviderOnboardingScreen />;
  }

  return <ProviderTabs />;
}

export default function ProviderNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Task #1417 — Mirror the player stacks: don't freeze inactive
        // screens on iOS Fabric. Freezing contributes to the cold-start
        // commit-stall the paint-tick (client/lib/iosPaintTick.tsx) is
        // already working to defeat. Android keeps the default freeze
        // behaviour to save CPU.
        freezeOnBlur: Platform.OS !== "ios",
      }}
    >
      <Stack.Screen name="ProviderTabs" component={ProviderTabsWrapper} />
      <Stack.Screen
        name="ProviderBookingDetail"
        component={ProviderBookingDetailScreen}
        options={{ presentation: "modal" }}
      />
      <Stack.Screen
        name="ProviderClientDetail"
        component={ProviderClientDetailScreen}
      />
      <Stack.Screen
        name="ProviderChat"
        component={ProviderChatScreen}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
});
