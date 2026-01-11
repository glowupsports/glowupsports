import React, { useEffect } from "react";
import { StyleSheet, View, Platform, ActivityIndicator } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { useQuery } from "@tanstack/react-query";
import { setCurrentAcademyId } from "@/lib/auth";
import OwnerDashboardScreen from "@/owner/screens/OwnerDashboardScreen";
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
import CourtsManagementScreen from "@/owner/screens/CourtsManagementScreen";
import RulesAndPoliciesScreen from "@/owner/screens/RulesAndPoliciesScreen";
import PricingScreen from "@/owner/screens/PricingScreen";
import CoachCompensationScreen from "@/owner/screens/CoachCompensationScreen";
import CreditPackagesScreen from "@/owner/screens/CreditPackagesScreen";
import ShopManagementScreen from "@/owner/screens/ShopManagementScreen";
import { QuickActionsFAB, QuickAction } from "@/components/QuickActionsFAB";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors } from "@/constants/theme";

export type OwnerTabParamList = {
  OwnerDashboard: undefined;
  Academy: undefined;
  People: undefined;
  Operations: undefined;
  Performance: undefined;
  Finance: undefined;
  Settings: undefined;
};

export type OwnerStackParamList = {
  OwnerTabs: undefined;
  InviteManagement: { role?: "coach" | "admin" };
  OwnerProfile: undefined;
  AcademyOnboarding: undefined;
  OwnerMain: undefined;
  AcademyProfile: undefined;
  CourtsManagement: undefined;
  RulesAndPolicies: undefined;
  Pricing: undefined;
  CoachCompensation: undefined;
  CreditPackages: undefined;
  ShopManagement: undefined;
};

const Tab = createBottomTabNavigator<OwnerTabParamList>();
const Stack = createNativeStackNavigator<OwnerStackParamList>();

function OwnerTabs() {
  return (
    <View style={styles.tabsWrapper}>
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
          tabBarActiveTintColor: Colors.dark.gold,
          tabBarInactiveTintColor: Colors.dark.tabIconDefault,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tab.Screen
          name="OwnerDashboard"
          component={OwnerDashboardScreen}
          options={{
            tabBarLabel: "Home",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size - 2} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Academy"
          component={AcademyScreen}
          options={{
            tabBarLabel: "Academy",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="business" size={size - 2} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="People"
          component={PeopleScreen}
          options={{
            tabBarLabel: "People",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people" size={size - 2} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Operations"
          component={OperationsScreen}
          options={{
            tabBarLabel: "Ops",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar" size={size - 2} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Performance"
          component={PerformanceScreen}
          options={{
            tabBarLabel: "Stats",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="analytics" size={size - 2} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Finance"
          component={FinanceScreen}
          options={{
            tabBarLabel: "Finance",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="card" size={size - 2} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: "Settings",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="cog" size={size - 2} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
      <OwnerQuickActionsFAB />
    </View>
  );
}

function OwnerStackNavigator({ onboardingCompleted }: { onboardingCompleted: boolean }) {
  return (
    <Stack.Navigator 
      key={onboardingCompleted ? "owner-main" : "owner-onboarding"}
      screenOptions={{ headerShown: false }}
      initialRouteName={onboardingCompleted ? "OwnerTabs" : "AcademyOnboarding"}
    >
      <Stack.Screen name="OwnerTabs" component={OwnerTabs} />
      <Stack.Screen name="OwnerMain" component={OwnerTabs} />
      <Stack.Screen name="AcademyOnboarding" component={AcademyOnboardingScreen} />
      <Stack.Screen name="InviteManagement" component={InviteManagementScreen} />
      <Stack.Screen name="OwnerProfile" component={OwnerProfileScreen} />
      <Stack.Screen name="AcademyProfile" component={AcademyProfileScreen} />
      <Stack.Screen name="CourtsManagement" component={CourtsManagementScreen} />
      <Stack.Screen name="RulesAndPolicies" component={RulesAndPoliciesScreen} />
      <Stack.Screen name="Pricing" component={PricingScreen} />
      <Stack.Screen name="CoachCompensation" component={CoachCompensationScreen} />
      <Stack.Screen name="CreditPackages" component={CreditPackagesScreen} />
      <Stack.Screen name="ShopManagement" component={ShopManagementScreen} />
    </Stack.Navigator>
  );
}

function OwnerQuickActionsFAB() {
  const navigation = useNavigation<NativeStackNavigationProp<OwnerStackParamList>>();

  const ownerActions: QuickAction[] = [
    {
      id: "invite-coach",
      label: "Invite Coach",
      icon: "person-add-outline",
      color: Colors.dark.primary,
      onPress: () => navigation.navigate("InviteManagement", { role: "coach" }),
    },
    {
      id: "pricing",
      label: "Pricing",
      icon: "pricetag-outline",
      color: Colors.dark.gold,
      onPress: () => navigation.navigate("Pricing"),
    },
    {
      id: "courts",
      label: "Courts",
      icon: "tennisball-outline",
      color: Colors.dark.successNeon,
      onPress: () => navigation.navigate("CourtsManagement"),
    },
    {
      id: "shop",
      label: "Shop",
      icon: "storefront-outline",
      color: Colors.dark.xpCyan,
      onPress: () => navigation.navigate("ShopManagement"),
    },
    {
      id: "credits",
      label: "Credits",
      icon: "wallet-outline",
      color: Colors.dark.orange,
      onPress: () => navigation.navigate("CreditPackages"),
    },
    {
      id: "rules",
      label: "Rules",
      icon: "document-text-outline",
      color: Colors.dark.ballGlow,
      onPress: () => navigation.navigate("RulesAndPolicies"),
    },
  ];

  return (
    <QuickActionsFAB
      actions={ownerActions}
      primaryColor={Colors.dark.gold}
      secondaryColor={Colors.dark.orange}
    />
  );
}

export default function OwnerNavigator() {
  const { data: meData, isLoading } = useQuery<{ user?: { academyId?: string | null }; coach: { onboardingCompleted?: boolean } | null }>({
    queryKey: ["/api/me"],
  });
  
  // Set the current academy context when user data loads
  useEffect(() => {
    if (meData?.user?.academyId) {
      setCurrentAcademyId(meData.user.academyId);
    }
  }, [meData?.user?.academyId]);
  
  if (isLoading || meData === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
      </View>
    );
  }
  
  const onboardingCompleted = meData?.coach?.onboardingCompleted ?? false;
  
  return (
    <View style={styles.container}>
      <OwnerStackNavigator onboardingCompleted={onboardingCompleted} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  tabsWrapper: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
