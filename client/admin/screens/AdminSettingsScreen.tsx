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

export default function AdminSettingsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const [showCourtModal, setShowCourtModal] = useState(false);
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

  const deleteCourtMutation = useMutation({
    mutationFn: async (courtId: string) => {
      return apiRequest("DELETE", `/api/courts/${courtId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

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
                <Text style={styles.profileName}>Glow Up Tennis Academy</Text>
                <Text style={styles.profileEmail}>admin@glowuptennis.com</Text>
              </View>
            </View>
            <Pressable style={styles.editProfileButton}>
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
                onPress={() => setShowCourtModal(true)}
              >
                <Text style={styles.addFirstText}>Add First Court</Text>
              </Pressable>
            </View>
          ) : (
            courts.map((court) => (
              <Pressable
                key={court.id}
                style={[styles.courtCard, CardStyles.elevated]}
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
          <Pressable style={[styles.menuCard, CardStyles.elevated]}>
            <View style={styles.menuContent}>
              <Ionicons name="shield-outline" size={24} color={Colors.dark.orange} />
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>Roles & Permissions</Text>
                <Text style={styles.menuSubtitle}>Manage access controls</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable style={[styles.menuCard, CardStyles.elevated]}>
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
        onRequestClose={() => setShowCourtModal(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowCourtModal(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Add Court</Text>
            <Pressable
              onPress={() => addCourtMutation.mutate(courtFormData)}
              disabled={addCourtMutation.isPending}
            >
              <Text style={[styles.saveButton, addCourtMutation.isPending && styles.disabledButton]}>
                {addCourtMutation.isPending ? "Saving..." : "Save"}
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
});
