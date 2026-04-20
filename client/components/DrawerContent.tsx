import React, { useState } from "react";
import { View, StyleSheet, Pressable, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { DrawerContentComponentProps } from "@react-navigation/drawer";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { ReportIssueModal } from "@/components/ReportIssueModal";
import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/coach/context/AuthContext";
import { useUIInteraction } from "@/contexts/UIInteractionContext";
import { DRAWER_ITEMS } from "@/constants/playerData";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

export function DrawerContent({ navigation, state }: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const { player } = usePlayer();
  const { logout } = useAuth();
  
  const playerName = player.name;
  const playerLevel = player.level;

  const { trackInteraction } = useUIInteraction();
  const [showReportModal, setShowReportModal] = useState(false);
  const currentRouteName = state.routes[state.index]?.name;
  const routeToMenuId: Record<string, string> = {
    Lessons: "lessons",
    Quest: "quest",
    Match: "match",
    Ranking: "ranking",
    AdultGlowRank: "adultGlowRank",
    Friends: "friends",
    GameLobby: "gameLobby",
    Events: "events",
    Settings: "settings",
  };
  const currentMenuId = routeToMenuId[currentRouteName] || currentRouteName;

  const handleLogout = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            navigation.closeDrawer();
            logout();
          },
        },
      ]
    );
  };

  const handleNavigate = (screenId: string) => {
    const routeMap: Record<string, string> = {
      lessons: "Lessons",
      quest: "Quest",
      match: "Match",
      ranking: "Ranking",
      adultGlowRank: "AdultGlowRank",
      friends: "Friends",
      gameLobby: "GameLobby",
      events: "Events",
      settings: "Settings",
    };
    const routeName = routeMap[screenId];
    if (routeName) {
      navigation.navigate(routeName);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <ThemedText style={styles.playerName}>{playerName}</ThemedText>
          <ThemedText style={styles.playerLevel}>Level {playerLevel}</ThemedText>
        </View>
      </View>

      <View style={styles.menuItems}>
        {DRAWER_ITEMS.map((item) => {
          const isActive = currentMenuId === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => handleNavigate(item.id)}
              style={({ pressed }) => [
                styles.menuItem,
                isActive && styles.menuItemActive,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons
                name={item.icon as keyof typeof Ionicons.glyphMap}
                size={22}
                color={isActive ? Colors.dark.primary : Colors.dark.text}
              />
              <ThemedText
                style={[styles.menuItemText, isActive && styles.menuItemTextActive]}
              >
                {item.name}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            trackInteraction("button", "Report an Issue", currentRouteName || "Drawer");
            navigation.closeDrawer();
            setShowReportModal(true);
          }}
          style={({ pressed }) => [styles.reportButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="flag-outline" size={22} color={Colors.dark.orange} />
          <ThemedText style={styles.reportText}>Report an Issue</ThemedText>
        </Pressable>

        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [styles.logoutButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="log-out-outline" size={22} color={Colors.dark.error} />
          <ThemedText style={styles.logoutText}>Logout</ThemedText>
        </Pressable>
      </View>

      <ReportIssueModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        currentScreen={currentRouteName}
      />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.divider,
  },
  headerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  playerLevel: {
    fontSize: 14,
    color: GlowColors.primary,
    marginTop: 2,
  },
  menuItems: {
    flex: 1,
    paddingTop: Spacing.lg,
    gap: Spacing.xs,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  menuItemActive: {
    backgroundColor: Backgrounds.card,
  },
  menuItemText: {
    fontSize: 16,
    color: Colors.dark.text,
  },
  menuItemTextActive: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.divider,
    paddingTop: Spacing.lg,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  logoutText: {
    fontSize: 16,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  reportText: {
    fontSize: 16,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
}));
