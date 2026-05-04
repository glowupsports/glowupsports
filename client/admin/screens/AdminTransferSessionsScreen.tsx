import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import { type AdminStackParamList } from "@/admin/navigation/AdminNavigator";

interface Coach {
  id: string;
  name: string;
  role?: string;
  specialty?: string;
}

interface UpcomingSession {
  id: string;
  title: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  playerCount: number;
  seriesId: string | null;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sessionLabel(s: UpcomingSession) {
  if (s.title) return s.title;
  const typeMap: Record<string, string> = {
    private: "Private",
    semi: "Semi-private",
    group: "Group",
    physical: "Physical",
    activity: "Activity",
  };
  return typeMap[s.sessionType] ?? s.sessionType;
}

export default function AdminTransferSessionsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AdminStackParamList, "AdminTransferSessions">>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const fromCoachId = route.params?.fromCoachId ?? null;

  const [toCoachId, setToCoachId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCoachPicker, setShowCoachPicker] = useState(false);

  const { data: coaches = [], isLoading: coachesLoading } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });

  const fromCoach = coaches.find((c) => c.id === fromCoachId) ?? null;
  const toCoach = coaches.find((c) => c.id === toCoachId) ?? null;
  const eligibleToCoaches = coaches.filter((c) => c.id !== fromCoachId);

  const {
    data: upcomingSessions = [],
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useQuery<UpcomingSession[]>({
    queryKey: ["/api/admin/coaches", fromCoachId, "upcoming-sessions"],
    enabled: !!fromCoachId,
    queryFn: async () => {
      const url = new URL(
        `/api/admin/coaches/${fromCoachId}/upcoming-sessions`,
        getApiUrl(),
      );
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (!resp.ok) throw new Error(await resp.text());
      return resp.json();
    },
  });

  const allSelected =
    upcomingSessions.length > 0 &&
    upcomingSessions.every((s) => selectedIds.has(s.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(upcomingSessions.map((s) => s.id)));
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [allSelected, upcomingSessions]);

  const toggleSession = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    Haptics.selectionAsync();
  }, []);

  const transferMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/sessions/transfer", {
        sessionIds: Array.from(selectedIds),
        toCoachId,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/coaches", fromCoachId, "upcoming-sessions"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Transfer Complete",
        `${data.transferred ?? selectedIds.size} session${(data.transferred ?? selectedIds.size) !== 1 ? "s" : ""} transferred to ${data.toCoachName ?? toCoach?.name}.`,
        [{ text: "Done", onPress: () => navigation.goBack() }],
      );
    },
    onError: (err: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Transfer Failed", err.message);
    },
  });

  const handleTransfer = () => {
    if (!toCoachId) {
      Alert.alert("Select a coach", "Please choose who to transfer the sessions to.");
      return;
    }
    if (selectedIds.size === 0) {
      Alert.alert("Select sessions", "Please select at least one session to transfer.");
      return;
    }
    Alert.alert(
      "Confirm Transfer",
      `Transfer ${selectedIds.size} session${selectedIds.size !== 1 ? "s" : ""} to ${toCoach?.name}? Players will keep their bookings under the new coach.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          onPress: () => transferMutation.mutate(),
        },
      ],
    );
  };

  const renderSession = ({ item }: { item: UpcomingSession }) => {
    const checked = selectedIds.has(item.id);
    return (
      <Pressable
        style={[styles.sessionRow, checked && styles.sessionRowSelected]}
        onPress={() => toggleSession(item.id)}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? (
            <Ionicons name="checkmark" size={14} color={Colors.dark.backgroundRoot} />
          ) : null}
        </View>
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionTitle}>{sessionLabel(item)}</Text>
          <Text style={styles.sessionMeta}>{formatDateTime(item.startTime)}</Text>
          {item.playerCount > 0 ? (
            <View style={styles.playerPill}>
              <Ionicons name="people" size={11} color={Colors.dark.textMuted} />
              <Text style={styles.playerPillText}>{item.playerCount} player{item.playerCount !== 1 ? "s" : ""}</Text>
            </View>
          ) : null}
        </View>
        {item.seriesId ? (
          <View style={styles.seriesBadge}>
            <Ionicons name="repeat" size={12} color={Colors.dark.orange} />
            <Text style={styles.seriesBadgeText}>Series</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Transfer Sessions</Text>
        <View style={styles.headerRight} />
      </View>

      <FlatList
        data={upcomingSessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSession}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        ListHeaderComponent={
          <View>
            {/* From coach */}
            <View style={[styles.card, CardStyles.elevated]}>
              <Text style={styles.cardLabel}>From coach</Text>
              <View style={styles.coachRow}>
                <View style={styles.coachAvatar}>
                  <Ionicons name="person" size={20} color={Colors.dark.orange} />
                </View>
                <Text style={styles.coachName}>
                  {coachesLoading
                    ? "Loading..."
                    : fromCoach
                    ? fromCoach.name
                    : "Unknown coach"}
                </Text>
              </View>
            </View>

            {/* To coach picker */}
            <Pressable
              style={[styles.card, CardStyles.elevated]}
              onPress={() => setShowCoachPicker((v) => !v)}
            >
              <Text style={styles.cardLabel}>Transfer to</Text>
              <View style={styles.coachPickerRow}>
                <View style={styles.coachRow}>
                  {toCoach ? (
                    <>
                      <View style={[styles.coachAvatar, { backgroundColor: `${Colors.dark.primary}20` }]}>
                        <Ionicons name="person" size={20} color={Colors.dark.primary} />
                      </View>
                      <Text style={styles.coachName}>{toCoach.name}</Text>
                    </>
                  ) : (
                    <>
                      <View style={[styles.coachAvatar, { backgroundColor: Colors.dark.backgroundRoot }]}>
                        <Ionicons name="person-add-outline" size={20} color={Colors.dark.textMuted} />
                      </View>
                      <Text style={styles.coachNamePlaceholder}>Choose a coach</Text>
                    </>
                  )}
                </View>
                <Ionicons
                  name={showCoachPicker ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={Colors.dark.textMuted}
                />
              </View>
              {showCoachPicker ? (
                <View style={styles.coachDropdown}>
                  {eligibleToCoaches.map((c) => (
                    <Pressable
                      key={c.id}
                      style={[
                        styles.coachDropdownItem,
                        toCoachId === c.id && styles.coachDropdownItemActive,
                      ]}
                      onPress={() => {
                        setToCoachId(c.id);
                        setShowCoachPicker(false);
                        Haptics.selectionAsync();
                      }}
                    >
                      <Text
                        style={[
                          styles.coachDropdownText,
                          toCoachId === c.id && styles.coachDropdownTextActive,
                        ]}
                      >
                        {c.name}
                      </Text>
                      {toCoachId === c.id ? (
                        <Ionicons name="checkmark" size={16} color={Colors.dark.primary} />
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Pressable>

            {/* Sessions header */}
            {fromCoachId ? (
              <View style={styles.sessionsHeader}>
                <Text style={styles.sessionsTitle}>
                  {sessionsLoading
                    ? "Loading sessions..."
                    : sessionsError
                    ? "Could not load sessions"
                    : upcomingSessions.length === 0
                    ? "No upcoming sessions"
                    : `${upcomingSessions.length} upcoming session${upcomingSessions.length !== 1 ? "s" : ""}`}
                </Text>
                {upcomingSessions.length > 0 ? (
                  <Pressable onPress={toggleSelectAll}>
                    <Text style={styles.selectAllText}>
                      {allSelected ? "Deselect all" : "Select all"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {sessionsLoading ? (
              <View style={styles.loadingBox}>
                <TennisBallSpinner size="small" color={Colors.dark.orange} />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !sessionsLoading ? (
            <View style={styles.emptyBox}>
              <Ionicons name="calendar-outline" size={40} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>
                {fromCoachId ? "No upcoming sessions to transfer" : "Select a source coach"}
              </Text>
            </View>
          ) : null
        }
      />

      {/* Bottom transfer bar */}
      {selectedIds.size > 0 ? (
        <View
          style={[
            styles.transferBar,
            { paddingBottom: insets.bottom + Spacing.md },
          ]}
        >
          <Text style={styles.transferCount}>
            {selectedIds.size} session{selectedIds.size !== 1 ? "s" : ""} selected
          </Text>
          <Pressable
            style={[
              styles.transferButton,
              transferMutation.isPending && styles.transferButtonDisabled,
            ]}
            onPress={handleTransfer}
            disabled={transferMutation.isPending}
          >
            {transferMutation.isPending ? (
              <TennisBallSpinner size="small" color={Colors.dark.backgroundRoot} />
            ) : (
              <>
                <Ionicons name="swap-horizontal" size={18} color={Colors.dark.backgroundRoot} />
                <Text style={styles.transferButtonText}>Transfer</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backButton: {
    padding: Spacing.xs,
    marginRight: Spacing.sm,
  },
  headerTitle: {
    ...Typography.heading,
    flex: 1,
    color: Colors.dark.text,
  },
  headerRight: {
    width: 32,
  },
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  coachAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.dark.orange}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachNamePlaceholder: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  coachPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  coachDropdown: {
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.sm,
    gap: 2,
  },
  coachDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  coachDropdownItemActive: {
    backgroundColor: `${Colors.dark.primary}15`,
  },
  coachDropdownText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  coachDropdownTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  sessionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  sessionsTitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  selectAllText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  emptyBox: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundElevated,
    marginBottom: Spacing.sm,
  },
  sessionRowSelected: {
    backgroundColor: `${Colors.dark.primary}12`,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}40`,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  sessionInfo: {
    flex: 1,
    gap: 2,
  },
  sessionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sessionMeta: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  playerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  playerPillText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  seriesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: `${Colors.dark.orange}20`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  seriesBadgeText: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontSize: 11,
  },
  transferBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.dark.backgroundElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  transferCount: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  transferButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  transferButtonDisabled: {
    opacity: 0.6,
  },
  transferButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
});
