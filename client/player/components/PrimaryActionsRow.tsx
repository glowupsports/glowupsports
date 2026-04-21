import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";

import { Spacing, BorderRadius, Colors, GlowColors } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

export interface PrimaryActionsRowProps {
  firstName?: string | null;
  playerId?: string | null;
  activeSport?: string;
  playerAcademyId?: string | null;
  onBook: () => void;
  onTrain: () => void;
  onCompete: () => void;
  onFindMatch: () => void;
  /** ISO start time of the player's next upcoming session, if any. */
  nextSessionDate?: string | null;
  /** ISO end time of the player's next session, used to detect a just-finished session. */
  nextSessionEndTime?: string | null;
}

const LAST_VISIT_STORAGE_KEY = "@glow_player_home_last_visit_at";
const POST_SESSION_WINDOW_MS = 3 * 60 * 60 * 1000; // 3h after end counts as "just finished"
const WELCOME_BACK_DAY_THRESHOLD = 7;

type GreetingBucket =
  | "morning"
  | "afternoon"
  | "evening"
  | "late"
  | "weekend_morning"
  | "weekend_afternoon"
  | "weekend_evening"
  | "sessionToday"
  | "postSession"
  | "welcomeBack";

function pickBucket(args: {
  now: Date;
  nextSessionDate?: string | null;
  nextSessionEndTime?: string | null;
  daysSinceLastVisit: number | null;
}): GreetingBucket {
  const { now, nextSessionDate, nextSessionEndTime, daysSinceLastVisit } = args;

  // Post-session: a session ended within the last few hours.
  if (nextSessionEndTime) {
    const end = new Date(nextSessionEndTime).getTime();
    if (Number.isFinite(end)) {
      const diff = now.getTime() - end;
      if (diff >= 0 && diff < POST_SESSION_WINDOW_MS) return "postSession";
    }
  }

  // Upcoming session today (still in the future).
  if (nextSessionDate) {
    const start = new Date(nextSessionDate);
    if (
      Number.isFinite(start.getTime()) &&
      start.toDateString() === now.toDateString() &&
      start.getTime() > now.getTime()
    ) {
      return "sessionToday";
    }
  }

  // Returning after a long gap.
  if (
    daysSinceLastVisit !== null &&
    daysSinceLastVisit > WELCOME_BACK_DAY_THRESHOLD
  ) {
    return "welcomeBack";
  }

  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;

  let tod: "morning" | "afternoon" | "evening" | "late";
  if (hour >= 5 && hour < 12) tod = "morning";
  else if (hour >= 12 && hour < 17) tod = "afternoon";
  else if (hour >= 17 && hour < 22) tod = "evening";
  else tod = "late";

  if (isWeekend && tod !== "late") {
    return (`weekend_${tod}` as GreetingBucket);
  }
  return tod;
}

function hashIndex(seed: string, len: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % Math.max(len, 1);
}

type FeatherName = React.ComponentProps<typeof Feather>["name"];

interface Tile {
  key: "book" | "train" | "compete" | "find";
  label: string;
  icon: FeatherName;
  onPress: () => void;
  accessibilityLabel: string;
  badge?: string | null;
}

interface OpenMatchLite {
  id: string;
  hostPlayerId?: string;
  scheduledTime?: string;
  currentPlayers: number;
  maxPlayers: number;
}

interface NearbyPlayerLite {
  id: string;
  lastOnlineAt?: string | null;
}

const RECENT_ACTIVE_WINDOW_MS = 30 * 60 * 1000;

export function PrimaryActionsRow({
  firstName,
  playerId,
  activeSport = "tennis",
  playerAcademyId,
  onBook,
  onTrain,
  onCompete,
  onFindMatch,
  nextSessionDate,
  nextSessionEndTime,
}: PrimaryActionsRowProps) {
  const { t, i18n } = useTranslation();

  const trimmedName = firstName?.trim().split(/\s+/)[0] || "";

  const [daysSinceLastVisit, setDaysSinceLastVisit] = useState<number | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prev = await AsyncStorage.getItem(LAST_VISIT_STORAGE_KEY);
        const nowMs = Date.now();
        if (prev) {
          const prevMs = parseInt(prev, 10);
          if (Number.isFinite(prevMs) && prevMs > 0) {
            const diffDays = Math.floor(
              (nowMs - prevMs) / (1000 * 60 * 60 * 24),
            );
            if (!cancelled && diffDays >= 0) setDaysSinceLastVisit(diffDays);
          }
        }
        AsyncStorage.setItem(LAST_VISIT_STORAGE_KEY, String(nowMs)).catch(
          () => {},
        );
      } catch {
        // best-effort; ignore storage errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const greeting = useMemo(() => {
    const fallbackWithName = t("player.home.greetingWithName", {
      name: trimmedName,
    });
    if (!trimmedName) return t("player.home.greetingNoName");

    const now = new Date();
    const bucket = pickBucket({
      now,
      nextSessionDate,
      nextSessionEndTime,
      daysSinceLastVisit,
    });

    const variants = t(`player.home.greetings.${bucket}`, {
      returnObjects: true,
      name: trimmedName,
      defaultValue: "",
    }) as unknown;

    if (!Array.isArray(variants) || variants.length === 0) {
      return fallbackWithName;
    }

    const seed = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${bucket}`;
    const idx = hashIndex(seed, variants.length);
    const chosen = variants[idx];
    return typeof chosen === "string" && chosen.length > 0
      ? chosen
      : fallbackWithName;
    // i18n.language is included so changing locale recomputes immediately
  }, [
    t,
    i18n.language,
    trimmedName,
    nextSessionDate,
    nextSessionEndTime,
    daysSinceLastVisit,
  ]);

  // Reuse the same cache key as OpenMatchesRow so a single fetch powers both.
  const { data: openMatches } = useQuery<OpenMatchLite[]>({
    queryKey: ["/api/open-matches"],
    enabled: !!playerId,
    staleTime: 60 * 1000,
  });

  // Mirror the exact key construction used by PlayScreen so the badge shares
  // the same react-query cache entry — no duplicate network round-trip when
  // the player navigates between Home and Play.
  const effectiveScope = playerAcademyId ? "mine" : "all";
  const nearbyKey = `/api/play/nearby-players?sport=${activeSport}&travelTime=true&scope=${effectiveScope}`;
  const { data: nearbyPlayers } = useQuery<NearbyPlayerLite[]>({
    queryKey: [nearbyKey],
    enabled: !!playerId,
    staleTime: 60 * 1000,
  });

  const competeCount = React.useMemo(() => {
    if (!Array.isArray(openMatches)) return 0;
    const nowMs = Date.now();
    return openMatches.filter((m) => {
      if (m.hostPlayerId && playerId && m.hostPlayerId === playerId) return false;
      if ((m.currentPlayers ?? 0) >= (m.maxPlayers ?? 0)) return false;
      if (m.scheduledTime) {
        const ts = new Date(m.scheduledTime).getTime();
        if (Number.isFinite(ts) && ts <= nowMs) return false;
      }
      return true;
    }).length;
  }, [openMatches, playerId]);

  const findCount = React.useMemo(() => {
    if (!Array.isArray(nearbyPlayers)) return 0;
    const nowMs = Date.now();
    return nearbyPlayers.filter((p) => {
      if (!p.lastOnlineAt) return false;
      const ts = new Date(p.lastOnlineAt).getTime();
      if (!Number.isFinite(ts)) return false;
      return nowMs - ts <= RECENT_ACTIVE_WINDOW_MS;
    }).length;
  }, [nearbyPlayers]);

  const tiles: Tile[] = [
    {
      key: "book",
      label: t("player.home.primaryActionBook"),
      icon: "calendar",
      onPress: onBook,
      accessibilityLabel: t("player.home.primaryActionBook"),
    },
    {
      key: "train",
      label: t("player.home.primaryActionTrain"),
      icon: "target",
      onPress: onTrain,
      accessibilityLabel: t("player.home.primaryActionTrain"),
    },
    {
      key: "compete",
      label: t("player.home.primaryActionCompete"),
      icon: "zap",
      onPress: onCompete,
      accessibilityLabel: competeCount > 0
        ? `${t("player.home.primaryActionCompete")}, ${competeCount}`
        : t("player.home.primaryActionCompete"),
      badge: competeCount > 0 ? String(competeCount) : null,
    },
    {
      key: "find",
      label: t("player.home.primaryActionFindMatch"),
      icon: "users",
      onPress: onFindMatch,
      accessibilityLabel: findCount > 0
        ? `${t("player.home.primaryActionFindMatch")}, ${findCount}`
        : t("player.home.primaryActionFindMatch"),
      badge: findCount > 0 ? String(findCount) : null,
    },
  ];

  const handlePress = (fn: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    fn();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.greeting} numberOfLines={1}>
        {greeting}
      </Text>
      <View style={styles.row}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.key}
            onPress={() => handlePress(tile.onPress)}
            accessibilityRole="button"
            accessibilityLabel={tile.accessibilityLabel}
            style={({ pressed }) => [styles.tileWrap, pressed && styles.tilePressed]}
          >
            <LinearGradient
              colors={[
                "rgba(200,255,61,0.18)",
                "rgba(200,255,61,0.04)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.tile}
            >
              <View style={styles.iconWrap}>
                <Feather name={tile.icon} size={20} color={GlowColors.primary} />
                {tile.badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText} numberOfLines={1}>
                      {tile.badge}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {tile.label}
              </Text>
            </LinearGradient>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  tileWrap: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  tilePressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  tile: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.32)",
    minHeight: 76,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.40)",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: GlowColors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#000",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#000",
    letterSpacing: 0.2,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.3,
    textAlign: "center",
  },
}));
