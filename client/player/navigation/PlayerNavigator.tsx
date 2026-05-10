import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import { View, Platform, Pressable, Text } from "react-native";
import { useSafeAreaInsets, SafeAreaInsetsContext } from "react-native-safe-area-context";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { useTranslation } from "react-i18next";
import PlayScreen from "@/player/screens/PlayScreen";
import PlayerProgressScreen from "@/player/screens/PlayerProgressScreen";
import PlayerScheduleScreen from "@/player/screens/PlayerScheduleScreen";
import PlayerDrillsScreen from "@/player/screens/PlayerDrillsScreen";
import OpenMatchFeedScreen from "@/player/screens/OpenMatchFeedScreen";
import CreateMatchScreen from "@/player/screens/CreateMatchScreen";
import MatchFinderHomeScreen from "@/player/screens/MatchFinderHomeScreen";
import InviteClaimScreen from "@/player/screens/InviteClaimScreen";
import ChallengePlayerScreen from "@/player/screens/ChallengePlayerScreen";
import BookingInvitesScreen from "@/player/screens/BookingInvitesScreen";
import BookingPreferencesScreen from "@/player/screens/BookingPreferencesScreen";
import QuestsScreen from "@/player/screens/QuestsScreen";
import GlowLeaderboardScreen from "@/player/screens/GlowLeaderboardScreen";
import CountryLeaderboardScreen from "@/player/screens/CountryLeaderboardScreen";
import TournamentsScreen from "@/player/screens/TournamentsScreen";
import TournamentDetailScreen from "@/player/screens/TournamentDetailScreen";
import LadderDetailScreen from "@/player/screens/LadderDetailScreen";
import FeedbackCenterScreen from "@/player/screens/FeedbackCenterScreen";
import CoachFeedbackHistoryScreen from "@/player/screens/CoachFeedbackHistoryScreen";
import SkillEvidenceScreen from "@/player/screens/SkillEvidenceScreen";
import TrialGatesScreen from "@/player/screens/TrialGatesScreen";
import CollectionScreen from "@/player/screens/CollectionScreen";
import XPHistoryScreen from "@/player/screens/XPHistoryScreen";
import LevelUpHistoryScreen from "@/player/screens/LevelUpHistoryScreen";
import CourtBookingScreen from "@/player/screens/CourtBookingScreen";
import CourtDetailScreen from "@/player/screens/CourtDetailScreen";
import MyCourtBookingsScreen from "@/player/screens/MyCourtBookingsScreen";
import MatchScreen from "@/player/screens/MatchScreen";
import MatchDetailScreen from "@/player/screens/MatchDetailScreen";
import MatchPrepScreen from "@/player/screens/MatchPrepScreen";
import OpponentProfileScreen from "@/player/screens/OpponentProfileScreen";
import TechniqueUploadFlow from "@/player/screens/TechniqueUploadFlow";
import TechniqueAnalysisResultScreen from "@/player/screens/TechniqueAnalysisResultScreen";
import { Colors, Spacing, GlowColors } from "@/constants/theme";
import { usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { useTheme } from "@/contexts/ThemeContext";

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
  // Task #1362 — when launched from the Play sheet's "Post an open match"
  // shortcut, deep-link the wizard with the partner step pre-selected to
  // "Leave open for anyone" so the user skips re-answering that question.
  CreateMatch: { presetPartnerOption?: "find" | "select" } | undefined;
  MatchFinderHome: undefined;
  InviteClaim: { token?: string };
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
  TechniqueUploadFlow: undefined;
  TechniqueAnalysisResult: { analysisId: string; strokeType?: string };
};

export type PlayerStackParamList = {
  PlayerTabs: undefined;
  Schedule: undefined;
  Quests: undefined;
  Progress: undefined;
  Training: undefined;
  TrainingDetail: { sessionId: string };
  CourtBookingConfirmation: { sessionId: string };
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
  Groups: { initialTab?: "communities" | "training" | "discover" } | undefined;
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
  AccountAuditLog: { playerId?: string; playerName?: string } | undefined;
  News: undefined;
  PrivacySettings: { isOnboarding?: boolean; currentLevel?: string };
  SpotlightDetail: undefined;
  AcademyVsAcademy: undefined;
  SkillChallengeSubmissions: undefined;
  SquadGroup: { squadId: string; squadName?: string };
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
  // Task #1126 — Year-in-Tennis wrap.
  YearInTennis: { year?: number } | undefined;
};

const PlayStack = createNativeStackNavigator<PlayStackParamList>();
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

export function PlayStackNavigator() {
  const { t } = useTranslation();
  return (
    <PlayStack.Navigator screenOptions={{
      headerShown: false,
      animation: "none",
      // Task #1407 — iOS keeps inactive screens unfrozen so player tabs paint
      // immediately after splash dismiss. See RootStackNavigator for the full
      // rationale.
      freezeOnBlur: Platform.OS !== "ios",
    }}>
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
          headerTitle: "Post an open invite",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <PlayStack.Screen
        name="MatchFinderHome"
        component={MatchFinderHomeScreen}
        options={{
          headerShown: true,
          headerTitle: "Find a Match",
          headerTransparent: true,
          headerBlurEffect: "regular",
          headerStyle: { backgroundColor: "transparent" },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <PlayStack.Screen
        name="InviteClaim"
        component={InviteClaimScreen}
        options={{
          headerShown: true,
          headerTitle: "",
          headerTransparent: true,
          headerStyle: { backgroundColor: "transparent" },
          headerTintColor: Colors.dark.primary,
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

type GrowthSubTab = "Progress" | "Quests" | "Schedule" | "Drills";
const GROWTH_SCHEDULE_SCREENS = new Set(["ScheduleMain", "CourtBooking", "CourtDetail", "MyCourtBookings", "QuickBook", "Match", "MatchDetail", "MatchPrep", "OpponentProfile"]);
const GROWTH_QUESTS_SCREENS = new Set(["QuestsMain"]);

function GrowthScreen({ setSubTabSetter }: { setSubTabSetter: (setter: (t: GrowthSubTab) => void) => void }) {
  const [activeSubTab, setActiveSubTab] = useState<GrowthSubTab>("Progress");
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  useEffect(() => {
    setSubTabSetter(setActiveSubTab);
  }, [setSubTabSetter]);

  const modifiedInsets = useMemo(() => ({ ...insets, top: 0 }), [insets]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
      <View style={{ paddingTop: insets.top + 6, paddingBottom: 6, paddingHorizontal: Spacing.md, flexDirection: "row", gap: 6, backgroundColor: theme.backgroundRoot }}>
        {(["Progress", "Quests", "Schedule", "Drills"] as GrowthSubTab[]).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => { setActiveSubTab(tab); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 24, backgroundColor: activeSubTab === tab ? GlowColors.primary : theme.chipBackgroundStrong, alignItems: "center" }}
          >
            <Text style={{ color: activeSubTab === tab ? "#000" : theme.text, fontWeight: "700", fontSize: 12 }}>{tab}</Text>
          </Pressable>
        ))}
      </View>
      <SafeAreaInsetsContext.Provider value={modifiedInsets}>
        {activeSubTab === "Progress" ? <PlayerProgressScreen /> : null}
        {activeSubTab === "Quests" ? <QuestsScreen /> : null}
        {activeSubTab === "Schedule" ? <PlayerScheduleScreen /> : null}
        {activeSubTab === "Drills" ? <PlayerDrillsScreen /> : null}
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
      } else if (screen === "Drills") {
        subTabSetterRef.current?.("Drills");
      } else {
        navigation.navigate(screen as any, params);
      }
    });
  }, [navigation, registerTabCallback]);

  return <GrowthScreen {...props} setSubTabSetter={setSubTabSetter} />;
}

export function ProgressStackNavigator() {
  const { t } = useTranslation();

  return (
    <ProgressStack.Navigator screenOptions={{
      headerShown: false,
      animation: "none",
      // Task #1407 — see RootStackNavigator.
      freezeOnBlur: Platform.OS !== "ios",
    }}>
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
      <ProgressStack.Screen
        name="TechniqueUploadFlow"
        component={TechniqueUploadFlow}
        options={{
          headerShown: true,
          headerTitle: "Analyze My Technique",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
      <ProgressStack.Screen
        name="TechniqueAnalysisResult"
        component={TechniqueAnalysisResultScreen}
        options={{
          headerShown: true,
          headerTitle: "Technique Analysis",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.primary,
          headerTitleStyle: { color: Colors.dark.text, fontWeight: '600' },
        }}
      />
    </ProgressStack.Navigator>
  );
}
