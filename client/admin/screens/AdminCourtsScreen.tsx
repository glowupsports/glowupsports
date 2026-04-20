import React, { useState, useRef, useEffect } from "react";
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
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Colors, Backgrounds, Spacing, BorderRadius, CardStyles, Typography, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { SportBadge, SportSingleSelector } from "@/components/SportBadge";
import { SPORTS, type SportOrMulti } from "@shared/sportConfig";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { MapLocationPickerModal, type MapLocationResult } from "@/components/MapLocationPickerModal";

interface Court {
  id: string;
  academyId: string;
  locationId: string | null;
  name: string;
  color: string;
  isActive: boolean;
  bookingEnabled?: boolean;
  createdAt: string;
  locationName?: string;
  photoUrl?: string | null;
  pricePerHour?: string | null;
  sport?: string | null;
}

interface Location {
  id: string;
  name: string;
  isActive: boolean;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

const COURT_COLORS = [
  { name: "Green", value: "#2ECC40" },
  { name: "Blue", value: "#0074D9" },
  { name: "Red", value: "#FF4136" },
  { name: "Orange", value: "#FF851B" },
  { name: "Yellow", value: "#FFDC00" },
  { name: "Purple", value: "#B10DC9" },
  { name: "Teal", value: "#39CCCC" },
  { name: "Navy", value: "#001f3f" },
];

export default function AdminCourtsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sportFilter, setSportFilter] = useState<SportOrMulti | "all">("all");
  const [courtAddressSearch, setCourtAddressSearch] = useState<{ address: string; lat: number; lng: number; placeId?: string; matchedLocationId?: string } | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [newLocationBanner, setNewLocationBanner] = useState<string | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, []);

  const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const handleAddressSelect = (result: { address: string; lat: number; lng: number; placeId?: string; mainText?: string }) => {
    let matchedLocationId: string | undefined;
    const locationsWithCoords = activeLocations.filter(l => l.lat && l.lng);
    if (locationsWithCoords.length > 0) {
      const nearest = locationsWithCoords
        .map(l => ({ ...l, dist: haversineKm(result.lat, result.lng, l.lat!, l.lng!) }))
        .sort((a, b) => a.dist - b.dist)[0];
      if (nearest && nearest.dist < 10) {
        matchedLocationId = nearest.id;
        setFormData(prev => ({ ...prev, locationId: nearest.id }));
        setCourtAddressSearch({ ...result, matchedLocationId: nearest.id });
        return;
      }
    }
    const firstPart = result.address.split(",")[0].toLowerCase();
    const closest = activeLocations.find(l =>
      l.address && l.address.toLowerCase().includes(firstPart)
    ) || activeLocations.find(l =>
      l.name.toLowerCase().includes(firstPart) || firstPart.includes(l.name.toLowerCase())
    );
    if (closest) {
      matchedLocationId = closest.id;
      setFormData(prev => ({ ...prev, locationId: closest.id }));
    }
    setCourtAddressSearch({ ...result, matchedLocationId });
  };

  const handleMapPickerConfirm = async (result: MapLocationResult) => {
    // Check for an existing location within 2 km
    const locationsWithCoords = activeLocations.filter(l => l.lat && l.lng);
    const nearby = locationsWithCoords.length > 0
      ? locationsWithCoords
          .map(l => ({ ...l, dist: haversineKm(result.lat, result.lng, l.lat!, l.lng!) }))
          .sort((a, b) => a.dist - b.dist)[0]
      : null;

    if (nearby && nearby.dist < 2) {
      // Good match — auto-select it and save the address
      setFormData(prev => ({ ...prev, locationId: nearby.id }));
      setCourtAddressSearch({
        address: result.address,
        lat: result.lat,
        lng: result.lng,
        placeId: courtAddressSearch?.placeId,
        matchedLocationId: nearby.id,
      });
      return;
    }

    // No nearby match — derive a name and auto-create a new location
    const segments = result.address.split(/\s*[,\-–|]\s*/);
    const rawName = segments[0]?.trim() || "";
    const locationName = rawName.length > 2 ? rawName : result.address.split(",")[0]?.trim() || "New Location";

    setCourtAddressSearch({
      address: result.address,
      lat: result.lat,
      lng: result.lng,
      placeId: courtAddressSearch?.placeId,
    });
    setCreatingLocation(true);

    try {
      const newLoc = await apiRequest("POST", "/api/admin/locations", {
        name: locationName,
        address: result.address,
        lat: result.lat,
        lng: result.lng,
        timezone: "Asia/Dubai",
      }) as { id: string };
      queryClient.invalidateQueries({ queryKey: ["/api/admin/locations"] });
      setFormData(prev => ({ ...prev, locationId: newLoc.id }));
      setCourtAddressSearch(prev =>
        prev ? { ...prev, matchedLocationId: newLoc.id } : prev
      );
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      setNewLocationBanner(locationName);
      bannerTimerRef.current = setTimeout(() => setNewLocationBanner(null), 5000);
    } catch {
      // Silent — user can still pick a location manually from the chips
    } finally {
      setCreatingLocation(false);
    }
  };

  const [formData, setFormData] = useState({
    name: "",
    locationId: "",
    color: "#2ECC40",
    isActive: true,
    bookingEnabled: true,
    photoUrl: "" as string | null,
    pricePerHour: "",
    sport: "tennis" as string,
  });

  const pickAndUploadPhoto = async (courtId?: string) => {
    if (Platform.OS === "web") {
      Alert.alert("Not Available", "Photo upload is only available on mobile devices. Use Expo Go to access this feature.");
      return;
    }

    try {
      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "We need access to your photo library to upload court photos.",
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Open Settings", 
              onPress: async () => {
                try {
                  await Linking.openSettings();
                } catch (e) {
                  console.warn("Could not open settings:", e);
                }
              }
            },
          ]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets[0]) {
        setUploadingPhoto(true);
        const asset = result.assets[0];
        
        // Get auth token for authenticated request
        const token = await AsyncStorage.getItem("auth_token");
        if (!token) {
          Alert.alert("Error", "Not authenticated. Please log in again.");
          setUploadingPhoto(false);
          return;
        }
        
        // Build FormData with proper React Native file handling
        const formDataUpload = new FormData();
        const uriParts = asset.uri.split(".");
        const fileType = uriParts[uriParts.length - 1] || "jpg";
        
        // React Native style FormData append (not expo-file-system File which is for different purposes)
        formDataUpload.append("photo", {
          uri: asset.uri,
          type: `image/${fileType === "jpg" ? "jpeg" : fileType}`,
          name: `court-photo.${fileType}`,
        } as any);
        
        // Include the courtId if we're editing an existing court
        const targetCourtId = courtId || selectedCourt?.id;
        if (targetCourtId) {
          formDataUpload.append("courtId", targetCourtId);
        }
        
        const response = await fetch(new URL("/api/upload/court-photo", getApiUrl()).toString(), {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
          body: formDataUpload,
        });
        
        if (response.ok) {
          const data = await response.json();
          setFormData(prev => ({ ...prev, photoUrl: data.photoUrl }));
          invalidateCourts();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          const errorData = await response.json().catch(() => ({}));
          Alert.alert("Error", errorData.error || "Failed to upload photo");
        }
        setUploadingPhoto(false);
      }
    } catch (error) {
      console.error("Photo upload error:", error);
      setUploadingPhoto(false);
      Alert.alert("Error", "Failed to pick or upload photo");
    }
  };

  const { data: courts = [], isLoading } = useQuery<Court[]>({
    queryKey: ["/api/admin/courts"],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/admin/locations"],
  });

  const activeLocations = locations.filter(l => l.isActive);

  const invalidateCourts = () => {
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && (
        key.startsWith('/api/admin/courts') ||
        key.startsWith('/api/admin/locations') ||
        key.startsWith('/api/courts') ||
        key.startsWith('/api/coach/courts') ||
        key.startsWith('/api/player/academy-courts') ||
        key.startsWith('/api/player/courts')
      );
    }});
  };

  const patchLocationGooglePlaceId = async (locationId: string, googlePlaceId: string) => {
    try {
      await apiRequest("PUT", `/api/admin/locations/${locationId}`, { googlePlaceId });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/locations"] });
    } catch {
      // Non-fatal: googlePlaceId link failure should not block court save
    }
  };

  const patchLocationCoordinates = async (locationId: string, lat: number, lng: number, address?: string): Promise<boolean> => {
    try {
      const payload: Record<string, unknown> = { lat, lng };
      if (address) payload.address = address;
      await apiRequest("PUT", `/api/admin/locations/${locationId}`, payload);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/locations"] });
      return true;
    } catch {
      return false;
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/admin/courts", data),
    onSuccess: async (_result, variables) => {
      const submittedLocationId = variables.locationId as string | null | undefined;
      if (courtAddressSearch?.placeId && submittedLocationId) {
        await patchLocationGooglePlaceId(submittedLocationId, courtAddressSearch.placeId);
      }
      if (courtAddressSearch?.lat != null && courtAddressSearch?.lng != null && submittedLocationId) {
        const ok = await patchLocationCoordinates(submittedLocationId, courtAddressSearch.lat, courtAddressSearch.lng, courtAddressSearch.address);
        if (!ok) {
          Alert.alert("Warning", "Court saved, but the precise map location could not be updated. You can retry by editing the court.");
        }
      }
      invalidateCourts();
      setShowAddModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to create court");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest("PUT", `/api/admin/courts/${id}`, data),
    onSuccess: async (_result, variables) => {
      const submittedLocationId = variables.data.locationId as string | null | undefined;
      if (courtAddressSearch?.placeId && submittedLocationId) {
        await patchLocationGooglePlaceId(submittedLocationId, courtAddressSearch.placeId);
      }
      if (courtAddressSearch?.lat != null && courtAddressSearch?.lng != null && submittedLocationId) {
        const ok = await patchLocationCoordinates(submittedLocationId, courtAddressSearch.lat, courtAddressSearch.lng, courtAddressSearch.address);
        if (!ok) {
          Alert.alert("Warning", "Court saved, but the precise map location could not be updated. You can retry by editing the court.");
        }
      }
      invalidateCourts();
      setShowEditModal(false);
      setSelectedCourt(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to update court");
    },
  });

  type DeleteCourtResponse = {
    success: boolean;
    archived?: boolean;
    dependents?: Record<string, number>;
    totalReferences?: number;
    message?: string;
  };

  const deleteMutation = useMutation<DeleteCourtResponse, Error, string>({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/courts/${id}`);
      try {
        return (await res.json()) as DeleteCourtResponse;
      } catch {
        return { success: true };
      }
    },
    onSuccess: (data) => {
      invalidateCourts();
      setShowEditModal(false);
      setSelectedCourt(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const archived = !!data?.archived;
      const title = archived ? "Court archived" : "Court deleted";
      const msg = archived
        ? data?.message ||
          "Court has past sessions or bookings, so it was archived instead of deleted. It will no longer appear in active lists."
        : "Court was deleted successfully.";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert(title, msg);
      }
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to delete court");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      locationId: activeLocations.length > 0 ? activeLocations[0].id : "",
      color: "#2ECC40",
      isActive: true,
      bookingEnabled: true,
      photoUrl: null,
      pricePerHour: "",
      sport: "tennis",
    });
    setCourtAddressSearch(null);
    setNewLocationBanner(null);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      Alert.alert("Error", "Court name is required");
      return;
    }
    createMutation.mutate({
      name: formData.name.trim(),
      locationId: formData.locationId || null,
      color: formData.color,
      isActive: formData.isActive,
      bookingEnabled: formData.bookingEnabled,
      photoUrl: formData.photoUrl || null,
      pricePerHour: formData.pricePerHour ? formData.pricePerHour : null,
      sport: formData.sport || "tennis",
    });
  };

  const handleUpdate = () => {
    if (!selectedCourt || !formData.name.trim()) {
      Alert.alert("Error", "Court name is required");
      return;
    }
    updateMutation.mutate({
      id: selectedCourt.id,
      data: {
        name: formData.name.trim(),
        locationId: formData.locationId || null,
        color: formData.color,
        isActive: formData.isActive,
        bookingEnabled: formData.bookingEnabled,
        photoUrl: formData.photoUrl || null,
        pricePerHour: formData.pricePerHour ? formData.pricePerHour : null,
        sport: formData.sport || "tennis",
      },
    });
  };

  const handleDelete = async (court: Court) => {
    // Fetch the preview BEFORE touching modal state so the confirm dialog
    // never races a modal-dismiss animation. The edit modal stays open
    // until the mutation actually succeeds (handled in deleteMutation).
    let willArchive = false;
    let totalRefs = 0;
    try {
      const res = await apiRequest("GET", `/api/courts/${court.id}/delete-preview`);
      const preview = await res.json();
      willArchive = !!preview?.willArchive;
      totalRefs = Number(preview?.totalReferences ?? 0);
    } catch {
      // Preview is best-effort; fall back to a plain confirm
    }

    const title = willArchive ? "Archive Court" : "Delete Court";
    const body = willArchive
      ? `"${court.name}" is used by ${totalRefs} record${totalRefs === 1 ? "" : "s"} (sessions, bookings or schedules). It will be archived and hidden from active lists, but kept for history. Continue?`
      : `Delete court "${court.name}"? This action cannot be undone.`;
    const action = willArchive ? "Archive" : "Delete";

    Alert.alert(
      title,
      body,
      [
        { text: "Cancel", style: "cancel" },
        { text: action, style: "destructive", onPress: () => deleteMutation.mutate(court.id) },
      ]
    );
  };

  const openEditModal = (court: Court) => {
    setSelectedCourt(court);
    setFormData({
      name: court.name,
      locationId: court.locationId || "",
      color: court.color || "#2ECC40",
      isActive: court.isActive,
      bookingEnabled: court.bookingEnabled !== false,
      photoUrl: court.photoUrl || null,
      pricePerHour: court.pricePerHour || "",
      sport: court.sport || "tennis",
    });
    setCourtAddressSearch(null);
    setNewLocationBanner(null);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setShowEditModal(true);
  };

  const filteredCourts = sportFilter === "all"
    ? courts
    : courts.filter(c => (c.sport || "tennis") === sportFilter);

  const groupedCourts = filteredCourts.reduce((acc, court) => {
    const key = court.locationName || "No Location";
    if (!acc[key]) acc[key] = [];
    acc[key].push(court);
    return acc;
  }, {} as Record<string, Court[]>);

  const activeCourts = courts.filter(c => c.isActive);
  const inactiveCourts = courts.filter(c => !c.isActive);

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>
      
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
            <Text style={styles.title}>Courts</Text>
            <Text style={styles.subtitle}>
              {activeCourts.length} active, {inactiveCourts.length} inactive
            </Text>
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
          {(["all", ...SPORTS, "multi"] as Array<SportOrMulti | "all">).map((s) => {
            const isSelected = sportFilter === s;
            const label = s === "all" ? "All" : s === "multi" ? "Multi" : s.charAt(0).toUpperCase() + s.slice(1);
            return (
              <Pressable
                key={s}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => setSportFilter(s)}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.gold} />
          </View>
        ) : courts.length === 0 ? (
          <View style={[styles.emptyContainer, CardStyles.elevated]}>
            <Ionicons name="tennisball-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No courts yet</Text>
            <Text style={styles.emptySubtext}>Add your first tennis court</Text>
          </View>
        ) : (
          Object.entries(groupedCourts).map(([locationName, locationCourts]) => (
            <View key={locationName} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="location" size={16} color={Colors.dark.textMuted} />
                <Text style={styles.sectionTitle}>{locationName}</Text>
              </View>
              {locationCourts.map((court) => (
                <Pressable
                  key={court.id}
                  style={[
                    styles.courtCard,
                    CardStyles.elevated,
                    !court.isActive && styles.inactiveCard,
                  ]}
                  onPress={() => openEditModal(court)}
                >
                  <View style={[styles.courtColorDot, { backgroundColor: court.color }]} />
                  <View style={styles.courtInfo}>
                    <Text style={[styles.courtName, !court.isActive && styles.inactiveText]}>
                      {court.name}
                    </Text>
                    <View style={styles.courtMeta}>
                      <SportBadge sport={court.sport || "tennis"} size="sm" />
                      {!court.isActive ? (
                        <Text style={styles.inactiveLabel}>Inactive</Text>
                      ) : null}
                    </View>
                  </View>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDelete(court);
                    }}
                    hitSlop={10}
                    disabled={deleteMutation.isPending}
                    style={({ pressed }) => [
                      styles.rowDeleteButton,
                      pressed && styles.rowDeleteButtonPressed,
                    ]}
                    accessibilityLabel={`Delete ${court.name}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                  </Pressable>
                  <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
                </Pressable>
              ))}
            </View>
          ))
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
              <Text style={styles.modalTitle}>Add Court</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <KeyboardAwareScrollViewCompat showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Court Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder="e.g. Court 1, Center Court"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>

              <View style={[styles.formGroup, { zIndex: 10 }]}>
                <Text style={styles.label}>Find Location by Venue</Text>
                <AddressAutocomplete
                  placeholder="Search venue to find nearby location..."
                  mode="venue"
                  onSelect={handleAddressSelect}
                />
                <Pressable
                  style={styles.pickOnMapButton}
                  onPress={() => setShowMapPicker(true)}
                >
                  <Ionicons name="map-outline" size={15} color={Colors.dark.primary} />
                  <Text style={styles.pickOnMapText}>Pick on map</Text>
                </Pressable>
                {courtAddressSearch ? (
                  <View style={styles.addressSearchResult}>
                    <Ionicons name="location" size={12} color={Colors.dark.primary} />
                    <Text style={styles.addressSearchResultText} numberOfLines={1}>
                      {courtAddressSearch.address}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.formGroup}>
                <View style={styles.locationLabelRow}>
                  <Text style={styles.label}>Location</Text>
                  {creatingLocation ? (
                    <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginLeft: Spacing.sm }} />
                  ) : null}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.locationPicker}>
                  <Pressable
                    style={[styles.locationOption, styles.locationOptionNew]}
                    onPress={() => setShowMapPicker(true)}
                  >
                    <Text style={styles.locationOptionNewText}>+ New Location</Text>
                  </Pressable>
                  {activeLocations.map((location) => (
                    <Pressable
                      key={location.id}
                      style={[
                        styles.locationOption,
                        formData.locationId === location.id && styles.locationOptionActive,
                      ]}
                      onPress={() => setFormData({ ...formData, locationId: location.id })}
                    >
                      <Text
                        style={[
                          styles.locationOptionText,
                          formData.locationId === location.id && styles.locationOptionTextActive,
                        ]}
                      >
                        {location.name}
                      </Text>
                    </Pressable>
                  ))}
                  {activeLocations.length === 0 ? (
                    <Text style={[styles.locationEmptyHint, { alignSelf: "center", marginLeft: Spacing.sm }]}>
                      {creatingLocation ? "Creating…" : "Pick on map to set location"}
                    </Text>
                  ) : null}
                </ScrollView>
                {newLocationBanner ? (
                  <View style={styles.newLocationBanner}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.dark.primary} />
                    <Text style={styles.newLocationBannerText}>
                      New location "{newLocationBanner}" created — rename it in Settings → Locations
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Court Color</Text>
                <View style={styles.colorPicker}>
                  {COURT_COLORS.map((color) => (
                    <Pressable
                      key={color.value}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color.value },
                        formData.color === color.value && styles.colorOptionActive,
                      ]}
                      onPress={() => setFormData({ ...formData, color: color.value })}
                    >
                      {formData.color === color.value && (
                        <Ionicons name="checkmark" size={18} color={Colors.dark.text} />
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Court Photo</Text>
                <Pressable 
                  style={styles.photoUploadButton}
                  onPress={pickAndUploadPhoto}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color={Colors.dark.primary} />
                  ) : formData.photoUrl ? (
                    <View style={styles.photoPreviewContainer}>
                      <Image 
                        source={{ uri: formData.photoUrl }}
                        style={styles.photoPreview}
                        contentFit="cover"
                      />
                      <View style={styles.photoOverlay}>
                        <Ionicons name="camera" size={20} color={Colors.dark.text} />
                        <Text style={styles.photoOverlayText}>Change</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Ionicons name="camera-outline" size={32} color={Colors.dark.textMuted} />
                      <Text style={styles.photoPlaceholderText}>Add Photo</Text>
                    </View>
                  )}
                </Pressable>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Rental Price per Hour</Text>
                <View style={styles.priceInputRow}>
                  <Text style={styles.currencyLabel}>AED</Text>
                  <TextInput
                    style={[styles.input, styles.priceInput]}
                    value={formData.pricePerHour}
                    onChangeText={(text) => setFormData({ ...formData, pricePerHour: text.replace(/[^0-9.]/g, "") })}
                    placeholder="0"
                    placeholderTextColor={Colors.dark.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
                <Text style={styles.helperText}>Leave empty if court rental is free</Text>
              </View>

              <View style={styles.formGroup}>
                <SportSingleSelector
                  selectedSport={formData.sport}
                  onSelect={(s) => setFormData({ ...formData, sport: s })}
                  label="Sport"
                  includeMulti
                />
              </View>

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
                style={styles.toggleRow}
                onPress={() => setFormData({ ...formData, bookingEnabled: !formData.bookingEnabled })}
              >
                <View>
                  <Text style={styles.toggleLabel}>Open for Booking</Text>
                  <Text style={styles.helperText}>
                    {formData.bookingEnabled ? "Players can book this court" : "Community only - not bookable"}
                  </Text>
                </View>
                <View style={[styles.toggle, formData.bookingEnabled && styles.toggleActive]}>
                  <View style={[styles.toggleKnob, formData.bookingEnabled && styles.toggleKnobActive]} />
                </View>
              </Pressable>

              <Pressable
                style={[styles.submitButton, (createMutation.isPending || creatingLocation) && styles.submitButtonDisabled]}
                onPress={handleCreate}
                disabled={createMutation.isPending || creatingLocation}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.buttonText} />
                ) : (
                  <Text style={styles.submitButtonText}>Add Court</Text>
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
              <Text style={styles.modalTitle}>Edit Court</Text>
              <Pressable onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <KeyboardAwareScrollViewCompat>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Court Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder="Court name"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>

              <View style={[styles.formGroup, { zIndex: 10 }]}>
                <Text style={styles.label}>Find Location by Venue</Text>
                <AddressAutocomplete
                  placeholder="Search venue to find nearby location..."
                  mode="venue"
                  onSelect={handleAddressSelect}
                />
                <Pressable
                  style={styles.pickOnMapButton}
                  onPress={() => setShowMapPicker(true)}
                >
                  <Ionicons name="map-outline" size={15} color={Colors.dark.primary} />
                  <Text style={styles.pickOnMapText}>Pick on map</Text>
                </Pressable>
                {courtAddressSearch ? (
                  <View style={styles.addressSearchResult}>
                    <Ionicons name="location" size={12} color={Colors.dark.primary} />
                    <Text style={styles.addressSearchResultText} numberOfLines={1}>
                      {courtAddressSearch.address}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.formGroup}>
                <View style={styles.locationLabelRow}>
                  <Text style={styles.label}>Location</Text>
                  {creatingLocation ? (
                    <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginLeft: Spacing.sm }} />
                  ) : null}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.locationPicker}>
                  <Pressable
                    style={[styles.locationOption, styles.locationOptionNew]}
                    onPress={() => setShowMapPicker(true)}
                  >
                    <Text style={styles.locationOptionNewText}>+ New Location</Text>
                  </Pressable>
                  {activeLocations.map((location) => (
                    <Pressable
                      key={location.id}
                      style={[
                        styles.locationOption,
                        formData.locationId === location.id && styles.locationOptionActive,
                      ]}
                      onPress={() => setFormData({ ...formData, locationId: location.id })}
                    >
                      <Text
                        style={[
                          styles.locationOptionText,
                          formData.locationId === location.id && styles.locationOptionTextActive,
                        ]}
                      >
                        {location.name}
                      </Text>
                    </Pressable>
                  ))}
                  {activeLocations.length === 0 ? (
                    <Text style={[styles.locationEmptyHint, { alignSelf: "center", marginLeft: Spacing.sm }]}>
                      {creatingLocation ? "Creating…" : "Pick on map to set location"}
                    </Text>
                  ) : null}
                </ScrollView>
                {newLocationBanner ? (
                  <View style={styles.newLocationBanner}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.dark.primary} />
                    <Text style={styles.newLocationBannerText}>
                      New location "{newLocationBanner}" created — rename it in Settings → Locations
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Court Color</Text>
                <View style={styles.colorPicker}>
                  {COURT_COLORS.map((color) => (
                    <Pressable
                      key={color.value}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color.value },
                        formData.color === color.value && styles.colorOptionActive,
                      ]}
                      onPress={() => setFormData({ ...formData, color: color.value })}
                    >
                      {formData.color === color.value && (
                        <Ionicons name="checkmark" size={18} color={Colors.dark.text} />
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Court Photo</Text>
                <Pressable 
                  style={styles.photoUploadButton}
                  onPress={pickAndUploadPhoto}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color={Colors.dark.primary} />
                  ) : formData.photoUrl ? (
                    <View style={styles.photoPreviewContainer}>
                      <Image 
                        source={{ uri: formData.photoUrl }}
                        style={styles.photoPreview}
                        contentFit="cover"
                      />
                      <View style={styles.photoOverlay}>
                        <Ionicons name="camera" size={20} color={Colors.dark.text} />
                        <Text style={styles.photoOverlayText}>Change</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Ionicons name="camera-outline" size={32} color={Colors.dark.textMuted} />
                      <Text style={styles.photoPlaceholderText}>Add Photo</Text>
                    </View>
                  )}
                </Pressable>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Rental Price per Hour</Text>
                <View style={styles.priceInputRow}>
                  <Text style={styles.currencyLabel}>AED</Text>
                  <TextInput
                    style={[styles.input, styles.priceInput]}
                    value={formData.pricePerHour}
                    onChangeText={(text) => setFormData({ ...formData, pricePerHour: text.replace(/[^0-9.]/g, "") })}
                    placeholder="0"
                    placeholderTextColor={Colors.dark.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
                <Text style={styles.helperText}>Leave empty if court rental is free</Text>
              </View>

              <View style={styles.formGroup}>
                <SportSingleSelector
                  selectedSport={formData.sport}
                  onSelect={(s) => setFormData({ ...formData, sport: s })}
                  label="Sport"
                  includeMulti
                />
              </View>

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
                style={styles.toggleRow}
                onPress={() => setFormData({ ...formData, bookingEnabled: !formData.bookingEnabled })}
              >
                <View>
                  <Text style={styles.toggleLabel}>Open for Booking</Text>
                  <Text style={styles.helperText}>
                    {formData.bookingEnabled ? "Players can book this court" : "Community only - not bookable"}
                  </Text>
                </View>
                <View style={[styles.toggle, formData.bookingEnabled && styles.toggleActive]}>
                  <View style={[styles.toggleKnob, formData.bookingEnabled && styles.toggleKnobActive]} />
                </View>
              </Pressable>

              <View style={styles.buttonRow}>
                <Pressable
                  style={[styles.submitButton, styles.flexButton, (updateMutation.isPending || creatingLocation) && styles.submitButtonDisabled]}
                  onPress={handleUpdate}
                  disabled={updateMutation.isPending || creatingLocation}
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
                onPress={() => selectedCourt && handleDelete(selectedCourt)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.error} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                    <Text style={styles.deleteButtonText}>Delete Court</Text>
                  </>
                )}
              </Pressable>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>

      <MapLocationPickerModal
        visible={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onConfirm={handleMapPickerConfirm}
        initialLat={courtAddressSearch?.lat ?? (
          formData.locationId
            ? activeLocations.find(l => l.id === formData.locationId)?.lat
            : undefined
        )}
        initialLng={courtAddressSearch?.lng ?? (
          formData.locationId
            ? activeLocations.find(l => l.id === formData.locationId)?.lng
            : undefined
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  backText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    fontWeight: "500",
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  courtCard: {
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
  rowDeleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.22)",
    marginRight: Spacing.xs,
  },
  rowDeleteButtonPressed: {
    opacity: 0.7,
  },
  courtColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: Spacing.md,
  },
  courtInfo: {
    flex: 1,
  },
  courtName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  courtMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: 4,
  },
  inactiveLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
  inactiveText: {
    color: Colors.dark.textMuted,
  },
  filterRow: {
    marginHorizontal: -Spacing.md,
    marginBottom: Spacing.md,
  },
  filterRowContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  filterChipActive: {
    backgroundColor: `${Colors.dark.gold}20`,
    borderColor: Colors.dark.gold,
  },
  filterChipText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: Colors.dark.gold,
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
    padding: Spacing.md,
    paddingTop: Spacing.lg,
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
  priceInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  currencyLabel: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    minWidth: 40,
  },
  priceInput: {
    flex: 1,
  },
  helperText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  pickOnMapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(200, 255, 61, 0.08)",
  },
  pickOnMapText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  locationPicker: {
    flexDirection: "row",
  },
  locationOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  locationOptionActive: {
    backgroundColor: GlowColors.primary,
    borderColor: GlowColors.primary,
  },
  locationOptionText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
  },
  locationOptionTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  locationOptionNew: {
    borderColor: Colors.dark.primary,
    borderStyle: "dashed",
  },
  locationOptionNewText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  locationLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  locationEmptyHint: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  newLocationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: "rgba(200, 255, 61, 0.08)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.2)",
  },
  newLocationBannerText: {
    fontSize: Typography.tiny?.fontSize ?? 11,
    color: Colors.dark.primary,
    flex: 1,
  },
  colorPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  colorOptionActive: {
    borderWidth: 3,
    borderColor: Colors.dark.text,
  },
  photoUploadButton: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  photoPreviewContainer: {
    width: "100%",
    height: "100%",
    position: "relative",
  },
  photoPreview: {
    width: "100%",
    height: "100%",
  },
  photoOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Backgrounds.overlay,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  photoOverlayText: {
    color: Colors.dark.text,
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
  },
  photoPlaceholder: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  photoPlaceholderText: {
    color: Colors.dark.textMuted,
    fontSize: Typography.small.fontSize,
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
  addressSearchResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: `${Colors.dark.primary}12`,
    borderRadius: BorderRadius.sm,
  },
  addressSearchResultText: {
    flex: 1,
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
  },
});
