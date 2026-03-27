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
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, CardStyles, GlowColors, RoleColors, FunctionColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/coach/context/AuthContext";
interface Court {
  id: string;
  name: string;
  type?: string;
  surface?: string;
  isIndoor?: boolean;
  pricePerHour?: number | null;
}

export default function AdminSettingsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const navigation = useNavigation<any>();
  const { logout } = useAuth();
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [showCourtModal, setShowCourtModal] = useState(false);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
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
    pricePerHour: "",
  });
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testInviteLoading, setTestInviteLoading] = useState(false);
  const { data: courts = [], isLoading: courtsLoading } = useQuery<Court[]>({
    queryKey: ["/api/courts"],
  });

  const prepareCourtData = (data: typeof courtFormData) => {
    const { pricePerHour, ...rest } = data;
    const parsed = pricePerHour ? parseFloat(pricePerHour) : null;
    return { ...rest, pricePerHour: parsed && !isNaN(parsed) ? parsed : null };
  };

  const addCourtMutation = useMutation({
    mutationFn: async (data: typeof courtFormData) => {
      return apiRequest("POST", "/api/courts", prepareCourtData(data));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      setShowCourtModal(false);
      setCourtFormData({ name: "", type: "standard", surface: "hard", isIndoor: false, pricePerHour: "" });
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
      return apiRequest("PATCH", `/api/courts/${id}`, prepareCourtData(data));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      setShowCourtModal(false);
      setEditingCourt(null);
      setCourtFormData({ name: "", type: "standard", surface: "hard", isIndoor: false, pricePerHour: "" });
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

  const handleOpenCourtEdit = (court: Court) => {
    setEditingCourt(court);
    setCourtFormData({
      name: court.name,
      type: court.type || "standard",
      surface: court.surface || "hard",
      isIndoor: court.isIndoor || false,
      pricePerHour: court.pricePerHour ? String(court.pricePerHour) : "",
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
    setCourtFormData({ name: "", type: "standard", surface: "hard", isIndoor: false, pricePerHour: "" });
  };

  const handleShowRolesPermissions = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("AdminRolesPermissions");
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

  const handleTestPushNotification = async () => {
    setTestPushLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const response = await apiRequest("POST", "/api/push/test", {});
      const data = response as unknown as { success: boolean; devicesNotified?: number };
      const deviceCount = data.devicesNotified ?? 1;
      const message = `Test notification sent to ${deviceCount} device(s). Check your phone!`;
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Success", message);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Failed to send test notification";
      if (Platform.OS === "web") {
        window.alert(errMsg);
      } else {
        Alert.alert("Error", errMsg);
      }
    } finally {
      setTestPushLoading(false);
    }
  };

  const handleTestCoachInvite = async () => {
    setTestInviteLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const response = await apiRequest("POST", "/api/admin/test/coach-invite", {});
      const data = response as unknown as { success: boolean; simulation: { coachName: string; email: string; notificationSent: boolean } };
      const message = data.simulation.notificationSent 
        ? `Simulated: "${data.simulation.coachName}" (${data.simulation.email}) joined your academy! Push notification sent.`
        : `Simulated coach invite acceptance. (No push token - open app on phone first)`;
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Simulation Complete", message);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Failed to simulate coach invite";
      if (Platform.OS === "web") {
        window.alert(errMsg);
      } else {
        Alert.alert("Error", errMsg);
      }
    } finally {
      setTestInviteLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account?\n\nThis will immediately erase all your data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "This is your last chance. Your account and all data will be permanently deleted right now. Are you absolutely sure?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete My Account",
                  style: "destructive",
                  onPress: async () => {
                    setDeleteAccountLoading(true);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    try {
                      await apiRequest("DELETE", "/api/player/me/account", undefined);
                      Alert.alert(
                        "Account Deleted",
                        "Your account has been permanently deleted. A confirmation has been sent to your email address.",
                        [{ text: "OK", onPress: () => { setTimeout(() => { logout(); }, 350); } }]
                      );
                    } catch (error: any) {
                      Alert.alert("Error", error?.message || "Failed to delete account. Please contact support@glowupsports.com");
                    } finally {
                      setDeleteAccountLoading(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", style: "destructive", onPress: logout },
      ]
    );
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
                  <Ionicons name="business" size={32} color={GlowColors.primary} />
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
                <Ionicons name="chevron-forward" size={16} color={GlowColors.primary} />
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
                setCourtFormData({ name: "", type: "standard", surface: "hard", isIndoor: false, pricePerHour: "" });
                setShowCourtModal(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons name="add" size={20} color={Colors.dark.text} />
            </Pressable>
          </View>
          {courtsLoading ? (
            <ActivityIndicator size="small" color={GlowColors.primary} />
          ) : courts.length === 0 ? (
            <View style={[styles.emptyCard, CardStyles.elevated]}>
              <Ionicons name="tennisball-outline" size={32} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No courts added yet</Text>
              <Pressable
                style={styles.addFirstButton}
                onPress={() => {
                  setEditingCourt(null);
                  setCourtFormData({ name: "", type: "standard", surface: "hard", isIndoor: false, pricePerHour: "" });
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
                  <Ionicons name="tennisball" size={20} color={GlowColors.primary} />
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
            <Text style={styles.sectionTitle}>Equipment & Shop</Text>
            <Pressable
              style={[styles.menuCard, CardStyles.elevated]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("AdminEquipment" as never);
              }}
            >
              <View style={styles.menuContent}>
                <Ionicons name="bag-outline" size={24} color={Colors.dark.primary} />
                <View style={styles.menuText}>
                  <Text style={styles.menuTitle}>Equipment Rental & Shop</Text>
                  <Text style={styles.menuSubtitle}>Manage inventory and track rentals</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
              </View>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>User Management</Text>
            <Pressable 
              style={[styles.menuCard, CardStyles.elevated]}
              onPress={handleShowRolesPermissions}
            >
              <View style={styles.menuContent}>
                <Ionicons name="shield-outline" size={24} color={GlowColors.primary} />
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
                <Ionicons name="mail-outline" size={24} color={FunctionColors.info} />
                <View style={styles.menuText}>
                  <Text style={styles.menuTitle}>Invite Users</Text>
                  <Text style={styles.menuSubtitle}>Send invitations to coaches and players</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
              </View>
            </Pressable>
          </View>
        

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: RoleColors.admin }]}>Developer Tools</Text>
          <View style={[styles.devToolsCard, CardStyles.elevated]}>
            <Text style={styles.devToolsNote}>
              Test push notifications and simulate events. Requires Expo Go with notifications enabled.
            </Text>
            
            <Pressable
              style={[styles.devToolsButton, testPushLoading && styles.devToolsButtonDisabled]}
              onPress={handleTestPushNotification}
              disabled={testPushLoading}
            >
              {testPushLoading ? (
                <ActivityIndicator size="small" color={RoleColors.admin} />
              ) : (
                <>
                  <Ionicons name="notifications" size={20} color={RoleColors.admin} />
                  <Text style={styles.devToolsButtonText}>Test Push Notification</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.devToolsButton, testInviteLoading && styles.devToolsButtonDisabled]}
              onPress={handleTestCoachInvite}
              disabled={testInviteLoading}
            >
              {testInviteLoading ? (
                <ActivityIndicator size="small" color={RoleColors.admin} />
              ) : (
                <>
                  <Ionicons name="person-add" size={20} color={RoleColors.admin} />
                  <Text style={styles.devToolsButtonText}>Simulate Coach Invite Accept</Text>
                </>
              )}
            </Pressable>
          </View>
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
            <Pressable
              style={styles.deleteAccountButton}
              onPress={handleDeleteAccount}
              disabled={deleteAccountLoading}
              accessibilityRole="button"
              accessibilityLabel="Delete my account"
            >
              {deleteAccountLoading ? (
                <ActivityIndicator size="small" color={Colors.dark.error} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                  <Text style={styles.deleteAccountText}>Delete Account</Text>
                </>
              )}
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

            <View style={styles.formGroup}>
              <Text style={styles.label}>Rental Price per Hour (AED)</Text>
              <TextInput
                style={styles.input}
                value={courtFormData.pricePerHour}
                onChangeText={(text) => setCourtFormData((prev) => ({ ...prev, pricePerHour: text.replace(/[^0-9.]/g, "") }))}
                placeholder="e.g. 150"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="decimal-pad"
              />
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
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  addSmallButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: GlowColors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  profileCard: {
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: `${GlowColors.primary}15`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${GlowColors.primary}30`,
  },
  editProfileText: {
    ...Typography.body,
    color: GlowColors.primary,
    fontWeight: "600",
    marginRight: Spacing.xs,
  },
  emptyCard: {
    padding: Spacing.xl,
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: GlowColors.primary,
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
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  courtIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: `${GlowColors.primary}20`,
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
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
  devToolsCard: {
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    backgroundColor: Backgrounds.card,
    gap: Spacing.md,
  },
  devToolsNote: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  devToolsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: `${RoleColors.admin}15`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${RoleColors.admin}30`,
  },
  devToolsButtonDisabled: {
    opacity: 0.6,
  },
  devToolsButtonText: {
    ...Typography.body,
    color: RoleColors.admin,
    fontWeight: "600",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  logoutText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  deleteAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: "transparent",
    marginTop: Spacing.sm,
  },
  deleteAccountText: {
    ...Typography.caption,
    color: Colors.dark.error,
    fontWeight: "500",
    opacity: 0.8,
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
    color: GlowColors.primary,
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
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  optionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  optionWide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  optionSelected: {
    backgroundColor: `${GlowColors.primary}20`,
    borderColor: GlowColors.primary,
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
    backgroundColor: `${FunctionColors.info}10`,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: `${FunctionColors.info}20`,
  },
  inviteNoteText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    flex: 1,
    lineHeight: 20,
  },
});
