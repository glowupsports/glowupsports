import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { formatCredits } from "@/lib/dateUtils";
import { styles } from "./adminPlayersStyles";
import { generateAttendanceReportPDF, StatItem, SkillBar } from "./AdminPlayerHelpers";
import { AdminPlayer, AdminPlayerPackage, AdminPlayerSessionItem, AdminPlayerStats } from "./adminPlayerTypes";

interface AdminInlinePlayerProfileProps {
  selectedPlayerId: string;
  selectedPlayer: AdminPlayer | undefined;
  onBack: () => void;
  onEditPlayer: (player: { id: string; name: string; email?: string | null; phone?: string | null; ballLevel?: string; parentName?: string; parentPhone?: string; dateOfBirth?: string | null }) => void;
  onShowDeleteModal: () => void;
  onShowCreditStoreModal: () => void;
  onShowMarkPaidModal: (pkg: AdminPlayerPackage) => void;
}

function getBallLevelColor(level?: string): string {
  switch (level?.toLowerCase()) {
    case "blue": return "#3B82F6";
    case "red": return "#EF4444";
    case "orange": return "#F97316";
    case "green": return "#22C55E";
    case "yellow": return "#EAB308";
    case "adult":
    case "glow": return "#00E5FF";
    default: return Colors.dark.textMuted;
  }
}

export function AdminInlinePlayerProfile({
  selectedPlayerId,
  selectedPlayer,
  onBack,
  onEditPlayer,
  onShowDeleteModal,
  onShowCreditStoreModal,
  onShowMarkPaidModal,
}: AdminInlinePlayerProfileProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [selectedSeriesFilter, setSelectedSeriesFilter] = useState<string | null>(null);

  const { data: playerStats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery<AdminPlayerStats>({
    queryKey: ["/api/admin/players", selectedPlayerId, "stats"],
    enabled: !!selectedPlayerId,
  });

  const { data: playerInvite, isLoading: inviteLoading } = useQuery<{ inviteCode?: string }>({
    queryKey: ["/api/players", selectedPlayerId, "invite"],
    enabled: !!selectedPlayerId,
  });

  const uniqueSeries = useMemo(() => {
    if (!playerStats?.sessions) return [];
    const seriesMap = new Map<string, { id: string; name: string }>();
    playerStats.sessions.forEach((s: AdminPlayerSessionItem) => {
      if (s.seriesId && s.seriesName) {
        seriesMap.set(s.seriesId, { id: s.seriesId, name: s.seriesName });
      }
    });
    return Array.from(seriesMap.values());
  }, [playerStats?.sessions]);

  const filteredSessions = useMemo(() => {
    if (!playerStats?.sessions) return [];
    return selectedSeriesFilter
      ? playerStats.sessions.filter((s: AdminPlayerSessionItem) => s.seriesId === selectedSeriesFilter)
      : playerStats.sessions;
  }, [playerStats?.sessions, selectedSeriesFilter]);

  const handleCopyInviteCode = async () => {
    if (playerInvite?.inviteCode) {
      await Clipboard.setStringAsync(playerInvite.inviteCode);
      setInviteCopied(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setInviteCopied(false), 3000);
    }
  };

  const regenerateInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/players/${selectedPlayerId}/invite/regenerate`);
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/players", selectedPlayerId, "invite"] });
    },
    onError: () => {
      Alert.alert("Error", "Could not generate new code. Try again.");
    },
  });

  const handleRegenerateInviteCode = () => {
    Alert.alert(
      "Generate New Code?",
      "The current invite code will stop working immediately. Anyone holding the old code will no longer be able to use it. Are you sure you want to generate a new code?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate New Code",
          style: "destructive",
          onPress: () => regenerateInviteMutation.mutate(),
        },
      ]
    );
  };

  const ATTENDANCE_STATUSES = ["pending", "present", "late", "absent", "holiday"] as const;

  const updateAttendanceMutation = useMutation({
    mutationFn: async ({ sessionId, playerId, status }: { sessionId: string; playerId: string; status: string }) => {
      const response = await apiRequest("POST", `/api/admin/sessions/${sessionId}/attendance`, {
        attendance: [{ playerId, status }],
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/players", selectedPlayerId, "stats"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Failed to update attendance. Please try again.");
    },
  });

  const deletePackageMutation = useMutation({
    mutationFn: async ({ packageId, force }: { packageId: string; force?: boolean }): Promise<{ success: boolean; error?: string; creditsUsed?: number }> => {
      const url = force ? `/api/packages/${packageId}?force=true` : `/api/packages/${packageId}`;
      const baseUrl = getApiUrl();
      const fullUrl = new URL(url, baseUrl);
      const response = await fetch(fullUrl, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error, creditsUsed: data.creditsUsed };
      }
      return { success: true };
    },
    onSuccess: (data, variables) => {
      if (!data.success && data.creditsUsed) {
        Alert.alert(
          "Package Has Usage",
          `This package has ${data.creditsUsed} credit(s) already used. Delete anyway?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Delete Anyway", style: "destructive", onPress: () => deletePackageMutation.mutate({ packageId: variables.packageId, force: true }) },
          ]
        );
        return;
      }
      if (!data.success) {
        Alert.alert("Error", data.error || "Failed to delete package");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/players", selectedPlayerId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete package");
    },
  });

  const repairCreditsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/players/${selectedPlayerId}/repair-credits`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/players", selectedPlayerId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Credits Repaired", `Processed ${data.consumed || 0} session(s), ${data.debts || 0} debt(s)`);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to repair credits");
    },
  });

  const handleRepairCredits = () => {
    Alert.alert(
      "Repair Credits",
      "This will recalculate credits from all past sessions. Use this if credits don't match attendance records.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Repair", onPress: () => repairCreditsMutation.mutate() },
      ]
    );
  };

  const handleDeletePackage = (pkg: AdminPlayerPackage) => {
    Alert.alert(
      "Delete Package",
      `Delete this ${pkg.creditType || "package"}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deletePackageMutation.mutate({ packageId: pkg.id }) },
      ]
    );
  };

  const [showCustomPackageForm, setShowCustomPackageForm] = useState(false);
  const [customCreditType, setCustomCreditType] = useState<"group" | "semi_private" | "private">("group");
  const [customCredits, setCustomCredits] = useState("10");
  const [customPricePerCredit, setCustomPricePerCredit] = useState("95");
  const [customExpiryMonths, setCustomExpiryMonths] = useState("12");

  const createCustomPackageMutation = useMutation({
    mutationFn: async () => {
      const credits = parseInt(customCredits, 10);
      const pricePerCredit = parseFloat(customPricePerCredit);
      const expiryMonths = parseInt(customExpiryMonths, 10);
      if (isNaN(credits) || credits <= 0) throw new Error("Enter a valid credit count");
      if (isNaN(pricePerCredit) || pricePerCredit < 0) throw new Error("Enter a valid price per credit");
      const response = await apiRequest("POST", "/api/packages", {
        playerId: selectedPlayerId,
        totalCredits: credits,
        creditType: customCreditType,
        pricePerCredit: pricePerCredit.toFixed(2),
        expiryMonths: isNaN(expiryMonths) || expiryMonths <= 0 ? 12 : expiryMonths,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/players", selectedPlayerId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      setShowCustomPackageForm(false);
      setCustomCredits("10");
      setCustomPricePerCredit("95");
      setCustomExpiryMonths("12");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to create package");
    },
  });

  const cycleAttendanceStatus = (session: AdminPlayerSessionItem) => {
    const sessionId = session.sessionId || session.id;
    const playerId = selectedPlayerId;
    if (!sessionId) return;
    const currentStatus = session.attended || session.attendanceStatus || "pending";
    const idx = ATTENDANCE_STATUSES.indexOf(currentStatus as typeof ATTENDANCE_STATUSES[number]);
    const nextStatus = ATTENDANCE_STATUSES[(idx + 1) % ATTENDANCE_STATUSES.length];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateAttendanceMutation.mutate({ sessionId, playerId, status: nextStatus });
  };

  const stats = playerStats;

  return (
    <ScrollView
      style={styles.inlineProfileScroll}
      contentContainerStyle={[styles.inlineProfileContent, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.inlineProfileHeader}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            onBack();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          <Text style={styles.backButtonText}>Back to Players</Text>
        </Pressable>
        <Pressable onPress={() => {
          if (stats?.player) {
            onEditPlayer({
              id: stats.player.id,
              name: stats.player.name,
              email: stats.player.email,
              phone: stats.player.phone,
              ballLevel: stats.player.ballLevel,
              parentName: stats.player.parentName,
              parentPhone: stats.player.parentPhone,
              dateOfBirth: stats.player.dateOfBirth,
            });
          }
        }}>
          <Ionicons name="pencil" size={20} color={Colors.dark.orange} />
        </Pressable>
      </View>

      {statsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.orange} />
          <Text style={styles.loadingText}>Loading player details...</Text>
        </View>
      ) : statsError ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
          <Text style={styles.errorText}>Failed to load player details</Text>
          <Pressable style={styles.retryButton} onPress={() => refetchStats()}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      ) : stats ? (
        <>
          <View style={styles.profileSection}>
            <View style={[styles.profileAvatar, { borderColor: getBallLevelColor(stats.player.ballLevel) }]}>
              <Text style={styles.profileAvatarText}>
                {stats.player.name?.charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
            <Text style={styles.profileName}>{stats.player.name}</Text>
            <View style={[styles.ballBadgeLarge, { backgroundColor: `${getBallLevelColor(stats.player.ballLevel)}20` }]}>
              <View style={[styles.ballDotLarge, { backgroundColor: getBallLevelColor(stats.player.ballLevel) }]} />
              <Text style={[styles.ballTextLarge, { color: getBallLevelColor(stats.player.ballLevel) }]}>
                {stats.player.ballLevel || "N/A"} Ball
              </Text>
            </View>
            {stats.player.coachName ? (
              <Text style={styles.coachAssignment}>Coach: {stats.player.coachName}</Text>
            ) : null}
          </View>

          {(stats.player.dateOfBirth || stats.player.parentEmail || stats.player.parentName || stats.player.parentPhone || stats.player.medicalNotes) ? (
            <View style={[styles.section, CardStyles.elevated]}>
              <Text style={styles.sectionTitle}>Personal Info</Text>
              {stats.player.dateOfBirth ? (
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Date of Birth</Text>
                  <Text style={styles.financeValue}>
                    {(() => {
                      const dob = new Date(stats.player.dateOfBirth + "T00:00:00");
                      const formatted = dob.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                      const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                      return `${formatted} · Age ${age}`;
                    })()}
                  </Text>
                </View>
              ) : null}
              {stats.player.parentName ? (
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Parent Name</Text>
                  <Text style={styles.financeValue}>{stats.player.parentName}</Text>
                </View>
              ) : null}
              {stats.player.parentPhone ? (
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Parent Phone</Text>
                  <Text style={styles.financeValue}>{stats.player.parentPhone}</Text>
                </View>
              ) : null}
              {stats.player.parentEmail ? (
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Parent Email</Text>
                  <Text style={[styles.financeValue, { flexShrink: 1 }]}>{stats.player.parentEmail}</Text>
                </View>
              ) : null}
              {stats.player.medicalNotes ? (
                <View style={[styles.financeRow, { alignItems: "flex-start" }]}>
                  <Text style={styles.financeLabel}>Medical Notes</Text>
                  <Text style={[styles.financeValue, { flexShrink: 1, flexWrap: "wrap" }]}>{stats.player.medicalNotes}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.section, CardStyles.elevated]}>
            <Text style={styles.sectionTitle}>Attendance</Text>
            <View style={styles.statsGrid}>
              <StatItem icon="checkmark-circle" label="Attended" value={stats.attendance.attended} color={Colors.dark.successNeon} />
              <StatItem icon="close-circle" label="Missed" value={stats.attendance.missed} color={Colors.dark.error} />
              <StatItem icon="trending-up" label="Rate" value={`${stats.attendance.rate}%`} color={Colors.dark.orange} />
              <StatItem icon="flame" label="Streak" value={stats.attendance.streak} color={Colors.dark.gold} />
            </View>
          </View>

          <Pressable
            style={[styles.section, CardStyles.elevated]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setProgressExpanded(!progressExpanded);
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.sectionTitle}>Progress</Text>
              <Ionicons name={progressExpanded ? "chevron-up" : "chevron-down"} size={20} color={Colors.dark.textMuted} />
            </View>
            {progressExpanded ? (
              <>
                <View style={styles.progressHeader}>
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelNumber}>{stats.progress.level}</Text>
                    <Text style={styles.levelLabel}>Level</Text>
                  </View>
                  <View style={styles.xpInfo}>
                    <Text style={styles.xpText}>{stats.progress.xp} / {stats.progress.xpToNextLevel} XP</Text>
                    <View style={styles.xpBar}>
                      <View style={[styles.xpFill, { width: `${(stats.progress.xp / stats.progress.xpToNextLevel) * 100}%` }]} />
                    </View>
                  </View>
                </View>
                <View style={styles.skillsSection}>
                  <SkillBar label="Technical" value={stats.progress.skills.technical} color={Colors.dark.xpCyan} />
                  <SkillBar label="Tactical" value={stats.progress.skills.tactical} color={Colors.dark.primary} />
                  <SkillBar label="Physical" value={stats.progress.skills.physical} color={Colors.dark.orange} />
                  <SkillBar label="Mental" value={stats.progress.skills.mental} color={Colors.dark.gold} />
                  <SkillBar label="Social" value={stats.progress.skills.social} color={Colors.dark.successNeon} />
                </View>
              </>
            ) : null}
          </Pressable>

          <View style={[styles.section, CardStyles.elevated]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="ticket-outline" size={18} color={Colors.dark.primary} />
                <Text style={styles.sectionTitle}>Packages</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${Colors.dark.orange}20`, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: `${Colors.dark.orange}40` }}
                  onPress={handleRepairCredits}
                  disabled={repairCreditsMutation.isPending}
                >
                  <Ionicons name="construct-outline" size={14} color={Colors.dark.orange} />
                  <Text style={{ color: Colors.dark.orange, fontSize: 12, fontWeight: "700" }}>Repair</Text>
                </Pressable>
                <Pressable
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.dark.successNeon, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowCustomPackageForm(v => !v);
                  }}
                >
                  <Ionicons name={showCustomPackageForm ? "chevron-up" : "add"} size={18} color="#0B0D10" />
                  <Text style={{ color: "#0B0D10", fontSize: 13, fontWeight: "700" }}>Add Package</Text>
                </Pressable>
              </View>
            </View>

            {showCustomPackageForm ? (
              <View style={{ backgroundColor: Colors.dark.backgroundRoot, borderRadius: 12, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: `${Colors.dark.primary}30` }}>
                <Text style={{ ...Typography.h3, color: Colors.dark.text, marginBottom: Spacing.md }}>Custom Package</Text>
                <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.md }}>
                  {(["group", "semi_private", "private"] as const).map((type) => {
                    const typeColor = type === "private" ? Colors.dark.orange : type === "semi_private" ? Colors.dark.primary : Colors.dark.xpCyan;
                    const typeLabel = type === "private" ? "Private" : type === "semi_private" ? "Semi" : "Group";
                    return (
                      <Pressable
                        key={type}
                        onPress={() => setCustomCreditType(type)}
                        style={{ flex: 1, paddingVertical: Spacing.sm, borderRadius: 8, alignItems: "center", backgroundColor: customCreditType === type ? `${typeColor}30` : `${typeColor}10`, borderWidth: 1, borderColor: customCreditType === type ? typeColor : `${typeColor}30` }}
                      >
                        <Text style={{ color: typeColor, fontWeight: "700", fontSize: 12 }}>{typeLabel}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...Typography.small, color: Colors.dark.textMuted, marginBottom: 4 }}>Credits</Text>
                    <TextInput
                      value={customCredits}
                      onChangeText={setCustomCredits}
                      keyboardType="numeric"
                      style={{ backgroundColor: Colors.dark.backgroundSecondary, color: Colors.dark.text, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: 14, borderWidth: 1, borderColor: `${Colors.dark.primary}30` }}
                      placeholder="10"
                      placeholderTextColor={Colors.dark.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...Typography.small, color: Colors.dark.textMuted, marginBottom: 4 }}>Price/Credit</Text>
                    <TextInput
                      value={customPricePerCredit}
                      onChangeText={setCustomPricePerCredit}
                      keyboardType="decimal-pad"
                      style={{ backgroundColor: Colors.dark.backgroundSecondary, color: Colors.dark.text, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: 14, borderWidth: 1, borderColor: `${Colors.dark.primary}30` }}
                      placeholder="95"
                      placeholderTextColor={Colors.dark.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...Typography.small, color: Colors.dark.textMuted, marginBottom: 4 }}>Validity (mo)</Text>
                    <TextInput
                      value={customExpiryMonths}
                      onChangeText={setCustomExpiryMonths}
                      keyboardType="numeric"
                      style={{ backgroundColor: Colors.dark.backgroundSecondary, color: Colors.dark.text, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: 14, borderWidth: 1, borderColor: `${Colors.dark.primary}30` }}
                      placeholder="12"
                      placeholderTextColor={Colors.dark.textMuted}
                    />
                  </View>
                </View>
                {parseInt(customCredits, 10) > 0 && parseFloat(customPricePerCredit) >= 0 ? (
                  <Text style={{ ...Typography.small, color: Colors.dark.textMuted, marginBottom: Spacing.sm }}>
                    Total: AED {(parseInt(customCredits, 10) * parseFloat(customPricePerCredit)).toFixed(0)}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                  <Pressable
                    onPress={() => setShowCustomPackageForm(false)}
                    style={{ flex: 1, paddingVertical: Spacing.sm, borderRadius: 8, alignItems: "center", backgroundColor: `${Colors.dark.error}15`, borderWidth: 1, borderColor: `${Colors.dark.error}30` }}
                  >
                    <Text style={{ color: Colors.dark.error, fontWeight: "700", fontSize: 13 }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => createCustomPackageMutation.mutate()}
                    disabled={createCustomPackageMutation.isPending}
                    style={{ flex: 2, paddingVertical: Spacing.sm, borderRadius: 8, alignItems: "center", backgroundColor: Colors.dark.primary }}
                  >
                    {createCustomPackageMutation.isPending ? (
                      <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                    ) : (
                      <Text style={{ color: Colors.dark.buttonText, fontWeight: "700", fontSize: 13 }}>Create Package</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            {stats.packages && stats.packages.length > 0 ? (
              <View style={styles.packagesGrid}>
                {stats.packages.map((pkg: AdminPlayerPackage) => {
                  const remaining = Number(pkg.remainingCredits ?? pkg.remaining ?? 0);
                  const total = Number(pkg.totalCredits || 0);
                  const percentage = total > 0 ? (remaining / total) * 100 : 0;
                  const creditColor = remaining > 0 ? Colors.dark.successNeon : Colors.dark.textMuted;
                  return (
                    <View key={pkg.id} style={[styles.premiumPackageCard, !pkg.isPaid && styles.premiumPackageCardUnpaid]}>
                      <LinearGradient
                        colors={[pkg.isPaid ? "rgba(200, 255, 61, 0.08)" : "rgba(255, 152, 0, 0.08)", "transparent"]}
                        style={styles.packageGradient}
                      />
                      <View style={styles.premiumPackageHeader}>
                        <View style={styles.packageTypeRow}>
                          <View style={[styles.packageIconBadge, { backgroundColor: pkg.isPaid ? `${Colors.dark.successNeon}20` : `${Colors.dark.orange}20` }]}>
                            <Ionicons name="ticket" size={16} color={pkg.isPaid ? Colors.dark.successNeon : Colors.dark.orange} />
                          </View>
                          <Text style={styles.premiumPackageName}>
                            {(pkg.packageName || pkg.creditType || "Package").charAt(0).toUpperCase() + (pkg.packageName || pkg.creditType || "Package").slice(1)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          {!pkg.isPaid ? (
                            <View style={styles.premiumUnpaidBadge}><Text style={styles.premiumUnpaidText}>UNPAID</Text></View>
                          ) : (
                            <View style={styles.premiumPaidBadge}><Text style={styles.premiumPaidText}>PAID</Text></View>
                          )}
                          <Pressable
                            onPress={() => handleDeletePackage(pkg)}
                            style={{ padding: 4 }}
                            disabled={deletePackageMutation.isPending}
                          >
                            <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
                          </Pressable>
                        </View>
                      </View>
                      <View style={styles.premiumCreditsSection}>
                        <View style={styles.creditsDisplay}>
                          <Text style={[styles.premiumCreditsValue, { color: creditColor }]}>{formatCredits(remaining)}</Text>
                          <Text style={styles.premiumCreditsDivider}>/</Text>
                          <Text style={styles.premiumCreditsTotal}>{formatCredits(total)}</Text>
                          <Text style={styles.premiumCreditsLabel}>credits</Text>
                        </View>
                        <View style={styles.creditsProgressBar}>
                          <View style={[styles.creditsProgressFill, { width: `${percentage}%`, backgroundColor: creditColor }]} />
                        </View>
                      </View>
                      {pkg.expiresAt || pkg.expiryDate ? (
                        <View style={styles.packageExpiryRow}>
                          <Ionicons name="calendar-outline" size={12} color={Colors.dark.textMuted} />
                          <Text style={styles.premiumPackageExpiry}>
                            Expires {new Date(pkg.expiresAt || pkg.expiryDate).toLocaleDateString()}
                          </Text>
                        </View>
                      ) : null}
                      {!pkg.isPaid ? (
                        <Pressable
                          style={styles.premiumMarkPaidButton}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            onShowMarkPaidModal(pkg);
                          }}
                        >
                          <Ionicons name="checkmark-circle" size={14} color={Colors.dark.successNeon} />
                          <Text style={styles.premiumMarkPaidText}>Mark as Paid</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyPackages}>
                <Ionicons name="ticket-outline" size={32} color={Colors.dark.textMuted} />
                <Text style={styles.emptyPackagesText}>No packages yet</Text>
              </View>
            )}
          </View>

          <View style={[styles.section, CardStyles.elevated, { overflow: "hidden" }]}>
            <LinearGradient colors={["rgba(0, 224, 255, 0.08)", "transparent"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 80 }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${Colors.dark.xpCyan}15`, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="calendar" size={18} color={Colors.dark.xpCyan} />
                </View>
                <View>
                  <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Attendance History</Text>
                  <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginTop: 2 }}>{filteredSessions?.length || 0} sessions recorded</Text>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  if (stats && selectedPlayer) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    generateAttendanceReportPDF(stats, selectedPlayer);
                  }
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FF0000", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 2, borderColor: "#FF0000" }}
              >
                <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Report</Text>
              </Pressable>
            </View>
            {uniqueSeries.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seriesFilterContainer} contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}>
                <Pressable
                  style={[styles.seriesFilterChip, selectedSeriesFilter === null && styles.seriesFilterChipActive]}
                  onPress={() => { setSelectedSeriesFilter(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={[styles.seriesFilterChipText, selectedSeriesFilter === null && styles.seriesFilterChipTextActive]}>All</Text>
                </Pressable>
                {uniqueSeries.map((series) => (
                  <Pressable
                    key={series.id}
                    style={[styles.seriesFilterChip, selectedSeriesFilter === series.id && styles.seriesFilterChipActive]}
                    onPress={() => { setSelectedSeriesFilter(series.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Text style={[styles.seriesFilterChipText, selectedSeriesFilter === series.id && styles.seriesFilterChipTextActive]}>{series.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {filteredSessions && filteredSessions.length > 0 ? (
              <View style={{ gap: 10 }}>
                {filteredSessions.slice(0, 10).map((session: AdminPlayerSessionItem) => {
                  const sessionDate = session.startTime ? new Date(session.startTime) : null;
                  const dayName = sessionDate ? sessionDate.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase() : "N/A";
                  const dayNum = sessionDate ? sessionDate.getDate() : "";
                  const monthName = sessionDate ? sessionDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase() : "";
                  const timeStr = sessionDate ? sessionDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";
                  const currentStatus = session.attended || session.attendanceStatus || "pending";
                  const statusColor = currentStatus === "present" ? Colors.dark.successNeon : currentStatus === "absent" ? Colors.dark.error : currentStatus === "late" ? Colors.dark.orange : currentStatus === "holiday" ? Colors.dark.primary : Colors.dark.gold;
                  const statusText = currentStatus === "present" ? "Present" : currentStatus === "absent" ? "Absent" : currentStatus === "late" ? "Late" : currentStatus === "holiday" ? "Holiday" : "Pending";
                  const sessionId = session.sessionId || session.id;
                  return (
                    <View key={session.id || session.sessionId} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(30, 35, 45, 0.8)", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
                      <View style={{ width: 54, height: 60, backgroundColor: `${Colors.dark.xpCyan}10`, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 14, borderWidth: 1, borderColor: `${Colors.dark.xpCyan}30` }}>
                        <Text style={{ fontSize: 10, color: Colors.dark.xpCyan, fontWeight: "600", letterSpacing: 0.5 }}>{dayName}</Text>
                        <Text style={{ fontSize: 22, color: Colors.dark.text, fontWeight: "700" }}>{dayNum}</Text>
                        <Text style={{ fontSize: 9, color: Colors.dark.textMuted, fontWeight: "500" }}>{monthName}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <View style={{ backgroundColor: `${Colors.dark.primary}20`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: Colors.dark.primary, fontWeight: "600", textTransform: "capitalize" }}>{session.sessionType || "Session"}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 13, color: Colors.dark.textMuted }}>{timeStr}</Text>
                      </View>
                      <Pressable
                        onPress={() => sessionId ? cycleAttendanceStatus(session) : null}
                        style={{ backgroundColor: `${statusColor}15`, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: `${statusColor}40`, flexDirection: "row", alignItems: "center", gap: 4 }}
                        disabled={updateAttendanceMutation.isPending}
                      >
                        <Text style={{ fontSize: 12, color: statusColor, fontWeight: "600" }}>{statusText}</Text>
                        <Ionicons name="chevron-forward" size={10} color={statusColor} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={{ alignItems: "center", padding: 24 }}>
                <Ionicons name="calendar-outline" size={40} color={Colors.dark.textMuted} />
                <Text style={{ color: Colors.dark.textMuted, marginTop: 12, fontSize: 14 }}>No sessions recorded yet</Text>
              </View>
            )}
          </View>

          {inviteLoading ? (
            <View style={[styles.section, CardStyles.elevated, { alignItems: "center", paddingVertical: 20 }]}>
              <ActivityIndicator size="small" color={Colors.dark.orange} />
              <Text style={{ color: Colors.dark.textMuted, marginTop: 8, fontSize: 13 }}>Loading invite code...</Text>
            </View>
          ) : playerInvite?.inviteCode && playerInvite?.status === "pending" ? (
            <View style={{
              backgroundColor: Colors.dark.backgroundTertiary,
              borderRadius: BorderRadius.lg,
              padding: Spacing.lg,
              marginBottom: Spacing.md,
              borderWidth: 2,
              borderColor: Colors.dark.primary + "40",
            }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.dark.primary, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
                Invite Code — Awaiting Signup
              </Text>
              <Text style={{ fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 18, marginBottom: 8 }}>
                Give this code to {selectedPlayer?.name} — they enter it when signing up in the app
              </Text>
              <Text style={{
                fontSize: 36,
                fontWeight: "900",
                color: Colors.dark.primary,
                textAlign: "center",
                letterSpacing: 8,
                fontFamily: "Menlo",
                marginVertical: Spacing.md,
              }} selectable>{playerInvite.inviteCode}</Text>
              <Pressable
                style={{ borderRadius: BorderRadius.md, overflow: "hidden", marginBottom: Spacing.sm }}
                onPress={handleCopyInviteCode}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: Spacing.md + 2, paddingHorizontal: Spacing.lg }}
                >
                  <Ionicons name={inviteCopied ? "checkmark-circle" : "copy-outline"} size={18} color={Colors.dark.buttonText} />
                  <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.dark.buttonText }}>{inviteCopied ? "Copied!" : "Copy Code"}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: `${Colors.dark.error}40`, backgroundColor: Colors.dark.backgroundTertiary }}
                onPress={handleRegenerateInviteCode}
                disabled={regenerateInviteMutation.isPending}
              >
                {regenerateInviteMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.error} />
                ) : (
                  <Ionicons name="refresh-outline" size={16} color={Colors.dark.error} />
                )}
                <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.dark.error }}>{regenerateInviteMutation.isPending ? "Generating..." : "Generate New Code"}</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            style={styles.deletePlayerButton}
            onPress={() => onShowDeleteModal()}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
            <Text style={styles.deletePlayerText}>Delete Player</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}
