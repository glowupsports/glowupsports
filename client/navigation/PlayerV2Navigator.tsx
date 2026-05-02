import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { PlayerProvider as PlayerDataProvider } from "@/player/context/PlayerContext";
import { PlayerAppearanceProvider } from "@/player/context/PlayerAppearanceContext";
import { PlayerDrawerProvider, usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { TabNavigationProvider, useTabNavigation } from "@/components/TabNavigationContext";
import { SportContextProvider } from "@/player/context/SportContext";
import { ScheduleFocusProvider } from "@/player/context/ScheduleFocusContext";
import { FamilyProvider } from "@/player/context/FamilyContext";
import { PlayerLevelProvider } from "@/player/context/PlayerLevelContext";
import { CartProvider } from "@/player/contexts/CartContext";
import { useChatState } from "@/coach/context/ChatStateContext";
import { SwipeableTabBar, TabConfig } from "@/components/SwipeableTabBar";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiFetch } from "@/lib/query-client";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";

import PlayerIdentityDrawer from "@/components/PlayerIdentityDrawer";
import { CoachChatFooter } from "@/coach/components/CoachChatFooter";

// ── Onboarding ───────────────────────────────────────────────────────────────
import PlayerOnboardingV2 from "@/player/screens/PlayerOnboardingV2";
import AddFamilyMemberPrompt from "@/player/components/AddFamilyMemberPrompt";

// ── Tab screens ─────────────────────────────────────────────────────────────
import ProPlayerHomeDiagnosticScreen from "@/player/screens/ProPlayerHomeDiagnosticScreen";
import CommunityScreen from "@/player/screens/CommunityScreen";
import PlayerProfileScreen from "@/player/screens/PlayerProfileScreen";
import {
  PlayStackNavigator,
  ProgressStackNavigator,
} from "@/player/navigation/PlayerNavigator";

// ── Push screens (mirrors PlayerStackNavigator exactly) ──────────────────────
import FamilyLobbyScreen from "@/player/screens/FamilyLobbyScreen";
import ParentCreditStoreScreen from "@/player/screens/ParentCreditStoreScreen";
import PlayerNotificationsScreen from "@/player/screens/PlayerNotificationsScreen";
import PlayerGuideScreen from "@/player/screens/PlayerGuideScreen";
import PlayerDNAWizardScreen from "@/player/screens/PlayerDNAWizard";
import PlayerSettingsScreen from "@/player/screens/PlayerSettingsScreen";
import ThemePreviewScreen from "@/player/screens/ThemePreviewScreen";
import PlayerEditProfileScreen from "@/player/screens/PlayerEditProfileScreen";
import AcademyBrowserScreen from "@/player/screens/AcademyBrowserScreen";
import AcademyProfileScreen from "@/player/screens/AcademyProfileScreen";
import CoachDirectoryScreen from "@/player/screens/CoachDirectoryScreen";
import TransferRequestScreen from "@/player/screens/TransferRequestScreen";
import PlayerHolidaysScreen from "@/player/screens/PlayerHolidaysScreen";
import AccountAuditLogScreen from "@/player/screens/AccountAuditLogScreen";
import ManageMatchScreen from "@/player/screens/ManageMatchScreen";
import ParentDashboardScreen from "@/player/screens/ParentDashboardScreen";
import ParentLessonsScreen from "@/player/screens/ParentLessonsScreen";
import ParentSettingsScreen from "@/player/screens/ParentSettingsScreen";
import ParentReportsScreen from "@/player/screens/ParentReportsScreen";
import QuickBookScreen from "@/player/screens/QuickBookScreen";
import LessonBookingScreen from "@/player/screens/LessonBookingScreen";
import BrowseGroupLessonsScreen from "@/player/screens/BrowseGroupLessonsScreen";
import MyLessonRequestsScreen from "@/player/screens/MyLessonRequestsScreen";
import BookingConfirmedScreen from "@/player/screens/BookingConfirmedScreen";
import PlayerFinderScreen from "@/player/screens/PlayerFinderScreen";
import FriendsListScreen from "@/player/screens/FriendsListScreen";
import NewsScreen from "@/player/screens/NewsScreen";
import SpotlightDetailScreen from "@/player/screens/SpotlightDetailScreen";
import AcademyVsAcademyScreen from "@/player/screens/AcademyVsAcademyScreen";
import SkillChallengeSubmissionsScreen from "@/player/screens/SkillChallengeSubmissionsScreen";
import SquadGroupScreen from "@/player/screens/SquadGroupScreen";
import MatchLiveScreen from "@/player/screens/MatchLiveScreen";
import StartLiveMatchScreen from "@/player/screens/StartLiveMatchScreen";
import MatchSummaryScreen from "@/player/screens/MatchSummaryScreen";
import LiveMatchViewerScreen from "@/player/screens/LiveMatchViewerScreen";
import MatchHistoryScreen from "@/player/screens/MatchHistoryScreen";
import VideoFeedbackPlayerScreen from "@/player/screens/VideoFeedbackPlayerScreen";
import PlayerAICoachScreen from "@/player/screens/PlayerAICoachScreen";
import YearInTennisScreen from "@/player/screens/YearInTennisScreen";
import GroupsScreen from "@/player/screens/GroupsScreen";
import GroupDetailScreen from "@/player/screens/GroupDetailScreen";
import PlayerMessagesScreen from "@/player/screens/PlayerMessagesScreen";
import ChatRoomScreen from "@/player/screens/ChatRoomScreen";
import BrowseChatRoomsScreen from "@/player/screens/BrowseChatRoomsScreen";
import PlayerBookingChatScreen from "@/player/screens/PlayerBookingChatScreen";
import PlayerPublicProfileScreen from "@/player/screens/PlayerPublicProfileScreen";
import PlayerCoachProfileScreen from "@/player/screens/PlayerCoachProfileScreen";
import PlayerAcademyProfileScreen from "@/player/screens/PlayerAcademyProfileScreen";
import ShopScreen from "@/player/screens/ShopScreen";
import ProductDetailScreen from "@/player/screens/ProductDetailScreen";
import ServiceDetailScreen from "@/player/screens/ServiceDetailScreen";
import PlayerOrderDetailScreen from "@/player/screens/PlayerOrderDetailScreen";
import CartScreen from "@/player/screens/CartScreen";
import ShopCategoryScreen from "@/player/screens/ShopCategoryScreen";
import MarketplaceScreen from "@/player/screens/MarketplaceScreen";
import PlayerEquipmentScreen from "@/player/screens/PlayerEquipmentScreen";
import MarketplaceListingDetailScreen from "@/player/screens/MarketplaceListingDetailScreen";
import MyListingsScreen from "@/player/screens/MyListingsScreen";
import BookingPreferencesScreen from "@/player/screens/BookingPreferencesScreen";
import BookingInvitesScreen from "@/player/screens/BookingInvitesScreen";
import CorporateBenefitsScreen from "@/player/screens/CorporateBenefitsScreen";
import CompanyContactDashboardScreen from "@/player/screens/CompanyContactDashboardScreen";
import FindGameScreen from "@/player/screens/FindGameScreen";
import CreateGameRequestScreen from "@/player/screens/CreateGameRequestScreen";
import MyGamesScreen from "@/player/screens/MyGamesScreen";
import DiscoveryMapScreen from "@/player/screens/DiscoveryMapScreen";
import ClassesDiscoveryScreen from "@/player/screens/ClassesDiscoveryScreen";
import ClassDetailScreen from "@/player/screens/ClassDetailScreen";
import PrivacySettingsScreen from "@/player/screens/PrivacySettingsScreen";
import PlayerTrainingScreen from "@/player/screens/PlayerTrainingScreen";
import TrainingDetailScreen from "@/player/screens/TrainingDetailScreen";
import SkillDetailScreen from "@/player/screens/SkillDetailScreen";
import PlayerJourneyScreen from "@/player/screens/PlayerJourneyScreen";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

// ─── Stack param list — mirrors PlayerStackParamList minus PlayerTabs ────────
export type PlayerV2StackParamList = {
  PlayerV2Home: undefined;
  // Family
  FamilyLobby: undefined;
  ParentCreditStore: { playerId?: string };
  ParentDashboard: undefined;
  ParentLessons: { playerId: string };
  ParentSettings: undefined;
  ParentReports: { playerId: string; childName?: string };
  // Notifications / Help
  PlayerNotifications: undefined;
  PlayerHelp: { initialTab?: "start" | "explore" | "faq" | "whatsnew" } | undefined;
  PlayerGuide: { initialTab?: "start" | "explore" | "faq" | "whatsnew" } | undefined;
  PlayerDNAWizard: undefined;
  // Profile / Settings
  Settings: undefined;
  ThemePreview: undefined;
  EditProfile: undefined;
  PlayerHolidays: undefined;
  AccountAuditLog: { playerId?: string; playerName?: string } | undefined;
  PrivacySettings: { isOnboarding?: boolean; currentLevel?: string };
  // Profiles
  PublicProfile: { playerId?: string };
  CoachProfile: { coachId: string };
  AcademyProfile: { academyId: string };
  AcademyPublicProfile: { academyId: string };
  AcademyBrowser: undefined;
  CoachDirectory: undefined;
  TransferRequest: { academyId?: string; academyName?: string } | undefined;
  // Social / Groups
  PlayerFinder: undefined;
  FriendsList: { initialTab?: "friends" | "requests" } | undefined;
  Groups: { initialTab?: "communities" | "training" | "discover" } | undefined;
  GroupDetail: { groupId: string; groupName: string };
  PlayerMessages: undefined;
  ChatRoom: { roomId: string; title?: string };
  BrowseChatRooms: undefined;
  PlayerBookingChat: { orderId?: string; conversationId?: string };
  // Booking
  QuickBook: undefined;
  LessonBooking: { sport?: string } | undefined;
  BrowseGroupLessons: undefined;
  MyLessonRequests: undefined;
  BookingConfirmed: {
    sessionType: string;
    dateStr: string;
    timeStr: string;
    coachName?: string;
    coachWelcomeMessage?: string;
    durationMinutes?: number;
  };
  BookingPreferences: undefined;
  BookingInvites: undefined;
  ManageMatch: { matchId: string };
  // Shop / Marketplace
  Shop: undefined;
  ProductDetail: { productId: string };
  ServiceDetail: { serviceId: string };
  PlayerOrderDetail: { orderId: string };
  Cart: undefined;
  ShopCategory: { categoryId?: string; categoryName: string; collection?: string };
  Marketplace: undefined;
  MarketplaceListing: { listingId: string };
  Equipment: undefined;
  MyListings: undefined;
  // Match / Live
  MatchLive: {
    matchId: string;
    opponentName: string;
    opponentId: string;
    sport: string;
    matchFormat: string;
    scoringMode: string;
    challengeId?: string;
    matchType?: string;
    scheduledDate?: string;
    scheduledTime?: string;
    courtName?: string;
    challengerId?: string;
  };
  StartLiveMatch: { opponentId: string; opponentName: string; challengeId?: string };
  MatchSummary: {
    matchId: string;
    opponentName: string;
    opponentId: string;
    winnerId?: string;
    setScoreSummary?: string;
    mmrDeltaCreator?: number;
    previousMmrCreator?: number;
    newMmrCreator?: number;
    previousRankCreator?: number;
    newRankCreator?: number;
    creatorId: string;
  };
  LiveMatchViewer: { matchId: string; playerName?: string };
  MatchHistory: { playerId?: string } | undefined;
  // Discovery / News
  News: undefined;
  SpotlightDetail: undefined;
  AcademyVsAcademy: undefined;
  SkillChallengeSubmissions: undefined;
  SquadGroup: { squadId: string; squadName?: string };
  DiscoveryMap: { initialFilter?: "all" | "academies" | "lessons" | "matches" | "tournaments" } | undefined;
  ClassesDiscovery: undefined;
  ClassDetail: { session: any };
  FindGame: undefined;
  CreateGameRequest: undefined;
  MyGames: undefined;
  // AI / Media
  VideoFeedbackPlayer: { feedbackId?: string } | undefined;
  PlayerAICoach: undefined;
  YearInTennis: { year?: number } | undefined;
  // Training
  Training: undefined;
  TrainingDetail: { sessionId: string };
  SkillDetail: { domain: string };
  Journey: undefined;
  // Corporate
  CorporateBenefits: undefined;
  CompanyContactDashboard: undefined;
  // Legacy redirects (no-op)
  Schedule: undefined;
  Quests: undefined;
  Progress: undefined;
};

const Stack = createNativeStackNavigator<PlayerV2StackParamList>();

// Chat only shows on Home tab — mirrors SHOW_CHAT_TABS = ["Home"] in PlayerNavigator
const SHOW_CHAT_TABS = ["Home"];

// Tab analytics keys — mirrors TAB_FEATURE_KEYS in PlayerNavigator
const TAB_FEATURE_KEYS: Record<string, string> = {
  Home: "tab:home",
  Community: "tab:social",
  PlayStack: "tab:play",
  Growth: "tab:growth",
  Profile: "tab:me",
};

// ── Gap 2: Last-used tab restore ─────────────────────────────────────────────
// Mirrors useResolvedInitialTab from PlayerNavigator exactly.
type PlayerRole = "free" | "academy";
const TAB_STORAGE_KEY = "player:tabs:lastUsed:v1";

interface StoredTabState {
  role: PlayerRole;
  tab: string;
  userId?: string;
}

function rolesDefaultTab(_role: PlayerRole): string {
  return "Home";
}

function useResolvedInitialTab(
  isFreePlayer: boolean,
  isPlayerStatusReady: boolean,
  userId: string | undefined,
  validTabKeys: Set<string>,
): { initialTabKey: string; isResolved: boolean } {
  const [resolved, setResolved] = useState<{ tab: string; ready: boolean }>({
    tab: rolesDefaultTab(isFreePlayer ? "free" : "academy"),
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (!isPlayerStatusReady) return;
    const role: PlayerRole = isFreePlayer ? "free" : "academy";

    AsyncStorage.getItem(TAB_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        let stored: StoredTabState | null = null;
        if (raw) {
          try { stored = JSON.parse(raw) as StoredTabState; } catch { stored = null; }
        }
        const sameContext =
          stored &&
          stored.role === role &&
          (!stored.userId || !userId || stored.userId === userId);
        const candidate =
          sameContext && stored && validTabKeys.has(stored.tab)
            ? stored.tab
            : rolesDefaultTab(role);
        if (!sameContext) {
          AsyncStorage.setItem(
            TAB_STORAGE_KEY,
            JSON.stringify({ role, tab: candidate, userId } satisfies StoredTabState),
          ).catch(() => {});
        }
        setResolved((prev) =>
          prev.tab === candidate && prev.ready === true
            ? prev
            : { tab: candidate, ready: true },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setResolved((prev) => {
          const next = rolesDefaultTab(role);
          return prev.tab === next && prev.ready === true
            ? prev
            : { tab: next, ready: true };
        });
      });
    return () => { cancelled = true; };
  }, [isFreePlayer, isPlayerStatusReady, userId, validTabKeys]);

  return { initialTabKey: resolved.tab, isResolved: resolved.ready };
}

// ── Gap 1 helper: free-player status (needed for tab restore role) ────────────
function useFreePlayerStatus(): { isFreePlayer: boolean; isReady: boolean } {
  const { user } = useAuth();
  const { data, isFetched } = useQuery<{ isFreePlayer?: boolean; academy?: unknown }>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!user?.playerId,
    staleTime: 10 * 60 * 1000,
  });
  if (!user?.playerId) return { isFreePlayer: false, isReady: true };
  if (!data) return { isFreePlayer: false, isReady: isFetched };
  const isFreePlayer = data.isFreePlayer ?? !data.academy;
  return { isFreePlayer, isReady: true };
}

// ─── Tab bar view ─────────────────────────────────────────────────────────────
function PlayerV2TabView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isChatExpanded } = useChatState();
  const { navigateToTab } = useTabNavigation();
  const { openDrawer, isOpen: drawerOpen } = usePlayerDrawer();

  // Gap 5: feature tracking
  const track = useTrackFeature();
  const isMountedRef = useRef(false);

  // Gap 2: free-player status for tab restore
  const { isFreePlayer, isReady: isPlayerStatusReady } = useFreePlayerStatus();

  // Community unread badge — exact same query as PlayerTabsContent
  const { data: communityUnread } = useQuery<{ count: number }>({
    queryKey: ["/api/player/me/notifications/unread-count", "community_group_join"],
    queryFn: async () => {
      const resp = await apiFetch(
        "/api/player/me/notifications/unread-count?type=community_group_join",
      );
      if (!resp.ok) return { count: 0 };
      return resp.json();
    },
    enabled: !!user?.playerId,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const hasCommunityUnread = (communityUnread?.count ?? 0) > 0;

  const tabs: TabConfig[] = useMemo(() => [
    { key: "Home",      label: "Home",   icon: "home-outline",            iconFocused: "home",            component: ProPlayerHomeDiagnosticScreen },
    { key: "Community", label: "Social", icon: "people-outline",          iconFocused: "people",          component: CommunityScreen, badge: hasCommunityUnread },
    { key: "PlayStack", label: "Play",   icon: "game-controller-outline", iconFocused: "game-controller", component: PlayStackNavigator },
    { key: "Growth",    label: "Growth", icon: "trending-up-outline",     iconFocused: "trending-up",     component: ProgressStackNavigator },
    { key: "Profile",   label: "Me",     icon: "person-outline",          iconFocused: "person",          component: PlayerProfileScreen },
  ], [hasCommunityUnread]);

  const validTabKeys = useMemo(() => new Set(tabs.map((tab) => tab.key)), [tabs]);

  // Gap 2: resolve initial tab from AsyncStorage
  const { initialTabKey, isResolved } = useResolvedInitialTab(
    isFreePlayer,
    isPlayerStatusReady,
    user?.playerId ?? undefined,
    validTabKeys,
  );
  const initialPage = tabs.findIndex((tab) => tab.key === initialTabKey);

  // Gap 2: once resolved, jump imperatively to the restored tab (one-shot)
  const restoredOnceRef = useRef(false);
  const [currentTabKey, setCurrentTabKey] = useState(initialTabKey);
  useEffect(() => {
    if (!isResolved) return;
    if (restoredOnceRef.current) return;
    restoredOnceRef.current = true;
    if (initialTabKey && initialTabKey !== currentTabKey) {
      navigateToTab(initialTabKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResolved, initialTabKey, navigateToTab]);

  const playCenterButton = useMemo(() => ({
    icon: "tennisball-outline" as const,
    iconFocused: "tennisball" as const,
    label: "Play",
    color: Colors.dark.primary,
    pagerIndex: 2,
  }), []);

  const handleChallenge = useCallback(
    (opponentId: string, opponentName: string, opponentPhoto?: string) => {
      navigateToTab("PlayStack", { screen: "ChallengePlayer", params: { opponentId, opponentName, opponentPhoto } });
    },
    [navigateToTab],
  );

  // Gap 5: track tab feature + Gap 2: persist last-used tab
  const handlePageChange = useCallback((_index: number, key: string) => {
    setCurrentTabKey(key);

    // Gap 5: analytics
    const featureKey = TAB_FEATURE_KEYS[key];
    if (featureKey && isMountedRef.current) {
      track(featureKey);
    }
    isMountedRef.current = true;

    // Gap 2: persist last-used tab
    if (isResolved) {
      const role: PlayerRole = isFreePlayer ? "free" : "academy";
      AsyncStorage.setItem(
        TAB_STORAGE_KEY,
        JSON.stringify({ role, tab: key, userId: user?.playerId ?? undefined } satisfies StoredTabState),
      ).catch(() => {});
    }
  }, [track, isResolved, isFreePlayer, user?.playerId]);

  const renderOverlay = useCallback((tabKey: string) => {
    if (drawerOpen) return null;
    if (!SHOW_CHAT_TABS.includes(tabKey)) return null;
    return <CoachChatFooter mode="player" onChallenge={handleChallenge} />;
  }, [drawerOpen, handleChallenge]);

  // Gap 4: edge-swipe opens the drawer via context
  const handleEdgeSwipeLeft = useCallback(() => {
    openDrawer();
  }, [openDrawer]);

  return (
    <SwipeableTabBar
      tabs={tabs}
      initialPage={initialPage >= 0 ? initialPage : 0}
      primaryColor={Colors.dark.primary}
      secondaryColor={Colors.dark.primary}
      onEdgeSwipeLeft={handleEdgeSwipeLeft}
      onPageChange={handlePageChange}
      renderOverlay={renderOverlay}
      centerButtonConfig={drawerOpen ? undefined : playCenterButton}
      hideTabBar={isChatExpanded}
    />
  );
}

// ─── Stack + Drawer ───────────────────────────────────────────────────────────
function PlayerV2StackWithDrawer() {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const navigation = useNavigation<any>();
  const { setOpenDrawer, syncDrawerOpen } = usePlayerDrawer();
  const { navigateToTab } = useTabNavigation();

  // Register the drawer-open callback so PlayerV2TabView's edge-swipe
  // and the drawer icon both work correctly.
  React.useEffect(() => {
    setOpenDrawer(() => setDrawerVisible(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync local drawerVisible into context so PlayerV2TabView can read isOpen
  // for Gap C (overlay) and Gap D (center button).
  React.useEffect(() => {
    syncDrawerOpen(drawerVisible);
  }, [drawerVisible, syncDrawerOpen]);

  // Gap A: mirror V1's handleDrawerNavigate — intercept "PlayerTabs" navigations
  // so every drawer menu item (Dashboard, Sessions, Plan, Quests, etc.) works.
  const handleDrawerNavigate = useCallback(
    (screen: string, params?: Record<string, unknown>) => {
      if (screen === "PlayerTabs" && params?.screen) {
        navigateToTab(
          params.screen as string,
          params.params
            ? (params.params as { screen: string; params?: any })
            : undefined,
        );
      } else {
        navigation.navigate(screen as never, params as never);
      }
      setTimeout(() => setDrawerVisible(false), 100);
    },
    [navigation, navigateToTab],
  );

  return (
    <View style={styles.flex}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "none", gestureEnabled: false }}>
        {/* ── Home tab view (full SwipeableTabBar) ── */}
        <Stack.Screen name="PlayerV2Home" component={PlayerV2TabView} />

        {/* ── Family ── */}
        <Stack.Screen name="FamilyLobby" component={FamilyLobbyScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Family", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="ParentCreditStore" component={ParentCreditStoreScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="ParentDashboard" component={ParentDashboardScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="ParentLessons" component={ParentLessonsScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="ParentSettings" component={ParentSettingsScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="ParentReports" component={ParentReportsScreen} options={{ presentation: "card", headerTitle: "Monthly Reports" }} />

        {/* ── Notifications / Help ── */}
        <Stack.Screen name="PlayerNotifications" component={PlayerNotificationsScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="PlayerHelp" component={PlayerGuideScreen} options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="PlayerGuide" component={PlayerGuideScreen} options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="PlayerDNAWizard" component={PlayerDNAWizardScreen} options={{ presentation: "fullScreenModal", headerShown: false, animation: "slide_from_bottom" }} />

        {/* ── Profile / Settings ── */}
        <Stack.Screen name="Settings" component={PlayerSettingsScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="ThemePreview" component={ThemePreviewScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Theme Gallery", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" }, headerBackVisible: true }} />
        <Stack.Screen name="EditProfile" component={PlayerEditProfileScreen} options={{ headerTitle: "Edit Profile", presentation: "modal" }} />
        <Stack.Screen name="PlayerHolidays" component={PlayerHolidaysScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="AccountAuditLog" component={AccountAuditLogScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Activity log", headerTransparent: true, headerTintColor: Colors.dark.text }} />
        <Stack.Screen name="PrivacySettings" options={{ presentation: "modal", headerShown: false }}>
          {(screenProps) => (
            <PrivacySettingsScreen
              isOnboarding={screenProps.route.params?.isOnboarding}
              currentLevel={screenProps.route.params?.currentLevel as any}
              onGoBack={() => screenProps.navigation.goBack()}
            />
          )}
        </Stack.Screen>

        {/* ── Remote profiles ── */}
        <Stack.Screen name="PublicProfile" component={PlayerPublicProfileScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Player Profile", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.text, headerBackTitle: "Back" }} />
        <Stack.Screen name="CoachProfile" component={PlayerCoachProfileScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="AcademyProfile" component={AcademyProfileScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="AcademyPublicProfile" component={PlayerAcademyProfileScreen} options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="AcademyBrowser" component={AcademyBrowserScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="CoachDirectory" component={CoachDirectoryScreen} options={{ presentation: "card", headerTitle: t("player.settings.findCoaches"), headerTransparent: true, headerShown: true, headerTintColor: Colors.dark.text }} />
        <Stack.Screen name="TransferRequest" component={TransferRequestScreen} options={{ presentation: "card" }} />

        {/* ── Social / Groups ── */}
        <Stack.Screen name="PlayerFinder" component={PlayerFinderScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="FriendsList" component={FriendsListScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Friends", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.text, headerBackTitle: "Back" }} />
        <Stack.Screen name="Groups" component={GroupsScreen} options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="GroupDetail" component={GroupDetailScreen} options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="PlayerMessages" component={PlayerMessagesScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="ChatRoom" component={ChatRoomScreen} options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="BrowseChatRooms" component={BrowseChatRoomsScreen} options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="PlayerBookingChat" component={PlayerBookingChatScreen} options={{ presentation: "card", headerShown: false }} />

        {/* ── Booking ── */}
        <Stack.Screen name="QuickBook" component={QuickBookScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="LessonBooking" component={LessonBookingScreen} options={{ presentation: "fullScreenModal", headerShown: true, headerTitle: t("player.booking.bookSession"), headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="BrowseGroupLessons" component={BrowseGroupLessonsScreen} options={{ presentation: "transparentModal", headerShown: false, animation: "slide_from_bottom", contentStyle: { backgroundColor: "transparent" } }} />
        <Stack.Screen name="MyLessonRequests" component={MyLessonRequestsScreen} options={{ presentation: "card", headerShown: true, headerTitle: "My Requests", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.text, headerBackTitle: "Back" }} />
        <Stack.Screen name="BookingConfirmed" component={BookingConfirmedScreen} options={{ presentation: "modal", headerShown: false, animation: "slide_from_bottom" }} />
        <Stack.Screen name="BookingPreferences" component={BookingPreferencesScreen} options={{ presentation: "card", headerShown: true, headerTitle: t("player.booking.preferences"), headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "700" } }} />
        <Stack.Screen name="BookingInvites" component={BookingInvitesScreen} options={{ presentation: "card", headerShown: true, headerTitle: t("player.booking.invites"), headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="ManageMatch" component={ManageMatchScreen} options={{ headerShown: true, headerTitle: t("player.booking.manageMatch"), headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" }, headerBackVisible: true, presentation: "card" }} />

        {/* ── Shop / Marketplace ── */}
        <Stack.Screen name="Shop" component={ShopScreen} options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Product", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Service", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="PlayerOrderDetail" component={PlayerOrderDetailScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Booking Detail", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="Cart" component={CartScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Cart", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="ShopCategory" component={ShopCategoryScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Category", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="Marketplace" component={MarketplaceScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Marketplace", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="MarketplaceListing" component={MarketplaceListingDetailScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Listing", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="MyListings" component={MyListingsScreen} options={{ presentation: "card", headerShown: true, headerTitle: "My Listings", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="Equipment" component={PlayerEquipmentScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Equipment", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />

        {/* ── Match / Live ── */}
        <Stack.Screen name="MatchLive" component={MatchLiveScreen} options={{ presentation: "fullScreenModal", headerShown: false, animation: "slide_from_bottom" }} />
        <Stack.Screen name="StartLiveMatch" component={StartLiveMatchScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Start Live Match", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="MatchSummary" component={MatchSummaryScreen} options={{ presentation: "fullScreenModal", headerShown: false, animation: "slide_from_bottom", gestureEnabled: false }} />
        <Stack.Screen name="LiveMatchViewer" component={LiveMatchViewerScreen} options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="MatchHistory" component={MatchHistoryScreen} options={{ presentation: "card", headerShown: true, headerTitle: "Match History", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />

        {/* ── Discovery / News / Social ── */}
        <Stack.Screen name="News" component={NewsScreen} options={{ presentation: "card", headerShown: true, headerTitle: t("player.home.newsFeed"), headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="SpotlightDetail" component={SpotlightDetailScreen} options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="AcademyVsAcademy" component={AcademyVsAcademyScreen} options={{ presentation: "card", headerShown: true, headerTransparent: true, headerTitle: "Academy Rankings", headerTintColor: Colors.dark.text, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="SkillChallengeSubmissions" component={SkillChallengeSubmissionsScreen} options={{ presentation: "card", headerShown: true, headerTransparent: true, headerTitle: "Skill Challenge", headerTintColor: Colors.dark.text, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="SquadGroup" component={SquadGroupScreen} options={{ presentation: "card", headerShown: true, headerTransparent: true, headerTitle: "Squad", headerTintColor: Colors.dark.text, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="DiscoveryMap" component={DiscoveryMapScreen} options={{ headerShown: true, headerTitle: "Map", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="ClassesDiscovery" component={ClassesDiscoveryScreen} options={{ headerShown: true, headerTitle: "Classes", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" }, headerTransparent: false }} />
        <Stack.Screen name="ClassDetail" component={ClassDetailScreen} options={{ headerShown: true, headerTitle: "Class Details", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="FindGame" component={FindGameScreen} options={{ headerShown: true, headerTitle: "Find a Game", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="CreateGameRequest" component={CreateGameRequestScreen} options={{ headerShown: true, headerTitle: "Post a Game", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />
        <Stack.Screen name="MyGames" component={MyGamesScreen} options={{ headerShown: true, headerTitle: "My Games", headerStyle: { backgroundColor: Colors.dark.backgroundRoot }, headerTintColor: Colors.dark.primary, headerTitleStyle: { color: Colors.dark.text, fontWeight: "600" } }} />

        {/* ── AI / Media ── */}
        <Stack.Screen name="VideoFeedbackPlayer" component={VideoFeedbackPlayerScreen} options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="PlayerAICoach" component={PlayerAICoachScreen} options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="YearInTennis" component={YearInTennisScreen} options={{ presentation: "fullScreenModal", headerShown: false, animation: "fade" }} />

        {/* ── Training ── */}
        <Stack.Screen name="Training" component={PlayerTrainingScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="TrainingDetail" component={TrainingDetailScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="SkillDetail" component={SkillDetailScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="Journey" component={PlayerJourneyScreen} options={{ presentation: "card" }} />

        {/* ── Corporate ── */}
        <Stack.Screen name="CorporateBenefits" component={CorporateBenefitsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="CompanyContactDashboard" component={CompanyContactDashboardScreen} options={{ headerShown: false }} />

        {/* ── Legacy redirects (no-op — Growth tab handles these internally) ── */}
        <Stack.Screen name="Schedule" component={NoOpScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Quests" component={NoOpScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Progress" component={NoOpScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
      <PlayerIdentityDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onNavigateToProfile={() => {
          setDrawerVisible(false);
          setTimeout(() => navigateToTab("Profile"), 100);
        }}
        onNavigate={handleDrawerNavigate}
      />
    </View>
  );
}

function NoOpScreen() {
  const navigation = useNavigation<any>();
  React.useEffect(() => { navigation.goBack(); }, [navigation]);
  return null;
}

// ─── Inner root — has access to PlayerDataProvider's query cache for playerId ──
function PlayerV2Inner({ playerId }: { playerId: string | null }) {
  return (
    <SportContextProvider>
      <ScheduleFocusProvider>
        <FamilyProvider playerId={playerId}>
          <PlayerLevelProvider playerId={playerId}>
            <CartProvider>
              <PlayerDrawerProvider>
                <PlayerV2StackWithDrawer />
              </PlayerDrawerProvider>
            </CartProvider>
          </PlayerLevelProvider>
        </FamilyProvider>
      </ScheduleFocusProvider>
    </SportContextProvider>
  );
}

// ─── Onboarding gate types ────────────────────────────────────────────────────
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

// ─── Root — onboarding gate + providers ───────────────────────────────────────
// Gap 1: onboarding gate (before providers so new players never see a broken home)
// Gap 3: iOS boot retries at 300 ms + 1000 ms + 3 s timeout
export default function PlayerV2Navigator() {
  const { user, refreshAuth } = useAuth();
  const queryClient = useQueryClient();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [showPrivacySetup, setShowPrivacySetup] = useState(false);
  const [showFamilyPrompt, setShowFamilyPrompt] = useState(false);
  const [bootTimedOut, setBootTimedOut] = useState(false);

  const shouldFetchDashboard = user?.role === "player" || !!user?.playerId;

  const { data: dashboard, isLoading } = useQuery<PlayerDashboard>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: shouldFetchDashboard,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Gap 3: iOS early retries — replicates what V1 does exactly
  useEffect(() => {
    if (!shouldFetchDashboard || Platform.OS !== "ios") return;
    const t1 = setTimeout(() => {
      queryClient.refetchQueries({ queryKey: ["/api/player/me/dashboard"], type: "active" });
    }, 300);
    const t2 = setTimeout(() => {
      queryClient.refetchQueries({ queryKey: ["/api/player/me/dashboard"], type: "active" });
    }, 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [shouldFetchDashboard, queryClient]);

  // Gap 3: 3-second boot timeout so iOS users are never stuck on a blank spinner
  useEffect(() => {
    if (!isLoading || !shouldFetchDashboard || Platform.OS !== "ios") return;
    const t = setTimeout(() => setBootTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, [isLoading, shouldFetchDashboard]);

  const handleOnboardingComplete = async () => {
    await refreshAuth();
    setOnboardingComplete(true);
    setShowPrivacySetup(true);
    queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/me"] });
  };

  // Show a spinner while waiting for dashboard on iOS (matches V1 behaviour)
  if (isLoading && shouldFetchDashboard && !bootTimedOut) {
    return (
      <View style={styles.loadingContainer}>
        <TennisBallSpinner size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  // Gap 1: onboarding gate — only fires for new/incomplete player accounts
  const needsOnboarding = dashboard?.isOnboarding === true;
  const showOnboarding = needsOnboarding && onboardingComplete !== true;

  if (showOnboarding) {
    return <PlayerOnboardingV2 onComplete={handleOnboardingComplete} />;
  }

  if (showPrivacySetup) {
    return (
      <PrivacySettingsScreen
        isOnboarding
        onComplete={() => {
          setShowPrivacySetup(false);
          setShowFamilyPrompt(true);
        }}
      />
    );
  }

  if (showFamilyPrompt) {
    return (
      <View style={styles.flex}>
        <AddFamilyMemberPrompt
          visible={true}
          onDone={() => setShowFamilyPrompt(false)}
        />
      </View>
    );
  }

  const playerId = user?.playerId || dashboard?.player?.id || null;

  return (
    <PlayerAppearanceProvider>
      <TabNavigationProvider>
        <PlayerDataProvider>
          <StatusBar style="light" />
          <PlayerV2Inner playerId={playerId} />
        </PlayerDataProvider>
      </TabNavigationProvider>
    </PlayerAppearanceProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
});
