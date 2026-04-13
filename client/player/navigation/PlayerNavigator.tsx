import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import { HeaderButton } from "@react-navigation/elements";
import { StyleSheet, View, Platform, ActivityIndicator, ViewStyle, Pressable, Text, AppState } from "react-native";
import { secureGet, secureDelete } from "@/lib/auth";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import ParentLessonsScreen from "@/player/screens/ParentLessonsScreen";
import ParentSettingsScreen from "@/player/screens/ParentSettingsScreen";
import ParentCreditStoreScreen from "@/player/screens/ParentCreditStoreScreen";
import ParentReportsScreen from "@/player/screens/ParentReportsScreen";
import CourtBookingScreen from "@/player/screens/CourtBookingScreen";
import CourtDetailScreen from "@/player/screens/CourtDetailScreen";
import MyCourtBookingsScreen from "@/player/screens/MyCourtBookingsScreen";
import QuickBookScreen from "@/player/screens/QuickBookScreen";
import LessonBookingScreen from "@/player/screens/LessonBookingScreen";
import BrowseGroupLessonsScreen from "@/player/screens/BrowseGroupLessonsScreen";
import MyLessonRequestsScreen from "@/player/screens/MyLessonRequestsScreen";
import PlayerFinderScreen from "@/player/screens/PlayerFinderScreen";
import FriendsListScreen from "@/player/screens/FriendsListScreen";
import GlowLeaderboardScreen from "@/player/screens/GlowLeaderboardScreen";
import CreateMatchScreen from "@/player/screens/CreateMatchScreen";
import ChallengePlayerScreen from "@/player/screens/ChallengePlayerScreen";
import GroupDetailScreen from "@/player/screens/GroupDetailScreen";
import GroupsScreen from "@/player/screens/GroupsScreen";
import PlayerMessagesScreen from "@/player/screens/PlayerMessagesScreen";
import PlayerBookingChatScreen from "@/player/screens/PlayerBookingChatScreen";
import PlayerNotificationsScreen from "@/player/screens/PlayerNotificationsScreen";
import PlayerHelpScreen from "@/player/screens/PlayerHelpScreen";
import PlayerPublicProfileScreen from "@/player/screens/PlayerPublicProfileScreen";
import PlayerCoachProfileScreen from "@/player/screens/PlayerCoachProfileScreen";
import PlayerAcademyProfileScreen from "@/player/screens/PlayerAcademyProfileScreen";
import CommunityScreen from "@/player/screens/CommunityScreen";
import QuestsScreen from "@/player/screens/QuestsScreen";
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
import MatchScreen from "@/player/screens/MatchScreen";
import MatchDetailScreen from "@/player/screens/MatchDetailScreen";
import MatchPrepScreen from "@/player/screens/MatchPrepScreen";
import OpponentProfileScreen from "@/player/screens/OpponentProfileScreen";
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
import AddFamilyMemberPrompt from "@/player/components/AddFamilyMemberPrompt";
import CorporateBenefitsScreen from "@/player/screens/CorporateBenefitsScreen";
import CompanyContactDashboardScreen from "@/player/screens/CompanyContactDashboardScreen";
import FindGameScreen from "@/player/screens/FindGameScreen";
import CreateGameRequestScreen from "@/player/screens/CreateGameRequestScreen";
import MyGamesScreen from "@/player/screens/MyGamesScreen";
import NewsScreen from "@/player/screens/NewsScreen";
import ClassesDiscoveryScreen from "@/player/screens/ClassesDiscoveryScreen";
import SpotlightDetailScreen from "@/player/screens/SpotlightDetailScreen";
import MatchLiveScreen from "@/player/screens/MatchLiveScreen";
import StartLiveMatchScreen from "@/player/screens/StartLiveMatchScreen";
import MatchSummaryScreen from "@/player/screens/MatchSummaryScreen";
import LiveMatchViewerScreen from "@/player/screens/LiveMatchViewerScreen";
import MatchHistoryScreen from "@/player/screens/MatchHistoryScreen";
import PlayerAICoachScreen from "@/player/screens/PlayerAICoachScreen";
import PrivacySettingsScreen from "@/player/screens/PrivacySettingsScreen";
import PlayerEditProfileScreen from "@/player/screens/PlayerEditProfileScreen";
import FeedbackCenterScreen from "@/player/screens/FeedbackCenterScreen";
import CoachFeedbackHistoryScreen from "@/player/screens/CoachFeedbackHistoryScreen";
import VideoFeedbackPlayerScreen from "@/player/screens/VideoFeedbackPlayerScreen";
import TournamentsScreen from "@/player/screens/TournamentsScreen";
import TournamentDetailScreen from "@/player/screens/TournamentDetailScreen";
import LadderDetailScreen from "@/player/screens/LadderDetailScreen";
import PlayerIdentityDrawer from "@/components/PlayerIdentityDrawer";
import { CartProvider } from "@/player/contexts/CartContext";
import { CoachChatFooter } from "@/coach/components/CoachChatFooter";
import { Colors, Spacing, FontSizes, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { PlayerDrawerProvider, usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { PlayerLevelProvider } from "@/player/context/PlayerLevelContext";
import { FamilyProvider, useFamily } from "@/player/context/FamilyContext";
import { getApiUrl } from "@/lib/query-client";

import { WalkthroughProvider } from "@/player/context/WalkthroughContext";
import { WalkthroughOverlay } from "@/player/components/WalkthroughOverlay";
import { PlayerProvider as PlayerDataProvider } from "@/player/context/PlayerContext";
import { SportContextProvider } from "@/player/context/SportContext";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

const FAMILY_SWITCH_KEY = "family_switch";

interface FamilySwitchInfo {
  originalToken?: string;
  originalPlayerId?: string;
  switchedPlayerName: string;
  hasOwnAccount: boolean;
}

function FamilySwitchBackBanner() {
  const { user, loginWithToken } = useAuth();
  const { setActivePlayer } = useFamily();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [switchInfo, setSwitchInfo] = useState<FamilySwitchInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const raw = await secureGet(FAMILY_SWITCH_KEY);
        setSwitchInfo(raw ? JSON.parse(raw) : null);
      } catch {
        setSwitchInfo(null);
      }
    };
    check();
  }, []);

  const handleSwitchBack = async () => {
    if (!switchInfo || loading) return;
    setLoading(true);
    try {
      await secureDelete(FAMILY_SWITCH_KEY);
      if (switchInfo.hasOwnAccount && switchInfo.originalToken) {
        const meResp = await fetch(new URL("/api/me", getApiUrl()).toString(), {
          headers: { Authorization: `Bearer ${switchInfo.originalToken}` },
        });
        const meData = await meResp.json();
        await loginWithToken(switchInfo.originalToken, meData.user);
      } else {
        const restoreId = switchInfo.originalPlayerId || user?.playerId;
        if (restoreId) setActivePlayer(restoreId);
      }
      setSwitchInfo(null);
      navigation.reset({ index: 0, routes: [{ name: "PlayerTabs" as never }] });
    } catch (e) {
      console.error("[FamilySwitch] Switch back error:", e);
    } finally {
      setLoading(false);
    }
  };

  if (!switchInfo) return null;

  return (
    <Pressable
      style={[styles.switchBanner, { paddingTop: insets.top > 0 ? insets.top : Spacing.sm }]}
      onPress={handleSwitchBack}
      disabled={loading}
    >
      <Ionicons name="people" size={14} color={Colors.dark.buttonText} />
      <Text style={styles.switchBannerText} numberOfLines={1}>
        Viewing as {switchInfo.switchedPlayerName}
      </Text>
      <View style={styles.switchBannerChip}>
        {loading
          ? <ActivityIndicator size="small" color={Colors.dark.buttonText} />
          : <Text style={styles.switchBannerChipText}>Switch Back</Text>
        }
      </View>
    </Pressable>
  );
}

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
  Play: { initialTab?: "Group Lessons" | "Players" | "Leaderboard" } | undefined;
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
  Match: { opponentId?: string; initialTab?: "upcoming" | "history" } | undefined;
  MatchDetail: { matchId: string };
  MatchPrep: { planId?: string; matchId?: string };
  OpponentProfile: { opponentId: string | null };
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
  EditProfile: undefined;
  AcademyBrowser: undefined;
  AcademyProfile: { academyId: string };
  AcademyPublicProfile: { academyId: string };
  CoachDirectory: undefined;
  TransferRequest: { academyId?: string; academyName?: string } | undefined;
  ParentDashboard: undefined;
  ParentLessons: { playerId: string };
  ParentCreditStore: { playerId: string };
  ParentSettings: undefined;
  ParentReports: { playerId: string; childName?: string };
  QuickBook: undefined;
  LessonBooking: { sport?: string } | undefined;
  BrowseGroupLessons: undefined;
  MyLessonRequests: undefined;
  PlayerFinder: undefined;
  FriendsList: undefined;
  Groups: undefined;
  GroupDetail: { groupId: string; groupName: string };
  PlayerMessages: undefined;
  PlayerBookingChat: { orderId?: string; conversationId?: string };
  PlayerNotifications: undefined;
  PlayerHelp: undefined;
  PublicProfile: { playerId?: string };
  CoachProfile: { coachId: string };
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
  BookingPreferences: undefined;
  BookingInvites: undefined;
  FamilyLobby: undefined;
  News: undefined;
  PrivacySettings: { isOnboarding?: boolean; currentLevel?: string };
  SpotlightDetail: undefined;
  VideoFeedbackPlayer: { feedbackId?: string } | undefined;
  CorporateBenefits: undefined;
  CompanyContactDashboard: undefined;
  FindGame: undefined;
  CreateGameRequest: undefined;
  MyGames: undefined;
  ClassesDiscovery: undefined;
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
  StartLiveMatch: {
    opponentId: string;
    opponentName: string;
    challengeId?: string;
  };
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
  LiveMatchViewer: {
    matchId: string;
    playerName?: string;
  };
  MatchHistory: {
    playerId?: string;
  } | undefined;
  PlayerAICoach: undefined;
};

const Stack = createNativeStackNavigator<PlayerStackParamList>();
const PlayStack = createNativeStackNavigator<PlayStackParamList>();
const ScheduleStack = createNativeStackNavigator<ScheduleStackParamList>();
const ProgressStack = createNativeStackNavigator<ProgressStackParamList>();

function PlayScreenWithCallback(props: any) {
  const navigation = useNavigation<any>();
  const { registerTabCallback } = useTabNavigation();
  React.useEffect(() => {
    return registerTabCallback("PlayStack", (screen: string, params: any) => {
      if (params?.initialTab) {
        navigation.setParams({ initialTab: params.initialTab });
      }
    });
  }, [navigation, registerTabCallback]);
  return <PlayScreen {...props} />;
}

function PlayStackNavigator() {
  const { t } = useTranslation();
  return (
    <PlayStack.Navigator screenOptions={{ headerShown: false }}>
      <PlayStack.Screen name="Play" component={PlayScreenWithCallback} />
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

function ScheduleMainWithCallback(props: any) {
  const navigation = useNavigation<any>();
  const { registerTabCallback } = useTabNavigation();

  React.useEffect(() => {
    return registerTabCallback("Schedule", (screen, params) => {
      navigation.navigate(screen, params);
    });
  }, [navigation, registerTabCallback]);

  return <PlayerScheduleScreen {...props} />;
}

function ScheduleStackNavigator() {
  const { t } = useTranslation();
  return (
    <ScheduleStack.Navigator screenOptions={{ headerShown: false }}>
      <ScheduleStack.Screen name="ScheduleMain" component={ScheduleMainWithCallback} />
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
      <ScheduleStack.Screen
        name="MatchPrep"
        component={MatchPrepScreen}
        options={{
          headerShown: true,
          headerTitle: "Match Preparation",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#C8FF3D',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <ScheduleStack.Screen
        name="OpponentProfile"
        component={OpponentProfileScreen}
        options={{
          headerShown: true,
          headerTitle: "Opponent Profile",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#A78BFA',
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

const TAB_FEATURE_KEYS: Record<string, string> = {
  Home: "tab:home",
  Community: "tab:social",
  PlayStack: "tab:play",
  Schedule: "tab:schedule",
  Quests: "tab:quests",
  Progress: "tab:stats",
  Profile: "tab:me",
};

function PlayerTabsContent({ onEdgeSwipeLeft }: { onEdgeSwipeLeft?: () => void }) {
  const { t } = useTranslation();
  const [currentTabKey, setCurrentTabKey] = useState("Home");
  const navigation = useNavigation<any>();
  const track = useTrackFeature();
  const isMountedRef = useRef(false);

  const playerTabs: TabConfig[] = useMemo(() => [
    { key: "Home", label: "Home", icon: "home-outline", iconFocused: "home", component: ProPlayerHomeScreen },
    { key: "Community", label: "Social", icon: "people-outline", iconFocused: "people", component: CommunityScreen },
    { key: "PlayStack", label: "Play", icon: "game-controller-outline", iconFocused: "game-controller", component: PlayStackNavigator },
    { key: "Schedule", label: "Sched", icon: "calendar-outline", iconFocused: "calendar", component: ScheduleStackNavigator },
    { key: "Quests", label: "Quests", icon: "flash-outline", iconFocused: "flash", component: QuestsScreen },
    { key: "Progress", label: "Progress", icon: "trending-up-outline", iconFocused: "trending-up", component: ProgressStackNavigator },
    { key: "Profile", label: "Me", icon: "person-outline", iconFocused: "person", component: PlayerProfileScreen },
  ], [t]);
  
  const hideChat = HIDE_CHAT_TABS.includes(currentTabKey);

  const handleChallenge = useCallback(
    (opponentId: string, opponentName: string, opponentPhoto?: string) => {
      navigation.navigate("PlayerTabs", {
        screen: "PlayStack",
        params: { screen: "ChallengePlayer", params: { opponentId, opponentName, opponentPhoto } },
      });
    },
    [navigation],
  );
  
  const handlePageChange = useCallback((index: number, key: string) => {
    setCurrentTabKey(key);
    const featureKey = TAB_FEATURE_KEYS[key];
    if (featureKey && isMountedRef.current) {
      track(featureKey);
    }
    isMountedRef.current = true;
  }, [track]);
  
  const renderOverlay = useCallback((tabKey: string) => {
    const shouldHide = HIDE_CHAT_TABS.includes(tabKey);
    if (shouldHide) return null;
    
    return <CoachChatFooter mode="player" onChallenge={handleChallenge} />;
  }, [handleChallenge]);
  
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
      navigateToTab(params.screen, params.params ? params.params : undefined);
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
        name="EditProfile"
        component={PlayerEditProfileScreen}
        options={{
          headerTitle: "Edit Profile",
          presentation: "modal",
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
        name="ParentReports" 
        component={ParentReportsScreen}
        options={{
          presentation: "card",
          headerTitle: "Monthly Reports",
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
        name="FriendsList" 
        component={FriendsListScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Friends",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.text,
          headerBackTitle: "Back",
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
        name="StartLiveMatch"
        component={StartLiveMatchScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Start Live Match",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen
        name="MatchSummary"
        component={MatchSummaryScreen}
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
          animation: "slide_from_bottom",
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="LiveMatchViewer"
        component={LiveMatchViewerScreen}
        options={{
          presentation: "card",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="MatchHistory"
        component={MatchHistoryScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Match History",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="VideoFeedbackPlayer" 
        component={VideoFeedbackPlayerScreen}
        options={{
          presentation: "card",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="PlayerAICoach"
        component={PlayerAICoachScreen}
        options={{
          presentation: "card",
          headerShown: false,
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
          headerShown: false,
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
        name="PlayerBookingChat" 
        component={PlayerBookingChatScreen}
        options={{
          presentation: "card",
          headerShown: false,
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
        name="AcademyPublicProfile" 
        component={PlayerAcademyProfileScreen}
        options={{
          presentation: "card",
          headerShown: false,
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
        name="PlayerOrderDetail" 
        component={PlayerOrderDetailScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Booking Detail",
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
        name="Equipment" 
        component={PlayerEquipmentScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Equipment",
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
      <Stack.Screen
        name="CorporateBenefits"
        component={CorporateBenefitsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="CompanyContactDashboard"
        component={CompanyContactDashboardScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="FindGame"
        component={FindGameScreen}
        options={{
          headerShown: true,
          headerTitle: "Find a Game",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen
        name="CreateGameRequest"
        component={CreateGameRequestScreen}
        options={{
          headerShown: true,
          headerTitle: "Post a Game",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen
        name="MyGames"
        component={MyGamesScreen}
        options={{
          headerShown: true,
          headerTitle: "My Games",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen
        name="ClassesDiscovery"
        component={ClassesDiscoveryScreen}
        options={{
          headerShown: true,
          headerTitle: "Classes",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
          headerTransparent: false,
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
  const [showPrivacySetup, setShowPrivacySetup] = useState(false);
  const [showFamilyPrompt, setShowFamilyPrompt] = useState(false);


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
    return <PrivacySettingsScreen isOnboarding onComplete={() => { setShowPrivacySetup(false); setShowFamilyPrompt(true); }} />;
  }

  // Show family prompt after onboarding + privacy setup
  if (showFamilyPrompt) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.dark.backgroundRoot }}>
        <AddFamilyMemberPrompt
          visible={true}
          onDone={() => setShowFamilyPrompt(false)}
        />
      </View>
    );
  }

  const playerId = user?.playerId || dashboard?.player?.id || null;

  return (
    <ChatStateProvider>
      <TabNavigationProvider>
        <PlayerDataProvider>
          <SportContextProvider>
            <CartProvider>
              <FamilyProvider playerId={playerId}>
                <PlayerLevelProvider playerId={playerId}>
                  <WalkthroughProvider>
                    <View style={styles.container}>
                      <FamilySwitchBackBanner />
                      <PlayerStackNavigator />
                      <WalkthroughOverlay />
                    </View>
                  </WalkthroughProvider>
                </PlayerLevelProvider>
              </FamilyProvider>
            </CartProvider>
          </SportContextProvider>
        </PlayerDataProvider>
      </TabNavigationProvider>
    </ChatStateProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  switchBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
    zIndex: 100,
  },
  switchBannerText: {
    flex: 1,
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  switchBannerChip: {
    backgroundColor: "rgba(0,0,0,0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 80,
    alignItems: "center",
  },
  switchBannerChipText: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.dark.buttonText,
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
