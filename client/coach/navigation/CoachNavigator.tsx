import React, { useState } from "react";
import { StyleSheet, View, Platform, ActivityIndicator, Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
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
import CoachInvitationsScreen from "@/coach/screens/CoachInvitationsScreen";
import CoachOnboardingScreen from "@/coach/screens/CoachOnboardingScreen";
import CoachEarningsScreen from "@/coach/screens/CoachEarningsScreen";
import MyReviewsScreen from "@/coach/screens/MyReviewsScreen";
import CoachHQScreen from "@/coach/screens/glow/CoachHQScreen";
import SessionPlanScreen from "@/coach/screens/glow/SessionPlanScreen";
import ActiveSessionScreen from "@/coach/screens/glow/ActiveSessionScreen";
import EvidenceCaptureScreen from "@/coach/screens/glow/EvidenceCaptureScreen";
import LevelCardsScreen from "@/coach/screens/glow/LevelCardsScreen";
import CoachCalibrationScreen from "@/coach/screens/glow/CoachCalibrationScreen";
import MatchReviewScreen from "@/coach/screens/glow/MatchReviewScreen";
import OfflineBanner from "@/components/OfflineBanner";
import { QuickActionsFAB, QuickAction } from "@/components/QuickActionsFAB";
import { useAuth } from "@/coach/context/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

function GamingTabIcon({ name, focused, size }: { name: keyof typeof Ionicons.glyphMap; focused: boolean; size: number }) {
  return (
    <View style={styles.tabIconContainer}>
      {focused && <View style={styles.tabIconGlow} />}
      <Ionicons 
        name={focused ? name.replace("-outline", "") as keyof typeof Ionicons.glyphMap : name} 
        size={size} 
        color={focused ? Colors.dark.primary : Colors.dark.tabIconDefault} 
      />
    </View>
  );
}

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
  CoachInvitations: undefined;
  CoachEarnings: undefined;
  MyReviews: undefined;
  CoachHQ: undefined;
  SessionPlan: { sessionId: string; playerId: string };
  ActiveSession: { sessionId: string; planId?: string };
  EvidenceCapture: { skillTags?: string[]; sessionId?: string; blockId?: string; playerId?: string };
  LevelCards: undefined;
  CoachCalibration: undefined;
  MatchReview: { matchId: string };
};

const Tab = createBottomTabNavigator<CoachTabParamList>();
const Stack = createNativeStackNavigator<CoachStackParamList>();

function CoachTabs() {
  const [currentTab, setCurrentTab] = useState("Dashboard");
  
  return (
    <View style={styles.tabsWrapper}>
      <Tab.Navigator
        screenListeners={{
          state: (e) => {
            const state = e.data.state;
            if (state) {
              const routeName = state.routes[state.index]?.name;
              if (routeName) setCurrentTab(routeName);
            }
          },
        }}
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarBackground: () => (
            <View style={styles.tabBarBackground}>
              <LinearGradient
                colors={[Colors.dark.primary + "40", "transparent", Colors.dark.xpCyan + "40"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.tabBarTopLine}
              />
              {Platform.OS === "ios" ? (
                <BlurView
                  intensity={90}
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
            tabBarIcon: ({ focused, size }) => (
              <GamingTabIcon name="home-outline" focused={focused} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="Calendar"
          component={CalendarScreen}
          options={{
            tabBarLabel: "Calendar",
            tabBarIcon: ({ focused, size }) => (
              <GamingTabIcon name="calendar-outline" focused={focused} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="Players"
          component={PlayersScreen}
          options={{
            tabBarLabel: "Players",
            tabBarIcon: ({ focused, size }) => (
              <GamingTabIcon name="people-outline" focused={focused} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="Coaching"
          component={CoachingScreen}
          options={{
            tabBarLabel: "Coaching",
            tabBarIcon: ({ focused, size }) => (
              <GamingTabIcon name="clipboard-outline" focused={focused} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: "Settings",
            tabBarIcon: ({ focused, size }) => (
              <GamingTabIcon name="settings-outline" focused={focused} size={size} />
            ),
          }}
        />
      </Tab.Navigator>
      {currentTab !== "Calendar" && <CoachQuickActionsFAB />}
    </View>
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
      <Stack.Screen 
        name="CoachInvitations" 
        component={CoachInvitationsScreen}
      />
      <Stack.Screen 
        name="CoachEarnings" 
        component={CoachEarningsScreen}
      />
      <Stack.Screen 
        name="MyReviews" 
        component={MyReviewsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen 
        name="CoachHQ" 
        component={CoachHQScreen}
        options={{
          headerShown: true,
          headerTitle: "Coach HQ",
        }}
      />
      <Stack.Screen 
        name="SessionPlan" 
        component={SessionPlanScreen}
        options={{
          headerShown: true,
          headerTitle: "Session Plan",
        }}
      />
      <Stack.Screen 
        name="ActiveSession" 
        component={ActiveSessionScreen}
        options={{
          headerShown: true,
          headerTitle: "Active Session",
        }}
      />
      <Stack.Screen 
        name="EvidenceCapture" 
        component={EvidenceCaptureScreen}
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
        }}
      />
      <Stack.Screen 
        name="LevelCards" 
        component={LevelCardsScreen}
        options={{
          headerShown: true,
          headerTitle: "Level Cards",
        }}
      />
      <Stack.Screen 
        name="CoachCalibration" 
        component={CoachCalibrationScreen}
        options={{
          headerShown: true,
          headerTitle: "Coach Calibration",
        }}
      />
      <Stack.Screen 
        name="MatchReview" 
        component={MatchReviewScreen}
        options={{
          headerShown: false,
          presentation: "card",
        }}
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

  usePushNotifications();

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

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <CoachStackNavigator />
    </View>
  );
}

function CoachQuickActionsFAB() {
  const navigation = useNavigation<any>();

  const coachActions: QuickAction[] = [
    {
      id: "new-session",
      label: "New Session",
      icon: "add-circle-outline",
      color: Colors.dark.primary,
      onPress: () => navigation.navigate("CoachTabs", { screen: "Calendar", params: { openWizard: true } }),
    },
    {
      id: "quick-feedback",
      label: "Quick Feedback",
      icon: "chatbubble-ellipses-outline",
      color: Colors.dark.xpCyan,
      onPress: () => navigation.navigate("CoachTabs", { screen: "Coaching" }),
    },
    {
      id: "add-player",
      label: "Add Player",
      icon: "person-add-outline",
      color: Colors.dark.orange,
      onPress: () => navigation.navigate("CoachTabs", { screen: "Players" }),
    },
    {
      id: "log-match",
      label: "Log Match",
      icon: "trophy-outline",
      color: Colors.dark.gold,
      onPress: () => navigation.navigate("CoachHQ"),
    },
    {
      id: "chat",
      label: "Messages",
      icon: "mail-outline",
      color: Colors.dark.ballGlow,
      onPress: () => navigation.navigate("ChatInbox"),
    },
    {
      id: "level-cards",
      label: "Level Cards",
      icon: "ribbon-outline",
      color: Colors.dark.successNeon,
      onPress: () => navigation.navigate("LevelCards"),
    },
  ];

  return (
    <QuickActionsFAB
      actions={coachActions}
      primaryColor={Colors.dark.xpCyan}
      secondaryColor={Colors.dark.primary}
    />
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
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: Platform.OS === "web" ? "rgba(12, 12, 12, 0.98)" : "transparent",
    height: 85,
    paddingTop: 8,
  },
  tabBarBackground: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  tabBarTopLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 10,
  },
  androidTabBackground: {
    backgroundColor: "rgba(12, 12, 12, 0.98)",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tabIconContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
  },
  tabIconGlow: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary,
    opacity: 0.2,
  },
});
