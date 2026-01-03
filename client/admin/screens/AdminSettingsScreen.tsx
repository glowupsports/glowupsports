import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/coach/context/AuthContext";

interface Court {
  id: string;
  name: string;
  type?: string;
  surface?: string;
  isIndoor?: boolean;
}

interface ResetOptions {
  sessions: boolean;
  attendance: boolean;
  payments: boolean;
  progress: boolean;
  feedback: boolean;
  packages: boolean;
  invoices: boolean;
}

export default function AdminSettingsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const [showCourtModal, setShowCourtModal] = useState(false);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetOptions, setResetOptions] = useState<ResetOptions>({
    sessions: false,
    attendance: false,
    payments: false,
    progress: false,
    feedback: false,
    packages: false,
    invoices: false,
  });
  const [profileData, setProfileData] = useState({
    name: "Glow Up Tennis Academy",
    email: "admin@glowuptennis.com",
  });
  const [inviteData, setInviteData] = useState({
    email: "",
    role: "player" as "coach" | "player",
  });
  const [courtFormData, setCourtFormData] = useState({
    name: "",
    type: "standard",
    surface: "hard",
    isIndoor: false,
  });

  const { data: courts = [], isLoading: courtsLoading } = useQuery<Court[]>({
    queryKey: ["/api/courts"],
  });

  const addCourtMutation = useMutation({
    mutationFn: async (data: typeof courtFormData) => {
      return apiRequest("POST", "/api/courts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      setShowCourtModal(false);
      setCourtFormData({ name: "", type: "standard", surface: "hard", isIndoor: false });
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

  const updateCourtMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof courtFormData }) => {
      return apiRequest("PATCH", `/api/courts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      setShowCourtModal(false);
      setEditingCourt(null);
      setCourtFormData({ name: "", type: "standard", surface: "hard", isIndoor: false });
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

  const deleteCourtMutation = useMutation({
    mutationFn: async (courtId: string) => {
      return apiRequest("DELETE", `/api/courts/${courtId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const resetAcademyMutation = useMutation({
    mutationFn: async ({ resetTypes, confirmationCode }: { resetTypes: ResetOptions; confirmationCode: string }) => {
      return apiRequest("POST", "/api/academy/reset", { resetTypes, confirmationCode });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries();
      setShowResetModal(false);
      setResetConfirmation("");
      setResetOptions({
        sessions: false,
        attendance: false,
        payments: false,
        progress: false,
        feedback: false,
        packages: false,
        invoices: false,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === "web") {
        window.alert("Academy data reset successfully!");
      } else {
        Alert.alert("Success", "Academy data has been reset successfully!");
      }
    },
    onError: (err: Error) => {
      if (Platform.OS === "web") {
        window.alert(`Error: ${err.message}`);
      } else {
        Alert.alert("Error", err.message);
      }
    },
  });

  const handleOpenResetModal = () => {
    setShowResetModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const handleCloseResetModal = () => {
    setShowResetModal(false);
    setResetConfirmation("");
    setResetOptions({
      sessions: false,
      attendance: false,
      payments: false,
      progress: false,
      feedback: false,
      packages: false,
      invoices: false,
    });
  };

  const handleResetAcademy = () => {
    const selectedCount = Object.values(resetOptions).filter(Boolean).length;
    if (selectedCount === 0) {
      if (Platform.OS === "web") {
        window.alert("Please select at least one data type to reset");
      } else {
        Alert.alert("Error", "Please select at least one data type to reset");
      }
      return;
    }
    if (resetConfirmation !== "RESET") {
      if (Platform.OS === "web") {
        window.alert("Please type RESET to confirm");
      } else {
        Alert.alert("Error", "Please type RESET to confirm");
      }
      return;
    }
    resetAcademyMutation.mutate({ resetTypes: resetOptions, confirmationCode: resetConfirmation });
  };

  const toggleResetOption = (key: keyof ResetOptions) => {
    setResetOptions(prev => ({ ...prev, [key]: !prev[key] }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleOpenCourtEdit = (court: Court) => {
    setEditingCourt(court);
    setCourtFormData({
      name: court.name,
      type: court.type || "standard",
      surface: court.surface || "hard",
      isIndoor: court.isIndoor || false,
    });
    setShowCourtModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveCourt = () => {
    if (editingCourt) {
      updateCourtMutation.mutate({ id: editingCourt.id, data: courtFormData });
    } else {
      addCourtMutation.mutate(courtFormData);
    }
  };

  const handleCloseCourtModal = () => {
    setShowCourtModal(false);
    setEditingCourt(null);
    setCourtFormData({ name: "", type: "standard", surface: "hard", isIndoor: false });
  };

  const handleShowRolesPermissions = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      window.alert("Roles & Permissions feature is coming soon. You'll be able to customize access levels for coaches and staff members.");
    } else {
      Alert.alert(
        "Coming Soon",
        "Roles & Permissions feature is coming soon. You'll be able to customize access levels for coaches and staff members.",
        [{ text: "OK" }]
      );
    }
  };

  const handleSaveProfile = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowProfileModal(false);
    if (Platform.OS === "web") {
      window.alert("Profile updated successfully!");
    } else {
      Alert.alert("Success", "Profile updated successfully!");
    }
  };

  const handleSendInvite = () => {
    if (!inviteData.email.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter an email address");
      } else {
        Alert.alert("Error", "Please enter an email address");
      }
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowInviteModal(false);
    if (Platform.OS === "web") {
      window.alert(`Invitation sent to ${inviteData.email} as ${inviteData.role}!`);
    } else {
      Alert.alert("Invitation Sent", `Invitation sent to ${inviteData.email} as ${inviteData.role}!`);
    }
    setInviteData({ email: "", role: "player" });
  };

  const handleDeleteCourt = (court: Court) => {
    const confirmDelete = () => {
      deleteCourtMutation.mutate(court.id);
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Delete court "${court.name}"?`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        "Delete Court",
        `Are you sure you want to delete "${court.name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: confirmDelete },
        ]
      );
    }
  };

  const handleLogout = () => {
    const confirmLogout = () => {
      logout();
    };

    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to logout?")) {
        confirmLogout();
      }
    } else {
      Alert.alert(
        "Logout",
        "Are you sure you want to logout?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Logout", style: "destructive", onPress: confirmLogout },
        ]
      );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.15)", "transparent"]}
        style={styles.headerGradient}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Academy Profile</Text>
          <View style={[styles.profileCard, CardStyles.elevated]}>
            <View style={styles.profileHeader}>
              <View style={styles.profileAvatar}>
                <Ionicons name="business" size={32} color={Colors.dark.orange} />
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{profileData.name}</Text>
                <Text style={styles.profileEmail}>{profileData.email}</Text>
              </View>
            </View>
            <Pressable 
              style={styles.editProfileButton}
              onPress={() => {
                setShowProfileModal(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text style={styles.editProfileText}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.orange} />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Courts & Facilities</Text>
            <Pressable
              style={styles.addSmallButton}
              onPress={() => {
                setEditingCourt(null);
                setCourtFormData({ name: "", type: "standard", surface: "hard", isIndoor: false });
                setShowCourtModal(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons name="add" size={20} color={Colors.dark.text} />
            </Pressable>
          </View>
          {courtsLoading ? (
            <ActivityIndicator size="small" color={Colors.dark.orange} />
          ) : courts.length === 0 ? (
            <View style={[styles.emptyCard, CardStyles.elevated]}>
              <Ionicons name="tennisball-outline" size={32} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No courts added yet</Text>
              <Pressable
                style={styles.addFirstButton}
                onPress={() => {
                  setEditingCourt(null);
                  setCourtFormData({ name: "", type: "standard", surface: "hard", isIndoor: false });
                  setShowCourtModal(true);
                }}
              >
                <Text style={styles.addFirstText}>Add First Court</Text>
              </Pressable>
            </View>
          ) : (
            courts.map((court) => (
              <Pressable
                key={court.id}
                style={[styles.courtCard, CardStyles.elevated]}
                onPress={() => handleOpenCourtEdit(court)}
                onLongPress={() => handleDeleteCourt(court)}
              >
                <View style={styles.courtIcon}>
                  <Ionicons name="tennisball" size={20} color={Colors.dark.primary} />
                </View>
                <View style={styles.courtInfo}>
                  <Text style={styles.courtName}>{court.name}</Text>
                  <Text style={styles.courtDetails}>
                    {court.surface || "Standard"} {court.isIndoor ? "Indoor" : "Outdoor"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Management</Text>
          <Pressable 
            style={[styles.menuCard, CardStyles.elevated]}
            onPress={handleShowRolesPermissions}
          >
            <View style={styles.menuContent}>
              <Ionicons name="shield-outline" size={24} color={Colors.dark.orange} />
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>Roles & Permissions</Text>
                <Text style={styles.menuSubtitle}>Manage access controls</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={[styles.menuCard, CardStyles.elevated]}
            onPress={() => {
              setShowInviteModal(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <View style={styles.menuContent}>
              <Ionicons name="mail-outline" size={24} color={Colors.dark.xpCyan} />
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>Invite Users</Text>
                <Text style={styles.menuSubtitle}>Send invitations to coaches and players</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <Pressable
            style={[styles.dangerCard, CardStyles.elevated]}
            onPress={handleOpenResetModal}
          >
            <View style={styles.menuContent}>
              <Ionicons name="refresh-outline" size={24} color={Colors.dark.error} />
              <View style={styles.menuText}>
                <Text style={[styles.menuTitle, { color: Colors.dark.error }]}>Reset Academy Data</Text>
                <Text style={styles.menuSubtitle}>Selectively clear sessions, payments, progress</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.error} />
            </View>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Pressable
            style={[styles.logoutButton, CardStyles.elevated]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={24} color={Colors.dark.error} />
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={showCourtModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseCourtModal}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={handleCloseCourtModal}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{editingCourt ? "Edit Court" : "Add Court"}</Text>
            <Pressable
              onPress={handleSaveCourt}
              disabled={addCourtMutation.isPending || updateCourtMutation.isPending}
            >
              <Text style={[styles.saveButton, (addCourtMutation.isPending || updateCourtMutation.isPending) && styles.disabledButton]}>
                {addCourtMutation.isPending || updateCourtMutation.isPending ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.formScroll}
            contentContainerStyle={styles.form}
          >
            <View style={styles.formGroup}>
              <Text style={styles.label}>Court Name *</Text>
              <TextInput
                style={styles.input}
                value={courtFormData.name}
                onChangeText={(text) => setCourtFormData((prev) => ({ ...prev, name: text }))}
                placeholder="e.g., Court 1, Center Court"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Surface Type</Text>
              <View style={styles.optionRow}>
                {["hard", "clay", "grass", "indoor"].map((surface) => (
                  <Pressable
                    key={surface}
                    style={[
                      styles.optionButton,
                      courtFormData.surface === surface && styles.optionSelected,
                    ]}
                    onPress={() => {
                      setCourtFormData((prev) => ({ ...prev, surface }));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        courtFormData.surface === surface && styles.optionTextSelected,
                      ]}
                    >
                      {surface.charAt(0).toUpperCase() + surface.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Location</Text>
              <View style={styles.optionRow}>
                <Pressable
                  style={[
                    styles.optionButton,
                    styles.optionWide,
                    !courtFormData.isIndoor && styles.optionSelected,
                  ]}
                  onPress={() => {
                    setCourtFormData((prev) => ({ ...prev, isIndoor: false }));
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons
                    name="sunny-outline"
                    size={20}
                    color={!courtFormData.isIndoor ? Colors.dark.text : Colors.dark.textMuted}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      !courtFormData.isIndoor && styles.optionTextSelected,
                    ]}
                  >
                    Outdoor
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.optionButton,
                    styles.optionWide,
                    courtFormData.isIndoor && styles.optionSelected,
                  ]}
                  onPress={() => {
                    setCourtFormData((prev) => ({ ...prev, isIndoor: true }));
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons
                    name="home-outline"
                    size={20}
                    color={courtFormData.isIndoor ? Colors.dark.text : Colors.dark.textMuted}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      courtFormData.isIndoor && styles.optionTextSelected,
                    ]}
                  >
                    Indoor
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <Modal
        visible={showProfileModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowProfileModal(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Pressable onPress={handleSaveProfile}>
              <Text style={styles.saveButton}>Save</Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.formScroll}
            contentContainerStyle={styles.form}
          >
            <View style={styles.formGroup}>
              <Text style={styles.label}>Academy Name</Text>
              <TextInput
                style={styles.input}
                value={profileData.name}
                onChangeText={(text) => setProfileData((prev) => ({ ...prev, name: text }))}
                placeholder="Academy Name"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={profileData.email}
                onChangeText={(text) => setProfileData((prev) => ({ ...prev, email: text }))}
                placeholder="admin@example.com"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <Modal
        visible={showInviteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowInviteModal(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Invite User</Text>
            <Pressable onPress={handleSendInvite}>
              <Text style={styles.saveButton}>Send</Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.formScroll}
            contentContainerStyle={styles.form}
          >
            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={inviteData.email}
                onChangeText={(text) => setInviteData((prev) => ({ ...prev, email: text }))}
                placeholder="user@example.com"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Role</Text>
              <View style={styles.optionRow}>
                <Pressable
                  style={[
                    styles.optionButton,
                    styles.optionWide,
                    inviteData.role === "coach" && styles.optionSelected,
                  ]}
                  onPress={() => {
                    setInviteData((prev) => ({ ...prev, role: "coach" }));
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={inviteData.role === "coach" ? Colors.dark.text : Colors.dark.textMuted}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      inviteData.role === "coach" && styles.optionTextSelected,
                    ]}
                  >
                    Coach
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.optionButton,
                    styles.optionWide,
                    inviteData.role === "player" && styles.optionSelected,
                  ]}
                  onPress={() => {
                    setInviteData((prev) => ({ ...prev, role: "player" }));
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons
                    name="tennisball-outline"
                    size={20}
                    color={inviteData.role === "player" ? Colors.dark.text : Colors.dark.textMuted}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      inviteData.role === "player" && styles.optionTextSelected,
                    ]}
                  >
                    Player
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.inviteNote}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.dark.textMuted} />
              <Text style={styles.inviteNoteText}>
                An invitation email will be sent to this address with instructions to join the academy.
              </Text>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <Modal
        visible={showResetModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseResetModal}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={handleCloseResetModal}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Reset Data</Text>
            <Pressable
              onPress={handleResetAcademy}
              disabled={resetAcademyMutation.isPending}
            >
              <Text style={[styles.saveButton, { color: Colors.dark.error }, resetAcademyMutation.isPending && styles.disabledButton]}>
                {resetAcademyMutation.isPending ? "Resetting..." : "Reset"}
              </Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.formScroll}
            contentContainerStyle={styles.form}
          >
            <View style={styles.warningBanner}>
              <Ionicons name="warning-outline" size={24} color={Colors.dark.error} />
              <Text style={styles.warningText}>
                This action is permanent. Selected data will be deleted and cannot be recovered.
              </Text>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>Select Data to Reset</Text>

            {[
              { key: "sessions" as const, label: "Sessions", desc: "All scheduled lessons and appointments" },
              { key: "attendance" as const, label: "Attendance Records", desc: "Player attendance history" },
              { key: "feedback" as const, label: "Session Feedback", desc: "Coach feedback and skill observations" },
              { key: "progress" as const, label: "Player Progress", desc: "XP, levels, skills, glow scores" },
              { key: "packages" as const, label: "Credit Packages", desc: "Player lesson packages" },
              { key: "invoices" as const, label: "Invoices", desc: "Generated invoice records" },
              { key: "payments" as const, label: "Payments", desc: "Payment and refund records" },
            ].map((item) => (
              <Pressable
                key={item.key}
                style={[styles.resetOption, resetOptions[item.key] && styles.resetOptionSelected]}
                onPress={() => toggleResetOption(item.key)}
              >
                <View style={styles.resetOptionCheck}>
                  <Ionicons
                    name={resetOptions[item.key] ? "checkbox" : "square-outline"}
                    size={24}
                    color={resetOptions[item.key] ? Colors.dark.error : Colors.dark.textMuted}
                  />
                </View>
                <View style={styles.resetOptionContent}>
                  <Text style={[styles.resetOptionLabel, resetOptions[item.key] && { color: Colors.dark.error }]}>
                    {item.label}
                  </Text>
                  <Text style={styles.resetOptionDesc}>{item.desc}</Text>
                </View>
              </Pressable>
            ))}

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: Colors.dark.error }]}>Type RESET to confirm</Text>
              <TextInput
                style={[styles.input, { borderColor: resetConfirmation === "RESET" ? Colors.dark.error : Colors.dark.border }]}
                value={resetConfirmation}
                onChangeText={setResetConfirmation}
                placeholder="RESET"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="characters"
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
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  addSmallButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.orange,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  profileCard: {
    padding: Spacing.lg,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: `${Colors.dark.orange}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  profileName: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  profileEmail: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  editProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    backgroundColor: `${Colors.dark.orange}20`,
    borderRadius: BorderRadius.md,
  },
  editProfileText: {
    ...Typography.body,
    color: Colors.dark.orange,
    fontWeight: "600",
    marginRight: Spacing.xs,
  },
  emptyCard: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  addFirstButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.md,
  },
  addFirstText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  courtCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  courtIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  courtInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  courtName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  courtDetails: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  menuCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
  },
  menuContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  menuText: {
    flex: 1,
  },
  menuTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  menuSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  logoutText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  dangerCard: {
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.error}30`,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${Colors.dark.error}15`,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  warningText: {
    ...Typography.small,
    color: Colors.dark.error,
    flex: 1,
  },
  resetOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  resetOptionSelected: {
    borderColor: Colors.dark.error,
    backgroundColor: `${Colors.dark.error}10`,
  },
  resetOptionCheck: {
    marginRight: Spacing.md,
  },
  resetOptionContent: {
    flex: 1,
  },
  resetOptionLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  resetOptionDesc: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
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
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  optionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  optionWide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  optionSelected: {
    backgroundColor: `${Colors.dark.orange}20`,
    borderColor: Colors.dark.orange,
  },
  optionText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  optionTextSelected: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  inviteNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: `${Colors.dark.xpCyan}10`,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  inviteNoteText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    flex: 1,
    lineHeight: 20,
  },
});
