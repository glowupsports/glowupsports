import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface Coach {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  specialty?: string;
  status?: string;
  role?: string;
  hourlyRate?: number;
}

interface CoachStats {
  coach: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    specialty?: string;
    bio?: string;
    yearsExperience?: number;
    role?: string;
  };
  performance: {
    sessionsThisMonth: number;
    completedSessions: number;
    activePlayers: number;
    feedbackCompletionRate: number;
    attendanceAccuracy: number;
  };
  finance: {
    hourlyRate: number;
    totalHours: number;
    amountOwed: number;
    amountPaid: number;
    invoiceHistory: any[];
  };
}

interface StatItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color?: string;
}

function StatItem({ icon, label, value, color = Colors.dark.primary }: StatItemProps) {
  return (
    <View style={styles.statItem}>
      <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

export default function AdminCoachesScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    specialty: "",
    hourlyRate: "",
  });

  const { data: coaches = [], isLoading, error, refetch } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });

  const { data: coachStats, isLoading: statsLoading } = useQuery<CoachStats>({
    queryKey: ["/api/admin/coaches", selectedCoachId, "stats"],
    enabled: !!selectedCoachId,
  });

  const addCoachMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/coaches", {
        ...data,
        hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaches"] });
      setShowAddModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      if (Platform.OS === "web") {
        window.alert(`Error: ${err.message}`);
      } else {
        Alert.alert("Error", err.message);
      }
    },
  });

  const resetForm = () => {
    setFormData({ name: "", email: "", phone: "", specialty: "", hourlyRate: "" });
    setEditingCoach(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openDetailModal = (coachId: string) => {
    setSelectedCoachId(coachId);
    setShowDetailModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter coach name");
      } else {
        Alert.alert("Error", "Please enter coach name");
      }
      return;
    }
    addCoachMutation.mutate(formData);
  };

  const getRoleColor = (role?: string) => {
    switch (role) {
      case "head_coach": return Colors.dark.gold;
      case "assistant": return Colors.dark.orange;
      case "intern": return Colors.dark.xpCyan;
      default: return Colors.dark.primary;
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case "head_coach": return "Head Coach";
      case "assistant": return "Assistant";
      case "intern": return "Intern";
      default: return "Coach";
    }
  };

  const renderCoach = ({ item }: { item: Coach }) => (
    <Pressable
      style={[styles.coachCard, CardStyles.elevated]}
      onPress={() => openDetailModal(item.id)}
    >
      <View style={styles.coachAvatar}>
        <Ionicons name="person" size={24} color={Colors.dark.primary} />
      </View>
      <View style={styles.coachInfo}>
        <Text style={styles.coachName}>{item.name}</Text>
        <Text style={styles.coachEmail}>{item.email || "No email"}</Text>
        {item.specialty ? (
          <Text style={styles.coachSpecialty}>{item.specialty}</Text>
        ) : null}
      </View>
      <View style={styles.coachMeta}>
        <View style={[styles.roleBadge, { backgroundColor: `${getRoleColor(item.role)}20` }]}>
          <Text style={[styles.roleText, { color: getRoleColor(item.role) }]}>
            {getRoleLabel(item.role)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
      </View>
    </Pressable>
  );

  const renderDetailModal = () => {
    const stats = coachStats;
    
    return (
      <Modal
        visible={showDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowDetailModal(false)}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.modalTitle}>Coach Details</Text>
            <Pressable onPress={() => {
              if (stats?.coach) {
                setEditingCoach({
                  id: stats.coach.id,
                  name: stats.coach.name,
                  email: stats.coach.email,
                  phone: stats.coach.phone,
                  specialty: stats.coach.specialty,
                  role: stats.coach.role,
                });
                setFormData({
                  name: stats.coach.name || "",
                  email: stats.coach.email || "",
                  phone: stats.coach.phone || "",
                  specialty: stats.coach.specialty || "",
                  hourlyRate: stats.finance?.hourlyRate?.toString() || "",
                });
                setShowDetailModal(false);
                setShowAddModal(true);
              }
            }}>
              <Ionicons name="pencil" size={20} color={Colors.dark.orange} />
            </Pressable>
          </View>

          {statsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.dark.orange} />
            </View>
          ) : stats ? (
            <ScrollView 
              style={styles.detailScroll}
              contentContainerStyle={[styles.detailContent, { paddingBottom: insets.bottom + 40 }]}
            >
              <View style={styles.profileSection}>
                <View style={styles.profileAvatar}>
                  <Ionicons name="person" size={40} color={Colors.dark.primary} />
                </View>
                <Text style={styles.profileName}>{stats.coach.name}</Text>
                <View style={[styles.roleBadge, { backgroundColor: `${getRoleColor(stats.coach.role)}20` }]}>
                  <Text style={[styles.roleText, { color: getRoleColor(stats.coach.role) }]}>
                    {getRoleLabel(stats.coach.role)}
                  </Text>
                </View>
                {stats.coach.email ? (
                  <Text style={styles.profileEmail}>{stats.coach.email}</Text>
                ) : null}
                {stats.coach.phone ? (
                  <Text style={styles.profilePhone}>{stats.coach.phone}</Text>
                ) : null}
              </View>

              {stats.coach.bio ? (
                <View style={[styles.section, CardStyles.elevated]}>
                  <Text style={styles.sectionTitle}>About</Text>
                  <Text style={styles.bioText}>{stats.coach.bio}</Text>
                  {stats.coach.yearsExperience ? (
                    <Text style={styles.experienceText}>
                      {stats.coach.yearsExperience} years experience
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Performance</Text>
                <View style={styles.statsGrid}>
                  <StatItem 
                    icon="calendar" 
                    label="Sessions/Mo" 
                    value={stats.performance.sessionsThisMonth}
                    color={Colors.dark.orange}
                  />
                  <StatItem 
                    icon="checkmark-circle" 
                    label="Completed" 
                    value={stats.performance.completedSessions}
                    color={Colors.dark.successNeon}
                  />
                  <StatItem 
                    icon="people" 
                    label="Players" 
                    value={stats.performance.activePlayers}
                    color={Colors.dark.xpCyan}
                  />
                  <StatItem 
                    icon="chatbubble" 
                    label="Feedback %" 
                    value={`${stats.performance.feedbackCompletionRate}%`}
                    color={Colors.dark.primary}
                  />
                </View>
              </View>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Finance</Text>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Hourly Rate</Text>
                  <Text style={styles.financeValue}>AED {stats.finance.hourlyRate}</Text>
                </View>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Hours This Month</Text>
                  <Text style={styles.financeValue}>{stats.finance.totalHours}h</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Amount Owed</Text>
                  <Text style={[styles.financeValue, { color: Colors.dark.error }]}>
                    AED {stats.finance.amountOwed}
                  </Text>
                </View>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Amount Paid</Text>
                  <Text style={[styles.financeValue, { color: Colors.dark.successNeon }]}>
                    AED {stats.finance.amountPaid}
                  </Text>
                </View>
                <Pressable style={styles.markPaidButton}>
                  <Text style={styles.markPaidText}>Mark as Paid</Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.orange} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Failed to load coaches</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.15)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Manage Coaches</Text>
        <Pressable style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="add" size={24} color={Colors.dark.text} />
        </Pressable>
      </View>

      <FlatList
        data={coaches}
        keyExtractor={(item) => item.id}
        renderItem={renderCoach}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No coaches yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first coach</Text>
          </View>
        }
      />

      {renderDetailModal()}

      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowAddModal(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingCoach ? "Edit Coach" : "Add Coach"}
            </Text>
            <Pressable 
              onPress={handleSubmit}
              disabled={addCoachMutation.isPending}
            >
              <Text style={[styles.saveButton, addCoachMutation.isPending && styles.disabledButton]}>
                {addCoachMutation.isPending ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.formScroll}
            contentContainerStyle={styles.form}
          >
            <View style={styles.formGroup}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
                placeholder="Coach name"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, email: text }))}
                placeholder="coach@example.com"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={formData.phone}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, phone: text }))}
                placeholder="+1 234 567 8900"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Specialty</Text>
              <TextInput
                style={styles.input}
                value={formData.specialty}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, specialty: text }))}
                placeholder="e.g., Junior Training, Advanced"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Hourly Rate (AED)</Text>
              <TextInput
                style={styles.input}
                value={formData.hourlyRate}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, hourlyRate: text }))}
                placeholder="100"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="numeric"
              />
            </View>
          </KeyboardAwareScrollViewCompat>
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
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  coachCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  coachAvatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  coachInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachEmail: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  coachSpecialty: {
    ...Typography.caption,
    color: Colors.dark.orange,
    marginTop: 4,
  },
  coachMeta: {
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  roleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  roleText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.error,
    marginTop: Spacing.md,
  },
  retryButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  cancelButton: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  saveButton: {
    ...Typography.body,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.5,
  },
  formScroll: {
    flex: 1,
  },
  form: {
    padding: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    padding: Spacing.lg,
  },
  profileSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  profileName: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  profileEmail: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  profilePhone: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  section: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  bioText: {
    ...Typography.body,
    color: Colors.dark.text,
    lineHeight: 22,
  },
  experienceText: {
    ...Typography.small,
    color: Colors.dark.orange,
    marginTop: Spacing.md,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    width: "45%",
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  financeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  financeLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  financeValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.md,
  },
  markPaidButton: {
    backgroundColor: Colors.dark.orange,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  markPaidText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
});
