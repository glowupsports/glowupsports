import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert, Platform, ActivityIndicator, Share, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, CardStyles, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/coach/context/AuthContext";
import type { PlatformStackParamList } from "@/platform/navigation/PlatformNavigator";

const PLATFORM_COLOR = "#9B59B6";

type AcademyDetailRouteProp = RouteProp<PlatformStackParamList, "AcademyDetail">;
type NavigationProp = NativeStackNavigationProp<PlatformStackParamList>;

interface AcademyDetails {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  coaches: { id: string; name: string; email: string }[];
  players: { id: string; name: string; ballLevel: string }[];
  createdAt: string;
}

interface Invite {
  id: string;
  token: string;
  shortCode: string | null;
  role: string;
  invitedEmail: string | null;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
}

export default function AcademyDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<AcademyDetailRouteProp>();
  const { academyId, academyName } = route.params;
  const queryClient = useQueryClient();
  const { startImpersonation } = useAuth();
  const [isImpersonating, setIsImpersonatingLocal] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(academyName);
  const [editCurrency, setEditCurrency] = useState("AED");
  const [editTimezone, setEditTimezone] = useState("Asia/Dubai");
  const [selectedInviteRole, setSelectedInviteRole] = useState<"academy_owner" | "coach">("academy_owner");
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<{ token: string; role: string; shortCode: string } | null>(null);
  const [modalCopied, setModalCopied] = useState(false);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [addMemberRole, setAddMemberRole] = useState<"academy_owner" | "coach">("coach");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"academy_owner" | "coach" | "player">("coach");

  const { data: academy, isLoading } = useQuery<AcademyDetails>({
    queryKey: ["/api/platform/academies", academyId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/platform/academies/${academyId}`);
      return res.json();
    },
  });

  useEffect(() => {
    if (academy) {
      setEditName(academy.name);
      setEditCurrency(academy.currency || "AED");
      setEditTimezone(academy.timezone || "Asia/Dubai");
    }
  }, [academy]);

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; currency: string; timezone: string }) => {
      return apiRequest("PATCH", `/api/platform/academies/${academyId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/academies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/platform/academies/${academyId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/academies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/financials"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    },
    onError: (error: Error) => {
      console.error("Delete academy error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", `Failed to delete academy: ${error.message}`);
    },
  });

  const { data: invitesData, isLoading: invitesLoading } = useQuery<{ invites: Invite[] }>({
    queryKey: ["/api/platform/academies", academyId, "invites"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/platform/academies/${academyId}/invites`);
      return res.json();
    },
  });

  interface PlatformUser {
    id: string;
    username: string;
    email: string;
    role: string;
    academyId: string | null;
  }

  const { data: usersData } = useQuery<{ users: PlatformUser[] }>({
    queryKey: ["/api/platform/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/platform/users");
      return res.json();
    },
    enabled: showAddMemberModal,
  });

  const addMemberMutation = useMutation({
    mutationFn: async (data: { userId: string; role: string }) => {
      const response = await apiRequest("POST", `/api/platform/academies/${academyId}/members`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/academies", academyId] });
      setShowAddMemberModal(false);
      setSelectedUserId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === "web") {
        window.alert("Member added successfully!");
      } else {
        Alert.alert("Success", "Member added successfully!");
      }
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (Platform.OS === "web") {
        window.alert(`Failed to add member: ${error.message}`);
      } else {
        Alert.alert("Error", `Failed to add member: ${error.message}`);
      }
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; email?: string; name?: string; role: string }) => {
      const response = await apiRequest("POST", `/api/platform/academies/${academyId}/users`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/academies", academyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/users"] });
      setShowCreateAccountModal(false);
      setNewUsername("");
      setNewPassword("");
      setNewEmail("");
      setNewName("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === "web") {
        window.alert("Account created successfully!");
      } else {
        Alert.alert("Success", "Account created successfully!");
      }
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (Platform.OS === "web") {
        window.alert(`Failed to create account: ${error.message}`);
      } else {
        Alert.alert("Error", `Failed to create account: ${error.message}`);
      }
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: async (role: string) => {
      const response = await apiRequest("POST", `/api/platform/academies/${academyId}/invites`, { role });
      return response.json();
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/academies", academyId, "invites"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      if (data.invite?.token) {
        const code = data.invite.shortCode ?? data.invite.token.slice(0, 6).toUpperCase();
        setPendingInvite({
          token: data.invite.token,
          role: data.invite.role,
          shortCode: code,
        });
        setModalCopied(false);
        setShowInviteModal(true);
      }
    },
    onError: (error: Error) => {
      console.error("Create invite error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (Platform.OS === "web") {
        window.alert(`Failed to create invite: ${error.message}`);
      } else {
        Alert.alert("Error", `Failed to create invite: ${error.message}`);
      }
    },
  });

  const getInviteCode = (invite: Invite): string =>
    invite.shortCode ?? invite.token.slice(0, 6).toUpperCase();

  const handleCopyInviteLink = async (invite: Invite) => {
    try {
      await Clipboard.setStringAsync(getInviteCode(invite));
      setCopiedInviteId(invite.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setCopiedInviteId(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleShareInviteLink = async (invite: Invite) => {
    const code = getInviteCode(invite);
    const roleLabel = invite.role === "academy_owner" ? "Academy Owner" : "Coach";
    try {
      await Share.share({
        message: `Join ${academyName} as ${roleLabel} — invite code: ${code}`,
      });
    } catch (error) {
      console.error("Failed to share:", error);
    }
  };

  const handleCreateInvite = () => {
    createInviteMutation.mutate(selectedInviteRole);
  };

  const handleModalCopy = async () => {
    if (!pendingInvite) return;
    try {
      await Clipboard.setStringAsync(pendingInvite.shortCode);
      setModalCopied(true);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setModalCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleModalShare = async () => {
    if (!pendingInvite) return;
    const roleLabel = pendingInvite.role === "academy_owner" ? "Academy Owner" : "Coach";
    try {
      await Share.share({
        message: `Join ${academyName} as ${roleLabel} — invite code: ${pendingInvite.shortCode}`,
      });
    } catch (error) {
      console.error("Failed to share:", error);
    }
  };

  const handleCloseInviteModal = () => {
    setShowInviteModal(false);
    setPendingInvite(null);
  };

  const handleAddMember = () => {
    if (!selectedUserId) return;
    addMemberMutation.mutate({ userId: selectedUserId, role: addMemberRole });
  };

  const handleCreateAccount = () => {
    if (!newUsername || !newPassword) {
      if (Platform.OS === "web") {
        window.alert("Username and password are required");
      } else {
        Alert.alert("Error", "Username and password are required");
      }
      return;
    }
    createAccountMutation.mutate({
      username: newUsername,
      password: newPassword,
      email: newEmail || undefined,
      name: newName || undefined,
      role: newRole,
    });
  };

  const handleImpersonate = async () => {
    setIsImpersonatingLocal(true);
    try {
      const result = await startImpersonation(academyId, academyName);
      if (!result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        if (Platform.OS === "web") {
          window.alert(result.error || "Failed to view as owner");
        } else {
          Alert.alert("Error", result.error || "Failed to view as owner");
        }
      }
    } catch (error) {
      console.error("Impersonation error:", error);
    } finally {
      setIsImpersonatingLocal(false);
    }
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowDeleteConfirm(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      name: editName,
      currency: editCurrency,
      timezone: editTimezone,
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading academy...</Text>
      </View>
    );
  }

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
        <Text style={styles.topBarTitle}>{academyName}</Text>
        <Pressable 
          style={styles.editButton} 
          onPress={() => setIsEditing(!isEditing)}
        >
          <Ionicons name={isEditing ? "close" : "create-outline"} size={24} color={PLATFORM_COLOR} />
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={[styles.impersonateButton, isImpersonating && { opacity: 0.6 }]}
          onPress={handleImpersonate}
          disabled={isImpersonating}
        >
          <LinearGradient
            colors={["#9B59B6", "#8E44AD"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.impersonateGradient}
          >
            {isImpersonating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="eye-outline" size={20} color="#fff" />
            )}
            <Text style={styles.impersonateText}>
              {isImpersonating ? "Switching..." : "View as Owner"}
            </Text>
          </LinearGradient>
        </Pressable>

        <V2CreditsHealthCard academyId={academyId} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Academy Details</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <View style={styles.formRow}>
              <Text style={styles.label}>Name</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Academy name"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              ) : (
                <Text style={styles.value}>{academyName}</Text>
              )}
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Currency</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={editCurrency}
                  onChangeText={setEditCurrency}
                  placeholder="AED"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              ) : (
                <Text style={styles.value}>{academy?.currency || "AED"}</Text>
              )}
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Timezone</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={editTimezone}
                  onChangeText={setEditTimezone}
                  placeholder="Asia/Dubai"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              ) : (
                <Text style={styles.value}>{academy?.timezone || "Asia/Dubai"}</Text>
              )}
            </View>

            {isEditing ? (
              <Pressable 
                style={styles.saveButton}
                onPress={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.text} />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coaches ({academy?.coaches?.length || 0})</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            {academy?.coaches?.length ? (
              academy.coaches.map((coach) => (
                <View key={coach.id} style={styles.listItem}>
                  <View style={styles.listItemIcon}>
                    <Ionicons name="person" size={20} color={PLATFORM_COLOR} />
                  </View>
                  <View style={styles.listItemInfo}>
                    <Text style={styles.listItemName}>{coach.name}</Text>
                    <Text style={styles.listItemSub}>{coach.email}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No coaches assigned</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Players ({academy?.players?.length || 0})</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            {academy?.players?.length ? (
              academy.players.slice(0, 10).map((player) => (
                <View key={player.id} style={styles.listItem}>
                  <View style={[styles.listItemIcon, { backgroundColor: `${Colors.dark.xpCyan}20` }]}>
                    <Ionicons name="tennisball" size={20} color={Colors.dark.xpCyan} />
                  </View>
                  <View style={styles.listItemInfo}>
                    <Text style={styles.listItemName}>{player.name}</Text>
                    <Text style={styles.listItemSub}>{player.ballLevel || "No level"}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No players enrolled</Text>
            )}
            {(academy?.players?.length || 0) > 10 ? (
              <Text style={styles.moreText}>+{(academy?.players?.length || 0) - 10} more players</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Members</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <View style={styles.addMemberButtons}>
              <Pressable
                style={styles.addMemberButton}
                onPress={() => setShowAddMemberModal(true)}
              >
                <Ionicons name="person-add-outline" size={20} color={PLATFORM_COLOR} />
                <Text style={styles.addMemberButtonText}>Add Existing User</Text>
              </Pressable>
              <Pressable
                style={[styles.addMemberButton, styles.createAccountButton]}
                onPress={() => setShowCreateAccountModal(true)}
              >
                <Ionicons name="create-outline" size={20} color={Colors.dark.text} />
                <Text style={styles.createAccountButtonText}>Create Account</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invite Codes</Text>
          <View style={[styles.card, CardStyles.elevated]}>
            <View style={styles.inviteRoleSelector}>
              <Pressable
                style={[
                  styles.roleButton,
                  selectedInviteRole === "academy_owner" && styles.roleButtonActive,
                ]}
                onPress={() => setSelectedInviteRole("academy_owner")}
              >
                <Text style={[
                  styles.roleButtonText,
                  selectedInviteRole === "academy_owner" && styles.roleButtonTextActive,
                ]}>Academy Owner</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.roleButton,
                  selectedInviteRole === "coach" && styles.roleButtonActive,
                ]}
                onPress={() => setSelectedInviteRole("coach")}
              >
                <Text style={[
                  styles.roleButtonText,
                  selectedInviteRole === "coach" && styles.roleButtonTextActive,
                ]}>Coach</Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.createInviteButton}
              onPress={handleCreateInvite}
              disabled={createInviteMutation.isPending}
            >
              {createInviteMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.text} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={20} color={Colors.dark.text} />
                  <Text style={styles.createInviteButtonText}>Create Invite Code</Text>
                </>
              )}
            </Pressable>

            {invitesLoading ? (
              <ActivityIndicator size="small" color={PLATFORM_COLOR} style={{ marginTop: Spacing.md }} />
            ) : invitesData?.invites?.length ? (
              <View style={styles.invitesList}>
                {invitesData.invites.filter(inv => !inv.usedAt).map((invite) => {
                  const isExpired = new Date(invite.expiresAt) < new Date();
                  const roleLabel = invite.role === "academy_owner" ? "Owner" : "Coach";
                  return (
                    <View key={invite.id} style={[styles.inviteItem, isExpired && styles.inviteItemExpired]}>
                      <View style={styles.inviteInfo}>
                        <View style={styles.inviteRoleBadge}>
                          <Text style={styles.inviteRoleText}>{roleLabel}</Text>
                        </View>
                        <Text style={styles.inviteToken} numberOfLines={1}>
                          {getInviteCode(invite)}
                        </Text>
                        {isExpired ? (
                          <Text style={styles.inviteExpired}>Expired</Text>
                        ) : (
                          <Text style={styles.inviteExpires}>
                            Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                      {!isExpired ? (
                        <View style={styles.inviteActions}>
                          <Pressable
                            style={styles.inviteActionButton}
                            onPress={() => handleCopyInviteLink(invite)}
                          >
                            <Ionicons 
                              name={copiedInviteId === invite.id ? "checkmark" : "copy-outline"} 
                              size={18} 
                              color={copiedInviteId === invite.id ? Colors.dark.successNeon : PLATFORM_COLOR} 
                            />
                          </Pressable>
                          <Pressable
                            style={styles.inviteActionButton}
                            onPress={() => handleShareInviteLink(invite)}
                          >
                            <Ionicons name="share-outline" size={18} color={PLATFORM_COLOR} />
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.emptyText, { marginTop: Spacing.md }]}>No invite codes created yet</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <Pressable 
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.error} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={20} color={Colors.dark.error} />
                <Text style={styles.deleteButtonText}>Delete Academy</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>

      <Modal
        visible={showInviteModal}
        animationType="fade"
        transparent
        onRequestClose={handleCloseInviteModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={handleCloseInviteModal} />
          <View style={[styles.inviteModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.inviteIconContainer}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.dark.primary} />
            </View>
            
            <Text style={styles.inviteModalTitle}>Invite Code Created!</Text>
            <Text style={styles.inviteModalSubtitle}>
              Share this code to invite someone as {pendingInvite?.role === "academy_owner" ? "Academy Owner" : "Coach"}:
            </Text>

            <View style={styles.inviteLinkBox}>
              <Text style={styles.inviteLinkLabel}>Invite Code</Text>
              <Text style={[styles.inviteLinkText, { letterSpacing: 4, fontSize: 24, textAlign: "center" }]} selectable>
                {pendingInvite?.shortCode}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable 
                style={[styles.copyButton, modalCopied && styles.copyButtonSuccess]} 
                onPress={handleModalCopy}
              >
                <Ionicons 
                  name={modalCopied ? "checkmark" : "copy-outline"} 
                  size={20} 
                  color={Colors.dark.buttonText} 
                />
                <Text style={styles.copyButtonText}>
                  {modalCopied ? "Copied!" : "Copy Code"}
                </Text>
              </Pressable>
              
              {Platform.OS !== "web" ? (
                <Pressable style={styles.shareButton} onPress={handleModalShare}>
                  <Ionicons name="share-outline" size={20} color={PLATFORM_COLOR} />
                  <Text style={styles.shareButtonText}>Share</Text>
                </Pressable>
              ) : null}
              
              <Pressable style={styles.doneButton} onPress={handleCloseInviteModal}>
                <Text style={styles.doneButtonText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAddMemberModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddMemberModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowAddMemberModal(false)} />
          <View style={[styles.addMemberModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <Text style={styles.modalTitle}>Add Existing User</Text>
            <Text style={styles.modalSubtitle}>Select a user to add to this academy</Text>

            <View style={styles.roleSelector}>
              <Text style={styles.roleSelectorLabel}>Role:</Text>
              <View style={styles.inviteRoleSelector}>
                <Pressable
                  style={[styles.roleButton, addMemberRole === "coach" && styles.roleButtonActive]}
                  onPress={() => setAddMemberRole("coach")}
                >
                  <Text style={[styles.roleButtonText, addMemberRole === "coach" && styles.roleButtonTextActive]}>Coach</Text>
                </Pressable>
                <Pressable
                  style={[styles.roleButton, addMemberRole === "academy_owner" && styles.roleButtonActive]}
                  onPress={() => setAddMemberRole("academy_owner")}
                >
                  <Text style={[styles.roleButtonText, addMemberRole === "academy_owner" && styles.roleButtonTextActive]}>Owner</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.userList}>
              {usersData?.users?.filter(u => u.academyId !== academyId).slice(0, 10).map((user) => (
                <Pressable
                  key={user.id}
                  style={[styles.userItem, selectedUserId === user.id && styles.userItemSelected]}
                  onPress={() => setSelectedUserId(user.id)}
                >
                  <Ionicons 
                    name={selectedUserId === user.id ? "checkmark-circle" : "ellipse-outline"} 
                    size={20} 
                    color={selectedUserId === user.id ? PLATFORM_COLOR : Colors.dark.textMuted} 
                  />
                  <View style={styles.userItemInfo}>
                    <Text style={styles.userItemName}>{user.username}</Text>
                    <Text style={styles.userItemSub}>{user.email} - {user.role}</Text>
                  </View>
                </Pressable>
              )) || <Text style={styles.emptyText}>No users available</Text>}
            </View>

            <View style={styles.modalButtons}>
              <Pressable style={styles.cancelButton} onPress={() => setShowAddMemberModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, !selectedUserId && styles.confirmButtonDisabled]}
                onPress={handleAddMember}
                disabled={!selectedUserId || addMemberMutation.isPending}
              >
                {addMemberMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.text} />
                ) : (
                  <Text style={styles.confirmButtonText}>Add Member</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCreateAccountModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateAccountModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowCreateAccountModal(false)} />
          <KeyboardAwareScrollViewCompat style={styles.createAccountScrollView}>
            <View style={[styles.createAccountModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <Text style={styles.modalTitle}>Create New Account</Text>
              <Text style={styles.modalSubtitle}>Create a user with login credentials</Text>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Username *</Text>
                <TextInput
                  style={styles.formInput}
                  value={newUsername}
                  onChangeText={setNewUsername}
                  placeholder="Enter username"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Password *</Text>
                <TextInput
                  style={styles.formInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter password"
                  placeholderTextColor={Colors.dark.textMuted}
                  secureTextEntry
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Display Name</Text>
                <TextInput
                  style={styles.formInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Enter name (optional)"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Email</Text>
                <TextInput
                  style={styles.formInput}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder="Enter email (optional)"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Role</Text>
                <View style={styles.roleButtons}>
                  <Pressable
                    style={[styles.roleOption, newRole === "coach" && styles.roleOptionActive]}
                    onPress={() => setNewRole("coach")}
                  >
                    <Text style={[styles.roleOptionText, newRole === "coach" && styles.roleOptionTextActive]}>Coach</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.roleOption, newRole === "academy_owner" && styles.roleOptionActive]}
                    onPress={() => setNewRole("academy_owner")}
                  >
                    <Text style={[styles.roleOptionText, newRole === "academy_owner" && styles.roleOptionTextActive]}>Owner</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.roleOption, newRole === "player" && styles.roleOptionActive]}
                    onPress={() => setNewRole("player")}
                  >
                    <Text style={[styles.roleOptionText, newRole === "player" && styles.roleOptionTextActive]}>Player</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.modalButtons}>
                <Pressable style={styles.cancelButton} onPress={() => setShowCreateAccountModal(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.confirmButton, (!newUsername || !newPassword) && styles.confirmButtonDisabled]}
                  onPress={handleCreateAccount}
                  disabled={!newUsername || !newPassword || createAccountMutation.isPending}
                >
                  {createAccountMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.text} />
                  ) : (
                    <Text style={styles.confirmButtonText}>Create Account</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <Modal
        visible={showDeleteConfirm}
        animationType="fade"
        transparent
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowDeleteConfirm(false)} />
          <View style={[styles.inviteModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={[styles.inviteIconContainer, { backgroundColor: `${Colors.dark.error}20` }]}>
              <Ionicons name="trash-outline" size={32} color={Colors.dark.error} />
            </View>
            <Text style={[styles.inviteModalTitle, { color: Colors.dark.error }]}>Delete Academy</Text>
            <Text style={[styles.inviteModalSubtitle, { textAlign: "center" }]}>
              {`Are you sure you want to delete "${academyName}"? This action cannot be undone. All associated coaches and players will be removed.`}
            </Text>
            <View style={styles.modalButtonRow}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.destructiveButton}
                onPress={() => {
                  deleteMutation.mutate();
                  setShowDeleteConfirm(false);
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.text} />
                ) : (
                  <Text style={styles.destructiveButtonText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface V2HealthData {
  v2Enabled: boolean;
  totals: { group: number; semi_private: number; private: number };
  totalDebt: number;
  expiringSoon: { lots: number; qty: string | number };
  manualAdjustmentsLast30d: number;
  lotCounts: { active_lots?: number; expired_lots?: number; depleted_lots?: number };
}
function V2CreditsHealthCard({ academyId }: { academyId: string }) {
  const { data } = useQuery<V2HealthData>({
    queryKey: [`/api/v2/credits/health/${academyId}`],
    enabled: !!academyId,
  });
  if (!data || data.v2Enabled !== true) return null;
  return (
    <View style={[styles.section]}>
      <Text style={styles.sectionTitle}>Credits V2 Health</Text>
      <View style={[styles.card, CardStyles.elevated, { padding: Spacing.md, gap: Spacing.sm }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: Colors.dark.textMuted }}>Group</Text>
          <Text style={{ color: Colors.dark.text, fontWeight: "700" }}>{data.totals.group}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: Colors.dark.textMuted }}>Semi-Private</Text>
          <Text style={{ color: Colors.dark.text, fontWeight: "700" }}>{data.totals.semi_private}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: Colors.dark.textMuted }}>Private</Text>
          <Text style={{ color: Colors.dark.text, fontWeight: "700" }}>{data.totals.private}</Text>
        </View>
        <View style={{ height: 1, backgroundColor: Colors.dark.borderSubtle, marginVertical: Spacing.xs }} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: Colors.dark.textMuted }}>Total debt</Text>
          <Text style={{ color: data.totalDebt < 0 ? Colors.dark.error : Colors.dark.text, fontWeight: "700" }}>{data.totalDebt}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: Colors.dark.textMuted }}>Lots expiring (14d)</Text>
          <Text style={{ color: Colors.dark.gold, fontWeight: "700" }}>{data.expiringSoon.lots} lots / {Number(data.expiringSoon.qty)} credits</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: Colors.dark.textMuted }}>Manual adj. (30d)</Text>
          <Text style={{ color: Colors.dark.text, fontWeight: "700" }}>{data.manualAdjustmentsLast30d}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: Colors.dark.textMuted }}>Lots active / depleted / expired</Text>
          <Text style={{ color: Colors.dark.text, fontWeight: "700" }}>
            {data.lotCounts.active_lots ?? 0} / {data.lotCounts.depleted_lots ?? 0} / {data.lotCounts.expired_lots ?? 0}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  impersonateButton: {
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  impersonateGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    gap: 8,
  },
  impersonateText: {
    ...Typography.bodyBold,
    color: "#fff",
    fontSize: 16,
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
    ...Typography.h2,
    color: Colors.dark.text,
    flex: 1,
    textAlign: "center",
  },
  editButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: `${PLATFORM_COLOR}20`,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  card: {
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  formRow: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  value: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  input: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  saveButton: {
    backgroundColor: PLATFORM_COLOR,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  listItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${PLATFORM_COLOR}20`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  listItemInfo: {
    flex: 1,
  },
  listItemName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  listItemSub: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingVertical: Spacing.md,
  },
  moreText: {
    ...Typography.small,
    color: PLATFORM_COLOR,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  deleteButtonText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  inviteRoleSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  roleButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
  },
  roleButtonActive: {
    backgroundColor: PLATFORM_COLOR,
  },
  roleButtonText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  roleButtonTextActive: {
    color: Colors.dark.text,
  },
  createInviteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: PLATFORM_COLOR,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  createInviteButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  invitesList: {
    marginTop: Spacing.md,
  },
  inviteItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  inviteItemExpired: {
    opacity: 0.5,
  },
  inviteInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  inviteRoleBadge: {
    backgroundColor: `${PLATFORM_COLOR}30`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  inviteRoleText: {
    ...Typography.small,
    color: PLATFORM_COLOR,
    fontWeight: "600",
    fontSize: 10,
  },
  inviteToken: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontFamily: "monospace",
  },
  inviteExpires: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  inviteExpired: {
    ...Typography.small,
    color: Colors.dark.error,
    fontSize: 10,
  },
  inviteActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  inviteActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${PLATFORM_COLOR}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  inviteModalContent: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginHorizontal: Spacing.lg,
    maxWidth: 400,
    width: "90%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  inviteIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  inviteModalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  inviteModalSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  inviteLinkBox: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    width: "100%",
    marginBottom: Spacing.lg,
  },
  inviteLinkLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  inviteLinkText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontFamily: "monospace",
    fontSize: 12,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    width: "100%",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: PLATFORM_COLOR,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    minWidth: 120,
    justifyContent: "center",
  },
  copyButtonSuccess: {
    backgroundColor: Colors.dark.successNeon,
  },
  copyButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: `${PLATFORM_COLOR}20`,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  shareButtonText: {
    ...Typography.body,
    color: PLATFORM_COLOR,
    fontWeight: "600",
  },
  doneButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  doneButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  addMemberButtons: {
    gap: Spacing.md,
  },
  addMemberButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: `${PLATFORM_COLOR}20`,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: PLATFORM_COLOR + "40",
  },
  addMemberButtonText: {
    ...Typography.body,
    color: PLATFORM_COLOR,
    fontWeight: "600",
  },
  createAccountButton: {
    backgroundColor: PLATFORM_COLOR,
    borderColor: PLATFORM_COLOR,
  },
  createAccountButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  addMemberModalContent: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  createAccountScrollView: {
    width: "100%",
    maxHeight: "90%",
  },
  createAccountModalContent: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    margin: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  modalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  roleSelector: {
    marginBottom: Spacing.md,
  },
  roleSelectorLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  userList: {
    maxHeight: 250,
    marginBottom: Spacing.lg,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  userItemSelected: {
    backgroundColor: `${PLATFORM_COLOR}20`,
    borderWidth: 1,
    borderColor: PLATFORM_COLOR,
  },
  userItemInfo: {
    flex: 1,
  },
  userItemName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  userItemSub: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
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
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  destructiveButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
  },
  destructiveButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: PLATFORM_COLOR,
    alignItems: "center",
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  formLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  formInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
  },
  roleButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  roleOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
  },
  roleOptionActive: {
    backgroundColor: PLATFORM_COLOR,
  },
  roleOptionText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  roleOptionTextActive: {
    color: Colors.dark.text,
  },
});
