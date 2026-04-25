import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, CardStyles, GlowColors } from "@/constants/theme";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { useWebAlert } from "@/components/WebAlertProvider";
interface AdminStats {
  totalCoaches: number;
  totalPlayers: number;
  totalSessions: number;
  activeSessions: number;
  monthlyRevenue: number;
  attendanceRate: number;
}

interface RevenueData {
  month: number;
  year: number;
  monthName: string;
  totalRevenue: number;
  sessionFees: number;
  subscriptionRevenue: number;
  otherRevenue: number;
  refundsTotal: number;
  netRevenue: number;
  completedSessions: number;
  averageSessionRate: number;
  paymentsCount: number;
  pendingAmount: number;
  activePlayers: number;
  playerLifetimeValue: number;
}

type ReportType = "player-progress" | "session-history" | "revenue" | "coach-performance" | null;

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  return !Number.isNaN(d.getTime());
}


const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function AdminReportsScreen() {
  const insets = useSafeAreaInsets();
  const [activeReport, setActiveReport] = useState<ReportType>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Cross-platform alert (uses in-app modal on web, native Alert on iOS/Android)
  const webAlert = useWebAlert();
  const notify = React.useCallback(
    (title: string, message?: string) => {
      if (Platform.OS === "web") {
        webAlert.show(title, message ?? "");
      } else {
        Alert.alert(title, message);
      }
    },
    [webAlert],
  );

  // Attendance Workbook export state
  const today = useMemo(() => new Date(), []);
  const ninetyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d;
  }, []);
  const [showWorkbookModal, setShowWorkbookModal] = useState(false);
  const [workbookFrom, setWorkbookFrom] = useState<string>(formatYmd(ninetyDaysAgo));
  const [workbookTo, setWorkbookTo] = useState<string>(formatYmd(today));
  const [workbookBallLevel, setWorkbookBallLevel] = useState<string | null>(null);
  const [workbookSeriesId, setWorkbookSeriesId] = useState<string | null>(null);
  const [isDownloadingWorkbook, setIsDownloadingWorkbook] = useState(false);

  // Series list for the workbook filter (lazy: only loaded when modal opens)
  type WorkbookSeriesOption = {
    id: string;
    title: string;
    status: string | null;
    ballLevel: string | null;
    sessionType: string | null;
  };
  const { data: workbookSeriesData } = useQuery<{ series: WorkbookSeriesOption[] }>({
    queryKey: ["/api/admin/reports/attendance-workbook/series"],
    enabled: showWorkbookModal,
  });
  const workbookSeriesList = workbookSeriesData?.series ?? [];

  const { data: coaches = [] } = useQuery<any[]>({
    queryKey: ["/api/coaches"],
  });

  const { data: players = [] } = useQuery<any[]>({
    queryKey: ["/api/players"],
  });

  const { data: sessions = [] } = useQuery<any[]>({
    queryKey: ["/api/sessions"],
  });

  const { data: revenueData, isLoading: isLoadingRevenue } = useQuery<RevenueData>({
    queryKey: ["/api/admin/revenue", { month: selectedMonth, year: selectedYear }],
  });
  const stats: AdminStats = {
    totalCoaches: coaches.length,
    totalPlayers: players.length,
    totalSessions: sessions.length,
    activeSessions: sessions.filter((s: any) => s.status === "scheduled").length,
    monthlyRevenue: revenueData?.totalRevenue || 0,
    attendanceRate: sessions.length > 0 ? Math.round((sessions.filter((s: any) => s.status === "completed").length / sessions.length) * 100) : 0,
  };

  const handlePreviousMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const now = new Date();
    const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();
    if (isCurrentMonth) return;
    
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handleExportPdf = async () => {
    if (!revenueData) return;
    
    setIsExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Revenue Report - ${revenueData.monthName} ${revenueData.year}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; background: #fff; color: #1a1a1a; }
              h1 { color: #FFD700; margin-bottom: 8px; }
              h2 { color: #666; font-size: 18px; font-weight: normal; margin-bottom: 32px; }
              .revenue-box { background: linear-gradient(135deg, #2a2a0a 0%, #1a1a0a 100%); color: #FFD700; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 32px; }
              .revenue-amount { font-size: 36px; font-weight: bold; }
              .revenue-label { font-size: 14px; color: #999; margin-top: 8px; }
              .section { margin-bottom: 24px; }
              .section-title { font-size: 16px; font-weight: 600; color: #333; margin-bottom: 16px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
              .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
              .row-label { color: #666; }
              .row-value { font-weight: 600; color: #333; }
              .footer { margin-top: 40px; text-align: center; color: #999; font-size: 12px; }
            </style>
          </head>
          <body>
            <h1>Revenue Report</h1>
            <h2>${revenueData.monthName} ${revenueData.year}</h2>
            
            <div class="revenue-box">
              <div class="revenue-amount">AED ${revenueData.totalRevenue.toLocaleString()}</div>
              <div class="revenue-label">Total Revenue</div>
            </div>
            
            <div class="section">
              <div class="section-title">Revenue Breakdown</div>
              <div class="row">
                <span class="row-label">Session Fees</span>
                <span class="row-value">AED ${revenueData.sessionFees.toLocaleString()}</span>
              </div>
              <div class="row">
                <span class="row-label">Subscriptions</span>
                <span class="row-value">AED ${revenueData.subscriptionRevenue.toLocaleString()}</span>
              </div>
              <div class="row">
                <span class="row-label">Other Revenue</span>
                <span class="row-value">AED ${revenueData.otherRevenue.toLocaleString()}</span>
              </div>
              <div class="row">
                <span class="row-label">Refunds</span>
                <span class="row-value" style="color: #EF4444;">- AED ${revenueData.refundsTotal.toLocaleString()}</span>
              </div>
              <div class="row" style="font-weight: bold; border-top: 2px solid #333; margin-top: 8px; padding-top: 16px;">
                <span class="row-label">Net Revenue</span>
                <span class="row-value" style="color: #22C55E;">AED ${revenueData.netRevenue.toLocaleString()}</span>
              </div>
            </div>
            
            <div class="section">
              <div class="section-title">Key Metrics</div>
              <div class="row">
                <span class="row-label">Completed Sessions</span>
                <span class="row-value">${revenueData.completedSessions}</span>
              </div>
              <div class="row">
                <span class="row-label">Average Session Rate</span>
                <span class="row-value">AED ${revenueData.averageSessionRate}</span>
              </div>
              <div class="row">
                <span class="row-label">Active Players</span>
                <span class="row-value">${revenueData.activePlayers}</span>
              </div>
              <div class="row">
                <span class="row-label">Player Lifetime Value</span>
                <span class="row-value">AED ${revenueData.playerLifetimeValue.toLocaleString()}</span>
              </div>
              <div class="row">
                <span class="row-label">Pending Payments</span>
                <span class="row-value" style="color: #F97316;">AED ${revenueData.pendingAmount.toLocaleString()}</span>
              </div>
            </div>
            
            <div class="footer">
              Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
            </div>
          </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          printWindow.print();
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { 
            mimeType: 'application/pdf',
            dialogTitle: 'Share Revenue Report',
            UTI: 'com.adobe.pdf'
          });
        } else {
          Alert.alert('PDF Generated', 'Report saved successfully');
        }
      }
    } catch (error) {
      console.error('PDF export error:', error);
      notify('Error', 'Failed to generate PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadAttendanceWorkbook = async () => {
    if (!isValidYmd(workbookFrom) || !isValidYmd(workbookTo)) {
      notify("Invalid date", "Use YYYY-MM-DD format for both dates.");
      return;
    }
    if (workbookFrom > workbookTo) {
      notify("Invalid range", "`From` must be on or before `To`.");
      return;
    }

    setIsDownloadingWorkbook(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const url = new URL(
        "/api/admin/reports/attendance-workbook.xlsx",
        getApiUrl(),
      );
      url.searchParams.set("from", workbookFrom);
      url.searchParams.set("to", workbookTo);
      if (workbookBallLevel) url.searchParams.set("ballLevel", workbookBallLevel);
      if (workbookSeriesId) url.searchParams.set("seriesId", workbookSeriesId);

      const filename = `academy-attendance_${workbookFrom}_${workbookTo}.xlsx`;
      const xlsxMime =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

      if (Platform.OS === "web") {
        const res = await fetch(url.toString(), {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(blobUrl);
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;
        const downloadResult = await FileSystem.downloadAsync(
          url.toString(),
          fileUri,
          { headers: getAuthHeaders() },
        );
        if (downloadResult.status !== 200) {
          throw new Error(`Download failed (${downloadResult.status})`);
        }
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: xlsxMime,
            dialogTitle: "Share Attendance Workbook",
            UTI: "org.openxmlformats.spreadsheetml.sheet",
          });
        } else {
          notify("Workbook saved", `Saved to ${downloadResult.uri}`);
        }
      }

      setShowWorkbookModal(false);
    } catch (error) {
      console.error("Attendance workbook download error:", error);
      notify(
        "Export failed",
        "Could not generate the attendance workbook. Please try again.",
      );
    } finally {
      setIsDownloadingWorkbook(false);
    }
  };

  const ballLevelDistribution = players.reduce((acc: Record<string, number>, player: any) => {
    const level = player.ballLevel || "unknown";
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {});

  const getBallLevelColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case "blue": return "#3B82F6";
      case "red": return "#EF4444";
      case "orange": return "#F97316";
      case "green": return "#22C55E";
      case "yellow": return "#EAB308";
      case "adult":
      case "glow": return "#00E5FF"; // Cyan for adult players
      default: return Colors.dark.textMuted;
    }
  };

  const openReport = (type: ReportType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveReport(type);
  };

  const closeReport = () => {
    setActiveReport(null);
  };

  const completedSessions = sessions.filter((s: any) => s.status === "completed");
  const scheduledSessions = sessions.filter((s: any) => s.status === "scheduled");
  const cancelledSessions = sessions.filter((s: any) => s.status === "cancelled");

  const coachStats = coaches.map((coach: any) => {
    const coachSessions = sessions.filter((s: any) => s.coachId === coach.id);
    const completed = coachSessions.filter((s: any) => s.status === "completed").length;
    return {
      ...coach,
      totalSessions: coachSessions.length,
      completed,
      utilization: coachSessions.length > 0 ? Math.round((completed / coachSessions.length) * 100) : 0,
    };
  });

  const renderReportModal = () => {
    let title = "";
    let icon: any = "document";
    let iconColor = Colors.dark.text;
    let content: React.ReactNode = null;

    switch (activeReport) {
      case "player-progress":
        title = "Player Progress";
        icon = "trending-up";
        iconColor = Colors.dark.successNeon;
        content = (
          <View style={styles.reportModalContent}>
            <View style={styles.reportStat}>
              <Text style={styles.reportStatValue}>{stats.totalPlayers}</Text>
              <Text style={styles.reportStatLabel}>Total Players</Text>
            </View>
            <View style={styles.reportDivider} />
            <Text style={styles.reportSubheader}>Level Distribution</Text>
            {Object.entries(ballLevelDistribution).map(([level, count]) => (
              <View key={level} style={styles.reportRow}>
                <View style={styles.reportRowLabel}>
                  <View style={[styles.levelDot, { backgroundColor: getBallLevelColor(level) }]} />
                  <Text style={styles.reportRowText}>{level.charAt(0).toUpperCase() + level.slice(1)} Ball</Text>
                </View>
                <Text style={styles.reportRowValue}>{count as number} players</Text>
              </View>
            ))}
            {Object.keys(ballLevelDistribution).length === 0 ? (
              <Text style={styles.noDataText}>No player data available</Text>
            ) : null}
            <View style={styles.reportDivider} />
            <Text style={styles.reportSubheader}>Top Performers</Text>
            {players.slice(0, 5).map((player: any, index: number) => (
              <View key={player.id} style={styles.reportRow}>
                <View style={styles.reportRowLabel}>
                  <Text style={styles.rankText}>#{index + 1}</Text>
                  <Text style={styles.reportRowText}>{player.name}</Text>
                </View>
                <View style={[styles.levelBadge, { backgroundColor: getBallLevelColor(player.ballLevel) }]}>
                  <Text style={styles.levelBadgeText}>{player.ballLevel || "N/A"}</Text>
                </View>
              </View>
            ))}
          </View>
        );
        break;

      case "session-history":
        title = "Session History";
        icon = "calendar-outline";
        iconColor = Colors.dark.orange;
        content = (
          <View style={styles.reportModalContent}>
            <View style={styles.sessionStatsGrid}>
              <View style={[styles.sessionStatCard, { backgroundColor: Colors.dark.successNeon + "20" }]}>
                <Text style={[styles.sessionStatValue, { color: Colors.dark.successNeon }]}>{completedSessions.length}</Text>
                <Text style={styles.sessionStatLabel}>Completed</Text>
              </View>
              <View style={[styles.sessionStatCard, { backgroundColor: Colors.dark.orange + "20" }]}>
                <Text style={[styles.sessionStatValue, { color: Colors.dark.orange }]}>{scheduledSessions.length}</Text>
                <Text style={styles.sessionStatLabel}>Scheduled</Text>
              </View>
              <View style={[styles.sessionStatCard, { backgroundColor: Colors.dark.error + "20" }]}>
                <Text style={[styles.sessionStatValue, { color: Colors.dark.error }]}>{cancelledSessions.length}</Text>
                <Text style={styles.sessionStatLabel}>Cancelled</Text>
              </View>
            </View>
            <View style={styles.reportDivider} />
            <Text style={styles.reportSubheader}>Recent Sessions</Text>
            {sessions.slice(0, 8).map((session: any) => {
              const coach = coaches.find((c: any) => c.id === session.coachId);
              return (
                <View key={session.id} style={styles.sessionRow}>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionType}>{session.sessionType || "Training"}</Text>
                    <Text style={styles.sessionCoach}>{coach?.name || "Unassigned"}</Text>
                  </View>
                  <View style={[styles.statusBadge, { 
                    backgroundColor: session.status === "completed" ? Colors.dark.successNeon + "20" : 
                                   session.status === "scheduled" ? Colors.dark.orange + "20" : Colors.dark.error + "20" 
                  }]}>
                    <Text style={[styles.statusText, { 
                      color: session.status === "completed" ? Colors.dark.successNeon : 
                             session.status === "scheduled" ? Colors.dark.orange : Colors.dark.error 
                    }]}>{session.status}</Text>
                  </View>
                </View>
              );
            })}
            {sessions.length === 0 ? (
              <Text style={styles.noDataText}>No sessions recorded</Text>
            ) : null}
          </View>
        );
        break;

      case "revenue":
        title = "Revenue Report";
        icon = "cash-outline";
        iconColor = Colors.dark.gold;
        const isCurrentMonth = selectedMonth === new Date().getMonth() + 1 && selectedYear === new Date().getFullYear();
        content = (
          <View style={styles.reportModalContent}>
            <View style={styles.monthSelector}>
              <Pressable onPress={handlePreviousMonth} style={styles.monthArrow}>
                <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
              </Pressable>
              <View style={styles.monthDisplay}>
                <Text style={styles.monthText}>{MONTHS[selectedMonth - 1]} {selectedYear}</Text>
              </View>
              <Pressable 
                onPress={handleNextMonth} 
                style={[styles.monthArrow, isCurrentMonth && styles.monthArrowDisabled]}
                disabled={isCurrentMonth}
              >
                <Ionicons name="chevron-forward" size={24} color={isCurrentMonth ? Colors.dark.textMuted : Colors.dark.text} />
              </Pressable>
            </View>

            {isLoadingRevenue ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.dark.gold} />
                <Text style={styles.loadingText}>Loading revenue data...</Text>
              </View>
            ) : (
              <>
                <View style={styles.revenueHeader}>
                  <Text style={styles.revenueAmount}>AED {(revenueData?.totalRevenue || 0).toLocaleString()}</Text>
                  <Text style={styles.revenueLabel}>Total Revenue</Text>
                </View>

                <View style={styles.reportDivider} />
                <Text style={styles.reportSubheader}>Revenue Breakdown</Text>
                <View style={styles.reportRow}>
                  <Text style={styles.reportRowText}>Session Fees</Text>
                  <Text style={styles.reportRowValue}>AED {(revenueData?.sessionFees || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={styles.reportRowText}>Subscriptions</Text>
                  <Text style={styles.reportRowValue}>AED {(revenueData?.subscriptionRevenue || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={styles.reportRowText}>Other Revenue</Text>
                  <Text style={styles.reportRowValue}>AED {(revenueData?.otherRevenue || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={styles.reportRowText}>Refunds</Text>
                  <Text style={[styles.reportRowValue, { color: Colors.dark.error }]}>- AED {(revenueData?.refundsTotal || 0).toLocaleString()}</Text>
                </View>
                <View style={[styles.reportRow, styles.netRevenueRow]}>
                  <Text style={[styles.reportRowText, { fontWeight: '600' }]}>Net Revenue</Text>
                  <Text style={[styles.reportRowValue, { color: Colors.dark.successNeon, fontWeight: '600' }]}>AED {(revenueData?.netRevenue || 0).toLocaleString()}</Text>
                </View>

                <View style={styles.reportDivider} />
                <Text style={styles.reportSubheader}>Key Metrics</Text>
                <View style={styles.reportRow}>
                  <Text style={styles.reportRowText}>Completed Sessions</Text>
                  <Text style={styles.reportRowValue}>{revenueData?.completedSessions || 0}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={styles.reportRowText}>Average Session Rate</Text>
                  <Text style={styles.reportRowValue}>AED {revenueData?.averageSessionRate || 0}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={styles.reportRowText}>Active Players</Text>
                  <Text style={styles.reportRowValue}>{revenueData?.activePlayers || 0}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={styles.reportRowText}>Player Lifetime Value</Text>
                  <Text style={styles.reportRowValue}>AED {(revenueData?.playerLifetimeValue || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.reportRow}>
                  <Text style={styles.reportRowText}>Pending Payments</Text>
                  <Text style={[styles.reportRowValue, { color: Colors.dark.orange }]}>AED {(revenueData?.pendingAmount || 0).toLocaleString()}</Text>
                </View>

                <Pressable 
                  style={[styles.exportButton, isExporting && styles.exportButtonDisabled]}
                  onPress={handleExportPdf}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                  ) : (
                    <Ionicons name="download-outline" size={20} color={Colors.dark.buttonText} />
                  )}
                  <Text style={styles.exportButtonText}>
                    {isExporting ? "Generating..." : "Download PDF"}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        );
        break;

      case "coach-performance":
        title = "Coach Performance";
        icon = "analytics-outline";
        iconColor = Colors.dark.primary;
        content = (
          <View style={styles.reportModalContent}>
            <View style={styles.reportStat}>
              <Text style={styles.reportStatValue}>{stats.totalCoaches}</Text>
              <Text style={styles.reportStatLabel}>Active Coaches</Text>
            </View>
            <View style={styles.reportDivider} />
            <Text style={styles.reportSubheader}>Coach Activity</Text>
            {coachStats.map((coach: any) => (
              <View key={coach.id} style={styles.coachRow}>
                <View style={styles.coachInfo}>
                  <Text style={styles.coachName}>{coach.name}</Text>
                  <Text style={styles.coachSpecialty}>{coach.specialty || "General"}</Text>
                </View>
                <View style={styles.coachStats}>
                  <Text style={styles.coachStatText}>{coach.totalSessions} sessions</Text>
                  <View style={styles.utilizationBar}>
                    <View style={[styles.utilizationFill, { width: `${coach.utilization}%` }]} />
                  </View>
                </View>
              </View>
            ))}
            {coaches.length === 0 ? (
              <Text style={styles.noDataText}>No coach data available</Text>
            ) : null}
            <View style={styles.reportDivider} />
            <Text style={styles.reportSubheader}>Performance Summary</Text>
            <View style={styles.reportRow}>
              <Text style={styles.reportRowText}>Total Sessions Delivered</Text>
              <Text style={styles.reportRowValue}>{completedSessions.length}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportRowText}>Average Attendance Rate</Text>
              <Text style={styles.reportRowValue}>{stats.attendanceRate}%</Text>
            </View>
          </View>
        );
        break;
    }

    return (
      <Modal
        visible={activeReport !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeReport}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={closeReport}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <View style={styles.modalTitleRow}>
              <Ionicons name={icon} size={24} color={iconColor} />
              <Text style={styles.modalTitle}>{title}</Text>
            </View>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView 
            style={styles.modalScroll}
            contentContainerStyle={[styles.modalScrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        </View>
      </Modal>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.15)", "transparent"]}
        style={styles.headerGradient}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Reports & Analytics</Text>

        
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, CardStyles.elevated]}>
                <Ionicons name="people" size={24} color={Colors.dark.primary} />
                <Text style={styles.statValue}>{stats.totalCoaches}</Text>
                <Text style={styles.statLabel}>Coaches</Text>
              </View>
              <View style={[styles.statCard, CardStyles.elevated]}>
                <Ionicons name="person" size={24} color={Colors.dark.xpCyan} />
                <Text style={styles.statValue}>{stats.totalPlayers}</Text>
                <Text style={styles.statLabel}>Players</Text>
              </View>
              <View style={[styles.statCard, CardStyles.elevated]}>
                <Ionicons name="calendar" size={24} color={Colors.dark.orange} />
                <Text style={styles.statValue}>{stats.totalSessions}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>
              <View style={[styles.statCard, CardStyles.elevated]}>
                <Ionicons name="checkmark-circle" size={24} color={Colors.dark.successNeon} />
                <Text style={styles.statValue}>{stats.attendanceRate}%</Text>
                <Text style={styles.statLabel}>Attendance</Text>
              </View>
            </View>
          </View>
        

        
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Player Distribution</Text>
            <View style={[styles.distributionCard, CardStyles.elevated]}>
              {Object.entries(ballLevelDistribution).map(([level, count]) => (
                <View key={level} style={styles.distributionRow}>
                  <View style={styles.distributionLabel}>
                    <View style={[styles.levelDot, { backgroundColor: getBallLevelColor(level) }]} />
                    <Text style={styles.levelName}>{level.charAt(0).toUpperCase() + level.slice(1)}</Text>
                  </View>
                  <View style={styles.distributionBarContainer}>
                    <View
                      style={[
                        styles.distributionBar,
                        {
                          width: `${((count as number) / stats.totalPlayers) * 100}%`,
                          backgroundColor: getBallLevelColor(level),
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.distributionCount}>{count as number}</Text>
                </View>
              ))}
              {Object.keys(ballLevelDistribution).length === 0 ? (
                <Text style={styles.noDataText}>No player data available</Text>
              ) : null}
            </View>
          </View>
        

        
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Reports</Text>
          <Pressable 
            style={[styles.reportCard, CardStyles.elevated]}
            onPress={() => openReport("player-progress")}
          >
            <View style={styles.reportContent}>
              <Ionicons name="trending-up" size={24} color={Colors.dark.successNeon} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Player Progress</Text>
                <Text style={styles.reportSubtitle}>Track skill development over time</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={[styles.reportCard, CardStyles.elevated]}
            onPress={() => openReport("session-history")}
          >
            <View style={styles.reportContent}>
              <Ionicons name="calendar-outline" size={24} color={Colors.dark.orange} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Session History</Text>
                <Text style={styles.reportSubtitle}>View past sessions and attendance</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={[styles.reportCard, CardStyles.elevated]}
            onPress={() => openReport("revenue")}
          >
            <View style={styles.reportContent}>
              <Ionicons name="cash-outline" size={24} color={Colors.dark.gold} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Revenue Report</Text>
                <Text style={styles.reportSubtitle}>Financial overview and trends</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={[styles.reportCard, CardStyles.elevated]}
            onPress={() => openReport("coach-performance")}
          >
            <View style={styles.reportContent}>
              <Ionicons name="analytics-outline" size={24} color={Colors.dark.primary} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Coach Performance</Text>
                <Text style={styles.reportSubtitle}>Coach activity and metrics</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable
            style={[styles.reportCard, CardStyles.elevated]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowWorkbookModal(true);
            }}
          >
            <View style={styles.reportContent}>
              <Ionicons name="grid-outline" size={24} color={Colors.dark.xpCyan} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Attendance Workbook</Text>
                <Text style={styles.reportSubtitle}>
                  Multi-tab Excel export with date matrix per series
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>
        </View>
        
      </ScrollView>

      {renderReportModal()}

      <Modal
        visible={showWorkbookModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowWorkbookModal(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowWorkbookModal(false)}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <View style={styles.modalTitleRow}>
              <Ionicons name="grid-outline" size={24} color={Colors.dark.xpCyan} />
              <Text style={styles.modalTitle}>Attendance Workbook</Text>
            </View>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={[
              styles.modalScrollContent,
              { paddingBottom: insets.bottom + Spacing.xl },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.workbookHelper}>
              Generate an Excel workbook with a Summary tab, an All Sessions tab,
              and one tab per coaching series with a date-matrix of attendance.
            </Text>

            <Text style={styles.workbookLabel}>From</Text>
            <TextInput
              value={workbookFrom}
              onChangeText={setWorkbookFrom}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.workbookInput}
            />

            <Text style={styles.workbookLabel}>To</Text>
            <TextInput
              value={workbookTo}
              onChangeText={setWorkbookTo}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.workbookInput}
            />

            <Text style={styles.workbookLabel}>Ball Level (optional)</Text>
            <View style={styles.ballLevelChips}>
              <Pressable
                onPress={() => setWorkbookBallLevel(null)}
                style={[
                  styles.ballLevelChip,
                  workbookBallLevel === null && styles.ballLevelChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.ballLevelChipText,
                    workbookBallLevel === null && styles.ballLevelChipTextActive,
                  ]}
                >
                  All
                </Text>
              </Pressable>
              {Object.keys(ballLevelDistribution)
                .filter((lvl) => lvl !== "unknown")
                .map((lvl) => (
                  <Pressable
                    key={lvl}
                    onPress={() => setWorkbookBallLevel(lvl)}
                    style={[
                      styles.ballLevelChip,
                      workbookBallLevel === lvl && styles.ballLevelChipActive,
                      { borderColor: getBallLevelColor(lvl) },
                    ]}
                  >
                    <View
                      style={[
                        styles.levelDot,
                        { backgroundColor: getBallLevelColor(lvl) },
                      ]}
                    />
                    <Text
                      style={[
                        styles.ballLevelChipText,
                        workbookBallLevel === lvl && styles.ballLevelChipTextActive,
                      ]}
                    >
                      {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                    </Text>
                  </Pressable>
                ))}
            </View>

            <Text style={styles.workbookLabel}>Series (optional)</Text>
            <View style={styles.ballLevelChips}>
              <Pressable
                onPress={() => setWorkbookSeriesId(null)}
                style={[
                  styles.ballLevelChip,
                  workbookSeriesId === null && styles.ballLevelChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.ballLevelChipText,
                    workbookSeriesId === null && styles.ballLevelChipTextActive,
                  ]}
                >
                  All series
                </Text>
              </Pressable>
              {workbookSeriesList.map((s) => {
                const isActive = workbookSeriesId === s.id;
                const dotColor = s.ballLevel
                  ? getBallLevelColor(s.ballLevel)
                  : Colors.dark.textMuted;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setWorkbookSeriesId(s.id)}
                    style={[
                      styles.ballLevelChip,
                      isActive && styles.ballLevelChipActive,
                      { borderColor: dotColor },
                    ]}
                  >
                    <View
                      style={[styles.levelDot, { backgroundColor: dotColor }]}
                    />
                    <Text
                      style={[
                        styles.ballLevelChipText,
                        isActive && styles.ballLevelChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {s.title}
                    </Text>
                  </Pressable>
                );
              })}
              {workbookSeriesList.length === 0 ? (
                <Text style={styles.workbookHelper}>
                  No coaching series found in your academy.
                </Text>
              ) : null}
            </View>

            <Pressable
              style={[
                styles.exportButton,
                isDownloadingWorkbook && styles.exportButtonDisabled,
              ]}
              onPress={handleDownloadAttendanceWorkbook}
              disabled={isDownloadingWorkbook}
            >
              {isDownloadingWorkbook ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <>
                  <Ionicons
                    name="download-outline"
                    size={20}
                    color={Colors.dark.buttonText}
                  />
                  <Text style={styles.exportButtonText}>Download Workbook</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
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
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  statCard: {
    width: "47%",
    padding: Spacing.lg,
    alignItems: "center",
  },
  statValue: {
    ...Typography.numberLarge,
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  distributionCard: {
    padding: Spacing.lg,
  },
  distributionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  distributionLabel: {
    flexDirection: "row",
    alignItems: "center",
    width: 80,
  },
  levelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.sm,
  },
  levelName: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  distributionBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: Backgrounds.card,
    borderRadius: 4,
    marginHorizontal: Spacing.md,
  },
  distributionBar: {
    height: 8,
    borderRadius: 4,
  },
  distributionCount: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    width: 30,
    textAlign: "right",
  },
  noDataText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    padding: Spacing.lg,
  },
  reportCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
  },
  reportContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  reportText: {
    flex: 1,
  },
  reportTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  reportSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: Spacing.lg,
  },
  reportModalContent: {
    gap: Spacing.md,
  },
  reportStat: {
    alignItems: "center",
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  reportStatValue: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  reportStatLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  reportDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.md,
  },
  reportSubheader: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  reportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  reportRowLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  reportRowText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  reportRowValue: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  rankText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    width: 24,
  },
  levelBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  levelBadgeText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  sessionStatsGrid: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  sessionStatCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  sessionStatValue: {
    ...Typography.h2,
  },
  sessionStatLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionType: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  sessionCoach: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.small,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  revenueHeader: {
    alignItems: "center",
    padding: Spacing.xl,
    backgroundColor: Colors.dark.gold + "20",
    borderRadius: BorderRadius.lg,
  },
  revenueAmount: {
    fontSize: 36,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  revenueLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  coachInfo: {
    flex: 1,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachSpecialty: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  coachStats: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  coachStatText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  utilizationBar: {
    width: 60,
    height: 4,
    backgroundColor: Backgrounds.card,
    borderRadius: 2,
  },
  utilizationFill: {
    height: 4,
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  monthArrow: {
    padding: Spacing.sm,
  },
  monthArrowDisabled: {
    opacity: 0.3,
  },
  monthDisplay: {
    flex: 1,
    alignItems: "center",
  },
  monthText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  loadingContainer: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  netRevenueRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xl,
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  workbookHelper: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  workbookLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  workbookInput: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  ballLevelChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  ballLevelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Backgrounds.card,
  },
  ballLevelChipActive: {
    backgroundColor: GlowColors.primary,
    borderColor: GlowColors.primary,
  },
  ballLevelChipText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  ballLevelChipTextActive: {
    color: Colors.dark.buttonText,
  },
});
