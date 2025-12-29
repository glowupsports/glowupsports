import React, { useState } from "react";
import { StyleSheet, View, Platform, ActivityIndicator } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PlayerHomeScreen from "@/player/screens/PlayerHomeScreen";
import PlayerJourneyScreen from "@/player/screens/PlayerJourneyScreen";
import PlayerTrainingScreen from "@/player/screens/PlayerTrainingScreen";
import PlayerProgressScreen from "@/player/screens/PlayerProgressScreen";
import PlayerScheduleScreen from "@/player/screens/PlayerScheduleScreen";
import PlayerProfileScreen from "@/player/screens/PlayerProfileScreen";
import TrainingDetailScreen from "@/player/screens/TrainingDetailScreen";
import SkillDetailScreen from "@/player/screens/SkillDetailScreen";
import PlayerSettingsScreen from "@/player/screens/PlayerSettingsScreen";
import PeerJourneyScreen from "@/player/screens/PeerJourneyScreen";
import GroupChallengesScreen from "@/player/screens/GroupChallengesScreen";
import AcademyBrowserScreen from "@/player/screens/AcademyBrowserScreen";
import PlayerOnboardingScreen from "@/player/screens/PlayerOnboardingScreen";
import { PlayerChatFooter } from "@/player/components/PlayerChatFooter";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";

export type PlayerTabParamList = {
  Home: undefined;
  Journey: undefined;
  Progress: undefined;
  Schedule: undefined;
  Profile: undefined;
};

export type PlayerStackParamList = {
  PlayerTabs: undefined;
  Training: undefined;
  TrainingDetail: { sessionId: string };
  SkillDetail: { domain: string };
  Settings: undefined;
  PeerJourney: { peerId: string; peerName: string };
  GroupChallenges: undefined;
  AcademyBrowser: undefined;
};

const Tab = createBottomTabNavigator<PlayerTabParamList>();
const Stack = createNativeStackNavigator<PlayerStackParamList>();

function PlayerTabs() {
  return (
    <View style={styles.tabsContainer}>
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
          tabBarActiveTintColor: Colors.dark.xpCyan,
          tabBarInactiveTintColor: Colors.dark.tabIconDefault,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tab.Screen
          name="Home"
          component={PlayerHomeScreen}
          options={{
            tabBarLabel: "Home",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Journey"
          component={PlayerJourneyScreen}
          options={{
            tabBarLabel: "Journey",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="map-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Progress"
          component={PlayerProgressScreen}
          options={{
            tabBarLabel: "Progress",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="stats-chart-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Schedule"
          component={PlayerScheduleScreen}
          options={{
            tabBarLabel: "Schedule",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={PlayerProfileScreen}
          options={{
            tabBarLabel: "Profile",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
      <PlayerChatFooter />
    </View>
  );
}

function PlayerStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PlayerTabs" component={PlayerTabs} />
      <Stack.Screen 
        name="Training" 
        component={PlayerTrainingScreen}
        options={{
          presentation: "modal",
        }}
      />
      <Stack.Screen 
        name="TrainingDetail" 
        component={TrainingDetailScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="SkillDetail" 
        component={SkillDetailScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="Settings" 
        component={PlayerSettingsScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="PeerJourney" 
        component={PeerJourneyScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="GroupChallenges" 
        component={GroupChallengesScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="AcademyBrowser" 
        component={AcademyBrowserScreen}
        options={{
          presentation: "modal",
        }}
      />
    </Stack.Navigator>
  );
}

interface PlayerDashboard {
  isDemo?: boolean;
  isOnboarding?: boolean;
  player: {
    id: string;
    name: string;
    onboardingCompleted?: boolean;
  };
}

export default function PlayerNavigator() {
  const { user, refreshAuth } = useAuth();
  const queryClient = useQueryClient();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  // Fetch dashboard for player users who might need onboarding
  // Only fetch if user is a player role - owners/coaches viewing player mode have their own playerId
  const shouldFetchDashboard = user?.role === "player";
  
  const { data: dashboard, isLoading } = useQuery<PlayerDashboard>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: shouldFetchDashboard,
  });

  const handleOnboardingComplete = async () => {
    // Refresh user data to get the new playerId
    await refreshAuth();
    setOnboardingComplete(true);
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/me"] });
  };

  if (isLoading && shouldFetchDashboard) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
      </View>
    );
  }

  // Show onboarding only for new player users who haven't completed onboarding
  // Use isOnboarding flag from server to detect new players needing onboarding
  const needsOnboarding = dashboard?.isOnboarding === true && dashboard?.player?.onboardingCompleted === false;
  const showOnboarding = user?.role === "player" && needsOnboarding && onboardingComplete !== true;

  if (showOnboarding) {
    return <PlayerOnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  return <PlayerStackNavigator />;
}

const styles = StyleSheet.create({
  tabsContainer: {
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
