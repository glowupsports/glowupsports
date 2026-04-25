import React, { } from "react";
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

interface PendingOwnerProfile {
  academyId: string;
  academyName: string;
  ownerName: string;
  role: string;
  yearsInSports?: string;
  backgroundTags: string[];
  visionTags: string[];
  publicMessage?: string;
  createdAt?: string;
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

interface CoachHealthData {
  healthStats: {
    totalCoaches: number;
    activeThisWeek: number;
    atRisk: number;
    avgSessionsPerCoach: number;
    avgXpAwarded: number;
  };
  coaches: CoachRowProps[];
}

interface PendingBioRowProps {
  bio: PendingBio;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isLoading: boolean;
}

interface PendingOwnerProfileRowProps {
  profile: PendingOwnerProfile;
  onApprove: (academyId: string) => void;
  onReject: (academyId: string) => void;
  isLoading: boolean;
}

function PendingOwnerProfileRow({ profile, onApprove, onReject, isLoading }: PendingOwnerProfileRowProps) {
  const roleLabels: Record<string, string> = {
    owner: "Owner",
    director: "Director",
    founder: "Founder",
  };

  const visionLabels: Record<string, string> = {
    player_development: "Player Development",
    long_term_growth: "Long-term Growth",
    fun_confidence: "Fun & Confidence",
    performance_pathway: "Performance Pathway",
    community: "Community",
  };

  return (
    <View style={styles.bioRow}>
      <View style={styles.bioHeader}>
        <View style={[styles.bioAvatar, { backgroundColor: "rgba(255, 215, 0, 0.2)" }]}>
          <Ionicons name="business" size={20} color={Colors.dark.gold} />
        </View>
        <View style={styles.bioInfo}>
          <Text style={styles.bioName}>{profile.ownerName}</Text>
          <Text style={styles.bioAcademy}>{profile.academyName}</Text>
        </View>
        <View style={[styles.pendingBadge, { backgroundColor: "rgba(255, 215, 0, 0.1)" }]}>
          <Text style={[styles.pendingBadgeText, { color: Colors.dark.gold }]}>
            {roleLabels[profile.role] || profile.role}
          </Text>
        </View>
      </View>
      
      <View style={styles.bioDetails}>
        {profile.yearsInSports ? (
          <View style={styles.bioDetailRow}>
            <Text style={styles.bioLabel}>Experience:</Text>
            <Text style={styles.bioValue}>{profile.yearsInSports}</Text>
          </View>
        ) : null}
        
        {profile.visionTags.length > 0 ? (
          <View style={styles.bioDetailRow}>
            <Text style={styles.bioLabel}>Vision:</Text>
            <View style={styles.tagsRow}>
              {profile.visionTags.slice(0, 3).map((tag, i) => (
                <View key={i} style={[styles.tag, { backgroundColor: "rgba(255, 215, 0, 0.1)" }]}>
                  <Text style={[styles.tagText, { color: Colors.dark.gold }]}>
                    {visionLabels[tag] || tag}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        
        {profile.publicMessage ? (
          <View style={styles.quoteBox}>
            <Ionicons name="megaphone" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.quoteText}>&quot;{profile.publicMessage}&quot;</Text>
          </View>
        ) : null}
      </View>
      
      <View style={styles.bioActions}>
        <Pressable 
          style={[styles.actionButton, styles.rejectButton]}
          onPress={() => onReject(profile.academyId)}
          disabled={isLoading}
        >
          <Ionicons name="close" size={16} color={Colors.dark.error} />
          <Text style={[styles.actionButtonText, { color: Colors.dark.error }]}>Reject</Text>
        </Pressable>
        <Pressable 
          style={[styles.actionButton, styles.approveButton]}
          onPress={() => onApprove(profile.academyId)}
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
            <Text style={styles.quoteText}>&quot;{bio.publicQuote}&quot;</Text>
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
  const { data: coachHealthData, isLoading: loadingCoachHealth } = useQuery<CoachHealthData>({
    queryKey: ["/api/platform/coach-health"],
  });
  const { data: pendingBiosData, isLoading: loadingPendingBios } = useQuery<{ pendingBios: PendingBio[] }>({
    queryKey: ["/api/platform/pending-bios"],
  });

  const { data: pendingOwnerProfilesData, isLoading: loadingOwnerProfiles } = useQuery<{ pendingProfiles: PendingOwnerProfile[] }>({
    queryKey: ["/api/platform/pending-owner-profiles"],
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ coachId, action, rejectionReason }: { coachId: string; action: "approve" | "reject"; rejectionReason?: string }) => {
      return apiRequest("POST", `/api/platform/review-bio/${coachId}`, { action, rejectionReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/pending-bios"] });
    },
  });

  const ownerReviewMutation = useMutation({
    mutationFn: async ({ academyId, action }: { academyId: string; action: "approve" | "reject" }) => {
      return apiRequest("POST", `/api/platform/review-owner-profile/${academyId}`, { action });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/pending-owner-profiles"] });
    },
  });

  const handleApprove = (coachId: string) => {
    reviewMutation.mutate({ coachId, action: "approve" });
  };

  const handleApproveOwner = (academyId: string) => {
    ownerReviewMutation.mutate({ academyId, action: "approve" });
  };

  const handleRejectOwner = (academyId: string) => {
    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to reject this owner profile?")) {
        ownerReviewMutation.mutate({ academyId, action: "reject" });
      }
    } else {
      Alert.alert(
        "Reject Profile",
        "Are you sure you want to reject this owner profile?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Reject", style: "destructive", onPress: () => {
            ownerReviewMutation.mutate({ academyId, action: "reject" });
          }},
        ]
      );
    }
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

  const healthStats = coachHealthData?.healthStats || {
    totalCoaches: 0,
    activeThisWeek: 0,
    atRisk: 0,
    avgSessionsPerCoach: 0,
    avgXpAwarded: 0,
  };

  const coaches = coachHealthData?.coaches || [];
  const atRiskCoaches = coaches.filter(c => c.burnoutRisk === "high" || c.burnoutRisk === "medium");
  const pendingBios = pendingBiosData?.pendingBios || [];
  const pendingOwnerProfiles = pendingOwnerProfilesData?.pendingProfiles || [];

  if (loadingCoachHealth) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading coach health data...</Text>
      </View>
    );
  }

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

        {pendingOwnerProfiles.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="business" size={20} color={Colors.dark.gold} />
              <Text style={styles.sectionTitle}>Pending Owner Profiles</Text>
              <View style={[styles.countBadge, { backgroundColor: "rgba(255, 215, 0, 0.2)" }]}>
                <Text style={[styles.countBadgeText, { color: Colors.dark.gold }]}>{pendingOwnerProfiles.length}</Text>
              </View>
            </View>
            <View style={[styles.coachesCard, CardStyles.elevated]}>
              {pendingOwnerProfiles.map((profile) => (
                <PendingOwnerProfileRow 
                  key={profile.academyId} 
                  profile={profile} 
                  onApprove={handleApproveOwner}
                  onReject={handleRejectOwner}
                  isLoading={ownerReviewMutation.isPending}
                />
              ))}
            </View>
          </View>
        ) : loadingOwnerProfiles ? (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="small" color={Colors.dark.gold} />
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

        {coaches.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>All Coaches</Text>
            <View style={[styles.coachesCard, CardStyles.elevated]}>
              {coaches.map((coach, index) => (
                <CoachRow key={index} {...coach} />
              ))}
            </View>
          </View>
        ) : null}

        {coaches.length === 0 ? (
          <View style={[styles.emptyCard, CardStyles.elevated]}>
            <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No coach data available</Text>
            <Text style={styles.emptySubtext}>Coach health data will appear once you have coaches</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
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
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
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
  emptyCard: {
    padding: Spacing.xl,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
});
