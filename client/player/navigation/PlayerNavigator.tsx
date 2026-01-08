import React, { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { HeaderButton } from "@react-navigation/elements";
import { StyleSheet, View, Platform, ActivityIndicator, ViewStyle } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PlayerHomeScreen from "@/player/screens/PlayerHomeScreen";
import PlayerJourneyScreen from "@/player/screens/PlayerJourneyScreen";
import PlayScreen from "@/player/screens/PlayScreen";
import PlayerTrainingScreen from "@/player/screens/PlayerTrainingScreen";
import PlayerProgressScreen from "@/player/screens/PlayerProgressScreen";
import PlayerScheduleScreen from "@/player/screens/PlayerScheduleScreen";
import PlayerProfileScreen from "@/player/screens/PlayerProfileScreen";
import TrainingDetailScreen from "@/player/screens/TrainingDetailScreen";
import SkillDetailScreen from "@/player/screens/SkillDetailScreen";
import PlayerSettingsScreen from "@/player/screens/PlayerSettingsScreen";
import AcademyBrowserScreen from "@/player/screens/AcademyBrowserScreen";
import AcademyProfileScreen from "@/player/screens/AcademyProfileScreen";
import CoachDirectoryScreen from "@/player/screens/CoachDirectoryScreen";
import TransferRequestScreen from "@/player/screens/TransferRequestScreen";
import PlayerOnboardingScreen from "@/player/screens/PlayerOnboardingScreen";
import ParentDashboardScreen from "@/player/screens/ParentDashboardScreen";
import ParentInvoicesScreen from "@/player/screens/ParentInvoicesScreen";
import ParentPaymentsScreen from "@/player/screens/ParentPaymentsScreen";
import ParentLessonsScreen from "@/player/screens/ParentLessonsScreen";
import ParentSettingsScreen from "@/player/screens/ParentSettingsScreen";
import ParentCreditStoreScreen from "@/player/screens/ParentCreditStoreScreen";
import CourtBookingScreen from "@/player/screens/CourtBookingScreen";
import CourtDetailScreen from "@/player/screens/CourtDetailScreen";
import MyCourtBookingsScreen from "@/player/screens/MyCourtBookingsScreen";
import LessonBookingScreen from "@/player/screens/LessonBookingScreen";
import MyLessonRequestsScreen from "@/player/screens/MyLessonRequestsScreen";
import PlayerFinderScreen from "@/player/screens/PlayerFinderScreen";
import GlowLeaderboardScreen from "@/player/screens/GlowLeaderboardScreen";
import FriendsListScreen from "@/player/screens/FriendsListScreen";
import PlayerMessagesScreen from "@/player/screens/PlayerMessagesScreen";
import PlayerNotificationsScreen from "@/player/screens/PlayerNotificationsScreen";
import PlayerHelpScreen from "@/player/screens/PlayerHelpScreen";
import PlayerPublicProfileScreen from "@/player/screens/PlayerPublicProfileScreen";
import PlayerCoachProfileScreen from "@/player/screens/PlayerCoachProfileScreen";
import CommunityScreen from "@/player/screens/CommunityScreen";
import PlayerIdentityDrawer from "@/components/PlayerIdentityDrawer";
import { CoachChatFooter } from "@/coach/components/CoachChatFooter";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { PlayerDrawerProvider, usePlayerDrawer } from "@/player/context/PlayerDrawerContext";

export { usePlayerDrawer };

export type PlayerTabParamList = {
  Home: undefined;
  Community: undefined;
  Play: undefined;
  Schedule: undefined;
  Progress: undefined;
  Profile: undefined;
};

export type PlayerStackParamList = {
  PlayerTabs: undefined;
  Training: undefined;
  TrainingDetail: { sessionId: string };
  SkillDetail: { domain: string };
  Journey: undefined;
  Settings: undefined;
  AcademyBrowser: undefined;
  AcademyProfile: { academyId: string };
  CoachDirectory: undefined;
  TransferRequest: { academyId?: string; academyName?: string } | undefined;
  ParentDashboard: undefined;
  ParentInvoices: { playerId: string };
  ParentPayments: { playerId: string };
  ParentLessons: { playerId: string };
  ParentCreditStore: { playerId: string };
  ParentSettings: undefined;
  CourtBooking: undefined;
  CourtDetail: { courtId: string; date: string };
  MyCourtBookings: undefined;
  LessonBooking: undefined;
  MyLessonRequests: undefined;
  PlayerFinder: undefined;
  GlowLeaderboard: undefined;
  FriendsList: undefined;
  PlayerMessages: undefined;
  PlayerNotifications: undefined;
  PlayerHelp: undefined;
  PublicProfile: { playerId?: string };
  CoachProfile: { coachId: string };
};

const Tab = createBottomTabNavigator<PlayerTabParamList>();
const Stack = createNativeStackNavigator<PlayerStackParamList>();

function PlayerTabsContent() {
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
          tabBarActiveTintColor: Colors.dark.primary,
          tabBarInactiveTintColor: Colors.dark.tabIconDefault,
          tabBarLabelStyle: styles.tabLabel,
          tabBarIconStyle: { marginBottom: -2 },
        }}
      >
        <Tab.Screen
          name="Home"
          component={PlayerHomeScreen}
          options={{
            tabBarLabel: "Home",
            tabBarIcon: ({ color }) => (
              <Ionicons name="home-outline" size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Community"
          component={CommunityScreen}
          options={{
            tabBarLabel: "Social",
            tabBarIcon: ({ color }) => (
              <Ionicons name="people-outline" size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Play"
          component={PlayScreen}
          options={{
            tabBarLabel: "Play",
            tabBarIcon: ({ color }) => (
              <Ionicons name="game-controller-outline" size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Schedule"
          component={PlayerScheduleScreen}
          options={{
            tabBarLabel: "Schedule",
            tabBarIcon: ({ color }) => (
              <Ionicons name="calendar-outline" size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Progress"
          component={PlayerProgressScreen}
          options={{
            tabBarLabel: "Progress",
            tabBarIcon: ({ color }) => (
              <Ionicons name="stats-chart-outline" size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={PlayerProfileScreen}
          options={{
            tabBarLabel: "Profile",
            tabBarIcon: ({ color }) => (
              <Ionicons name="person-outline" size={22} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
      <CoachChatFooter mode="player" />
    </View>
  );
}

function PlayerTabsWithDrawer() {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const navigation = useNavigation<any>();
  const { setOpenDrawer } = usePlayerDrawer();
  
  React.useEffect(() => {
    setOpenDrawer(() => setDrawerVisible(true));
  }, [setOpenDrawer]);
  
  const navigateToProfile = () => {
    setDrawerVisible(false);
    setTimeout(() => {
      navigation.navigate("PlayerTabs", { screen: "Profile" });
    }, 100);
  };
  
  return (
    <View style={{ flex: 1 }}>
      <PlayerTabsContent />
      <PlayerIdentityDrawer 
        visible={drawerVisible} 
        onClose={() => setDrawerVisible(false)}
        onNavigateToProfile={navigateToProfile}
      />
    </View>
  );
}

function PlayerTabs() {
  return (
    <PlayerDrawerProvider>
      <PlayerTabsWithDrawer />
    </PlayerDrawerProvider>
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
        name="Journey" 
        component={PlayerJourneyScreen}
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
        name="AcademyBrowser" 
        component={AcademyBrowserScreen}
        options={{
          presentation: "modal",
        }}
      />
      <Stack.Screen 
        name="AcademyProfile" 
        component={AcademyProfileScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="CoachDirectory" 
        component={CoachDirectoryScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="TransferRequest" 
        component={TransferRequestScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="ParentDashboard" 
        component={ParentDashboardScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="ParentInvoices" 
        component={ParentInvoicesScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="ParentPayments" 
        component={ParentPaymentsScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="ParentLessons" 
        component={ParentLessonsScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="ParentSettings" 
        component={ParentSettingsScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="ParentCreditStore" 
        component={ParentCreditStoreScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="CourtBooking" 
        component={CourtBookingScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="CourtDetail" 
        component={CourtDetailScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="MyCourtBookings" 
        component={MyCourtBookingsScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="LessonBooking" 
        component={LessonBookingScreen}
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
        }}
      />
      <Stack.Screen 
        name="MyLessonRequests" 
        component={MyLessonRequestsScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "My Requests",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.text,
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen 
        name="PlayerFinder" 
        component={PlayerFinderScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="GlowLeaderboard" 
        component={GlowLeaderboardScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="FriendsList" 
        component={FriendsListScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="PlayerMessages" 
        component={PlayerMessagesScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="PlayerNotifications" 
        component={PlayerNotificationsScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="PlayerHelp" 
        component={PlayerHelpScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="PublicProfile" 
        component={PlayerPublicProfileScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Player Profile",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.text,
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen 
        name="CoachProfile" 
        component={PlayerCoachProfileScreen}
        options={{
          presentation: "card",
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
    academyId?: string | null;
  };
}

export default function PlayerNavigator() {
  const { user, refreshAuth } = useAuth();
  const queryClient = useQueryClient();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  usePushNotifications();

  // Fetch dashboard for player users who might need onboarding
  // Only fetch if user is a player role - owners/coaches viewing player mode have their own playerId
  const shouldFetchDashboard = user?.role === "player";
  
  const { data: dashboard, isLoading } = useQuery<PlayerDashboard>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: shouldFetchDashboard,
    staleTime: 0,
    refetchOnMount: "always",
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

  // Show onboarding for player users who haven't completed onboarding OR don't have an academy
  // The server's isOnboarding flag now checks both onboardingCompleted and academyId
  const needsOnboarding = dashboard?.isOnboarding === true;
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
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: Platform.OS === "web" ? "rgba(18, 18, 18, 0.95)" : "transparent",
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
    marginTop: -2,
  },
});
