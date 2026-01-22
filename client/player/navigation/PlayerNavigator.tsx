import React, { useState } from "react";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import { HeaderButton } from "@react-navigation/elements";
import { StyleSheet, View, Platform, ActivityIndicator, ViewStyle } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import FriendsListScreen from "@/player/screens/FriendsListScreen";
import GroupsScreen from "@/player/screens/GroupsScreen";
import GroupDetailScreen from "@/player/screens/GroupDetailScreen";
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
import BookingPreferencesScreen from "@/player/screens/BookingPreferencesScreen";
import BookingInvitesScreen from "@/player/screens/BookingInvitesScreen";
import FamilyLobbyScreen from "@/player/screens/FamilyLobbyScreen";
import NewsScreen from "@/player/screens/NewsScreen";
import PlayerIdentityDrawer from "@/components/PlayerIdentityDrawer";
import { CartProvider } from "@/player/contexts/CartContext";
import { CoachChatFooter } from "@/coach/components/CoachChatFooter";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { PlayerDrawerProvider, usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { PlayerLevelProvider } from "@/player/context/PlayerLevelContext";
import { FamilyProvider } from "@/player/context/FamilyContext";
import { PlayerProvider as PlayerDataProvider } from "@/player/context/PlayerContext";
import { QuickActionsFAB, QuickAction } from "@/components/QuickActionsFAB";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export { usePlayerDrawer };

export type PlayerTabParamList = {
  Home: undefined;
  Community: undefined;
  PlayStack: undefined;
  Schedule: undefined;
  Progress: undefined;
  Profile: undefined;
};

export type PlayStackParamList = {
  Play: undefined;
  OpenMatches: undefined;
  CreateMatch: undefined;
  BookingInvites: undefined;
  BookingPreferences: undefined;
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
  QuickBook: undefined;
  CourtDetail: { courtId: string; date: string };
  MyCourtBookings: undefined;
  LessonBooking: undefined;
  BrowseGroupLessons: undefined;
  MyLessonRequests: undefined;
  PlayerFinder: undefined;
  GlowLeaderboard: undefined;
  FriendsList: undefined;
  Groups: undefined;
  GroupDetail: { groupId: string; groupName: string };
  PlayerMessages: undefined;
  PlayerNotifications: undefined;
  PlayerHelp: undefined;
  PublicProfile: { playerId?: string };
  CoachProfile: { coachId: string };
  Quests: undefined;
  Shop: undefined;
  ProductDetail: { productId: string };
  ServiceDetail: { serviceId: string };
  Cart: undefined;
  ShopCategory: { categoryId: string; categoryName: string };
  Marketplace: undefined;
  MarketplaceListing: { listingId: string };
  MyListings: undefined;
  Match: { opponentId?: string } | undefined;
  MatchDetail: { matchId: string };
  SkillEvidence: undefined;
  TrialGates: undefined;
  Collection: undefined;
  XPHistory: undefined;
  LevelUpHistory: undefined;
  BookingPreferences: undefined;
  BookingInvites: undefined;
  FamilyLobby: undefined;
  News: undefined;
};

const Tab = createBottomTabNavigator<PlayerTabParamList>();
const Stack = createNativeStackNavigator<PlayerStackParamList>();
const PlayStack = createNativeStackNavigator<PlayStackParamList>();

function PlayStackNavigator() {
  return (
    <PlayStack.Navigator screenOptions={{ headerShown: false }}>
      <PlayStack.Screen name="Play" component={PlayScreen} />
      <PlayStack.Screen 
        name="OpenMatches" 
        component={OpenMatchFeedScreen}
        options={{
          headerShown: true,
          headerTitle: "Open Matches",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
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
        name="BookingInvites" 
        component={BookingInvitesScreen}
        options={{
          headerShown: true,
          headerTitle: "Invites",
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
          headerTitle: "Preferences",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
    </PlayStack.Navigator>
  );
}

function PlayerTabsContent() {
  const currentRouteName = useNavigationState((state) => {
    if (!state || !state.routes || state.routes.length === 0) return "Home";
    const tabState = state.routes[0]?.state;
    if (!tabState) return "Home";
    const index = tabState.index ?? 0;
    return tabState.routes?.[index]?.name ?? "Home";
  });
  
  const hideChat = currentRouteName === "Play" || currentRouteName === "PlayStack" || currentRouteName === "Social" || currentRouteName === "Community";
  
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
          component={ProPlayerHomeScreen}
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
          name="PlayStack"
          component={PlayStackNavigator}
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
      {!hideChat && <CoachChatFooter mode="player" />}
      {!hideChat && <PlayerQuickActionsFAB />}
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

  const handleDrawerNavigate = (screen: string, params?: any) => {
    // Navigate first using the Stack navigator context
    if (screen === "PlayerTabs" && params?.screen) {
      navigation.navigate("PlayerTabs", { screen: params.screen });
    } else {
      navigation.navigate(screen, params);
    }
    // Then close drawer
    setTimeout(() => {
      setDrawerVisible(false);
    }, 100);
  };
  
  return (
    <View style={{ flex: 1 }}>
      <PlayerTabsContent />
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
        name="QuickBook" 
        component={QuickBookScreen}
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
          headerShown: true,
          headerTitle: "Book Lesson",
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
        name="GlowLeaderboard" 
        component={GlowLeaderboardScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Leaderboard",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
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
        name="News" 
        component={NewsScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Tennis News",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="Groups" 
        component={GroupsScreen}
        options={{
          presentation: "card",
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
        name="Quests" 
        component={QuestsScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Quests",
          headerStyle: { backgroundColor: Colors.dark.backgroundRoot },
          headerTintColor: Colors.dark.text,
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen 
        name="Shop" 
        component={ShopScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Academy Shop",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
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
        name="Match" 
        component={MatchScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Matches",
          headerStyle: { backgroundColor: '#0a0f1a' },
          headerTintColor: '#00ff88',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="MatchDetail" 
        component={MatchDetailScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Match Details",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="SkillEvidence" 
        component={SkillEvidenceScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Skill Evidence",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="TrialGates" 
        component={TrialGatesScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Trial Gates",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="Collection" 
        component={CollectionScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Collection",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="XPHistory" 
        component={XPHistoryScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "XP History",
          headerStyle: { backgroundColor: '#090E17' },
          headerTintColor: '#CCFF00',
          headerTitleStyle: { color: '#ffffff', fontWeight: '600' },
        }}
      />
      <Stack.Screen 
        name="LevelUpHistory" 
        component={LevelUpHistoryScreen}
        options={{
          presentation: "card",
          headerShown: true,
          headerTitle: "Level History",
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
          headerTitle: "Preferences",
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
          headerTitle: "Booking Invites",
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

  const playerId = user?.playerId || dashboard?.player?.id || null;

  return (
    <PlayerDataProvider>
      <CartProvider>
        <FamilyProvider playerId={playerId}>
          <PlayerLevelProvider playerId={playerId}>
            <View style={styles.container}>
              <PlayerStackNavigator />
            </View>
          </PlayerLevelProvider>
        </FamilyProvider>
      </CartProvider>
    </PlayerDataProvider>
  );
}

function PlayerQuickActionsFAB() {
  const navigation = useNavigation<NativeStackNavigationProp<PlayerStackParamList>>();

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
      onPress: () => navigation.navigate("Match"),
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
      onPress: () => navigation.navigate("Quests"),
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
    elevation: 0,
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
