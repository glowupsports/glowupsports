import React, { useState, useRef, useCallback, useMemo } from "react";
import { StyleSheet, View, Platform, ActivityIndicator, Pressable, Dimensions } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import PagerView from "react-native-pager-view";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, interpolate, SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import OfflineBanner from "@/components/OfflineBanner";
import { QuickActionsFAB, QuickAction } from "@/components/QuickActionsFAB";
import { PremiumAddPlayerFlow } from "@/coach/components/PremiumAddPlayerFlow";
import { useAuth } from "@/coach/context/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import * as Haptics from "expo-haptics";

export type CoachTabParamList = {
  Dashboard: undefined;
  Calendar: undefined;
  Players: undefined;
  Coaching: undefined;
  Settings: undefined;
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Tab configuration
const TAB_CONFIG = [
  { key: "Dashboard", label: "Home", icon: "home-outline", iconFocused: "home" },
  { key: "Calendar", label: "Calendar", icon: "calendar-outline", iconFocused: "calendar" },
  { key: "Players", label: "Players", icon: "people-outline", iconFocused: "people" },
  { key: "Coaching", label: "Coaching", icon: "clipboard-outline", iconFocused: "clipboard" },
  { key: "Settings", label: "Settings", icon: "settings-outline", iconFocused: "settings" },
] as const;

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
};

const Stack = createNativeStackNavigator<CoachStackParamList>();

// Custom animated tab bar item
function SwipeableTabItem({ 
  tab, 
  index, 
  currentIndex, 
  scrollOffset,
  onPress 
}: { 
  tab: typeof TAB_CONFIG[number]; 
  index: number; 
  currentIndex: number;
  scrollOffset: SharedValue<number>;
  onPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollOffset.value - index);
    const scale = interpolate(distance, [0, 1], [1, 0.9]);
    const opacity = interpolate(distance, [0, 1], [1, 0.5]);
    
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const focused = currentIndex === index;
  const iconName = focused ? tab.iconFocused : tab.icon;

  return (
    <Pressable 
      style={styles.swipeTabItem} 
      onPress={onPress}
      android_ripple={{ color: Colors.dark.primary + "30", borderless: true }}
    >
      <Animated.View style={[styles.swipeTabIconContainer, animatedStyle]}>
        {focused && <View style={styles.tabIconGlow} />}
        <Ionicons 
          name={iconName as keyof typeof Ionicons.glyphMap}
          size={24} 
          color={focused ? Colors.dark.primary : Colors.dark.tabIconDefault} 
        />
      </Animated.View>
      <Animated.Text 
        style={[
          styles.swipeTabLabel, 
          { color: focused ? Colors.dark.primary : Colors.dark.tabIconDefault }
        ]}
      >
        {tab.label}
      </Animated.Text>
    </Pressable>
  );
}

// Animated indicator that follows swipe
function TabIndicator({ scrollOffset }: { scrollOffset: SharedValue<number> }) {
  const tabWidth = SCREEN_WIDTH / TAB_CONFIG.length;
  
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: withSpring(scrollOffset.value * tabWidth, { damping: 20, stiffness: 200 }) }],
    };
  });

  return (
    <Animated.View style={[styles.tabIndicator, { width: tabWidth }, animatedStyle]}>
      <LinearGradient
        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.tabIndicatorGradient}
      />
    </Animated.View>
  );
}

function CoachTabs() {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const queryClient = useQueryClient();
  const pagerRef = useRef<PagerView>(null);
  const scrollOffset = useSharedValue(0);

  const handlePageSelected = useCallback((e: any) => {
    const newIndex = e.nativeEvent.position;
    setCurrentIndex(newIndex);
    scrollOffset.value = newIndex;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [scrollOffset]);

  const handlePageScroll = useCallback((e: any) => {
    const { position, offset } = e.nativeEvent;
    scrollOffset.value = position + offset;
  }, [scrollOffset]);

  const navigateToPage = useCallback((index: number) => {
    pagerRef.current?.setPage(index);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const currentTabName = TAB_CONFIG[currentIndex].key;
  const showFAB = currentTabName !== "Calendar" && currentTabName !== "Players";

  const screens = useMemo(() => [
    <View key="Dashboard" style={styles.pageContainer}><DashboardScreen /></View>,
    <View key="Calendar" style={styles.pageContainer}><CalendarScreen /></View>,
    <View key="Players" style={styles.pageContainer}><PlayersScreen /></View>,
    <View key="Coaching" style={styles.pageContainer}><CoachingScreen /></View>,
    <View key="Settings" style={styles.pageContainer}><SettingsScreen /></View>,
  ], []);

  return (
    <View style={styles.tabsWrapper}>
      <PagerView
        ref={pagerRef}
        style={styles.pagerView}
        initialPage={0}
        onPageSelected={handlePageSelected}
        onPageScroll={handlePageScroll}
        overdrag={true}
        overScrollMode="never"
      >
        {screens}
      </PagerView>

      {/* Custom swipeable tab bar */}
      <View style={[styles.swipeTabBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
        <View style={styles.swipeTabBarBackground}>
          <LinearGradient
            colors={[Colors.dark.primary + "40", "transparent", Colors.dark.xpCyan + "40"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.tabBarTopLine}
          />
          {Platform.OS === "ios" ? (
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.androidTabBackground]} />
          )}
        </View>
        
        <TabIndicator scrollOffset={scrollOffset} />
        
        <View style={styles.swipeTabRow}>
          {TAB_CONFIG.map((tab, index) => (
            <SwipeableTabItem
              key={tab.key}
              tab={tab}
              index={index}
              currentIndex={currentIndex}
              scrollOffset={scrollOffset}
              onPress={() => navigateToPage(index)}
            />
          ))}
        </View>
      </View>

      {showFAB && (
        <CoachQuickActionsFAB onAddPlayer={() => setShowAddPlayerModal(true)} />
      )}
      <PremiumAddPlayerFlow
        visible={showAddPlayerModal}
        onClose={() => setShowAddPlayerModal(false)}
        onComplete={(player) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          queryClient.invalidateQueries({ queryKey: ["/api/players"] });
          queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
        }}
      />
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
        name="LessonTemplateLibrary" 
        component={LessonTemplateLibraryScreen}
        options={{
          headerShown: true,
          headerTitle: "Lesson Templates",
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
    academyId?: string;
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
  const hasAcademy = !!profile?.coach?.academyId;
  const showOnboarding = user?.coachId && !coachOnboardingCompleted && !hasAcademy && onboardingComplete !== true;

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
