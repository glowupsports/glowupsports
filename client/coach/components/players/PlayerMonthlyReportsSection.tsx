import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { WebView } from "react-native-webview";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl, apiRequest, getAuthHeaders } from "@/lib/query-client";
import { styles } from "./playersStyles";

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
  playerName?: string;
  academyName?: string;
}

interface Props {
  playerId: string;
  playerName: string;
}

function formatMonthYear(monthYear: string): string {
  const [year, month] = monthYear.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getCurrentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getPreviousMonthYear(): string {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function PlayerMonthlyReportsSection({ playerId, playerName }: Props) {
  const queryClient = useQueryClient();
  const [selectedReport, setSelectedReport] = useState<MonthlyReport | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: reports = [], isLoading, refetch } = useQuery<MonthlyReport[]>({
    queryKey: ["/api/coach/players", playerId, "monthly-reports"],
    queryFn: async () => {
      const url = new URL(`/api/coach/players/${playerId}/monthly-reports`, getApiUrl());
      const res = await fetch(url.toString(), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch reports");
      return res.json();
    },
    enabled: !!playerId,
  });

  const saveNoteMutation = useMutation({
    mutationFn: async ({ reportId, note }: { reportId: string; note: string }) => {
      return apiRequest("PATCH", `/api/coach/players/${playerId}/monthly-reports/${reportId}/note`, {
        coachNote: note,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/players", playerId, "monthly-reports"] });
      setShowNoteEditor(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Your note has been saved to the report.");
    },
    onError: () => {
      Alert.alert("Error", "Failed to save note. Please try again.");
    },
  });

  const finaliseReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      return apiRequest("POST", `/api/coach/players/${playerId}/monthly-reports/${reportId}/finalise`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/players", playerId, "monthly-reports"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Finalised", "The report has been marked as final and is now visible to parents.");
    },
    onError: () => {
      Alert.alert("Error", "Failed to finalise report.");
    },
  });

  const handleGenerateReport = async (monthYear?: string) => {
    const targetMonth = monthYear || getPreviousMonthYear();
    setIsGenerating(true);
    try {
      const url = new URL(`/api/coach/players/${playerId}/monthly-reports/generate`, getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ monthYear: targetMonth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      await refetch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Generated", `Report for ${formatMonthYear(targetMonth)} has been generated.`);
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to generate report.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreview = async (report: MonthlyReport) => {
    setLoadingPreview(true);
    try {
      const url = new URL(
        `/api/coach/players/${playerId}/monthly-reports/${report.id}/preview`,
        getApiUrl()
      );
      const res = await fetch(url.toString(), { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to load preview");
      const html = await res.text();
      setPreviewHtml(html);
      setSelectedReport(report);
      setShowPreview(true);
    } catch {
      Alert.alert("Error", "Could not load the preview.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExportPdf = async (report: MonthlyReport) => {
    try {
      const url = new URL(
        `/api/coach/players/${playerId}/monthly-reports/${report.id}/preview`,
        getApiUrl()
      );
      const res = await fetch(url.toString(), { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to load report");
      const html = await res.text();

      if (Platform.OS === "web") {
        const blob = new Blob([html], { type: "text/html" });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
        return;
      }

      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `${playerName} — ${formatMonthYear(report.monthYear)} Report`,
        });
      } else {
        Alert.alert("Success", "PDF saved to your device.");
      }
    } catch {
      Alert.alert("Error", "Could not export the report.");
    }
  };

  if (showPreview && previewHtml) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setShowPreview(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={previewStyles.previewHeader}>
            <Pressable onPress={() => setShowPreview(false)} style={previewStyles.closeBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <Text style={previewStyles.previewTitle}>
              {selectedReport ? formatMonthYear(selectedReport.monthYear) : "Preview"}
            </Text>
            <Pressable
              onPress={() => selectedReport && handleExportPdf(selectedReport)}
              style={previewStyles.exportBtn}
            >
              <Ionicons name="share-outline" size={18} color={Colors.dark.primary} />
              <Text style={previewStyles.exportText}>Export</Text>
            </Pressable>
          </View>
          <WebView source={{ html: previewHtml }} style={{ flex: 1 }} />
          {selectedReport?.status !== "finalised" ? (
            <View style={previewStyles.finaliseBar}>
              <Pressable
                style={[previewStyles.finaliseBtn, finaliseReportMutation.isPending && { opacity: 0.6 }]}
                disabled={finaliseReportMutation.isPending}
                onPress={() => {
                  if (!selectedReport) return;
                  Alert.alert(
                    "Finalise Report",
                    "This will mark the report as final and make it visible to parents. Continue?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Finalise",
                        style: "default",
                        onPress: () => {
                          setShowPreview(false);
                          finaliseReportMutation.mutate(selectedReport.id);
                        },
                      },
                    ]
                  );
                }}
              >
                {finaliseReportMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <Text style={previewStyles.finaliseBtnText}>Mark as Final</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    );
  }

  return (
    <View style={{ padding: Spacing.lg }}>
      <View style={sectionStyles.headerRow}>
        <Text style={sectionStyles.sectionTitle}>Monthly Reports</Text>
        <Pressable
          style={[sectionStyles.generateBtn, isGenerating && { opacity: 0.6 }]}
          onPress={() => handleGenerateReport()}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator size="small" color={Colors.dark.primary} />
          ) : (
            <>
              <Ionicons name="refresh" size={14} color={Colors.dark.primary} />
              <Text style={sectionStyles.generateBtnText}>Generate</Text>
            </>
          )}
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: Spacing.lg }} />
      ) : reports.length === 0 ? (
        <View style={sectionStyles.emptyBox}>
          <Ionicons name="document-text-outline" size={36} color={Colors.dark.disabled} />
          <Text style={sectionStyles.emptyTitle}>No reports yet</Text>
          <Text style={sectionStyles.emptySubtitle}>
            Tap Generate to create a report for last month.
          </Text>
        </View>
      ) : (
        reports.map((report) => {
          const rate =
            report.sessionsTotal > 0
              ? Math.round((report.sessionsAttended / report.sessionsTotal) * 100)
              : 0;
          return (
            <View key={report.id} style={sectionStyles.reportCard}>
              <View style={sectionStyles.reportTop}>
                <View style={sectionStyles.reportLeft}>
                  <Text style={sectionStyles.reportMonth}>{formatMonthYear(report.monthYear)}</Text>
                  <Text style={sectionStyles.reportMeta}>
                    {report.sessionsAttended}/{report.sessionsTotal} sessions &bull; {rate}%
                  </Text>
                </View>
                {report.status === "finalised" ? (
                  <View style={sectionStyles.finalisedBadge}>
                    <Text style={sectionStyles.finalisedText}>Final</Text>
                  </View>
                ) : (
                  <View style={sectionStyles.draftBadge}>
                    <Text style={sectionStyles.draftText}>Draft</Text>
                  </View>
                )}
              </View>

              {report.aiProgressSummary ? (
                <Text style={sectionStyles.summaryPreview} numberOfLines={2}>
                  {report.aiProgressSummary}
                </Text>
              ) : null}

              {report.coachNote ? (
                <View style={sectionStyles.notePreview}>
                  <Ionicons name="pencil" size={13} color="#f59e0b" />
                  <Text style={sectionStyles.notePreviewText} numberOfLines={1}>
                    {report.coachNote}
                  </Text>
                </View>
              ) : null}

              <View style={sectionStyles.actionRow}>
                <Pressable
                  style={sectionStyles.actionBtn}
                  onPress={() => {
                    setSelectedReport(report);
                    setNoteText(report.coachNote || "");
                    setShowNoteEditor(true);
                  }}
                >
                  <Ionicons name="pencil-outline" size={14} color={Colors.dark.text} />
                  <Text style={sectionStyles.actionBtnText}>Add Note</Text>
                </Pressable>
                <Pressable
                  style={sectionStyles.actionBtn}
                  onPress={() => handlePreview(report)}
                  disabled={loadingPreview}
                >
                  {loadingPreview ? (
                    <ActivityIndicator size="small" color={Colors.dark.primary} />
                  ) : (
                    <>
                      <Ionicons name="eye-outline" size={14} color={Colors.dark.primary} />
                      <Text style={[sectionStyles.actionBtnText, { color: Colors.dark.primary }]}>
                        Preview
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      <Modal
        visible={showNoteEditor}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNoteEditor(false)}
      >
        <View style={noteStyles.overlay}>
          <View style={noteStyles.sheet}>
            <View style={noteStyles.sheetHeader}>
              <Text style={noteStyles.sheetTitle}>Personal Note</Text>
              <Pressable onPress={() => setShowNoteEditor(false)}>
                <Ionicons name="close" size={22} color={Colors.dark.text} />
              </Pressable>
            </View>
            <Text style={noteStyles.sheetSubtitle}>
              Add a short personal message to {playerName}'s monthly report for their parent.
            </Text>
            <TextInput
              style={noteStyles.textInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="e.g. Great attitude this month. Keep up the effort!"
              placeholderTextColor={Colors.dark.disabled}
              multiline
              numberOfLines={4}
              maxLength={400}
            />
            <Text style={noteStyles.charCount}>{noteText.length}/400</Text>
            <Pressable
              style={[noteStyles.saveBtn, saveNoteMutation.isPending && { opacity: 0.6 }]}
              disabled={saveNoteMutation.isPending}
              onPress={() => {
                if (!selectedReport) return;
                saveNoteMutation.mutate({ reportId: selectedReport.id, note: noteText });
              }}
            >
              {saveNoteMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <Text style={noteStyles.saveBtnText}>Save Note</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const sectionStyles = {
  headerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  generateBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  generateBtnText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.dark.primary,
  },
  emptyBox: {
    alignItems: "center" as const,
    padding: Spacing.xl,
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.5,
    textAlign: "center" as const,
  },
  reportCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  reportTop: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 6,
  },
  reportLeft: {
    flex: 1,
  },
  reportMonth: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  reportMeta: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.5,
    marginTop: 2,
  },
  finalisedBadge: {
    backgroundColor: "#10b98120",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  finalisedText: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: "#10b981",
  },
  draftBadge: {
    backgroundColor: "#f59e0b20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  draftText: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: "#f59e0b",
  },
  summaryPreview: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.65,
    lineHeight: 18,
    marginBottom: 6,
  },
  notePreview: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    marginBottom: 8,
  },
  notePreviewText: {
    fontSize: 12,
    color: "#f59e0b",
    flex: 1,
  },
  actionRow: {
    flexDirection: "row" as const,
    gap: Spacing.sm,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
};

const previewStyles = {
  previewHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: "#111",
    padding: Spacing.lg,
    paddingTop: 56,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#fff",
    flex: 1,
    textAlign: "center" as const,
  },
  exportBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  exportText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.dark.primary,
  },
  finaliseBar: {
    backgroundColor: "#111",
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  finaliseBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: "center" as const,
  },
  finaliseBtnText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.dark.buttonText,
  },
};

const noteStyles = {
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end" as const,
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.xl,
    paddingBottom: 40,
  },
  sheetHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: Spacing.sm,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  textInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: "top" as const,
    marginBottom: 6,
  },
  charCount: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.4,
    textAlign: "right" as const,
    marginBottom: Spacing.md,
  },
  saveBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: "center" as const,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: Colors.dark.buttonText,
  },
};
