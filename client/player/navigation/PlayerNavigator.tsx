import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import { HeaderButton } from "@react-navigation/elements";
import { StyleSheet, View, Platform, ActivityIndicator, ViewStyle, Pressable, Text, AppState } from "react-native";
import { secureGet, secureDelete, clearAuthState } from "@/lib/auth";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { PlayerAppearanceProvider, usePlayerAppearance } from "@/player/context/PlayerAppearanceContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import ThemePreviewScreen from "@/player/screens/ThemePreviewScreen";
import AcademyBrowserScreen from "@/player/screens/AcademyBrowserScreen";
import AcademyProfileScreen from "@/player/screens/AcademyProfileScreen";
import CoachDirectoryScreen from "@/player/screens/CoachDirectoryScreen";
import TransferRequestScreen from "@/player/screens/TransferRequestScreen";
import PlayerHolidaysScreen from "@/player/screens/PlayerHolidaysScreen";
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
import BookingConfirmedScreen from "@/player/screens/BookingConfirmedScreen";
import PlayerFinderScreen from "@/player/screens/PlayerFinderScreen";
import FriendsListScreen from "@/player/screens/FriendsListScreen";
import GlowLeaderboardScreen from "@/player/screens/GlowLeaderboardScreen";
import CountryLeaderboardScreen from "@/player/screens/CountryLeaderboardScreen";
import CreateMatchScreen from "@/player/screens/CreateMatchScreen";
import ChallengePlayerScreen from "@/player/screens/ChallengePlayerScreen";
import GroupDetailScreen from "@/player/screens/GroupDetailScreen";
import GroupsScreen from "@/player/screens/GroupsScreen";
import PlayerMessagesScreen from "@/player/screens/PlayerMessagesScreen";
import ChatRoomScreen from "@/player/screens/ChatRoomScreen";
import BrowseChatRoomsScreen from "@/player/screens/BrowseChatRoomsScreen";
import PlayerBookingChatScreen from "@/player/screens/PlayerBookingChatScreen";
import PlayerNotificationsScreen from "@/player/screens/PlayerNotificationsScreen";
import PlayerGuideScreen from "@/player/screens/PlayerGuideScreen";
import { FloatingHelpButton } from "@/player/components/FloatingHelpButton";
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
import ClassDetailScreen from "@/player/screens/ClassDetailScreen";
import DiscoveryMapScreen from "@/player/screens/DiscoveryMapScreen";
import SpotlightDetailScreen from "@/player/screens/SpotlightDetailScreen";
import MatchLiveScreen from "@/player/screens/MatchLiveScreen";
import StartLiveMatchScreen from "@/player/screens/StartLiveMatchScreen";
import MatchSummaryScreen from "@/player/screens/MatchSummaryScreen";
import LiveMatchViewerScreen from "@/player/screens/LiveMatchViewerScreen";
import MatchHistoryScreen from "@/player/screens/MatchHistoryScreen";
import PlayerAICoachScreen from "@/player/screens/PlayerAICoachScreen";
import PlayerDNAWizardScreen from "@/player/screens/PlayerDNAWizard";
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
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { PlayerLevelProvider } from "@/player/context/PlayerLevelContext";
import { FamilyProvider, useFamily } from "@/player/context/FamilyContext";
import { getApiUrl } from "@/lib/query-client";

import { PlayerProvider as PlayerDataProvider } from "@/player/context/PlayerContext";
import { ScheduleFocusProvider } from "@/player/context/ScheduleFocusContext";
import { SportContextProvider } from "@/player/context/SportContext";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
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
  const queryClient = useQueryClient();
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
        // Full clean logout before restoring original account — removes child's refresh token and cache.
        await clearAuthState();
        queryClient.clear();
        const meResp = await fetch(new URL("/api/me", getApiUrl()).toString(), {
          headers: { Authorization: `Bearer ${switchInfo.originalToken}` },
        });
        const meData = await meResp.json();
        if (!meData?.user) {
          throw new Error("Could not restore original account session");
        }
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
  Growth: undefined;
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
  BookingInvites: undefined;
  BookingPreferences: undefined;
};

export type ScheduleStackParamList = {
  ScheduleMain: { focusSessionId?: string } | undefined;
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
  CountryLeaderboard: undefined;
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
  CourtBooking: undefined;
  CourtDetail: { courtId: string; date: string; time?: string };
  MyCourtBookings: undefined;
  Match: { opponentId?: string; initialTab?: "upcoming" | "history" } | undefined;
  MatchDetail: { matchId: string };
  MatchPrep: { planId?: string; matchId?: string };
  OpponentProfile: { opponentId: string | null };
};

export type PlayerStackParamList = {
  PlayerTabs: undefined;
  Schedule: undefined;
  Quests: undefined;
  Progress: undefined;
  Training: undefined;
  TrainingDetail: { sessionId: string };
  SkillDetail: { domain: string };
  Journey: undefined;
  Settings: undefined;
  ThemePreview: undefined;
  EditProfile: undefined;
  AcademyBrowser: undefined;
  AcademyProfile: { academyId: string };
  AcademyPublicProfile: { academyId: string };
  CoachDirectory: undefined;
  TransferRequest: { academyId?: string; academyName?: string } | undefined;
  PlayerHolidays: undefined;
  ManageMatch: { matchId: string };
  ParentDashboard: undefined;
  ParentLessons: { playerId: string };
  ParentCreditStore: { playerId: string };
  ParentSettings: undefined;
  ParentReports: { playerId: string; childName?: string };
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
  PlayerFinder: undefined;
  FriendsList: { initialTab?: "friends" | "requests" } | undefined;
  Groups: undefined;
  GroupDetail: { groupId: string; groupName: string };
  PlayerMessages: undefined;
  ChatRoom: { roomId: string; title?: string };
  BrowseChatRooms: undefined;
  PlayerBookingChat: { orderId?: string; conversationId?: string };
  PlayerNotifications: undefined;
  PlayerHelp: { initialTab?: "start" | "explore" | "faq" | "whatsnew" } | undefined;
  PlayerGuide: { initialTab?: "start" | "explore" | "faq" | "whatsnew" } | undefined;
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
  ClassDetail: { session: any };
  DiscoveryMap: { initialFilter?: "all" | "academies" | "lessons" | "matches" | "tournaments" } | undefined;
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
  PlayerDNAWizard: undefined;
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
      if (screen && screen !== "Play") {
        navigation.navigate(screen, params);
        return;
      }
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
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
          headerBackVisible: true,
        }}
      />
      <PlayStack.Screen 
        name="CreateMatch" 
        component={CreateMatchScreen}
        options={{
          headerShown: true,
          headerTitle: "Find a Match",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <PlayStack.Screen 
        name="ChallengePlayer" 
        component={ChallengePlayerScreen}
        options={{
          headerShown: true,
          headerTitle: "Challenge",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <PlayStack.Screen 
        name="BookingInvites" 
        component={BookingInvitesScreen}
        options={{
          headerShown: true,
          headerTitle: t('player.booking.invites'),
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: '#E040FB',
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <PlayStack.Screen 
        name="BookingPreferences" 
        component={BookingPreferencesScreen}
        options={{
          headerShown: true,
          headerTitle: t('player.booking.preferences'),
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
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
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: '#00ff88',
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ScheduleStack.Screen 
        name="MatchDetail" 
        component={MatchDetailScreen}
        options={{
          headerShown: true,
          headerTitle: "Match Details",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ScheduleStack.Screen
        name="MatchPrep"
        component={MatchPrepScreen}
        options={{
          headerShown: true,
          headerTitle: "Match Preparation",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ScheduleStack.Screen
        name="OpponentProfile"
        component={OpponentProfileScreen}
        options={{
          headerShown: true,
          headerTitle: "Opponent Profile",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: '#A78BFA',
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
    </ScheduleStack.Navigator>
  );
}

type GrowthSubTab = "Progress" | "Quests" | "Schedule";
const GROWTH_SCHEDULE_SCREENS = new Set(["ScheduleMain", "CourtBooking", "CourtDetail", "MyCourtBookings", "QuickBook", "Match", "MatchDetail", "MatchPrep", "OpponentProfile"]);
const GROWTH_QUESTS_SCREENS = new Set(["QuestsMain"]);

function GrowthScreen({ setSubTabSetter }: { setSubTabSetter: (setter: (t: GrowthSubTab) => void) => void }) {
  const [activeSubTab, setActiveSubTab] = useState<GrowthSubTab>("Progress");
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setSubTabSetter(setActiveSubTab);
  }, [setSubTabSetter]);

  const modifiedInsets = useMemo(() => ({ ...insets, top: 0 }), [insets]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.dark.backgroundRoot }}>
      <View style={{ paddingTop: insets.top + 6, paddingBottom: 6, paddingHorizontal: Spacing.md, flexDirection: "row", gap: 8, backgroundColor: Colors.dark.backgroundRoot }}>
        {(["Progress", "Quests", "Schedule"] as GrowthSubTab[]).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => { setActiveSubTab(tab); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 24, backgroundColor: activeSubTab === tab ? GlowColors.primary : Colors.dark.chipBackgroundStrong, alignItems: "center" }}
          >
            <Text style={{ color: activeSubTab === tab ? "#000" : Colors.dark.text, fontWeight: "700", fontSize: 13 }}>{tab}</Text>
          </Pressable>
        ))}
      </View>
      <SafeAreaInsetsContext.Provider value={modifiedInsets}>
        {activeSubTab === "Progress" ? <PlayerProgressScreen /> : null}
        {activeSubTab === "Quests" ? <QuestsScreen /> : null}
        {activeSubTab === "Schedule" ? <PlayerScheduleScreen /> : null}
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

function GrowthMainWithCallback(props: any) {
  const navigation = useNavigation<any>();
  const { registerTabCallback } = useTabNavigation();
  const subTabSetterRef = useRef<((tab: GrowthSubTab) => void) | null>(null);

  const setSubTabSetter = useCallback((setter: (t: GrowthSubTab) => void) => {
    subTabSetterRef.current = setter;
  }, []);

  useEffect(() => {
    return registerTabCallback("Growth", (screen, params) => {
      if (GROWTH_QUESTS_SCREENS.has(screen) || screen === "Quests") {
        subTabSetterRef.current?.("Quests");
      } else if (GROWTH_SCHEDULE_SCREENS.has(screen) || screen === "Schedule" || screen === "ScheduleMain") {
        subTabSetterRef.current?.("Schedule");
        if (screen !== "ScheduleMain" && screen !== "Schedule") {
          setTimeout(() => navigation.navigate(screen as any, params), 150);
        }
      } else if (screen === "Progress" || screen === "ProgressMain") {
        subTabSetterRef.current?.("Progress");
      } else {
        navigation.navigate(screen as any, params);
      }
    });
  }, [navigation, registerTabCallback]);

  return <GrowthScreen {...props} setSubTabSetter={setSubTabSetter} />;
}

function ProgressStackNavigator() {
  const { t } = useTranslation();

  return (
    <ProgressStack.Navigator screenOptions={{ headerShown: false }}>
      <ProgressStack.Screen name="ProgressMain" component={GrowthMainWithCallback} />
      <ProgressStack.Screen 
        name="GlowLeaderboard" 
        component={GlowLeaderboardScreen}
        options={{
          headerShown: true,
          headerTitle: "Leaderboard",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen
        name="CountryLeaderboard"
        component={CountryLeaderboardScreen}
        options={{
          headerShown: true,
          headerTitle: "Country Leaderboards",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
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
        options={{ headerShown: false }}
      />
      <ProgressStack.Screen 
        name="TournamentDetail" 
        component={TournamentDetailScreen}
        options={{ headerShown: false }}
      />
      <ProgressStack.Screen 
        name="LadderDetail" 
        component={LadderDetailScreen}
        options={{ headerShown: false }}
      />
      <ProgressStack.Screen 
        name="FeedbackCenter" 
        component={FeedbackCenterScreen}
        options={{ headerShown: false }}
      />
      <ProgressStack.Screen 
        name="CoachFeedbackHistory" 
        component={CoachFeedbackHistoryScreen}
        options={{ headerShown: false }}
      />
      <ProgressStack.Screen 
        name="SkillEvidence" 
        component={SkillEvidenceScreen}
        options={{
          headerShown: true,
          headerTitle: "Skill Evidence",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen 
        name="TrialGates" 
        component={TrialGatesScreen}
        options={{
          headerShown: true,
          headerTitle: "Trial Gates",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen 
        name="Collection" 
        component={CollectionScreen}
        options={{
          headerShown: true,
          headerTitle: "Collection",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen 
        name="XPHistory" 
        component={XPHistoryScreen}
        options={{
          headerShown: true,
          headerTitle: "XP History",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen 
        name="LevelUpHistory" 
        component={LevelUpHistoryScreen}
        options={{
          headerShown: true,
          headerTitle: "Level History",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen 
        name="CourtBooking" 
        component={CourtBookingScreen}
        options={{ headerShown: false }}
      />
      <ProgressStack.Screen 
        name="CourtDetail" 
        component={CourtDetailScreen}
        options={{ headerShown: false }}
      />
      <ProgressStack.Screen 
        name="MyCourtBookings" 
        component={MyCourtBookingsScreen}
        options={{ headerShown: false }}
      />
      <ProgressStack.Screen 
        name="Match" 
        component={MatchScreen}
        options={{
          headerShown: true,
          headerTitle: t('nav.matches'),
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: '#00ff88',
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen 
        name="MatchDetail" 
        component={MatchDetailScreen}
        options={{
          headerShown: true,
          headerTitle: "Match Details",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen
        name="MatchPrep"
        component={MatchPrepScreen}
        options={{
          headerShown: true,
          headerTitle: "Match Preparation",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen
        name="OpponentProfile"
        component={OpponentProfileScreen}
        options={{
          headerShown: true,
          headerTitle: "Opponent Profile",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: '#A78BFA',
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
    </ProgressStack.Navigator>
  );
}

const SHOW_CHAT_TABS = ["Home"];

const TAB_FEATURE_KEYS: Record<string, string> = {
  Home: "tab:home",
  Community: "tab:social",
  PlayStack: "tab:play",
  Growth: "tab:growth",
  Profile: "tab:me",
};

// All players land on Home. (Discover tab removed in Task #1086.)
// Status hook retained because other logic still consults free-player flag.
function useFreePlayerStatus(): { isFreePlayer: boolean; isReady: boolean } {
  const { user } = useAuth();
  const { data, isFetched } = useQuery<{ isFreePlayer?: boolean; academy?: unknown }>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!user?.playerId,
    staleTime: 10 * 60 * 1000,
  });
  if (!user?.playerId) {
    return { isFreePlayer: false, isReady: true };
  }
  if (!data) {
    return { isFreePlayer: false, isReady: isFetched };
  }
  const isFreePlayer = data.isFreePlayer ?? !data.academy;
  return { isFreePlayer, isReady: true };
}

// Task #1034 — Last-used-tab persistence. Stored as { role, tab } so that
// when a free player joins an academy (role transitions from "free" → "academy")
// we reset the default to Home; otherwise we restore the last tab they used.
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
        // Academy players: restore last tab when role+user match; otherwise
        // reset to role default.
        const sameContext = stored && stored.role === role && (!stored.userId || !userId || stored.userId === userId);
        const candidate = sameContext && stored && validTabKeys.has(stored.tab)
          ? stored.tab
          : rolesDefaultTab(role);
        if (!sameContext) {
          AsyncStorage.setItem(
            TAB_STORAGE_KEY,
            JSON.stringify({ role, tab: candidate, userId } satisfies StoredTabState),
          ).catch(() => { /* best-effort */ });
        }
        setResolved({ tab: candidate, ready: true });
      })
      .catch(() => {
        if (cancelled) return;
        setResolved({ tab: rolesDefaultTab(role), ready: true });
      });
    return () => { cancelled = true; };
  }, [isFreePlayer, isPlayerStatusReady, userId, validTabKeys]);

  return { initialTabKey: resolved.tab, isResolved: resolved.ready };
}

function PlayerTabsContent({ onEdgeSwipeLeft, drawerOpen = false }: { onEdgeSwipeLeft?: () => void; drawerOpen?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isFreePlayer, isReady: isPlayerStatusReady } = useFreePlayerStatus();

  const playerTabs: TabConfig[] = useMemo(() => [
    { key: "Home", label: "Home", icon: "home-outline", iconFocused: "home", component: ProPlayerHomeScreen },
    { key: "Community", label: "Social", icon: "people-outline", iconFocused: "people", component: CommunityScreen },
    { key: "PlayStack", label: "Play", icon: "game-controller-outline", iconFocused: "game-controller", component: PlayStackNavigator },
    { key: "Growth", label: "Growth", icon: "trending-up-outline", iconFocused: "trending-up", component: ProgressStackNavigator },
    { key: "Profile", label: "Me", icon: "person-outline", iconFocused: "person", component: PlayerProfileScreen },
  ], [t]);

  const validTabKeys = useMemo(() => new Set(playerTabs.map(t => t.key)), [playerTabs]);
  const { initialTabKey, isResolved } = useResolvedInitialTab(
    isFreePlayer,
    isPlayerStatusReady,
    user?.playerId,
    validTabKeys,
  );
  const initialPage = playerTabs.findIndex(tab => tab.key === initialTabKey);
  const [currentTabKey, setCurrentTabKey] = useState(initialTabKey);
  const navigation = useNavigation<any>();
  const track = useTrackFeature();
  const isMountedRef = useRef(false);

  const playCenterButton = useMemo(() => ({
    icon: "tennisball-outline" as const,
    iconFocused: "tennisball" as const,
    label: "Play",
    color: Colors.dark.primary,
    pagerIndex: playerTabs.findIndex(tab => tab.key === "PlayStack"),
  }), [playerTabs]);
  
  const hideChat = !SHOW_CHAT_TABS.includes(currentTabKey);

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
    // Task #1034 — persist last-used tab so the next session restores it.
    // Skip writes until the role-aware initial resolution finished, so we
    // don't accidentally overwrite the stored tab with the loading default.
    if (isResolved) {
      const role: PlayerRole = isFreePlayer ? "free" : "academy";
      AsyncStorage.setItem(
        TAB_STORAGE_KEY,
        JSON.stringify({ role, tab: key, userId: user?.playerId } satisfies StoredTabState),
      ).catch(() => { /* best-effort */ });
    }
  }, [track, isResolved, isFreePlayer, user?.playerId]);
  
  const renderOverlay = useCallback((tabKey: string) => {
    if (drawerOpen) return null;
    if (!SHOW_CHAT_TABS.includes(tabKey)) return null;
    
    return <CoachChatFooter mode="player" onChallenge={handleChallenge} />;
  }, [handleChallenge, drawerOpen]);

  const { isChatExpanded } = useChatState();

  return (
    <SwipeableTabBar
      key={isResolved ? `tabs-${initialTabKey}` : "tabs-loading"}
      tabs={playerTabs}
      initialPage={initialPage >= 0 ? initialPage : 0}
      primaryColor={Colors.dark.primary}
      secondaryColor={Colors.dark.primary}
      onEdgeSwipeLeft={onEdgeSwipeLeft}
      onPageChange={handlePageChange}
      renderOverlay={renderOverlay}
      centerButtonConfig={drawerOpen ? undefined : playCenterButton}
      hideTabBar={isChatExpanded}
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
      <PlayerTabsContent onEdgeSwipeLeft={handleEdgeSwipeLeft} drawerOpen={drawerVisible} />
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

function LegacyScheduleRedirect() {
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  React.useEffect(() => {
    navigation.goBack();
    setTimeout(() => navigateToTab("Growth", { screen: "Schedule" }), 100);
  }, []);
  return null;
}

function LegacyQuestsRedirect() {
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  React.useEffect(() => {
    navigation.goBack();
    setTimeout(() => navigateToTab("Growth", { screen: "Quests" }), 100);
  }, []);
  return null;
}

function LegacyProgressRedirect() {
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  React.useEffect(() => {
    navigation.goBack();
    setTimeout(() => navigateToTab("Growth", { screen: "Progress" }), 100);
  }, []);
  return null;
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
        name="ThemePreview"
        component={ThemePreviewScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Theme Gallery",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
          headerBackVisible: true,
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
        name="PlayerHolidays"
        component={PlayerHolidaysScreen}
        options={{
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="ManageMatch"
        component={ManageMatchScreen}
        options={{
          headerShown: true,
          headerTitle: t('player.booking.manageMatch'),
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
          headerBackVisible: true,
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
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
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
        name="BookingConfirmed"
        component={BookingConfirmedScreen}
        options={{
          presentation: "modal",
          headerShown: false,
          animation: "slide_from_bottom",
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
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
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
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
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
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
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
        name="ChatRoom"
        component={ChatRoomScreen}
        options={{ presentation: "card", headerShown: false }}
      />
      <Stack.Screen
        name="BrowseChatRooms"
        component={BrowseChatRoomsScreen}
        options={{ presentation: "card", headerShown: false }}
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
        component={PlayerGuideScreen}
        options={{
          presentation: "card",
          headerShown: false,
        }}
      />
      <Stack.Screen 
        name="PlayerGuide" 
        component={PlayerGuideScreen}
        options={{
          presentation: "card",
          headerShown: false,
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
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="ServiceDetail" 
        component={ServiceDetailScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Service",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="PlayerOrderDetail" 
        component={PlayerOrderDetailScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Booking Detail",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="Cart" 
        component={CartScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Cart",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="ShopCategory" 
        component={ShopCategoryScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Category",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="Marketplace" 
        component={MarketplaceScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Marketplace",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="MarketplaceListing" 
        component={MarketplaceListingDetailScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Listing",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="MyListings" 
        component={MyListingsScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "My Listings",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="Equipment" 
        component={PlayerEquipmentScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Equipment",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="BookingPreferences" 
        component={BookingPreferencesScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: t('player.booking.preferences'),
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '700' },
        }}
      />
      <Stack.Screen 
        name="BookingInvites" 
        component={BookingInvitesScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: t('player.booking.invites'),
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="FamilyLobby" 
        component={FamilyLobbyScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Family",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
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
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen
        name="CreateGameRequest"
        component={CreateGameRequestScreen}
        options={{
          headerShown: true,
          headerTitle: "Post a Game",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen
        name="MyGames"
        component={MyGamesScreen}
        options={{
          headerShown: true,
          headerTitle: "My Games",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen
        name="DiscoveryMap"
        component={DiscoveryMapScreen}
        options={{
          headerShown: true,
          headerTitle: "Map",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen
        name="ClassesDiscovery"
        component={ClassesDiscoveryScreen}
        options={{
          headerShown: true,
          headerTitle: "Classes",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
          headerTransparent: false,
        }}
      />
      <Stack.Screen
        name="ClassDetail"
        component={ClassDetailScreen}
        options={{
          headerShown: true,
          headerTitle: "Class Details",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <Stack.Screen name="Schedule" component={LegacyScheduleRedirect} options={{ headerShown: false }} />
      <Stack.Screen name="Quests" component={LegacyQuestsRedirect} options={{ headerShown: false }} />
      <Stack.Screen name="Progress" component={LegacyProgressRedirect} options={{ headerShown: false }} />
      <Stack.Screen
        name="PlayerDNAWizard"
        component={PlayerDNAWizardScreen}
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
          animation: "slide_from_bottom",
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

function PlayerThemedRoot({ children }: { children: React.ReactNode }) {
  const { resolvedScheme } = usePlayerAppearance();
  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      <StatusBar style={resolvedScheme === "light" ? "dark" : "light"} />
      {/* Keying the inner tree on the resolved scheme forces a remount when
          the player toggles Light/Dark/System. Combined with the
          `makeReactiveStyles` Proxy, every screen and component re-evaluates
          its StyleSheet against the freshly mutated theme tokens, giving us
          a coherent player-wide repaint without per-component refactors. */}
      <View key={resolvedScheme} style={styles.container}>
        {children}
      </View>
    </View>
  );
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
        <ActivityIndicator size="large" color={Colors.dark.primary} />
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
    <PlayerAppearanceProvider>
      <ChatStateProvider>
        <TabNavigationProvider>
          <ScheduleFocusProvider>
          <PlayerDataProvider>
            <SportContextProvider>
              <CartProvider>
                <FamilyProvider playerId={playerId}>
                  <PlayerLevelProvider playerId={playerId}>
                    <PlayerThemedRoot>
                      <FamilySwitchBackBanner />
                      <PlayerStackNavigator />
                      <FloatingHelpButton />
                    </PlayerThemedRoot>
                  </PlayerLevelProvider>
                </FamilyProvider>
              </CartProvider>
            </SportContextProvider>
          </PlayerDataProvider>
          </ScheduleFocusProvider>
        </TabNavigationProvider>
      </ChatStateProvider>
    </PlayerAppearanceProvider>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
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
    borderTopColor: Colors.dark.accentTextSoft,
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
}));
