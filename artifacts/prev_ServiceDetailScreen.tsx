import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
  FlatList,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Spacing } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface Service {
  id: string;
  name: string;
  shortDescription?: string;
  description?: string;
  price: string;
  iconName: string;
  durationMinutes?: number;
  maxBookingsPerDay?: number;
  requiresApproval?: boolean;
  isFeatured: boolean;
  isStringingService?: boolean;
  suggestedProviderId?: string | null;
  stringingOptions?: {
    strings: { name: string; brand: string; price: number }[];
    tensionRange: { min: number; max: number };
  } | null;
}

interface XPDiscount {
  discountPercent: number;
  tierName: string;
  currentXP: number;
  nextTierLevel: number | null;
  level: number;
}

interface ProviderCard {
  id: string;
  displayName: string;
  profilePhotoUrl?: string | null;
  specializations?: string[] | null;
  rating: number;
  totalBookings: number;
  activeBookings: number;
}

type ProviderPickerItem =
  | { kind: "any" }
  | { kind: "provider"; provider: ProviderCard };

export default function ServiceDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState("");
  const [stringingTension, setStringingTension] = useState("");
  const [stringingChoice, setStringingChoice] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  const serviceId = route.params?.serviceId;

  if (!serviceId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Service</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Service not found</Text>
        </View>
      </View>
    );
  }

  const { data: service, isLoading } = useQuery<Service>({
    queryKey: [`/api/player/shop/services/${serviceId}`],
    enabled: !!serviceId,
  });

  const { data: xpDiscount } = useQuery<XPDiscount>({
    queryKey: ["/api/player/shop/xp-discount"],
  });

  const { data: wishlistData } = useQuery<{ items: any[] }>({
    queryKey: ["/api/player/shop/wishlist"],
  });

  const { data: providers } = useQuery<ProviderCard[]>({
    queryKey: [`/api/player/shop/services/${serviceId}/providers`],
    enabled: !!serviceId,
  });

  const isInWishlist = wishlistData?.items?.some(
    (item) => item.serviceId === serviceId
  );

  const wishlistMutation = useMutation({
    mutationFn: async () => {
      if (isInWishlist) {
        const item = wishlistData?.items?.find((i) => i.serviceId === serviceId);
        if (item) {
          await apiRequest("DELETE", `/api/player/shop/wishlist/${item.id}`);
        }
      } else {
        await apiRequest("POST", "/api/player/shop/wishlist", { serviceId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/shop/wishlist"] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const bookingMutation = useMutation({
    mutationFn: async (payload: {
      scheduledAt: string;
      notes?: string;
      items: { serviceId: string; quantity: number }[];
      serviceDetails?: Record<string, string>;
      preferredProviderId?: string;
    }) => {
      const res = await apiRequest("POST", "/api/player/shop/orders", payload);
      return res.json();
    },
    onSuccess: (order: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/shop/orders"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const orderId = order?.id;
      Alert.alert(
        "Booking Placed",
        `Your booking #${order?.orderNumber ?? ""} has been placed! We'll confirm within 24 hours.`,
        [
          {
            text: "Done",
            onPress: () => navigation.goBack(),
          },
          ...(orderId ? [{
            text: "Chat with Provider",
            onPress: () => {
              navigation.goBack();
              setTimeout(() => navigation.navigate("PlayerBookingChat", { orderId }), 350);
            },
          }] : []),
        ]
      );
    },
    onError: (err: any) => {
      let msg = "Failed to place booking. Please try again.";
      try {
        const raw = err?.message ?? "";
        const jsonStart = raw.indexOf("{");
        if (jsonStart !== -1) {
          const parsed = JSON.parse(raw.slice(jsonStart));
          if (parsed?.error) msg = parsed.error;
        }
      } catch {}
      Alert.alert("Booking Failed", msg);
    },
  });

  const formatPrice = (price: string) => {
    return `AED ${parseFloat(price).toFixed(0)}`;
  };

  const getDiscountedPrice = (price: string) => {
    if (!xpDiscount?.discountPercent) return null;
    const original = parseFloat(price);
    const discounted = original * (1 - xpDiscount.discountPercent / 100);
    return `AED ${discounted.toFixed(0)}`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const handleBookNow = () => {
    if (!service) return;

    const serviceDetails: Record<string, string> = {};
    if (service.isStringingService) {
      if (stringingTension.trim()) serviceDetails.tension = stringingTension.trim();
      if (stringingChoice.trim()) serviceDetails.stringChoice = stringingChoice.trim();
    }

    bookingMutation.mutate({
      scheduledAt: selectedDate.toISOString(),
      notes: notes.trim() || undefined,
      items: [{ serviceId: service.id, quantity: 1 }],
      serviceDetails: Object.keys(serviceDetails).length > 0 ? serviceDetails : undefined,
      preferredProviderId: selectedProviderId ?? undefined,
    });
  };

  if (isLoading || !service) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="build-outline" size={48} color={Colors.dark.xpCyan} />
          <Text style={styles.loadingText}>Loading service...</Text>
        </View>
      </View>
    );
  }

  const discountedPrice = getDiscountedPrice(service.price);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Book Service</Text>
        <Pressable
          onPress={() => wishlistMutation.mutate()}
          style={styles.wishlistButton}
        >
          <Ionicons
            name={isInWishlist ? "heart" : "heart-outline"}
            size={24}
            color={isInWishlist ? Colors.dark.error : Colors.dark.text}
          />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)} style={styles.serviceHeader}>
          <LinearGradient
            colors={[Colors.dark.xpCyan + "20", Colors.dark.backgroundSecondary]}
            style={styles.serviceIconContainer}
          >
            <Ionicons
              name={(service.iconName as any) || "build"}
              size={48}
              color={Colors.dark.xpCyan}
            />
          </LinearGradient>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(100).duration(400)}
          style={styles.content}
        >
          <View style={styles.providerBadge}>
            <Ionicons name="business" size={14} color={Colors.dark.xpCyan} />
            <Text style={styles.providerBadgeText}>Academy Service</Text>
          </View>

          <Text style={styles.serviceName}>{service.name}</Text>

          {service.durationMinutes && (
            <View style={styles.durationRow}>
              <Ionicons name="time-outline" size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.durationText}>{service.durationMinutes} minutes</Text>
            </View>
          )}

          <View style={styles.priceContainer}>
            {discountedPrice ? (
              <>
                <Text style={styles.discountedPrice}>{discountedPrice}</Text>
                <Text style={styles.originalPrice}>{formatPrice(service.price)}</Text>
                <View style={styles.xpDiscountBadge}>
                  <Ionicons name="flash" size={12} color={Colors.dark.gold} />
                  <Text style={styles.xpDiscountText}>
                    {xpDiscount?.discountPercent}% {xpDiscount?.tierName}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.price}>{formatPrice(service.price)}</Text>
            )}
          </View>

          {service.shortDescription && (
            <Text style={styles.shortDescription}>{service.shortDescription}</Text>
          )}

          {service.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>About this Service</Text>
              <Text style={styles.description}>{service.description}</Text>
            </View>
          )}

          <View style={styles.bookingSection}>
            <Text style={styles.sectionTitle}>Booking Details</Text>

            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={styles.datePickerButton}
            >
              <View style={styles.datePickerContent}>
                <Ionicons name="calendar-outline" size={20} color={Colors.dark.xpCyan} />
                <View>
                  <Text style={styles.datePickerLabel}>Preferred Date</Text>
                  <Text style={styles.datePickerValue}>{formatDate(selectedDate)}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textSecondary} />
            </Pressable>

            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, date) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (date) setSelectedDate(date);
                }}
                minimumDate={new Date()}
                themeVariant="dark"
              />
            )}

            {service ? (
              <View style={styles.providerPickerSection}>
                <Text style={styles.notesLabel}>Choose Your Provider</Text>
                <FlatList<ProviderPickerItem>
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={[
                    { kind: "any" } as ProviderPickerItem,
                    ...(providers ?? []).map((p): ProviderPickerItem => ({ kind: "provider", provider: p })),
                  ]}
                  keyExtractor={(item) => (item.kind === "any" ? "any" : item.provider.id)}
                  ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                  contentContainerStyle={{ paddingBottom: 4 }}
                  renderItem={({ item }) => {
                    const isAny = item.kind === "any";
                    const provider = isAny ? null : item.provider;
                    const isSelected = isAny ? selectedProviderId === null : selectedProviderId === provider!.id;
                    const initials = provider
                      ? provider.displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
                      : "";
                    const topSpec = provider?.specializations?.[0];
                    return (
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedProviderId(isAny ? null : provider!.id);
                        }}
                        style={[styles.providerChip, isSelected && styles.providerChipSelected]}
                      >
                        <View style={[styles.providerAvatar, isSelected && styles.providerAvatarSelected]}>
                          {isAny ? (
                            <Ionicons name="people" size={18} color={isSelected ? Colors.dark.backgroundDefault : Colors.dark.textSecondary} />
                          ) : provider?.profilePhotoUrl ? (
                            <Image
                              source={{ uri: provider.profilePhotoUrl }}
                              style={styles.providerAvatarImg}
                              contentFit="cover"
                            />
                          ) : (
                            <Text style={[styles.providerInitials, isSelected && styles.providerInitialsSelected]}>{initials}</Text>
                          )}
                        </View>
                        <Text style={[styles.providerChipName, isSelected && styles.providerChipNameSelected]} numberOfLines={1}>
                          {isAny ? "Any Available" : provider!.displayName.split(" ")[0]}
                        </Text>
                        {!isAny && topSpec ? (
                          <Text style={styles.providerSpecText} numberOfLines={1}>
                            {topSpec.charAt(0).toUpperCase() + topSpec.slice(1)}
                          </Text>
                        ) : null}
                        {!isAny && provider && provider.rating > 0 ? (
                          <View style={styles.providerRatingRow}>
                            <Ionicons name="star" size={10} color={Colors.dark.gold} />
                            <Text style={styles.providerRatingText}>{Number(provider.rating).toFixed(1)}</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  }}
                />
              </View>
            ) : null}

            {service.isStringingService ? (
              <View style={styles.stringingContainer}>
                <Text style={styles.notesLabel}>Stringing Details</Text>
                <TextInput
                  style={styles.notesInput}
                  value={stringingTension}
                  onChangeText={setStringingTension}
                  placeholder={`Tension (e.g. ${service.stringingOptions?.tensionRange ? `${service.stringingOptions.tensionRange.min}-${service.stringingOptions.tensionRange.max} lbs` : "50-60 lbs"})`}
                  placeholderTextColor={Colors.dark.textSecondary + "80"}
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={[styles.notesInput, { marginTop: Spacing.sm }]}
                  value={stringingChoice}
                  onChangeText={setStringingChoice}
                  placeholder="String choice (brand / model)"
                  placeholderTextColor={Colors.dark.textSecondary + "80"}
                />
              </View>
            ) : null}

            <View style={styles.notesContainer}>
              <Text style={styles.notesLabel}>Special Requests (Optional)</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any specific requirements or preferences..."
                placeholderTextColor={Colors.dark.textSecondary + "80"}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>

          {service.requiresApproval && (
            <View style={styles.approvalNote}>
              <Ionicons name="information-circle" size={18} color={Colors.dark.gold} />
              <Text style={styles.approvalNoteText}>
                This service requires approval. We'll confirm your booking within 24 hours.
              </Text>
            </View>
          )}

          {xpDiscount && !discountedPrice && (
            <LinearGradient
              colors={[Colors.dark.gold + "15", Colors.dark.backgroundSecondary]}
              style={styles.xpPromoCard}
            >
              <Ionicons name="trending-up" size={24} color={Colors.dark.gold} />
              <View style={styles.xpPromoContent}>
                <Text style={styles.xpPromoTitle}>Unlock XP Discounts</Text>
                <Text style={styles.xpPromoText}>
                  Earn more XP to unlock discounts on services!
                </Text>
              </View>
            </LinearGradient>
          )}
        </Animated.View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <Animated.View
        entering={FadeInUp.delay(300).duration(400)}
        style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}
      >
        <View style={styles.bottomPriceContainer}>
          <Text style={styles.bottomPriceLabel}>Total</Text>
          <Text style={styles.bottomPrice}>
            {discountedPrice || formatPrice(service.price)}
          </Text>
        </View>
        <Pressable
          onPress={handleBookNow}
          disabled={bookingMutation.isPending}
          style={[
            styles.bookButton,
            bookingMutation.isSuccess && styles.bookedButton,
          ]}
        >
          <Ionicons
            name={bookingMutation.isPending ? "hourglass-outline" : "calendar-outline"}
            size={20}
            color={Colors.dark.backgroundDefault}
          />
          <Text style={styles.bookButtonText}>
            {bookingMutation.isPending ? "Booking..." : "Book Now"}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  wishlistButton: {
    padding: Spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
  },
  serviceHeader: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  serviceIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  content: {
    padding: Spacing.lg,
  },
  providerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.xpCyan + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginBottom: Spacing.sm,
  },
  providerBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  serviceName: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.md,
  },
  durationText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  price: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  discountedPrice: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  originalPrice: {
    fontSize: 18,
    color: Colors.dark.textSecondary,
    textDecorationLine: "line-through",
  },
  xpDiscountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  xpDiscountText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  shortDescription: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  descriptionSection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  description: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  bookingSection: {
    marginBottom: Spacing.lg,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  datePickerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  datePickerLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginBottom: 2,
  },
  datePickerValue: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  notesContainer: {
    marginTop: Spacing.sm,
  },
  stringingContainer: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  notesInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
    fontSize: 14,
    color: Colors.dark.text,
    minHeight: 80,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  approvalNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.gold + "15",
    padding: Spacing.md,
    borderRadius: 14,
    marginBottom: Spacing.lg,
  },
  approvalNoteText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.gold,
    lineHeight: 18,
  },
  xpPromoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
  },
  xpPromoContent: {
    flex: 1,
  },
  xpPromoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.gold,
    marginBottom: 2,
  },
  xpPromoText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  bottomPriceContainer: {
    flex: 1,
  },
  bottomPriceLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginBottom: 2,
  },
  bottomPrice: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  bookButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 14,
  },
  bookedButton: {
    backgroundColor: Colors.dark.successNeon,
  },
  bookButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.backgroundDefault,
  },
  providerPickerSection: {
    marginBottom: Spacing.md,
  },
  providerChip: {
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: 76,
    gap: 6,
  },
  providerChipSelected: {
    borderColor: "#C8FF3D",
    backgroundColor: "#C8FF3D15",
  },
  providerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  providerAvatarSelected: {
    backgroundColor: "#C8FF3D",
  },
  providerInitials: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  providerInitialsSelected: {
    color: Colors.dark.backgroundDefault,
  },
  providerChipName: {
    fontSize: 11,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  providerChipNameSelected: {
    color: "#C8FF3D",
    fontWeight: "700",
  },
  providerRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  providerRatingText: {
    fontSize: 10,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  providerAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  providerSpecText: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    opacity: 0.8,
  },
});
