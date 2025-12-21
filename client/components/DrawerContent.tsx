import React from "react";
import { View, StyleSheet, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { DrawerContentComponentProps } from "@react-navigation/drawer";

import { ThemedText } from "@/components/ThemedText";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";
import { DRAWER_ITEMS } from "@/constants/playerData";

export function DrawerContent({ navigation, state }: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const { player, resetData } = usePlayer();

  const currentRoute = state.routes[state.index]?.name;

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout? Your progress is saved locally.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            await resetData();
            navigation.closeDrawer();
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
      friends: "Friends",
      gameLobby: "GameLobby",
      events: "Events",
      payments: "Payments",
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
        <PlayerAvatar avatar={player.avatar} size={60} level={player.level} showLevel />
        <View style={styles.headerInfo}>
          <ThemedText style={styles.playerName}>{player.name}</ThemedText>
          <ThemedText style={styles.playerLevel}>Level {player.level}</ThemedText>
        </View>
      </View>

      <View style={styles.menuItems}>
        {DRAWER_ITEMS.map((item) => {
          const isActive = currentRoute === item.id;
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
          onPress={handleLogout}
          style={({ pressed }) => [styles.logoutButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="log-out-outline" size={22} color={Colors.dark.error} />
          <ThemedText style={styles.logoutText}>Logout</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
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
    color: Colors.dark.xpCyan,
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
    backgroundColor: Colors.dark.backgroundDefault,
  },
  menuItemText: {
    fontSize: 16,
    color: Colors.dark.text,
  },
  menuItemTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
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
});
