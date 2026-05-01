import React, { useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";

import { PlayerProvider as PlayerDataProvider } from "@/player/context/PlayerContext";
import { PlayerAppearanceProvider } from "@/player/context/PlayerAppearanceContext";
import { PlayerDrawerProvider, usePlayerDrawer } from "@/player/context/PlayerDrawerContext";
import { TabNavigationProvider } from "@/components/TabNavigationContext";
import { useChatState } from "@/coach/context/ChatStateContext";
import { SwipeableTabBar, TabConfig } from "@/components/SwipeableTabBar";
import { Colors } from "@/constants/theme";

import PlayerIdentityDrawer from "@/components/PlayerIdentityDrawer";
import { CoachChatFooter } from "@/coach/components/CoachChatFooter";

import ProPlayerHomeDiagnosticScreen from "@/player/screens/ProPlayerHomeDiagnosticScreen";
import FamilyLobbyScreen from "@/player/screens/FamilyLobbyScreen";
import ParentCreditStoreScreen from "@/player/screens/ParentCreditStoreScreen";
import PlayerNotificationsScreen from "@/player/screens/PlayerNotificationsScreen";
import PlayerGuideScreen from "@/player/screens/PlayerGuideScreen";
import PlayerDNAWizardScreen from "@/player/screens/PlayerDNAWizard";

// Placeholder screens for tabs that aren't built yet
function PlaceholderScreen() {
  return <View style={styles.placeholder} />;
}

export type DiagnosticStackParamList = {
  DiagnosticHome: undefined;
  FamilyLobby: undefined;
  ParentCreditStore: { playerId?: string };
  PlayerNotifications: undefined;
  PlayerHelp: { initialTab?: "start" | "explore" | "faq" | "whatsnew" } | undefined;
  PlayerDNAWizard: undefined;
};

const Stack = createNativeStackNavigator<DiagnosticStackParamList>();

// The 5 tabs — exact same keys / icons / labels as PlayerNavigator
const DIAGNOSTIC_TABS: TabConfig[] = [
  {
    key: "Home",
    label: "Home",
    icon: "home-outline",
    iconFocused: "home",
    component: ProPlayerHomeDiagnosticScreen,
  },
  {
    key: "Social",
    label: "Social",
    icon: "people-outline",
    iconFocused: "people",
    component: PlaceholderScreen,
  },
  {
    key: "PlayStack",
    label: "Play",
    icon: "tennisball-outline",
    iconFocused: "tennisball",
    component: PlaceholderScreen,
  },
  {
    key: "Growth",
    label: "Growth",
    icon: "trending-up-outline",
    iconFocused: "trending-up",
    component: PlaceholderScreen,
  },
  {
    key: "Profile",
    label: "Me",
    icon: "person-outline",
    iconFocused: "person",
    component: PlaceholderScreen,
  },
];

const PLAY_CENTER_BUTTON = {
  icon: "tennisball-outline" as const,
  iconFocused: "tennisball" as const,
  label: "Play",
  color: Colors.dark.primary,
  pagerIndex: 2, // PlayStack is index 2
};

// Chat only shows on Home tab — mirrors SHOW_CHAT_TABS = ["Home"] in PlayerNavigator
const SHOW_CHAT_TABS = ["Home"];

// Inner tab view component — rendered as the DiagnosticHome screen
function DiagnosticTabView() {
  const { isChatExpanded } = useChatState();

  const handleChallenge = useCallback((_opponentId: string, _opponentName: string) => {
    // placeholder — Play tab not built yet
  }, []);

  const handlePageChange = useCallback(() => {}, []);

  const renderOverlay = useCallback((tabKey: string) => {
    if (!SHOW_CHAT_TABS.includes(tabKey)) return null;
    return <CoachChatFooter mode="player" onChallenge={handleChallenge} />;
  }, [handleChallenge]);

  return (
    <SwipeableTabBar
      tabs={DIAGNOSTIC_TABS}
      initialPage={0}
      primaryColor={Colors.dark.primary}
      secondaryColor={Colors.dark.primary}
      onPageChange={handlePageChange}
      renderOverlay={renderOverlay}
      centerButtonConfig={PLAY_CENTER_BUTTON}
      hideTabBar={isChatExpanded}
    />
  );
}

// Exact copy of PlayerTabsWithDrawer pattern — wires openDrawer + renders overlay
function DiagnosticStackWithDrawer() {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const navigation = useNavigation<any>();
  const { setOpenDrawer } = usePlayerDrawer();

  React.useEffect(() => {
    setOpenDrawer(() => setDrawerVisible(true));
    // setOpenDrawer is unstable (not memoized in PlayerDrawerContext) —
    // intentionally run only on mount to register the opener once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrawerNavigate = useCallback(
    (screen: string, params?: Record<string, unknown>) => {
      navigation.navigate(screen as never, params as never);
      setTimeout(() => setDrawerVisible(false), 100);
    },
    [navigation],
  );

  return (
    <View style={styles.flex}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* DiagnosticHome renders the full SwipeableTabBar */}
        <Stack.Screen name="DiagnosticHome" component={DiagnosticTabView} />
        {/* Push screens — navigated to from ProPlayerCard / drawer */}
        <Stack.Screen name="FamilyLobby" component={FamilyLobbyScreen} />
        <Stack.Screen
          name="ParentCreditStore"
          component={ParentCreditStoreScreen}
          options={{ presentation: "card" }}
        />
        <Stack.Screen
          name="PlayerNotifications"
          component={PlayerNotificationsScreen}
          options={{ presentation: "card" }}
        />
        <Stack.Screen
          name="PlayerHelp"
          component={PlayerGuideScreen}
          options={{ presentation: "card" }}
        />
        <Stack.Screen
          name="PlayerDNAWizard"
          component={PlayerDNAWizardScreen}
          options={{ presentation: "card" }}
        />
      </Stack.Navigator>
      <PlayerIdentityDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onNavigateToProfile={() => {
          setDrawerVisible(false);
        }}
        onNavigate={handleDrawerNavigate}
      />
    </View>
  );
}

export default function DiagnosticNavigator() {
  return (
    <PlayerAppearanceProvider>
      <TabNavigationProvider>
        <PlayerDataProvider>
          <PlayerDrawerProvider>
            <DiagnosticStackWithDrawer />
          </PlayerDrawerProvider>
        </PlayerDataProvider>
      </TabNavigationProvider>
    </PlayerAppearanceProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  placeholder: { flex: 1, backgroundColor: "#0a0a0a" },
});
