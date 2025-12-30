import React from "react";
import { StyleSheet, View, Platform, ActivityIndicator } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { useQuery } from "@tanstack/react-query";
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
  InviteManagement: undefined;
  OwnerProfile: undefined;
  AcademyOnboarding: undefined;
  OwnerMain: undefined;
};

const Tab = createBottomTabNavigator<OwnerTabParamList>();
const Stack = createNativeStackNavigator<OwnerStackParamList>();

function OwnerTabs() {
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
  );
}

export default function OwnerNavigator() {
  const { data: meData, isLoading } = useQuery<{ coach: { onboardingCompleted?: boolean } | null }>({
    queryKey: ["/api/me"],
  });
  
  if (isLoading || meData === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
      </View>
    );
  }
  
  const onboardingCompleted = meData?.coach?.onboardingCompleted ?? false;
  
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
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
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
