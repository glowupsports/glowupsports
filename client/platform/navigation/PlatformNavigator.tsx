import React from "react";
import { StyleSheet, View, Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CommandCenterScreen from "@/platform/screens/CommandCenterScreen";
import AcademiesScreen from "@/platform/screens/AcademiesScreen";
import AcademyDetailScreen from "@/platform/screens/AcademyDetailScreen";
import CoachHealthScreen from "@/platform/screens/CoachHealthScreen";
import PlayerHealthScreen from "@/platform/screens/PlayerHealthScreen";
import FinancialsScreen from "@/platform/screens/FinancialsScreen";
import SystemScreen from "@/platform/screens/SystemScreen";
import XPMultipliersScreen from "@/platform/screens/XPMultipliersScreen";
import FeatureUnlocksScreen from "@/platform/screens/FeatureUnlocksScreen";
import AntiAbuseRulesScreen from "@/platform/screens/AntiAbuseRulesScreen";
import LevelThresholdsScreen from "@/platform/screens/LevelThresholdsScreen";
import BadgeDefinitionsScreen from "@/platform/screens/BadgeDefinitionsScreen";
import AcademyDefaultsScreen from "@/platform/screens/AcademyDefaultsScreen";
import BillingConfigScreen from "@/platform/screens/BillingConfigScreen";
import NotificationTemplatesScreen from "@/platform/screens/NotificationTemplatesScreen";
import AuditLogsScreen from "@/platform/screens/AuditLogsScreen";
import DiagnosticsScreen from "@/platform/screens/DiagnosticsScreen";
import ProviderInviteManagementScreen from "@/platform/screens/ProviderInviteManagementScreen";
import PlayerActivityScreen from "@/platform/screens/PlayerActivityScreen";
import FeatureInterestScreen from "@/platform/screens/FeatureInterestScreen";
import TierManagementScreen from "@/platform/screens/TierManagementScreen";
import BrandingScreen from "@/owner/screens/BrandingScreen";
import ModerationReportsScreen from "@/owner/screens/ModerationReportsScreen";
import { SwipeableTabBar, TabConfig } from "@/components/SwipeableTabBar";
import { TabNavigationProvider } from "@/components/TabNavigationContext";
import { Colors } from "@/constants/theme";

export type PlatformTabParamList = {
  CommandCenter: undefined;
  Academies: undefined;
  CoachHealth: undefined;
  PlayerHealth: undefined;
  Financials: undefined;
  System: undefined;
};

export type PlatformStackParamList = {
  PlatformTabs: undefined;
  AcademyDetail: { academyId: string; academyName: string };
  XPMultipliers: undefined;
  FeatureUnlocks: undefined;
  AntiAbuseRules: undefined;
  LevelThresholds: undefined;
  BadgeDefinitions: undefined;
  AcademyDefaults: undefined;
  BillingConfig: undefined;
  NotificationTemplates: undefined;
  AuditLogs: undefined;
  Diagnostics: undefined;
  ProviderInviteManagement: undefined;
  PlayerActivity: { initialTab?: "features" | "players" | "dead_zones" };
  FeatureInterest: undefined;
  TierManagement: undefined;
  Branding: { academyId: string; academyName?: string };
  ModerationReports: undefined;
};

const Stack = createNativeStackNavigator<PlatformStackParamList>();

const PLATFORM_COLOR = "#9B59B6";

const PLATFORM_TABS: TabConfig[] = [
  { key: "CommandCenter", label: "Overview", icon: "grid-outline", iconFocused: "grid", component: CommandCenterScreen },
  { key: "Academies", label: "Academies", icon: "business-outline", iconFocused: "business", component: AcademiesScreen },
  { key: "CoachHealth", label: "Coaches", icon: "fitness-outline", iconFocused: "fitness", component: CoachHealthScreen },
  { key: "PlayerHealth", label: "Players", icon: "people-outline", iconFocused: "people", component: PlayerHealthScreen },
  { key: "Financials", label: "Finance", icon: "card-outline", iconFocused: "card", component: FinancialsScreen },
  { key: "System", label: "System", icon: "cog-outline", iconFocused: "cog", component: SystemScreen },
];

function PlatformTabs() {
  return (
    <SwipeableTabBar 
      tabs={PLATFORM_TABS}
      primaryColor={PLATFORM_COLOR}
      secondaryColor={Colors.dark.xpCyan}
    />
  );
}

function PlatformStackNavigator() {
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
      <Stack.Screen name="PlatformTabs" component={PlatformTabs} />
      <Stack.Screen name="AcademyDetail" component={AcademyDetailScreen} />
      <Stack.Screen name="XPMultipliers" component={XPMultipliersScreen} />
      <Stack.Screen name="FeatureUnlocks" component={FeatureUnlocksScreen} />
      <Stack.Screen name="AntiAbuseRules" component={AntiAbuseRulesScreen} />
      <Stack.Screen name="LevelThresholds" component={LevelThresholdsScreen} />
      <Stack.Screen name="BadgeDefinitions" component={BadgeDefinitionsScreen} />
      <Stack.Screen name="AcademyDefaults" component={AcademyDefaultsScreen} />
      <Stack.Screen name="BillingConfig" component={BillingConfigScreen} />
      <Stack.Screen name="NotificationTemplates" component={NotificationTemplatesScreen} />
      <Stack.Screen name="AuditLogs" component={AuditLogsScreen} />
      <Stack.Screen name="Diagnostics" component={DiagnosticsScreen} />
      <Stack.Screen name="ProviderInviteManagement" component={ProviderInviteManagementScreen} />
      <Stack.Screen name="PlayerActivity" component={PlayerActivityScreen} />
      <Stack.Screen name="FeatureInterest" component={FeatureInterestScreen} />
      <Stack.Screen name="TierManagement" component={TierManagementScreen} />
      <Stack.Screen name="Branding" component={BrandingScreen} />
      <Stack.Screen
        name="ModerationReports"
        component={ModerationReportsScreen}
        options={{ headerShown: true, headerTitle: "Moderation Queue" }}
      />
    </Stack.Navigator>
  );
}


export default function PlatformNavigator() {
  return (
    <TabNavigationProvider>
      <View style={styles.container}>
        <PlatformStackNavigator />
      </View>
    </TabNavigationProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
});
