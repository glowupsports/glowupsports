import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Modal, Platform, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type { PlatformStackParamList } from "@/platform/navigation/PlatformNavigator";

const PLATFORM_COLOR = "#9B59B6";

interface AcademyData {
  id: string;
  name: string;
  coaches: number;
  players: number;
  mrr: number;
  status: "active" | "trial" | "paused" | "overdue";
  lastActivity: string;
}

interface PlatformStats {
  academies: AcademyData[];
  metrics: {
    activeAcademies: number;
  };
}

interface AcademyCardProps {
  name: string;
  coaches: number;
  players: number;
  mrr: number;
  status: "active" | "trial" | "paused" | "overdue";
  lastActivity: string;
  onPress?: () => void;
}

function AcademyCard({ name, coaches, players, mrr, status, lastActivity, onPress }: AcademyCardProps) {
  const statusConfig = {
    active: { color: Colors.dark.primary, label: "Active" },
    trial: { color: Colors.dark.xpCyan, label: "Trial" },
    paused: { color: Colors.dark.orange, label: "Paused" },
    overdue: { color: Colors.dark.error, label: "Overdue" },
  };

  const config = statusConfig[status];

  const formatLastActivity = (dateStr: string) => {
    if (!dateStr) return "Recently";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "Recently";
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffHours < 1) return "Just now";
      if (diffHours < 24) return `${diffHours} hours ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays > 0) return `${diffDays} days ago`;
      return "Recently";
    } catch {
      return "Recently";
    }
  };

  return (
    <Pressable 
      style={[styles.academyCard, CardStyles.elevated]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
    >
      <View style={styles.academyHeader}>
        <View style={styles.academyIcon}>
          <Ionicons name="business" size={24} color={PLATFORM_COLOR} />
        </View>
        <View style={styles.academyInfo}>
          <Text style={styles.academyName}>{name}</Text>
          <Text style={styles.academyActivity}>Last active: {formatLastActivity(lastActivity)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${config.color}20` }]}>
          <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
        </View>
      </View>
      
      <View style={styles.academyStats}>
        <View style={styles.academyStat}>
          <Ionicons name="people-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.statValue}>{coaches}</Text>
          <Text style={styles.statLabel}>Coaches</Text>
        </View>
        <View style={styles.academyStat}>
          <Ionicons name="person-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.statValue}>{players}</Text>
          <Text style={styles.statLabel}>Players</Text>
        </View>
        <View style={styles.academyStat}>
          <Ionicons name="card-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={[styles.statValue, { color: Colors.dark.gold }]}>${mrr}</Text>
          <Text style={styles.statLabel}>MRR</Text>
        </View>
      </View>
    </Pressable>
  );
}

type NavigationProp = NativeStackNavigationProp<PlatformStackParamList>;

interface CreateAcademyModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateAcademyModal({ visible, onClose, onSuccess }: CreateAcademyModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/platform/academies", {
        name,
        ownerEmail: ownerEmail || undefined,
        city: city || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
      setName("");
      setOwnerEmail("");
      setCity("");
      setError("");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to create academy");
    },
  });

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Academy name is required");
      return;
    }
    if (ownerEmail && !ownerEmail.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    setError("");
    createMutation.mutate();
  };

  const handleClose = () => {
    setName("");
    setOwnerEmail("");
    setCity("");
    setError("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleClose} />
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.modalHandle} />
          
          <Text style={styles.modalTitle}>Create New Academy</Text>
          <Text style={styles.modalSubtitle}>Add a new academy to the platform</Text>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Academy Name *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Enter academy name"
              placeholderTextColor={Colors.dark.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Owner Email (optional)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="owner@example.com"
              placeholderTextColor={Colors.dark.textMuted}
              value={ownerEmail}
              onChangeText={setOwnerEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.formHint}>An invitation will be sent to this email</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>City (optional)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. Dubai"
              placeholderTextColor={Colors.dark.textMuted}
              value={city}
              onChangeText={setCity}
              autoCapitalize="words"
            />
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={Colors.dark.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.modalActions}>
            <Pressable style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable 
              style={[styles.createButton, createMutation.isPending && styles.buttonDisabled]} 
              onPress={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
              ) : (
                <>
                  <Ionicons name="add-circle" size={20} color={Colors.dark.backgroundRoot} />
                  <Text style={styles.createButtonText}>Create Academy</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function AcademiesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats"],
  });

  const academies = stats?.academies || [];

  const filteredAcademies = academies.filter(academy => {
    const matchesSearch = academy.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus ? academy.status === filterStatus : true;
    return matchesSearch && matchesFilter;
  });

  const statusFilters = [
    { key: null, label: "All" },
    { key: "active", label: "Active" },
    { key: "trial", label: "Trial" },
    { key: "paused", label: "Paused" },
    { key: "overdue", label: "Overdue" },
  ];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading academies...</Text>
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
          <Text style={styles.title}>Academies</Text>
          <Text style={styles.subtitle}>{academies.length} total academies</Text>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.dark.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search academies..."
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
          {statusFilters.map((filter) => (
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

        <View style={styles.academiesList}>
          {filteredAcademies.map((academy) => (
            <AcademyCard 
              key={academy.id} 
              {...academy} 
              onPress={() => navigation.navigate("AcademyDetail", { 
                academyId: academy.id, 
                academyName: academy.name 
              })}
            />
          ))}
        </View>

        {filteredAcademies.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No academies found</Text>
          </View>
        ) : null}
      </ScrollView>

      <Pressable 
        style={[styles.fab, { bottom: insets.bottom + 100 }]}
        onPress={() => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowCreateModal(true);
        }}
      >
        <Ionicons name="add" size={28} color={Colors.dark.backgroundRoot} />
      </Pressable>

      <CreateAcademyModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => setShowCreateModal(false)}
      />
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
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
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
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h1,
    color: PLATFORM_COLOR,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    color: Colors.dark.text,
    ...Typography.body,
  },
  filtersScroll: {
    marginBottom: Spacing.lg,
  },
  filtersContainer: {
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
  },
  filterChip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
  },
  filterChipActive: {
    backgroundColor: PLATFORM_COLOR,
  },
  filterChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  filterChipTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  academiesList: {
    gap: Spacing.md,
  },
  academyCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  academyHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  academyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${PLATFORM_COLOR}20`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  academyInfo: {
    flex: 1,
  },
  academyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  academyActivity: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.small,
    fontSize: 11,
    fontWeight: "600",
  },
  academyStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  academyStat: {
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PLATFORM_COLOR,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: PLATFORM_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingTop: Spacing.md,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.dark.textMuted,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  formLabel: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
    fontWeight: "500",
  },
  formInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    ...Typography.body,
  },
  formHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    fontSize: 11,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: `${Colors.dark.error}15`,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    ...Typography.small,
    color: Colors.dark.error,
    flex: 1,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  createButton: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: PLATFORM_COLOR,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  createButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
