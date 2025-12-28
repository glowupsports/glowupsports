import React, { useState } from "react";
import { StyleSheet, View, Platform, ActivityIndicator } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import AvailabilityScreen from "@/coach/screens/AvailabilityScreen";
import CourtPreferencesScreen from "@/coach/screens/CourtPreferencesScreen";
import TemplatesScreen from "@/coach/screens/TemplatesScreen";
import AcademySettingsScreen from "@/coach/screens/AcademySettingsScreen";
import BillingScreen from "@/coach/screens/BillingScreen";
import CoachOnboardingScreen from "@/coach/screens/CoachOnboardingScreen";
import { useAuth } from "@/coach/context/AuthContext";
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
  Availability: undefined;
  CourtPreferences: undefined;
  Templates: undefined;
  AcademySettings: undefined;
  Billing: undefined;
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

function CoachStackNavigator() {
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
      <Stack.Screen 
        name="Availability" 
        component={AvailabilityScreen}
        options={{
          presentation: "modal",
        }}
      />
      <Stack.Screen 
        name="CourtPreferences" 
        component={CourtPreferencesScreen}
        options={{
          presentation: "modal",
        }}
      />
      <Stack.Screen 
        name="Templates" 
        component={TemplatesScreen}
        options={{
          presentation: "modal",
        }}
      />
      <Stack.Screen 
        name="AcademySettings" 
        component={AcademySettingsScreen}
      />
      <Stack.Screen 
        name="Billing" 
        component={BillingScreen}
      />
    </Stack.Navigator>
  );
}

interface CoachProfile {
  coach: {
    id: string;
    name: string;
    onboardingCompleted?: boolean;
  };
}

export default function CoachNavigator() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  const { data: profile, isLoading } = useQuery<CoachProfile>({
    queryKey: ["/api/coach/me/profile"],
    enabled: !!user?.coachId,
  });

  const handleOnboardingComplete = () => {
    setOnboardingComplete(true);
    queryClient.invalidateQueries({ queryKey: ["/api/coach/me/profile"] });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  const coachOnboardingCompleted = profile?.coach?.onboardingCompleted ?? false;
  const showOnboarding = user?.coachId && !coachOnboardingCompleted && onboardingComplete !== true;

  if (showOnboarding) {
    return <CoachOnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  return <CoachStackNavigator />;
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
