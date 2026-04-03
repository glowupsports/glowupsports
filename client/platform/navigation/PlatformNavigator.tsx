import React from "react";
import { StyleSheet, View } from "react-native";
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
import TierManagementScreen from "@/platform/screens/TierManagementScreen";
import { SwipeableTabBar, TabConfig } from "@/components/SwipeableTabBar";
import { QuickActionsFAB, QuickAction } from "@/components/QuickActionsFAB";
import { TabNavigationProvider } from "@/components/TabNavigationContext";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
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
  TierManagement: undefined;
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
      renderOverlay={(currentTabKey: string) => currentTabKey === "CommandCenter" ? <PlatformQuickActionsFAB /> : null}
    />
  );
}

function PlatformStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
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
      <Stack.Screen name="TierManagement" component={TierManagementScreen} />
    </Stack.Navigator>
  );
}

function PlatformQuickActionsFAB() {
  const navigation = useNavigation<NativeStackNavigationProp<PlatformStackParamList>>();

  const platformActions: QuickAction[] = [
    {
      id: "xp-config",
      label: "XP Config",
      icon: "star-outline",
      color: Colors.dark.gold,
      onPress: () => navigation.navigate("XPMultipliers"),
    },
    {
      id: "billing",
      label: "Billing",
      icon: "card-outline",
      color: Colors.dark.successNeon,
      onPress: () => navigation.navigate("BillingConfig"),
    },
    {
      id: "diagnostics",
      label: "Diagnostics",
      icon: "pulse-outline",
      color: Colors.dark.xpCyan,
      onPress: () => navigation.navigate("Diagnostics"),
    },
    {
      id: "audit-logs",
      label: "Audit Logs",
      icon: "document-text-outline",
      color: Colors.dark.ballGlow,
      onPress: () => navigation.navigate("AuditLogs"),
    },
    {
      id: "notifications",
      label: "Templates",
      icon: "notifications-outline",
      color: Colors.dark.orange,
      onPress: () => navigation.navigate("NotificationTemplates"),
    },
    {
      id: "feature-unlocks",
      label: "Features",
      icon: "key-outline",
      color: PLATFORM_COLOR,
      onPress: () => navigation.navigate("FeatureUnlocks"),
    },
    {
      id: "tier-management",
      label: "Tiers",
      icon: "layers-outline",
      color: Colors.dark.xpCyan,
      onPress: () => navigation.navigate("TierManagement"),
    },
  ];

  return (
    <QuickActionsFAB
      actions={platformActions}
      primaryColor={PLATFORM_COLOR}
      secondaryColor={Colors.dark.xpCyan}
    />
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
