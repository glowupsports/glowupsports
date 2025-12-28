import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

interface PendingBio {
  id: string;
  name: string;
  email: string;
  academy?: string;
  yearsExperience?: number;
  backgroundTags: string[];
  philosophyTags: string[];
  publicQuote?: string;
  submittedAt?: string;
}

interface PendingBioRowProps {
  bio: PendingBio;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isLoading: boolean;
}

function PendingBioRow({ bio, onApprove, onReject, isLoading }: PendingBioRowProps) {
  const experienceLabel = bio.yearsExperience 
    ? bio.yearsExperience.toString()
    : "Not specified";

  return (
    <View style={styles.bioRow}>
      <View style={styles.bioHeader}>
        <View style={styles.bioAvatar}>
          <Ionicons name="person" size={20} color={PLATFORM_COLOR} />
        </View>
        <View style={styles.bioInfo}>
          <Text style={styles.bioName}>{bio.name}</Text>
          <Text style={styles.bioAcademy}>{bio.academy || "No academy"}</Text>
        </View>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>Pending</Text>
        </View>
      </View>
      
      <View style={styles.bioDetails}>
        <View style={styles.bioDetailRow}>
          <Text style={styles.bioLabel}>Experience:</Text>
          <Text style={styles.bioValue}>{experienceLabel}</Text>
        </View>
        
        {bio.backgroundTags.length > 0 ? (
          <View style={styles.bioDetailRow}>
            <Text style={styles.bioLabel}>Background:</Text>
            <View style={styles.tagsRow}>
              {bio.backgroundTags.slice(0, 3).map((tag, i) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        
        {bio.philosophyTags.length > 0 ? (
          <View style={styles.bioDetailRow}>
            <Text style={styles.bioLabel}>Philosophy:</Text>
            <View style={styles.tagsRow}>
              {bio.philosophyTags.slice(0, 2).map((tag, i) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        
        {bio.publicQuote ? (
          <View style={styles.quoteBox}>
            <Ionicons name="chatbubble-ellipses" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.quoteText}>"{bio.publicQuote}"</Text>
          </View>
        ) : null}
      </View>
      
      <View style={styles.bioActions}>
        <Pressable 
          style={[styles.actionButton, styles.rejectButton]}
          onPress={() => onReject(bio.id)}
          disabled={isLoading}
        >
          <Ionicons name="close" size={16} color={Colors.dark.error} />
          <Text style={[styles.actionButtonText, { color: Colors.dark.error }]}>Reject</Text>
        </Pressable>
        <Pressable 
          style={[styles.actionButton, styles.approveButton]}
          onPress={() => onApprove(bio.id)}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.dark.primary} />
          ) : (
            <>
              <Ionicons name="checkmark" size={16} color={Colors.dark.primary} />
              <Text style={[styles.actionButtonText, { color: Colors.dark.primary }]}>Approve</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

interface CoachRowProps {
  name: string;
  academy: string;
  sessions: number;
  players: number;
  xpAwarded: number;
  burnoutRisk: "low" | "medium" | "high";
  lastActive: string;
}

function CoachRow({ name, academy, sessions, players, xpAwarded, burnoutRisk, lastActive }: CoachRowProps) {
  const riskConfig = {
    low: { color: Colors.dark.primary, label: "Low Risk" },
    medium: { color: Colors.dark.orange, label: "Medium" },
    high: { color: Colors.dark.error, label: "High Risk" },
  };

  const config = riskConfig[burnoutRisk];

  return (
    <View style={styles.coachRow}>
      <View style={styles.coachHeader}>
        <View style={styles.coachAvatar}>
          <Ionicons name="person" size={20} color={Colors.dark.primary} />
        </View>
        <View style={styles.coachInfo}>
          <Text style={styles.coachName}>{name}</Text>
          <Text style={styles.coachAcademy}>{academy}</Text>
        </View>
        <View style={[styles.riskBadge, { backgroundColor: `${config.color}20` }]}>
          <Text style={[styles.riskText, { color: config.color }]}>{config.label}</Text>
        </View>
      </View>
      
      <View style={styles.coachStats}>
        <View style={styles.coachStat}>
          <Text style={styles.statValue}>{sessions}</Text>
          <Text style={styles.statLabel}>Sessions/wk</Text>
        </View>
        <View style={styles.coachStat}>
          <Text style={styles.statValue}>{players}</Text>
          <Text style={styles.statLabel}>Players</Text>
        </View>
        <View style={styles.coachStat}>
          <Text style={[styles.statValue, { color: Colors.dark.xpCyan }]}>{xpAwarded}</Text>
          <Text style={styles.statLabel}>XP/week</Text>
        </View>
      </View>
      
      <Text style={styles.lastActive}>Last active: {lastActive}</Text>
    </View>
  );
}

export default function CoachHealthScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: pendingBiosData, isLoading: loadingPendingBios } = useQuery<{ pendingBios: PendingBio[] }>({
    queryKey: ["/api/platform/pending-bios"],
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ coachId, action, rejectionReason }: { coachId: string; action: "approve" | "reject"; rejectionReason?: string }) => {
      return apiRequest("POST", `/api/platform/review-bio/${coachId}`, { action, rejectionReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/pending-bios"] });
    },
  });

  const handleApprove = (coachId: string) => {
    reviewMutation.mutate({ coachId, action: "approve" });
  };

  const handleReject = (coachId: string) => {
    const showRejectDialog = () => {
      if (Platform.OS === "web") {
        const reason = window.prompt("Enter rejection reason (optional):");
        reviewMutation.mutate({ coachId, action: "reject", rejectionReason: reason || undefined });
      } else {
        Alert.alert(
          "Reject Bio",
          "Are you sure you want to reject this coach bio?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Reject", style: "destructive", onPress: () => {
              reviewMutation.mutate({ coachId, action: "reject" });
            }},
          ]
        );
      }
    };
    showRejectDialog();
  };

  const healthStats = {
    totalCoaches: 47,
    activeThisWeek: 42,
    atRisk: 5,
    avgSessionsPerCoach: 8.3,
    avgXpAwarded: 245,
  };

  const coaches: CoachRowProps[] = [
    { name: "Sarah Johnson", academy: "Tennis Academy Pro", sessions: 12, players: 8, xpAwarded: 320, burnoutRisk: "high", lastActive: "2 hours ago" },
    { name: "Mike Chen", academy: "Elite Tennis Club", sessions: 8, players: 6, xpAwarded: 245, burnoutRisk: "low", lastActive: "1 hour ago" },
    { name: "Emma Davis", academy: "Junior Champions", sessions: 10, players: 7, xpAwarded: 280, burnoutRisk: "medium", lastActive: "30 min ago" },
    { name: "James Wilson", academy: "City Tennis Center", sessions: 6, players: 5, xpAwarded: 180, burnoutRisk: "low", lastActive: "3 hours ago" },
    { name: "Lisa Park", academy: "Tennis Academy Pro", sessions: 14, players: 10, xpAwarded: 380, burnoutRisk: "high", lastActive: "45 min ago" },
  ];

  const atRiskCoaches = coaches.filter(c => c.burnoutRisk === "high" || c.burnoutRisk === "medium");
  const pendingBios = pendingBiosData?.pendingBios || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Coach Health</Text>
          <Text style={styles.subtitle}>Monitor coach workload and bio approvals</Text>
        </View>

        {pendingBios.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text" size={20} color={PLATFORM_COLOR} />
              <Text style={styles.sectionTitle}>Pending Bio Reviews</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{pendingBios.length}</Text>
              </View>
            </View>
            <View style={[styles.coachesCard, CardStyles.elevated]}>
              {pendingBios.map((bio) => (
                <PendingBioRow 
                  key={bio.id} 
                  bio={bio} 
                  onApprove={handleApprove}
                  onReject={handleReject}
                  isLoading={reviewMutation.isPending}
                />
              ))}
            </View>
          </View>
        ) : loadingPendingBios ? (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="small" color={PLATFORM_COLOR} />
          </View>
        ) : null}

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, CardStyles.elevated]}>
            <Text style={[styles.statNumber, { color: Colors.dark.primary }]}>{healthStats.totalCoaches}</Text>
            <Text style={styles.statLabel}>Total Coaches</Text>
          </View>
          <View style={[styles.statCard, CardStyles.elevated]}>
            <Text style={[styles.statNumber, { color: Colors.dark.xpCyan }]}>{healthStats.activeThisWeek}</Text>
            <Text style={styles.statLabel}>Active This Week</Text>
          </View>
          <View style={[styles.statCard, CardStyles.elevated]}>
            <Text style={[styles.statNumber, { color: Colors.dark.error }]}>{healthStats.atRisk}</Text>
            <Text style={styles.statLabel}>At Risk</Text>
          </View>
        </View>

        <View style={[styles.avgCard, CardStyles.elevated]}>
          <View style={styles.avgRow}>
            <View style={styles.avgItem}>
              <Ionicons name="calendar" size={20} color={Colors.dark.textMuted} />
              <View>
                <Text style={styles.avgValue}>{healthStats.avgSessionsPerCoach}</Text>
                <Text style={styles.avgLabel}>Avg Sessions/Coach</Text>
              </View>
            </View>
            <View style={styles.avgItem}>
              <Ionicons name="flash" size={20} color={Colors.dark.xpCyan} />
              <View>
                <Text style={[styles.avgValue, { color: Colors.dark.xpCyan }]}>{healthStats.avgXpAwarded}</Text>
                <Text style={styles.avgLabel}>Avg XP Awarded</Text>
              </View>
            </View>
          </View>
        </View>

        {atRiskCoaches.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning" size={20} color={Colors.dark.orange} />
              <Text style={styles.sectionTitle}>Coaches At Risk</Text>
            </View>
            <View style={[styles.coachesCard, CardStyles.elevated]}>
              {atRiskCoaches.map((coach, index) => (
                <CoachRow key={index} {...coach} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All Coaches</Text>
          <View style={[styles.coachesCard, CardStyles.elevated]}>
            {coaches.map((coach, index) => (
              <CoachRow key={index} {...coach} />
            ))}
          </View>
        </View>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h1,
    color: PLATFORM_COLOR,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  loadingSection: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  statsGrid: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  statNumber: {
    ...Typography.h2,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    fontSize: 10,
  },
  avgCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  avgRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  avgItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  avgValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  avgLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  countBadge: {
    backgroundColor: PLATFORM_COLOR,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  countBadgeText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    fontSize: 11,
  },
  coachesCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  coachRow: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  coachHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  coachAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  coachInfo: {
    flex: 1,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachAcademy: {
    ...Typography.small,
    color: PLATFORM_COLOR,
  },
  riskBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  riskText: {
    ...Typography.small,
    fontSize: 10,
    fontWeight: "600",
  },
  coachStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: Spacing.xs,
  },
  coachStat: {
    alignItems: "center",
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  lastActive: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "right",
    fontSize: 10,
  },
  bioRow: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  bioHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  bioAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(155, 89, 182, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  bioInfo: {
    flex: 1,
  },
  bioName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  bioAcademy: {
    ...Typography.small,
    color: PLATFORM_COLOR,
  },
  pendingBadge: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  pendingBadgeText: {
    ...Typography.small,
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  bioDetails: {
    marginBottom: Spacing.md,
  },
  bioDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  bioLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    width: 80,
  },
  bioValue: {
    ...Typography.small,
    color: Colors.dark.text,
    flex: 1,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    flex: 1,
  },
  tag: {
    backgroundColor: "rgba(155, 89, 182, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  tagText: {
    ...Typography.small,
    fontSize: 10,
    color: PLATFORM_COLOR,
  },
  quoteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  quoteText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
    flex: 1,
  },
  bioActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.md,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
  },
  rejectButton: {
    backgroundColor: "rgba(255, 68, 68, 0.1)",
  },
  approveButton: {
    backgroundColor: "rgba(46, 204, 64, 0.1)",
  },
  actionButtonText: {
    ...Typography.small,
    fontWeight: "600",
  },
});
