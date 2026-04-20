import React, { useState } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { DrawerActions, useNavigation } from "@react-navigation/native";

import { ThemedText } from "@/components/ThemedText";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { CurrencyDisplay } from "@/components/CurrencyDisplay";
import { XPProgressBar } from "@/components/XPProgressBar";
import { GlowScoreDisplay } from "@/components/GlowScoreDisplay";
import { GlowScoreModal } from "@/components/GlowScoreModal";
import { Colors, Spacing } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

export function CustomHeader() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { player } = usePlayer();
  const [showGlowModal, setShowGlowModal] = useState(false);

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const content = (
    <>
      <View style={styles.topRow}>
        <Pressable
          onPress={openDrawer}
          style={({ pressed }) => [styles.menuButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="menu-outline" size={24} color={Colors.dark.text} />
        </Pressable>

        <View style={styles.playerInfo}>
          <PlayerAvatar
            avatar={player.avatar}
            size={40}
            level={player.level}
            showLevel
          />
          <ThemedText style={styles.playerName} numberOfLines={1}>
            {player.name}
          </ThemedText>
        </View>

        <CurrencyDisplay diamonds={player.diamonds} coins={player.coins} compact />
      </View>

      <View style={styles.xpSection}>
        <XPProgressBar
          currentXP={player.currentXP}
          xpToNextLevel={player.xpToNextLevel}
          level={player.level}
        />
      </View>

      <View style={styles.glowSection}>
        <GlowScoreDisplay 
          score={player.totalGlowScore} 
          onPress={() => setShowGlowModal(true)}
        />
      </View>

      <GlowScoreModal
        visible={showGlowModal}
        onClose={() => setShowGlowModal(false)}
      />
    </>
  );

  if (Platform.OS === "ios") {
    return (
      <BlurView intensity={80} tint="dark" style={[styles.container, { paddingTop: insets.top }]}>
        {content}
      </BlurView>
    );
  }

  return (
    <View style={[styles.container, styles.androidContainer, { paddingTop: insets.top }]}>
      {content}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  androidContainer: {
    backgroundColor: "rgba(26, 26, 26, 0.95)",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
    justifyContent: "center",
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  xpSection: {
    marginTop: Spacing.md,
  },
  glowSection: {
    marginTop: Spacing.sm,
    alignItems: "center",
  },
}));
