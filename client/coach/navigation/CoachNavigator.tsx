import React from "react";
import { StyleSheet, View, Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import DashboardScreen from "@/coach/screens/DashboardScreen";
import CalendarScreen from "@/coach/screens/CalendarScreen";
import PlayersScreen from "@/coach/screens/PlayersScreen";
import CoachingScreen from "@/coach/screens/CoachingScreen";
import SettingsScreen from "@/coach/screens/SettingsScreen";
import HistoryScreen from "@/coach/screens/HistoryScreen";
import NotificationsScreen from "@/coach/screens/NotificationsScreen";
import CoachProfileScreen from "@/coach/screens/CoachProfileScreen";
import ChatInboxScreen from "@/coach/screens/ChatInboxScreen";
import { Colors } from "@/constants/theme";

export type CoachTabParamList = {
  Dashboard: undefined;
  Calendar: undefined;
  Players: undefined;
  Coaching: undefined;
  Settings: undefined;
};

export type CoachStackParamList = {
  CoachTabs: undefined;
  History: undefined;
  Notifications: undefined;
  CoachProfile: undefined;
  ChatInbox: undefined;
};

const Tab = createBottomTabNavigator<CoachTabParamList>();
const Stack = createNativeStackNavigator<CoachStackParamList>();

function CoachTabs() {
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
        tabBarActiveTintColor: Colors.dark.primary,
        tabBarInactiveTintColor: Colors.dark.tabIconDefault,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          tabBarLabel: "Calendar",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Players"
        component={PlayersScreen}
        options={{
          tabBarLabel: "Players",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Coaching"
        component={CoachingScreen}
        options={{
          tabBarLabel: "Coaching",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
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

export default function CoachNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CoachTabs" component={CoachTabs} />
      <Stack.Screen 
        name="History" 
        component={HistoryScreen}
        options={{
          presentation: "modal",
        }}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen}
        options={{
          presentation: "modal",
        }}
      />
      <Stack.Screen 
        name="CoachProfile" 
        component={CoachProfileScreen}
        options={{
          presentation: "modal",
        }}
      />
      <Stack.Screen 
        name="ChatInbox" 
        component={ChatInboxScreen}
        options={{
          presentation: "modal",
        }}
      />
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
    fontSize: 11,
    fontWeight: "500",
  },
});
