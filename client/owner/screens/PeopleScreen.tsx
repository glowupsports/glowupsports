import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, CardStyles, GlowColors } from "@/constants/theme";
import type { OwnerStackParamList } from "@/owner/navigation/OwnerNavigator";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Picker } from "@react-native-picker/picker";
import PackagesCard from "@/coach/components/PackagesCard";
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

function formatCoachRole(role: string): string {
  switch (role) {
    case "head_coach": return "Head Coach";
    case "assistant": return "Assistant Coach";
    case "coach": return "Coach";
    default: return role.charAt(0).toUpperCase() + role.slice(1);
  }
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
          <Text style={styles.personRole}>{formatCoachRole(role)}</Text>
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

interface CoachSession {
  id: string;
  startTime: string;
  endTime: string;
  title?: string;
  sessionType: string;
}

interface CoachSessionsResponse {
  sessions: CoachSession[];
  count: number;
}

export default function PeopleScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<OwnerStackParamList>>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>("coaches");
  const [selectedPerson, setSelectedPerson] = useState<PersonData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Coach removal flow state
  const [coachToRemove, setCoachToRemove] = useState<PersonData | null>(null);
  const [showRemovalModal, setShowRemovalModal] = useState(false);
  const [removalStep, setRemovalStep] = useState<"loading" | "has_sessions" | "no_sessions" | "reassigning" | "deleting" | "error">("loading");
  const [selectedTargetCoach, setSelectedTargetCoach] = useState<string>("");
  const [coachSessions, setCoachSessions] = useState<CoachSession[]>([]);
  
  // Player invite link state
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const { data: peopleData, isLoading, isError, refetch } = useQuery<PeopleData>({
    queryKey: ["/api/owner/people"],
  });

  const deleteCoachMutation = useMutation({
    mutationFn: async (coachId: string) => {
      return apiRequest("DELETE", `/api/owner/coaches/${coachId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/people"] });
      setDeletingId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      setDeletingId(null);
      Alert.alert("Error", `Failed to remove coach: ${err.message}`);
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest("DELETE", `/api/owner/players/${playerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/people"] });
      setDeletingId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      setDeletingId(null);
      Alert.alert("Error", `Failed to remove player: ${err.message}`);
    },
  });

  const { data: adminsData = [] } = useQuery<AdminData[]>({
    queryKey: ["/api/owner/admins"],
  });

  const promoteToAdminMutation = useMutation({
    mutationFn: async (coachId: string) => {
      return apiRequest("POST", "/api/owner/admins", { coachId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/admins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner/people"] });
    },
  });

  const demoteFromAdminMutation = useMutation({
    mutationFn: async (coachId: string) => {
      return apiRequest("DELETE", `/api/owner/admins/${coachId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/admins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/owner/people"] });
    },
  });

  // Coach removal mutations
  const reassignSessionsMutation = useMutation({
    mutationFn: async ({ fromCoachId, toCoachId }: { fromCoachId: string; toCoachId: string }) => {
      return apiRequest("POST", `/api/owner/coaches/${fromCoachId}/reassign-sessions`, { toCoachId });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const permanentDeleteCoachMutation = useMutation({
    mutationFn: async (coachId: string) => {
      return apiRequest("DELETE", `/api/owner/coaches/${coachId}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/people"] });
      setShowRemovalModal(false);
      setCoachToRemove(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      Alert.alert("Error", `Failed to delete coach: ${err.message}`);
    },
  });

  // Fetch coach sessions when removal modal opens
  const fetchCoachSessions = async (coachId: string) => {
    try {
      setRemovalStep("loading");
      const response = await fetch(new URL(`/api/owner/coaches/${coachId}/sessions`, getApiUrl()).toString(), {
        credentials: "include",
      });
      
      if (!response.ok) {
        console.error("Failed to fetch coach sessions - server error:", response.status);
        setRemovalStep("error");
        return;
      }
      
      const data: CoachSessionsResponse = await response.json();
      if (typeof data.count !== "number") {
        console.error("Invalid response format for coach sessions");
        setRemovalStep("error");
        return;
      }
      
      setCoachSessions(data.sessions || []);
      setRemovalStep(data.count > 0 ? "has_sessions" : "no_sessions");
    } catch (error) {
      console.error("Failed to fetch coach sessions:", error);
      setRemovalStep("error");
    }
  };

  // Generate or get player invite link
  const handleGenerateInviteLink = async (playerId: string) => {
    try {
      setIsGeneratingLink(true);
      setLinkCopied(false);
      const response = await fetch(new URL(`/api/player-invites/${playerId}`, getApiUrl()).toString(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate invite link");
      }
      
      const data = await response.json();
      let baseUrl = process.env.EXPO_PUBLIC_DOMAIN || "";
      if (!baseUrl) {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || "https://localhost:5000";
        baseUrl = apiUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");
      }
      if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
        baseUrl = `https://${baseUrl}`;
      }
      baseUrl = baseUrl.replace(/\/$/, "");
      const inviteUrl = `${baseUrl}/player-invite/${data.inviteCode}`;
      setGeneratedInviteLink(inviteUrl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Failed to generate invite link:", error);
      Alert.alert("Error", "Failed to generate invite link");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (generatedInviteLink) {
      await Clipboard.setStringAsync(generatedInviteLink);
      setLinkCopied(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleStartCoachRemoval = (coach: PersonData) => {
    setCoachToRemove(coach);
    setShowRemovalModal(true);
    setSelectedTargetCoach("");
    fetchCoachSessions(coach.id);
  };

  const handleReassignAndDelete = async () => {
    if (!coachToRemove || !selectedTargetCoach) return;
    
    setRemovalStep("reassigning");
    try {
      await reassignSessionsMutation.mutateAsync({
        fromCoachId: coachToRemove.id,
        toCoachId: selectedTargetCoach,
      });
      // Now delete the coach
      setRemovalStep("deleting");
      await permanentDeleteCoachMutation.mutateAsync(coachToRemove.id);
    } catch (error) {
      setRemovalStep("has_sessions");
    }
  };

  const handlePermanentDelete = async () => {
    if (!coachToRemove) return;
    setRemovalStep("deleting");
    await permanentDeleteCoachMutation.mutateAsync(coachToRemove.id);
  };

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
    if (type === "coach") {
      // Use the new coach removal flow with session handling
      const coach = coaches.find(c => c.id === id);
      if (coach) {
        handleStartCoachRemoval(coach);
      }
      return;
    }

    // Player deletion
    const confirmDelete = () => {
      setDeletingId(id);
      deletePlayerMutation.mutate(id);
    };

    Alert.alert(
      "Permanently Delete Player",
      `This will permanently delete ${name} and ALL their data including progress, sessions, payments. This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Forever", style: "destructive", onPress: confirmDelete },
      ]
    );
  };

  const handlePromoteToAdmin = (coach: PersonData) => {
    const doPromote = () => promoteToAdminMutation.mutate(coach.id);
    Alert.alert(
      "Promote to Admin",
      `Promote ${coach.name} to admin? They will have management access.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Promote", onPress: doPromote },
      ]
    );
  };

  const handleDemoteFromAdmin = (admin: AdminData) => {
    const doDemote = () => demoteFromAdminMutation.mutate(admin.id);
    Alert.alert(
      "Demote Admin",
      `Demote ${admin.name} from admin? They will lose management access.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Demote", style: "destructive", onPress: doDemote },
      ]
    );
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
              color={activeTab === "coaches" ? Colors.dark.buttonText : Colors.dark.textMuted} 
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
              color={activeTab === "players" ? Colors.dark.buttonText : Colors.dark.textMuted} 
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
              color={activeTab === "admins" ? Colors.dark.buttonText : Colors.dark.textMuted} 
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
            {coaches.length === 0 ? (
              <Text style={styles.noCoachesText}>Add coaches first to promote them to admin</Text>
            ) : coaches.filter(c => !admins.find(a => a.id === c.id)).length === 0 ? (
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
                        <Text style={styles.personRole}>{formatCoachRole(coach.role)}</Text>
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
        onRequestClose={() => { setShowDetailModal(false); setGeneratedInviteLink(null); }}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => { setShowDetailModal(false); setGeneratedInviteLink(null); }} />
          <View style={[styles.detailModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeTab === "coaches" ? "Coach Details" : "Player Details"}
              </Text>
              <Pressable onPress={() => { setShowDetailModal(false); setGeneratedInviteLink(null); }}>
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

                {activeTab === "players" ? (
                  <PackagesCard playerId={selectedPerson.id} playerName={selectedPerson.name} />
                ) : null}

                <View style={styles.detailActions}>
                  {activeTab === "players" ? (
                    <View style={styles.inviteLinkSection}>
                      {generatedInviteLink ? (
                        <View style={styles.inviteLinkResult}>
                          <Text style={styles.inviteLinkLabel}>Invite Link:</Text>
                          <Text style={styles.inviteLinkText} numberOfLines={2}>{generatedInviteLink}</Text>
                          <Pressable
                            style={styles.copyLinkButton}
                            onPress={handleCopyInviteLink}
                          >
                            <Ionicons name={linkCopied ? "checkmark" : "copy"} size={20} color={Colors.dark.text} />
                            <Text style={styles.copyLinkButtonText}>{linkCopied ? "Copied!" : "Copy Link"}</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          style={styles.inviteLinkButton}
                          onPress={() => handleGenerateInviteLink(selectedPerson.id)}
                          disabled={isGeneratingLink}
                        >
                          {isGeneratingLink ? (
                            <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
                          ) : (
                            <>
                              <Ionicons name="link" size={20} color={Colors.dark.xpCyan} />
                              <Text style={styles.inviteLinkButtonText}>Generate Invite Link</Text>
                            </>
                          )}
                        </Pressable>
                      )}
                    </View>
                  ) : null}
                  <Pressable
                    style={styles.removeButton}
                    onPress={() => {
                      setShowDetailModal(false);
                      setGeneratedInviteLink(null);
                      setTimeout(() => {
                        handleDelete(
                          selectedPerson.id,
                          activeTab === "coaches" ? "coach" : "player",
                          selectedPerson.name
                        );
                      }, 350);
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

      {/* Coach Removal Flow Modal */}
      <Modal
        visible={showRemovalModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowRemovalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable 
            style={styles.modalBackdrop} 
            onPress={() => {
              if (removalStep !== "reassigning" && removalStep !== "deleting") {
                setShowRemovalModal(false);
              }
            }} 
          />
          <View style={[styles.removalModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Remove Coach</Text>
              {removalStep !== "reassigning" && removalStep !== "deleting" ? (
                <Pressable onPress={() => setShowRemovalModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.dark.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {coachToRemove ? (
              <View style={styles.removalContent}>
                <View style={styles.removalCoachInfo}>
                  <View style={styles.detailAvatar}>
                    <Ionicons name="person" size={32} color={Colors.dark.error} />
                  </View>
                  <Text style={styles.removalCoachName}>{coachToRemove.name}</Text>
                </View>

                {removalStep === "loading" ? (
                  <View style={styles.removalLoading}>
                    <ActivityIndicator size="large" color={Colors.dark.gold} />
                    <Text style={styles.removalLoadingText}>Checking for sessions...</Text>
                  </View>
                ) : null}

                {removalStep === "has_sessions" ? (
                  <View style={styles.removalSessionsSection}>
                    <View style={styles.warningBox}>
                      <Ionicons name="warning" size={24} color={Colors.dark.orange} />
                      <Text style={styles.warningText}>
                        This coach has {coachSessions.length} upcoming session{coachSessions.length !== 1 ? "s" : ""} that need to be reassigned before deletion.
                      </Text>
                    </View>

                    <Text style={styles.removalLabel}>Reassign sessions to:</Text>
                    <View style={styles.pickerContainer}>
                      <Picker
                        selectedValue={selectedTargetCoach}
                        onValueChange={(value: string) => setSelectedTargetCoach(value)}
                        style={styles.picker}
                        dropdownIconColor={Colors.dark.textMuted}
                      >
                        <Picker.Item label="Select a coach..." value="" color={Colors.dark.textMuted} />
                        {coaches
                          .filter(c => c.id !== coachToRemove.id)
                          .map(c => (
                            <Picker.Item key={c.id} label={c.name} value={c.id} color={Colors.dark.text} />
                          ))
                        }
                      </Picker>
                    </View>

                    <Pressable
                      style={[
                        styles.primaryButton,
                        !selectedTargetCoach && styles.primaryButtonDisabled
                      ]}
                      onPress={handleReassignAndDelete}
                      disabled={!selectedTargetCoach}
                    >
                      <Ionicons name="swap-horizontal" size={20} color={Colors.dark.buttonText} />
                      <Text style={styles.primaryButtonText}>Reassign & Delete Coach</Text>
                    </Pressable>
                  </View>
                ) : null}

                {removalStep === "no_sessions" ? (
                  <View style={styles.removalNoSessionsSection}>
                    <View style={styles.infoBox}>
                      <Ionicons name="checkmark-circle" size={24} color={Colors.dark.primary} />
                      <Text style={styles.infoText}>
                        This coach has no upcoming sessions. You can safely delete them.
                      </Text>
                    </View>

                    <Pressable
                      style={styles.dangerButton}
                      onPress={handlePermanentDelete}
                    >
                      <Ionicons name="trash" size={20} color={Colors.dark.text} />
                      <Text style={styles.dangerButtonText}>Permanently Delete Coach</Text>
                    </Pressable>

                    <Text style={styles.warningNote}>
                      This action cannot be undone. Past session history will be preserved.
                    </Text>
                  </View>
                ) : null}

                {removalStep === "reassigning" ? (
                  <View style={styles.removalLoading}>
                    <ActivityIndicator size="large" color={Colors.dark.gold} />
                    <Text style={styles.removalLoadingText}>Reassigning sessions...</Text>
                  </View>
                ) : null}

                {removalStep === "deleting" ? (
                  <View style={styles.removalLoading}>
                    <ActivityIndicator size="large" color={Colors.dark.error} />
                    <Text style={styles.removalLoadingText}>Deleting coach...</Text>
                  </View>
                ) : null}

                {removalStep === "error" ? (
                  <View style={styles.removalNoSessionsSection}>
                    <View style={styles.warningBox}>
                      <Ionicons name="alert-circle" size={24} color={Colors.dark.error} />
                      <Text style={[styles.warningText, { color: Colors.dark.error }]}>
                        Unable to check coach's sessions. Please try again.
                      </Text>
                    </View>

                    <Pressable
                      style={styles.primaryButton}
                      onPress={() => coachToRemove && fetchCoachSessions(coachToRemove.id)}
                    >
                      <Ionicons name="refresh" size={20} color={Colors.dark.buttonText} />
                      <Text style={styles.primaryButtonText}>Retry</Text>
                    </Pressable>
                  </View>
                ) : null}
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
    color: Colors.dark.buttonText,
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
    color: Colors.dark.buttonText,
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
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    minHeight: 300,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
  inviteLinkSection: {
    marginBottom: Spacing.md,
  },
  inviteLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.xpCyan}15`,
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}40`,
  },
  inviteLinkButtonText: {
    color: Colors.dark.xpCyan,
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
  },
  inviteLinkResult: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  inviteLinkLabel: {
    color: Colors.dark.textMuted,
    fontSize: Typography.small.fontSize,
    marginBottom: Spacing.xs,
  },
  inviteLinkText: {
    color: Colors.dark.text,
    fontSize: Typography.small.fontSize,
    marginBottom: Spacing.sm,
  },
  copyLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.primary}20`,
  },
  copyLinkButtonText: {
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
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
  // Coach Removal Modal Styles
  removalModalContent: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    minHeight: 350,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  removalContent: {
    gap: Spacing.lg,
  },
  removalCoachInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  removalCoachName: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  removalLoading: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  removalLoadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  removalSessionsSection: {
    gap: Spacing.md,
  },
  removalNoSessionsSection: {
    gap: Spacing.md,
    alignItems: "center",
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: `${Colors.dark.orange}15`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.orange}30`,
  },
  warningText: {
    ...Typography.body,
    color: Colors.dark.orange,
    flex: 1,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: `${Colors.dark.primary}15`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  infoText: {
    ...Typography.body,
    color: Colors.dark.primary,
    flex: 1,
  },
  removalLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  pickerContainer: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.textMuted + "30",
    overflow: "hidden",
  },
  picker: {
    color: Colors.dark.text,
    backgroundColor: "transparent",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: GlowColors.primary,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.error,
  },
  dangerButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  warningNote: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    fontStyle: "italic",
  },
});
