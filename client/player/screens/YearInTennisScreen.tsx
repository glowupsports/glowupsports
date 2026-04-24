// Task #1126 — Year-in-Tennis wrap screen.
//
// A Spotify-Wrapped-style stat reveal. Each "slide" comes from the server's
// recap.payload.slides array (kind: 'intro' | 'stat' | 'rank' | 'outro').
// The user advances by tapping anywhere on the slide. A share button on the
// last slide opens the native share sheet pointing at the server-rendered
// SVG card (`/api/year-in-tennis/:year/share.svg?t=<recapId>`).

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Share,
  Platform,
  StatusBar,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

type Slide =
  | { kind: "intro"; title: string }
  | { kind: "outro"; title: string }
  | { kind: "stat"; label: string; value: number | string }
  | { kind: "rank"; label: string; value: string };

interface YearRecap {
  id: string | null;
  year: number;
  matchesPlayed: number;
  matchesWon: number;
  courtMinutes: number;
  xpEarned: number;
  countryRank: number | null;
  payload: {
    year: number;
    playerName: string | null;
    country: string | null;
    countryRank: number | null;
    slides: Slide[];
  };
}

export default function YearInTennisScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PlayerStackParamList, "YearInTennis">>();
  const insets = useSafeAreaInsets();
  const year = route.params?.year ?? new Date().getUTCFullYear();
  const [slideIdx, setSlideIdx] = useState(0);

  const { data, isLoading, error } = useQuery<YearRecap>({
    queryKey: [`/api/year-in-tennis/${year}`],
  });

  const slides = useMemo<Slide[]>(
    () => data?.payload?.slides ?? [],
    [data?.payload?.slides],
  );
  const isLastSlide = slideIdx >= slides.length - 1 && slides.length > 0;

  useEffect(() => {
    if (Platform.OS !== "web") {
      StatusBar.setBarStyle("light-content", true);
    }
  }, []);

  const advance = () => {
    if (slideIdx < slides.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setSlideIdx((i) => i + 1);
    }
  };

  const onShare = async () => {
    if (!data) return;
    const recapToken = data.id ?? "";
    const shareUrl = recapToken
      ? new URL(
          `/api/year-in-tennis/${year}/share.svg?t=${encodeURIComponent(recapToken)}`,
          getApiUrl(),
        ).toString()
      : new URL(`/api/year-in-tennis/${year}/share.svg`, getApiUrl()).toString();
    try {
      await Share.share({
        message: `My ${year} in Tennis on Glow Up Sports — ${data.matchesPlayed} matches, ${data.matchesWon} wins, ${Math.round(data.courtMinutes / 60)}h on court! ${shareUrl}`,
        url: shareUrl,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } catch {
      // Share dismissed — silent.
    }
  };

  const gradientColors = useMemo(
    () => getGradientForSlide(slides[slideIdx]?.kind ?? "intro"),
    [slides, slideIdx],
  );

  if (isLoading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Colors.dark.primary} size="large" />
      </View>
    );
  }
  if (error || !data || slides.length === 0) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top + Spacing.xl }]}>
        <Ionicons name="tennisball-outline" size={48} color={Colors.dark.textMuted} />
        <ThemedText style={styles.emptyTitle}>No wrap yet</ThemedText>
        <ThemedText style={styles.emptySubtitle}>
          Play more matches and your {year} in Tennis will be ready soon.
        </ThemedText>
        <Pressable
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <ThemedText style={styles.closeButtonText}>Close</ThemedText>
        </Pressable>
      </View>
    );
  }

  const slide = slides[slideIdx];

  return (
    <Pressable
      style={styles.root}
      onPress={advance}
      accessibilityRole="button"
      accessibilityLabel={isLastSlide ? "Last slide" : "Tap to continue"}
    >
      <LinearGradient
        colors={gradientColors}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Progress dots */}
      <View style={[styles.progressRow, { top: insets.top + Spacing.md }]}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              i <= slideIdx && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      {/* Close */}
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          navigation.goBack();
        }}
        style={[styles.closeIcon, { top: insets.top + Spacing.md }]}
        hitSlop={16}
        accessibilityRole="button"
        accessibilityLabel="Close wrap"
      >
        <Ionicons name="close" size={28} color="rgba(255,255,255,0.85)" />
      </Pressable>

      <Animated.View
        key={slideIdx}
        entering={FadeIn.duration(420)}
        exiting={FadeOut.duration(180)}
        style={styles.slideBody}
      >
        <SlideContent slide={slide} year={year} />
      </Animated.View>

      {isLastSlide ? (
        <Animated.View
          entering={SlideInDown.delay(300).springify()}
          style={[
            styles.shareRow,
            { bottom: insets.bottom + Spacing.xl + 20 },
          ]}
        >
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onShare();
            }}
            style={styles.shareButton}
            accessibilityRole="button"
            accessibilityLabel="Share your wrap"
          >
            <Ionicons name="share-outline" size={20} color="#0a0a0a" />
            <ThemedText style={styles.shareText}>Share My Wrap</ThemedText>
          </Pressable>
        </Animated.View>
      ) : (
        <View style={[styles.tapHintRow, { bottom: insets.bottom + Spacing.lg }]}>
          <ThemedText style={styles.tapHint}>Tap anywhere to continue</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

function SlideContent({ slide, year }: { slide: Slide; year: number }) {
  if (!slide) return null;
  if (slide.kind === "intro" || slide.kind === "outro") {
    return (
      <View style={styles.centerCol}>
        <ThemedText style={styles.eyebrow}>GLOW UP SPORTS</ThemedText>
        <ThemedText style={styles.bigYear}>{year}</ThemedText>
        <ThemedText style={styles.slideTitle}>{slide.title}</ThemedText>
      </View>
    );
  }
  if (slide.kind === "stat") {
    return (
      <View style={styles.centerCol}>
        <ThemedText style={styles.statLabel}>{slide.label}</ThemedText>
        <ThemedText style={styles.statValue}>{slide.value}</ThemedText>
      </View>
    );
  }
  // rank
  return (
    <View style={styles.centerCol}>
      <ThemedText style={styles.statLabel}>{slide.label}</ThemedText>
      <ThemedText style={styles.statValue}>{slide.value}</ThemedText>
      <Ionicons
        name="trophy"
        size={48}
        color="#FFD166"
        style={{ marginTop: Spacing.xl }}
      />
    </View>
  );
}

function getGradientForSlide(kind: string): readonly [string, string, ...string[]] {
  switch (kind) {
    case "intro":
      return ["#1a3d1a", "#0a0a0a"] as const;
    case "outro":
      return ["#2ECC40", "#143a14", "#0a0a0a"] as const;
    case "rank":
      return ["#5b3a00", "#1a0e00"] as const;
    case "stat":
    default:
      return ["#0e1f3d", "#0a0a0a"] as const;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  centerCol: {
    alignItems: "center",
    justifyContent: "center",
  },
  slideBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  progressRow: {
    position: "absolute",
    left: Spacing.md,
    right: 60,
    flexDirection: "row",
    gap: 4,
    zIndex: 10,
  },
  progressDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  progressDotActive: {
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  closeIcon: {
    position: "absolute",
    right: Spacing.md,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  eyebrow: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    letterSpacing: 4,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  bigYear: {
    color: "#fff",
    fontSize: 96,
    fontWeight: "900",
    lineHeight: 100,
    textAlign: "center",
  },
  slideTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "600",
    marginTop: Spacing.md,
    textAlign: "center",
  },
  statLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 18,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  statValue: {
    color: "#fff",
    fontSize: 120,
    fontWeight: "900",
    lineHeight: 124,
    textAlign: "center",
  },
  tapHintRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  tapHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
  },
  shareRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#fff",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 999,
  },
  shareText: {
    color: "#0a0a0a",
    fontSize: 16,
    fontWeight: "700",
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: 22,
    fontWeight: "700",
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    color: Colors.dark.textSecondary,
    fontSize: 15,
    textAlign: "center",
    marginTop: Spacing.sm,
    maxWidth: 320,
  },
  closeButton: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 999,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  closeButtonText: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "600",
  },
});
