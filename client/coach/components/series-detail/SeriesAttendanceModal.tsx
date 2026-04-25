import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Spacing , GlowColors } from "@/constants/theme";
import { styles } from "./seriesDetailStyles";
import type { Player, SessionInstance, SeriesDetail, CoachOption } from "./types";

interface SeriesAttendanceModalProps {
  visible: boolean;
  onClose: () => void;
  attendanceModalView: "attendance" | "transfer";
  setAttendanceModalView: (view: "attendance" | "transfer") => void;
  selectedTargetCoachId: string | null;
  setSelectedTargetCoachId: (id: string | null) => void;
  loadingAttendance: boolean;
  selectedSession: SessionInstance | null;
  series: SeriesDetail | null;
  sessionAttendance: Record<string, string>;
  isPlayerActiveForSession: (player: Player, date: Date) => boolean;
  coaches: CoachOption[];
  currentCoachId: string | undefined;
  handleSetAttendance: (playerId: string, status: string) => void;
  handleSaveAttendance: () => void;
  handleCancelSession: () => void;
  handleDeleteSession: () => void;
  onTransfer: (sessionId: string, targetCoachId: string) => void;
  savingAttendance: boolean;
  cancellingSession: boolean;
  deletingSession: boolean;
  transferringSession: boolean;
  setTransferringSession: (v: boolean) => void;
  formatDate: (date: string | Date) => string;
}

export function SeriesAttendanceModal({
  visible,
  onClose,
  attendanceModalView,
  setAttendanceModalView,
  selectedTargetCoachId,
  setSelectedTargetCoachId,
  loadingAttendance,
  selectedSession,
  series,
  sessionAttendance,
  isPlayerActiveForSession,
  coaches,
  currentCoachId,
  handleSetAttendance,
  handleSaveAttendance,
  handleCancelSession,
  handleDeleteSession,
  onTransfer,
  savingAttendance,
  cancellingSession,
  deletingSession,
  transferringSession,
  setTransferringSession,
  formatDate,
}: SeriesAttendanceModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        onClose();
        setAttendanceModalView("attendance");
        setSelectedTargetCoachId(null);
      }}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={() => {
          onClose();
          setAttendanceModalView("attendance");
          setSelectedTargetCoachId(null);
        }} />
        <View style={[styles.drawer, { paddingTop: Spacing.xl, paddingHorizontal: Spacing.lg }]}>
          <View style={styles.attendanceModalHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
              {attendanceModalView === "transfer" && (
                <Pressable
                  onPress={() => {
                    setAttendanceModalView("attendance");
                    setSelectedTargetCoachId(null);
                  }}
                  style={{ marginRight: Spacing.xs }}
                >
                  <Ionicons name="arrow-back" size={24} color={Colors.dark.accentCyan} />
                </Pressable>
              )}
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                  {attendanceModalView === "transfer" && (
                    <Ionicons name="swap-horizontal" size={20} color={Colors.dark.accentCyan} />
                  )}
                  <Text style={styles.attendanceModalTitle}>
                    {attendanceModalView === "transfer" ? "Transfer Session" : "Mark Attendance"}
                  </Text>
                  {loadingAttendance && attendanceModalView === "attendance" ? (
                    <ActivityIndicator size="small" color={Colors.dark.accentNeon} />
                  ) : null}
                </View>
                {selectedSession ? (
                  <Text style={styles.attendanceModalDate}>
                    {formatDate(selectedSession.startTime)} - Week {selectedSession.weekNumber || ([...(series?.sessions || [])].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).findIndex(s => s.id === selectedSession.id) + 1)}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable onPress={() => {
              onClose();
              setAttendanceModalView("attendance");
              setSelectedTargetCoachId(null);
            }}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          {attendanceModalView === "attendance" ? (
            <ScrollView style={{ flex: 1 }}>
              {(() => {
                const sessionDate = selectedSession ? new Date(selectedSession.startTime) : new Date();
                const activePlayers = (series?.players || []).filter(p => isPlayerActiveForSession(p, sessionDate));
                const presentCount = Object.values(sessionAttendance).filter(s => s === "present").length;
                const sessionType = series?.sessionType || "group";

                let creditTypeHint = "";
                let isPrivateCharge = false;
                if (sessionType === "semi_private" || sessionType === "semi") {
                  if (activePlayers.length === 1) {
                    creditTypeHint = "Only 1 player in group - charged as private lesson";
                    isPrivateCharge = true;
                  } else if (presentCount === 1) {
                    creditTypeHint = "Only 1 player present - charged as private lesson";
                    isPrivateCharge = true;
                  } else if (presentCount >= 2) {
                    creditTypeHint = "Semi-private credits will be charged";
                    isPrivateCharge = false;
                  }
                }

                return (
                  <>
                    {activePlayers.map((player) => {
                      const status = sessionAttendance[player.id] || "present";
                      return (
                        <View key={player.id} style={styles.attendancePlayerRow}>
                          <View style={styles.attendancePlayerInfo}>
                            <View style={styles.attendancePlayerAvatar}>
                              <Text style={styles.attendancePlayerInitial}>
                                {player.name.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <Text style={styles.attendancePlayerName}>{player.name}</Text>
                          </View>
                          <View style={styles.attendanceToggle}>
                            <Pressable
                              style={[styles.attendanceToggleOption, status === "present" && styles.attendanceToggleActive]}
                              onPress={() => handleSetAttendance(player.id, "present")}
                            >
                              <Text style={[styles.attendanceToggleText, status === "present" && styles.attendanceToggleTextActive]}>
                                Present
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[styles.attendanceToggleOption, status === "absent" && styles.attendanceToggleAbsent]}
                              onPress={() => handleSetAttendance(player.id, "absent")}
                            >
                              <Text style={[styles.attendanceToggleText, status === "absent" && styles.attendanceToggleTextActive]}>
                                Absent
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[styles.attendanceToggleOption, status === "vacation" && styles.attendanceToggleVacation]}
                              onPress={() => handleSetAttendance(player.id, "vacation")}
                            >
                              <Text style={[styles.attendanceToggleText, status === "vacation" && styles.attendanceToggleTextActive]}>
                                Vacation
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}

                    {creditTypeHint ? (
                      <View style={[
                        styles.creditHintBox,
                        isPrivateCharge ? styles.creditHintBoxPrivate : styles.creditHintBoxSemi
                      ]}>
                        <Ionicons
                          name={isPrivateCharge ? "person" : "people"}
                          size={16}
                          color={isPrivateCharge ? Colors.dark.sessionPrivate : Colors.dark.sessionSemiPrivate}
                        />
                        <Text style={[
                          styles.creditHint,
                          isPrivateCharge ? styles.creditHintPrivate : styles.creditHintSemi
                        ]}>
                          {creditTypeHint}
                        </Text>
                      </View>
                    ) : null}
                  </>
                );
              })()}

              <View style={styles.attendanceActions}>
                <Pressable
                  style={[styles.saveButton, (savingAttendance || cancellingSession) && styles.saveButtonDisabled]}
                  onPress={handleSaveAttendance}
                  disabled={savingAttendance || cancellingSession}
                >
                  <Text style={styles.saveButtonText}>
                    {savingAttendance ? "Saving..." : "Save Attendance"}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.cancelSessionButton, (savingAttendance || cancellingSession) && styles.saveButtonDisabled]}
                  onPress={handleCancelSession}
                  disabled={savingAttendance || cancellingSession}
                >
                  <Text style={styles.cancelSessionButtonText}>
                    {cancellingSession ? "Cancelling..." : "Cancel Session (Holiday/No Class)"}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.transferButton, (savingAttendance || cancellingSession) && styles.saveButtonDisabled]}
                  onPress={() => {
                    setAttendanceModalView("transfer");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  disabled={savingAttendance || cancellingSession}
                >
                  <Ionicons name="swap-horizontal" size={18} color={Colors.dark.text} />
                  <Text style={styles.transferButtonText}>Transfer to Another Coach</Text>
                </Pressable>

                <Pressable
                  style={[styles.deleteSessionButton, (savingAttendance || cancellingSession || deletingSession) && styles.saveButtonDisabled]}
                  onPress={() => {
                    Alert.alert(
                      "Delete Session",
                      "Are you sure you want to permanently delete this session? This will remove it from the calendar and refund any credits used. This cannot be undone.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: handleDeleteSession }
                      ]
                    );
                  }}
                  disabled={savingAttendance || cancellingSession || deletingSession}
                >
                  <Ionicons name="trash-outline" size={18} color="#FF4444" />
                  <Text style={styles.deleteSessionButtonText}>
                    {deletingSession ? "Deleting..." : "Delete Session Permanently"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={styles.transferInfoCard}>
                <Ionicons name="information-circle" size={18} color={Colors.dark.accentCyan} />
                <Text style={styles.transferInfoText}>
                  The session will be removed from your calendar and added to the selected coach&apos;s calendar.
                </Text>
              </View>

              <Text style={styles.transferSectionLabel}>Select Coach</Text>

              <ScrollView style={styles.transferCoachList} showsVerticalScrollIndicator={false}>
                {coaches.filter(c => c.id !== currentCoachId).length === 0 ? (
                  <View style={styles.noCoachesContainer}>
                    <Ionicons name="people-outline" size={40} color={Colors.dark.textMuted} />
                    <Text style={styles.noCoachesText}>No other coaches available</Text>
                  </View>
                ) : (
                  coaches.filter(c => c.id !== currentCoachId).map((coach) => (
                    <Pressable
                      key={coach.id}
                      style={[
                        styles.transferCoachCard,
                        selectedTargetCoachId === coach.id && styles.transferCoachCardActive,
                      ]}
                      onPress={() => {
                        setSelectedTargetCoachId(coach.id);
                        Haptics.selectionAsync();
                      }}
                    >
                      <LinearGradient
                        colors={selectedTargetCoachId === coach.id
                          ? [Colors.dark.accentCyan + "25", Colors.dark.accentCyan + "10"]
                          : ["transparent", "transparent"]
                        }
                        style={StyleSheet.absoluteFillObject}
                      />
                      <View style={[
                        styles.transferCoachAvatar,
                        selectedTargetCoachId === coach.id && styles.transferCoachAvatarActive,
                      ]}>
                        <Text style={[
                          styles.transferCoachAvatarText,
                          selectedTargetCoachId === coach.id && styles.transferCoachAvatarTextActive,
                        ]}>
                          {coach.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.transferCoachInfo}>
                        <Text style={styles.transferCoachName}>{coach.name}</Text>
                        <Text style={styles.transferCoachRole}>Coach</Text>
                      </View>
                      {selectedTargetCoachId === coach.id ? (
                        <View style={styles.transferCheckmark}>
                          <Ionicons name="checkmark" size={16} color={"rgba(255, 255, 255, 0.06)"} />
                        </View>
                      ) : (
                        <View style={styles.transferRadio} />
                      )}
                    </Pressable>
                  ))
                )}
              </ScrollView>

              <View style={styles.transferActions}>
                <Pressable
                  style={[
                    styles.transferConfirmButton,
                    (!selectedTargetCoachId || transferringSession) && styles.transferConfirmButtonDisabled,
                  ]}
                  onPress={() => {
                    if (selectedSession && selectedTargetCoachId) {
                      setTransferringSession(true);
                      onTransfer(selectedSession.id, selectedTargetCoachId);
                    }
                  }}
                  disabled={!selectedTargetCoachId || transferringSession}
                >
                  <LinearGradient
                    colors={!selectedTargetCoachId || transferringSession
                      ? ["rgba(255, 255, 255, 0.04)", "rgba(255, 255, 255, 0.04)"]
                      : [GlowColors.primary, GlowColors.soft]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.transferConfirmGradient}
                  >
                    <Ionicons
                      name={transferringSession ? "hourglass" : "swap-horizontal"}
                      size={20}
                      color={!selectedTargetCoachId || transferringSession ? Colors.dark.textMuted : "rgba(255, 255, 255, 0.06)"}
                    />
                    <Text style={[
                      styles.transferConfirmText,
                      (!selectedTargetCoachId || transferringSession) && styles.transferConfirmTextDisabled,
                    ]}>
                      {transferringSession ? "Transferring..." : "Confirm Transfer"}
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
