import React, { useState } from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
  withSequence,
  interpolate,
} from "react-native-reanimated";
import { ProTennisColors, BorderRadius } from "@/constants/theme";
import { getPlayerLevelColor } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "hero";

interface GlowAvatarProps {
  source?: string | null;
  name?: string;
  size?: AvatarSize;
  ballLevel?: string | null;
  glowColor?: string;
  showGlow?: boolean;
  glowIntensity?: "low" | "medium" | "high";
  pulsing?: boolean;
  status?: "online" | "playing" | "offline" | "available";
  style?: ViewStyle;
}

const getSizeValue = (size: AvatarSize): number => {
  switch (size) {
    case "xs": return 32;
    case "sm": return 40;
    case "md": return 56;
    case "lg": return 72;
    case "xl": return 96;
    case "hero": return 120;
    default: return 56;
  }
};

const getGlowSize = (size: AvatarSize): number => {
  const base = getSizeValue(size);
  return base + 12;
};

const getInitials = (name?: string): string => {
  if (!name) return "?";
  // Strip invisible/zero-width Unicode chars that would otherwise become
  // the "first character" of a word and render as nothing.
  const cleaned = name.replace(/[\u200B-\u200F\u2060\uFEFF\u00AD\u180E]/g, "").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export function GlowAvatar({
  source,
  name,
  size = "md",
  ballLevel,
  glowColor,
  showGlow = true,
  glowIntensity = "medium",
  pulsing = false,
  status,
  style,
}: GlowAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const pulseValue = useSharedValue(0);
  const sizeValue = getSizeValue(size);
  const glowSize = getGlowSize(size);

  const resolvedGlowColor = glowColor || getPlayerLevelColor(ballLevel);

  React.useEffect(() => {
    setImageError(false);
  }, [source]);

  React.useEffect(() => {
    if (pulsing && showGlow) {
      pulseValue.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1200 }),
          withTiming(0, { duration: 1200 })
        ),
        -1,
        true
      );
    }
  }, [pulsing, showGlow, pulseValue]);

  const animatedGlowStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulseValue.value, [0, 1], [1, 1.15]);
    const opacity = interpolate(pulseValue.value, [0, 1], [0.6, 0.9]);
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const getGlowOpacity = () => {
    switch (glowIntensity) {
      case "low": return 0.4;
      case "high": return 0.9;
      default: return 0.6;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "online":
      case "available":
        return ProTennisColors.success;
      case "playing":
        return ProTennisColors.electricGreen;
      case "offline":
        return "#666";
      default:
        return null;
    }
  };

  const statusColor = getStatusColor();

  return (
    <View style={[styles.container, { width: glowSize, height: glowSize }, style]}>
      {showGlow && (
        <Animated.View
          style={[
            styles.glowRing,
            {
              width: glowSize,
              height: glowSize,
              borderRadius: glowSize / 2,
              borderColor: resolvedGlowColor,
              shadowColor: resolvedGlowColor,
              shadowOpacity: getGlowOpacity(),
            },
            pulsing ? animatedGlowStyle : {},
          ]}
        />
      )}

      <View
        style={[
          styles.avatarContainer,
          {
            width: sizeValue,
            height: sizeValue,
            borderRadius: sizeValue / 2,
          },
        ]}
      >
        {source && !imageError ? (
          <Image
            source={{ uri: source }}
            style={[
              styles.avatarImage,
              {
                width: sizeValue - 4,
                height: sizeValue - 4,
                borderRadius: (sizeValue - 4) / 2,
              },
            ]}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setImageError(true)}
          />
        ) : (
          <LinearGradient
            colors={[`${resolvedGlowColor}40`, `${resolvedGlowColor}20`]}
            style={[
              styles.initialsContainer,
              {
                width: sizeValue - 4,
                height: sizeValue - 4,
                borderRadius: (sizeValue - 4) / 2,
              },
            ]}
          >
            <Text
              style={[
                styles.initials,
                {
                  fontSize: sizeValue * 0.35,
                  color: resolvedGlowColor,
                },
              ]}
            >
              {getInitials(name)}
            </Text>
          </LinearGradient>
        )}
      </View>

      {statusColor && (
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: statusColor,
              width: sizeValue * 0.25,
              height: sizeValue * 0.25,
              borderRadius: sizeValue * 0.125,
              right: 0,
              bottom: 0,
            },
          ]}
        />
      )}
    </View>
  );
}

interface AvatarStackProps {
  avatars: Array<{
    source?: string | null;
    name?: string;
    ballLevel?: string | null;
  }>;
  size?: AvatarSize;
  maxVisible?: number;
  overlap?: number;
  style?: ViewStyle;
}

export function AvatarStack({
  avatars,
  size = "sm",
  maxVisible = 4,
  overlap = 0.3,
  style,
}: AvatarStackProps) {
  const sizeValue = getSizeValue(size);
  const visibleAvatars = avatars.slice(0, maxVisible);
  const remaining = avatars.length - maxVisible;

  return (
    <View style={[styles.stackContainer, style]}>
      {visibleAvatars.map((avatar, index) => (
        <View
          key={index}
          style={{
            marginLeft: index === 0 ? 0 : -sizeValue * overlap,
            zIndex: visibleAvatars.length - index,
          }}
        >
          <GlowAvatar
            source={avatar.source}
            name={avatar.name}
            size={size}
            ballLevel={avatar.ballLevel}
            showGlow={false}
          />
        </View>
      ))}
      {remaining > 0 && (
        <View
          style={[
            styles.remainingBadge,
            {
              marginLeft: -sizeValue * overlap,
              width: sizeValue,
              height: sizeValue,
              borderRadius: sizeValue / 2,
            },
          ]}
        >
          <Text style={[styles.remainingText, { fontSize: sizeValue * 0.35 }]}>
            +{remaining}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  glowRing: {
    position: "absolute",
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
  },
  avatarContainer: {
    borderWidth: 2,
    borderColor: ProTennisColors.surfaceDark,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ProTennisColors.surfaceCard,
  },
  avatarImage: {
    backgroundColor: ProTennisColors.surfaceCard,
  },
  initialsContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontWeight: "700",
    letterSpacing: 1,
  },
  statusDot: {
    position: "absolute",
    borderWidth: 2,
    borderColor: ProTennisColors.midnightBlue,
  },
  stackContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  remainingBadge: {
    backgroundColor: ProTennisColors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: ProTennisColors.surfaceDark,
  },
  remainingText: {
    color: ProTennisColors.textMuted,
    fontWeight: "600",
  },
}));
