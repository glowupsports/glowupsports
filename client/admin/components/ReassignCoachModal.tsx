import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

interface AvailableCoach {
  id: string;
  name: string;
  specialty?: string;
  role?: string;
  sessionsToday: number;
  isFreeAtTime: boolean;
  isCurrentCoach: boolean;
}

interface ReassignCoachModalProps {
  visible: boolean;
  sessionId: string | null;
  sessionLabel?: string;
  batchSessionIds?: string[];
  onClose: () => void;
  onSuccess?: (newCoachId: string) => void;
}

const ROLE_LABELS: Record<string, string> = {
  head_coach: "Head Coach",
  coach: "Coach",
  assistant: "Assistant",
  intern: "Intern",
};

const ROLE_COLORS: Record<string, string> = {
  head_coach: Colors.dark.gold,
  coach: Colors.dark.primary,
  assistant: Colors.dark.orange,
  intern: Colors.dark.xpCyan,
};

export default function ReassignCoachModal({
  visible,
  sessionId,
  sessionLabel,
  batchSessionIds,
  onClose,
  onSuccess,
}: ReassignCoachModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setSelectedCoachId(null);
  }, [visible, sessionId]);

  const isBatch = batchSessionIds && batchSessionIds.length > 1;
  const effectiveIds = batchSessionIds && batchSessionIds.length > 0 ? batchSessionIds : (sessionId ? [sessionId] : []);

  const { data, isLoading } = useQuery<{
    session: any;
    coaches: AvailableCoach[];
  }>({
    queryKey: ["/api/admin/coaches/available-at", sessionId],
    queryFn: () =>
      apiRequest("GET", `/api/admin/coaches/available-at?sessionId=${sessionId}`).then((r) =>
        r.json(),
      ),
    enabled: !!sessionId && visible,
  });

  const reassignMutation = useMutation({
    mutationFn: async (newCoachId: string) => {
      // Phase 1: pre-validate ALL sessions (dryRun) — no updates yet
      for (const id of effectiveIds) {
        const res = await apiRequest("PATCH", `/api/admin/sessions/${id}/reassign-coach`, {
          newCoachId,
          dryRun: true,
        });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Coach has a conflict in one or more selected sessions");
        }
      }
      // Phase 2: all checks passed — apply updates
      for (const id of effectiveIds) {
        const res = await apiRequest("PATCH", `/api/admin/sessions/${id}/reassign-coach`, {
          newCoachId,
        });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Failed to reassign session");
        }
      }
      return newCoachId;
    },
    onSuccess: (_result, newCoachId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coaches/available-at", sessionId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess?.(newCoachId);
      onClose();
    },
    onError: (err: Error) => {
      Alert.alert("Reassignment Failed", err.message);
    },
  });

  const handleConfirm = () => {
    if (!selectedCoachId) return;
    const coach = data?.coaches.find((c) => c.id === selectedCoachId);
    if (!coach) return;
    const sessionCount = effectiveIds.length;
    const bodyText = isBatch
      ? `Assign ${coach.name} to all ${sessionCount} sessions? All affected parties will be notified automatically.`
      : `Assign ${coach.name} to this session? All affected parties will be notified automatically.`;
    Alert.alert(
      "Confirm Reassignment",
      bodyText,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isBatch ? `Reassign ${sessionCount} Sessions` : "Reassign",
          onPress: () => reassignMutation.mutate(selectedCoachId),
        },
      ],
    );
  };

  const handleClose = () => {
    setSelectedCoachId(null);
    onClose();
  };

  const availableCoaches = data?.coaches.filter((c) => c.isFreeAtTime && !c.isCurrentCoach) ?? [];
  const busyCoaches = data?.coaches.filter((c) => !c.isFreeAtTime && !c.isCurrentCoach) ?? [];
  const currentCoach = data?.coaches.find((c) => c.isCurrentCoach);
  const orderedCoaches = [
    ...(currentCoach ? [currentCoach] : []),
    ...availableCoaches,
    ...busyCoaches,
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top + Spacing.md }]}>
        <LinearGradient
          colors={["rgba(249,115,22,0.12)", "transparent"]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.header}>
          <View style={styles.dragHandle} />
          <Pressable onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        <View style={styles.titleSection}>
          <View style={styles.titleIcon}>
            <Ionicons name="swap-horizontal" size={22} color={Colors.dark.orange} />
          </View>
          <Text style={styles.title}>Reassign Coach</Text>
          {sessionLabel ? (
            <Text style={styles.subtitle}>{sessionLabel}</Text>
          ) : null}
          {isBatch ? (
            <View style={styles.batchBadge}>
              <Ionicons name="layers" size={12} color={Colors.dark.orange} />
              <Text style={styles.batchBadgeText}>
                Applies to {effectiveIds.length} sessions
              </Text>
            </View>
          ) : null}
        </View>

        {isLoading ? (
          <View style={styles.centered}>
            <TennisBallSpinner size="large" color={Colors.dark.orange} />
            <Text style={styles.loadingText}>Finding available coaches...</Text>
          </View>
        ) : data ? (
          <>
            <ScrollView
              style={styles.list}
              contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 120 }]}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sectionLabel}>
                {availableCoaches.length} available at this time
              </Text>

              {orderedCoaches.map((coach) => {
                const isSelected = selectedCoachId === coach.id;
                const roleColor = ROLE_COLORS[coach.role || "coach"] || Colors.dark.primary;
                const isDisabled = coach.isCurrentCoach || !coach.isFreeAtTime;
                return (
                  <Pressable
                    key={coach.id}
                    style={[
                      styles.coachRow,
                      CardStyles.elevated,
                      isSelected && styles.coachRowSelected,
                      !coach.isFreeAtTime && styles.coachRowConflict,
                      coach.isCurrentCoach && styles.coachRowCurrent,
                    ]}
                    onPress={() => {
                      if (isDisabled) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCoachId(isSelected ? null : coach.id);
                    }}
                    disabled={isDisabled}
                  >
                    <View style={styles.coachAvatar}>
                      <Ionicons name="person" size={20} color={roleColor} />
                    </View>

                    <View style={styles.coachInfo}>
                      <View style={styles.coachNameRow}>
                        <Text style={styles.coachName}>{coach.name}</Text>
                        {coach.isCurrentCoach ? (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentBadgeText}>Current</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.coachMeta}>
                        <View style={[styles.rolePill, { backgroundColor: `${roleColor}20` }]}>
                          <Text style={[styles.rolePillText, { color: roleColor }]}>
                            {ROLE_LABELS[coach.role || "coach"] || "Coach"}
                          </Text>
                        </View>
                        {coach.specialty ? (
                          <Text style={styles.specialtyText}>{coach.specialty}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.loadText}>
                        {coach.sessionsToday} session{coach.sessionsToday !== 1 ? "s" : ""} today
                      </Text>
                    </View>

                    <View style={styles.coachStatus}>
                      {coach.isCurrentCoach ? (
                        <View style={styles.currentIndicator}>
                          <Ionicons name="person" size={16} color={Colors.dark.textMuted} />
                          <Text style={styles.currentIndicatorText}>Assigned</Text>
                        </View>
                      ) : coach.isFreeAtTime ? (
                        <View style={styles.freeIndicator}>
                          <Ionicons name="checkmark-circle" size={18} color={Colors.dark.successNeon} />
                          <Text style={styles.freeText}>Free</Text>
                        </View>
                      ) : (
                        <View style={styles.conflictIndicator}>
                          <Ionicons name="close-circle" size={18} color={Colors.dark.error} />
                          <Text style={styles.conflictText}>Busy</Text>
                        </View>
                      )}
                      {isSelected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color={Colors.dark.orange}
                          style={{ marginTop: 8 }}
                        />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
              <Pressable
                style={[
                  styles.confirmBtn,
                  (!selectedCoachId || reassignMutation.isPending) && styles.confirmBtnDisabled,
                ]}
                onPress={handleConfirm}
                disabled={!selectedCoachId || reassignMutation.isPending}
              >
                {reassignMutation.isPending ? (
                  <TennisBallSpinner size="small" color="#0B0D10" />
                ) : (
                  <Ionicons name="swap-horizontal" size={18} color="#0B0D10" />
                )}
                <Text style={styles.confirmBtnText}>
                  {reassignMutation.isPending
                    ? "Reassigning..."
                    : isBatch
                    ? `Reassign All ${effectiveIds.length} Sessions`
                    : "Confirm Reassignment"}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.border,
    borderRadius: 2,
    marginBottom: Spacing.sm,
  },
  closeBtn: {
    position: "absolute",
    right: Spacing.lg,
    top: 0,
    padding: 4,
  },
  titleSection: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  titleIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: `${Colors.dark.orange}20`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.orange}40`,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: 6,
  },
  batchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${Colors.dark.orange}15`,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: `${Colors.dark.orange}30`,
    marginTop: 4,
  },
  batchBadgeText: {
    fontSize: 12,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  coachRowSelected: {
    borderColor: Colors.dark.orange,
    backgroundColor: `${Colors.dark.orange}10`,
  },
  coachRowConflict: {
    opacity: 0.45,
  },
  coachRowCurrent: {
    opacity: 0.5,
  },
  coachAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  coachInfo: {
    flex: 1,
    gap: 4,
  },
  coachNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  currentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  currentBadgeText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  coachMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  rolePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  specialtyText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  loadText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  coachStatus: {
    alignItems: "center",
    gap: 4,
    minWidth: 56,
  },
  currentIndicator: {
    alignItems: "center",
    gap: 2,
  },
  currentIndicatorText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  freeIndicator: {
    alignItems: "center",
    gap: 2,
  },
  freeText: {
    fontSize: 10,
    color: Colors.dark.successNeon,
    fontWeight: "600",
  },
  conflictIndicator: {
    alignItems: "center",
    gap: 2,
  },
  conflictText: {
    fontSize: 10,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.orange,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    ...Typography.body,
    color: "#0B0D10",
    fontWeight: "700",
  },
});
