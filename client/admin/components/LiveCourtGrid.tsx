import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  FadeIn,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

export interface CourtSession {
  id: string;
  title: string;
  time: string;
  coachName: string;
  playerCount: number;
  status: "upcoming" | "in_progress" | "completed";
  minutesUntilStart?: number;
}

interface TaskAlertRef {
  id: string;
  type: "no_show" | "late" | "payment" | "session" | "urgent";
  title: string;
  description: string;
}

type CourtStatus = "active" | "upcoming_soon" | "upcoming" | "empty" | "problem";

interface CourtTile {
  courtNumber: number;
  session?: CourtSession;
  status: CourtStatus;
  minutesElapsed?: number;
}

interface LiveCourtGridProps {
  sessions: CourtSession[];
  alerts?: TaskAlertRef[];
  totalCourts?: number;
  scrollable?: boolean;
  navigationOnly?: boolean;
  onCheckIn?: (sessionId: string) => void;
  onFlagIssue?: (sessionId: string) => void;
  onViewSession?: (sessionId: string) => void;
  onReassignCoach?: (sessionId: string) => void;
}

const COURT_COLORS: Record<CourtStatus, {
  bg: string; border: string; label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}> = {
  active:        { bg: "#22c55e15", border: "#22c55e",              label: "Active",   icon: "play-circle" },
  upcoming_soon: { bg: `${Colors.dark.xpCyan}15`, border: Colors.dark.xpCyan, label: "Soon",  icon: "time" },
  upcoming:      { bg: `${Colors.dark.xpCyan}08`, border: `${Colors.dark.xpCyan}50`, label: "Upcoming", icon: "time-outline" },
  empty:         { bg: Colors.dark.backgroundSecondary, border: Colors.dark.border, label: "Empty", icon: "tennisball-outline" },
  problem:       { bg: `${Colors.dark.error}15`, border: Colors.dark.error, label: "Issue", icon: "warning" },
};

function parseTimeToMinutesElapsed(timeStr: string): number {
  try {
    const [hourStr, minStr] = timeStr.split(":");
    const hour = parseInt(hourStr, 10);
    const min = parseInt(minStr, 10);
    const now = new Date();
    const sessionStart = new Date();
    sessionStart.setHours(hour, min, 0, 0);
    return Math.floor((now.getTime() - sessionStart.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function formatElapsed(mins: number): string {
  if (mins < 0) return "Starting";
  if (mins < 60) return `${mins}m in`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function ActiveCountdown({ startTime }: { startTime: string }) {
  const [elapsed, setElapsed] = useState(() => parseTimeToMinutesElapsed(startTime));

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(parseTimeToMinutesElapsed(startTime));
    }, 60000);
    return () => clearInterval(id);
  }, [startTime]);

  return (
    <View style={styles.countdownRow}>
      <View style={styles.liveDot} />
      <Text style={styles.countdownText}>{formatElapsed(elapsed)}</Text>
    </View>
  );
}

function CourtTileCard({
  tile,
  index,
  onTap,
  onMorePress,
  navigationOnly = false,
}: {
  tile: CourtTile;
  index: number;
  onTap: (tile: CourtTile) => void;
  onMorePress: (tile: CourtTile) => void;
  navigationOnly?: boolean;
}) {
  const config = COURT_COLORS[tile.status];
  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    scale.value = withDelay(index * 60, withSpring(1, { damping: 16, stiffness: 200 }));
    opacity.value = withDelay(index * 60, withTiming(1, { duration: 300 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { scale: pressScale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => { pressScale.value = withSpring(0.95, { damping: 15 }); };
  const handlePressOut = () => { pressScale.value = withSpring(1, { damping: 15 }); };

  const canCheckIn = !navigationOnly && tile.session && (tile.status === "active" || tile.status === "upcoming_soon");

  return (
    <Animated.View style={[styles.tileWrapper, animStyle]}>
      <Pressable
        style={[styles.tile, { backgroundColor: config.bg, borderColor: config.border }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (navigationOnly) {
            onTap(tile);
          } else if (canCheckIn) {
            onTap(tile);
          } else {
            onMorePress(tile);
          }
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View style={styles.tileHeader}>
          <View style={[styles.statusDot, { backgroundColor: config.border }]} />
          <Text style={[styles.courtLabel, { color: config.border }]}>C{tile.courtNumber}</Text>
        </View>

        <View style={[styles.tileIconWrap, { backgroundColor: config.border + "20" }]}>
          <Ionicons name={config.icon} size={18} color={config.border} />
        </View>

        {tile.session ? (
          <>
            <Text style={styles.tileTitle} numberOfLines={1}>{tile.session.title}</Text>
            <Text style={styles.tileCoach} numberOfLines={1}>{tile.session.coachName}</Text>

            {tile.status === "active" ? (
              <ActiveCountdown startTime={tile.session.time} />
            ) : (
              <View style={styles.tileMeta}>
                <Ionicons name="people-outline" size={10} color={Colors.dark.textMuted} />
                <Text style={styles.tileMetaText}>{tile.session.playerCount}</Text>
                <Text style={styles.tileMetaDivider}>·</Text>
                <Text style={styles.tileMetaText}>{tile.session.time}</Text>
              </View>
            )}

            {canCheckIn && (
              <View style={[styles.checkInHint, { backgroundColor: config.border + "18" }]}>
                <Ionicons name="checkmark" size={10} color={config.border} />
                <Text style={[styles.checkInHintText, { color: config.border }]}>Tap to check in</Text>
              </View>
            )}

            {navigationOnly && (
              <View style={[styles.checkInHint, { backgroundColor: config.border + "18" }]}>
                <Ionicons name="arrow-forward" size={10} color={config.border} />
                <Text style={[styles.checkInHintText, { color: config.border }]}>View schedule</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={styles.tileTitle}>{config.label}</Text>
            <Text style={styles.tileCoach}>Available</Text>
          </>
        )}

        {tile.session && !navigationOnly && (
          <Pressable
            style={styles.moreBtn}
            hitSlop={8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onMorePress(tile);
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={12} color={config.border} />
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

interface ActionSheetProps {
  tile: CourtTile | null;
  visible: boolean;
  onClose: () => void;
  onCheckIn?: (sessionId: string) => void;
  onFlagIssue?: (sessionId: string) => void;
  onViewSession?: (sessionId: string) => void;
  onReassignCoach?: (sessionId: string) => void;
}

function CourtActionSheet({
  tile, visible, onClose, onCheckIn, onFlagIssue, onViewSession, onReassignCoach,
}: ActionSheetProps) {
  if (!tile) return null;
  const config = COURT_COLORS[tile.status];

  type ActionItem = {
    icon: React.ComponentProps<typeof Ionicons>["name"];
    label: string;
    color: string;
    onPress: () => void;
  };

  const actions: ActionItem[] = [
    tile.session && {
      icon: "checkmark-circle-outline" as const,
      label: "Check In Player",
      color: "#22c55e",
      onPress: () => { onCheckIn?.(tile.session!.id); onClose(); },
    },
    tile.session && {
      icon: "eye-outline" as const,
      label: "View Session Details",
      color: Colors.dark.xpCyan,
      onPress: () => { onViewSession?.(tile.session!.id); onClose(); },
    },
    tile.session && {
      icon: "swap-horizontal-outline" as const,
      label: "Reassign Coach",
      color: Colors.dark.gold,
      onPress: () => { onReassignCoach?.(tile.session!.id); onClose(); },
    },
    tile.session && tile.status !== "empty" && {
      icon: "warning-outline" as const,
      label: "Flag Issue",
      color: Colors.dark.error,
      onPress: () => { onFlagIssue?.(tile.session!.id); onClose(); },
    },
  ].filter(Boolean) as ActionItem[];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(150)} style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={SlideInDown.springify().damping(22).stiffness(260)} exiting={SlideOutDown.duration(200)} style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={[styles.sheetBadge, { backgroundColor: config.border + "20" }]}>
              <Ionicons name={config.icon} size={16} color={config.border} />
              <Text style={[styles.sheetBadgeText, { color: config.border }]}>
                Court {tile.courtNumber} — {config.label}
              </Text>
            </View>
          </View>

          {tile.session && (
            <View style={styles.sheetSessionInfo}>
              <Text style={styles.sheetSessionTitle}>{tile.session.title}</Text>
              <Text style={styles.sheetSessionMeta}>
                {tile.session.coachName} · {tile.session.playerCount} players · {tile.session.time}
              </Text>
            </View>
          )}

          <View style={styles.sheetActions}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                style={[styles.sheetAction, { borderColor: action.color + "30", backgroundColor: action.color + "10" }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  action.onPress();
                }}
              >
                <Ionicons name={action.icon} size={18} color={action.color} />
                <Text style={[styles.sheetActionText, { color: action.color }]}>{action.label}</Text>
                <Ionicons name="chevron-forward" size={14} color={action.color + "60"} style={{ marginLeft: "auto" }} />
              </Pressable>
            ))}
            <Pressable style={styles.sheetCancel} onPress={onClose}>
              <Text style={styles.sheetCancelText}>Dismiss</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function LiveCourtGrid({
  sessions,
  alerts = [],
  totalCourts = 6,
  scrollable = false,
  navigationOnly = false,
  onCheckIn,
  onFlagIssue,
  onViewSession,
  onReassignCoach,
}: LiveCourtGridProps) {
  const [selectedTile, setSelectedTile] = useState<CourtTile | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const problemSessionIds = new Set<number>();
  const hasLateAlert = alerts.some(a => a.type === "no_show" || a.type === "late");

  const tiles: CourtTile[] = Array.from({ length: Math.max(totalCourts, sessions.length) }, (_, i) => {
    const session = sessions[i];
    if (!session) return { courtNumber: i + 1, status: "empty" as CourtStatus };

    let status: CourtStatus = "empty";
    const elapsed = session.status === "in_progress" ? parseTimeToMinutesElapsed(session.time) : 0;

    if (session.status === "in_progress") {
      const isProblem = (elapsed > 90) || (hasLateAlert && i === 0);
      status = isProblem ? "problem" : "active";
    } else if (session.status === "upcoming") {
      const mins = session.minutesUntilStart ?? 999;
      status = mins < 30 ? "upcoming_soon" : "upcoming";
    }

    return { courtNumber: i + 1, session, status, minutesElapsed: elapsed };
  });

  const handleTileTap = useCallback((tile: CourtTile) => {
    if (!tile.session) return;
    if (navigationOnly) {
      onViewSession?.(tile.session.id);
    } else if (tile.status === "active" || tile.status === "upcoming_soon") {
      onCheckIn?.(tile.session.id);
    }
  }, [navigationOnly, onViewSession, onCheckIn]);

  const handleMorePress = useCallback((tile: CourtTile) => {
    setSelectedTile(tile);
    setSheetVisible(true);
  }, []);

  const activeCourts = tiles.filter(t => t.status === "active").length;
  const problemCourts = tiles.filter(t => t.status === "problem").length;
  const emptyCourts = tiles.filter(t => t.status === "empty").length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.titleIconBg, { backgroundColor: "#22c55e20" }]}>
            <Ionicons name="grid" size={16} color="#22c55e" />
          </View>
          <Text style={styles.title}>Live Court Status</Text>
        </View>
        <View style={styles.summaryRow}>
          {activeCourts > 0 && (
            <View style={styles.summaryItem}>
              <View style={[styles.summaryDot, { backgroundColor: "#22c55e" }]} />
              <Text style={styles.summaryText}>{activeCourts} active</Text>
            </View>
          )}
          {problemCourts > 0 && (
            <View style={styles.summaryItem}>
              <View style={[styles.summaryDot, { backgroundColor: Colors.dark.error }]} />
              <Text style={[styles.summaryText, { color: Colors.dark.error }]}>{problemCourts} issue</Text>
            </View>
          )}
          <View style={styles.summaryItem}>
            <View style={[styles.summaryDot, { backgroundColor: Colors.dark.textMuted }]} />
            <Text style={styles.summaryText}>{emptyCourts} empty</Text>
          </View>
        </View>
      </View>

      <View style={styles.legend}>
        {(Object.entries(COURT_COLORS) as [CourtStatus, typeof COURT_COLORS[CourtStatus]][])
          .filter(([k]) => k !== "upcoming")
          .map(([status, cfg]) => (
            <View key={status} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: cfg.border }]} />
              <Text style={styles.legendLabel}>{cfg.label}</Text>
            </View>
          ))}
      </View>

      {scrollable ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gridScrollContent}
        >
          {tiles.map((tile, i) => (
            <CourtTileCard
              key={tile.courtNumber}
              tile={tile}
              index={i}
              onTap={handleTileTap}
              onMorePress={handleMorePress}
              navigationOnly={navigationOnly}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.grid}>
          {tiles.map((tile, i) => (
            <CourtTileCard
              key={tile.courtNumber}
              tile={tile}
              index={i}
              onTap={handleTileTap}
              onMorePress={handleMorePress}
              navigationOnly={navigationOnly}
            />
          ))}
        </View>
      )}

      {!navigationOnly && (
        <CourtActionSheet
          tile={selectedTile}
          visible={sheetVisible}
          onClose={() => setSheetVisible(false)}
          onCheckIn={onCheckIn}
          onFlagIssue={onFlagIssue}
          onViewSession={onViewSession}
          onReassignCoach={onReassignCoach}
        />
      )}
    </View>
  );
}

const TILE_SIZE = 105;

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  titleIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  summaryDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  summaryText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  legend: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    marginBottom: Spacing.md,
    flexWrap: "wrap",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  gridScrollContent: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  tileWrapper: {
    width: TILE_SIZE,
  },
  tile: {
    width: TILE_SIZE,
    minHeight: TILE_SIZE,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    borderWidth: 1.5,
    justifyContent: "flex-start",
    overflow: "hidden",
  },
  tileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  courtLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  tileIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  tileTitle: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    fontSize: 11,
    marginBottom: 2,
  },
  tileCoach: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginBottom: 4,
  },
  tileMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  tileMetaText: {
    fontSize: 9,
    color: Colors.dark.textMuted,
  },
  tileMetaDivider: {
    fontSize: 9,
    color: Colors.dark.textMuted,
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#22c55e",
  },
  countdownText: {
    fontSize: 9,
    color: "#22c55e",
    fontWeight: "600",
  },
  checkInHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  checkInHintText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  moreBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    padding: 2,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: Colors.dark.border,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  sheetHeader: {
    marginBottom: Spacing.md,
  },
  sheetBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  sheetBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  sheetSessionInfo: {
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  sheetSessionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
    marginBottom: 4,
  },
  sheetSessionMeta: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  sheetActions: {
    gap: Spacing.sm,
  },
  sheetAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  sheetActionText: {
    ...Typography.body,
    fontWeight: "600",
    flex: 1,
  },
  sheetCancel: {
    padding: Spacing.md,
    alignItems: "center",
    marginTop: 4,
  },
  sheetCancelText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
});
