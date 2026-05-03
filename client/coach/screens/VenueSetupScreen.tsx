import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
} from "react-native";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, Backgrounds } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import type { CoachStackParamList } from "@/coach/navigation/CoachNavigator";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const AMENITIES: ReadonlyArray<{ key: string; label: string; icon: IoniconName }> = [
  { key: "lights", label: "Court Lights", icon: "flashlight-outline" },
  { key: "parking", label: "Parking", icon: "car-outline" },
  { key: "changing_rooms", label: "Changing Rooms", icon: "shirt-outline" },
  { key: "pro_shop", label: "Pro Shop", icon: "storefront-outline" },
  { key: "cafe", label: "Cafe", icon: "cafe-outline" },
  { key: "indoor_courts", label: "Indoor Courts", icon: "home-outline" },
  { key: "outdoor_courts", label: "Outdoor Courts", icon: "sunny-outline" },
  { key: "gym", label: "Fitness Center", icon: "barbell-outline" },
  { key: "showers", label: "Showers", icon: "water-outline" },
  { key: "wifi", label: "Wi-Fi", icon: "wifi-outline" },
  { key: "ball_machine", label: "Ball Machine", icon: "radio-button-on-outline" },
  { key: "spectator_area", label: "Spectator Area", icon: "people-outline" },
];

const SURFACES: ReadonlyArray<{ key: string; label: string; color: string }> = [
  { key: "hard", label: "Hard", color: "#2196F3" },
  { key: "clay", label: "Clay", color: "#FF7043" },
  { key: "grass", label: "Grass", color: "#4CAF50" },
  { key: "artificial", label: "Artificial", color: "#00BCD4" },
];

type DayHours = { open: string; close: string; closed: boolean };
type OpeningHours = Record<string, DayHours>;

interface AcademyProfile {
  facilities: string[] | null;
  openingHours: OpeningHours | null;
}

interface AcademySettingsBasic {
  academyId: string;
}

interface Court {
  id: string;
  name: string;
  surface: string;
  indoor: boolean;
  isActive: boolean;
}

interface CourtFormState {
  visible: boolean;
  courtId: string | null;
  name: string;
  surface: string;
  indoor: boolean;
}

const DEFAULT_DAY: DayHours = { open: "08:00", close: "22:00", closed: false };
const DEFAULT_COURT_FORM: CourtFormState = {
  visible: false,
  courtId: null,
  name: "",
  surface: "hard",
  indoor: false,
};

function buildDefaultHours(): OpeningHours {
  const hours: OpeningHours = {};
  for (const day of DAYS) {
    hours[day.key] = { ...DEFAULT_DAY };
  }
  return hours;
}

function TimeInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      style={styles.timeInput}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={Colors.dark.textMuted}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
    />
  );
}

export default function VenueSetupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<CoachStackParamList>>();
  const queryClient = useQueryClient();

  const [amenities, setAmenities] = useState<string[]>([]);
  const [openingHours, setOpeningHours] = useState<OpeningHours>(buildDefaultHours());
  const [hasChanges, setHasChanges] = useState(false);
  const [courtForm, setCourtForm] = useState<CourtFormState>(DEFAULT_COURT_FORM);

  const { data: profileData, isLoading: profileLoading } = useQuery<{ academy: AcademyProfile }>({
    queryKey: ["/api/academy/venue-profile"],
  });

  const { data: courtsData, isLoading: courtsLoading } = useQuery<Court[]>({
    queryKey: ["/api/courts"],
  });

  const { data: settingsData } = useQuery<AcademySettingsBasic>({
    queryKey: ["/api/academy/settings"],
  });

  const courts = courtsData?.filter(c => c.isActive) ?? [];

  useEffect(() => {
    if (profileData?.academy) {
      const a = profileData.academy;
      setAmenities(a.facilities ?? []);
      if (a.openingHours) {
        const merged = buildDefaultHours();
        for (const day of DAYS) {
          if (a.openingHours[day.key]) {
            merged[day.key] = {
              open: a.openingHours[day.key]?.open ?? "08:00",
              close: a.openingHours[day.key]?.close ?? "22:00",
              closed: a.openingHours[day.key]?.closed ?? false,
            };
          }
        }
        setOpeningHours(merged);
      }
      setHasChanges(false);
    }
  }, [profileData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", "/api/academy/venue-profile", {
        facilities: amenities,
        openingHours,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/academy/venue-profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHasChanges(false);
      Alert.alert("Saved", "Venue info updated successfully.");
    },
    onError: () => {
      Alert.alert("Error", "Failed to save venue info. Please try again.");
    },
  });

  const addCourtMutation = useMutation({
    mutationFn: async (data: { name: string; surface: string; indoor: boolean }) => {
      return apiRequest("POST", "/api/courts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCourtForm(DEFAULT_COURT_FORM);
    },
    onError: () => {
      Alert.alert("Error", "Failed to add court. Please try again.");
    },
  });

  const editCourtMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; surface: string; indoor: boolean }) => {
      return apiRequest("PATCH", `/api/courts/${data.id}`, {
        name: data.name,
        surface: data.surface,
        indoor: data.indoor,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCourtForm(DEFAULT_COURT_FORM);
    },
    onError: () => {
      Alert.alert("Error", "Failed to update court. Please try again.");
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
    onError: () => {
      Alert.alert("Error", "Failed to remove court. Please try again.");
    },
  });

  const toggleAmenity = (key: string) => {
    setAmenities(prev =>
      prev.includes(key) ? prev.filter(a => a !== key) : [...prev, key]
    );
    setHasChanges(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const updateDay = (dayKey: string, field: keyof DayHours, value: string | boolean) => {
    setOpeningHours(prev => ({
      ...prev,
      [dayKey]: { ...prev[dayKey]!, [field]: value },
    }));
    setHasChanges(true);
  };

  const toggleDayClosed = (dayKey: string) => {
    const current = openingHours[dayKey]?.closed ?? false;
    updateDay(dayKey, "closed", !current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openAddCourt = () => {
    setCourtForm({ visible: true, courtId: null, name: "", surface: "hard", indoor: false });
  };

  const openEditCourt = (court: Court) => {
    setCourtForm({
      visible: true,
      courtId: court.id,
      name: court.name,
      surface: court.surface,
      indoor: court.indoor,
    });
  };

  const cancelCourtForm = () => setCourtForm(DEFAULT_COURT_FORM);

  const submitCourtForm = () => {
    const trimmed = courtForm.name.trim();
    if (!trimmed) {
      Alert.alert("Validation", "Court name is required.");
      return;
    }
    if (courtForm.courtId) {
      editCourtMutation.mutate({
        id: courtForm.courtId,
        name: trimmed,
        surface: courtForm.surface,
        indoor: courtForm.indoor,
      });
    } else {
      addCourtMutation.mutate({ name: trimmed, surface: courtForm.surface, indoor: courtForm.indoor });
    }
  };

  const confirmDeleteCourt = (court: Court) => {
    Alert.alert(
      "Remove Court",
      `Remove "${court.name}" from your venue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => deleteCourtMutation.mutate(court.id),
        },
      ]
    );
  };

  const isLoading = profileLoading || courtsLoading;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>My Venue</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading venue info...</Text>
        </View>
      </View>
    );
  }

  const courtFormPending = addCourtMutation.isPending || editCourtMutation.isPending;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Venue</Text>
        <View style={styles.headerActions}>
          {settingsData?.academyId ? (
            <Pressable
              onPress={() => navigation.navigate("AcademyPublicPreview", { academyId: settingsData.academyId })}
              style={styles.previewHeaderBtn}
            >
              <Ionicons name="eye-outline" size={16} color={Colors.dark.xpCyan} />
              <Text style={styles.previewHeaderBtnText}>Preview Profile</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
            style={[styles.saveHeaderBtn, (!hasChanges || saveMutation.isPending) && styles.saveHeaderBtnDisabled]}
          >
            <Text style={styles.saveHeaderBtnText}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Courts */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Courts</Text>
            <Pressable style={styles.addBtn} onPress={openAddCourt}>
              <Ionicons name="add" size={18} color={Colors.dark.primary} />
              <Text style={styles.addBtnText}>Add Court</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionSubtitle}>
            Add your courts with their surface type and whether they are indoor or outdoor. These appear on your public profile.
          </Text>

          {courtForm.visible ? (
            <View style={styles.courtFormCard}>
              <Text style={styles.courtFormTitle}>
                {courtForm.courtId ? "Edit Court" : "Add Court"}
              </Text>
              <Text style={styles.fieldLabel}>Court Name</Text>
              <TextInput
                style={styles.courtNameInput}
                value={courtForm.name}
                onChangeText={v => setCourtForm(f => ({ ...f, name: v }))}
                placeholder="e.g. Court 1"
                placeholderTextColor={Colors.dark.textMuted}
              />
              <Text style={styles.fieldLabel}>Surface</Text>
              <View style={styles.surfaceRow}>
                {SURFACES.map(s => {
                  const selected = courtForm.surface === s.key;
                  return (
                    <Pressable
                      key={s.key}
                      style={[styles.surfaceChip, selected && { backgroundColor: `${s.color}25`, borderColor: s.color }]}
                      onPress={() => setCourtForm(f => ({ ...f, surface: s.key }))}
                    >
                      <View style={[styles.surfaceDot, { backgroundColor: s.color }]} />
                      <Text style={[styles.surfaceChipText, selected && { color: s.color, fontWeight: "700" }]}>
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>Location</Text>
              <View style={styles.indoorRow}>
                <Pressable
                  style={[styles.indoorChip, !courtForm.indoor && styles.indoorChipSelected]}
                  onPress={() => setCourtForm(f => ({ ...f, indoor: false }))}
                >
                  <Ionicons name="sunny-outline" size={16} color={!courtForm.indoor ? Colors.dark.primary : Colors.dark.textMuted} />
                  <Text style={[styles.indoorChipText, !courtForm.indoor && styles.indoorChipTextSelected]}>
                    Outdoor
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.indoorChip, courtForm.indoor && styles.indoorChipSelected]}
                  onPress={() => setCourtForm(f => ({ ...f, indoor: true }))}
                >
                  <Ionicons name="home-outline" size={16} color={courtForm.indoor ? Colors.dark.primary : Colors.dark.textMuted} />
                  <Text style={[styles.indoorChipText, courtForm.indoor && styles.indoorChipTextSelected]}>
                    Indoor
                  </Text>
                </Pressable>
              </View>
              <View style={styles.courtFormActions}>
                <Pressable style={styles.cancelBtn} onPress={cancelCourtForm}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.confirmBtn, courtFormPending && styles.confirmBtnDisabled]}
                  onPress={submitCourtForm}
                  disabled={courtFormPending}
                >
                  <Text style={styles.confirmBtnText}>
                    {courtFormPending ? "Saving..." : courtForm.courtId ? "Update" : "Add Court"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {courts.length === 0 ? (
            <View style={styles.emptyCourts}>
              <Ionicons name="tennisball-outline" size={32} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No courts added yet</Text>
              <Text style={styles.emptySubtext}>Tap Add Court to get started</Text>
            </View>
          ) : (
            courts.map(court => {
              const surf = SURFACES.find(s => s.key === court.surface);
              const surfColor = surf?.color ?? Colors.dark.textMuted;
              return (
                <View key={court.id} style={styles.courtRow}>
                  <View style={[styles.surfaceIndicator, { backgroundColor: surfColor }]} />
                  <View style={styles.courtInfo}>
                    <Text style={styles.courtName}>{court.name}</Text>
                    <View style={styles.courtBadgeRow}>
                      <View style={[styles.courtBadge, { backgroundColor: `${surfColor}20` }]}>
                        <Text style={[styles.courtBadgeText, { color: surfColor }]}>
                          {surf?.label ?? court.surface}
                        </Text>
                      </View>
                      <View style={styles.courtBadge}>
                        <Ionicons
                          name={court.indoor ? "home-outline" : "sunny-outline"}
                          size={12}
                          color={Colors.dark.textSecondary}
                        />
                        <Text style={styles.courtBadgeText}>
                          {court.indoor ? "Indoor" : "Outdoor"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Pressable style={styles.courtAction} onPress={() => openEditCourt(court)}>
                    <Ionicons name="pencil-outline" size={18} color={Colors.dark.textSecondary} />
                  </Pressable>
                  <Pressable
                    style={styles.courtAction}
                    onPress={() => confirmDeleteCourt(court)}
                    disabled={deleteCourtMutation.isPending}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        {/* Amenities */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Amenities</Text>
          <Text style={styles.sectionSubtitle}>
            Select the facilities available at your venue. These appear on your public academy page.
          </Text>
          <View style={styles.amenityGrid}>
            {AMENITIES.map(amenity => {
              const selected = amenities.includes(amenity.key);
              return (
                <Pressable
                  key={amenity.key}
                  style={[styles.amenityCard, selected && styles.amenityCardSelected]}
                  onPress={() => toggleAmenity(amenity.key)}
                >
                  <Ionicons
                    name={amenity.icon}
                    size={22}
                    color={selected ? Colors.dark.primary : Colors.dark.textMuted}
                  />
                  <Text style={[styles.amenityLabel, selected && styles.amenityLabelSelected]}>
                    {amenity.label}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={16} color={Colors.dark.primary} style={styles.amenityCheck} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Opening Hours */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Opening Hours</Text>
          <Text style={styles.sectionSubtitle}>
            Set the daily opening and closing times for your academy.
          </Text>
          {DAYS.map(day => {
            const dayData = openingHours[day.key] ?? DEFAULT_DAY;
            return (
              <View key={day.key} style={styles.dayRow}>
                <View style={styles.dayLabelRow}>
                  <Text style={styles.dayLabel}>{day.label}</Text>
                  <Pressable
                    onPress={() => toggleDayClosed(day.key)}
                    style={[styles.closedToggle, dayData.closed && styles.closedToggleActive]}
                  >
                    <Text style={[styles.closedToggleText, dayData.closed && styles.closedToggleTextActive]}>
                      {dayData.closed ? "Closed" : "Open"}
                    </Text>
                  </Pressable>
                </View>
                {!dayData.closed ? (
                  <View style={styles.timeRow}>
                    <View style={styles.timeField}>
                      <Text style={styles.timeLabel}>Open</Text>
                      <TimeInput
                        value={dayData.open}
                        onChange={v => updateDay(day.key, "open", v)}
                        placeholder="08:00"
                      />
                    </View>
                    <View style={styles.timeDash}>
                      <Ionicons name="remove-outline" size={16} color={Colors.dark.textMuted} />
                    </View>
                    <View style={styles.timeField}>
                      <Text style={styles.timeLabel}>Close</Text>
                      <TimeInput
                        value={dayData.close}
                        onChange={v => updateDay(day.key, "close", v)}
                        placeholder="22:00"
                      />
                    </View>
                  </View>
                ) : (
                  <Text style={styles.closedText}>Closed this day</Text>
                )}
              </View>
            );
          })}
        </View>

        {hasChanges ? (
          <Pressable
            style={[styles.saveBigBtn, saveMutation.isPending && styles.saveBigBtnDisabled]}
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Ionicons name="checkmark" size={20} color="#000" />
            <Text style={styles.saveBigBtnText}>
              {saveMutation.isPending ? "Saving..." : "Save Venue Info"}
            </Text>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
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
  backBtn: { padding: Spacing.xs },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  previewHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan,
  },
  previewHeaderBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  saveHeaderBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
  },
  saveHeaderBtnDisabled: {
    backgroundColor: Colors.dark.backgroundElevated,
  },
  saveHeaderBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  section: {
    gap: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    lineHeight: 18,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: `${Colors.dark.primary}15`,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}40`,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  courtFormCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    gap: Spacing.sm,
  },
  courtFormTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  courtNameInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    fontSize: 15,
  },
  surfaceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  surfaceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  surfaceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  surfaceChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  indoorRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  indoorChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  indoorChipSelected: {
    backgroundColor: `${Colors.dark.primary}15`,
    borderColor: Colors.dark.primary,
  },
  indoorChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  indoorChipTextSelected: {
    color: Colors.dark.primary,
  },
  courtFormActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
  },
  emptyCourts: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.xs,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  courtRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  surfaceIndicator: {
    width: 4,
    alignSelf: "stretch",
  },
  courtInfo: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: 4,
  },
  courtName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  courtBadgeRow: {
    flexDirection: "row",
    gap: 6,
  },
  courtBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.dark.backgroundElevated,
    borderRadius: BorderRadius.sm,
  },
  courtBadgeText: {
    fontSize: 11,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  courtAction: {
    padding: Spacing.sm,
  },
  amenityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  amenityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    position: "relative",
  },
  amenityCardSelected: {
    backgroundColor: `${Colors.dark.primary}15`,
    borderColor: Colors.dark.primary,
  },
  amenityLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  amenityLabelSelected: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  amenityCheck: {
    marginLeft: 2,
  },
  dayRow: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  dayLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  closedToggle: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    backgroundColor: Colors.dark.backgroundElevated,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  closedToggleActive: {
    backgroundColor: Colors.dark.backgroundElevated,
    borderColor: Colors.dark.error,
  },
  closedToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  closedToggleTextActive: {
    color: Colors.dark.error,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  timeField: {
    flex: 1,
    gap: 4,
  },
  timeLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  timeInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  timeDash: {
    paddingTop: 18,
  },
  closedText: {
    ...Typography.caption,
    color: Colors.dark.error,
    fontStyle: "italic",
  },
  saveBigBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
  },
  saveBigBtnDisabled: {
    opacity: 0.6,
  },
  saveBigBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
});
