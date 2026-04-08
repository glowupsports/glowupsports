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
  Switch,
  RefreshControl,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Colors, Spacing, BorderRadius, Typography, FontSizes, CardStyles } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import * as ImagePicker from "expo-image-picker";

interface EquipmentItem {
  id: string;
  academyId: string;
  name: string;
  description?: string;
  type: "rental" | "sale";
  priceCredits?: number | null;
  priceCash?: string | null;
  currency: string;
  quantity: number;
  availableQuantity: number;
  photoUrl?: string | null;
  isActive: boolean;
  createdAt: string;
}

interface RentalEntry {
  rental: {
    id: string;
    equipmentId: string;
    playerId: string;
    reservedFrom: string;
    reservedUntil: string;
    returnedAt?: string | null;
    status: string;
    paymentMethod: string;
    creditsUsed?: number | null;
    amountPaid?: string | null;
    notes?: string | null;
  };
  equipmentName?: string;
  equipmentType?: string;
  equipmentPhotoUrl?: string | null;
  playerName?: string;
  playerPhotoUrl?: string | null;
}

type TabKey = "inventory" | "rentals";

const EMPTY_FORM = {
  name: "",
  description: "",
  type: "rental" as "rental" | "sale",
  priceCredits: "",
  priceCash: "",
  currency: "AED",
  quantity: "1",
  isActive: true,
  photoUrl: null as string | null,
};

export default function AdminEquipmentScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("inventory");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<EquipmentItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [rentalFilter, setRentalFilter] = useState<string>("all");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const {
    data: equipmentData,
    isLoading: equipmentLoading,
    refetch: refetchEquipment,
  } = useQuery<{ equipment: EquipmentItem[] }>({
    queryKey: ["/api/admin/equipment"],
  });

  const {
    data: rentalsData,
    isLoading: rentalsLoading,
    refetch: refetchRentals,
  } = useQuery<{ rentals: RentalEntry[] }>({
    queryKey: ["/api/admin/equipment/rentals"],
  });

  const equipmentList = equipmentData?.equipment ?? [];
  const allRentals = rentalsData?.rentals ?? [];

  const filteredRentals =
    rentalFilter === "all"
      ? allRentals
      : allRentals.filter((r) => r.rental.status === rentalFilter);

  const activeRentalsCount = allRentals.filter(
    (r) => r.rental.status === "active" || r.rental.status === "reserved"
  ).length;
  const overdueCount = allRentals.filter((r) => r.rental.status === "overdue").length;

  const saveMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const body = {
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        type: data.type,
        priceCredits: data.priceCredits ? parseInt(data.priceCredits) : null,
        priceCash: data.priceCash ? parseFloat(data.priceCash) : null,
        currency: data.currency,
        quantity: parseInt(data.quantity) || 1,
        isActive: data.isActive,
        photoUrl: data.photoUrl,
      };
      if (editingItem) {
        return apiRequest("PATCH", `/api/admin/equipment/${editingItem.id}`, body);
      } else {
        return apiRequest("POST", `/api/admin/equipment`, body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/equipment"] });
      setShowModal(false);
      setEditingItem(null);
      setForm(EMPTY_FORM);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: unknown) => {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save equipment");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/equipment/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/equipment"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: unknown) => {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to deactivate");
    },
  });

  const checkinMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/admin/equipment/rentals/${id}/checkin`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/equipment/rentals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/equipment"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: unknown) => {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to check in");
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/admin/equipment/rentals/${id}/checkout`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/equipment/rentals"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: unknown) => {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to check out");
    },
  });

  const openAddModal = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (item: EquipmentItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      description: item.description ?? "",
      type: item.type,
      priceCredits: item.priceCredits != null ? String(item.priceCredits) : "",
      priceCash: item.priceCash != null ? String(parseFloat(item.priceCash)) : "",
      currency: item.currency,
      quantity: String(item.quantity),
      isActive: item.isActive ?? true,
      photoUrl: item.photoUrl ?? null,
    });
    setShowModal(true);
  };

  const handlePickPhoto = async () => {
    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert("Permission required", "Please allow photo library access.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    setUploadingPhoto(true);
    try {
      const token = await AsyncStorage.getItem("authToken");
      const apiBase = getApiUrl();
      const formData = new FormData();
      // React Native FormData accepts { uri, type, name } as a file descriptor
      const fileDescriptor = {
        uri: asset.uri,
        type: "image/jpeg",
        name: "equipment.jpg",
      };
      formData.append("photo", fileDescriptor as unknown as Blob);

      const resp = await fetch(new URL("/api/upload/photo", apiBase).toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await resp.json();
      if (json.url) {
        setForm((f) => ({ ...f, photoUrl: json.url }));
      }
    } catch (e: unknown) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const confirmDeactivate = (item: EquipmentItem) => {
    Alert.alert(
      "Deactivate Equipment",
      `Deactivate "${item.name}"? It will no longer be shown to players.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: () => deactivateMutation.mutate(item.id),
        },
      ]
    );
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "returned":
        return Colors.dark.successNeon;
      case "active":
        return Colors.dark.primary;
      case "reserved":
        return Colors.dark.gold;
      case "overdue":
        return "#FF4444";
      case "cancelled":
        return Colors.dark.textMuted;
      default:
        return Colors.dark.text;
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const renderInventoryItem = (item: EquipmentItem) => (
    <Pressable
      key={item.id}
      style={styles.card}
      onPress={() => openEditModal(item)}
    >
      <View style={styles.cardRow}>
        {item.photoUrl ? (
          <Image
            source={{ uri: item.photoUrl }}
            style={styles.itemPhoto}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.itemPhoto, styles.itemPhotoPlaceholder]}>
            <Ionicons
              name={item.type === "rental" ? "repeat-outline" : "bag-outline"}
              size={24}
              color={Colors.dark.textMuted}
            />
          </View>
        )}
        <View style={styles.cardInfo}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: item.type === "rental" ? Colors.dark.primary + "33" : Colors.dark.gold + "33" },
              ]}
            >
              <Text
                style={[
                  styles.typeBadgeText,
                  { color: item.type === "rental" ? Colors.dark.primary : Colors.dark.gold },
                ]}
              >
                {item.type === "rental" ? "Rental" : "Sale"}
              </Text>
            </View>
          </View>
          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
          <View style={styles.priceRow}>
            {item.priceCredits != null ? (
              <Text style={styles.priceText}>{item.priceCredits} credits</Text>
            ) : null}
            {item.priceCash != null ? (
              <Text style={styles.priceText}>
                {item.currency} {parseFloat(item.priceCash).toFixed(2)}
              </Text>
            ) : null}
          </View>
          <View style={styles.stockRow}>
            <Ionicons name="cube-outline" size={13} color={Colors.dark.textMuted} />
            <Text style={styles.stockText}>
              {item.availableQuantity} / {item.quantity} available
            </Text>
            {!item.isActive ? (
              <Text style={styles.inactiveBadge}>Inactive</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.cardActions}>
          <Pressable onPress={() => openEditModal(item)} style={styles.iconBtn}>
            <Ionicons name="pencil-outline" size={18} color={Colors.dark.textMuted} />
          </Pressable>
          {item.isActive ? (
            <Pressable onPress={() => confirmDeactivate(item)} style={styles.iconBtn}>
              <Ionicons name="eye-off-outline" size={18} color={Colors.dark.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );

  const renderRentalItem = ({ item: entry }: { item: RentalEntry }) => {
    const { rental } = entry;
    const isOverdue = rental.status === "overdue";

    return (
      <View style={[styles.card, isOverdue && styles.overdueCard]}>
        <View style={styles.cardRow}>
          {entry.equipmentPhotoUrl ? (
            <Image
              source={{ uri: entry.equipmentPhotoUrl }}
              style={styles.itemPhotoSm}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.itemPhotoSm, styles.itemPhotoPlaceholder]}>
              <Ionicons name="repeat-outline" size={18} color={Colors.dark.textMuted} />
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>{entry.equipmentName ?? "Equipment"}</Text>
            <Text style={styles.cardDesc}>
              {entry.playerName ?? "Unknown Player"}
            </Text>
            <Text style={styles.rentalDates}>
              {formatDate(rental.reservedFrom)} — {formatDate(rental.reservedUntil)}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(rental.status) }]} />
              <Text style={[styles.statusText, { color: statusColor(rental.status) }]}>
                {rental.status.charAt(0).toUpperCase() + rental.status.slice(1)}
              </Text>
              <Text style={styles.paymentBadge}>
                {rental.paymentMethod === "credits"
                  ? `${rental.creditsUsed ?? 0} credits`
                  : `${entry.rental.amountPaid ?? 0} cash`}
              </Text>
            </View>
          </View>
          <View style={styles.cardActions}>
            {rental.status === "reserved" ? (
              <Pressable
                onPress={() => checkoutMutation.mutate(rental.id)}
                style={[styles.actionBtn, { backgroundColor: Colors.dark.primary + "33" }]}
              >
                <Text style={[styles.actionBtnText, { color: Colors.dark.primary }]}>
                  Check Out
                </Text>
              </Pressable>
            ) : null}
            {(rental.status === "active" || rental.status === "overdue") ? (
              <Pressable
                onPress={() => checkinMutation.mutate(rental.id)}
                style={[
                  styles.actionBtn,
                  { backgroundColor: Colors.dark.successNeon + "33" },
                ]}
              >
                <Text style={[styles.actionBtnText, { color: Colors.dark.successNeon }]}>
                  Check In
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const rentalFilters = [
    { key: "all", label: "All" },
    { key: "reserved", label: "Reserved" },
    { key: "active", label: "Active" },
    { key: "overdue", label: "Overdue" },
    { key: "returned", label: "Returned" },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Equipment</Text>
        {activeTab === "inventory" ? (
          <Pressable onPress={openAddModal} style={styles.addBtn}>
            <Ionicons name="add" size={24} color={Colors.dark.primary} />
          </Pressable>
        ) : (
          <View style={styles.addBtn} />
        )}
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statChip}>
          <Ionicons name="cube-outline" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.statText}>{equipmentList.filter((e) => e.isActive).length} items</Text>
        </View>
        <View style={styles.statChip}>
          <Ionicons name="repeat-outline" size={14} color={Colors.dark.primary} />
          <Text style={[styles.statText, { color: Colors.dark.primary }]}>
            {activeRentalsCount} active
          </Text>
        </View>
        {overdueCount > 0 ? (
          <View style={styles.statChip}>
            <Ionicons name="warning-outline" size={14} color="#FF4444" />
            <Text style={[styles.statText, { color: "#FF4444" }]}>
              {overdueCount} overdue
            </Text>
          </View>
        ) : null}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === "inventory" && styles.tabActive]}
          onPress={() => setActiveTab("inventory")}
        >
          <Text style={[styles.tabText, activeTab === "inventory" && styles.tabTextActive]}>
            Inventory
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "rentals" && styles.tabActive]}
          onPress={() => setActiveTab("rentals")}
        >
          <Text style={[styles.tabText, activeTab === "rentals" && styles.tabTextActive]}>
            Rentals
          </Text>
          {overdueCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{overdueCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* Content */}
      {activeTab === "inventory" ? (
        equipmentLoading ? (
          <ActivityIndicator style={styles.loader} color={Colors.dark.primary} />
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            refreshControl={
              <RefreshControl
                refreshing={false}
                onRefresh={refetchEquipment}
                tintColor={Colors.dark.primary}
              />
            }
          >
            {equipmentList.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="cube-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyText}>No equipment yet</Text>
                <Text style={styles.emptySubtext}>
                  Tap + to add rackets, balls, or other items.
                </Text>
              </View>
            ) : (
              equipmentList.map(renderInventoryItem)
            )}
          </ScrollView>
        )
      ) : (
        <View style={{ flex: 1 }}>
          {/* Rental filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {rentalFilters.map((f) => (
              <Pressable
                key={f.key}
                style={[
                  styles.filterChip,
                  rentalFilter === f.key && styles.filterChipActive,
                ]}
                onPress={() => setRentalFilter(f.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    rentalFilter === f.key && styles.filterChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {rentalsLoading ? (
            <ActivityIndicator style={styles.loader} color={Colors.dark.primary} />
          ) : filteredRentals.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="repeat-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No rentals</Text>
            </View>
          ) : (
            <FlatList
              data={filteredRentals}
              keyExtractor={(item) => item.rental.id}
              renderItem={renderRentalItem}
              contentContainerStyle={{
                paddingHorizontal: Spacing.lg,
                paddingBottom: insets.bottom + 24,
              }}
              refreshControl={
                <RefreshControl
                  refreshing={false}
                  onRefresh={refetchRentals}
                  tintColor={Colors.dark.primary}
                />
              }
            />
          )}
        </View>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View
          style={[
            styles.modalContainer,
            { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingItem ? "Edit Equipment" : "Add Equipment"}
            </Text>
            <Pressable onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat style={styles.modalScroll}>
            {/* Photo */}
            <Pressable onPress={handlePickPhoto} style={styles.photoPickerBtn} disabled={uploadingPhoto}>
              {form.photoUrl ? (
                <Image source={{ uri: form.photoUrl }} style={styles.photoPreview} contentFit="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  {uploadingPhoto ? (
                    <ActivityIndicator color={Colors.dark.primary} />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={32} color={Colors.dark.textMuted} />
                      <Text style={styles.photoPlaceholderText}>Add Photo</Text>
                    </>
                  )}
                </View>
              )}
            </Pressable>

            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
              placeholder="e.g. Wilson Racket"
              placeholderTextColor={Colors.dark.textMuted}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.description}
              onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
              placeholder="Optional description"
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>Type *</Text>
            <View style={styles.typeToggle}>
              <Pressable
                style={[styles.typeOption, form.type === "rental" && styles.typeOptionActive]}
                onPress={() => setForm((f) => ({ ...f, type: "rental" }))}
              >
                <Ionicons
                  name="repeat-outline"
                  size={16}
                  color={form.type === "rental" ? Colors.dark.primary : Colors.dark.textMuted}
                />
                <Text
                  style={[
                    styles.typeOptionText,
                    form.type === "rental" && { color: Colors.dark.primary },
                  ]}
                >
                  Rental
                </Text>
              </Pressable>
              <Pressable
                style={[styles.typeOption, form.type === "sale" && styles.typeOptionActive]}
                onPress={() => setForm((f) => ({ ...f, type: "sale" }))}
              >
                <Ionicons
                  name="bag-outline"
                  size={16}
                  color={form.type === "sale" ? Colors.dark.gold : Colors.dark.textMuted}
                />
                <Text
                  style={[
                    styles.typeOptionText,
                    form.type === "sale" && { color: Colors.dark.gold },
                  ]}
                >
                  Sale
                </Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Price (Credits)</Text>
            <TextInput
              style={styles.input}
              value={form.priceCredits}
              onChangeText={(t) => setForm((f) => ({ ...f, priceCredits: t.replace(/[^0-9]/g, "") }))}
              placeholder="Leave blank if not available"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="number-pad"
            />

            <Text style={styles.label}>Price (Cash)</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: Spacing.sm }]}
                value={form.priceCash}
                onChangeText={(t) =>
                  setForm((f) => ({ ...f, priceCash: t.replace(/[^0-9.]/g, "") }))
                }
                placeholder="Leave blank if not available"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, { width: 70 }]}
                value={form.currency}
                onChangeText={(t) => setForm((f) => ({ ...f, currency: t.toUpperCase() }))}
                placeholder="AED"
                placeholderTextColor={Colors.dark.textMuted}
                maxLength={3}
              />
            </View>

            <Text style={styles.label}>Total Quantity *</Text>
            <TextInput
              style={styles.input}
              value={form.quantity}
              onChangeText={(t) => setForm((f) => ({ ...f, quantity: t.replace(/[^0-9]/g, "") }))}
              placeholder="1"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="number-pad"
            />

            <View style={styles.switchRow}>
              <Text style={styles.label}>Active</Text>
              <Switch
                value={form.isActive}
                onValueChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                trackColor={{ true: Colors.dark.primary }}
                thumbColor="#fff"
              />
            </View>

            <Pressable
              style={[
                styles.saveBtn,
                (!form.name.trim() || saveMutation.isPending) && styles.saveBtnDisabled,
              ]}
              onPress={() => {
                if (!form.name.trim()) return;
                saveMutation.mutate(form);
              }}
              disabled={!form.name.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator color={Colors.dark.buttonText} />
              ) : (
                <Text style={styles.saveBtnText}>
                  {editingItem ? "Save Changes" : "Add Equipment"}
                </Text>
              )}
            </Pressable>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    padding: Spacing.xs,
    marginRight: Spacing.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  addBtn: {
    padding: Spacing.xs,
    width: 40,
    alignItems: "center",
  },
  statsBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    marginHorizontal: Spacing.lg,
  },
  tab: {
    paddingVertical: Spacing.sm,
    marginRight: Spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.dark.primary,
  },
  tabText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  badge: {
    backgroundColor: "#FF4444",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  list: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  overdueCard: {
    borderWidth: 1,
    borderColor: "#FF4444",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  itemPhoto: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.sm,
  },
  itemPhotoSm: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
  },
  itemPhotoPlaceholder: {
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  cardTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  cardDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  priceRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: 2,
  },
  priceText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  stockText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  inactiveBadge: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 4,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: "500",
  },
  cardActions: {
    gap: Spacing.xs,
    alignItems: "flex-end",
  },
  iconBtn: {
    padding: 4,
  },
  actionBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  actionBtnText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  rentalDates: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  paymentBadge: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginLeft: "auto",
  },
  filterRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    flexDirection: "row",
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.surface,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.primary + "33",
  },
  filterChipText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  filterChipTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  loader: {
    marginTop: 48,
  },
  empty: {
    alignItems: "center",
    paddingTop: 64,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.lg,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  modalScroll: {
    flex: 1,
  },
  label: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: 4,
    marginTop: Spacing.md,
  },
  input: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  typeToggle: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  typeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  typeOptionActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "22",
  },
  typeOptionText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.md,
  },
  photoPickerBtn: {
    alignSelf: "center",
    marginBottom: Spacing.sm,
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.md,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  photoPlaceholderText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  saveBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
    fontSize: FontSizes.md,
  },
});
