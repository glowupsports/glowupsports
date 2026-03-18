import React, { useState, useCallback } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SwipeableTabBar, TabConfig } from "@/components/SwipeableTabBar";
import ProviderDashboardScreen from "@/provider/screens/ProviderDashboardScreen";
import ProviderBookingsScreen from "@/provider/screens/ProviderBookingsScreen";
import ProviderBookingDetailScreen from "@/provider/screens/ProviderBookingDetailScreen";
import ProviderProfileScreen from "@/provider/screens/ProviderProfileScreen";
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
    key: "Bookings",
    icon: "calendar-outline",
    iconFocused: "calendar",
    label: "Bookings",
    component: ProviderBookingsScreen,
  },
  {
    key: "Profile",
    icon: "person-outline",
    iconFocused: "person",
    label: "Profile",
    component: ProviderProfileScreen,
  },
];

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

export default function ProviderNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProviderTabs" component={ProviderTabs} />
      <Stack.Screen
        name="ProviderBookingDetail"
        component={ProviderBookingDetailScreen}
        options={{ presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}
