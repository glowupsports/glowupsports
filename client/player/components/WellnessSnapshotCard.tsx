/**
 * WellnessSnapshotCard
 *
 * Shown on the home screen when the player has connected Apple Health
 * or Google Health Connect. Displays last night's sleep, today's steps,
 * resting heart rate, and a computed recovery status.
 *
 * When not connected: renders a soft CTA card instead.
 * When unavailable (Expo Go / web): renders nothing.
 */

import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import {
  getHealthConnectionState,
  readHealthSnapshot,
  type HealthSnapshot,
  type HealthConnectionState,
  type RecoveryStatus,
} from "@/player/services/healthService";

// ─── Helpers ──────────────────────────────────────────────────────────────

function recoveryColor(status: RecoveryStatus | null): string {
  if (status === "Fully Recovered") return "#22C55E";
  if (status === "Light Day Recommended") return "#F59E0B";
  if (status === "Rest Today") return "#EF4444";
  return Colors.dark.textMuted;
}

function recoveryIcon(status: RecoveryStatus | null): string {
  if (status === "Fully Recovered") return "checkmark-circle";
  if (status === "Light Day Recommended") return "alert-circle";
  if (status === "Rest Today") return "moon";
  return "ellipse-outline";
}

function formatSleep(hours: number | null): string {
  if (hours === null) return "--";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatSteps(steps: number | null): string {
  if (steps === null) return "--";
  return steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : String(steps);
}

// ─── Step progress arc (simple bar since SVG arcs are complex) ────────────

function StepsArc({ steps, goal }: { steps: number | null; goal: number }) {
  const pct = steps !== null ? Math.min(steps / goal, 1) : 0;
  const barColor = pct >= 1 ? "#22C55E" : pct >= 0.5 ? "#C8FF3D" : Colors.dark.accentText;

  return (
    <View style={arc.wrap}>
      <View style={arc.track}>
        <View style={[arc.fill, { width: `${Math.max(pct * 100, 2)}%` as any, backgroundColor: barColor }]} />
      </View>
      <View style={arc.labelRow}>
        <Text style={arc.current}>{formatSteps(steps)}</Text>
        <Text style={arc.goal}>/ {formatSteps(goal)} goal</Text>
      </View>
    </View>
  );
}

const arc = StyleSheet.create({
  wrap: { flex: 1, gap: 4 },
  track: {
    height: 5,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 3 },
  labelRow: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  current: { fontSize: 15, fontWeight: "800", color: Colors.dark.text },
  goal: { fontSize: 10, color: Colors.dark.textMuted, fontWeight: "500" },
});

// ─── Main card ────────────────────────────────────────────────────────────

interface WellnessSnapshotCardProps {
  onConnectPress?: () => void;
}

export function WellnessSnapshotCard({ onConnectPress }: WellnessSnapshotCardProps) {
  const navigation = useNavigation<any>();
  const [connectionState, setConnectionState] = useState<HealthConnectionState | null>(null);
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const state = await getHealthConnectionState();
      setConnectionState(state);
      if (state.connected) {
        const data = await readHealthSnapshot();
        setSnapshot(data);
      }
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !connectionState) return null;

  if (!connectionState.available) return null;

  if (!connectionState.connected) {
    return (
      <Animated.View entering={FadeInDown.delay(80).duration(500)}>
        <Pressable
          style={s.ctaCard}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (onConnectPress) {
              onConnectPress();
            } else {
              navigation.navigate("Me" as never);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Connect health app"
        >
          <View style={s.ctaIconRow}>
            {Platform.OS === "ios" ? (
              <View style={[s.ctaIconCircle, { backgroundColor: "rgba(255,59,48,0.15)" }]}>
                <Ionicons name="heart" size={18} color="#FF3B30" />
              </View>
            ) : (
              <View style={[s.ctaIconCircle, { backgroundColor: "rgba(52,199,89,0.15)" }]}>
                <Ionicons name="fitness" size={18} color="#34C759" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.ctaTitle}>
                {Platform.OS === "ios" ? "Connect Apple Health" : "Connect Google Health"}
              </Text>
              <Text style={s.ctaSub}>Unlock personalized recovery insights</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  const status = snapshot?.recoveryStatus ?? null;
  const statusColor = recoveryColor(status);

  return (
    <Animated.View entering={FadeInDown.delay(80).duration(500)} style={s.card}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          {Platform.OS === "ios" ? (
            <View style={[s.headerIcon, { backgroundColor: "rgba(255,59,48,0.15)" }]}>
              <Ionicons name="heart" size={14} color="#FF3B30" />
            </View>
          ) : (
            <View style={[s.headerIcon, { backgroundColor: "rgba(52,199,89,0.15)" }]}>
              <Ionicons name="fitness" size={14} color="#34C759" />
            </View>
          )}
          <Text style={s.headerLabel}>WELLNESS TODAY</Text>
        </View>
        {status ? (
          <View style={[s.statusBadge, { backgroundColor: statusColor + "18", borderColor: statusColor + "40" }]}>
            <Ionicons name={recoveryIcon(status) as any} size={11} color={statusColor} />
            <Text style={[s.statusText, { color: statusColor }]} numberOfLines={1}>
              {status}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={s.metricsRow}>
        <View style={s.metricBlock}>
          <View style={s.metricHeader}>
            <Ionicons name="moon" size={12} color="#818CF8" />
            <Text style={s.metricLabel}>Sleep</Text>
          </View>
          <Text style={s.metricValue}>{formatSleep(snapshot?.sleepHours ?? null)}</Text>
          {snapshot?.sleepQuality ? (
            <Text style={[
              s.metricSub,
              snapshot.sleepQuality === "good" ? { color: "#22C55E" }
                : snapshot.sleepQuality === "fair" ? { color: "#F59E0B" }
                : { color: "#EF4444" },
            ]}>
              {snapshot.sleepQuality === "good" ? "Good" : snapshot.sleepQuality === "fair" ? "Fair" : "Poor"}
            </Text>
          ) : null}
        </View>

        <View style={s.metricDivider} />

        <View style={s.metricBlock}>
          <View style={s.metricHeader}>
            <Ionicons name="heart-outline" size={12} color="#F43F5E" />
            <Text style={s.metricLabel}>Resting HR</Text>
          </View>
          <Text style={s.metricValue}>
            {snapshot?.restingHeartRate != null ? `${snapshot.restingHeartRate}` : "--"}
          </Text>
          {snapshot?.restingHeartRate != null ? (
            <Text style={s.metricSub}>bpm</Text>
          ) : null}
        </View>
      </View>

      <View style={s.stepsRow}>
        <View style={s.stepsHeader}>
          <Ionicons name="walk" size={12} color={Colors.dark.accentText} />
          <Text style={s.metricLabel}>Steps Today</Text>
        </View>
        <StepsArc steps={snapshot?.stepsToday ?? null} goal={snapshot?.stepGoal ?? 10_000} />
      </View>

      {connectionState.lastSyncedAt ? (
        <Text style={s.syncedAt}>
          Synced {new Date(connectionState.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.dark.textMuted,
    letterSpacing: 1.3,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    maxWidth: 180,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    flexShrink: 1,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  metricBlock: {
    flex: 1,
    gap: 2,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    lineHeight: 26,
  },
  metricSub: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  metricDivider: {
    width: 1,
    height: 44,
    backgroundColor: Colors.dark.border,
  },
  stepsRow: {
    gap: 6,
  },
  stepsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  syncedAt: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    textAlign: "right",
    fontStyle: "italic",
  },
  ctaCard: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
  },
  ctaIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  ctaIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  ctaSub: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
});
