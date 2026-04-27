import React, { useEffect } from "react";
import { StyleSheet, View, ActivityIndicator, Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { setCurrentAcademyId } from "@/lib/auth";
import OwnerDashboardScreen from "@/owner/screens/OwnerDashboardScreen";
import CoachPostComposerScreen from "@/coach/screens/CoachPostComposerScreen";
import AcademyScreen from "@/owner/screens/AcademyScreen";
import PeopleScreen from "@/owner/screens/PeopleScreen";
import OperationsScreen from "@/owner/screens/OperationsScreen";
import PerformanceScreen from "@/owner/screens/PerformanceScreen";
import FinanceScreen from "@/owner/screens/FinanceScreen";
import SettingsScreen from "@/owner/screens/SettingsScreen";
import InviteManagementScreen from "@/owner/screens/InviteManagementScreen";
import OwnerProfileScreen from "@/owner/screens/OwnerProfileScreen";
import AcademyOnboardingScreen from "@/owner/screens/AcademyOnboardingScreen";
import AcademyProfileScreen from "@/owner/screens/AcademyProfileScreen";
import BrandingScreen from "@/owner/screens/BrandingScreen";
import AdminCourtsScreen from "@/admin/screens/AdminCourtsScreen";
import AdminPlayersScreen from "@/admin/screens/AdminPlayersScreen";
import AdminClassesScreen from "@/admin/screens/AdminClassesScreen";
import AdminPaymentsScreen from "@/admin/screens/AdminPaymentsScreen";
import RulesAndPoliciesScreen from "@/owner/screens/RulesAndPoliciesScreen";
import PricingScreen from "@/owner/screens/PricingScreen";
import CoachCompensationScreen from "@/owner/screens/CoachCompensationScreen";
import CreditPackagesScreen from "@/owner/screens/CreditPackagesScreen";
import ShopManagementScreen from "@/owner/screens/ShopManagementScreen";
import PublicListingsScreen from "@/owner/screens/PublicListingsScreen";
import { SwipeableTabBar, TabConfig } from "@/components/SwipeableTabBar";
import { TabNavigationProvider } from "@/components/TabNavigationContext";
import { Colors } from "@/constants/theme";

export type OwnerTabParamList = {
  OwnerDashboard: undefined;
  Academy: undefined;
  People: undefined;
  Operations: undefined;
  Performance: undefined;
  Finance: undefined;
  PublicListings: undefined;
  Settings: undefined;
};

export type OwnerStackParamList = {
  OwnerTabs: undefined;
  InviteManagement: { role?: "coach" | "admin" };
  OwnerProfile: undefined;
  AcademyOnboarding: undefined;
  OwnerMain: undefined;
  AcademyProfile: undefined;
  Branding: { academyId?: string; academyName?: string } | undefined;
  CourtsManagement: undefined;
  PlayersManagement: undefined;
  ClassesManagement: { focusSeriesId?: string } | undefined;
  PaymentsManagement: undefined;
  RulesAndPolicies: undefined;
  Pricing: undefined;
  CoachCompensation: undefined;
  CreditPackages: undefined;
  ShopManagement: undefined;
  CoachPostComposer: { mode?: "coach" | "academy"; academyId?: string } | undefined;
};

const Stack = createNativeStackNavigator<OwnerStackParamList>();

const OWNER_TABS: TabConfig[] = [
  { key: "OwnerDashboard", label: "Home", icon: "home-outline", iconFocused: "home", component: OwnerDashboardScreen },
  { key: "Academy", label: "Academy", icon: "business-outline", iconFocused: "business", component: AcademyScreen },
  { key: "People", label: "People", icon: "people-outline", iconFocused: "people", component: PeopleScreen },
  { key: "Operations", label: "Ops", icon: "calendar-outline", iconFocused: "calendar", component: OperationsScreen },
  { key: "Performance", label: "Stats", icon: "analytics-outline", iconFocused: "analytics", component: PerformanceScreen },
  { key: "Finance", label: "Finance", icon: "card-outline", iconFocused: "card", component: FinanceScreen },
  { key: "PublicListings", label: "Listings", icon: "globe-outline", iconFocused: "globe", component: PublicListingsScreen },
  { key: "Settings", label: "Settings", icon: "cog-outline", iconFocused: "cog", component: SettingsScreen },
];

function OwnerTabs() {
  return (
    <SwipeableTabBar 
      tabs={OWNER_TABS}
      primaryColor={Colors.dark.gold}
      secondaryColor={Colors.dark.orange}
    />
  );
}

function OwnerStackNavigator({ onboardingCompleted }: { onboardingCompleted: boolean }) {
  return (
    <Stack.Navigator 
      key={onboardingCompleted ? "owner-main" : "owner-onboarding"}
      screenOptions={{
        headerShown: false,
        // Task #1417 — Mirror the player stacks: don't freeze inactive
        // screens on iOS Fabric. Freezing contributes to the cold-start
        // commit-stall the paint-tick (client/lib/iosPaintTick.tsx) is
        // already working to defeat. Android keeps the default freeze
        // behaviour to save CPU.
        freezeOnBlur: Platform.OS !== "ios",
      }}
      initialRouteName={onboardingCompleted ? "OwnerTabs" : "AcademyOnboarding"}
    >
      <Stack.Screen name="OwnerTabs" component={OwnerTabs} />
      <Stack.Screen name="OwnerMain" component={OwnerTabs} />
      <Stack.Screen name="AcademyOnboarding" component={AcademyOnboardingScreen} />
      <Stack.Screen name="InviteManagement" component={InviteManagementScreen} />
      <Stack.Screen name="OwnerProfile" component={OwnerProfileScreen} />
      <Stack.Screen name="AcademyProfile" component={AcademyProfileScreen} />
      <Stack.Screen name="Branding" component={BrandingScreen} />
      <Stack.Screen name="CourtsManagement" component={AdminCourtsScreen} />
      <Stack.Screen name="PlayersManagement" component={AdminPlayersScreen} />
      <Stack.Screen name="ClassesManagement" component={AdminClassesScreen} />
      <Stack.Screen name="PaymentsManagement" component={AdminPaymentsScreen} />
      <Stack.Screen name="RulesAndPolicies" component={RulesAndPoliciesScreen} />
      <Stack.Screen name="Pricing" component={PricingScreen} />
      <Stack.Screen name="CoachCompensation" component={CoachCompensationScreen} />
      <Stack.Screen name="CreditPackages" component={CreditPackagesScreen} />
      <Stack.Screen name="ShopManagement" component={ShopManagementScreen} />
      <Stack.Screen
        name="CoachPostComposer"
        component={CoachPostComposerScreen}
        options={{ headerShown: true, headerTitle: "New Academy Post", presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}


interface AcademyInfo {
  academy: {
    id: string;
    name?: string;
    onboardingCompleted?: boolean;
  };
}

export default function OwnerNavigator() {
  const { data, isLoading } = useQuery<AcademyInfo>({
    queryKey: ["/api/owner/academy"],
  });

  useEffect(() => {
    if (data?.academy?.id) {
      setCurrentAcademyId(data.academy.id);
    }
  }, [data?.academy?.id]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
      </View>
    );
  }

  const hasExistingAcademy = !!data?.academy?.id && !!data?.academy?.name;
  const onboardingCompleted = hasExistingAcademy || (data?.academy?.onboardingCompleted ?? false);

  return (
    <TabNavigationProvider>
      <View style={styles.container}>
        <OwnerStackNavigator onboardingCompleted={onboardingCompleted} />
      </View>
    </TabNavigationProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
});
