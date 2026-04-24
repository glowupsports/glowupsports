import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInRight, FadeOut } from "react-native-reanimated";
import {
  Spacing,
  BorderRadius,
  ProTennisColors,
  Colors,
  Backgrounds,
  TextColors,
} from "@/constants/theme";
import { GlowAvatar } from "@/player/components/GlowAvatar";
import { buildPhotoUrl, getApiUrl, getAuthHeaders } from "@/lib/query-client";

interface DiscoveryPlayer {
  id: string;
  name: string | null;
  profilePhotoUrl?: string | null;
  ballLevel?: string | null;
  skillLevel?: number | null;
  country?: string | null;
}

function getBallLevelColor(level: string): string {
  switch ((level || "").toLowerCase()) {
    case "blue":
      return "#3B82F6";
    case "red":
      return "#EF4444";
    case "orange":
      return "#F97316";
    case "green":
      return "#22C55E";
    case "yellow":
      return "#EAB308";
    case "glow":
    default:
      return Colors.dark.primary;
  }
}

function flagEmojiForCountry(country?: string | null): string {
  if (!country) return "";
  const c = country.trim();
  if (c.length === 2 && /^[A-Za-z]{2}$/.test(c)) {
    const code = c.toUpperCase();
    return String.fromCodePoint(
      ...code.split("").map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
    );
  }
  return "";
}

export interface DiscoveryRailProps {
  currentUserId?: string | null;
}

const STORAGE_PREFIX = "@glow_discovery_rail_dismissed:";

export function DiscoveryRail({ currentUserId }: DiscoveryRailProps) {
  const navigation = useNavigation<any>();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  // Per-user namespacing — different sign-ins on the same device shouldn't
  // share dismissal state.
  const storageKey = `${STORAGE_PREFIX}${currentUserId || "anon"}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(storageKey);
        if (!cancelled) setDismissed(stored === "true");
      } catch {
        if (!cancelled) setDismissed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const { data, isLoading } = useQuery<{ players: DiscoveryPlayer[] }>({
    queryKey: ["/api/social/discovery/players", { limit: 12 }],
    queryFn: async () => {
      const url = new URL("/api/social/discovery/players", getApiUrl());
      url.searchParams.set("limit", "12");
      const res = await fetch(url.toString(), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) return { players: [] };
      return res.json();
    },
    enabled: dismissed === false,
    staleTime: 60_000,
  });

  const handleDismiss = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissed(true);
    try {
      await AsyncStorage.setItem(storageKey, "true");
    } catch {
      /* best-effort persistence */
    }
  }, [storageKey]);

  // Loading dismissal flag — render nothing to avoid a flash of the rail.
  if (dismissed === null) return null;
  // User dismissed it — keep hidden until they reinstall / clear storage.
  if (dismissed) return null;

  const players = data?.players ?? [];

  // Mirror the previous behaviour: the rail hides itself completely when
  // there's nothing to show, so an empty header doesn't sit there.
  if (!isLoading && players.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.wrap}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Players you might match</Text>
          <Text style={styles.subtitle}>Same country, similar level</Text>
        </View>
        <Pressable
          onPress={handleDismiss}
          hitSlop={12}
          style={styles.closeButton}
          accessibilityLabel="Hide players you might match"
          testID="discovery-rail-dismiss"
        >
          <Ionicons name="close" size={18} color={TextColors.muted} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={Colors.dark.primary} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {players.map((p, idx) => (
            <Animated.View
              key={p.id}
              entering={FadeInRight.delay(idx * 50).duration(280)}
            >
              <DiscoveryRailCard
                player={p}
                onOpenProfile={() => {
                  Haptics.selectionAsync();
                  navigation.navigate("PublicProfile", { playerId: p.id });
                }}
                onChallenge={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("CreateMatch", {
                    opponentId: p.id,
                    opponentName: p.name || "Opponent",
                  });
                }}
              />
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </Animated.View>
  );
}

function DiscoveryRailCard({
  player,
  onOpenProfile,
  onChallenge,
}: {
  player: DiscoveryPlayer;
  onOpenProfile: () => void;
  onChallenge: () => void;
}) {
  const ballLevel = (player.ballLevel || "").toString();
  const levelColor = getBallLevelColor(ballLevel || "glow");
  const firstName = (player.name || "Player").split(" ")[0];
  const flag = flagEmojiForCountry(player.country);

  return (
    <Pressable onPress={onOpenProfile} style={styles.card}>
      <GlowAvatar
        source={buildPhotoUrl(player.profilePhotoUrl ?? undefined) || null}
        name={player.name || "Player"}
        size="md"
        ballLevel={ballLevel || "glow"}
        showGlow={true}
        glowIntensity="low"
        pulsing={false}
      />
      <Text style={styles.cardName} numberOfLines={1}>
        {firstName}
      </Text>
      {ballLevel ? (
        <View
          style={[
            styles.levelChip,
            { backgroundColor: `${levelColor}25`, borderColor: `${levelColor}55` },
          ]}
        >
          <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
          <Text
            style={[styles.levelChipText, { color: levelColor }]}
            numberOfLines={1}
          >
            {ballLevel.toUpperCase()}
            {player.skillLevel ? ` ${player.skillLevel}` : ""}
          </Text>
        </View>
      ) : flag ? (
        <Text style={styles.flag} numberOfLines={1}>
          {flag}
        </Text>
      ) : null}
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onChallenge();
        }}
        style={styles.challengeButton}
        hitSlop={6}
        testID={`discovery-challenge-${player.id}`}
      >
        <Ionicons
          name="flash"
          size={11}
          color={Colors.dark.buttonText}
          style={{ marginRight: 3 }}
        />
        <Text style={styles.challengeButtonText}>Challenge</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing.md,
    paddingTop: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: TextColors.primary,
  },
  subtitle: {
    fontSize: 12,
    color: TextColors.muted,
    marginTop: 2,
  },
  closeButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  loadingWrap: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  card: {
    width: 104,
    alignItems: "center",
    gap: 4,
  },
  cardName: {
    fontSize: 13,
    fontWeight: "700",
    color: ProTennisColors.white,
    textAlign: "center",
    marginTop: 6,
  },
  levelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  levelDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  levelChipText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  flag: {
    fontSize: 14,
    marginTop: 2,
  },
  challengeButton: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  challengeButtonText: {
    color: Colors.dark.buttonText,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});

export default DiscoveryRail;
