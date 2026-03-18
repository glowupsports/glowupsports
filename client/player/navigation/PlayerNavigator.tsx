import React, { useState, useCallback, useMemo } from "react";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import { HeaderButton } from "@react-navigation/elements";
import { StyleSheet, View, Platform, ActivityIndicator, ViewStyle } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SwipeableTabBar, TabConfig } from "@/components/SwipeableTabBar";
import { TabNavigationProvider, useTabNavigation } from "@/components/TabNavigationContext";
import { ChatStateProvider, useChatState } from "@/coach/context/ChatStateContext";
import ProPlayerHomeScreen from "@/player/screens/ProPlayerHomeScreen";
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
import PlayerOnboardingV2 from "@/player/screens/PlayerOnboardingV2";
import ParentDashboardScreen from "@/player/screens/ParentDashboardScreen";
import ParentInvoicesScreen from "@/player/screens/ParentInvoicesScreen";
import ParentPaymentsScreen from "@/player/screens/ParentPaymentsScreen";
import ParentLessonsScreen from "@/player/screens/ParentLessonsScreen";
import ParentSettingsScreen from "@/player/screens/ParentSettingsScreen";
import ParentCreditStoreScreen from "@/player/screens/ParentCreditStoreScreen";
import CourtBookingScreen from "@/player/screens/CourtBookingScreen";
import CourtDetailScreen from "@/player/screens/CourtDetailScreen";
import MyCourtBookingsScreen from "@/player/screens/MyCourtBookingsScreen";
import QuickBookScreen from "@/player/screens/QuickBookScreen";
import LessonBookingScreen from "@/player/screens/LessonBookingScreen";
import BrowseGroupLessonsScreen from "@/player/screens/BrowseGroupLessonsScreen";
import MyLessonRequestsScreen from "@/player/screens/MyLessonRequestsScreen";
import PlayerFinderScreen from "@/player/screens/PlayerFinderScreen";
import GlowLeaderboardScreen from "@/player/screens/GlowLeaderboardScreen";
import CreateMatchScreen from "@/player/screens/CreateMatchScreen";
import ChallengePlayerScreen from "@/player/screens/ChallengePlayerScreen";
import GroupDetailScreen from "@/player/screens/GroupDetailScreen";
import GroupsScreen from "@/player/screens/GroupsScreen";
import PlayerMessagesScreen from "@/player/screens/PlayerMessagesScreen";
import PlayerNotificationsScreen from "@/player/screens/PlayerNotificationsScreen";
import PlayerHelpScreen from "@/player/screens/PlayerHelpScreen";
import PlayerPublicProfileScreen from "@/player/screens/PlayerPublicProfileScreen";
import PlayerCoachProfileScreen from "@/player/screens/PlayerCoachProfileScreen";
import CommunityScreen from "@/player/screens/CommunityScreen";
import QuestsScreen from "@/player/screens/QuestsScreen";
import ShopScreen from "@/player/screens/ShopScreen";
import ProductDetailScreen from "@/player/screens/ProductDetailScreen";
import ServiceDetailScreen from "@/player/screens/ServiceDetailScreen";
import CartScreen from "@/player/screens/CartScreen";
import ShopCategoryScreen from "@/player/screens/ShopCategoryScreen";
import MarketplaceScreen from "@/player/screens/MarketplaceScreen";
import MarketplaceListingDetailScreen from "@/player/screens/MarketplaceListingDetailScreen";
import MyListingsScreen from "@/player/screens/MyListingsScreen";
import MatchScreen from "@/player/screens/MatchScreen";
import MatchDetailScreen from "@/player/screens/MatchDetailScreen";
import SkillEvidenceScreen from "@/player/screens/SkillEvidenceScreen";
import TrialGatesScreen from "@/player/screens/TrialGatesScreen";
import CollectionScreen from "@/player/screens/CollectionScreen";
import XPHistoryScreen from "@/player/screens/XPHistoryScreen";
import LevelUpHistoryScreen from "@/player/screens/LevelUpHistoryScreen";
import OpenMatchFeedScreen from "@/player/screens/OpenMatchFeedScreen";
import ManageMatchScreen from "@/player/screens/ManageMatchScreen";
import BookingPreferencesScreen from "@/player/screens/BookingPreferencesScreen";
import BookingInvitesScreen from "@/player/screens/BookingInvitesScreen";
import FamilyLobbyScreen from "@/player/screens/FamilyLobbyScreen";
import NewsScreen from "@/player/screens/NewsScreen";
import SpotlightDetailScreen from "@/player/screens/SpotlightDetailScreen";
import MatchLiveScreen from "@/player/screens/MatchLiveScreen";
import PrivacySettingsScreen from "@/player/screens/PrivacySettingsScreen";
import FeedbackCenterScreen from "@/player/screens/FeedbackCenterScreen";
import CoachFeedbackHistoryScreen from "@/player/screens/CoachFeedbackHistoryScreen";
import TournamentsScreen from "@/player/screens/TournamentsScreen";
import TournamentDetailScreen from "@/player/screens/TournamentDetailScreen";
import LadderDetailScreen from "@/player/screens/LadderDetailScreen";
import PlayerIdentityDrawer from "@/components/PlayerIdentityDrawer";
import { CartProvider } from "@/player/contexts/CartContext";
import { CoachChatFooter } from "@/coach/components/CoachChatFooter";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { PlayerDrawerProvider, usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { PlayerLevelProvider } from "@/player/context/PlayerLevelContext";
import { FamilyProvider } from "@/player/context/FamilyContext";
import { WalkthroughProvider } from "@/player/context/WalkthroughContext";
import { WalkthroughOverlay } from "@/player/components/WalkthroughOverlay";
import { PlayerProvider as PlayerDataProvider } from "@/player/context/PlayerContext";
import { QuickActionsFAB, QuickAction } from "@/components/QuickActionsFAB";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export { usePlayerDrawer };

export type PlayerTabParamList = {
  Home: undefined;
  Community: undefined;
  PlayStack: undefined;
  Schedule: undefined;
  Quests: undefined;
  Progress: undefined;
  Profile: undefined;
};

export type PlayStackParamList = {
  Play: { initialTab?: "Group Lessons" | "Players" } | undefined;
  OpenMatches: undefined;
  CreateMatch: undefined;
  ChallengePlayer: {
    opponentId: string;
    opponentName: string;
    opponentPhoto?: string;
    opponentBallLevel?: string;
    opponentLevel?: number;
  };
  ManageMatch: { matchId: string };
  BookingInvites: undefined;
  BookingPreferences: undefined;
};

export type ScheduleStackParamList = {
  ScheduleMain: undefined;
  CourtBooking: undefined;
  CourtDetail: { courtId: string; date: string; time?: string };
  MyCourtBookings: undefined;
  QuickBook: undefined;
  Match: { opponentId?: string } | undefined;
  MatchDetail: { matchId: string };
};

export type ProgressStackParamList = {
  ProgressMain: undefined;
  GlowLeaderboard: undefined;
  Quests: undefined;
  Tournaments: undefined;
  TournamentDetail: { tournamentId: string };
  LadderDetail: { ladderId: string };
  FeedbackCenter: undefined;
  CoachFeedbackHistory: undefined;
  SkillEvidence: undefined;
  TrialGates: undefined;
  Collection: undefined;
  XPHistory: undefined;
  LevelUpHistory: undefined;
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
  QuickBook: undefined;
  LessonBooking: undefined;
  BrowseGroupLessons: undefined;
  MyLessonRequests: undefined;
  PlayerFinder: undefined;
  FriendsList: undefined;
  Groups: undefined;
  GroupDetail: { groupId: string; groupName: string };
  PlayerMessages: undefined;
  PlayerNotifications: undefined;
  PlayerHelp: undefined;
  PublicProfile: { playerId?: string };
  CoachProfile: { coachId: string };
  Shop: undefined;
  ProductDetail: { productId: string };
  ServiceDetail: { serviceId: string };
  Cart: undefined;
  ShopCategory: { categoryId: string; categoryName: string };
  Marketplace: undefined;
  MarketplaceListing: { listingId: string };
  MyListings: undefined;
  BookingPreferences: undefined;
  BookingInvites: undefined;
  FamilyLobby: undefined;
  News: undefined;
  PrivacySettings: { isOnboarding?: boolean; currentLevel?: string };
  SpotlightDetail: undefined;
  MatchLive: {
    challengeId: string;
    opponentName: string;
    matchType: string;
    matchFormat: string;
    scheduledDate: string;
    scheduledTime: string;
    courtName?: string;
    challengerId: string;
    opponentId: string;
  };
};

const Stack = createNativeStackNavigator<PlayerStackParamList>();
const PlayStack = createNativeStackNavigator<PlayStackParamList>();
const ScheduleStack = createNativeStackNavigator<ScheduleStackParamList>();
const ProgressStack = createNativeStackNavigator<ProgressStackParamList>();

function PlayStackNavigator() {
  const { t } = useTranslation();
  return (
    <PlayStack.Navigator screenOptions={{ headerShown: false }}>
      <PlayStack.Screen name="Play" component={PlayScreen} />
      <PlayStack.Screen 
        name="OpenMatches" 
        component={OpenMatchFeedScreen}
        options={{
          headerShown: true,
          headerTitle: t('player.booking.openMatch'),
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
          headerBackVisible: true,
        }}
      />
      <PlayStack.Screen 
        name="CreateMatch" 
        component={CreateMatchScreen}
        options={{
          headerShown: true,
          headerTitle: "Find a Match",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <PlayStack.Screen 
        name="ChallengePlayer" 
        component={ChallengePlayerScreen}
        options={{
          headerShown: true,
          headerTitle: "Challenge",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <PlayStack.Screen 
        name="BookingInvites" 
        component={BookingInvitesScreen}
        options={{
          headerShown: true,
          headerTitle: t('player.booking.invites'),
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#E040FB',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <PlayStack.Screen 
        name="BookingPreferences" 
        component={BookingPreferencesScreen}
        options={{
          headerShown: true,
          headerTitle: t('player.booking.preferences'),
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <PlayStack.Screen 
        name="ManageMatch" 
        component={ManageMatchScreen}
        options={{
          headerShown: true,
          headerTitle: t('player.booking.manageMatch'),
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
          headerBackVisible: true,
        }}
      />
    </PlayStack.Navigator>
  );
}

function ScheduleStackNavigator() {
  const { t } = useTranslation();
  return (
    <ScheduleStack.Navigator screenOptions={{ headerShown: false }}>
      <ScheduleStack.Screen name="ScheduleMain" component={PlayerScheduleScreen} />
      <ScheduleStack.Screen name="CourtBooking" component={CourtBookingScreen} />
      <ScheduleStack.Screen name="CourtDetail" component={CourtDetailScreen} />
      <ScheduleStack.Screen name="MyCourtBookings" component={MyCourtBookingsScreen} />
      <ScheduleStack.Screen name="QuickBook" component={QuickBookScreen} />
      <ScheduleStack.Screen 
        name="Match" 
        component={MatchScreen}
        options={{
          headerShown: true,
          headerTitle: t('nav.matches'),
          headerStyle: { backgroundColor: '#0a0f1a' },
          headerTintColor: '#00ff88',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <ScheduleStack.Screen 
        name="MatchDetail" 
        component={MatchDetailScreen}
        options={{
          headerShown: true,
          headerTitle: "Match Details",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
    </ScheduleStack.Navigator>
  );
}

function ProgressMainWithCallback(props: any) {
  const navigation = useNavigation<any>();
  const { registerTabCallback } = useTabNavigation();

  React.useEffect(() => {
    return registerTabCallback("Progress", (screen, params) => {
      navigation.navigate(screen, params);
    });
  }, [navigation, registerTabCallback]);

  return <PlayerProgressScreen {...props} />;
}

function ProgressStackNavigator() {
  const { t } = useTranslation();

  return (
    <ProgressStack.Navigator screenOptions={{ headerShown: false }}>
      <ProgressStack.Screen name="ProgressMain" component={ProgressMainWithCallback} />
      <ProgressStack.Screen 
        name="GlowLeaderboard" 
        component={GlowLeaderboardScreen}
        options={{
          headerShown: true,
          headerTitle: "Leaderboard",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen 
        name="Quests" 
        component={QuestsScreen}
        options={{
          headerShown: true,
          headerTitle: t('nav.quests'),
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.text,
          headerBackTitle: "Back",
        }}
      />
      <ProgressStack.Screen 
        name="Tournaments" 
        component={TournamentsScreen}
        options={{
          headerShown: false,
        }}
      />
      <ProgressStack.Screen 
        name="TournamentDetail" 
        component={TournamentDetailScreen}
        options={{
          headerShown: false,
        }}
      />
      <ProgressStack.Screen 
        name="LadderDetail" 
        component={LadderDetailScreen}
        options={{
          headerShown: false,
        }}
      />
      <ProgressStack.Screen 
        name="FeedbackCenter" 
        component={FeedbackCenterScreen}
        options={{
          headerShown: false,
        }}
      />
      <ProgressStack.Screen 
        name="CoachFeedbackHistory" 
        component={CoachFeedbackHistoryScreen}
        options={{
          headerShown: false,
        }}
      />
      <ProgressStack.Screen 
        name="SkillEvidence" 
        component={SkillEvidenceScreen}
        options={{
          headerShown: true,
          headerTitle: "Skill Evidence",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen 
        name="TrialGates" 
        component={TrialGatesScreen}
        options={{
          headerShown: true,
          headerTitle: "Trial Gates",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen 
        name="Collection" 
        component={CollectionScreen}
        options={{
          headerShown: true,
          headerTitle: "Collection",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen 
        name="XPHistory" 
        component={XPHistoryScreen}
        options={{
          headerShown: true,
          headerTitle: "XP History",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen 
        name="LevelUpHistory" 
        component={LevelUpHistoryScreen}
        options={{
          headerShown: true,
          headerTitle: "Level History",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
    </ProgressStack.Navigator>
  );
}

const HIDE_CHAT_TABS = ["PlayStack", "Community"];

function PlayerTabsContent({ onEdgeSwipeLeft }: { onEdgeSwipeLeft?: () => void }) {
  const { t } = useTranslation();
  const [currentTabKey, setCurrentTabKey] = useState("Home");

  const playerTabs: TabConfig[] = useMemo(() => [
    { key: "Home", label: "Home", icon: "home-outline", iconFocused: "home", component: ProPlayerHomeScreen },
    { key: "Community", label: "Social", icon: "people-outline", iconFocused: "people", component: CommunityScreen },
    { key: "PlayStack", label: "Play", icon: "game-controller-outline", iconFocused: "game-controller", component: PlayStackNavigator },
    { key: "Schedule", label: "Sched", icon: "calendar-outline", iconFocused: "calendar", component: ScheduleStackNavigator },
    { key: "Quests", label: "Quests", icon: "flash-outline", iconFocused: "flash", component: QuestsScreen },
    { key: "Progress", label: "Stats", icon: "stats-chart-outline", iconFocused: "stats-chart", component: ProgressStackNavigator },
    { key: "Profile", label: "Me", icon: "person-outline", iconFocused: "person", component: PlayerProfileScreen },
  ], [t]);
  
  const hideChat = HIDE_CHAT_TABS.includes(currentTabKey);
  
  const handlePageChange = useCallback((index: number, key: string) => {
    setCurrentTabKey(key);
  }, []);
  
  const renderOverlay = useCallback((tabKey: string) => {
    const shouldHide = HIDE_CHAT_TABS.includes(tabKey);
    if (shouldHide) return null;
    
    return (
      <>
        <CoachChatFooter mode="player" />
        <PlayerQuickActionsFAB />
      </>
    );
  }, []);
  
  return (
    <SwipeableTabBar
      tabs={playerTabs}
      primaryColor={Colors.dark.primary}
      secondaryColor={Colors.dark.xpCyan}
      onEdgeSwipeLeft={onEdgeSwipeLeft}
      onPageChange={handlePageChange}
      renderOverlay={renderOverlay}
      dividerAfterIndices={[3, 5]}
    />
  );
}

function PlayerTabsWithDrawer() {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const navigation = useNavigation<any>();
  const { setOpenDrawer } = usePlayerDrawer();
  const { navigateToTab } = useTabNavigation();
  
  React.useEffect(() => {
    setOpenDrawer(() => setDrawerVisible(true));
  }, [setOpenDrawer]);
  
  const navigateToProfile = () => {
    setDrawerVisible(false);
    setTimeout(() => {
      navigateToTab("Profile");
    }, 100);
  };

  const handleDrawerNavigate = (screen: string, params?: any) => {
    if (screen === "PlayerTabs" && params?.screen) {
      navigateToTab(params.screen, params.params ? { screen: params.params.screen, params: params.params } : undefined);
    } else {
      navigation.navigate(screen, params);
    }
    setTimeout(() => {
      setDrawerVisible(false);
    }, 100);
  };
  
  const handleEdgeSwipeLeft = useCallback(() => {
    setDrawerVisible(true);
  }, []);
  
  return (
    <View style={{ flex: 1 }}>
      <PlayerTabsContent onEdgeSwipeLeft={handleEdgeSwipeLeft} />
      <PlayerIdentityDrawer 
        visible={drawerVisible} 
        onClose={() => setDrawerVisible(false)}
        onNavigateToProfile={navigateToProfile}
        onNavigate={handleDrawerNavigate}
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
  const { t } = useTranslation();
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
          headerTitle: t('player.settings.findCoaches'),
          headerTransparent: true,
          headerTintColor: Colors.dark.text,
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
        name="QuickBook" 
        component={QuickBookScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen 
        name="LessonBooking" 
        component={LessonBookingScreen}
        options={{
          presentation: "fullScreenModal",
          headerShown: true,
          headerTitle: t('player.booking.bookSession'),
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="BrowseGroupLessons" 
        component={BrowseGroupLessonsScreen}
        options={{
          presentation: 'transparentModal',
          headerShown: false,
          animation: 'slide_from_bottom',
          contentStyle: { backgroundColor: 'transparent' },
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
        name="News" 
        component={NewsScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: t('player.home.newsFeed'),
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="SpotlightDetail" 
        component={SpotlightDetailScreen}
        options={{
          presentation: "card",
          headerShown: false,
        }}
      />
      <Stack.Screen 
        name="MatchLive" 
        component={MatchLiveScreen}
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen 
        name="Groups" 
        component={GroupsScreen}
        options={{
          presentation: "card",
          headerShown: false,
        }}
      />
      <Stack.Screen 
        name="GroupDetail" 
        component={GroupDetailScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Group Details",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
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
      <Stack.Screen 
        name="Shop" 
        component={ShopScreen}
        options={{
          presentation: "card",
          headerShown: false,
        }}
      />
      <Stack.Screen 
        name="ProductDetail" 
        component={ProductDetailScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Product",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="ServiceDetail" 
        component={ServiceDetailScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Service",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="Cart" 
        component={CartScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Cart",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="ShopCategory" 
        component={ShopCategoryScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Category",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="Marketplace" 
        component={MarketplaceScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Marketplace",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="MarketplaceListing" 
        component={MarketplaceListingDetailScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Listing",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="MyListings" 
        component={MyListingsScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "My Listings",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="BookingPreferences" 
        component={BookingPreferencesScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: t('player.booking.preferences'),
          headerStyle: { backgroundColor: '#0B0D10' },
          headerTintColor: '#C8FF3D',
          headerTitleStyle: { color: '#ffffff', fontWeight: '700' },
        }}
      />
      <Stack.Screen 
        name="BookingInvites" 
        component={BookingInvitesScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: t('player.booking.invites'),
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="FamilyLobby" 
        component={FamilyLobbyScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Family",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="PrivacySettings" 
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      >
        {(screenProps) => (
          <PrivacySettingsScreen
            isOnboarding={screenProps.route.params?.isOnboarding}
            currentLevel={screenProps.route.params?.currentLevel as any}
            onGoBack={() => screenProps.navigation.goBack()}
          />
        )}
      </Stack.Screen>
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
  const [showPrivacySetup, setShowPrivacySetup] = useState(false);


  // Fetch dashboard for player role accounts and any account with a playerId
  // (multi-role users like platform_owners may have player accounts needing onboarding)
  const shouldFetchDashboard = user?.role === "player" || !!user?.playerId;
  
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
    setShowPrivacySetup(true);
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
  const showOnboarding = needsOnboarding && onboardingComplete !== true;

  if (showOnboarding) {
    return <PlayerOnboardingV2 onComplete={handleOnboardingComplete} />;
  }

  // Show privacy setup modal after onboarding
  if (showPrivacySetup) {
    return <PrivacySettingsScreen isOnboarding onComplete={() => setShowPrivacySetup(false)} />;
  }

  const playerId = user?.playerId || dashboard?.player?.id || null;

  return (
    <ChatStateProvider>
      <TabNavigationProvider>
        <PlayerDataProvider>
          <CartProvider>
            <FamilyProvider playerId={playerId}>
              <PlayerLevelProvider playerId={playerId}>
                <WalkthroughProvider>
                  <View style={styles.container}>
                    <PlayerStackNavigator />
                    <WalkthroughOverlay />
                  </View>
                </WalkthroughProvider>
              </PlayerLevelProvider>
            </FamilyProvider>
          </CartProvider>
        </PlayerDataProvider>
      </TabNavigationProvider>
    </ChatStateProvider>
  );
}

function PlayerQuickActionsFAB() {
  const navigation = useNavigation<any>();
  const { isChatExpanded } = useChatState();

  if (isChatExpanded) return null;

  const playerActions: QuickAction[] = [
    {
      id: "book-lesson",
      label: "Book Lesson",
      icon: "calendar-outline",
      color: Colors.dark.primary,
      onPress: () => navigation.navigate("LessonBooking"),
    },
    {
      id: "match-prepare",
      label: "Match",
      icon: "tennisball-outline",
      color: Colors.dark.xpCyan,
      onPress: () => navigation.navigate("PlayerTabs", { screen: "Schedule", params: { screen: "Match" } }),
    },
    {
      id: "messages",
      label: "Messages",
      icon: "chatbubbles-outline",
      color: Colors.dark.ballGlow,
      onPress: () => navigation.navigate("PlayerMessages"),
    },
    {
      id: "shop",
      label: "Shop",
      icon: "cart-outline",
      color: Colors.dark.gold,
      onPress: () => navigation.navigate("Shop"),
    },
    {
      id: "marketplace",
      label: "Marketplace",
      icon: "storefront-outline",
      color: Colors.dark.orange,
      onPress: () => navigation.navigate("Marketplace"),
    },
    {
      id: "quests",
      label: "Quests",
      icon: "flag-outline",
      color: Colors.dark.successNeon,
      onPress: () => navigation.navigate("PlayerTabs", { screen: "Progress", params: { screen: "Quests" } }),
    },
  ];

  return (
    <QuickActionsFAB
      actions={playerActions}
      primaryColor={Colors.dark.ballGlow}
      secondaryColor={Colors.dark.xpCyan}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
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
    borderTopWidth: 1,
    borderTopColor: "rgba(200, 255, 61, 0.15)",
    elevation: 10,
    zIndex: 999,
    backgroundColor: Platform.OS === "web" ? "rgba(11, 13, 16, 0.95)" : "transparent",
    height: 85,
    paddingTop: 8,
  },
  tabBarBackground: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  androidTabBackground: {
    backgroundColor: "rgba(11, 13, 16, 0.98)",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: -2,
  },
});
