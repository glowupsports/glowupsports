import React, { useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/player/context/PlayerContext";
import { LockedScreen } from "../components/LockedScreen";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface BallLevel {
  id: string;
  name: string;
  displayName: string;
  color: string;
}

interface Trial {
  trial: {
    id: string;
    playerId: string;
    fromLevelId: string;
    toLevelId: string;
    status: string;
    startedAt: string;
    endsAt: string;
    gatesRequired: number;
    gatesPassed: number;
    coachNotes?: string;
  };
  fromLevel: BallLevel;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  in_progress: { color: Colors.dark.primary, label: "In Progress", icon: "hourglass-outline" },
  passed: { color: Colors.dark.primary, label: "Passed", icon: "checkmark-circle" },
  failed: { color: Colors.dark.error, label: "Not Passed", icon: "close-circle" },
  expired: { color: Colors.dark.textMuted, label: "Expired", icon: "time-outline" },
};

const BALL_LEVEL_COLORS: Record<string, string> = {
  red: "#FF4444",
  orange: "#FF9500",
  green: "#2ECC40",
  yellow: "#FFD700",
};

function getBallColor(levelName: string): string {
  const lower = levelName.toLowerCase();
  if (lower.includes("red")) return BALL_LEVEL_COLORS.red;
  if (lower.includes("orange")) return BALL_LEVEL_COLORS.orange;
  if (lower.includes("green")) return BALL_LEVEL_COLORS.green;
  if (lower.includes("yellow")) return BALL_LEVEL_COLORS.yellow;
  return Colors.dark.primary;
}

export default function TrialGatesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { playerId } = usePlayer();

  const { data: trials = [], isLoading } = useQuery<Trial[]>({
    queryKey: [`/api/glow/players/${playerId}/trials`],
    enabled: !!playerId,
  });

  const activeTrials = trials.filter(t => t.trial.status === "in_progress");
  const pastTrials = trials.filter(t => t.trial.status !== "in_progress");

  const getDaysRemaining = (endsAt: string) => {
    const end = new Date(endsAt);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const renderTrialCard = (item: Trial, isActive: boolean) => {
    const status = STATUS_CONFIG[item.trial.status] || STATUS_CONFIG.in_progress;
    const ballColor = getBallColor(item.fromLevel?.name || "");
    const daysRemaining = isActive ? getDaysRemaining(item.trial.endsAt) : 0;
    const progress = item.trial.gatesRequired > 0 
      ? item.trial.gatesPassed / item.trial.gatesRequired 
      : 0;

    return (
      <Pressable 
        key={item.trial.id} 
        style={styles.trialCard}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      >
        {isActive ? (
          <LinearGradient
            colors={[ballColor + "20", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.trialCardGradient}
          >
            {renderTrialContent(item, status, ballColor, daysRemaining, progress, isActive)}
          </LinearGradient>
        ) : (
          <View style={styles.trialCardContent}>
            {renderTrialContent(item, status, ballColor, daysRemaining, progress, isActive)}
          </View>
        )}
      </Pressable>
    );
  };

  const renderTrialContent = (
    item: Trial, 
    status: typeof STATUS_CONFIG[string],
    ballColor: string,
    daysRemaining: number,
    progress: number,
    isActive: boolean
  ) => (
    <>
      <View style={styles.trialHeader}>
        <View style={[styles.levelBadge, { backgroundColor: ballColor + "20" }]}>
          <View style={[styles.levelDot, { backgroundColor: ballColor }]} />
          <Text style={[styles.levelText, { color: ballColor }]}>
            {item.fromLevel?.displayName || "Unknown"} Trial
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.color + "20" }]}>
          <Ionicons name={status.icon as any} size={14} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.trialDetails}>
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>Gates Progress</Text>
          <View style={styles.gatesRow}>
            {Array.from({ length: item.trial.gatesRequired }).map((_, i) => (
              <View 
                key={i}
                style={[
                  styles.gateIcon,
                  i < item.trial.gatesPassed && styles.gateIconPassed,
                  { borderColor: i < item.trial.gatesPassed ? Colors.dark.primary : Colors.dark.backgroundTertiary },
                ]}
              >
                {i < item.trial.gatesPassed ? (
                  <Ionicons name="checkmark" size={16} color={Colors.dark.primary} />
                ) : (
                  <Text style={styles.gateNumber}>{i + 1}</Text>
                )}
              </View>
            ))}
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>

        {isActive ? (
          <View style={styles.timeSection}>
            <Ionicons name="time-outline" size={18} color={Colors.dark.orange} />
            <Text style={styles.timeText}>
              {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining
            </Text>
          </View>
        ) : null}

        <View style={styles.trialMeta}>
          <Text style={styles.metaText}>
            Started: {new Date(item.trial.startedAt).toLocaleDateString()}
          </Text>
          {!isActive ? (
            <Text style={styles.metaText}>
              Ended: {new Date(item.trial.endsAt).toLocaleDateString()}
            </Text>
          ) : null}
        </View>

        {item.trial.coachNotes ? (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Coach Notes:</Text>
            <Text style={styles.notesText}>{item.trial.coachNotes}</Text>
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <LockedScreen featureKey="trial_gates">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Trial Gates</Text>
          <View style={styles.headerSpacer} />
        </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color={Colors.dark.primary} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>What are Trial Gates?</Text>
            <Text style={styles.infoText}>
              Trial gates are challenges set by your coach to test if you&apos;re ready to move to the next ball level. 
              Complete all gates within the time limit to advance!
            </Text>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.dark.primary} style={styles.loader} />
        ) : (
          <>
            {activeTrials.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active Trials</Text>
                {activeTrials.map(trial => renderTrialCard(trial, true))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="flag-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyText}>No Active Trials</Text>
                <Text style={styles.emptySubtext}>
                  Your coach will start a trial gate when you&apos;re ready to level up!
                </Text>
              </View>
            )}

            {pastTrials.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Past Trials</Text>
                {pastTrials.map(trial => renderTrialCard(trial, false))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      </View>
    </LockedScreen>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.heading3,
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: Colors.dark.primary + "15",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    ...Typography.bodyLarge,
    color: Colors.dark.primary,
    fontWeight: "600",
    marginBottom: 4,
  },
  infoText: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.heading4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  trialCard: {
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  trialCardGradient: {
    padding: Spacing.md,
  },
  trialCardContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  trialHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 6,
  },
  levelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  levelText: {
    ...Typography.bodySmall,
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  trialDetails: {},
  progressSection: {
    marginBottom: Spacing.md,
  },
  progressLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
  },
  gatesRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  gateIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  gateIconPassed: {
    backgroundColor: Colors.dark.primary + "20",
  },
  gateNumber: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 3,
  },
  timeSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.dark.orange + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
  },
  timeText: {
    ...Typography.bodySmall,
    color: Colors.dark.orange,
    fontWeight: "500",
  },
  trialMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  metaText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  notesSection: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  notesLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginBottom: 2,
  },
  notesText: {
    ...Typography.bodySmall,
    color: Colors.dark.text,
    fontStyle: "italic",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    ...Typography.bodyLarge,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.bodySmall,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xl,
  },
  loader: {
    marginVertical: Spacing.xl,
  },
}));
