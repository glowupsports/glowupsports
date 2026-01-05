import React from "react";
import { StyleSheet, View, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import AdminDashboardScreen from "@/admin/screens/AdminDashboardScreen";
import AdminCoachesScreen from "@/admin/screens/AdminCoachesScreen";
import AdminPlayersScreen from "@/admin/screens/AdminPlayersScreen";
import AdminCalendarScreen from "@/admin/screens/AdminCalendarScreen";
import AdminReportsScreen from "@/admin/screens/AdminReportsScreen";
import AdminSettingsScreen from "@/admin/screens/AdminSettingsScreen";
import AdminPaymentsScreen from "@/admin/screens/AdminPaymentsScreen";
import AdminCourtsScreen from "@/admin/screens/AdminCourtsScreen";
import AdminLocationsScreen from "@/admin/screens/AdminLocationsScreen";
import AdminSubscriptionsScreen from "@/admin/screens/AdminSubscriptionsScreen";
import { Colors } from "@/constants/theme";

export type AdminTabParamList = {
  AdminDashboard: undefined;
  AdminCoaches: undefined;
  AdminPlayers: undefined;
  AdminSchedule: undefined;
  AdminReports: undefined;
  AdminSettings: undefined;
};

export type AdminStackParamList = {
  AdminTabs: undefined;
  AddCoach: undefined;
  AddPlayer: undefined;
  CoachDetail: { coachId: string };
  PlayerDetail: { playerId: string };
  AdminPayments: undefined;
  AdminCourts: undefined;
  AdminLocations: undefined;
  AdminSubscriptions: undefined;
};

const Tab = createBottomTabNavigator<AdminTabParamList>();
const Stack = createNativeStackNavigator<AdminStackParamList>();

function AdminTabs() {
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
        tabBarActiveTintColor: Colors.dark.orange,
        tabBarInactiveTintColor: Colors.dark.tabIconDefault,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{
          tabBarLabel: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminCoaches"
        component={AdminCoachesScreen}
        options={{
          tabBarLabel: "Coaches",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminPlayers"
        component={AdminPlayersScreen}
        options={{
          tabBarLabel: "Players",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminSchedule"
        component={AdminCalendarScreen}
        options={{
          tabBarLabel: "Schedule",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminReports"
        component={AdminReportsScreen}
        options={{
          tabBarLabel: "Reports",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminSettings"
        component={AdminSettingsScreen}
        options={{
          tabBarLabel: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AdminNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminTabs" component={AdminTabs} />
      <Stack.Screen name="AdminPayments" component={AdminPaymentsScreen} />
      <Stack.Screen name="AdminCourts" component={AdminCourtsScreen} />
      <Stack.Screen name="AdminLocations" component={AdminLocationsScreen} />
      <Stack.Screen name="AdminSubscriptions" component={AdminSubscriptionsScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: "transparent",
    height: 85,
    paddingTop: 8,
  },
  tabBarBackground: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  androidTabBackground: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
});
