import React from "react";
import { View, StyleSheet, Pressable, Platform, Image as RNImage } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface PlayerAvatarProps {
  avatar: string;
  name?: string;
  level?: number;
  size?: number;
  showLevel?: boolean;
  onPress?: () => void;
  photoUrl?: string | null;
}

const AVATAR_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  player: "person-outline",
  racket: "expand-outline",
  ball: "ellipse-outline",
  trophy: "ribbon-outline",
  star: "star-outline",
  crown: "ribbon-outline",
  flame: "flash-outline",
  lightning: "flash-outline",
  coach: "briefcase-outline",
  system: "notifications-outline",
};

export function PlayerAvatar({
  avatar,
  name,
  level,
  size = 40,
  showLevel = false,
  onPress,
  photoUrl,
}: PlayerAvatarProps) {
  const iconName = AVATAR_ICONS[avatar] || "person-outline";

  const content = (
    <View style={[styles.container, { width: size, height: size }]}>
      {photoUrl ? (
        Platform.OS === 'web' ? (
          <RNImage
            source={{ uri: photoUrl }}
            style={[styles.photoImage, { width: size, height: size, borderRadius: size / 2 }]}
            resizeMode="cover"
          />
        ) : (
          <Image
            source={{ uri: photoUrl }}
            style={[styles.photoImage, { width: size, height: size, borderRadius: size / 2 }]}
            contentFit="cover"
          />
        )
      ) : (
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
        >
          <Ionicons name={iconName} size={size * 0.5} color={Colors.dark.buttonText} />
        </LinearGradient>
      )}
      {showLevel && level !== undefined ? (
        <View style={styles.levelBadge}>
          <ThemedText style={styles.levelText}>{level}</ThemedText>
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    position: "relative",
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  photoImage: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  levelBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: Colors.dark.gold,
    borderRadius: BorderRadius.full,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  levelText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
}));
