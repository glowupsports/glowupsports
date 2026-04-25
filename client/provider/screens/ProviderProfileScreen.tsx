import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Switch,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing } from "@/constants/theme";
import { getStaticAssetsUrl, buildPhotoUrl, apiRequest } from "@/lib/query-client";
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
  phone: string | null;
  profilePhotoUrl: string | null;
  specializations: string[];
  rating: string | null;
  totalBookings: number;
  isActive: boolean;
  isOnboarded: boolean;
}

interface ProviderStats {
  xp: number;
  level: number;
  rank: string;
  xpInLevel: number;
  xpToNextLevel: number;
  streakCurrent: number;
  streakBest: number;
  badges: string[];
  totalBookings: number;
  rating: number;
}

const CLIENT_BADGES: {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  color: string;
}[] = [
  { id: "first_job", label: "First Job", icon: "ribbon-outline", description: "Complete your very first booking", color: Colors.dark.primary },
  { id: "ten_bookings", label: "Getting Started", icon: "star-outline", description: "Complete 10 bookings", color: "#4A90E2" },
  { id: "century", label: "Century Club", icon: "trophy-outline", description: "Complete 100 bookings", color: "#FFD700" },
  { id: "five_star", label: "5-Star Pro", icon: "star-outline", description: "Achieve a 4.9+ average rating", color: "#FFD700" },
  { id: "streak_7", label: "On Fire", icon: "flame-outline", description: "Maintain a 7-day booking streak", color: "#FF8C00" },
  { id: "streak_30", label: "Unstoppable", icon: "flash-outline", description: "Maintain a 30-day booking streak", color: "#FF4500" },
  { id: "leveled_up", label: "Level Up", icon: "trending-up-outline", description: "Reach your next rank level", color: Colors.dark.primary },
];

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

function EditProfileModal({
  visible,
  initialName,
  initialBio,
  initialPhone,
  onClose,
  onSave,
}: {
  visible: boolean;
  initialName: string;
  initialBio: string;
  initialPhone: string;
  onClose: () => void;
  onSave: (name: string, bio: string, phone: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter your display name.");
      return;
    }
    setSaving(true);
    try {
      await onSave(name.trim(), bio.trim(), phone.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[editModalStyles.container, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={editModalStyles.header}>
          <Pressable onPress={onClose} style={editModalStyles.cancelBtn}>
            <Text style={editModalStyles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={editModalStyles.title}>Edit Profile</Text>
          <Pressable
            onPress={handleSave}
            style={[editModalStyles.saveBtn, saving && { opacity: 0.5 }]}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : (
              <Text style={editModalStyles.saveText}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={editModalStyles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={editModalStyles.field}>
            <Text style={editModalStyles.label}>Display Name</Text>
            <TextInput
              style={editModalStyles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your professional name"
              placeholderTextColor={Colors.dark.textSecondary}
              maxLength={60}
            />
          </View>

          <View style={editModalStyles.field}>
            <Text style={editModalStyles.label}>Phone</Text>
            <TextInput
              style={editModalStyles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+971 50 000 0000"
              placeholderTextColor={Colors.dark.textSecondary}
              keyboardType="phone-pad"
              maxLength={20}
            />
          </View>

          <View style={editModalStyles.field}>
            <Text style={editModalStyles.label}>Bio</Text>
            <TextInput
              style={[editModalStyles.input, editModalStyles.bioInput]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell clients about your background and expertise..."
              placeholderTextColor={Colors.dark.textSecondary}
              multiline
              numberOfLines={4}
              maxLength={300}
              textAlignVertical="top"
            />
            <Text style={editModalStyles.charCount}>{bio.length}/300</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
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

  useEffect(() => {
    if (visible) {
      setSelected(
        (current as ProviderSpecialization[]).filter((k) => k in PROVIDER_SPECIALIZATIONS)
      );
    }
  }, [visible, current]);

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
                    <Ionicons name="checkmark" size={10} color={Colors.dark.buttonText} />
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_WINDOWS = [
  { dayOfWeek: 1, startTime: "09:00", endTime: "18:00", isActive: true },
  { dayOfWeek: 2, startTime: "09:00", endTime: "18:00", isActive: true },
  { dayOfWeek: 3, startTime: "09:00", endTime: "18:00", isActive: true },
  { dayOfWeek: 4, startTime: "09:00", endTime: "18:00", isActive: true },
  { dayOfWeek: 5, startTime: "09:00", endTime: "18:00", isActive: true },
  { dayOfWeek: 6, startTime: "10:00", endTime: "14:00", isActive: false },
  { dayOfWeek: 0, startTime: "10:00", endTime: "14:00", isActive: false },
];

interface AvailabilityWindow {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

function AvailabilitySection() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [windows, setWindows] = useState<AvailabilityWindow[]>(DEFAULT_WINDOWS);

  const { data: savedWindows } = useQuery<AvailabilityWindow[]>({
    queryKey: ["/api/provider/availability"],
  });

  useEffect(() => {
    if (savedWindows && savedWindows.length > 0) {
      const merged = Array.from({ length: 7 }, (_, i) => {
        const saved = savedWindows.find((w) => w.dayOfWeek === i);
        return saved ?? { dayOfWeek: i, startTime: "09:00", endTime: "18:00", isActive: false };
      });
      setWindows(merged);
    }
  }, [savedWindows]);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiRequest("PUT", "/api/provider/availability", { windows });
      if (!res.ok) throw new Error("Failed");
      await queryClient.invalidateQueries({ queryKey: ["/api/provider/availability"] });
      setShowModal(false);
    } catch {
      Alert.alert("Error", "Could not save availability. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const activeCount = windows.filter((w) => w.isActive).length;

  const updateWindow = (idx: number, field: keyof AvailabilityWindow, value: unknown) => {
    setWindows((prev) => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w));
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>AVAILABILITY</Text>
        <Pressable style={styles.editSpecsBtn} onPress={() => setShowModal(true)}>
          <Ionicons name="create-outline" size={13} color={Colors.dark.primary} />
          <Text style={styles.editSpecsBtnText}>Edit</Text>
        </Pressable>
      </View>
      <Pressable
        style={availStyles.summaryCard}
        onPress={() => setShowModal(true)}
      >
        <Ionicons name="time-outline" size={18} color={Colors.dark.primary} />
        <View style={{ flex: 1 }}>
          <Text style={availStyles.summaryTitle}>
            {activeCount > 0 ? `${activeCount} day${activeCount !== 1 ? "s" : ""} active` : "No availability set"}
          </Text>
          <Text style={availStyles.summaryDays}>
            {windows.filter((w) => w.isActive).map((w) => DAY_NAMES[w.dayOfWeek]).join(", ") || "Tap to configure"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={Colors.dark.textSecondary} />
      </Pressable>

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <View style={[availStyles.modalContainer, { paddingTop: insets.top + Spacing.sm }]}>
          <View style={availStyles.modalHeader}>
            <Pressable onPress={() => setShowModal(false)}>
              <Text style={availStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={availStyles.modalTitle}>Working Hours</Text>
            <Pressable
              onPress={handleSave}
              style={[{ opacity: saving ? 0.5 : 1 }]}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Colors.dark.primary} />
              ) : (
                <Text style={availStyles.saveText}>Save</Text>
              )}
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={availStyles.modalBody}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {windows.sort((a, b) => (a.dayOfWeek === 0 ? 7 : a.dayOfWeek) - (b.dayOfWeek === 0 ? 7 : b.dayOfWeek)).map((w, idx) => {
              const realIdx = windows.findIndex((x) => x.dayOfWeek === w.dayOfWeek);
              return (
                <View key={w.dayOfWeek} style={availStyles.dayRow}>
                  <View style={availStyles.dayLeft}>
                    <Switch
                      value={w.isActive}
                      onValueChange={(v) => updateWindow(realIdx, "isActive", v)}
                      trackColor={{ false: Colors.dark.border, true: Colors.dark.primary + "80" }}
                      thumbColor={w.isActive ? Colors.dark.primary : Colors.dark.textSecondary}
                    />
                    <Text style={[availStyles.dayName, !w.isActive && availStyles.dayNameDisabled]}>
                      {DAY_NAMES[w.dayOfWeek]}
                    </Text>
                  </View>
                  {w.isActive ? (
                    <View style={availStyles.timeRow}>
                      <TextInput
                        style={availStyles.timeInput}
                        value={w.startTime}
                        onChangeText={(v) => updateWindow(realIdx, "startTime", v)}
                        placeholder="09:00"
                        placeholderTextColor={Colors.dark.textSecondary}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                      <Text style={availStyles.timeSep}>–</Text>
                      <TextInput
                        style={availStyles.timeInput}
                        value={w.endTime}
                        onChangeText={(v) => updateWindow(realIdx, "endTime", v)}
                        placeholder="18:00"
                        placeholderTextColor={Colors.dark.textSecondary}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                    </View>
                  ) : (
                    <Text style={availStyles.offLabel}>Off</Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

interface ShopService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  price: string;
  iconName: string | null;
  isActive: boolean;
}

function ServiceMenuSection() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<ShopService | null>(null);
  const [svcName, setSvcName] = useState("");
  const [svcDesc, setSvcDesc] = useState("");
  const [svcDuration, setSvcDuration] = useState("");
  const [svcPrice, setSvcPrice] = useState("");
  const [svcIcon, setSvcIcon] = useState("build-outline");
  const [saving, setSaving] = useState(false);

  const { data: services = [], isLoading } = useQuery<ShopService[]>({
    queryKey: ["/api/provider/services"],
  });

  const openCreate = () => {
    setEditingService(null);
    setSvcName("");
    setSvcDesc("");
    setSvcDuration("");
    setSvcPrice("");
    setSvcIcon("build-outline");
    setShowModal(true);
  };

  const openEdit = (svc: ShopService) => {
    setEditingService(svc);
    setSvcName(svc.name);
    setSvcDesc(svc.description ?? "");
    setSvcDuration(svc.durationMinutes ? String(svc.durationMinutes) : "");
    setSvcPrice(String(parseFloat(svc.price).toFixed(2)));
    setSvcIcon(svc.iconName ?? "build-outline");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!svcName.trim()) {
      Alert.alert("Name required", "Please enter a service name.");
      return;
    }
    const price = parseFloat(svcPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert("Invalid price", "Please enter a valid price.");
      return;
    }
    setSaving(true);
    try {
      if (editingService) {
        const res = await apiRequest("PATCH", `/api/provider/services/${editingService.id}`, {
          name: svcName.trim(),
          description: svcDesc.trim() || null,
          durationMinutes: svcDuration ? parseInt(svcDuration) : null,
          price,
          iconName: svcIcon,
        });
        if (!res.ok) throw new Error("Failed");
      } else {
        const res = await apiRequest("POST", "/api/provider/services", {
          name: svcName.trim(),
          description: svcDesc.trim() || null,
          durationMinutes: svcDuration ? parseInt(svcDuration) : null,
          price,
          iconName: svcIcon,
        });
        if (!res.ok) throw new Error("Failed");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      setShowModal(false);
    } catch {
      Alert.alert("Error", "Could not save service. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (svc: ShopService) => {
    Alert.alert("Remove Service", `Remove "${svc.name}" from your menu?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await apiRequest("DELETE", `/api/provider/services/${svc.id}`, {});
            queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
          } catch {
            Alert.alert("Error", "Could not remove service.");
          }
        },
      },
    ]);
  };

  const SERVICE_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
    "body-outline", "fitness-outline", "medkit-outline", "heart-outline",
    "ribbon-outline", "star-outline", "flash-outline", "barbell-outline",
    "bicycle-outline", "walk-outline", "build-outline", "settings-outline",
  ];

  return (
    <View style={[styles.section, { marginBottom: Spacing.lg }]}>
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>MY SERVICES</Text>
        <Pressable style={styles.editSpecsBtn} onPress={openCreate}>
          <Ionicons name="add" size={13} color={Colors.dark.primary} />
          <Text style={styles.editSpecsBtnText}>Add</Text>
        </Pressable>
      </View>
      {isLoading ? (
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: Spacing.sm }} />
      ) : services.length === 0 ? (
        <Pressable style={svcStyles.emptyCard} onPress={openCreate}>
          <Ionicons name="add-circle-outline" size={20} color={Colors.dark.primary} />
          <Text style={svcStyles.emptyText}>Add your first service to the shop</Text>
        </Pressable>
      ) : (
        <View style={svcStyles.serviceList}>
          {services.map((svc) => (
            <View key={svc.id} style={svcStyles.serviceCard}>
              <View style={svcStyles.serviceIconBox}>
                <Ionicons
                  name={(svc.iconName ?? "build-outline") as keyof typeof Ionicons.glyphMap}
                  size={18}
                  color={Colors.dark.primary}
                />
              </View>
              <View style={svcStyles.serviceInfo}>
                <Text style={svcStyles.serviceName} numberOfLines={1}>{svc.name}</Text>
                <View style={svcStyles.serviceMeta}>
                  <Text style={svcStyles.servicePrice}>AED {parseFloat(svc.price).toFixed(0)}</Text>
                  {svc.durationMinutes ? (
                    <Text style={svcStyles.serviceDuration}>{svc.durationMinutes} min</Text>
                  ) : null}
                </View>
              </View>
              <Pressable style={svcStyles.editBtn} onPress={() => openEdit(svc)}>
                <Ionicons name="pencil-outline" size={14} color={Colors.dark.primary} />
              </Pressable>
              <Pressable style={svcStyles.deleteBtn} onPress={() => handleDelete(svc)}>
                <Ionicons name="trash-outline" size={14} color={Colors.dark.error} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <View style={[svcStyles.modalContainer, { paddingTop: insets.top + Spacing.sm }]}>
          <View style={svcStyles.modalHeader}>
            <Pressable onPress={() => setShowModal(false)}>
              <Text style={svcStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={svcStyles.modalTitle}>{editingService ? "Edit Service" : "New Service"}</Text>
            <Pressable onPress={handleSave} disabled={saving} style={{ opacity: saving ? 0.5 : 1 }}>
              {saving ? (
                <ActivityIndicator size="small" color={Colors.dark.primary} />
              ) : (
                <Text style={svcStyles.saveText}>Save</Text>
              )}
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={svcStyles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={svcStyles.field}>
              <Text style={svcStyles.fieldLabel}>Service Name</Text>
              <TextInput
                style={svcStyles.input}
                value={svcName}
                onChangeText={setSvcName}
                placeholder="e.g. Deep Tissue Massage"
                placeholderTextColor={Colors.dark.textSecondary}
                maxLength={60}
              />
            </View>
            <View style={svcStyles.field}>
              <Text style={svcStyles.fieldLabel}>Description</Text>
              <TextInput
                style={[svcStyles.input, { height: 80, paddingTop: 12 }]}
                value={svcDesc}
                onChangeText={setSvcDesc}
                placeholder="What does this service include?"
                placeholderTextColor={Colors.dark.textSecondary}
                multiline
                numberOfLines={3}
                maxLength={200}
                textAlignVertical="top"
              />
            </View>
            <View style={svcStyles.fieldRow}>
              <View style={[svcStyles.field, { flex: 1 }]}>
                <Text style={svcStyles.fieldLabel}>Price (AED)</Text>
                <TextInput
                  style={svcStyles.input}
                  value={svcPrice}
                  onChangeText={setSvcPrice}
                  placeholder="0.00"
                  placeholderTextColor={Colors.dark.textSecondary}
                  keyboardType="decimal-pad"
                  maxLength={10}
                />
              </View>
              <View style={[svcStyles.field, { flex: 1 }]}>
                <Text style={svcStyles.fieldLabel}>Duration (min)</Text>
                <TextInput
                  style={svcStyles.input}
                  value={svcDuration}
                  onChangeText={setSvcDuration}
                  placeholder="60"
                  placeholderTextColor={Colors.dark.textSecondary}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
            </View>
            <View style={svcStyles.field}>
              <Text style={svcStyles.fieldLabel}>Icon</Text>
              <View style={svcStyles.iconGrid}>
                {SERVICE_ICONS.map((icon) => (
                  <Pressable
                    key={icon}
                    style={[
                      svcStyles.iconOption,
                      svcIcon === icon && svcStyles.iconOptionSelected,
                    ]}
                    onPress={() => setSvcIcon(icon)}
                  >
                    <Ionicons name={icon} size={20} color={svcIcon === icon ? Colors.dark.buttonText : Colors.dark.textSecondary} />
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

export default function ProviderProfileScreen() {
  const insets = useSafeAreaInsets();
  const { signOut, user } = useAuth();
  const queryClient = useQueryClient();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showEditSpecs, setShowEditSpecs] = useState(false);
  const [badgeTooltip, setBadgeTooltip] = useState<typeof CLIENT_BADGES[0] | null>(null);

  const { data: provider, isLoading } = useQuery<ProviderProfile>({
    queryKey: ["/api/provider/me"],
  });

  const { data: stats } = useQuery<ProviderStats>({
    queryKey: ["/api/provider/stats"],
  });

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  const handleSaveProfile = async (name: string, bio: string, phone: string) => {
    try {
      const res = await apiRequest("PATCH", "/api/provider/me", {
        displayName: name,
        bio: bio || null,
        phone: phone || null,
      });
      if (!res.ok) throw new Error("Failed");
      await queryClient.invalidateQueries({ queryKey: ["/api/provider/me"] });
      setShowEditProfile(false);
    } catch {
      Alert.alert("Error", "Could not save profile. Please try again.");
    }
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

  const photoUri = buildPhotoUrl(photoUrl) || null;

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
              onPress={() => setShowEditProfile(true)}
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
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel}>ACHIEVEMENTS</Text>
              {stats ? (
                <Text style={styles.badgeCountText}>{stats.badges.length}/{CLIENT_BADGES.length} unlocked</Text>
              ) : null}
            </View>
            <View style={styles.badgesGrid}>
              {CLIENT_BADGES.map((badge) => {
                const unlocked = stats?.badges.includes(badge.id) ?? false;
                return (
                  <Pressable
                    key={badge.id}
                    style={[
                      styles.badgeCard,
                      unlocked
                        ? { borderColor: badge.color + "40", backgroundColor: badge.color + "10" }
                        : { borderColor: Colors.dark.border, backgroundColor: Colors.dark.backgroundSecondary, opacity: 0.5 },
                    ]}
                    onPress={() => setBadgeTooltip(badge)}
                  >
                    <View style={[styles.badgeIconCircle, { backgroundColor: unlocked ? badge.color + "25" : Colors.dark.backgroundDefault }]}>
                      <Ionicons
                        name={unlocked ? badge.icon : "lock-closed-outline"}
                        size={20}
                        color={unlocked ? badge.color : Colors.dark.textSecondary}
                      />
                    </View>
                    <Text style={[styles.badgeLabel, { color: unlocked ? Colors.dark.text : Colors.dark.textSecondary }]} numberOfLines={2}>
                      {badge.label}
                    </Text>
                    {unlocked ? (
                      <View style={[styles.badgeUnlockedDot, { backgroundColor: badge.color }]} />
                    ) : null}
                  </Pressable>
                );
              })}
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
              {provider?.phone ? (
                <>
                  <View style={styles.accountDivider} />
                  <View style={styles.accountRow}>
                    <Ionicons name="call-outline" size={18} color={Colors.dark.textSecondary} />
                    <Text style={styles.accountLabel}>Phone</Text>
                    <Text style={styles.accountValue}>{provider.phone}</Text>
                  </View>
                </>
              ) : null}
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(260).duration(300)}>
          <AvailabilitySection />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(270).duration(300)}>
          <ServiceMenuSection />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(280).duration(300)}>
          <Pressable style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color={Colors.dark.error} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      <EditProfileModal
        visible={showEditProfile}
        initialName={displayName}
        initialBio={provider?.bio ?? ""}
        initialPhone={provider?.phone ?? ""}
        onClose={() => setShowEditProfile(false)}
        onSave={handleSaveProfile}
      />

      <EditSpecializationsModal
        visible={showEditSpecs}
        current={specs}
        onClose={() => setShowEditSpecs(false)}
        onSave={handleSaveSpecs}
      />

      <Modal
        visible={badgeTooltip !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setBadgeTooltip(null)}
      >
        <Pressable style={styles.tooltipOverlay} onPress={() => setBadgeTooltip(null)}>
          {badgeTooltip ? (
            <View style={styles.tooltipCard}>
              <View style={[styles.tooltipIconBox, { backgroundColor: badgeTooltip.color + "20" }]}>
                <Ionicons name={badgeTooltip.icon} size={32} color={badgeTooltip.color} />
              </View>
              <Text style={styles.tooltipTitle}>{badgeTooltip.label}</Text>
              <Text style={styles.tooltipDesc}>{badgeTooltip.description}</Text>
              {stats?.badges.includes(badgeTooltip.id) ? (
                <View style={[styles.tooltipUnlockedPill, { backgroundColor: badgeTooltip.color + "20" }]}>
                  <Ionicons name="checkmark-circle" size={14} color={badgeTooltip.color} />
                  <Text style={[styles.tooltipUnlockedText, { color: badgeTooltip.color }]}>Unlocked</Text>
                </View>
              ) : (
                <View style={styles.tooltipLockedPill}>
                  <Ionicons name="lock-closed-outline" size={14} color={Colors.dark.textSecondary} />
                  <Text style={styles.tooltipLockedText}>Locked</Text>
                </View>
              )}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const editModalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  cancelBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  cancelText: { fontSize: 16, color: Colors.dark.textSecondary },
  saveBtn: { paddingVertical: 4, paddingHorizontal: 4, minWidth: 44, alignItems: "flex-end" },
  saveText: { fontSize: 16, fontWeight: "700", color: Colors.dark.primary },
  body: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 120,
  },
  field: { marginBottom: Spacing.lg },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  bioInput: {
    height: 110,
    paddingTop: 14,
  },
  charCount: {
    textAlign: "right",
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 4,
  },
});

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
  saveBtnText: { fontSize: 15, fontWeight: "800", color: Colors.dark.buttonText },
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
  badgeCountText: { fontSize: 11, color: Colors.dark.textSecondary, marginBottom: Spacing.sm },
  badgesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  badgeCard: {
    width: "30%",
    borderRadius: 14,
    padding: Spacing.sm,
    borderWidth: 1.5,
    alignItems: "center",
    gap: 6,
    minHeight: 90,
    position: "relative",
  },
  badgeIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  badgeUnlockedDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tooltipOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  tooltipCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 20,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  tooltipIconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  tooltipTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, textAlign: "center" },
  tooltipDesc: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 20 },
  tooltipUnlockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: Spacing.xs,
  },
  tooltipUnlockedText: { fontSize: 13, fontWeight: "700" },
  tooltipLockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundDefault,
    marginTop: Spacing.xs,
  },
  tooltipLockedText: { fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "600" },
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

const availStyles = StyleSheet.create({
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  summaryDays: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  cancelText: { fontSize: 16, color: Colors.dark.textSecondary },
  saveText: { fontSize: 16, fontWeight: "700", color: Colors.dark.primary },
  modalBody: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 120,
    gap: Spacing.sm,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  dayLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    width: 90,
  },
  dayName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  dayNameDisabled: {
    color: Colors.dark.textSecondary,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  timeInput: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.dark.text,
    width: 64,
    textAlign: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  timeSep: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
    fontWeight: "600",
  },
  offLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
});

const svcStyles = StyleSheet.create({
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  serviceList: {
    gap: Spacing.sm,
  },
  serviceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
  },
  serviceIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceInfo: {
    flex: 1,
    gap: 3,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  serviceMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  servicePrice: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  serviceDuration: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  editBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary + "15",
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.dark.error + "15",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  cancelText: { fontSize: 16, color: Colors.dark.textSecondary },
  saveText: { fontSize: 16, fontWeight: "700", color: Colors.dark.primary },
  modalBody: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 120,
    gap: Spacing.lg,
  },
  field: {
    gap: Spacing.sm,
  },
  fieldRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  iconOption: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  iconOptionSelected: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
});
