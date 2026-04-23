import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type ReportStatus = "open" | "resolved" | "dismissed";
type FilterValue = ReportStatus | "all";

interface ReportItem {
  id: string;
  status: ReportStatus;
  reason: string | null;
  createdAt: string | null;
  room: {
    id: string;
    scope: string | null;
    title: string | null;
    flag: string | null;
    mutedAt: string | null;
  } | null;
  message: {
    id: string;
    content: string;
    isDeleted: boolean;
    createdAt: string | null;
    senderType: string | null;
    senderCoachId: string | null;
    senderPlayerId: string | null;
  } | null;
  reporter: {
    id: string;
    username: string | null;
    role: string | null;
  };
}

interface ReportsResponse {
  items: ReportItem[];
}

const FILTERS: { key: FilterValue; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];

const STATUS_COLORS: Record<ReportStatus, string> = {
  open: Colors.dark.orange,
  resolved: Colors.dark.successNeon,
  dismissed: Colors.dark.textMuted,
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function senderLabel(report: ReportItem): string {
  const m = report.message;
  if (!m) return "Unknown sender";
  if (m.senderType === "coach") return "Coach";
  if (m.senderType === "player") return "Player";
  return m.senderType || "Unknown";
}

export default function ModerationReportsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterValue>("open");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const queryKey = useMemo(
    () => ["/api/chat-rooms/admin/reports", { status: filter }] as const,
    [filter],
  );

  const { data, isLoading, isRefetching, refetch } = useQuery<ReportsResponse>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/chat-rooms/admin/reports?status=${encodeURIComponent(filter)}`,
      );
      return res.json();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/chat-rooms/admin/reports"] });
  };

  const actionMutation = useMutation({
    mutationFn: async (params: { reportId: string; path: string; body?: unknown }) => {
      const res = await apiRequest(
        "POST",
        `/api/chat-rooms/admin/reports/${params.reportId}/${params.path}`,
        params.body,
      );
      return res.json();
    },
    onMutate: (vars) => {
      setPendingId(vars.reportId);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      invalidate();
    },
    onError: (err: any) => {
      Alert.alert("Action failed", err?.message || "Something went wrong. Please try again.");
    },
    onSettled: () => {
      setPendingId(null);
    },
  });

  const confirmAction = (
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void,
    destructive?: boolean,
  ) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: confirmLabel,
        style: destructive ? "destructive" : "default",
        onPress: onConfirm,
      },
    ]);
  };

  const handleDismiss = (report: ReportItem) =>
    confirmAction(
      "Dismiss report",
      "Mark this report as dismissed without taking action?",
      "Dismiss",
      () => actionMutation.mutate({ reportId: report.id, path: "dismiss" }),
    );

  const handleDeleteMessage = (report: ReportItem) =>
    confirmAction(
      "Delete message",
      "Permanently hide this message from the chat room?",
      "Delete",
      () => actionMutation.mutate({ reportId: report.id, path: "delete-message" }),
      true,
    );

  const handleMuteReporter = (report: ReportItem) =>
    confirmAction(
      "Mute reporter",
      `Mute ${report.reporter.username || "this user"} in this room indefinitely?`,
      "Mute",
      () => actionMutation.mutate({ reportId: report.id, path: "mute-reporter", body: {} }),
    );

  const handleMuteRoom = (report: ReportItem) => {
    const muted = !!report.room?.mutedAt;
    confirmAction(
      muted ? "Unmute room" : "Mute room",
      muted
        ? "Allow members to send messages in this room again?"
        : "Silence this entire room for all members?",
      muted ? "Unmute" : "Mute",
      () =>
        actionMutation.mutate({
          reportId: report.id,
          path: "mute-room",
          body: { enable: !muted },
        }),
      !muted,
    );
  };

  const items = data?.items ?? [];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.dark.gold}
          />
        }
      >
        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setFilter(f.key);
                }}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.dark.gold} />
          </View>
        ) : items.length === 0 ? (
          <View style={[styles.center, CardStyles.elevated, styles.emptyCard]}>
            <Ionicons name="shield-checkmark" size={32} color={Colors.dark.textMuted} />
            <Text style={styles.emptyTitle}>No reports</Text>
            <Text style={styles.emptySubtitle}>
              {filter === "open"
                ? "The moderation queue is clear."
                : "Nothing matches this filter."}
            </Text>
          </View>
        ) : (
          items.map((report) => {
            const busy = pendingId === report.id;
            const messageDeleted = report.message?.isDeleted;
            const roomMuted = !!report.room?.mutedAt;
            return (
              <View key={report.id} style={[styles.card, CardStyles.elevated]}>
                <View style={styles.cardHeader}>
                  <View style={styles.roomBadge}>
                    <Text style={styles.roomFlag}>{report.room?.flag || "💬"}</Text>
                    <Text style={styles.roomTitle}>
                      {report.room?.title || "Unknown room"}
                    </Text>
                    {roomMuted ? (
                      <View style={styles.mutedTag}>
                        <Ionicons name="volume-mute" size={12} color={Colors.dark.orange} />
                        <Text style={styles.mutedTagText}>Muted</Text>
                      </View>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: `${STATUS_COLORS[report.status]}20` },
                    ]}
                  >
                    <Text style={[styles.statusText, { color: STATUS_COLORS[report.status] }]}>
                      {report.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.messagePreview}>
                  <Text style={styles.previewLabel}>{senderLabel(report)} said</Text>
                  <Text
                    style={[
                      styles.previewBody,
                      messageDeleted && styles.previewBodyDeleted,
                    ]}
                    numberOfLines={6}
                  >
                    {messageDeleted
                      ? "[message deleted]"
                      : report.message?.content || "[no content]"}
                  </Text>
                </View>

                <View style={styles.metaGrid}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Reporter</Text>
                    <Text style={styles.metaValue}>
                      {report.reporter.username || report.reporter.id.slice(0, 8)}
                      {report.reporter.role ? `  ·  ${report.reporter.role}` : ""}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Reason</Text>
                    <Text style={styles.metaValue}>{report.reason || "Not specified"}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Reported</Text>
                    <Text style={styles.metaValue}>{formatTimestamp(report.createdAt)}</Text>
                  </View>
                  {report.message?.createdAt ? (
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Message sent</Text>
                      <Text style={styles.metaValue}>
                        {formatTimestamp(report.message.createdAt)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {report.status === "open" ? (
                  <View style={styles.actionsRow}>
                    <ActionButton
                      icon="close-circle-outline"
                      label="Dismiss"
                      onPress={() => handleDismiss(report)}
                      disabled={busy}
                    />
                    <ActionButton
                      icon="trash-outline"
                      label={messageDeleted ? "Deleted" : "Delete"}
                      tone="danger"
                      onPress={() => handleDeleteMessage(report)}
                      disabled={busy || messageDeleted}
                    />
                    <ActionButton
                      icon="person-remove-outline"
                      label="Mute user"
                      onPress={() => handleMuteReporter(report)}
                      disabled={busy}
                    />
                    <ActionButton
                      icon={roomMuted ? "volume-high-outline" : "volume-mute-outline"}
                      label={roomMuted ? "Unmute room" : "Mute room"}
                      tone={roomMuted ? "neutral" : "danger"}
                      onPress={() => handleMuteRoom(report)}
                      disabled={busy}
                    />
                  </View>
                ) : null}

                {busy ? (
                  <View style={styles.busyOverlay}>
                    <ActivityIndicator color={Colors.dark.gold} />
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

interface ActionButtonProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
}

function ActionButton({ icon, label, onPress, disabled, tone = "neutral" }: ActionButtonProps) {
  const color = tone === "danger" ? Colors.dark.error : Colors.dark.gold;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionButton,
        { borderColor: `${color}50`, backgroundColor: `${color}15` },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.actionLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
  },
  emptyCard: {
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  emptySubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterChipActive: {
    backgroundColor: `${Colors.dark.gold}20`,
    borderColor: Colors.dark.gold,
  },
  filterChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: Colors.dark.gold,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.sm,
  },
  roomBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flex: 1,
  },
  roomFlag: {
    fontSize: 18,
  },
  roomTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  mutedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${Colors.dark.orange}20`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  mutedTagText: {
    ...Typography.small,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.small,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  messagePreview: {
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  previewLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  previewBody: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  previewBodyDeleted: {
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  metaItem: {
    minWidth: 140,
    flexGrow: 1,
    flexBasis: "40%",
  },
  metaLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    marginBottom: 2,
  },
  metaValue: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  actionLabel: {
    ...Typography.small,
    fontWeight: "600",
  },
  busyOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: BorderRadius.lg,
  },
});
