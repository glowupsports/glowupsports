import React, { useState, useCallback } from "react";
import { View, StyleSheet, Pressable, Alert, Platform, Text, Image as RNImage } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { DrawerContentComponentProps, useDrawerStatus } from "@react-navigation/drawer";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";

import { ThemedText } from "@/components/ThemedText";
import { ReportIssueModal } from "@/components/ReportIssueModal";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/coach/context/AuthContext";
import { useUIInteraction } from "@/contexts/UIInteractionContext";
import { DRAWER_ITEMS } from "@/constants/playerData";
import { getStaticAssetsUrl } from "@/lib/query-client";

export function DrawerContent({ navigation, state }: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const { player } = usePlayer();
  const { logout, isAuthenticated, user, isLoading: authLoading } = useAuth();
  
  const hasPlayerProfile = !!user?.playerId;
  const authReady = isAuthenticated && !authLoading && hasPlayerProfile;
  const queryClient = useQueryClient();
  const drawerStatus = useDrawerStatus();
  
  const { data: profileData, isLoading, refetch } = useQuery<{ player: { id: string; name: string; level: number; profilePhotoUrl?: string | null } }>({
    queryKey: ["/api/player/me/profile"],
    enabled: authReady,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: 1000,
  });
  
  React.useEffect(() => {
    if (drawerStatus === "open" && authReady) {
      refetch();
    }
  }, [drawerStatus, authReady, refetch]);
  
  const rawPhotoUrl = profileData?.player?.profilePhotoUrl;
  const profilePhotoUrl = rawPhotoUrl 
    ? `${getStaticAssetsUrl()}${rawPhotoUrl}` 
    : null;

  if (__DEV__) {
    console.log("[DrawerContent] profileData:", JSON.stringify(profileData?.player, null, 2));
    console.log("[DrawerContent] rawPhotoUrl:", rawPhotoUrl);
    console.log("[DrawerContent] profilePhotoUrl:", profilePhotoUrl);
  }
  
  const playerName = profileData?.player?.name ?? player.name;
  const playerLevel = profileData?.player?.level ?? player.level;

  const { trackInteraction } = useUIInteraction();
  const [showReportModal, setShowReportModal] = useState(false);
  const currentRoute = state.routes[state.index]?.name;

  const handleLogout = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("Are you sure you want to sign out?");
      if (confirmed) {
        navigation.closeDrawer();
        logout();
      }
    } else {
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
    }
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
        <View style={styles.avatarContainer}>
          {profilePhotoUrl ? (
            Platform.OS === 'web' ? (
              <RNImage
                key={profilePhotoUrl}
                source={{ uri: profilePhotoUrl }}
                style={[styles.avatarImage, { backgroundColor: "#333" }]}
                resizeMode="cover"
                onError={(e) => console.error("[DrawerContent] Image error (web):", e.nativeEvent)}
                onLoad={() => console.log("[DrawerContent] Image loaded (web)")}
              />
            ) : (
              <Image
                key={profilePhotoUrl}
                source={{ uri: profilePhotoUrl }}
                style={[styles.avatarImage, { backgroundColor: "#333" }]}
                contentFit="cover"
                cachePolicy="none"
                onError={(e) => console.error("[DrawerContent] Image error (native):", e)}
                onLoad={() => console.log("[DrawerContent] Image loaded (native)")}
              />
            )
          ) : (
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarGradient}
            >
              <Text style={styles.avatarInitial}>{playerName.charAt(0).toUpperCase()}</Text>
            </LinearGradient>
          )}
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>{playerLevel}</Text>
          </View>
        </View>
        <View style={styles.headerInfo}>
          <ThemedText style={styles.playerName}>{playerName}</ThemedText>
          <ThemedText style={styles.playerLevel}>Level {playerLevel}</ThemedText>
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
          onPress={() => {
            trackInteraction("button", "Report an Issue", currentRoute || "Drawer");
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
        currentScreen={currentRoute}
      />
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
  avatarContainer: {
    position: "relative",
    width: 60,
    height: 60,
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  avatarGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  levelBadge: {
    position: "absolute",
    bottom: -4,
    left: -4,
    backgroundColor: Colors.dark.gold,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
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
});
