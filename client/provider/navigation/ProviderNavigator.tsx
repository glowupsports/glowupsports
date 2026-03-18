import React, { useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
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
import ProviderOnboardingScreen from "@/provider/screens/ProviderOnboardingScreen";
import { Colors } from "@/constants/theme";

export type ProviderStackParamList = {
  ProviderTabs: undefined;
  ProviderBookingDetail: { orderId: string };
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
  const { data: profile, isLoading } = useQuery<ProviderProfile>({
    queryKey: ["/api/provider/me"],
  });

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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProviderTabs" component={ProviderTabsWrapper} />
      <Stack.Screen
        name="ProviderBookingDetail"
        component={ProviderBookingDetailScreen}
        options={{ presentation: "modal" }}
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
