import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import type { OwnerStackParamList } from "@/owner/navigation/OwnerNavigator";
import { apiRequest } from "@/lib/query-client";

type TabType = "coaches" | "players" | "admins";

interface PersonData {
  id: string;
  name: string;
  role: string;
  status: "active" | "paused" | "onboarding";
  stats: { label: string; value: string }[];
}

interface AdminData {
  id: string;
  name: string;
  email?: string;
  status?: string;
}

interface PeopleData {
  coaches: PersonData[];
  players: PersonData[];
}

interface PersonCardProps {
  id: string;
  name: string;
  role: string;
  status: "active" | "paused" | "onboarding";
  stats: { label: string; value: string }[];
  onPress: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
}

function PersonCard({ id, name, role, status, stats, onPress, onDelete, isDeleting }: PersonCardProps) {
  const statusColors = {
    active: Colors.dark.primary,
    paused: Colors.dark.orange,
    onboarding: Colors.dark.xpCyan,
  };

  return (
    <Pressable style={[styles.personCard, CardStyles.elevated]} onPress={onPress}>
      <View style={styles.personCardHeader}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={24} color={Colors.dark.textMuted} />
        </View>
        <View style={styles.personInfo}>
          <Text style={styles.personName}>{name}</Text>
          <Text style={styles.personRole}>{role}</Text>
        </View>
        <View style={styles.cardActions}>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColors[status]}20` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColors[status] }]} />
            <Text style={[styles.statusText, { color: statusColors[status] }]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </View>
          <Pressable 
            style={styles.deleteButton} 
            onPress={(e) => {
              e.stopPropagation?.();
              onDelete();
            }}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={Colors.dark.error} />
            ) : (
              <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
            )}
          </Pressable>
        </View>
      </View>
      <View style={styles.statsRow}>
        {stats.map((stat, index) => (
          <View key={index} style={styles.stat}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

export default function PeopleScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<OwnerStackParamList>>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>("coaches");
  const [selectedPerson, setSelectedPerson] = useState<PersonData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: peopleData, isLoading, isError, refetch } = useQuery<PeopleData>({
    queryKey: ["/api/owner/people"],
  });

  const deleteCoachMutation = useMutation({
    mutationFn: async (coachId: string) => {
      return apiRequest(`/api/owner/coaches/${coachId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/people"] });
      setDeletingId(null);
    },
    onError: () => {
      setDeletingId(null);
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest(`/api/owner/players/${playerId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/people"] });
      setDeletingId(null);
    },
    onError: () => {
      setDeletingId(null);
    },
  });

  const { data: adminsData = [] } = useQuery<AdminData[]>({
    queryKey: ["/api/owner/admins"],
  });

  const promoteToAdminMutation = useMutation({
    mutationFn: async (coachId: string) => {
      return apiRequest("/api/owner/admins", { 
        method: "POST",
        body: JSON.stringify({ coachId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/admins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner/people"] });
    },
  });

  const demoteFromAdminMutation = useMutation({
    mutationFn: async (coachId: string) => {
      return apiRequest(`/api/owner/admins/${coachId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/admins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner/people"] });
    },
  });

  const coaches = peopleData?.coaches || [];
  const players = peopleData?.players || [];
  const admins = adminsData || [];

  const handleTabChange = (tab: TabType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const handleInviteCoach = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("InviteManagement", { role: "coach" });
  };

  const handleInviteAdmin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("InviteManagement", { role: "admin" });
  };

  const handlePersonPress = (person: PersonData) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPerson(person);
    setShowDetailModal(true);
  };

  const handleDelete = (id: string, type: "coach" | "player", name: string) => {
    const confirmDelete = () => {
      setDeletingId(id);
      if (type === "coach") {
        deleteCoachMutation.mutate(id);
      } else {
        deletePlayerMutation.mutate(id);
      }
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Remove ${name} from academy? They will be marked as inactive.`);
      if (confirmed) confirmDelete();
    } else {
      Alert.alert(
        "Remove from Academy",
        `Remove ${name} from academy? They will be marked as inactive.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: confirmDelete },
        ]
      );
    }
  };

  const handlePromoteToAdmin = (coach: PersonData) => {
    const doPromote = () => promoteToAdminMutation.mutate(coach.id);
    
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Promote ${coach.name} to admin? They will have management access.`);
      if (confirmed) doPromote();
    } else {
      Alert.alert(
        "Promote to Admin",
        `Promote ${coach.name} to admin? They will have management access.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Promote", onPress: doPromote },
        ]
      );
    }
  };

  const handleDemoteFromAdmin = (admin: AdminData) => {
    const doDemote = () => demoteFromAdminMutation.mutate(admin.id);
    
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Demote ${admin.name} from admin? They will lose management access.`);
      if (confirmed) doDemote();
    } else {
      Alert.alert(
        "Demote Admin",
        `Demote ${admin.name} from admin? They will lose management access.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Demote", style: "destructive", onPress: doDemote },
        ]
      );
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
        <Text style={styles.loadingText}>Loading people...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Failed to load people data</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>People</Text>
        <Text style={styles.subtitle}>Manage your coaches and players</Text>
      </View>

      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, activeTab === "coaches" && styles.tabActive]}
          onPress={() => handleTabChange("coaches")}
        >
          <Ionicons 
            name="tennisball" 
            size={18} 
            color={activeTab === "coaches" ? Colors.dark.backgroundRoot : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "coaches" && styles.tabTextActive]}>
            Coaches ({coaches.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "players" && styles.tabActive]}
          onPress={() => handleTabChange("players")}
        >
          <Ionicons 
            name="people" 
            size={18} 
            color={activeTab === "players" ? Colors.dark.backgroundRoot : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "players" && styles.tabTextActive]}>
            Players ({players.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "admins" && styles.tabActive]}
          onPress={() => handleTabChange("admins")}
        >
          <Ionicons 
            name="shield" 
            size={18} 
            color={activeTab === "admins" ? Colors.dark.backgroundRoot : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "admins" && styles.tabTextActive]}>
            Admins ({admins.length})
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab !== "admins" ? (
          <View style={styles.actionsRow}>
            <Pressable 
              style={styles.addButton}
              onPress={activeTab === "coaches" ? handleInviteCoach : undefined}
            >
              <Ionicons name="add" size={20} color={Colors.dark.gold} />
              <Text style={styles.addButtonText}>
                {activeTab === "coaches" ? "Invite Coach" : "Add Player"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {activeTab === "admins" ? (
          <View style={styles.adminSection}>
            <View style={styles.actionsRow}>
              <Pressable style={styles.addButton} onPress={handleInviteAdmin}>
                <Ionicons name="add" size={20} color={Colors.dark.gold} />
                <Text style={styles.addButtonText}>Invite Admin</Text>
              </Pressable>
            </View>
            
            <Text style={styles.sectionTitle}>Current Admins</Text>
            {admins.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="shield-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyText}>No admins yet</Text>
                <Text style={styles.emptySubtext}>Promote coaches to admin to help manage your academy</Text>
              </View>
            ) : (
              <View style={styles.list}>
                {admins.map((admin) => (
                  <View key={admin.id} style={[styles.personCard, CardStyles.elevated]}>
                    <View style={styles.personCardHeader}>
                      <View style={[styles.avatar, { backgroundColor: `${Colors.dark.gold}30` }]}>
                        <Ionicons name="shield" size={24} color={Colors.dark.gold} />
                      </View>
                      <View style={styles.personInfo}>
                        <Text style={styles.personName}>{admin.name}</Text>
                        <Text style={styles.personRole}>Academy Admin</Text>
                      </View>
                      <Pressable 
                        style={styles.demoteButton}
                        onPress={() => handleDemoteFromAdmin(admin)}
                      >
                        <Ionicons name="arrow-down" size={16} color={Colors.dark.error} />
                        <Text style={styles.demoteButtonText}>Demote</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>Promote a Coach</Text>
            <Text style={styles.sectionSubtitle}>Select a coach to give them admin privileges</Text>
            {coaches.filter(c => !admins.find(a => a.id === c.id)).length === 0 ? (
              <Text style={styles.noCoachesText}>All coaches are already admins</Text>
            ) : (
              <View style={styles.list}>
                {coaches.filter(c => !admins.find(a => a.id === c.id)).map((coach) => (
                  <Pressable 
                    key={coach.id} 
                    style={[styles.personCard, CardStyles.elevated]}
                    onPress={() => handlePromoteToAdmin(coach)}
                  >
                    <View style={styles.personCardHeader}>
                      <View style={styles.avatar}>
                        <Ionicons name="person" size={24} color={Colors.dark.textMuted} />
                      </View>
                      <View style={styles.personInfo}>
                        <Text style={styles.personName}>{coach.name}</Text>
                        <Text style={styles.personRole}>{coach.role}</Text>
                      </View>
                      <View style={styles.promoteButton}>
                        <Ionicons name="arrow-up" size={16} color={Colors.dark.primary} />
                        <Text style={styles.promoteButtonText}>Promote</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : (
          <>
            <View style={styles.list}>
              {(activeTab === "coaches" ? coaches : players).map((person) => (
                <PersonCard 
                  key={person.id} 
                  {...person}
                  onPress={() => handlePersonPress(person)}
                  onDelete={() => handleDelete(person.id, activeTab === "coaches" ? "coach" : "player", person.name)}
                  isDeleting={deletingId === person.id}
                />
              ))}
            </View>

            {(activeTab === "coaches" ? coaches : players).length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons 
                  name={activeTab === "coaches" ? "tennisball-outline" : "people-outline"} 
                  size={48} 
                  color={Colors.dark.textMuted} 
                />
                <Text style={styles.emptyText}>
                  No {activeTab} yet
                </Text>
                <Text style={styles.emptySubtext}>
                  {activeTab === "coaches" 
                    ? "Invite coaches to start building your team" 
                    : "Add players to your academy"}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal
        visible={showDetailModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowDetailModal(false)} />
          <View style={[styles.detailModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeTab === "coaches" ? "Coach Details" : "Player Details"}
              </Text>
              <Pressable onPress={() => setShowDetailModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.textMuted} />
              </Pressable>
            </View>

            {selectedPerson ? (
              <View style={styles.detailContent}>
                <View style={styles.detailAvatar}>
                  <Ionicons name="person" size={48} color={Colors.dark.gold} />
                </View>
                <Text style={styles.detailName}>{selectedPerson.name}</Text>
                <Text style={styles.detailRole}>{selectedPerson.role}</Text>
                
                <View style={styles.detailStats}>
                  {selectedPerson.stats.map((stat, index) => (
                    <View key={index} style={styles.detailStat}>
                      <Text style={styles.detailStatValue}>{stat.value}</Text>
                      <Text style={styles.detailStatLabel}>{stat.label}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.detailActions}>
                  <Pressable
                    style={styles.removeButton}
                    onPress={() => {
                      setShowDetailModal(false);
                      handleDelete(
                        selectedPerson.id,
                        activeTab === "coaches" ? "coach" : "player",
                        selectedPerson.name
                      );
                    }}
                  >
                    <Ionicons name="person-remove-outline" size={20} color={Colors.dark.error} />
                    <Text style={styles.removeButtonText}>Remove from Academy</Text>
                  </Pressable>
                </View>
              </View>
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
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.h3,
    color: Colors.dark.error,
    marginTop: Spacing.md,
  },
  retryButton: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.gold,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  header: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  tabActive: {
    backgroundColor: Colors.dark.gold,
  },
  tabText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  tabTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: Spacing.md,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: `${Colors.dark.gold}15`,
    borderRadius: BorderRadius.md,
  },
  addButtonText: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  list: {
    gap: Spacing.md,
  },
  personCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  personCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  personInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  personName: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  personRole: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    ...Typography.small,
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyText: {
    ...Typography.h3,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.dark.error}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  detailModalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  detailContent: {
    alignItems: "center",
  },
  detailAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${Colors.dark.gold}20`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  detailName: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  detailRole: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  detailStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.dark.backgroundRoot,
    marginBottom: Spacing.lg,
  },
  detailStat: {
    alignItems: "center",
  },
  detailStatValue: {
    ...Typography.h2,
    color: Colors.dark.gold,
  },
  detailStatLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  detailActions: {
    width: "100%",
    gap: Spacing.md,
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.error}15`,
    borderWidth: 1,
    borderColor: `${Colors.dark.error}40`,
  },
  removeButtonText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  adminSection: {
    gap: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  noCoachesText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingVertical: Spacing.lg,
  },
  demoteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: `${Colors.dark.error}15`,
    borderRadius: BorderRadius.md,
  },
  demoteButtonText: {
    ...Typography.small,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  promoteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: `${Colors.dark.primary}15`,
    borderRadius: BorderRadius.md,
  },
  promoteButtonText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
});
