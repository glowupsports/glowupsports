import React from "react";
import { StyleSheet, View, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import CommandCenterScreen from "@/platform/screens/CommandCenterScreen";
import AcademiesScreen from "@/platform/screens/AcademiesScreen";
import AcademyDetailScreen from "@/platform/screens/AcademyDetailScreen";
import CoachHealthScreen from "@/platform/screens/CoachHealthScreen";
import PlayerHealthScreen from "@/platform/screens/PlayerHealthScreen";
import FinancialsScreen from "@/platform/screens/FinancialsScreen";
import SystemScreen from "@/platform/screens/SystemScreen";
import XPMultipliersScreen from "@/platform/screens/XPMultipliersScreen";
import AntiAbuseRulesScreen from "@/platform/screens/AntiAbuseRulesScreen";
import LevelThresholdsScreen from "@/platform/screens/LevelThresholdsScreen";
import BadgeDefinitionsScreen from "@/platform/screens/BadgeDefinitionsScreen";
import AcademyDefaultsScreen from "@/platform/screens/AcademyDefaultsScreen";
import BillingConfigScreen from "@/platform/screens/BillingConfigScreen";
import NotificationTemplatesScreen from "@/platform/screens/NotificationTemplatesScreen";
import AuditLogsScreen from "@/platform/screens/AuditLogsScreen";
import DiagnosticsScreen from "@/platform/screens/DiagnosticsScreen";
import { QuickActionsFAB, QuickAction } from "@/components/QuickActionsFAB";
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
  AntiAbuseRules: undefined;
  LevelThresholds: undefined;
  BadgeDefinitions: undefined;
  AcademyDefaults: undefined;
  BillingConfig: undefined;
  NotificationTemplates: undefined;
  AuditLogs: undefined;
  Diagnostics: undefined;
};

const Tab = createBottomTabNavigator<PlatformTabParamList>();
const Stack = createNativeStackNavigator<PlatformStackParamList>();

const PLATFORM_COLOR = "#9B59B6";

function PlatformTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          <View style={styles.tabBarBackground}>
            {Platform.OS === "ios" ? (
              <BlurView
                intensity={80}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.androidTabBackground]} />
            )}
          </View>
        ),
        tabBarActiveTintColor: PLATFORM_COLOR,
        tabBarInactiveTintColor: Colors.dark.tabIconDefault,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="CommandCenter"
        component={CommandCenterScreen}
        options={{
          tabBarLabel: "Overview",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size - 2} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Academies"
        component={AcademiesScreen}
        options={{
          tabBarLabel: "Academies",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business" size={size - 2} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="CoachHealth"
        component={CoachHealthScreen}
        options={{
          tabBarLabel: "Coaches",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="fitness" size={size - 2} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="PlayerHealth"
        component={PlayerHealthScreen}
        options={{
          tabBarLabel: "Players",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size - 2} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Financials"
        component={FinancialsScreen}
        options={{
          tabBarLabel: "Finance",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="card" size={size - 2} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="System"
        component={SystemScreen}
        options={{
          tabBarLabel: "System",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cog" size={size - 2} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function PlatformStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PlatformTabs" component={PlatformTabs} />
      <Stack.Screen name="AcademyDetail" component={AcademyDetailScreen} />
      <Stack.Screen name="XPMultipliers" component={XPMultipliersScreen} />
      <Stack.Screen name="AntiAbuseRules" component={AntiAbuseRulesScreen} />
      <Stack.Screen name="LevelThresholds" component={LevelThresholdsScreen} />
      <Stack.Screen name="BadgeDefinitions" component={BadgeDefinitionsScreen} />
      <Stack.Screen name="AcademyDefaults" component={AcademyDefaultsScreen} />
      <Stack.Screen name="BillingConfig" component={BillingConfigScreen} />
      <Stack.Screen name="NotificationTemplates" component={NotificationTemplatesScreen} />
      <Stack.Screen name="AuditLogs" component={AuditLogsScreen} />
      <Stack.Screen name="Diagnostics" component={DiagnosticsScreen} />
    </Stack.Navigator>
  );
}

const PLATFORM_FAB_COLOR = "#9B59B6";

function PlatformQuickActionsFAB() {
  const navigation = useNavigation<NativeStackNavigationProp<PlatformStackParamList>>();

  const platformActions: QuickAction[] = [
    {
      id: "academies",
      label: "Academies",
      icon: "business-outline",
      color: PLATFORM_FAB_COLOR,
      onPress: () => navigation.navigate("Academies"),
    },
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
      color: Colors.dark.orange,
      onPress: () => navigation.navigate("AuditLogs"),
    },
    {
      id: "anti-abuse",
      label: "Anti-Abuse",
      icon: "shield-outline",
      color: Colors.dark.error,
      onPress: () => navigation.navigate("AntiAbuseRules"),
    },
  ];

  return (
    <QuickActionsFAB
      actions={platformActions}
      primaryColor={PLATFORM_FAB_COLOR}
      secondaryColor={Colors.dark.xpCyan}
    />
  );
}

export default function PlatformNavigator() {
  return (
    <>
      <View style={styles.container}>
        <PlatformStackNavigator />
      </View>
      <PlatformQuickActionsFAB />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  tabBar: {
    position: "absolute",
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: "transparent",
    height: 70,
    paddingTop: 6,
  },
  tabBarBackground: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  androidTabBackground: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: "500",
  },
});
