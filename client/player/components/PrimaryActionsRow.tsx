import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Spacing, Colors } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

export interface PrimaryActionsRowProps {
  firstName?: string | null;
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

export function PrimaryActionsRow({
  firstName,
  nextSessionDate,
  nextSessionEndTime,
}: PrimaryActionsRowProps) {
  const { t, i18n } = useTranslation();

  const displayName = firstName?.replace(/\s+/g, " ").trim() || "";

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
      name: displayName,
    });
    if (!displayName) return t("player.home.greetingNoName");

    const now = new Date();
    const bucket = pickBucket({
      now,
      nextSessionDate,
      nextSessionEndTime,
      daysSinceLastVisit,
    });

    const variants = t(`player.home.greetings.${bucket}`, {
      returnObjects: true,
      name: displayName,
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
    displayName,
    nextSessionDate,
    nextSessionEndTime,
    daysSinceLastVisit,
  ]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.greeting} numberOfLines={2}>
        {greeting}
      </Text>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: -0.3,
  },
}));
