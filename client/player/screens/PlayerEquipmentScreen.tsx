import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Platform,
  TextInput,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography, FontSizes } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface EquipmentItem {
  id: string;
  name: string;
  description?: string;
  type: "rental" | "sale";
  priceCredits?: number | null;
  priceCash?: string | null;
  currency: string;
  quantity: number;
  availableQuantity: number;
  photoUrl?: string | null;
}

interface RentalEntry {
  rental: {
    id: string;
    equipmentId: string;
    reservedFrom: string;
    reservedUntil: string;
    returnedAt?: string | null;
    status: string;
    paymentMethod: string;
    creditsUsed?: number | null;
    amountPaid?: string | null;
    transactionType?: string; // rental | purchase
  };
  equipmentName?: string;
  equipmentType?: string;
  equipmentPhotoUrl?: string | null;
}

type TabKey = "browse" | "my_rentals";

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

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

export default function PlayerEquipmentScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("browse");
  const [selectedItem, setSelectedItem] = useState<EquipmentItem | null>(null);
  const [showRentModal, setShowRentModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"credits" | "cash">("credits");
  const [reservedFrom, setReservedFrom] = useState<Date | null>(null);
  const [reservedUntil, setReservedUntil] = useState<Date | null>(null);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showUntilPicker, setShowUntilPicker] = useState(false);
  const [purchaseQty, setPurchaseQty] = useState("1");
  const [filterType, setFilterType] = useState<"all" | "rental" | "sale">("all");

  const {
    data: equipmentData,
    isLoading: equipmentLoading,
    refetch: refetchEquipment,
  } = useQuery<{ equipment: EquipmentItem[] }>({
    queryKey: ["/api/player/equipment"],
  });

  const {
    data: rentalsData,
    isLoading: rentalsLoading,
    refetch: refetchRentals,
  } = useQuery<{ rentals: RentalEntry[] }>({
    queryKey: ["/api/player/equipment/rentals"],
  });

  const allEquipment = equipmentData?.equipment ?? [];
  const myRentals = rentalsData?.rentals ?? [];

  const filteredEquipment =
    filterType === "all"
      ? allEquipment
      : allEquipment.filter((e) => e.type === filterType);

  const activeRentals = myRentals.filter(
    (r) => r.rental.status === "reserved" || r.rental.status === "active" || r.rental.status === "overdue"
  );

  const rentMutation = useMutation({
    mutationFn: (data: {
      equipmentId: string;
      reservedFrom: string;
      reservedUntil: string;
      paymentMethod: "credits" | "cash";
    }) => apiRequest("POST", "/api/player/equipment/rent", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/equipment/rentals"] });
      setShowRentModal(false);
      setSelectedItem(null);
      setReservedFrom(null);
      setReservedUntil(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Reserved", "Your rental has been reserved successfully.");
    },
    onError: (err: unknown) => {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to reserve rental");
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: (data: {
      equipmentId: string;
      paymentMethod: "credits" | "cash";
      quantity: number;
    }) => apiRequest("POST", "/api/player/equipment/purchase", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/equipment/rentals"] });
      setShowPurchaseModal(false);
      setSelectedItem(null);
      setPurchaseQty("1");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Purchased", "Your purchase was successful.");
    },
    onError: (err: unknown) => {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to complete purchase");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/player/equipment/rentals/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/equipment/rentals"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: unknown) => {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to cancel rental");
    },
  });

  const openRentModal = (item: EquipmentItem) => {
    setSelectedItem(item);
    setPaymentMethod(item.priceCredits != null ? "credits" : "cash");
    setReservedFrom(null);
    setReservedUntil(null);
    setShowFromPicker(false);
    setShowUntilPicker(false);
    setShowRentModal(true);
  };

  const openPurchaseModal = (item: EquipmentItem) => {
    setSelectedItem(item);
    setPaymentMethod(item.priceCredits != null ? "credits" : "cash");
    setPurchaseQty("1");
    setShowPurchaseModal(true);
  };

  const handleRent = () => {
    if (!selectedItem) return;
    if (!reservedFrom || !reservedUntil) {
      Alert.alert("Required", "Please select pickup and return dates");
      return;
    }
    if (reservedFrom >= reservedUntil) {
      Alert.alert("Invalid Dates", "Return date must be after pickup date");
      return;
    }
    rentMutation.mutate({
      equipmentId: selectedItem.id,
      reservedFrom: reservedFrom.toISOString(),
      reservedUntil: reservedUntil.toISOString(),
      paymentMethod,
    });
  };

  const handlePurchase = () => {
    if (!selectedItem) return;
    const qty = parseInt(purchaseQty) || 1;
    purchaseMutation.mutate({
      equipmentId: selectedItem.id,
      paymentMethod,
      quantity: qty,
    });
  };

  const confirmCancel = (id: string) => {
    Alert.alert("Cancel Rental", "Cancel this reservation?", [
      { text: "No", style: "cancel" },
      { text: "Yes, Cancel", style: "destructive", onPress: () => cancelMutation.mutate(id) },
    ]);
  };

  const renderEquipmentCard = (item: EquipmentItem, index: number) => {
    const available = (item.availableQuantity ?? 0) > 0;
    return (
      <Animated.View entering={FadeInUp.delay(index * 60)} key={item.id}>
        <Pressable
          style={[styles.card, !available && styles.cardUnavailable]}
          onPress={() => {
            if (!available) return;
            if (item.type === "rental") openRentModal(item);
            else openPurchaseModal(item);
          }}
        >
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.cardPhoto} contentFit="cover" />
          ) : (
            <View style={[styles.cardPhoto, styles.cardPhotoPlaceholder]}>
              <Ionicons
                name={item.type === "rental" ? "repeat-outline" : "bag-outline"}
                size={28}
                color={Colors.dark.textMuted}
              />
            </View>
          )}
          <View style={styles.cardBody}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <View
                style={[
                  styles.typeBadge,
                  {
                    backgroundColor:
                      item.type === "rental" ? Colors.dark.primary + "33" : Colors.dark.gold + "33",
                  },
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
              <Text style={styles.cardDesc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
            <View style={styles.priceRow}>
              {item.priceCredits != null ? (
                <View style={styles.priceChip}>
                  <Ionicons name="star" size={12} color={Colors.dark.gold} />
                  <Text style={styles.priceChipText}>{item.priceCredits} credits</Text>
                </View>
              ) : null}
              {item.priceCash != null ? (
                <View style={styles.priceChip}>
                  <Text style={styles.priceChipText}>
                    {item.currency} {parseFloat(item.priceCash).toFixed(2)}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.availRow}>
              <View style={[styles.availDot, { backgroundColor: available ? Colors.dark.successNeon : "#FF4444" }]} />
              <Text
                style={[
                  styles.availText,
                  { color: available ? Colors.dark.textMuted : "#FF4444" },
                ]}
              >
                {available
                  ? `${item.availableQuantity} available`
                  : "Not available"}
              </Text>
            </View>
          </View>
          {available ? (
            <View style={styles.cardCTA}>
              <Ionicons
                name={item.type === "rental" ? "calendar-outline" : "cart-outline"}
                size={20}
                color={Colors.dark.primary}
              />
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    );
  };

  const renderMyRental = ({ item: entry }: { item: RentalEntry }) => {
    const { rental } = entry;
    const isPurchase = rental.transactionType === "purchase";
    const isOverdue = rental.status === "overdue";
    const canCancel = rental.status === "reserved" && !isPurchase;

    return (
      <View style={[styles.rentalCard, isOverdue && styles.overdueCard]}>
        <View style={styles.rentalRow}>
          {entry.equipmentPhotoUrl ? (
            <Image source={{ uri: entry.equipmentPhotoUrl }} style={styles.rentalPhoto} contentFit="cover" />
          ) : (
            <View style={[styles.rentalPhoto, styles.cardPhotoPlaceholder]}>
              <Ionicons
                name={isPurchase ? "bag-outline" : "repeat-outline"}
                size={18}
                color={Colors.dark.textMuted}
              />
            </View>
          )}
          <View style={styles.rentalInfo}>
            <Text style={styles.rentalTitle}>{entry.equipmentName ?? "Equipment"}</Text>
            {isPurchase ? (
              <Text style={styles.rentalDates}>
                Purchased {formatDate(rental.reservedFrom)}
              </Text>
            ) : (
              <Text style={styles.rentalDates}>
                {formatDate(rental.reservedFrom)} — {formatDate(rental.reservedUntil)}
              </Text>
            )}
            <View style={styles.rentalStatusRow}>
              <View
                style={[
                  styles.typeBadge,
                  { backgroundColor: isPurchase ? Colors.dark.gold + "33" : Colors.dark.primary + "33" },
                ]}
              >
                <Text style={[styles.typeBadgeText, { color: isPurchase ? Colors.dark.gold : Colors.dark.primary }]}>
                  {isPurchase ? "Purchase" : "Rental"}
                </Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: statusColor(rental.status) }]} />
              <Text style={[styles.statusText, { color: statusColor(rental.status) }]}>
                {rental.status.charAt(0).toUpperCase() + rental.status.slice(1)}
              </Text>
              {rental.paymentMethod === "credits" && rental.creditsUsed != null ? (
                <Text style={styles.paymentTag}>{rental.creditsUsed} cr</Text>
              ) : rental.amountPaid != null ? (
                <Text style={styles.paymentTag}>{rental.amountPaid}</Text>
              ) : null}
            </View>
          </View>
          {canCancel ? (
            <Pressable
              onPress={() => confirmCancel(rental.id)}
              style={styles.cancelBtn}
            >
              <Ionicons name="close-circle-outline" size={20} color={Colors.dark.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  const filterOptions: { key: "all" | "rental" | "sale"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "rental", label: "Rentals" },
    { key: "sale", label: "Shop" },
  ];

  const PaymentSelector = ({
    item,
    value,
    onChange,
  }: {
    item: EquipmentItem;
    value: "credits" | "cash";
    onChange: (v: "credits" | "cash") => void;
  }) => (
    <View style={styles.paymentOptions}>
      {item.priceCredits != null ? (
        <Pressable
          style={[styles.paymentOption, value === "credits" && styles.paymentOptionActive]}
          onPress={() => onChange("credits")}
        >
          <Ionicons name="star" size={16} color={value === "credits" ? Colors.dark.gold : Colors.dark.textMuted} />
          <Text style={[styles.paymentOptionText, value === "credits" && { color: Colors.dark.gold }]}>
            {item.priceCredits} credits
          </Text>
        </Pressable>
      ) : null}
      {item.priceCash != null ? (
        <Pressable
          style={[styles.paymentOption, value === "cash" && styles.paymentOptionActive]}
          onPress={() => onChange("cash")}
        >
          <Ionicons name="cash-outline" size={16} color={value === "cash" ? Colors.dark.primary : Colors.dark.textMuted} />
          <Text style={[styles.paymentOptionText, value === "cash" && { color: Colors.dark.primary }]}>
            {item.currency} {parseFloat(item.priceCash).toFixed(2)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: headerHeight + Spacing.xl }]}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === "browse" && styles.tabActive]}
          onPress={() => setActiveTab("browse")}
        >
          <Text style={[styles.tabText, activeTab === "browse" && styles.tabTextActive]}>
            Browse
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "my_rentals" && styles.tabActive]}
          onPress={() => setActiveTab("my_rentals")}
        >
          <Text style={[styles.tabText, activeTab === "my_rentals" && styles.tabTextActive]}>
            My Rentals
          </Text>
          {activeRentals.length > 0 ? (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{activeRentals.length}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {activeTab === "browse" ? (
        <View style={{ flex: 1 }}>
          {/* Filter chips */}
          <View style={styles.filterRow}>
            {filterOptions.map((f) => (
              <Pressable
                key={f.key}
                style={[styles.filterChip, filterType === f.key && styles.filterChipActive]}
                onPress={() => setFilterType(f.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterType === f.key && styles.filterChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {equipmentLoading ? (
            <ActivityIndicator style={styles.loader} color={Colors.dark.primary} />
          ) : filteredEquipment.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No equipment available</Text>
              <Text style={styles.emptySubtext}>
                Your academy has not added any equipment yet.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              refreshControl={
                <RefreshControl
                  refreshing={false}
                  onRefresh={refetchEquipment}
                  tintColor={Colors.dark.primary}
                />
              }
            >
              {filteredEquipment.map((item, i) => renderEquipmentCard(item, i))}
            </ScrollView>
          )}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {rentalsLoading ? (
            <ActivityIndicator style={styles.loader} color={Colors.dark.primary} />
          ) : myRentals.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="repeat-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No rentals yet</Text>
              <Text style={styles.emptySubtext}>
                Reserve a rental item from the Browse tab.
              </Text>
            </View>
          ) : (
            <FlatList
              data={myRentals}
              keyExtractor={(item) => item.rental.id}
              renderItem={renderMyRental}
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

      {/* Rent Modal */}
      <Modal visible={showRentModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAwareScrollViewCompat
          style={[styles.modalContainer, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl }]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Reserve Rental</Text>
            <Pressable onPress={() => setShowRentModal(false)}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>
          {selectedItem ? (
            <>
              <View style={styles.modalItemRow}>
                {selectedItem.photoUrl ? (
                  <Image source={{ uri: selectedItem.photoUrl }} style={styles.modalPhoto} contentFit="cover" />
                ) : (
                  <View style={[styles.modalPhoto, styles.cardPhotoPlaceholder]}>
                    <Ionicons name="repeat-outline" size={24} color={Colors.dark.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalItemName}>{selectedItem.name}</Text>
                  {selectedItem.description ? (
                    <Text style={styles.modalItemDesc}>{selectedItem.description}</Text>
                  ) : null}
                </View>
              </View>

              <Text style={styles.modalLabel}>Payment Method</Text>
              <PaymentSelector
                item={selectedItem}
                value={paymentMethod}
                onChange={setPaymentMethod}
              />

              <Text style={styles.modalLabel}>Pickup Date</Text>
              <Pressable
                style={styles.datePickerRow}
                onPress={() => {
                  setShowUntilPicker(false);
                  setShowFromPicker((v) => !v);
                }}
              >
                <Ionicons name="calendar-outline" size={16} color={Colors.dark.textMuted} style={{ marginRight: 8 }} />
                <Text style={reservedFrom ? styles.dateText : styles.datePlaceholder}>
                  {reservedFrom
                    ? reservedFrom.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                    : "Select pickup date"}
                </Text>
              </Pressable>
              {showFromPicker ? (
                <DateTimePicker
                  value={reservedFrom ?? new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  minimumDate={new Date()}
                  onChange={(_event: { type: string; nativeEvent: object }, date?: Date) => {
                    setShowFromPicker(Platform.OS === "ios");
                    if (date) setReservedFrom(date);
                  }}
                  style={{ backgroundColor: Colors.dark.surface }}
                />
              ) : null}

              <Text style={[styles.modalLabel, { marginTop: Spacing.sm }]}>Return Date</Text>
              <Pressable
                style={styles.datePickerRow}
                onPress={() => {
                  setShowFromPicker(false);
                  setShowUntilPicker((v) => !v);
                }}
              >
                <Ionicons name="calendar-outline" size={16} color={Colors.dark.textMuted} style={{ marginRight: 8 }} />
                <Text style={reservedUntil ? styles.dateText : styles.datePlaceholder}>
                  {reservedUntil
                    ? reservedUntil.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                    : "Select return date"}
                </Text>
              </Pressable>
              {showUntilPicker ? (
                <DateTimePicker
                  value={reservedUntil ?? reservedFrom ?? new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  minimumDate={reservedFrom ?? new Date()}
                  onChange={(_event: { type: string; nativeEvent: object }, date?: Date) => {
                    setShowUntilPicker(Platform.OS === "ios");
                    if (date) setReservedUntil(date);
                  }}
                  style={{ backgroundColor: Colors.dark.surface }}
                />
              ) : null}

              <View style={styles.confirmBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.dark.textMuted} />
                <Text style={styles.confirmText}>
                  {paymentMethod === "credits"
                    ? `${selectedItem.priceCredits} credits will be reserved. Please return by the end date.`
                    : `Pay ${selectedItem.currency} ${parseFloat(selectedItem.priceCash ?? "0").toFixed(2)} at checkout.`}
                </Text>
              </View>

              <Pressable
                style={[
                  styles.ctaBtn,
                  { marginTop: Spacing.md },
                  (!reservedFrom || !reservedUntil || rentMutation.isPending) && styles.ctaBtnDisabled,
                ]}
                onPress={handleRent}
                disabled={!reservedFrom || !reservedUntil || rentMutation.isPending}
              >
                {rentMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.buttonText} />
                ) : (
                  <Text style={styles.ctaBtnText}>Confirm Reservation</Text>
                )}
              </Pressable>
            </>
          ) : null}
        </KeyboardAwareScrollViewCompat>
      </Modal>

      {/* Purchase Modal */}
      <Modal visible={showPurchaseModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAwareScrollViewCompat
          style={[styles.modalContainer, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl }]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Purchase Item</Text>
            <Pressable onPress={() => setShowPurchaseModal(false)}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>
          {selectedItem ? (
            <>
              <View style={styles.modalItemRow}>
                {selectedItem.photoUrl ? (
                  <Image source={{ uri: selectedItem.photoUrl }} style={styles.modalPhoto} contentFit="cover" />
                ) : (
                  <View style={[styles.modalPhoto, styles.cardPhotoPlaceholder]}>
                    <Ionicons name="bag-outline" size={24} color={Colors.dark.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalItemName}>{selectedItem.name}</Text>
                  {selectedItem.description ? (
                    <Text style={styles.modalItemDesc}>{selectedItem.description}</Text>
                  ) : null}
                  <Text style={styles.stockTag}>
                    {selectedItem.availableQuantity} in stock
                  </Text>
                </View>
              </View>

              <Text style={styles.modalLabel}>Payment Method</Text>
              <PaymentSelector
                item={selectedItem}
                value={paymentMethod}
                onChange={setPaymentMethod}
              />

              <Text style={styles.modalLabel}>Quantity</Text>
              <View style={styles.qtyRow}>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() =>
                    setPurchaseQty((q) => String(Math.max(1, parseInt(q) - 1)))
                  }
                >
                  <Ionicons name="remove" size={18} color={Colors.dark.text} />
                </Pressable>
                <TextInput
                  style={styles.qtyInput}
                  value={purchaseQty}
                  onChangeText={(t) => setPurchaseQty(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  textAlign="center"
                />
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() =>
                    setPurchaseQty((q) =>
                      String(Math.min(selectedItem.availableQuantity, parseInt(q) + 1))
                    )
                  }
                >
                  <Ionicons name="add" size={18} color={Colors.dark.text} />
                </Pressable>
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                {paymentMethod === "credits" && selectedItem.priceCredits != null ? (
                  <Text style={styles.totalValue}>
                    {selectedItem.priceCredits * (parseInt(purchaseQty) || 1)} credits
                  </Text>
                ) : selectedItem.priceCash != null ? (
                  <Text style={styles.totalValue}>
                    {selectedItem.currency}{" "}
                    {(parseFloat(selectedItem.priceCash) * (parseInt(purchaseQty) || 1)).toFixed(2)}
                  </Text>
                ) : null}
              </View>

              <Pressable
                style={[styles.ctaBtn, purchaseMutation.isPending && styles.ctaBtnDisabled]}
                onPress={handlePurchase}
                disabled={purchaseMutation.isPending}
              >
                {purchaseMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.buttonText} />
                ) : (
                  <Text style={styles.ctaBtnText}>Confirm Purchase</Text>
                )}
              </Pressable>
            </>
          ) : null}
        </KeyboardAwareScrollViewCompat>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
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
  tabBadge: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: Colors.dark.buttonText,
    fontSize: 11,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
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
  scroll: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    flexDirection: "row",
    marginBottom: Spacing.sm,
    overflow: "hidden",
  },
  cardUnavailable: {
    opacity: 0.55,
  },
  cardPhoto: {
    width: 80,
    height: 90,
  },
  cardPhotoPlaceholder: {
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
  },
  cardBody: {
    flex: 1,
    padding: Spacing.md,
    gap: 3,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  cardTitle: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  cardDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  priceRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    flexWrap: "wrap",
  },
  priceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priceChipText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  availRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  availDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  availText: {
    fontSize: FontSizes.xs,
  },
  cardCTA: {
    width: 44,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.primary + "11",
  },
  // Rental cards
  rentalCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  overdueCard: {
    borderWidth: 1,
    borderColor: "#FF4444",
  },
  rentalRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  rentalPhoto: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
  },
  rentalInfo: {
    flex: 1,
    gap: 2,
  },
  rentalTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  rentalDates: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  rentalStatusRow: {
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
  paymentTag: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginLeft: "auto",
  },
  cancelBtn: {
    padding: 4,
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
    fontWeight: "600",
    color: Colors.dark.text,
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
  modalItemRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  modalPhoto: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.sm,
  },
  modalItemName: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  modalItemDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  stockTag: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  modalLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: 6,
    marginTop: Spacing.md,
  },
  paymentOptions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  paymentOption: {
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
  paymentOptionActive: {
    borderColor: Colors.dark.gold,
    backgroundColor: Colors.dark.gold + "22",
  },
  paymentOptionText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  modalInput: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  datePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  dateText: {
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    flex: 1,
  },
  datePlaceholder: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.md,
    flex: 1,
  },
  confirmBox: {
    flexDirection: "row",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  confirmText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  qtyInput: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    textAlign: "center",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  totalLabel: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
  totalValue: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  ctaBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  ctaBtnDisabled: {
    opacity: 0.5,
  },
  ctaBtnText: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
    fontSize: FontSizes.md,
  },
});
