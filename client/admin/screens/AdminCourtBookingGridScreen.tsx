import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const NEON = "#C8FF3D";
const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6am - 9pm
const SLOT_HEIGHT = 56;
const COURT_COL_WIDTH = Platform.OS === "web" ? 160 : 130;
const TIME_COL_WIDTH = 52;

interface Court {
  id: string;
  name: string;
  color: string;
}

interface Booking {
  id: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  bookingType: string;
  status: string;
  notes?: string | null;
  playerName?: string | null;
  displayType: "player" | "coaching" | "blocked";
  colorCode: string;
}

interface Session {
  id: string;
  courtId: string;
  startTime: string;
  endTime: string;
  title: string;
  displayType: "coaching";
  colorCode: string;
}

interface CourtBookingsData {
  courts: Court[];
  bookings: Booking[];
  sessions: Session[];
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToPx(mins: number): number {
  return (mins / 60) * SLOT_HEIGHT;
}

function getSlotTop(startTime: string): number {
  const mins = timeToMinutes(startTime);
  const offsetMins = mins - 6 * 60; // offset from 6am
  return minutesToPx(offsetMins);
}

function getSlotHeight(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return minutesToPx(end - start);
}

type BlockReason = "maintenance" | "event" | "private" | "other";

interface BlockSlotState {
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
}

export default function AdminCourtBookingGridScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateStr = formatDate(selectedDate);

  // Modals
  const [blockModal, setBlockModal] = useState<BlockSlotState | null>(null);
  const [blockReason, setBlockReason] = useState<BlockReason>("maintenance");
  const [blockNote, setBlockNote] = useState("");

  const [bookForPlayerModal, setBookForPlayerModal] = useState<{ courtId: string; date: string; startTime: string; endTime: string } | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedPlayerName, setSelectedPlayerName] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const [detailModal, setDetailModal] = useState<Booking | null>(null);

  const { data, isLoading, refetch } = useQuery<CourtBookingsData>({
    queryKey: [`/api/admin/court-bookings?date=${dateStr}`],
  });

  const { data: playersData } = useQuery<{ id: string; firstName: string; lastName: string; academyId: string }[]>({
    queryKey: ["/api/admin/players"],
    enabled: !!bookForPlayerModal,
  });

  const blockMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/admin/court-bookings/block", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/api/admin/court-bookings") });
      setBlockModal(null);
      setBlockNote("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message || "Failed to block slot"),
  });

  const bookForPlayerMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/admin/court-bookings", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/api/admin/court-bookings") });
      setBookForPlayerModal(null);
      setPlayerSearch("");
      setSelectedPlayerId(null);
      setSelectedPlayerName(null);
      setBookingError(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => {
      let msg = e.message || "Failed to book slot";
      const colonIdx = msg.indexOf(": ");
      if (colonIdx !== -1) {
        const body = msg.slice(colonIdx + 2).trim();
        try {
          const parsed = JSON.parse(body);
          msg = parsed.error || parsed.message || msg;
        } catch {}
      }
      setBookingError(msg);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/court-bookings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("/api/admin/court-bookings") });
      setDetailModal(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message || "Failed to cancel"),
  });

  const courts = data?.courts ?? [];
  const bookings = data?.bookings ?? [];
  const sessions = data?.sessions ?? [];

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };

  const getBookingsForCourt = useCallback(
    (courtId: string) => bookings.filter((b) => b.courtId === courtId),
    [bookings]
  );

  const getSessionsForCourt = useCallback(
    (courtId: string) =>
      sessions.filter((s) => s.courtId === courtId),
    [sessions]
  );

  const handleEmptySlotPress = (courtId: string, hour: number) => {
    const startTime = `${String(hour).padStart(2, "0")}:00`;
    const endTime = `${String(hour + 1).padStart(2, "0")}:00`;
    // Show action sheet for "Book for Player" or "Block Slot"
    if (Platform.OS === "web") {
      // On web use simple confirm; in real app would be a sheet
      const choice = window.confirm("Tap OK to book for a player, Cancel to block this slot");
      if (choice) {
        setBookForPlayerModal({ courtId, date: dateStr, startTime, endTime });
      } else {
        setBlockModal({ courtId, date: dateStr, startTime, endTime });
      }
    } else {
      Alert.alert("Empty Slot", `${startTime} — ${endTime}`, [
        { text: "Book for Player", onPress: () => setBookForPlayerModal({ courtId, date: dateStr, startTime, endTime }) },
        { text: "Block Slot", onPress: () => setBlockModal({ courtId, date: dateStr, startTime, endTime }) },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const filteredPlayers = playerSearch.trim()
    ? (playersData ?? []).filter((p) =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(playerSearch.toLowerCase())
      )
    : (playersData ?? []).slice(0, 10);

  const gridHeight = HOURS.length * SLOT_HEIGHT;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Court Bookings</Text>
        <View style={styles.dateNav}>
          <Pressable style={styles.dateNavBtn} onPress={handlePrevDay}>
            <Ionicons name="chevron-back" size={18} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.dateLabel}>{formatDisplayDate(selectedDate)}</Text>
          <Pressable style={styles.dateNavBtn} onPress={handleNextDay}>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.text} />
          </Pressable>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {[
          { color: "#2ECC40", label: "Player Booked" },
          { color: "#0074D9", label: "Coaching" },
          { color: "#FF4136", label: "Blocked" },
          { color: "rgba(255,255,255,0.08)", label: "Available" },
        ].map((l) => (
          <View key={l.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: l.color }]} />
            <Text style={styles.legendText}>{l.label}</Text>
          </View>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={NEON} size="large" />
          <Text style={styles.loadingText}>Loading court schedule...</Text>
        </View>
      ) : courts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="tennisball-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>No courts configured</Text>
          <Text style={styles.emptySubtext}>Add courts in the Courts & Locations settings</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.gridScroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {/* Column headers */}
              <View style={styles.headerRow}>
                <View style={[styles.timeCol, styles.headerCell]}>
                  <Text style={styles.headerCellText}>Time</Text>
                </View>
                {courts.map((court) => (
                  <View key={court.id} style={[styles.courtCol, styles.headerCell]}>
                    <View style={[styles.courtColorDot, { backgroundColor: court.color }]} />
                    <Text style={styles.courtColText} numberOfLines={1}>{court.name}</Text>
                  </View>
                ))}
              </View>

              {/* Grid body */}
              <View style={[styles.gridBody, { height: gridHeight }]}>
                {/* Time column */}
                <View style={styles.timeCol}>
                  {HOURS.map((h) => (
                    <View key={h} style={styles.timeSlot}>
                      <Text style={styles.timeLabel}>
                        {h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Court columns */}
                {courts.map((court) => {
                  const courtBookingsList = getBookingsForCourt(court.id);
                  const courtSessions = getSessionsForCourt(court.id);
                  return (
                    <View key={court.id} style={[styles.courtCol, styles.courtColBody]}>
                      {/* Hourly slot backgrounds */}
                      {HOURS.map((h) => (
                        <Pressable
                          key={h}
                          style={styles.emptySlot}
                          onPress={() => handleEmptySlotPress(court.id, h)}
                        />
                      ))}
                      {/* Coaching sessions */}
                      {courtSessions.map((s) => {
                        const topFraction = (timeToMinutes(s.startTime.substring(11, 16)) - 6 * 60) / 60;
                        const heightFraction = (timeToMinutes(s.endTime.substring(11, 16)) - timeToMinutes(s.startTime.substring(11, 16))) / 60;
                        return (
                          <View
                            key={s.id}
                            style={[
                              styles.bookingBlock,
                              {
                                top: topFraction * SLOT_HEIGHT,
                                height: Math.max(heightFraction * SLOT_HEIGHT - 2, 18),
                                backgroundColor: "rgba(0,116,217,0.3)",
                                borderLeftColor: "#0074D9",
                              },
                            ]}
                            pointerEvents="none"
                          >
                            <Text style={styles.bookingBlockText} numberOfLines={1}>
                              {s.title}
                            </Text>
                          </View>
                        );
                      })}
                      {/* Bookings */}
                      {courtBookingsList.map((b) => {
                        const top = getSlotTop(b.startTime);
                        const height = getSlotHeight(b.startTime, b.endTime);
                        const bgColor =
                          b.displayType === "blocked"
                            ? "rgba(255,65,54,0.25)"
                            : "rgba(46,204,64,0.25)";
                        const borderColor = b.colorCode;
                        return (
                          <Pressable
                            key={b.id}
                            style={[
                              styles.bookingBlock,
                              {
                                top,
                                height: Math.max(height - 2, 18),
                                backgroundColor: bgColor,
                                borderLeftColor: borderColor,
                              },
                            ]}
                            onPress={() => setDetailModal(b)}
                          >
                            <Text style={styles.bookingBlockText} numberOfLines={1}>
                              {b.displayType === "blocked"
                                ? (b.notes ?? "Blocked")
                                : (b.playerName ?? "Booked")}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </ScrollView>
      )}

      {/* Block Slot Modal */}
      <Modal visible={!!blockModal} transparent animationType="slide" onRequestClose={() => setBlockModal(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setBlockModal(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Block Slot</Text>
            {blockModal && (
              <Text style={styles.modalSubtitle}>{blockModal.startTime} — {blockModal.endTime}</Text>
            )}
            <Text style={styles.fieldLabel}>Reason</Text>
            <View style={styles.reasonRow}>
              {(["maintenance", "event", "private", "other"] as BlockReason[]).map((r) => (
                <Pressable
                  key={r}
                  style={[styles.reasonPill, blockReason === r && styles.reasonPillActive]}
                  onPress={() => setBlockReason(r)}
                >
                  <Text style={[styles.reasonPillText, blockReason === r && styles.reasonPillTextActive]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Net replacement"
              placeholderTextColor={Colors.dark.textMuted}
              value={blockNote}
              onChangeText={setBlockNote}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setBlockModal(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, blockMutation.isPending && styles.btnDisabled]}
                onPress={() => {
                  if (!blockModal) return;
                  blockMutation.mutate({
                    courtId: blockModal.courtId,
                    date: blockModal.date,
                    startTime: blockModal.startTime,
                    endTime: blockModal.endTime,
                    reason: blockReason,
                    note: blockNote.trim() || null,
                  });
                }}
              >
                {blockMutation.isPending ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Block Slot</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Book for Player Modal */}
      <Modal visible={!!bookForPlayerModal} transparent animationType="slide" onRequestClose={() => {
        setBookForPlayerModal(null);
        setBookingError(null);
      }}>
        <Pressable style={styles.modalOverlay} onPress={() => {
          setBookForPlayerModal(null);
          setBookingError(null);
        }}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Book for Player</Text>
            {bookForPlayerModal && (
              <Text style={styles.modalSubtitle}>{bookForPlayerModal.date} · {bookForPlayerModal.startTime} — {bookForPlayerModal.endTime}</Text>
            )}
            <Text style={styles.fieldLabel}>Search Player</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Type player name..."
              placeholderTextColor={Colors.dark.textMuted}
              value={playerSearch}
              onChangeText={setPlayerSearch}
            />
            <ScrollView style={styles.playerList} keyboardShouldPersistTaps="handled">
              {filteredPlayers.map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.playerRow, selectedPlayerId === p.id && styles.playerRowSelected]}
                  onPress={() => {
                    setSelectedPlayerId(p.id);
                    setSelectedPlayerName(`${p.firstName} ${p.lastName}`);
                  }}
                >
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerAvatarText}>{p.firstName[0]}</Text>
                  </View>
                  <Text style={styles.playerName}>{p.firstName} {p.lastName}</Text>
                  {selectedPlayerId === p.id && (
                    <Ionicons name="checkmark-circle" size={18} color={NEON} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
            {bookingError ? (
              <View style={styles.inlineError}>
                <Ionicons name="alert-circle-outline" size={15} color="#FF6B6B" style={{ marginRight: 6 }} />
                <Text style={styles.inlineErrorText}>{bookingError}</Text>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => {
                setBookForPlayerModal(null);
                setSelectedPlayerId(null);
                setSelectedPlayerName(null);
                setPlayerSearch("");
                setBookingError(null);
              }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, (!selectedPlayerId || bookForPlayerMutation.isPending) && styles.btnDisabled]}
                onPress={() => {
                  if (!bookForPlayerModal || !selectedPlayerId) return;
                  setBookingError(null);
                  const [startH, startM] = bookForPlayerModal.startTime.split(":").map(Number);
                  const [endH, endM] = bookForPlayerModal.endTime.split(":").map(Number);
                  const duration = (endH * 60 + endM) - (startH * 60 + startM);
                  bookForPlayerMutation.mutate({
                    courtId: bookForPlayerModal.courtId,
                    playerId: selectedPlayerId,
                    date: bookForPlayerModal.date,
                    startTime: bookForPlayerModal.startTime,
                    endTime: bookForPlayerModal.endTime,
                    durationMinutes: duration > 0 ? duration : 60,
                  });
                }}
              >
                {bookForPlayerMutation.isPending ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Confirm Booking</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Booking Detail Modal */}
      <Modal visible={!!detailModal} transparent animationType="fade" onRequestClose={() => setDetailModal(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDetailModal(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            {detailModal && (
              <>
                <Text style={styles.modalTitle}>
                  {detailModal.displayType === "blocked" ? "Blocked Slot" :
                    detailModal.displayType === "coaching" ? "Coaching Session" : "Court Booking"}
                </Text>
                <View style={styles.detailRow}>
                  <Ionicons name="time-outline" size={16} color={Colors.dark.textMuted} />
                  <Text style={styles.detailText}>{detailModal.startTime} — {detailModal.endTime}</Text>
                </View>
                {detailModal.playerName && (
                  <View style={styles.detailRow}>
                    <Ionicons name="person-outline" size={16} color={Colors.dark.textMuted} />
                    <Text style={styles.detailText}>{detailModal.playerName}</Text>
                  </View>
                )}
                {detailModal.notes && (
                  <View style={styles.detailRow}>
                    <Ionicons name="document-text-outline" size={16} color={Colors.dark.textMuted} />
                    <Text style={styles.detailText}>{detailModal.notes}</Text>
                  </View>
                )}
                <View style={[styles.detailStatus, { backgroundColor: `${detailModal.colorCode}22` }]}>
                  <View style={[styles.detailStatusDot, { backgroundColor: detailModal.colorCode }]} />
                  <Text style={[styles.detailStatusText, { color: detailModal.colorCode }]}>
                    {detailModal.displayType === "blocked" ? "Blocked" :
                      detailModal.displayType === "coaching" ? "Coaching" : "Confirmed"}
                  </Text>
                </View>
                <View style={styles.modalActions}>
                  <Pressable style={styles.cancelBtn} onPress={() => setDetailModal(null)}>
                    <Text style={styles.cancelBtnText}>Close</Text>
                  </Pressable>
                  {detailModal.displayType !== "coaching" && (
                    <Pressable
                      style={[styles.destructiveBtn, cancelMutation.isPending && styles.btnDisabled]}
                      onPress={() => {
                        Alert.alert(
                          "Cancel Booking",
                          "Are you sure you want to cancel this booking?",
                          [
                            { text: "No", style: "cancel" },
                            { text: "Yes, Cancel", style: "destructive", onPress: () => cancelMutation.mutate(detailModal.id) },
                          ]
                        );
                      }}
                    >
                      {cancelMutation.isPending ? (
                        <ActivityIndicator color="#FF4136" size="small" />
                      ) : (
                        <Text style={styles.destructiveBtnText}>
                          {detailModal.displayType === "blocked" ? "Unblock" : "Cancel Booking"}
                        </Text>
                      )}
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0D10",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 20,
    fontWeight: "700",
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dateNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  dateLabel: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "600",
    minWidth: 120,
    textAlign: "center",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textMuted,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  emptyText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubtext: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    textAlign: "center",
  },
  gridScroll: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#111318",
  },
  headerCell: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.05)",
  },
  headerCellText: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  timeCol: {
    width: TIME_COL_WIDTH,
  },
  courtCol: {
    width: COURT_COL_WIDTH,
  },
  courtColText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  },
  courtColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gridBody: {
    flexDirection: "row",
  },
  courtColBody: {
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.05)",
    position: "relative",
    overflow: "hidden",
  },
  timeSlot: {
    height: SLOT_HEIGHT,
    justifyContent: "flex-start",
    paddingTop: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  timeLabel: {
    color: Colors.dark.textMuted,
    fontSize: 10,
    textAlign: "right",
  },
  emptySlot: {
    height: SLOT_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
    backgroundColor: "transparent",
  },
  bookingBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: BorderRadius.xs,
    borderLeftWidth: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    justifyContent: "flex-start",
    overflow: "hidden",
  },
  bookingBlockText: {
    color: Colors.dark.text,
    fontSize: 10,
    fontWeight: "600",
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#161A1F",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  modalTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalSubtitle: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: Spacing.sm,
  },
  reasonRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  reasonPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  reasonPillActive: {
    backgroundColor: "rgba(200,255,61,0.12)",
    borderColor: "rgba(200,255,61,0.4)",
  },
  reasonPillText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
  reasonPillTextActive: {
    color: NEON,
    fontWeight: "600",
  },
  textInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: Colors.dark.text,
    fontSize: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  playerList: {
    maxHeight: 200,
    marginTop: 6,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  playerRowSelected: {
    backgroundColor: "rgba(200,255,61,0.06)",
  },
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,133,27,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  playerAvatarText: {
    color: Colors.dark.orange,
    fontSize: 13,
    fontWeight: "700",
  },
  playerName: {
    color: Colors.dark.text,
    fontSize: 14,
    flex: 1,
  },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,107,107,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.3)",
    borderRadius: BorderRadius.sm,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: Spacing.sm,
  },
  inlineErrorText: {
    color: "#FF6B6B",
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cancelBtnText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    backgroundColor: NEON,
    alignItems: "center",
  },
  confirmBtnText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "700",
  },
  destructiveBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,65,54,0.15)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,65,54,0.3)",
  },
  destructiveBtnText: {
    color: "#FF4136",
    fontSize: 14,
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  detailText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
  detailStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    marginTop: 4,
  },
  detailStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailStatusText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
