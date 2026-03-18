import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Modal,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing } from "@/constants/theme";
import { getStaticAssetsUrl, apiRequest } from "@/lib/query-client";
import {
  PROVIDER_SPECIALIZATIONS,
  SPECIALIZATION_KEYS,
  ProviderSpecialization,
  getPrimarySpecialization,
} from "@/provider/constants/specializations";

interface ProviderProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  profilePhotoUrl: string | null;
  specializations: string[];
  rating: string | null;
  totalBookings: number;
  isActive: boolean;
  isOnboarded: boolean;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= Math.round(rating) ? "star" : "star-outline"}
          size={16}
          color={star <= Math.round(rating) ? "#FFD700" : Colors.dark.textSecondary}
        />
      ))}
      <Text style={styles.ratingText}>{Number(rating).toFixed(1)}</Text>
    </View>
  );
}

function EditSpecializationsModal({
  visible,
  current,
  onClose,
  onSave,
}: {
  visible: boolean;
  current: string[];
  onClose: () => void;
  onSave: (specs: ProviderSpecialization[]) => void;
}) {
  const [selected, setSelected] = useState<ProviderSpecialization[]>(
    (current as ProviderSpecialization[]).filter((k) => k in PROVIDER_SPECIALIZATIONS)
  );
  const insets = useSafeAreaInsets();

  const toggle = (key: ProviderSpecialization) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[modalStyles.container, { paddingTop: insets.top }]}>
        <View style={modalStyles.header}>
          <Text style={modalStyles.title}>Edit Specializations</Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={modalStyles.grid}
          showsVerticalScrollIndicator={false}
        >
          {SPECIALIZATION_KEYS.map((key) => {
            const spec = PROVIDER_SPECIALIZATIONS[key];
            const isSelected = selected.includes(key);
            return (
              <Pressable
                key={key}
                style={[
                  modalStyles.card,
                  isSelected && { borderColor: Colors.dark.primary, borderWidth: 2 },
                ]}
                onPress={() => toggle(key)}
              >
                {isSelected ? (
                  <View style={modalStyles.checkBadge}>
                    <Ionicons name="checkmark" size={10} color="#000" />
                  </View>
                ) : null}
                <View style={[modalStyles.iconCircle, { backgroundColor: spec.color + "20" }]}>
                  <Ionicons name={spec.icon} size={22} color={spec.color} />
                </View>
                <Text style={modalStyles.label} numberOfLines={1}>{spec.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={[modalStyles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Pressable
            style={[modalStyles.saveBtn, selected.length === 0 && { opacity: 0.4 }]}
            onPress={() => { if (selected.length > 0) onSave(selected); }}
            disabled={selected.length === 0}
          >
            <Text style={modalStyles.saveBtnText}>Save Changes</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function ProviderProfileScreen() {
  const insets = useSafeAreaInsets();
  const { signOut, user } = useAuth();
  const queryClient = useQueryClient();
  const [showEditSpecs, setShowEditSpecs] = useState(false);

  const { data: provider, isLoading } = useQuery<ProviderProfile>({
    queryKey: ["/api/provider/me"],
  });

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  const handleSaveSpecs = async (specs: ProviderSpecialization[]) => {
    try {
      const res = await apiRequest("PATCH", "/api/provider/me", { specializations: specs });
      if (!res.ok) throw new Error("Failed");
      await queryClient.invalidateQueries({ queryKey: ["/api/provider/me"] });
      setShowEditSpecs(false);
    } catch {
      Alert.alert("Error", "Could not save specializations. Please try again.");
    }
  };

  const displayName = provider?.displayName ?? user?.name ?? "Provider";
  const photoUrl = provider?.profilePhotoUrl ?? null;
  const specs = provider?.specializations ?? [];
  const primary = getPrimarySpecialization(specs);

  const photoUri = photoUrl
    ? photoUrl.startsWith("/") ? getStaticAssetsUrl() + photoUrl : photoUrl
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.delay(50).duration(300)}>
          <View style={[styles.profileCard, { borderColor: primary.color + "30" }]}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.profilePhoto} />
            ) : (
              <View style={[styles.profilePhotoPlaceholder, { backgroundColor: primary.color + "20" }]}>
                <Ionicons name={primary.icon} size={40} color={primary.color} />
              </View>
            )}
            <Text style={styles.profileName}>{displayName}</Text>
            <Pressable
              style={styles.editProfileButton}
              onPress={() =>
                Alert.alert("Edit Profile", "Profile editing will be available in a future update.")
              }
            >
              <Ionicons name="pencil-outline" size={14} color={Colors.dark.primary} />
              <Text style={styles.editProfileText}>Edit Profile</Text>
            </Pressable>
            {provider?.rating ? <StarRating rating={Number(provider.rating)} /> : null}
            <View style={styles.statusBadge}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: provider?.isActive !== false ? Colors.dark.primary : Colors.dark.textSecondary },
                ]}
              />
              <Text style={styles.statusText}>
                {provider?.isActive !== false ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(100).duration(300)}>
          <View style={styles.section}>
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel}>MY SPECIALIZATIONS</Text>
              <Pressable style={styles.editSpecsBtn} onPress={() => setShowEditSpecs(true)}>
                <Ionicons name="create-outline" size={13} color={Colors.dark.primary} />
                <Text style={styles.editSpecsBtnText}>Edit</Text>
              </Pressable>
            </View>
            {specs.length > 0 ? (
              <View style={styles.specializationsGrid}>
                {specs.map((specKey) => {
                  const spec = PROVIDER_SPECIALIZATIONS[specKey as ProviderSpecialization];
                  if (!spec) return null;
                  return (
                    <View key={specKey} style={[styles.specChip, { backgroundColor: spec.color + "15", borderColor: spec.color + "30" }]}>
                      <Ionicons name={spec.icon} size={13} color={spec.color} />
                      <Text style={[styles.specChipText, { color: spec.color }]}>{spec.label}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Pressable style={styles.addSpecsRow} onPress={() => setShowEditSpecs(true)}>
                <Ionicons name="add-circle-outline" size={16} color={Colors.dark.primary} />
                <Text style={styles.addSpecsText}>Add your specializations</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(140).duration(300)}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ACHIEVEMENTS</Text>
            <View style={styles.achievementsPlaceholder}>
              <Ionicons name="trophy-outline" size={24} color={Colors.dark.textSecondary} />
              <Text style={styles.achievementsPlaceholderText}>Badges & achievements coming soon</Text>
            </View>
          </View>
        </Animated.View>

        {provider?.bio ? (
          <Animated.View entering={FadeInUp.delay(170).duration(300)}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>BIO</Text>
              <View style={styles.bioCard}>
                <Text style={styles.bioText}>{provider.bio}</Text>
              </View>
            </View>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInUp.delay(200).duration(300)}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>STATS</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{provider?.totalBookings ?? 0}</Text>
                <Text style={styles.statLabel}>Total Bookings</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {provider?.rating ? Number(provider.rating).toFixed(1) : "—"}
                </Text>
                <Text style={styles.statLabel}>Avg Rating</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(240).duration(300)}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ACCOUNT</Text>
            <View style={styles.accountCard}>
              <View style={styles.accountRow}>
                <Ionicons name="person-outline" size={18} color={Colors.dark.textSecondary} />
                <Text style={styles.accountLabel}>Username</Text>
                <Text style={styles.accountValue}>{user?.username ?? "—"}</Text>
              </View>
              <View style={styles.accountDivider} />
              <View style={styles.accountRow}>
                <Ionicons name="mail-outline" size={18} color={Colors.dark.textSecondary} />
                <Text style={styles.accountLabel}>Email</Text>
                <Text style={styles.accountValue}>{user?.email ?? "—"}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(280).duration(300)}>
          <Pressable style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color={Colors.dark.error} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      <EditSpecializationsModal
        visible={showEditSpecs}
        current={specs}
        onClose={() => setShowEditSpecs(false)}
        onSave={handleSaveSpecs}
      />
    </View>
  );
}

const modalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  title: { fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  grid: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    paddingBottom: 120,
  },
  card: {
    width: "30%",
    backgroundColor: "#0F141B",
    borderRadius: 14,
    padding: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    gap: Spacing.xs,
    alignItems: "center",
    minHeight: 90,
    position: "relative",
  },
  checkBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  saveBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 15, fontWeight: "800", color: "#000" },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  headerTitle: { fontSize: 20, fontWeight: "700", color: Colors.dark.text },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg },
  profileCard: {
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 20,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
  },
  profilePhoto: { width: 88, height: 88, borderRadius: 44, marginBottom: Spacing.xs },
  profilePhotoPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  profileName: { fontSize: 22, fontWeight: "700", color: Colors.dark.text },
  editProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary + "15",
  },
  editProfileText: { fontSize: 13, fontWeight: "600", color: Colors.dark.primary },
  starRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 14, color: Colors.dark.textSecondary, marginLeft: 4 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, color: Colors.dark.textSecondary },
  section: { marginBottom: Spacing.lg },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  editSpecsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "10",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  editSpecsBtnText: { fontSize: 12, fontWeight: "600", color: Colors.dark.primary },
  specializationsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  specChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  specChipText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  addSpecsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
  },
  addSpecsText: { fontSize: 13, color: Colors.dark.primary, fontWeight: "600" },
  achievementsPlaceholder: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  achievementsPlaceholderText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
  },
  bioCard: { backgroundColor: Colors.dark.backgroundSecondary, borderRadius: 14, padding: Spacing.md },
  bioText: { fontSize: 14, color: Colors.dark.textSecondary, lineHeight: 20 },
  statsRow: { flexDirection: "row", gap: Spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
    alignItems: "center",
  },
  statValue: { fontSize: 28, fontWeight: "700", color: Colors.dark.text },
  statLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  accountCard: { backgroundColor: Colors.dark.backgroundSecondary, borderRadius: 14, overflow: "hidden" },
  accountRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md },
  accountLabel: { flex: 1, fontSize: 14, color: Colors.dark.textSecondary },
  accountValue: { fontSize: 14, fontWeight: "500", color: Colors.dark.text, maxWidth: 180 },
  accountDivider: { height: 1, backgroundColor: Colors.dark.border, marginHorizontal: Spacing.md },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.error + "15",
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.error + "30",
  },
  signOutText: { fontSize: 16, fontWeight: "600", color: Colors.dark.error },
});
