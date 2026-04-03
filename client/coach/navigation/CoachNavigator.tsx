import React, { useState, useCallback, useMemo, useEffect } from "react";
import { StyleSheet, View, Platform, ActivityIndicator, Text, Pressable, useWindowDimensions } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SwipeableTabBar, TabConfig } from "@/components/SwipeableTabBar";
import { TabNavigationProvider } from "@/components/TabNavigationContext";
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
import LessonTemplateLibraryScreen from "@/coach/screens/glow/LessonTemplateLibraryScreen";
import WellbeingDetailScreen from "@/coach/screens/WellbeingDetailScreen";
import WellnessLogScreen from "@/coach/screens/WellnessLogScreen";
import VideoFeedbackScreen from "@/coach/screens/VideoFeedbackScreen";
import MatchHistoryScreen from "@/player/screens/MatchHistoryScreen";
import LiveMatchViewerScreen from "@/player/screens/LiveMatchViewerScreen";
import TournamentManagementScreen from "@/coach/screens/TournamentManagementScreen";
import AiUsageScreen from "@/coach/screens/AiUsageScreen";
import OfflineBanner from "@/components/OfflineBanner";
import { QuickActionsFAB, QuickAction } from "@/components/QuickActionsFAB";
import { PremiumAddPlayerFlow } from "@/coach/components/PremiumAddPlayerFlow";
import { useAuth } from "@/coach/context/AuthContext";
import { useCoach } from "@/coach/context/CoachContext";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors } from "@/constants/theme";
import { ChatStateProvider, useChatState } from "@/coach/context/ChatStateContext";
import { useTranslation } from "react-i18next";
import { DesktopShell } from "@/components/DesktopShell";

const WEB_DESKTOP_BREAKPOINT = 1024;

export type CoachTabParamList = {
  Dashboard: undefined;
  Calendar: undefined;
  Players: undefined;
  Coaching: undefined;
  Settings: undefined;
};

const BASE_COACH_TABS: Omit<TabConfig, 'label'>[] = [
  { key: "Dashboard", icon: "home-outline", iconFocused: "home", component: DashboardScreen },
  { key: "Calendar", icon: "calendar-outline", iconFocused: "calendar", component: CalendarScreen },
  { key: "Players", icon: "people-outline", iconFocused: "people", component: PlayersScreen },
  { key: "Coaching", icon: "clipboard-outline", iconFocused: "clipboard", component: CoachingScreen },
  { key: "Settings", icon: "settings-outline", iconFocused: "settings", component: SettingsScreen },
];

export type CoachStackParamList = {
  CoachTabs: undefined;
  History: undefined;
  Notifications: undefined;
  CoachProfile: undefined;
  ChatInbox: undefined;
  Availability: undefined;
  CourtPreferences: undefined;
  Templates: undefined;
  LessonTemplateLibrary: undefined;
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
  WellbeingDetail: undefined;
  WellnessLog: undefined;
  VideoFeedback: { playerId?: string } | undefined;
  PlayerMatchHistory: { playerId: string; playerName?: string };
  LiveMatchViewer: { matchId: string; playerName?: string };
  TournamentManagement: { tournamentId?: string } | undefined;
  AiUsage: undefined;
};

const Stack = createNativeStackNavigator<CoachStackParamList>();

// Custom animated tab bar item
function CoachTabs() {
  const { t } = useTranslation();
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [currentTabKey, setCurrentTabKey] = useState("Dashboard");
  const queryClient = useQueryClient();
  const { isChatExpanded } = useChatState();
  const { coach, academy } = useCoach();
  const { width } = useWindowDimensions();

  const isDesktop = Platform.OS === "web" && width >= WEB_DESKTOP_BREAKPOINT;

  const TAB_LABELS: Record<string, string> = {
    Dashboard: t("nav.home"),
    Calendar: t("coach.calendar.title"),
    Players: t("nav.players"),
    Coaching: t("nav.coaching"),
    Settings: t("nav.settings"),
  };

  const COACH_TABS: TabConfig[] = BASE_COACH_TABS.map((tab) => ({
    ...tab,
    label: TAB_LABELS[tab.key] || tab.key,
  }));

  const handlePageChange = useCallback((index: number, key: string) => {
    setCurrentTabKey(key);
  }, []);

  const renderOverlay = useCallback((tabKey: string) => {
    const shouldShowFAB = tabKey !== "Calendar" && tabKey !== "Players";
    if (!shouldShowFAB || isChatExpanded) return null;
    return <CoachQuickActionsFAB onAddPlayer={() => setShowAddPlayerModal(true)} />;
  }, [isChatExpanded]);

  const tabBar = (
    <SwipeableTabBar
      tabs={COACH_TABS}
      primaryColor={Colors.dark.primary}
      secondaryColor={Colors.dark.xpCyan}
      onPageChange={handlePageChange}
      renderOverlay={isDesktop ? undefined : renderOverlay}
      hideTabBar={isDesktop}
    />
  );

  return (
    <>
      {isDesktop ? (
        <DesktopShell coachName={coach?.name} academyName={academy?.name}>
          {tabBar}
        </DesktopShell>
      ) : tabBar}
      <PremiumAddPlayerFlow
        visible={showAddPlayerModal}
        onClose={() => setShowAddPlayerModal(false)}
        onComplete={(player) => {
          queryClient.invalidateQueries({ queryKey: ["/api/players"] });
          queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
        }}
      />
    </>
  );
}

function CoachStackNavigator() {
  const { t } = useTranslation();
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
        name="LessonTemplateLibrary" 
        component={LessonTemplateLibraryScreen}
        options={{
          headerShown: true,
          headerTitle: t("coach.settings.templates"),
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
      <Stack.Screen 
        name="WellbeingDetail" 
        component={WellbeingDetailScreen}
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="WellnessLog" 
        component={WellnessLogScreen}
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="VideoFeedback" 
        component={VideoFeedbackScreen}
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="PlayerMatchHistory"
        component={MatchHistoryScreen}
        options={({ route }) => ({
          headerShown: true,
          headerTitle: route.params?.playerName
            ? `${route.params.playerName}'s Matches`
            : "Match History",
          presentation: "card",
        })}
      />
      <Stack.Screen
        name="LiveMatchViewer"
        component={LiveMatchViewerScreen}
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="TournamentManagement" 
        component={TournamentManagementScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="AiUsage"
        component={AiUsageScreen}
        options={{
          headerShown: true,
          headerTitle: "AI Usage",
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
    academyId?: string;
  };
}

export default function CoachNavigator() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [activatingRoles, setActivatingRoles] = useState(false);

  useEffect(() => {
    if (user && !user.coachId && (user.role === "academy_owner" || user.role === "owner") && !activatingRoles) {
      setActivatingRoles(true);
      const activateRoles = async () => {
        try {
          const { apiRequest } = await import("@/lib/query-client");
          await apiRequest("POST", "/api/owner/activate-roles");
          queryClient.invalidateQueries({ queryKey: ["/api/me"] });
        } catch (e) {
          console.error("Failed to activate roles:", e);
        } finally {
          setActivatingRoles(false);
        }
      };
      activateRoles();
    }
  }, [user?.coachId, user?.role]);

  const { data: profile, isLoading } = useQuery<CoachProfile>({
    queryKey: ["/api/coach/me/profile"],
    enabled: !!user?.coachId,
  });

  const handleOnboardingComplete = () => {
    setOnboardingComplete(true);
    queryClient.invalidateQueries({ queryKey: ["/api/coach/me/profile"] });
  };

  if (isLoading || activatingRoles) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Pressable
          onPress={logout}
          style={{ marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 8 }}
        >
          <Text style={{ color: "#fff", fontSize: 14 }}>Log Out</Text>
        </Pressable>
      </View>
    );
  }

  const coachOnboardingCompleted = profile?.coach?.onboardingCompleted ?? false;
  const hasAcademy = !!profile?.coach?.academyId;
  const showOnboarding = user?.coachId && !coachOnboardingCompleted && !hasAcademy && onboardingComplete !== true;

  if (showOnboarding) {
    return <CoachOnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  return (
    <ChatStateProvider>
      <TabNavigationProvider>
        <View style={styles.container}>
          <OfflineBanner />
          <CoachStackNavigator />
        </View>
      </TabNavigationProvider>
    </ChatStateProvider>
  );
}

function CoachQuickActionsFAB({ onAddPlayer }: { onAddPlayer: () => void }) {
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
      onPress: onAddPlayer,
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
    {
      id: "video-feedback",
      label: "Video Feedback",
      icon: "videocam-outline",
      color: "#4DA3FF",
      onPress: () => navigation.navigate("VideoFeedback"),
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
  pagerView: {
    flex: 1,
  },
  pageContainer: {
    flex: 1,
  },
  swipeTabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 8,
  },
  swipeTabBarBackground: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  swipeTabRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 8,
  },
  swipeTabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  swipeTabIconContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
  },
  swipeTabLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tabIndicator: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 3,
    zIndex: 20,
  },
  tabIndicatorGradient: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 2,
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
    backgroundColor: "rgba(11, 13, 16, 0.98)",
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
