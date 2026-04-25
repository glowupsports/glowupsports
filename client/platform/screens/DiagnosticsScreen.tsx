import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, BorderRadius, CardStyles, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const PLATFORM_COLOR = "#9B59B6";

interface DiagnosticReport {
  id: string;
  errorId: string;
  userId: string | null;
  academyId: string | null;
  userRole: string | null;
  severity: string;
  message: string;
  stack: string | null;
  screen: string | null;
  context: Record<string, any> | null;
  userComment: string | null;
  platform: string | null;
  appVersion: string | null;
  deviceInfo: string | null;
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  createdAt: string;
}

interface DiagnosticsStats {
  total: number;
  new: number;
  investigating: number;
  resolved: number;
  bySeverity: Record<string, number>;
}

export default function DiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<DiagnosticReport | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery<{ reports: DiagnosticReport[]; stats: DiagnosticsStats }>({
    queryKey: ["/api/platform/diagnostics"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const response = await apiRequest("PUT", `/api/platform/diagnostics/${id}`, { status, resolutionNotes: notes });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/diagnostics"] });
      setSelectedReport(null);
      setResolutionNotes("");
    },
  });

  const reports = data?.reports || [];
  const stats = data?.stats || { total: 0, new: 0, investigating: 0, resolved: 0, bySeverity: {} };

  const severityConfig = {
    critical: { color: "#FF3B30", icon: "flame" as const, label: "Critical" },
    error: { color: Colors.dark.error, icon: "alert-circle" as const, label: "Error" },
    warning: { color: Colors.dark.orange, icon: "warning" as const, label: "Warning" },
    ui_issue: { color: "#9B59B6", icon: "flag" as const, label: "UI Issue" },
  };

  const statusConfig = {
    new: { color: Colors.dark.xpCyan, label: "New" },
    investigating: { color: Colors.dark.orange, label: "Investigating" },
    resolved: { color: Colors.dark.primary, label: "Resolved" },
    ignored: { color: Colors.dark.textMuted, label: "Ignored" },
  };

  const filterStatuses = [
    { key: null, label: "All" },
    { key: "new", label: "New" },
    { key: "investigating", label: "Investigating" },
    { key: "resolved", label: "Resolved" },
  ];

  const filteredReports = reports.filter(report => {
    const matchesSearch = 
      report.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (report.screen?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (report.userRole?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus ? report.status === filterStatus : true;
    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Diagnostics</Text>
        <Pressable style={styles.refreshButton} onPress={() => refetch()}>
          <Ionicons name="refresh" size={24} color={PLATFORM_COLOR} />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: "rgba(0,212,255,0.15)" }]}>
          <Text style={[styles.statValue, { color: Colors.dark.xpCyan }]}>{stats.new}</Text>
          <Text style={styles.statLabel}>New</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: "rgba(255,165,0,0.15)" }]}>
          <Text style={[styles.statValue, { color: Colors.dark.orange }]}>{stats.investigating}</Text>
          <Text style={styles.statLabel}>Investigating</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: "rgba(46,204,64,0.15)" }]}>
          <Text style={[styles.statValue, { color: Colors.dark.primary }]}>{stats.resolved}</Text>
          <Text style={styles.statLabel}>Resolved</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: "rgba(155,89,182,0.15)" }]}>
          <Text style={[styles.statValue, { color: PLATFORM_COLOR }]}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.dark.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search errors..."
          placeholderTextColor={Colors.dark.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filtersContainer}
      >
        {filterStatuses.map((filter) => (
          <Pressable
            key={filter.key || "all"}
            style={[
              styles.filterChip,
              filterStatus === filter.key && styles.filterChipActive
            ]}
            onPress={() => setFilterStatus(filter.key)}
          >
            <Text style={[
              styles.filterChipText,
              filterStatus === filter.key && styles.filterChipTextActive
            ]}>
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={PLATFORM_COLOR} />
          }
        >
          {filteredReports.map((report) => {
            const severity = severityConfig[report.severity as keyof typeof severityConfig] || severityConfig.error;
            const status = statusConfig[report.status as keyof typeof statusConfig] || statusConfig.new;
            
            return (
              <Pressable 
                key={report.id} 
                style={[styles.reportCard, CardStyles.elevated]}
                onPress={() => setSelectedReport(report)}
              >
                <View style={styles.reportHeader}>
                  <View style={[styles.severityIcon, { backgroundColor: `${severity.color}20` }]}>
                    <Ionicons name={severity.icon} size={18} color={severity.color} />
                  </View>
                  <View style={styles.reportInfo}>
                    <Text style={styles.reportMessage} numberOfLines={2}>{report.message}</Text>
                    <View style={styles.reportMeta}>
                      <Text style={styles.reportTime}>{formatDate(report.createdAt)}</Text>
                      {report.platform ? (
                        <View style={styles.platformBadge}>
                          <Ionicons 
                            name={report.platform === "ios" ? "logo-apple" : report.platform === "android" ? "logo-android" : "globe"} 
                            size={12} 
                            color={Colors.dark.textMuted} 
                          />
                          <Text style={styles.platformText}>{report.platform}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${status.color}20` }]}>
                    <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>
                {report.userRole ? (
                  <View style={styles.roleBadge}>
                    <Ionicons name="person-outline" size={12} color={Colors.dark.textMuted} />
                    <Text style={styles.roleText}>{report.userRole}</Text>
                  </View>
                ) : null}
                {report.userComment ? (
                  <Text style={styles.userComment} numberOfLines={1}>
                    User: &quot;{report.userComment}&quot;
                  </Text>
                ) : null}
              </Pressable>
            );
          })}

          {filteredReports.length === 0 && !isLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="bug-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No error reports found</Text>
              <Text style={styles.emptySubtext}>That&apos;s a good thing!</Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      <Modal
        visible={!!selectedReport}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedReport(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Error Details</Text>
              <Pressable onPress={() => setSelectedReport(null)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            {selectedReport ? (
              <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Message</Text>
                  <Text style={styles.detailValue}>{selectedReport.message}</Text>
                </View>

                <View style={styles.detailRow}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Severity</Text>
                    <Text style={[styles.detailValue, { color: severityConfig[selectedReport.severity as keyof typeof severityConfig]?.color || Colors.dark.error }]}>
                      {selectedReport.severity}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <Text style={[styles.detailValue, { color: statusConfig[selectedReport.status as keyof typeof statusConfig]?.color || Colors.dark.text }]}>
                      {selectedReport.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Platform</Text>
                    <Text style={styles.detailValue}>{selectedReport.platform || "Unknown"}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>App Version</Text>
                    <Text style={styles.detailValue}>{selectedReport.appVersion || "Unknown"}</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>User Role</Text>
                    <Text style={styles.detailValue}>{selectedReport.userRole || "Unknown"}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Screen</Text>
                    <Text style={styles.detailValue}>{selectedReport.screen || "Unknown"}</Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Device</Text>
                  <Text style={styles.detailValue}>{selectedReport.deviceInfo || "Unknown"}</Text>
                </View>

                {selectedReport.userComment ? (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>User Comment</Text>
                    <Text style={styles.userCommentFull}>{selectedReport.userComment}</Text>
                  </View>
                ) : null}

                {selectedReport.stack ? (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Stack Trace</Text>
                    <ScrollView style={styles.stackContainer} horizontal>
                      <Text style={styles.stackText} selectable>{selectedReport.stack}</Text>
                    </ScrollView>
                  </View>
                ) : null}

                {selectedReport.status !== "resolved" ? (
                  <View style={styles.actionSection}>
                    <Text style={styles.detailLabel}>Resolution Notes (optional)</Text>
                    <TextInput
                      style={styles.notesInput}
                      placeholder="Add notes about the fix..."
                      placeholderTextColor={Colors.dark.textMuted}
                      value={resolutionNotes}
                      onChangeText={setResolutionNotes}
                      multiline
                    />

                    <View style={styles.actionButtons}>
                      {selectedReport.status === "new" ? (
                        <Pressable
                          style={[styles.actionButton, { backgroundColor: Colors.dark.orange }]}
                          onPress={() => updateStatusMutation.mutate({ id: selectedReport.id, status: "investigating" })}
                        >
                          <Text style={styles.actionButtonText}>Mark Investigating</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={[styles.actionButton, { backgroundColor: Colors.dark.primary }]}
                        onPress={() => updateStatusMutation.mutate({ id: selectedReport.id, status: "resolved", notes: resolutionNotes })}
                      >
                        <Text style={styles.actionButtonText}>Mark Resolved</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : selectedReport.resolutionNotes ? (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Resolution Notes</Text>
                    <Text style={styles.detailValue}>{selectedReport.resolutionNotes}</Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
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
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  topBarTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.dark.text,
  },
  filtersScroll: {
    maxHeight: 40,
    marginBottom: Spacing.md,
  },
  filtersContainer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  filterChipActive: {
    backgroundColor: PLATFORM_COLOR,
  },
  filterChipText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  filterChipTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  reportCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  reportHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  severityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  reportInfo: {
    flex: 1,
  },
  reportMessage: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  reportMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  reportTime: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  platformBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  platformText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.sm,
  },
  roleText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    textTransform: "capitalize",
  },
  userComment: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
    marginTop: Spacing.xs,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: 18,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  modalContent: {
    padding: Spacing.lg,
  },
  detailSection: {
    marginBottom: Spacing.lg,
  },
  detailRow: {
    flexDirection: "row",
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 16,
    color: Colors.dark.text,
  },
  userCommentFull: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  stackContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    maxHeight: 200,
  },
  stackText: {
    fontSize: 12,
    color: Colors.dark.error,
    fontFamily: "monospace",
  },
  actionSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  notesInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: Spacing.md,
  },
  actionButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  actionButtonText: {
    color: Colors.dark.text,
    fontWeight: "600",
    fontSize: 16,
  },
});
