import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Colors, Spacing, BorderRadius, TextColors } from "@/constants/theme";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { WebView } from "react-native-webview";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface MonthlyReport {
  id: string;
  playerId: string;
  monthYear: string;
  sessionsAttended: number;
  sessionsTotal: number;
  pillarHighlights: { pillar: string; score: number; trend: string }[];
  aiProgressSummary: string | null;
  nextMilestone: string | null;
  coachNote: string | null;
  status: string;
  generatedAt: string;
  finalisedAt: string | null;
}

type RouteParams = {
  ParentReports: { playerId: string; childName?: string };
};

function formatMonthYear(monthYear: string): string {
  const [year, month] = monthYear.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function getTrendIcon(trend: string): IoniconName {
  if (trend === "improving") return "arrow-up";
  if (trend === "declining") return "arrow-down";
  return "remove";
}

function getTrendColor(trend: string) {
  if (trend === "improving") return "#10b981";
  if (trend === "declining") return "#ef4444";
  return TextColors.muted;
}

export default function ParentReportsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, "ParentReports">>();
  const { playerId, childName } = route.params;
  const [selectedReport, setSelectedReport] = useState<MonthlyReport | null>(null);
  const [showPdf, setShowPdf] = useState(false);
  const [pdfHtml, setPdfHtml] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const { data: reports = [], isLoading, refetch } = useQuery<MonthlyReport[]>({
    queryKey: ["/api/parent/children", playerId, "reports"],
    queryFn: async () => {
      const url = new URL(`/api/parent/children/${playerId}/reports`, getApiUrl());
      const res = await fetch(url.toString(), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch reports");
      return res.json();
    },
    enabled: !!playerId,
  });

  const handleOpenReport = (report: MonthlyReport) => {
    setSelectedReport(report);
    setShowPdf(false);
    setPdfHtml(null);
  };

  const handleViewPdf = async (report: MonthlyReport) => {
    setLoadingPdf(true);
    try {
      const url = new URL(
        `/api/parent/children/${playerId}/reports/${report.id}/preview`,
        getApiUrl()
      );
      const res = await fetch(url.toString(), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load report");
      const html = await res.text();
      setPdfHtml(html);
      setShowPdf(true);
    } catch {
      Alert.alert("Error", "Could not load the report. Please try again.");
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleExportPdf = async (report: MonthlyReport) => {
    setLoadingPdf(true);
    try {
      const pdfUrl = new URL(
        `/api/parent/children/${playerId}/reports/${report.id}/pdf`,
        getApiUrl()
      );

      if (Platform.OS === "web") {
        const res = await fetch(pdfUrl.toString(), {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error("Failed to load report");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = `monthly-report-${report.monthYear}.pdf`;
        anchor.click();
        URL.revokeObjectURL(blobUrl);
        return;
      }

      const fileUri = `${FileSystem.cacheDirectory}monthly-report-${report.monthYear}.pdf`;
      const downloadResult = await FileSystem.downloadAsync(
        pdfUrl.toString(),
        fileUri,
        { headers: getAuthHeaders() }
      );
      if (downloadResult.status !== 200) {
        throw new Error("Download failed");
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: "application/pdf",
          dialogTitle: `${childName || "Player"} — ${formatMonthYear(report.monthYear)} Report`,
        });
      } else {
        Alert.alert("Success", "PDF saved to your device.");
      }
    } catch {
      Alert.alert("Error", "Could not export the report. Please try again.");
    } finally {
      setLoadingPdf(false);
    }
  };

  if (showPdf && pdfHtml) {
    return (
      <View style={styles.pdfContainer}>
        <Pressable
          style={[styles.pdfBack, { top: insets.top + Spacing.sm }]}
          onPress={() => setShowPdf(false)}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        <WebView source={{ html: pdfHtml }} style={styles.webview} />
        <Pressable
          style={[styles.exportBtn, { bottom: insets.bottom + Spacing.lg }]}
          onPress={() => selectedReport && handleExportPdf(selectedReport)}
          disabled={loadingPdf}
        >
          {loadingPdf ? (
            <ActivityIndicator size="small" color={Colors.dark.buttonText} />
          ) : (
            <>
              <Ionicons name="share-outline" size={20} color={Colors.dark.buttonText} />
              <Text style={styles.exportBtnText}>Export PDF</Text>
            </>
          )}
        </Pressable>
      </View>
    );
  }

  if (selectedReport) {
    const attendanceRate =
      selectedReport.sessionsTotal > 0
        ? Math.round((selectedReport.sessionsAttended / selectedReport.sessionsTotal) * 100)
        : 0;

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
      >
        <View style={styles.detailHeader}>
          <Pressable style={styles.backBtn} onPress={() => setSelectedReport(null)}>
            <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.detailTitle}>{formatMonthYear(selectedReport.monthYear)}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{selectedReport.status === "finalised" ? "Final" : "Draft"}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Attendance</Text>
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{selectedReport.sessionsAttended}</Text>
              <Text style={styles.statLabel}>Attended</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{selectedReport.sessionsTotal}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: attendanceRate >= 80 ? "#10b981" : "#f59e0b" }]}>
                {attendanceRate}%
              </Text>
              <Text style={styles.statLabel}>Rate</Text>
            </View>
          </View>
        </View>

        {selectedReport.aiProgressSummary ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Progress Summary</Text>
            <Text style={styles.summaryText}>{selectedReport.aiProgressSummary}</Text>
          </View>
        ) : null}

        {(selectedReport.pillarHighlights || []).length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Pillar Highlights</Text>
            {selectedReport.pillarHighlights.map((p, i) => (
              <View key={i} style={styles.pillarRow}>
                <Text style={styles.pillarName}>{p.pillar}</Text>
                <View style={styles.pillarRight}>
                  <Text style={styles.pillarScore}>{p.score.toFixed(1)}/2</Text>
                  <Ionicons
                    name={getTrendIcon(p.trend)}
                    size={14}
                    color={getTrendColor(p.trend)}
                    style={{ marginLeft: 4 }}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {selectedReport.nextMilestone ? (
          <View style={[styles.card, styles.milestoneCard]}>
            <View style={styles.milestoneHeader}>
              <Ionicons name="flag" size={18} color="#10b981" />
              <Text style={styles.milestoneLabel}>Next Milestone</Text>
            </View>
            <Text style={styles.milestoneText}>{selectedReport.nextMilestone}</Text>
          </View>
        ) : null}

        {selectedReport.coachNote ? (
          <View style={[styles.card, styles.noteCard]}>
            <View style={styles.noteHeader}>
              <Ionicons name="person-circle" size={18} color="#f59e0b" />
              <Text style={styles.noteLabel}>Coach&apos;s Note</Text>
            </View>
            <Text style={styles.noteText}>{selectedReport.coachNote}</Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            style={styles.viewBtn}
            onPress={() => handleViewPdf(selectedReport)}
            disabled={loadingPdf}
          >
            {loadingPdf ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : (
              <>
                <Ionicons name="eye-outline" size={18} color={Colors.dark.primary} />
                <Text style={styles.viewBtnText}>View Report</Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={styles.shareBtn}
            onPress={() => handleExportPdf(selectedReport)}
            disabled={loadingPdf}
          >
            {loadingPdf ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <>
                <Ionicons name="share-outline" size={18} color={Colors.dark.buttonText} />
                <Text style={styles.shareBtnText}>Export PDF</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <View>
          <Text style={styles.screenTitle}>Monthly Reports</Text>
          {childName ? <Text style={styles.screenSubtitle}>{childName}</Text> : null}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : reports.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={48} color={Colors.dark.disabled} />
          <Text style={styles.emptyTitle}>No Reports Yet</Text>
          <Text style={styles.emptySubtitle}>
            Monthly reports are generated at the end of each month. Check back after the first month.
          </Text>
        </View>
      ) : (
        reports.map((report) => {
          const attendanceRate =
            report.sessionsTotal > 0
              ? Math.round((report.sessionsAttended / report.sessionsTotal) * 100)
              : 0;

          return (
            <Pressable
              key={report.id}
              style={styles.reportCard}
              onPress={() => handleOpenReport(report)}
            >
              <View style={styles.reportCardHeader}>
                <View style={styles.reportCardLeft}>
                  <View style={styles.reportIcon}>
                    <Ionicons name="document-text" size={22} color={Colors.dark.primary} />
                  </View>
                  <View>
                    <Text style={styles.reportMonth}>{formatMonthYear(report.monthYear)}</Text>
                    <Text style={styles.reportMeta}>
                      {report.sessionsAttended}/{report.sessionsTotal} sessions &bull; {attendanceRate}%
                    </Text>
                  </View>
                </View>
                <View style={styles.reportCardRight}>
                  {report.status === "finalised" ? (
                    <View style={styles.finalisedBadge}>
                      <Text style={styles.finalisedText}>Final</Text>
                    </View>
                  ) : (
                    <View style={styles.draftBadge}>
                      <Text style={styles.draftText}>Draft</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={Colors.dark.text} style={{ opacity: 0.4 }} />
                </View>
              </View>
              {report.aiProgressSummary ? (
                <Text style={styles.reportPreview} numberOfLines={2}>
                  {report.aiProgressSummary}
                </Text>
              ) : null}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundDefault,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  screenSubtitle: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["2xl"],
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
    textAlign: "center",
    lineHeight: 20,
  },
  reportCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  reportCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reportCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  reportIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  reportMonth: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  reportMeta: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  reportCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  finalisedBadge: {
    backgroundColor: "#10b98120",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  finalisedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#10b981",
  },
  draftBadge: {
    backgroundColor: "#f59e0b20",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  draftText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#f59e0b",
  },
  reportPreview: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.7,
    marginTop: Spacing.sm,
    lineHeight: 19,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    flex: 1,
  },
  statusBadge: {
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  card: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  statRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  statNum: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  summaryText: {
    fontSize: 15,
    color: Colors.dark.text,
    lineHeight: 24,
  },
  pillarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  pillarName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  pillarRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  pillarScore: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  milestoneCard: {
    borderWidth: 1,
    borderColor: "#10b98130",
  },
  milestoneHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  milestoneLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10b981",
    textTransform: "uppercase",
  },
  milestoneText: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 21,
  },
  noteCard: {
    borderWidth: 1,
    borderColor: "#f59e0b30",
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#f59e0b",
    textTransform: "uppercase",
  },
  noteText: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 21,
    fontStyle: "italic",
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  viewBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  viewBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  shareBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.primary,
  },
  shareBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  pdfContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  pdfBack: {
    position: "absolute",
    left: Spacing.lg,
    zIndex: 100,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  webview: {
    flex: 1,
  },
  exportBtn: {
    position: "absolute",
    right: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  exportBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
}));
