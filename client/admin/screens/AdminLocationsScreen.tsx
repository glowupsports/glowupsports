import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Backgrounds, Spacing, BorderRadius, CardStyles, Typography, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

interface Location {
  id: string;
  academyId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  isActive: boolean;
  createdAt: string;
  courtCount?: number;
  sessionCount?: number;
}

export default function AdminLocationsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [manualCoords, setManualCoords] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    lat: "",
    lng: "",
    isActive: true,
  });

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ["/api/admin/locations"],
  });

  const invalidateLocations = () => {
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && (key.startsWith('/api/admin/locations') || key === '/api/locations');
    }});
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/locations", data),
    onSuccess: () => {
      invalidateLocations();
      setShowAddModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to create location");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PUT", `/api/admin/locations/${id}`, data),
    onSuccess: () => {
      invalidateLocations();
      setShowEditModal(false);
      setSelectedLocation(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to update location");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/locations/${id}`),
    onSuccess: () => {
      invalidateLocations();
      setShowEditModal(false);
      setSelectedLocation(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to delete location. Make sure there are no courts at this location.");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      address: "",
      lat: "",
      lng: "",
      isActive: true,
    });
    setManualCoords(false);
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      Alert.alert("Error", "Location name is required");
      return;
    }
    const latNum = formData.lat.trim() ? parseFloat(formData.lat.trim()) : null;
    const lngNum = formData.lng.trim() ? parseFloat(formData.lng.trim()) : null;
    if (formData.lat.trim() && isNaN(latNum!)) {
      Alert.alert("Error", "Latitude must be a valid number");
      return;
    }
    if (formData.lng.trim() && isNaN(lngNum!)) {
      Alert.alert("Error", "Longitude must be a valid number");
      return;
    }
    createMutation.mutate({
      name: formData.name.trim(),
      address: formData.address.trim() || null,
      lat: latNum,
      lng: lngNum,
      isActive: formData.isActive,
    });
  };

  const handleUpdate = () => {
    if (!selectedLocation || !formData.name.trim()) {
      Alert.alert("Error", "Location name is required");
      return;
    }
    const latNum = formData.lat.trim() ? parseFloat(formData.lat.trim()) : null;
    const lngNum = formData.lng.trim() ? parseFloat(formData.lng.trim()) : null;
    if (formData.lat.trim() && isNaN(latNum!)) {
      Alert.alert("Error", "Latitude must be a valid number");
      return;
    }
    if (formData.lng.trim() && isNaN(lngNum!)) {
      Alert.alert("Error", "Longitude must be a valid number");
      return;
    }
    updateMutation.mutate({
      id: selectedLocation.id,
      data: {
        name: formData.name.trim(),
        address: formData.address.trim() || null,
        lat: latNum,
        lng: lngNum,
        isActive: formData.isActive,
      },
    });
  };

  const handleDelete = (location: Location) => {
    if (location.courtCount && location.courtCount > 0) {
      Alert.alert("Cannot Delete", "Remove all courts from this location first before deleting it.");
      return;
    }

    if (Platform.OS === "web") {
      if (window.confirm(`Delete location "${location.name}"? This action cannot be undone.`)) {
        deleteMutation.mutate(location.id);
      }
    } else {
      Alert.alert(
        "Delete Location",
        `Delete location "${location.name}"? This action cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(location.id) },
        ]
      );
    }
  };

  const openEditModal = (location: Location) => {
    setSelectedLocation(location);
    setFormData({
      name: location.name,
      address: location.address || "",
      lat: location.lat != null ? String(location.lat) : "",
      lng: location.lng != null ? String(location.lng) : "",
      isActive: location.isActive,
    });
    setManualCoords(false);
    setShowEditModal(true);
  };

  const activeLocations = locations.filter(l => l.isActive);
  const inactiveLocations = locations.filter(l => !l.isActive);

  const renderAddressSection = () => (
    <>
      <View style={[styles.formGroup, { zIndex: 10 }]}>
        <Text style={styles.label}>Address Search</Text>
        <AddressAutocomplete
          placeholder="Type an address to search..."
          initialValue={formData.address}
          onSelect={({ address, lat, lng }) => {
            setFormData(prev => ({
              ...prev,
              address,
              lat: String(lat),
              lng: String(lng),
            }));
            setManualCoords(false);
          }}
        />
      </View>

      {formData.address ? (
        <View style={styles.coordPreview}>
          <Ionicons name="location" size={14} color={Colors.dark.primary} />
          <Text style={styles.coordPreviewText} numberOfLines={2}>{formData.address}</Text>
          {formData.lat && formData.lng ? (
            <Text style={styles.coordPreviewCoords}>
              {parseFloat(formData.lat).toFixed(5)}, {parseFloat(formData.lng).toFixed(5)}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Pressable
        style={styles.manualToggle}
        onPress={() => setManualCoords(v => !v)}
      >
        <Ionicons
          name={manualCoords ? "chevron-up" : "chevron-down"}
          size={14}
          color={Colors.dark.textMuted}
        />
        <Text style={styles.manualToggleText}>
          {manualCoords ? "Hide manual coordinates" : "Enter coordinates manually"}
        </Text>
      </Pressable>

      {manualCoords ? (
        <>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.address}
              onChangeText={(text) => setFormData({ ...formData, address: text })}
              placeholder="Full address (optional)"
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={2}
            />
          </View>
          <View style={styles.coordRow}>
            <View style={[styles.formGroup, styles.coordField]}>
              <Text style={styles.label}>Latitude</Text>
              <TextInput
                style={styles.input}
                value={formData.lat}
                onChangeText={(text) => setFormData({ ...formData, lat: text })}
                placeholder="e.g. 25.2048"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={[styles.formGroup, styles.coordField]}>
              <Text style={styles.label}>Longitude</Text>
              <TextInput
                style={styles.input}
                value={formData.lng}
                onChangeText={(text) => setFormData({ ...formData, lng: text })}
                placeholder="e.g. 55.2708"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </>
      ) : null}
    </>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Locations</Text>
            <Text style={styles.subtitle}>{locations.length} location{locations.length !== 1 ? "s" : ""}</Text>
          </View>
          <Pressable
            style={styles.addButton}
            onPress={() => {
              resetForm();
              setShowAddModal(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Ionicons name="add" size={24} color={Colors.dark.buttonText} />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.gold} />
          </View>
        ) : locations.length === 0 ? (
          <View style={[styles.emptyContainer, CardStyles.elevated]}>
            <Ionicons name="location-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No locations yet</Text>
            <Text style={styles.emptySubtext}>Add your first training location</Text>
          </View>
        ) : (
          <>
            {activeLocations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active</Text>
                {activeLocations.map((location) => (
                  <Pressable
                    key={location.id}
                    style={[styles.locationCard, CardStyles.elevated]}
                    onPress={() => openEditModal(location)}
                  >
                    <View style={styles.locationIcon}>
                      <Ionicons name="location" size={24} color={Colors.dark.primary} />
                    </View>
                    <View style={styles.locationInfo}>
                      <Text style={styles.locationName}>{location.name}</Text>
                      {location.address ? (
                        <Text style={styles.locationAddress}>{location.address}</Text>
                      ) : null}
                      <View style={styles.statsRow}>
                        <Text style={styles.courtCount}>
                          {location.courtCount || 0} court{(location.courtCount || 0) !== 1 ? "s" : ""}
                        </Text>
                        {(location.sessionCount || 0) > 0 ? (
                          <Text style={styles.sessionCount}>
                            {location.sessionCount} session{location.sessionCount !== 1 ? "s" : ""}
                          </Text>
                        ) : null}
                        {location.lat && location.lng ? (
                          <View style={styles.coordBadge}>
                            <Ionicons name="navigate" size={10} color={Colors.dark.primary} />
                            <Text style={styles.coordBadgeText}>GPS</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}

            {inactiveLocations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Inactive</Text>
                {inactiveLocations.map((location) => (
                  <Pressable
                    key={location.id}
                    style={[styles.locationCard, CardStyles.elevated, styles.inactiveCard]}
                    onPress={() => openEditModal(location)}
                  >
                    <View style={[styles.locationIcon, styles.inactiveIcon]}>
                      <Ionicons name="location-outline" size={24} color={Colors.dark.textMuted} />
                    </View>
                    <View style={styles.locationInfo}>
                      <Text style={[styles.locationName, styles.inactiveText]}>{location.name}</Text>
                      {location.address ? (
                        <Text style={[styles.locationAddress, styles.inactiveText]}>{location.address}</Text>
                      ) : null}
                      <View style={styles.statsRow}>
                        <Text style={[styles.courtCount, styles.inactiveText]}>
                          {location.courtCount || 0} court{(location.courtCount || 0) !== 1 ? "s" : ""}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, CardStyles.elevated]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Location</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <KeyboardAwareScrollViewCompat>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Location Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder="e.g. Main Academy, Downtown Club"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>

              {renderAddressSection()}

              <Pressable
                style={styles.toggleRow}
                onPress={() => setFormData({ ...formData, isActive: !formData.isActive })}
              >
                <Text style={styles.toggleLabel}>Active</Text>
                <View style={[styles.toggle, formData.isActive && styles.toggleActive]}>
                  <View style={[styles.toggleKnob, formData.isActive && styles.toggleKnobActive]} />
                </View>
              </Pressable>

              <Pressable
                style={[styles.submitButton, createMutation.isPending && styles.submitButtonDisabled]}
                onPress={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.buttonText} />
                ) : (
                  <Text style={styles.submitButtonText}>Add Location</Text>
                )}
              </Pressable>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, CardStyles.elevated]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Location</Text>
              <Pressable onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <KeyboardAwareScrollViewCompat>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Location Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder="Location name"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>

              {renderAddressSection()}

              <Pressable
                style={styles.toggleRow}
                onPress={() => setFormData({ ...formData, isActive: !formData.isActive })}
              >
                <Text style={styles.toggleLabel}>Active</Text>
                <View style={[styles.toggle, formData.isActive && styles.toggleActive]}>
                  <View style={[styles.toggleKnob, formData.isActive && styles.toggleKnobActive]} />
                </View>
              </Pressable>

              <View style={styles.buttonRow}>
                <Pressable
                  style={[styles.submitButton, styles.flexButton, updateMutation.isPending && styles.submitButtonDisabled]}
                  onPress={handleUpdate}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator color={Colors.dark.buttonText} />
                  ) : (
                    <Text style={styles.submitButtonText}>Save Changes</Text>
                  )}
                </Pressable>
              </View>

              <Pressable
                style={styles.deleteButton}
                onPress={() => selectedLocation && handleDelete(selectedLocation)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.error} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                    <Text style={styles.deleteButtonText}>Delete Location</Text>
                  </>
                )}
              </Pressable>
            </KeyboardAwareScrollViewCompat>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: Typography.h1.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    padding: Spacing["2xl"],
    alignItems: "center",
  },
  emptyContainer: {
    padding: Spacing["2xl"],
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  emptyText: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  inactiveCard: {
    opacity: 0.7,
  },
  locationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${Colors.dark.primary}20`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  inactiveIcon: {
    backgroundColor: `${Colors.dark.textMuted}20`,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  locationAddress: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 4,
    flexWrap: "wrap",
  },
  courtCount: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.primary,
  },
  sessionCount: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  coordBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: `${Colors.dark.primary}20`,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  coordBadgeText: {
    fontSize: 10,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  inactiveText: {
    color: Colors.dark.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: "90%",
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
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  coordPreview: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
    backgroundColor: `${Colors.dark.primary}12`,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  coordPreviewText: {
    flex: 1,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.text,
  },
  coordPreviewCoords: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  manualToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  manualToggleText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    textDecorationLine: "underline",
  },
  coordRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  coordField: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  toggleLabel: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.border,
    justifyContent: "center",
    padding: 2,
  },
  toggleActive: {
    backgroundColor: Colors.dark.primary,
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.text,
  },
  toggleKnobActive: {
    alignSelf: "flex-end",
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  flexButton: {
    flex: 1,
  },
  submitButton: {
    backgroundColor: GlowColors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  deleteButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.error,
  },
});
