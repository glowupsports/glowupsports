import React, { useState, useEffect } from "react";
import { View, Text, Pressable, Modal, ActivityIndicator, Alert, Platform, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import { Colors, Spacing } from "@/constants/theme";
import { convertUTCTimeToLocal } from "@/lib/dateUtils";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { invalidatePlayersList } from "@/lib/credit-cache";
import { styles } from "./playersStyles";

interface AttendanceHistoryRecord {
  sessionId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  status: string | null;
  lateMinutes: number | null;
  sessionStatus: string | null;
  seriesId?: string | null;
  seriesDayOfWeek?: number | null;
  seriesTitle?: string | null;
  // Task #817: per-lesson credit charge from the V2/V1 ledger.
  creditsCharged?: number;
  creditChargeCount?: number;
  creditChargeType?: string | null;
}

interface SeriesAttendanceSummary {
  seriesId: string;
  dayOfWeek: number;
  dayName: string;
  startTime: string;
  title: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
}

interface AttendanceHistoryResponse {
  history: AttendanceHistoryRecord[];
  seriesSummaries: SeriesAttendanceSummary[];
}

interface Props {
  playerId: string;
  playerName: string;
  tz: string;
  hideHeader?: boolean;
}

export function PlayerAttendanceSection({ playerId, playerName, tz, hideHeader = false }: Props) {
  const queryClient = useQueryClient();
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [expandedSeriesIds, setExpandedSeriesIds] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<"all" | "private" | "semi" | "group">("all");

  const normalizeSessionType = (raw: string): "private" | "semi" | "group" => {
    const lower = (raw ?? "").toLowerCase();
    if (lower === "group") return "group";
    if (lower.startsWith("semi") || lower.includes("semi")) return "semi";
    return "private";
  };
  const [editingAttendance, setEditingAttendance] = useState<AttendanceHistoryRecord | null>(null);
  const [isUpdatingAttendance, setIsUpdatingAttendance] = useState(false);
  const [isExportingAttendanceReport, setIsExportingAttendanceReport] = useState(false);
  const [isSharingAttendanceLink, setIsSharingAttendanceLink] = useState(false);
  const [isSendingMonthlyReport, setIsSendingMonthlyReport] = useState(false);

  const { data: attendanceData } = useQuery<AttendanceHistoryResponse>({
    queryKey: [`/api/coach/players/${playerId}/attendance-history`],
  });
  const attendanceHistory = attendanceData?.history || [];
  const seriesAttendanceSummaries = attendanceData?.seriesSummaries || [];

  interface SessionRatingRecord {
    rating: number;
    comment: string | null;
    createdAt: Date | null;
  }
  const { data: sessionRatingsData } = useQuery<{ ratings: Record<string, SessionRatingRecord> }>({
    queryKey: [`/api/coach/players/${playerId}/session-ratings`],
    enabled: attendanceHistory.length > 0,
  });
  const sessionRatingsMap = sessionRatingsData?.ratings ?? {};

  const filteredHistory = typeFilter === "all"
    ? attendanceHistory
    : attendanceHistory.filter(r => normalizeSessionType(r.sessionType) === typeFilter);

  const seriesIdKey = seriesAttendanceSummaries.map(s => s.seriesId).sort().join(',');
  useEffect(() => {
    if (seriesAttendanceSummaries.length > 0) {
      setExpandedSeriesIds(new Set(seriesAttendanceSummaries.map(s => s.seriesId)));
    }
  }, [seriesIdKey]);

  useEffect(() => {
    setShowAllHistory(false);
    if (typeFilter !== "all" && seriesAttendanceSummaries.length > 1) {
      const matchingSeriesIds = new Set(
        filteredHistory.map(r => r.seriesId).filter(Boolean) as string[]
      );
      setExpandedSeriesIds(matchingSeriesIds);
    }
  }, [typeFilter, filteredHistory.length, seriesAttendanceSummaries.length]);

  const formatAttendanceDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: tz });
  };

  const formatAttendanceTime = (timeStr: string | null) => {
    if (!timeStr) return "";
    try {
      const d = new Date(timeStr);
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
    } catch {
      return "";
    }
  };

  const formatSeriesTime = (utcTime: string) => convertUTCTimeToLocal(utcTime, tz);

  const updateAttendanceMutation = useMutation({
    mutationFn: async ({ sessionId, newStatus }: { sessionId: string; newStatus: string }) => {
      const response = await fetch(
        new URL(`/api/coach/players/${playerId}/sessions/${sessionId}/attendance`, getApiUrl()).toString(),
        {
          method: "PATCH",
          credentials: "include",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ newStatus }),
        }
      );
      if (!response.ok) throw new Error("Failed to update attendance");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/players/${playerId}/attendance-history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/coach/players/${playerId}/attendance-summary`] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credit-balance`] });
      // Task #930 — attendance edits change credit balances; refresh the
      // coach Players list pill immediately.
      invalidatePlayersList(queryClient);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingAttendance(null);
      setIsUpdatingAttendance(false);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsUpdatingAttendance(false);
      Alert.alert("Error", "Failed to update attendance");
    },
  });

  const handleExportAttendanceReport = async () => {
    try {
      setIsExportingAttendanceReport(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const response = await fetch(new URL(`/api/players/${playerId}/attendance-report`, getApiUrl()).toString(), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Failed to generate attendance report");
      const html = await response.text();
      const safeName = playerName.replace(/[^a-zA-Z0-9]/g, "_");
      if (Platform.OS === "web") {
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeName}_Attendance_Report.html`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const newUri = `${FileSystem.cacheDirectory}${safeName}_Attendance_Report_${Date.now()}.pdf`;
        await FileSystem.moveAsync({ from: uri, to: newUri });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(newUri, { mimeType: "application/pdf", dialogTitle: `${playerName} Attendance Report`, UTI: "com.adobe.pdf" });
        } else {
          await Print.printAsync({ uri: newUri });
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Failed to generate attendance report. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsExportingAttendanceReport(false);
    }
  };

  const handleShareAttendanceLink = async () => {
    try {
      setIsSharingAttendanceLink(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const response = await fetch(
        new URL(`/api/players/${playerId}/attendance-share-token`, getApiUrl()).toString(),
        { method: "POST", credentials: "include", headers: getAuthHeaders() },
      );
      if (!response.ok) throw new Error("Failed to generate share link");
      const { shareUrl } = await response.json();
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(shareUrl);
        Alert.alert("Link Copied", "Attendance link copied to clipboard. Share it with the player or parent.");
      } else {
        const { Share } = await import("react-native");
        await Share.share({ message: `${playerName}'s attendance report: ${shareUrl}`, url: shareUrl, title: `${playerName} Attendance` });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Failed to generate share link. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSharingAttendanceLink(false);
    }
  };

  const handleSendMonthlyReport = async () => {
    try {
      setIsSendingMonthlyReport(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const response = await fetch(new URL(`/api/player/${playerId}/monthly-report`, getApiUrl()).toString(), {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send monthly report");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        Alert.alert("Report Sent", data.message || "Monthly report sent successfully.");
      }, 350);
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to send monthly report. Please try again.");
    } finally {
      setIsSendingMonthlyReport(false);
    }
  };

  const displayedHistory = showAllHistory ? filteredHistory : filteredHistory.slice(0, 5);

  const renderAttendanceRow = (record: AttendanceHistoryRecord, showTime = false) => {
    const sessionRating = sessionRatingsMap[record.sessionId];
    return (
    <View key={record.sessionId}>
      <View style={styles.attendanceHistoryRow}>
        <View style={styles.attendanceHistoryDate}>
          <Text style={styles.attendanceHistoryDateText}>{formatAttendanceDate(record.date)}</Text>
          {showTime ? (
            <Text style={styles.attendanceHistoryTime}>
              {formatAttendanceTime(record.startTime)} - {formatAttendanceTime(record.endTime)}
            </Text>
          ) : null}
        </View>
        <View style={styles.attendanceHistoryDetails}>
          <View style={styles.attendanceHistoryType}>
            <Text style={styles.attendanceHistoryTypeText}>
              {record.sessionType === "private" ? "Private" :
               record.sessionType === "group" ? "Group" :
               record.sessionType === "semi-private" ? "Semi" : record.sessionType}
            </Text>
          </View>
          <View style={[
            styles.attendanceStatusBadge,
            record.status === "present" ? styles.attendanceStatusPresent :
            record.status === "absent" ? styles.attendanceStatusAbsent :
            record.status === "late" ? styles.attendanceStatusLate :
            (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? styles.attendanceStatusCancelled :
            styles.attendanceStatusPending
          ]}>
            <Ionicons
              name={record.status === "present" ? "checkmark-circle" :
                    record.status === "absent" ? "close-circle" :
                    (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? "calendar-outline" : "time"}
              size={14}
              color={record.status === "present" ? Colors.dark.primary :
                     record.status === "absent" ? Colors.dark.error :
                     (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? Colors.dark.textSecondary : Colors.dark.gold}
            />
            <Text style={[
              styles.attendanceStatusText,
              record.status === "present" ? styles.attendanceStatusTextPresent :
              record.status === "absent" ? styles.attendanceStatusTextAbsent :
              record.status === "late" ? styles.attendanceStatusTextLate :
              (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? styles.attendanceStatusTextCancelled :
              styles.attendanceStatusTextPending
            ]}>
              {record.status === "present" ? "Present" :
               record.status === "absent" ? "Absent" :
               record.status === "late" ? "Late" :
               record.status === "holiday" ? "Holiday" :
               record.status === "vacation" ? "Vacation" :
               record.status === "cancelled" ? "Cancelled" : "Pending"}
              {showTime && record.lateMinutes && record.lateMinutes > 0 ? ` (+${record.lateMinutes}m late)` : ""}
            </Text>
          </View>
          {(() => {
            // Task #817 — show "−1 group credit" / "No charge" / "Duplicate charge"
            // sub-line directly under the row so the ledger truth is visible.
            const status = (record.status || "").toLowerCase();
            const showCharge =
              status === "present" || status === "late" || status === "absent";
            if (!showCharge) return null;
            const charged = Number(record.creditsCharged ?? 0);
            // creditsCharged is reported as a positive magnitude by the API.
            const amt = charged > 0 ? -charged : charged;
            const typeLabel = record.creditChargeType === "semi_private"
              ? "semi"
              : record.creditChargeType === "private"
                ? "private"
                : "group";
            const duplicate = (record.creditChargeCount ?? 0) > 1;
            if (duplicate) {
              return (
                <View
                  style={{
                    marginLeft: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 4,
                    backgroundColor: Colors.dark.error,
                  }}
                  accessibilityLabel="Duplicate charge detected"
                >
                  <Text style={{ fontSize: 9, fontWeight: "800", color: "#fff" }}>
                    DUP CHARGE
                  </Text>
                </View>
              );
            }
            if (amt === 0) {
              return (
                <Text
                  style={{ marginLeft: 6, fontSize: 10, color: Colors.dark.textMuted }}
                >
                  No charge
                </Text>
              );
            }
            return (
              <Text
                style={{ marginLeft: 6, fontSize: 10, color: Colors.dark.textSecondary, fontWeight: "600" }}
                accessibilityLabel={`${Math.abs(amt)} ${typeLabel} credit charged`}
              >
                {amt < 0 ? "−" : "+"}
                {Math.abs(amt)} {typeLabel}
              </Text>
            );
          })()}
          {sessionRating ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 4 }}>
              <Feather name="star" size={12} color="#FFD700" />
              <Text style={{ color: "#FFD700", fontSize: 11, fontWeight: "600" }}>{sessionRating.rating}/5</Text>
            </View>
          ) : null}
          {/* Task #817: per-lesson credit charge pill so the user can see exactly
              how many credits were debited for this session. Flags duplicates. */}
          {(record.creditsCharged ?? 0) > 0 ? (
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 2,
              marginLeft: 4,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              backgroundColor: (record.creditChargeCount ?? 1) > 1
                ? "rgba(255, 80, 80, 0.18)"
                : "rgba(200, 255, 61, 0.15)",
              borderWidth: 1,
              borderColor: (record.creditChargeCount ?? 1) > 1
                ? Colors.dark.error
                : Colors.dark.primary,
            }}>
              <Ionicons
                name="ticket-outline"
                size={11}
                color={(record.creditChargeCount ?? 1) > 1 ? Colors.dark.error : Colors.dark.primary}
              />
              <Text style={{
                color: (record.creditChargeCount ?? 1) > 1 ? Colors.dark.error : Colors.dark.primary,
                fontSize: 10,
                fontWeight: "700",
              }}>
                −{record.creditsCharged}
                {(record.creditChargeCount ?? 1) > 1 ? `×${record.creditChargeCount}!` : ""}
              </Text>
            </View>
          ) : null}
          <Pressable
            style={styles.attendanceEditButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setEditingAttendance(record);
            }}
          >
            <Ionicons name="pencil" size={16} color={Colors.dark.xpCyan} />
          </Pressable>
        </View>
      </View>
      {sessionRating?.comment ? (
        <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs, flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
          <Feather name="message-square" size={11} color={Colors.dark.textSecondary} style={{ marginTop: 2 }} />
          <Text style={{ color: Colors.dark.textSecondary, fontSize: 11, fontStyle: "italic", flex: 1 }} numberOfLines={2}>
            {sessionRating.comment}
          </Text>
        </View>
      ) : null}
    </View>
    );
  };

  const actionButtons = (
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      <Pressable
        style={[styles.reportButton, isExportingAttendanceReport && { opacity: 0.5 }]}
        onPress={handleExportAttendanceReport}
        disabled={isExportingAttendanceReport}
      >
        {isExportingAttendanceReport ? (
          <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
        ) : (
          <>
            <Ionicons name="document-text-outline" size={14} color={Colors.dark.xpCyan} />
            <Text style={styles.reportButtonText}>PDF</Text>
          </>
        )}
      </Pressable>
      <Pressable
        style={[styles.reportButton, isSharingAttendanceLink && { opacity: 0.5 }]}
        onPress={handleShareAttendanceLink}
        disabled={isSharingAttendanceLink}
      >
        {isSharingAttendanceLink ? (
          <ActivityIndicator size="small" color="#A78BFA" />
        ) : (
          <>
            <Ionicons name="link-outline" size={14} color="#A78BFA" />
            <Text style={[styles.reportButtonText, { color: "#A78BFA" }]}>Share Link</Text>
          </>
        )}
      </Pressable>
      <Pressable
        style={[styles.reportButton, isSendingMonthlyReport && { opacity: 0.5 }]}
        onPress={handleSendMonthlyReport}
        disabled={isSendingMonthlyReport}
      >
        {isSendingMonthlyReport ? (
          <ActivityIndicator size="small" color={Colors.dark.primary} />
        ) : (
          <>
            <Ionicons name="mail-outline" size={14} color={Colors.dark.primary} />
            <Text style={styles.reportButtonText}>Email</Text>
          </>
        )}
      </Pressable>
    </View>
  );

  return (
    <>
      <View style={[styles.infoSection, hideHeader && { marginHorizontal: 0, marginBottom: 0 }]}>
        {!hideHeader ? (
          <View style={styles.attendanceHistoryHeader}>
            <View style={styles.attendanceHistoryTitleRow}>
              <Ionicons name="calendar" size={18} color={Colors.dark.xpCyan} />
              <Text style={styles.sectionLabel}>ATTENDANCE HISTORY</Text>
              {Object.keys(sessionRatingsMap).length > 0 && (() => {
                const vals = Object.values(sessionRatingsMap).map(r => r.rating);
                const avg = (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginLeft: 8, backgroundColor: "rgba(255,215,0,0.12)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                    <Feather name="star" size={11} color="#FFD700" />
                    <Text style={{ color: "#FFD700", fontSize: 11, fontWeight: "600" }}>{avg} avg</Text>
                  </View>
                );
              })()}
            </View>
            {actionButtons}
          </View>
        ) : (
          <View style={[styles.attendanceHistoryHeader, { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm }]}>
            {actionButtons}
          </View>
        )}

        {attendanceHistory.length === 0 ? (
          <View style={styles.emptyAttendanceCard}>
            <Ionicons name="calendar-outline" size={40} color={Colors.dark.disabled} />
            <Text style={styles.emptyAttendanceText}>No sessions yet</Text>
            <Text style={styles.emptyAttendanceSubtext}>Sessions will appear here once attended</Text>
          </View>
        ) : (
          <View style={styles.attendanceHistoryList}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.typeFilterChipScroll}
              contentContainerStyle={styles.typeFilterChipContent}
            >
              {(["all", "private", "semi", "group"] as const).map((chip) => {
                const isActive = typeFilter === chip;
                const label = chip === "all" ? "All" : chip === "private" ? "Private" : chip === "semi" ? "Semi" : "Group";
                return (
                  <Pressable
                    key={chip}
                    style={[styles.typeFilterChip, isActive && styles.typeFilterChipActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setTypeFilter(chip);
                    }}
                  >
                    <Text style={[styles.typeFilterChipText, isActive && styles.typeFilterChipTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {seriesAttendanceSummaries.length > 1 && (
              <View style={styles.seriesSummaryContainer}>
                <Text style={styles.seriesSummaryTitle}>Per Lesson Group</Text>
                <View style={styles.seriesSummaryGrid}>
                  {seriesAttendanceSummaries.map((summary) => (
                    <View key={summary.seriesId} style={styles.seriesSummaryCard}>
                      <View style={styles.seriesSummaryHeader}>
                        <Text style={styles.seriesSummaryDay}>{summary.dayName}</Text>
                        <Text style={styles.seriesSummaryTime}>{formatSeriesTime(summary.startTime)}</Text>
                      </View>
                      <View style={styles.seriesSummaryStats}>
                        <View style={styles.seriesSummaryStat}>
                          <Text style={[styles.seriesSummaryStatValue, { color: Colors.dark.primary }]}>{summary.presentCount}</Text>
                          <Text style={styles.seriesSummaryStatLabel}>Present</Text>
                        </View>
                        <View style={styles.seriesSummaryStat}>
                          <Text style={[styles.seriesSummaryStatValue, { color: Colors.dark.error }]}>{summary.absentCount}</Text>
                          <Text style={styles.seriesSummaryStatLabel}>Absent</Text>
                        </View>
                        <View style={styles.seriesSummaryStat}>
                          <Text style={[
                            styles.seriesSummaryStatValue,
                            { color: summary.attendanceRate >= 80 ? Colors.dark.primary :
                                     summary.attendanceRate >= 60 ? Colors.dark.gold : Colors.dark.error }
                          ]}>
                            {summary.attendanceRate}%
                          </Text>
                          <Text style={styles.seriesSummaryStatLabel}>Rate</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {seriesAttendanceSummaries.length > 1 ? (
              seriesAttendanceSummaries.map((summary) => {
                const displayedSeriesRecords = displayedHistory
                  .filter(r => r.seriesId === summary.seriesId)
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                if (displayedSeriesRecords.length === 0) return null;
                const filteredSeriesCount = typeFilter !== "all"
                  ? filteredHistory.filter(r => r.seriesId === summary.seriesId).length
                  : displayedSeriesRecords.length;
                const isExpanded = expandedSeriesIds.has(summary.seriesId);
                const toggleExpanded = () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedSeriesIds(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(summary.seriesId)) {
                      newSet.delete(summary.seriesId);
                    } else {
                      newSet.add(summary.seriesId);
                    }
                    return newSet;
                  });
                };
                return (
                  <View key={summary.seriesId} style={styles.seriesGroupSection}>
                    <Pressable style={styles.seriesGroupHeader} onPress={toggleExpanded}>
                      <View style={styles.seriesGroupHeaderLeft}>
                        <Text style={styles.seriesGroupDay}>{summary.dayName}</Text>
                        <Text style={styles.seriesGroupTime}>{formatSeriesTime(summary.startTime)}</Text>
                        <View style={styles.seriesGroupCount}>
                          <Text style={styles.seriesGroupCountText}>{filteredSeriesCount}</Text>
                        </View>
                      </View>
                      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={Colors.dark.xpCyan} />
                    </Pressable>
                    {isExpanded && displayedSeriesRecords.map((record) => renderAttendanceRow(record, false))}
                  </View>
                );
              })
            ) : (
              [...displayedHistory]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((record) => renderAttendanceRow(record, true))
            )}

            {filteredHistory.length > 5 ? (
              <Pressable
                style={styles.showMoreHistoryButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAllHistory(!showAllHistory);
                }}
              >
                <Text style={styles.showMoreHistoryText}>
                  {showAllHistory ? "Show Less" : `Show All (${filteredHistory.length} sessions)`}
                </Text>
                <Ionicons name={showAllHistory ? "chevron-up" : "chevron-down"} size={16} color={Colors.dark.xpCyan} />
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      <Modal visible={!!editingAttendance} transparent animationType="fade">
        <Pressable style={styles.editAttendanceModalOverlay} onPress={() => setEditingAttendance(null)}>
          <View style={styles.editAttendanceModalContent}>
            <Text style={styles.editAttendanceModalTitle}>Edit Attendance</Text>
            <Text style={styles.editAttendanceModalSubtitle}>
              {editingAttendance ? formatAttendanceDate(editingAttendance.date) : ""}
            </Text>
            {["present", "absent", "late", "holiday"].map((status) => (
              <Pressable
                key={status}
                style={[
                  styles.editAttendanceOption,
                  editingAttendance?.status === status && styles.editAttendanceOptionSelected,
                ]}
                onPress={() => {
                  if (editingAttendance && editingAttendance.status !== status) {
                    setIsUpdatingAttendance(true);
                    updateAttendanceMutation.mutate({ sessionId: editingAttendance.sessionId, newStatus: status });
                  } else {
                    setEditingAttendance(null);
                  }
                }}
                disabled={isUpdatingAttendance}
              >
                <Ionicons
                  name={status === "present" ? "checkmark-circle" :
                        status === "absent" ? "close-circle" :
                        status === "late" ? "time" : "calendar-outline"}
                  size={20}
                  color={status === "present" ? Colors.dark.primary :
                         status === "absent" ? Colors.dark.error :
                         status === "late" ? Colors.dark.gold : Colors.dark.textSecondary}
                />
                <Text style={styles.editAttendanceOptionText}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
                {editingAttendance?.status === status && (
                  <Ionicons name="checkmark" size={20} color={Colors.dark.primary} style={{ marginLeft: "auto" }} />
                )}
              </Pressable>
            ))}
            {isUpdatingAttendance && (
              <ActivityIndicator size="small" color={Colors.dark.xpCyan} style={{ marginTop: 16 }} />
            )}
            <Text style={styles.editAttendanceNote}>
              Changing attendance will automatically adjust credits
            </Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
