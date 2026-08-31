import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, Modal, Alert, Platform, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import { Colors, Spacing } from "@/constants/theme";
import { convertUTCTimeToLocal, formatTimeInTimezone } from "@/lib/dateUtils";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { invalidatePlayersList } from "@/lib/credit-cache";
import { styles } from "./playersStyles";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

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
  // Task #817: per-lesson credit charge from the V2 ledger.
  creditsCharged?: number;
  creditChargeCount?: number;
  creditChargeType?: string | null;
  // Task #1450: which V2 source produced the charge — `'v2-consume'` for a
  // fresh wallet debit, `'v2-settlement'` when the session was paid via a
  // later top-up against existing debt, `null` when V2 has no evidence.
  creditChargeSource?: "v2-consume" | "v2-settlement" | null;
  paymentStatus?: "paid" | "pending";
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
  total: number;
  limit: number;
  offset: number;
}

interface Props {
  playerId: string;
  playerName: string;
  tz: string;
  hideHeader?: boolean;
  seasonEnrollmentId?: string | null;
  seasonName?: string | null;
}

const PAGE_SIZE = 20;

export function PlayerAttendanceSection({
  playerId,
  playerName,
  tz,
  hideHeader = false,
  seasonEnrollmentId,
  seasonName,
}: Props) {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<"all" | "private" | "semi" | "group">("all");
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  // Pagination state — accumulate records across pages
  const [pageOffset, setPageOffset] = useState(0);
  const [allHistory, setAllHistory] = useState<AttendanceHistoryRecord[]>([]);
  const [seriesAttendanceSummaries, setSeriesAttendanceSummaries] = useState<SeriesAttendanceSummary[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const scopeKey = `${playerId}:${seasonEnrollmentId ?? "current"}`;
  const prevScopeKeyRef = useRef(scopeKey);

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

  const attendanceQueryKey = `/api/coach/players/${playerId}/attendance-history?${[
    `limit=${PAGE_SIZE}`,
    `offset=${pageOffset}`,
    ...(seasonEnrollmentId ? [`seasonEnrollmentId=${encodeURIComponent(seasonEnrollmentId)}`] : []),
  ].join("&")}`;

  const { data: attendanceData, isFetching: isLoadingPage } = useQuery<AttendanceHistoryResponse>({
    queryKey: [attendanceQueryKey],
  });

  // Reset pagination whenever the player or server-authoritative enrollment
  // changes. Keeping rows from the prior season here would make the top-level
  // season stats disagree with Attendance History during a rollover.
  useEffect(() => {
    if (prevScopeKeyRef.current !== scopeKey) {
      prevScopeKeyRef.current = scopeKey;
      setPageOffset(0);
      setAllHistory([]);
      setSeriesAttendanceSummaries([]);
      setTotalSessions(0);
    }
  }, [scopeKey]);

  // Accumulate pages as they arrive
  useEffect(() => {
    if (!attendanceData) return;
    const newRecords = (attendanceData.history || []).filter(r => r.status !== "cancelled");
    if (attendanceData.offset === 0) {
      setAllHistory(newRecords);
      setSeriesAttendanceSummaries(attendanceData.seriesSummaries || []);
    } else {
      setAllHistory(prev => {
        const existingIds = new Set(prev.map(r => r.sessionId));
        const deduped = newRecords.filter(r => !existingIds.has(r.sessionId));
        return [...prev, ...deduped];
      });
    }
    // Never decrease the known total — an empty out-of-range page shouldn't reset it
    setTotalSessions(prev =>
      attendanceData.offset === 0
        ? (attendanceData.total ?? 0)
        : Math.max(prev, attendanceData.total ?? 0),
    );
  }, [attendanceData]);

  const attendanceHistory = allHistory;

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

  const hasMore = allHistory.length < totalSessions;

  const resetAndRefetchHistory = () => {
    // Remove all cached attendance pages for this player
    queryClient.removeQueries({
      predicate: (query) => {
        const k = query.queryKey[0];
        return typeof k === "string" && (k as string).includes(`/coach/players/${playerId}/attendance-history`);
      },
    });
    setAllHistory([]);
    setTotalSessions(0);
    setPageOffset(0);
    queryClient.invalidateQueries({
      predicate: (query) => {
        const k = query.queryKey[0];
        return typeof k === "string" && (k as string).includes(`/coach/players/${playerId}/attendance-history`);
      },
    });
  };

  const formatAttendanceDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: tz });
  };

  const formatAttendanceTime = (timeStr: string | null) => {
    if (!timeStr) return "";
    return formatTimeInTimezone(timeStr, tz);
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
      resetAndRefetchHistory();
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

  const markPaidMutation = useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      const response = await fetch(
        new URL(`/api/coach/players/${playerId}/sessions/${sessionId}/payment-status`, getApiUrl()).toString(),
        {
          method: "PATCH",
          credentials: "include",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        }
      );
      if (!response.ok) throw new Error("Failed to update payment status");
      return response.json() as Promise<{ paymentStatus: "paid" | "pending" }>;
    },
    onSuccess: () => {
      resetAndRefetchHistory();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingAttendance(null);
      setIsMarkingPaid(false);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsMarkingPaid(false);
      Alert.alert("Error", "Failed to update payment status");
    },
  });

  const handleExportAttendanceReport = async () => {
    try {
      setIsExportingAttendanceReport(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const reportUrl = new URL(`/api/players/${playerId}/attendance-report`, getApiUrl());
      if (seasonEnrollmentId) {
        reportUrl.searchParams.set("seasonEnrollmentId", seasonEnrollmentId);
      }
      const response = await fetch(reportUrl.toString(), {
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
      const shareTokenUrl = new URL(`/api/players/${playerId}/attendance-share-token`, getApiUrl());
      if (seasonEnrollmentId) {
        shareTokenUrl.searchParams.set("seasonEnrollmentId", seasonEnrollmentId);
      }
      const response = await fetch(
        shareTokenUrl.toString(),
        { method: "POST", credentials: "include", headers: getAuthHeaders() },
      );
      if (!response.ok) throw new Error("Failed to generate share link");
      const { shareUrl: attendanceShareUrl } = await response.json() as { shareUrl: string };
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(attendanceShareUrl);
        Alert.alert("Link Copied", "Attendance link copied to clipboard. Share it with the player or parent.");
      } else {
        const { Share } = await import("react-native");
        await Share.share({ message: `${playerName}'s attendance report: ${attendanceShareUrl}`, url: attendanceShareUrl, title: `${playerName} Attendance` });
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

  const displayedHistory = filteredHistory;

  const getDotColor = (status: string | null) => {
    if (status === "present") return Colors.dark.primary;
    if (status === "late") return Colors.dark.gold;
    if (status === "absent") return Colors.dark.error;
    return "rgba(255,255,255,0.18)";
  };

  const renderAttendanceCard = (record: AttendanceHistoryRecord) => {
    const sessionRating = sessionRatingsMap[record.sessionId];
    const isPaid = record.paymentStatus === "paid";
    const statusColor =
      record.status === "present" ? Colors.dark.primary :
      record.status === "absent" ? Colors.dark.error :
      record.status === "late" ? Colors.dark.gold :
      Colors.dark.textMuted;
    const statusLabel =
      record.status === "present" ? "Present" :
      record.status === "absent" ? "Absent" :
      record.status === "late" ? "Late" :
      record.status === "holiday" ? "Holiday" :
      record.status === "vacation" ? "Vacation" :
      record.status === "cancelled" ? "Cancelled" : "Pending";
    const typeLow = (record.sessionType ?? "").toLowerCase();
    const typeLabel = typeLow === "private" ? "Private" : typeLow.includes("semi") ? "Semi" : "Group";
    const typeColor = typeLow === "private" ? "#A78BFA" : typeLow.includes("semi") ? Colors.dark.gold : Colors.dark.primary;
    const typeBg = typeLow === "private" ? "rgba(167,139,250,0.12)" : typeLow.includes("semi") ? "rgba(251,191,36,0.12)" : "rgba(200,255,61,0.1)";
    return (
      <Pressable
        key={record.sessionId}
        style={styles.attendanceCard}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setEditingAttendance(record);
        }}
      >
        <View style={styles.attendanceCardHeader}>
          <Text style={styles.attendanceCardDate} numberOfLines={1}>{formatAttendanceDate(record.date)}</Text>
          {isPaid ? (
            <View style={styles.attendancePaidBadge}>
              <Ionicons name="checkmark-circle" size={13} color={Colors.dark.primary} />
            </View>
          ) : null}
        </View>
        <Text style={styles.attendanceCardTime} numberOfLines={1}>
          {formatAttendanceTime(record.startTime)} – {formatAttendanceTime(record.endTime)}
        </Text>
        <View style={styles.attendanceCardFooter}>
          <View style={[styles.attendanceCardTypePill, { backgroundColor: typeBg }]}>
            <Text style={[styles.attendanceCardTypeText, { color: typeColor }]}>{typeLabel}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <View style={[styles.attendanceCardStatusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.attendanceCardStatusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
      </Pressable>
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
          <TennisBallSpinner size="small" color={Colors.dark.xpCyan} />
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
          <TennisBallSpinner size="small" color="#A78BFA" />
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
          <TennisBallSpinner size="small" color={Colors.dark.primary} />
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
            <Text style={styles.emptyAttendanceText}>
              {seasonName ? `No attendance yet in ${seasonName}.` : "No attendance yet"}
            </Text>
            <Text style={styles.emptyAttendanceSubtext}>
              {seasonName ? "Attendance in this season will appear here." : "Sessions will appear here once attended"}
            </Text>
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

            {(() => {
              const billable = allHistory.filter(r => r.status !== "holiday" && r.status !== "vacation");
              const presentCnt = billable.filter(r => r.status === "present").length;
              const absentCnt = billable.filter(r => r.status === "absent").length;
              const lateCnt = billable.filter(r => r.status === "late").length;
              const rate = billable.length > 0 ? Math.round(((presentCnt + lateCnt) / billable.length) * 100) : 0;
              const rateColor = rate >= 80 ? Colors.dark.primary : rate >= 60 ? Colors.dark.gold : Colors.dark.error;
              return (
                <View style={styles.attendanceStatsRow}>
                  <View style={styles.attendanceStatBox}>
                    <Text style={styles.attendanceStatValue}>{billable.length}</Text>
                    <Text style={styles.attendanceStatLabel}>Total</Text>
                  </View>
                  <View style={styles.attendanceStatBox}>
                    <Text style={[styles.attendanceStatValue, { color: Colors.dark.primary }]}>{presentCnt}</Text>
                    <Text style={styles.attendanceStatLabel}>Present</Text>
                  </View>
                  <View style={styles.attendanceStatBox}>
                    <Text style={[styles.attendanceStatValue, { color: Colors.dark.error }]}>{absentCnt}</Text>
                    <Text style={styles.attendanceStatLabel}>Absent</Text>
                  </View>
                  <View style={styles.attendanceStatBox}>
                    <Text style={[styles.attendanceStatValue, { color: rateColor }]}>{rate}%</Text>
                    <Text style={styles.attendanceStatLabel}>Rate</Text>
                  </View>
                </View>
              );
            })()}

            {filteredHistory.length > 0 && (
              <View style={styles.heatmapContainer}>
                <Text style={styles.heatmapLabel}>Attendance pattern</Text>
                <View style={styles.heatmapDots}>
                  {filteredHistory.slice(0, 60).map(r => (
                    <View key={r.sessionId} style={[styles.heatmapDot, { backgroundColor: getDotColor(r.status) }]} />
                  ))}
                </View>
              </View>
            )}

            <View style={styles.attendanceCardGrid}>
              {[...displayedHistory]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map(renderAttendanceCard)}
            </View>

            {hasMore ? (
              <Pressable
                style={[styles.showMoreHistoryButton, isLoadingPage && { opacity: 0.5 }]}
                disabled={isLoadingPage}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPageOffset(allHistory.length);
                }}
              >
                {isLoadingPage ? (
                  <TennisBallSpinner size="small" color={Colors.dark.xpCyan} />
                ) : (
                  <>
                    <Text style={styles.showMoreHistoryText}>
                      {`Load more (${totalSessions - allHistory.length} remaining)`}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.dark.xpCyan} />
                  </>
                )}
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
              <TennisBallSpinner size="small" color={Colors.dark.xpCyan} style={{ marginTop: 16 }} />
            )}
            <Text style={styles.editAttendanceNote}>
              Changing attendance will automatically adjust credits
            </Text>

            {editingAttendance && (() => {
              const rating = sessionRatingsMap[editingAttendance.sessionId];
              const hasDupCharge = (editingAttendance.creditChargeCount ?? 0) > 1;
              const hasDetails = rating || (editingAttendance.creditsCharged ?? 0) > 0 || hasDupCharge;
              if (!hasDetails) return null;
              return (
                <View style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                  {rating ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: (editingAttendance.creditsCharged ?? 0) > 0 || hasDupCharge ? 8 : 0 }}>
                      <Feather name="star" size={13} color="#FFD700" />
                      <Text style={{ color: "#FFD700", fontSize: 13, fontWeight: "700" }}>{rating.rating}/5</Text>
                      {rating.comment ? (
                        <Text style={{ color: Colors.dark.textMuted, fontSize: 12, flex: 1 }} numberOfLines={2}>{rating.comment}</Text>
                      ) : null}
                    </View>
                  ) : null}
                  {(editingAttendance.creditsCharged ?? 0) > 0 || hasDupCharge ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Feather name="credit-card" size={13} color={Colors.dark.textMuted} />
                      <Text style={{ color: Colors.dark.textMuted, fontSize: 12 }}>
                        {editingAttendance.creditsCharged ?? 0} credit{(editingAttendance.creditsCharged ?? 0) !== 1 ? "s" : ""} charged
                      </Text>
                      {hasDupCharge ? (
                        <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: "rgba(239,68,68,0.2)", borderWidth: 1, borderColor: Colors.dark.error }}>
                          <Text style={{ fontSize: 9, fontWeight: "800", color: Colors.dark.error }}>DUPLICATE</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })()}

            <Pressable
              style={[
                styles.editAttendanceMarkPaidButton,
                editingAttendance?.paymentStatus === "paid" && styles.editAttendanceMarkPaidButtonPaid,
                (isMarkingPaid || isUpdatingAttendance) && { opacity: 0.5 },
              ]}
              disabled={isMarkingPaid || isUpdatingAttendance}
              onPress={() => {
                if (!editingAttendance) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setIsMarkingPaid(true);
                markPaidMutation.mutate({ sessionId: editingAttendance.sessionId });
              }}
            >
              {isMarkingPaid ? (
                <TennisBallSpinner size="small" color={Colors.dark.primary} />
              ) : (
                <>
                  <Ionicons
                    name={editingAttendance?.paymentStatus === "paid" ? "checkmark-circle" : "checkmark-circle-outline"}
                    size={18}
                    color={Colors.dark.primary}
                  />
                  <Text style={styles.editAttendanceMarkPaidText}>
                    {editingAttendance?.paymentStatus === "paid" ? "Undo Paid" : "Mark as Paid"}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
