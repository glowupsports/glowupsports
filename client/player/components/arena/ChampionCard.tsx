import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from "@/constants/theme";
import { buildPhotoUrl } from "@/lib/query-client";

// ── Rarity frame colours ──────────────────────────────────────────────────────
export type CardSize = "mini" | "standard" | "fullscreen";

export interface ArenaCardData {
  rarityTier: string;
  rarityLabel: string;
  rarityMarker: string;
  statPower: number;
  statTechnique: number;
  statMental: number;
  statTactics: number;
  arenaMmr?: number;
  arenaWins?: number;
  arenaLosses?: number;
  streakSnapshot?: number;
}

export interface PlayerInfo {
  name: string;
  profilePhotoUrl?: string | null;
  level?: number;
}

interface Props {
  card: ArenaCardData;
  player: PlayerInfo;
  size?: CardSize;
  onPress?: () => void;
  style?: object;
}

// ── Rarity visual config ──────────────────────────────────────────────────────
interface RarityVisual {
  frameColors: [string, string, ...string[]];
  glowColor: string;
  textColor: string;
  badgeBackground: string;
  animated: boolean;
  holographic: boolean;
}

function getRarityVisual(tier: string): RarityVisual {
  const t = tier.toLowerCase();

  if (t === "mythic_gold") return {
    frameColors: ["#FFD700", "#E040FB", "#00D4FF", "#FFD700"],
    glowColor: "#FFD700",
    textColor: "#FFD700",
    badgeBackground: "rgba(255, 215, 0, 0.25)",
    animated: true,
    holographic: true,
  };
  if (t === "mythic_silver") return {
    frameColors: ["#E040FB", "#C0C0C0", "#00D4FF", "#E040FB"],
    glowColor: "#E040FB",
    textColor: "#E040FB",
    badgeBackground: "rgba(224, 64, 251, 0.25)",
    animated: true,
    holographic: true,
  };
  if (t === "mythic_bronze") return {
    frameColors: ["#CD7F32", "#E040FB", "#FF851B", "#CD7F32"],
    glowColor: "#E040FB",
    textColor: "#E040FB",
    badgeBackground: "rgba(224, 64, 251, 0.20)",
    animated: true,
    holographic: false,
  };
  if (t.startsWith("legendary")) return {
    frameColors: ["#FFD700", "#FFC000", "#FFD700"],
    glowColor: "#FFD700",
    textColor: "#FFD700",
    badgeBackground: "rgba(255, 215, 0, 0.20)",
    animated: t === "legendary_iii",
    holographic: false,
  };
  if (t.startsWith("epic")) return {
    frameColors: ["#C0C0C0", "#A0A0A0", "#C0C0C0"],
    glowColor: "#C0C0C0",
    textColor: "#E0E0E0",
    badgeBackground: "rgba(192, 192, 192, 0.20)",
    animated: t === "epic_iii",
    holographic: false,
  };
  if (t.startsWith("rare")) return {
    frameColors: ["#CD7F32", "#A0522D", "#CD7F32"],
    glowColor: "#CD7F32",
    textColor: "#E8A46A",
    badgeBackground: "rgba(205, 127, 50, 0.20)",
    animated: false,
    holographic: false,
  };
  if (t.startsWith("uncommon")) return {
    frameColors: ["#B87333", "#8B5E3C", "#B87333"],
    glowColor: "#B87333",
    textColor: "#D4956A",
    badgeBackground: "rgba(184, 115, 51, 0.20)",
    animated: false,
    holographic: false,
  };
  // common (default)
  return {
    frameColors: ["#6B7280", "#4B5563", "#6B7280"],
    glowColor: "#6B7280",
    textColor: "#9CA3AF",
    badgeBackground: "rgba(107, 114, 128, 0.20)",
    animated: false,
    holographic: false,
  };
}

// ── Stat bar ──────────────────────────────────────────────────────────────────
function StatBar({
  label,
  value,
  color,
  delay = 0,
  animate = false,
}: {
  label: string;
  value: number;
  color: string;
  delay?: number;
  animate?: boolean;
}) {
  const progress = useSharedValue(animate ? 0 : value / 99);

  useEffect(() => {
    if (animate) {
      progress.value = withTiming(value / 99, {
        duration: 600,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [value, animate]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progress.value * 100)}%`,
  }));

  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statBarBg}>
        <Animated.View style={[styles.statBarFill, { backgroundColor: color }, barStyle]} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

// ── Main card component ───────────────────────────────────────────────────────
export default function ChampionCard({ card, player, size = "standard", onPress, style }: Props) {
  const visual = getRarityVisual(card.rarityTier);
  const hasStreak = (card.streakSnapshot ?? 0) >= 7;

  // Dimensions per size
  const dims = {
    mini:       { width: 120, height: 168, avatarSize: 40, fontSize: 7,  statFontSize: 5 },
    standard:   { width: 220, height: 308, avatarSize: 72, fontSize: 11, statFontSize: 8 },
    fullscreen: { width: 320, height: 448, avatarSize: 100, fontSize: 14, statFontSize: 10 },
  }[size];

  // Shimmer animation for animated tiers
  const shimmer = useSharedValue(0);
  useEffect(() => {
    if (visual.animated) {
      shimmer.value = withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    }
  }, [visual.animated]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.3, 0.85]),
  }));

  // Streak aura ring pulse
  const aura = useSharedValue(1);
  useEffect(() => {
    if (hasStreak) {
      aura.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 900, easing: Easing.out(Easing.ease) }),
          withTiming(1.0,  { duration: 900, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        true,
      );
    }
  }, [hasStreak]);

  const auraStyle = useAnimatedStyle(() => ({
    transform: [{ scale: aura.value }],
    opacity: interpolate(aura.value, [1, 1.15], [0.7, 1.0]),
  }));

  const cardContent = (
    <View style={[{ width: dims.width, height: dims.height }, styles.card, style]}>
      {/* Frame gradient border */}
      <LinearGradient
        colors={visual.frameColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 14 }]}
      />

      {/* Holographic shimmer overlay */}
      {visual.animated && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: 14, overflow: "hidden" },
            shimmerStyle,
          ]}
        >
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.18)", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      {/* Inner card surface */}
      <View style={[styles.cardInner, { borderRadius: 12, margin: 2 }]}>
        <LinearGradient
          colors={["#0D1117", "#111827"]}
          style={[StyleSheet.absoluteFill, { borderRadius: 12 }]}
        />

        {/* Rarity badge — top right */}
        <View style={[styles.rarityBadge, { backgroundColor: visual.badgeBackground }]}>
          <Text style={[styles.rarityMarker, { color: visual.textColor, fontSize: dims.fontSize - 1 }]}>
            {card.rarityMarker}
          </Text>
        </View>

        {/* Avatar section */}
        <View style={[styles.avatarSection, { paddingTop: dims.fontSize }]}>
          {/* Streak aura ring */}
          {hasStreak && (
            <Animated.View
              style={[
                styles.auraRing,
                {
                  width: dims.avatarSize + 16,
                  height: dims.avatarSize + 16,
                  borderRadius: (dims.avatarSize + 16) / 2,
                  borderColor: "#FFD700",
                },
                auraStyle,
              ]}
            />
          )}
          {/* Avatar circle */}
          <View
            style={[
              styles.avatarRing,
              {
                width: dims.avatarSize + 6,
                height: dims.avatarSize + 6,
                borderRadius: (dims.avatarSize + 6) / 2,
                borderColor: visual.glowColor,
              },
            ]}
          >
            {player.profilePhotoUrl ? (
              <Image
                source={{ uri: buildPhotoUrl(player.profilePhotoUrl) ?? undefined }}
                style={{
                  width: dims.avatarSize,
                  height: dims.avatarSize,
                  borderRadius: dims.avatarSize / 2,
                }}
              />
            ) : (
              <View
                style={[
                  {
                    width: dims.avatarSize,
                    height: dims.avatarSize,
                    borderRadius: dims.avatarSize / 2,
                    backgroundColor: "#1F2937",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                ]}
              >
                <Text style={{ color: visual.glowColor, fontSize: dims.avatarSize * 0.4, fontWeight: "800" }}>
                  {(player.name?.[0] ?? "?").toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Player name + rarity label */}
        <View style={styles.nameSection}>
          <Text
            style={[styles.playerName, { fontSize: dims.fontSize + 1, color: Colors.dark.text }]}
            numberOfLines={1}
          >
            {player.name}
          </Text>
          <Text style={[styles.rarityLabel, { fontSize: dims.fontSize - 2, color: visual.textColor }]}>
            {card.rarityLabel}
          </Text>
        </View>

        {/* Stats */}
        {size !== "mini" && (
          <View style={styles.statsSection}>
            <StatBar label="PWR" value={card.statPower}     color="#FF4D4D" animate={size === "fullscreen"} />
            <StatBar label="TEC" value={card.statTechnique} color="#4DA3FF" animate={size === "fullscreen"} delay={100} />
            <StatBar label="MNT" value={card.statMental}    color="#C8FF3D" animate={size === "fullscreen"} delay={200} />
            <StatBar label="TAC" value={card.statTactics}   color="#FFD700" animate={size === "fullscreen"} delay={300} />
          </View>
        )}

        {/* Arena MMR footer */}
        {size !== "mini" && (
          <View style={styles.footer}>
            <Text style={[styles.mmrText, { fontSize: dims.statFontSize, color: visual.textColor }]}>
              MMR {card.arenaMmr ?? 1000}
            </Text>
            {hasStreak && size === "fullscreen" && (
              <Text style={[styles.streakText, { fontSize: dims.statFontSize }]}>
                {card.streakSnapshot}d streak
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}>
        {cardContent}
      </Pressable>
    );
  }

  return cardContent;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  cardInner: {
    flex: 1,
    alignItems: "center",
    overflow: "hidden",
  },
  rarityBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 2,
  },
  rarityMarker: {
    fontWeight: "800",
  },
  avatarSection: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    position: "relative",
  },
  auraRing: {
    position: "absolute",
    borderWidth: 2.5,
    borderStyle: "solid",
  },
  avatarRing: {
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
  },
  nameSection: {
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 8,
  },
  playerName: {
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  rarityLabel: {
    fontWeight: "600",
    marginTop: 2,
    textAlign: "center",
  },
  statsSection: {
    width: "100%",
    paddingHorizontal: 14,
    marginTop: 12,
    gap: 5,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
    width: 24,
  },
  statBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  statBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  statValue: {
    fontSize: 9,
    fontWeight: "700",
    width: 20,
    textAlign: "right",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    marginTop: 8,
    paddingBottom: 10,
    width: "100%",
  },
  mmrText: {
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
  },
  streakText: {
    fontWeight: "700",
    color: "#FFD700",
  },
});
