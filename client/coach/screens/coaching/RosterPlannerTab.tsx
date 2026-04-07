import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { convertUTCTimeToLocal } from "@/lib/dateUtils";
import { apiRequest } from "@/lib/query-client";
import type { TabProps } from "./types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type FilterMode = "all" | "has_space" | "full";

interface PlayerPreview {
  id: string;
  name: string;
  ballLevel: string | null;
}

interface Series {
  id: string;
  title: string;
  status: string;
  startTime: string;
  dayOfWeek: number;
  sessionType: string | null;
  playerCount: number;
  maxPlayers: number;
  pausedCount: number;
  playerPreview: PlayerPreview[];
  primaryBallLevel: string | null;
}

interface MoveTarget {
  playerId: string;
  playerName: string;
  fromSeriesId: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getSessionTypeColor(type: string | null | undefined): string {
  switch (type) {
    case "group": return Colors.dark.orange;
    case "private": return Colors.dark.successNeon;
    case "semi_private": return Colors.dark.xpCyan;
    default: return Colors.dark.primary;
  }
}

export function RosterPlannerTab({ insets, tabBarHeight }: TabProps) {
  const { academy } = useCoach();
  const queryClient = useQueryClient();
  const tz = academy?.timezone || "Asia/Dubai";

  const [filter, setFilter] = useState<FilterMode>("all");
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [moving, setMoving] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<Series | null>(null);
  const [completing, setCompleting] = useState(false);

  const { data: allSeries, isLoading } = useQuery<Series[]>({
    queryKey: ["/api/coach/series"],
  });

  const activeSeries = useMemo(() => {
    if (!allSeries) return [];
    return allSeries.filter((s) => s.status === "active");
  }, [allSeries]);

  const filteredSeries = useMemo(() => {
    return activeSeries.filter((s) => {
      const isFull = s.playerCount >= s.maxPlayers;
      if (filter === "has_space") return !isFull;
      if (filter === "full") return isFull;
      return true;
    });
  }, [activeSeries, filter]);

  const handleMovePress = (player: PlayerPreview, fromSeriesId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMoveTarget({ playerId: player.id, playerName: player.name, fromSeriesId });
  };

  const handleMoveConfirm = async (toSeries: Series) => {
    if (!moveTarget) return;
    if (toSeries.id === moveTarget.fromSeriesId) return;
    if (toSeries.playerCount >= toSeries.maxPlayers) return;

    setMoving(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      await apiRequest("POST", `/api/coach/series/${moveTarget.fromSeriesId}/players/${moveTarget.playerId}/leave`);
      await apiRequest("POST", `/api/coach/series/${toSeries.id}/players`, {
        playerId: moveTarget.playerId,
        joinDate: today,
        attendedSessionIds: [],
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      setMoveTarget(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Moved", `${moveTarget.playerName} moved to ${toSeries.title}`);
    } catch (error) {
      console.error("Error moving player:", error);
      Alert.alert("Error", "Failed to move player. Please try again.");
    } finally {
      setMoving(false);
    }
  };

  const handleCompleteConfirm = async () => {
    if (!completeTarget) return;
    setCompleting(true);
    try {
      await apiRequest("POST", `/api/coach/series/${completeTarget.id}/end`);
      await queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      setCompleteTarget(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error completing series:", error);
      Alert.alert("Error", "Failed to complete class. Please try again.");
    } finally {
      setCompleting(false);
    }
  };

  const renderSeriesCard = ({ item: series }: { item: Series }) => {
    const isFull = series.playerCount >= series.maxPlayers;
    const accentColor = getSessionTypeColor(series.sessionType);
    const localTime = convertUTCTimeToLocal(series.startTime, tz);
    const dayLabel = DAY_NAMES[series.dayOfWeek] ?? "";

    return (
      <View style={styles.card}>
        <View style={[styles.cardAccentBar, { backgroundColor: accentColor }]} />

        <View style={styles.cardInner}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {series.title}
            </Text>
            <View style={[styles.capacityBadge, { backgroundColor: isFull ? Colors.dark.error + "30" : Colors.dark.successNeon + "20" }]}>
              <Text style={[styles.capacityText, { color: isFull ? Colors.dark.error : Colors.dark.successNeon }]}>
                {series.playerCount} / {series.maxPlayers}
              </Text>
            </View>
          </View>

          <Text style={styles.cardSubtitle}>
            {dayLabel} {localTime}
            {series.pausedCount > 0 ? `  ·  ${series.pausedCount} on hold` : ""}
          </Text>

          {series.playerPreview.length === 0 ? (
            <Text style={styles.emptyPlayersText}>No active players</Text>
          ) : (
            series.playerPreview.map((player) => (
              <View key={player.id} style={styles.playerRow}>
                <View style={[styles.avatar, { backgroundColor: accentColor + "40" }]}>
                  <Text style={[styles.avatarText, { color: accentColor }]}>
                    {getInitials(player.name)}
                  </Text>
                </View>
                <Text style={styles.playerName} numberOfLines={1}>
                  {player.name}
                </Text>
                <Pressable
                  style={styles.moveBtn}
                  onPress={() => handleMovePress(player, series.id)}
                >
                  <Ionicons
                    name="arrow-forward-circle-outline"
                    size={26}
                    color={Colors.dark.successNeon}
                  />
                </Pressable>
              </View>
            ))
          )}

          <Pressable
            style={styles.completeBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setCompleteTarget(series);
            }}
          >
            <Ionicons name="trash-outline" size={14} color={Colors.dark.error} />
            <Text style={styles.completeBtnText}>Complete Class</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterBar}
      >
        {(["all", "has_space", "full"] as FilterMode[]).map((f) => {
          const labels: Record<FilterMode, string> = {
            all: "All",
            has_space: "Has Space",
            full: "Full",
          };
          const isActive = filter === f;
          return (
            <Pressable
              key={f}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFilter(f);
              }}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {labels[f]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Summary line */}
      {!isLoading && (
        <View style={styles.summaryRow}>
          <Ionicons name="people-outline" size={13} color={Colors.dark.textMuted} />
          <Text style={styles.summaryText}>
            {filteredSeries.length} class{filteredSeries.length !== 1 ? "es" : ""}
            {" · "}
            {filteredSeries.reduce((acc, s) => acc + s.playerCount, 0)} players
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.dark.primary} size="large" />
        </View>
      ) : filteredSeries.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="layers-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No active classes</Text>
          <Text style={styles.emptySubtitle}>
            {filter !== "all" ? "Try switching to 'All'" : "Create a class to get started"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredSeries}
          keyExtractor={(item) => item.id}
          renderItem={renderSeriesCard}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarHeight + insets.bottom + Spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Move player modal */}
      <Modal
        visible={!!moveTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setMoveTarget(null)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setMoveTarget(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Move player</Text>
            <Text style={styles.sheetSubtitle}>{moveTarget?.playerName}</Text>

            {moving ? (
              <View style={styles.centered}>
                <ActivityIndicator color={Colors.dark.primary} />
                <Text style={styles.movingText}>Moving...</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {activeSeries
                  .filter((s) => s.id !== moveTarget?.fromSeriesId)
                  .map((s) => {
                    const isFull = s.playerCount >= s.maxPlayers;
                    const localTime = convertUTCTimeToLocal(s.startTime, tz);
                    const dayLabel = DAY_NAMES[s.dayOfWeek] ?? "";
                    return (
                      <Pressable
                        key={s.id}
                        style={[styles.targetRow, isFull && styles.targetRowFull]}
                        onPress={() => {
                          if (!isFull) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            handleMoveConfirm(s);
                          }
                        }}
                        disabled={isFull}
                      >
                        <View style={styles.targetInfo}>
                          <Text style={[styles.targetName, isFull && styles.targetNameFull]} numberOfLines={1}>
                            {s.title}
                          </Text>
                          <Text style={styles.targetTime}>
                            {dayLabel} {localTime}
                          </Text>
                        </View>
                        <View style={styles.targetCapacityGroup}>
                          <View style={[
                            styles.targetCapacity,
                            { backgroundColor: isFull ? Colors.dark.error + "20" : Colors.dark.successNeon + "20" }
                          ]}>
                            <Text style={[
                              styles.targetCapacityText,
                              { color: isFull ? Colors.dark.error : Colors.dark.successNeon }
                            ]}>
                              {`${s.playerCount}/${s.maxPlayers}`}
                            </Text>
                          </View>
                          {isFull ? (
                            <View style={styles.fullTag}>
                              <Text style={styles.fullTagText}>Full</Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
              </ScrollView>
            )}

            <Pressable style={styles.cancelBtn} onPress={() => setMoveTarget(null)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Complete class confirm modal */}
      <Modal
        visible={!!completeTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setCompleteTarget(null)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Complete Class</Text>
            <Text style={styles.confirmBody}>
              {`"${completeTarget?.title}" will be archived and no new sessions will be scheduled. You can still view history.`}
            </Text>
            <View style={styles.confirmButtons}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnCancel]}
                onPress={() => setCompleteTarget(null)}
                disabled={completing}
              >
                <Text style={styles.confirmBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnConfirm]}
                onPress={handleCompleteConfirm}
                disabled={completing}
              >
                {completing ? (
                  <ActivityIndicator size="small" color={Colors.dark.error} />
                ) : (
                  <Text style={styles.confirmBtnConfirmText}>Complete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  filterBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  filterChipActive: {
    backgroundColor: Colors.dark.primary + "25",
    borderColor: Colors.dark.primary,
  },
  filterChipText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: Colors.dark.primary,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  summaryText: {
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    flexDirection: "row",
  },
  cardAccentBar: {
    width: 4,
  },
  cardInner: {
    flex: 1,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  cardTitle: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
    marginRight: Spacing.sm,
  },
  capacityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  capacityText: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardSubtitle: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginBottom: Spacing.sm,
  },
  emptyPlayersText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontStyle: "italic",
    paddingVertical: Spacing.sm,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "700",
  },
  playerName: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  moveBtn: {
    padding: 4,
  },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  completeBtnText: {
    color: Colors.dark.error,
    fontSize: 13,
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: 17,
    fontWeight: "700",
    marginTop: Spacing.sm,
  },
  emptySubtitle: {
    color: Colors.dark.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  sheet: {
    backgroundColor: "#141C27",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 32,
    paddingTop: Spacing.md,
    maxHeight: "75%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    color: Colors.dark.text,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  sheetSubtitle: {
    color: Colors.dark.primary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  movingText: {
    color: Colors.dark.textMuted,
    fontSize: 14,
    marginTop: Spacing.sm,
  },
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  targetRowFull: {
    opacity: 0.4,
  },
  targetInfo: {
    flex: 1,
  },
  targetName: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "600",
  },
  targetNameFull: {
    color: Colors.dark.textMuted,
  },
  targetTime: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  targetCapacityGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: Spacing.sm,
  },
  targetCapacity: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  targetCapacityText: {
    fontSize: 12,
    fontWeight: "700",
  },
  fullTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: Colors.dark.error,
  },
  fullTagText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  cancelBtn: {
    marginTop: Spacing.md,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
  },
  cancelBtnText: {
    color: Colors.dark.textMuted,
    fontSize: 15,
    fontWeight: "600",
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  confirmCard: {
    backgroundColor: "#1A2332",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  confirmTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  confirmBody: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 22,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 12,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnCancel: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  confirmBtnCancelText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 15,
    fontWeight: "600",
  },
  confirmBtnConfirm: {
    backgroundColor: Colors.dark.error + "25",
    borderWidth: 1,
    borderColor: Colors.dark.error,
  },
  confirmBtnConfirmText: {
    color: Colors.dark.error,
    fontSize: 15,
    fontWeight: "700",
  },
});
