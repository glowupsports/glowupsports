import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  Dimensions,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInUp, FadeInRight } from "react-native-reanimated";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, GlowColors, Backgrounds, TextColors } from "@/constants/theme";
import { useCart } from "../contexts/CartContext";
import { LockedScreen } from "../components/LockedScreen";
import { apiRequest, apiFetch } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

const HEAD_ORANGE = "#FF6600";
const HEAD_BLACK = "#0D0D0D";
const HEAD_DARK = "#1A1A1A";

const HEAD_COLLECTIONS = [
  { name: "Speed", color: "#3A87FF", icon: "flash" },
  { name: "Radical", color: "#FF3A3A", icon: "radio" },
  { name: "Extreme", color: "#FF6600", icon: "flame" },
  { name: "Gravity", color: "#9B59B6", icon: "planet" },
  { name: "Boom", color: "#FFD700", icon: "star" },
];

const CATEGORY_ICONS: Record<string, any> = {
  rackets: "tennisball",
  strings: "construct",
  grips: "construct",
  shoes: "footsteps",
  bags: "briefcase",
  gear: "briefcase",
  clothing: "shirt",
  services: "build",
};

const SHOP_CATEGORIES = [
  { name: "Rackets", slug: "rackets", icon: "tennisball" },
  { name: "Strings & Grips", slug: "strings", icon: "construct" },
  { name: "Shoes", slug: "shoes", icon: "footsteps" },
  { name: "Bags & Gear", slug: "bags", icon: "briefcase" },
  { name: "Clothing", slug: "clothing", icon: "shirt" },
];

interface ShopCategory {
  id: string;
  name: string;
  slug: string;
  iconName: string;
  iconColor: string;
  type: string;
}

interface ShopProduct {
  id: string;
  name: string;
  shortDescription?: string;
  price: string;
  compareAtPrice?: string;
  imageUrl?: string;
  isFeatured: boolean;
  sellerType?: string;
  currency?: string;
}

interface ShopService {
  id: string;
  name: string;
  shortDescription?: string;
  price: string;
  iconName: string;
  durationMinutes?: number;
  currency?: string;
}

interface ShopData {
  categories: ShopCategory[];
  featuredProducts: ShopProduct[];
  featuredServices: ShopService[];
  newArrivals: ShopProduct[];
  onSale: ShopProduct[];
}

interface XPDiscount {
  discountPercent: number;
  tierName: string;
  currentXP: number;
  nextTierLevel: number | null;
  level: number;
}

interface SearchResults {
  products: ShopProduct[];
  services: ShopService[];
}

interface ShopOrder {
  id: string;
  status: string;
  totalAmount: string;
  currency?: string;
  createdAt?: string;
  providerName?: string | null;
  serviceName?: string | null;
  orderNumber: string;
}

interface UpsellRequest {
  id: string;
  orderId: string;
  label: string;
  price: string;
  status: "pending" | "approved" | "declined";
}

interface PendingUpsellWithOrder extends UpsellRequest {
  orderNumber: string;
}

function UpsellRowItem({ upsell, onRespond, isResponding, onViewBooking }: { upsell: PendingUpsellWithOrder; onRespond: (action: "approve" | "decline") => void; isResponding: boolean; onViewBooking: () => void }) {
  return (
    <View style={pendingUpsellStyles.row}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={pendingUpsellStyles.label}>{upsell.label}</Text>
        <Pressable onPress={onViewBooking}>
          <Text style={pendingUpsellStyles.meta}>
            {"AED "}
            {parseFloat(upsell.price).toFixed(0)}
            {" · "}
            <Text style={pendingUpsellStyles.bookingLink}>Booking #{upsell.orderNumber}</Text>
          </Text>
        </Pressable>
      </View>
      <View style={pendingUpsellStyles.actions}>
        <Pressable
          style={[pendingUpsellStyles.declineBtn, isResponding && { opacity: 0.5 }]}
          onPress={() => onRespond("decline")}
          disabled={isResponding}
        >
          {isResponding ? (
            <ActivityIndicator size="small" color={Colors.dark.error} />
          ) : (
            <Ionicons name="close" size={16} color={Colors.dark.error} />
          )}
        </Pressable>
        <Pressable
          style={[pendingUpsellStyles.approveBtn, isResponding && { opacity: 0.5 }]}
          onPress={() => onRespond("approve")}
          disabled={isResponding}
        >
          {isResponding ? (
            <ActivityIndicator size="small" color={Colors.dark.backgroundDefault} />
          ) : (
            <Text style={pendingUpsellStyles.approveBtnText}>Accept</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function PendingUpsellsBanner() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [responding, setResponding] = useState<string | null>(null);

  const { data: orders } = useQuery<ShopOrder[]>({
    queryKey: ["/api/player/shop/orders"],
    refetchInterval: 15000,
  });

  const confirmedOrderIds = (orders ?? []).filter((o) => o.status === "confirmed").map((o) => o.id).join(",");

  const { data: pendingUpsells } = useQuery<PendingUpsellWithOrder[]>({
    queryKey: ["/api/player/shop/pending-upsells", confirmedOrderIds],
    enabled: confirmedOrderIds.length > 0,
    refetchInterval: 15000,
    queryFn: async () => {
      const confirmedOrders = (orders ?? []).filter((o) => o.status === "confirmed");
      const results: PendingUpsellWithOrder[] = [];
      for (const order of confirmedOrders) {
        const res = await apiFetch(`/api/player/shop/orders/${order.id}/upsells`);
        if (res.ok) {
          const upsells: UpsellRequest[] = await res.json();
          for (const u of upsells) {
            if (u.status === "pending") {
              results.push({ ...u, orderNumber: order.orderNumber });
            }
          }
        }
      }
      return results;
    },
  });

  const handleRespond = async (upsell: PendingUpsellWithOrder, action: "approve" | "decline") => {
    setResponding(upsell.id);
    try {
      const res = await apiRequest("POST", `/api/player/shop/orders/${upsell.orderId}/upsells/${upsell.id}/respond`, { action });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/shop/pending-upsells", confirmedOrderIds] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/shop/orders"] });
      Alert.alert(
        action === "approve" ? "Extra Added" : "Declined",
        action === "approve"
          ? `"${upsell.label}" has been added to booking #${upsell.orderNumber}.`
          : `You've declined the "${upsell.label}" extra.`
      );
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to respond.");
    } finally {
      setResponding(null);
    }
  };

  if (!pendingUpsells || pendingUpsells.length === 0) return null;

  return (
    <Animated.View entering={FadeInUp.duration(400)} style={pendingUpsellStyles.container}>
      <View style={pendingUpsellStyles.header}>
        <Ionicons name="add-circle-outline" size={16} color="#FFD700" />
        <Text style={pendingUpsellStyles.headerText}>
          {pendingUpsells.length === 1 ? "Your provider proposed an extra" : `${pendingUpsells.length} extras proposed`}
        </Text>
      </View>
      {pendingUpsells.map((u) => (
        <UpsellRowItem
          key={u.id}
          upsell={u}
          isResponding={responding === u.id}
          onRespond={(action) => handleRespond(u, action)}
          onViewBooking={() => navigation.navigate("PlayerOrderDetail", { orderId: u.orderId })}
        />
      ))}
    </Animated.View>
  );
}

const pendingUpsellStyles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    backgroundColor: "#1A1A00",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FFD70040",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: "#FFD70010",
    borderBottomWidth: 1,
    borderBottomColor: "#FFD70020",
  },
  headerText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFD700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#FFD70010",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  meta: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  bookingLink: {
    color: "#FFD700",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.xs,
    alignItems: "center",
  },
  declineBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.dark.error + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtn: {
    height: 34,
    paddingHorizontal: Spacing.sm,
    borderRadius: 10,
    backgroundColor: GlowColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.backgroundDefault,
  },
}));

function formatPrice(price: string, currency: string = "AED") {
  const num = parseFloat(price);
  if (num >= 1000) {
    return `${currency} ${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `${currency} ${num.toFixed(0)}`;
}

function getDiscount(price: string, compareAt?: string) {
  if (!compareAt) return null;
  const p = parseFloat(price);
  const c = parseFloat(compareAt);
  if (c <= p) return null;
  return Math.round(((c - p) / c) * 100);
}

function ProductHCard({ product, onPress, onAddToBag }: { product: ShopProduct; onPress: (p: ShopProduct) => void; onAddToBag: (p: ShopProduct) => void }) {
  const discount = getDiscount(product.price, product.compareAtPrice);
  const cardWidth = SCREEN_WIDTH * 0.44;

  return (
    <Pressable onPress={() => onPress(product)} style={[styles.hCard, { width: cardWidth }]}>
      <View style={styles.hCardImageWrap}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.hCardImage} resizeMode="cover" />
        ) : (
          <View style={styles.hCardImagePlaceholder}>
            <Ionicons name="tennisball-outline" size={32} color="#333" />
          </View>
        )}
        {discount ? (
          <View style={styles.hCardDiscountBadge}>
            <Text style={styles.hCardDiscountText}>-{discount}%</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.hCardBody}>
        <Text style={styles.hCardBrand}>HEAD</Text>
        <Text style={styles.hCardName} numberOfLines={2}>{product.name}</Text>
        <View style={styles.hCardPriceRow}>
          <Text style={styles.hCardPrice}>{formatPrice(product.price, product.currency)}</Text>
          {product.compareAtPrice ? (
            <Text style={styles.hCardCompare}>{formatPrice(product.compareAtPrice, product.currency)}</Text>
          ) : null}
        </View>
      </View>
      <Pressable
        onPress={(e) => { e.stopPropagation?.(); onAddToBag(product); }}
        style={styles.hCardAddBtn}
      >
        <Ionicons name="add" size={18} color={Backgrounds.root} />
      </Pressable>
    </Pressable>
  );
}

function ServiceHCard({ service, onPress }: { service: ShopService; onPress: (s: ShopService) => void }) {
  const cardWidth = SCREEN_WIDTH * 0.55;
  return (
    <Pressable onPress={() => onPress(service)} style={[styles.serviceHCard, { width: cardWidth }]}>
      <View style={styles.serviceHIcon}>
        <Ionicons name={(service.iconName as any) || "build"} size={22} color={Colors.dark.accentText} />
      </View>
      <Text style={styles.serviceHName} numberOfLines={2}>{service.name}</Text>
      {service.shortDescription ? (
        <Text style={styles.serviceHDesc} numberOfLines={1}>{service.shortDescription}</Text>
      ) : null}
      <View style={styles.serviceHFooter}>
        <Text style={styles.serviceHPrice}>{formatPrice(service.price, service.currency)}</Text>
        <View style={styles.serviceHBookBtn}>
          <Text style={styles.serviceHBookText}>Book</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { itemCount, addItem } = useCart();
  const track = useTrackFeature();

  useFocusEffect(useCallback(() => { track("screen:shop"); }, [track]));
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const { data: shopData, isLoading, refetch } = useQuery<ShopData>({
    queryKey: ["/api/player/shop"],
  });

  const { data: xpDiscount } = useQuery<XPDiscount>({
    queryKey: ["/api/player/shop/xp-discount"],
  });

  const { data: servicesData } = useQuery<{ categories: { id: string; name: string; services: ShopService[] }[]; uncategorized: ShopService[] }>({
    queryKey: ["/api/player/shop/services"],
  });

  const allServices: ShopService[] = servicesData
    ? [
        ...(servicesData.categories?.flatMap((cat) => cat.services) ?? []),
        ...(servicesData.uncategorized ?? []),
      ]
    : shopData?.featuredServices || [];

  const newArrivals: ShopProduct[] = shopData?.newArrivals || [];
  const onSale: ShopProduct[] = shopData?.onSale || [];
  const categories: ShopCategory[] = shopData?.categories || [];

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const response = await apiFetch(`/api/player/shop/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleCategoryPress = (category: ShopCategory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ShopCategory", { categoryId: category.id, categoryName: category.name });
  };

  const handleProductPress = (product: ShopProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ProductDetail", { productId: product.id });
  };

  const handleServicePress = (service: ShopService) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ServiceDetail", { serviceId: service.id });
  };

  const handleCartPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("Cart");
  };

  const handleAddToBag = (product: ShopProduct) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addItem({
      productId: product.id,
      name: product.name,
      price: parseFloat(product.price),
      quantity: 1,
      imageUrl: product.imageUrl,
      type: "product",
    });
  };

  const handleCollectionPress = (collection: typeof HEAD_COLLECTIONS[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ShopCategory", { categoryId: undefined, categoryName: collection.name, collection: collection.name });
  };

  const showSearchResults = searchQuery.length >= 2 && searchResults;

  return (
    <LockedScreen featureKey="academy_shop">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingPulse}>
              <Text style={styles.headLogoText}>HEAD</Text>
            </View>
            <Text style={styles.loadingText}>Loading the HEAD store...</Text>
          </View>
        ) : (
          <>
            <View style={styles.topBar}>
              <Pressable onPress={() => navigation.goBack()} style={styles.topBarButton}>
                <Ionicons name="arrow-back" size={22} color={TextColors.primary} />
              </Pressable>
              <View style={styles.topBarCenter}>
                <Text style={styles.topBarBrand}>HEAD</Text>
                <Text style={styles.topBarTitle}>OFFICIAL STORE</Text>
              </View>
              <Pressable onPress={handleCartPress} style={styles.topBarButton}>
                <Ionicons name="bag-outline" size={22} color={TextColors.primary} />
                {itemCount > 0 ? (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>{itemCount > 9 ? "9+" : itemCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={HEAD_ORANGE} />
              }
              keyboardShouldPersistTaps="handled"
            >
              <Animated.View entering={FadeIn.duration(500)}>
                <LinearGradient
                  colors={[HEAD_BLACK, "#1A0A00", "#0D0D0D"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroBanner}
                >
                  <View style={styles.heroBannerInner}>
                    <View style={styles.heroLeft}>
                      <Text style={styles.heroLabel}>EXCLUSIVE PARTNER</Text>
                      <Text style={styles.heroTitle}>Official{"\n"}HEAD Store</Text>
                      <Text style={styles.heroSubtitle}>Premium tennis equipment for elite players</Text>
                      {xpDiscount && xpDiscount.discountPercent > 0 ? (
                        <View style={styles.heroXpBadge}>
                          <Ionicons name="flash" size={13} color="#FFD700" />
                          <Text style={styles.heroXpText}>{xpDiscount.discountPercent}% XP Discount Active</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.heroRight}>
                      <Text style={styles.headLogo}>HEAD</Text>
                      <View style={styles.headOrangeBar} />
                    </View>
                  </View>
                </LinearGradient>
              </Animated.View>

              <PendingUpsellsBanner />

              <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.searchSection}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={18} color="#666" />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={handleSearch}
                    placeholder="Search HEAD gear, rackets, strings..."
                    placeholderTextColor="#555"
                  />
                  {searchQuery.length > 0 ? (
                    <Pressable onPress={() => { setSearchQuery(""); setSearchResults(null); }}>
                      <Ionicons name="close-circle" size={18} color="#666" />
                    </Pressable>
                  ) : null}
                </View>
              </Animated.View>

              {showSearchResults ? (
                <Animated.View entering={FadeIn.duration(300)}>
                  <Text style={styles.sectionTitle}>Results</Text>
                  {isSearching ? (
                    <View style={styles.centerPad}>
                      <ActivityIndicator color={HEAD_ORANGE} />
                    </View>
                  ) : (
                    <>
                      {searchResults.products.length === 0 && searchResults.services.length === 0 ? (
                        <View style={styles.centerPad}>
                          <Ionicons name="search-outline" size={40} color="#333" />
                          <Text style={styles.emptyText}>No results for &quot;{searchQuery}&quot;</Text>
                        </View>
                      ) : (
                        <>
                          {searchResults.services.length > 0 ? (
                            <>
                              <Text style={styles.subsectionLabel}>Services</Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                                {searchResults.services.map((s) => (
                                  <ServiceHCard key={s.id} service={s} onPress={handleServicePress} />
                                ))}
                              </ScrollView>
                            </>
                          ) : null}
                          {searchResults.products.length > 0 ? (
                            <>
                              <Text style={styles.subsectionLabel}>Products</Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                                {searchResults.products.map((p) => (
                                  <ProductHCard key={p.id} product={p} onPress={handleProductPress} onAddToBag={handleAddToBag} />
                                ))}
                              </ScrollView>
                            </>
                          ) : null}
                        </>
                      )}
                    </>
                  )}
                </Animated.View>
              ) : (
                <>
                  {categories.length > 0 ? (
                    <Animated.View entering={FadeInUp.delay(150).duration(400)}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryRow}
                      >
                        {categories.map((cat, i) => (
                          <Animated.View key={cat.id} entering={FadeInRight.delay(150 + i * 60).duration(300)}>
                            <Pressable
                              onPress={() => handleCategoryPress(cat)}
                              style={styles.categoryChip}
                            >
                              <Ionicons
                                name={(CATEGORY_ICONS[cat.slug] || cat.iconName || "pricetag") as any}
                                size={15}
                                color={HEAD_ORANGE}
                              />
                              <Text style={styles.categoryChipText}>{cat.name}</Text>
                            </Pressable>
                          </Animated.View>
                        ))}
                      </ScrollView>
                    </Animated.View>
                  ) : null}

                  <Animated.View entering={FadeInUp.delay(200).duration(400)}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>HEAD Collections</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                      {HEAD_COLLECTIONS.map((col, i) => (
                        <Animated.View key={col.name} entering={FadeInRight.delay(200 + i * 60).duration(300)}>
                          <Pressable onPress={() => handleCollectionPress(col)} style={styles.collectionCard}>
                            <LinearGradient
                              colors={[col.color + "30", HEAD_DARK]}
                              style={styles.collectionGradient}
                            >
                              <View style={[styles.collectionIconWrap, { backgroundColor: col.color + "25" }]}>
                                <Ionicons name={col.icon as any} size={24} color={col.color} />
                              </View>
                              <Text style={styles.collectionName}>{col.name}</Text>
                              <Text style={styles.collectionSub}>HEAD {col.name}</Text>
                            </LinearGradient>
                          </Pressable>
                        </Animated.View>
                      ))}
                    </ScrollView>
                  </Animated.View>

                  {newArrivals.length > 0 ? (
                    <Animated.View entering={FadeInUp.delay(280).duration(400)}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>New Arrivals</Text>
                        <View style={styles.newBadge}>
                          <Text style={styles.newBadgeText}>NEW</Text>
                        </View>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                        {newArrivals.map((p, i) => (
                          <Animated.View key={p.id} entering={FadeInRight.delay(280 + i * 50).duration(300)}>
                            <ProductHCard product={p} onPress={handleProductPress} onAddToBag={handleAddToBag} />
                          </Animated.View>
                        ))}
                      </ScrollView>
                    </Animated.View>
                  ) : null}

                  {onSale.length > 0 ? (
                    <Animated.View entering={FadeInUp.delay(360).duration(400)}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>On Sale</Text>
                        <View style={styles.saleBadge}>
                          <Text style={styles.saleBadgeText}>SALE</Text>
                        </View>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                        {onSale.map((p, i) => (
                          <Animated.View key={p.id} entering={FadeInRight.delay(360 + i * 50).duration(300)}>
                            <ProductHCard product={p} onPress={handleProductPress} onAddToBag={handleAddToBag} />
                          </Animated.View>
                        ))}
                      </ScrollView>
                    </Animated.View>
                  ) : null}

                  {allServices.length > 0 ? (
                    <Animated.View entering={FadeInUp.delay(440).duration(400)}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Pro Services</Text>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                        {allServices.map((s, i) => (
                          <Animated.View key={s.id} entering={FadeInRight.delay(440 + i * 60).duration(300)}>
                            <ServiceHCard service={s} onPress={handleServicePress} />
                          </Animated.View>
                        ))}
                      </ScrollView>
                    </Animated.View>
                  ) : null}

                  <Animated.View entering={FadeInUp.delay(520).duration(400)}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Community</Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        navigation.navigate("Marketplace");
                      }}
                      style={styles.marketplaceCard}
                    >
                      <LinearGradient
                        colors={["#0D1F0D", "#111811"]}
                        style={styles.marketplaceGradient}
                      >
                        <View style={styles.marketplaceIconWrap}>
                          <Ionicons name="storefront-outline" size={28} color="#2ECC71" />
                        </View>
                        <View style={styles.marketplaceInfo}>
                          <Text style={styles.marketplaceTitle}>Community Marketplace</Text>
                          <Text style={styles.marketplaceSub}>Buy & sell used gear from players</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#2ECC71" />
                      </LinearGradient>
                    </Pressable>
                  </Animated.View>

                  {newArrivals.length === 0 && onSale.length === 0 && allServices.length === 0 && categories.length === 0 ? (
                    <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.emptyState}>
                      <Text style={styles.headLogo}>HEAD</Text>
                      <Text style={styles.emptyTitle}>Coming Soon</Text>
                      <Text style={styles.emptyText}>Premium HEAD gear and pro services will be available here shortly.</Text>
                    </Animated.View>
                  ) : null}
                </>
              )}
            </ScrollView>
          </>
        )}
      </View>
    </LockedScreen>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: HEAD_BLACK,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {},

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingPulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: HEAD_ORANGE + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  headLogoText: {
    fontSize: 18,
    fontWeight: "900",
    color: HEAD_ORANGE,
    letterSpacing: 3,
  },
  loadingText: {
    color: "#666",
    fontSize: 14,
    letterSpacing: 0.5,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: HEAD_BLACK,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A1A",
  },
  topBarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarCenter: {
    alignItems: "center",
  },
  topBarBrand: {
    fontSize: 18,
    fontWeight: "900",
    color: HEAD_ORANGE,
    letterSpacing: 4,
    lineHeight: 20,
  },
  topBarTitle: {
    fontSize: 9,
    fontWeight: "600",
    color: "#888",
    letterSpacing: 2,
  },
  cartBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: HEAD_ORANGE,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: TextColors.primary,
  },

  heroBanner: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 20,
    overflow: "hidden",
    minHeight: 170,
  },
  heroBannerInner: {
    flexDirection: "row",
    padding: 22,
    alignItems: "center",
  },
  heroLeft: {
    flex: 1,
    gap: 5,
  },
  heroLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: HEAD_ORANGE,
    letterSpacing: 2.5,
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: TextColors.primary,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 12,
    color: "#888",
    lineHeight: 17,
    marginTop: 2,
  },
  heroXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFD70015",
    borderWidth: 1,
    borderColor: "#FFD70030",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  heroXpText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFD700",
  },
  heroRight: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingLeft: 12,
  },
  headLogo: {
    fontSize: 26,
    fontWeight: "900",
    color: HEAD_ORANGE,
    letterSpacing: 4,
  },
  headOrangeBar: {
    width: 40,
    height: 4,
    backgroundColor: HEAD_ORANGE,
    borderRadius: 2,
  },

  searchSection: {
    paddingHorizontal: 16,
    marginTop: 14,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: "#222",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: TextColors.primary,
  },

  categoryRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 8,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#CCC",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 26,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: TextColors.primary,
    letterSpacing: -0.3,
  },
  newBadge: {
    backgroundColor: GlowColors.primary + "20",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.dark.accentText,
    letterSpacing: 1,
  },
  saleBadge: {
    backgroundColor: "#FF3B3020",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  saleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FF3B30",
    letterSpacing: 1,
  },

  hScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },

  hCard: {
    backgroundColor: HEAD_DARK,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  hCardImageWrap: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#1A1A1A",
    position: "relative",
  },
  hCardImage: {
    width: "100%",
    height: "100%",
  },
  hCardImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  hCardDiscountBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#FF3B30",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  hCardDiscountText: {
    fontSize: 10,
    fontWeight: "800",
    color: TextColors.primary,
  },
  hCardBody: {
    padding: 10,
    paddingBottom: 36,
  },
  hCardBrand: {
    fontSize: 9,
    fontWeight: "800",
    color: "#2ECC71",
    letterSpacing: 2,
    marginBottom: 3,
  },
  hCardName: {
    fontSize: 13,
    fontWeight: "700",
    color: TextColors.primary,
    lineHeight: 17,
    marginBottom: 5,
  },
  hCardPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  hCardPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: HEAD_ORANGE,
  },
  hCardCompare: {
    fontSize: 11,
    color: "#555",
    textDecorationLine: "line-through",
  },
  hCardAddBtn: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: HEAD_ORANGE,
    alignItems: "center",
    justifyContent: "center",
  },

  collectionCard: {
    width: 120,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  collectionGradient: {
    padding: 14,
    gap: 8,
    minHeight: 130,
  },
  collectionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  collectionName: {
    fontSize: 16,
    fontWeight: "900",
    color: TextColors.primary,
    letterSpacing: -0.3,
  },
  collectionSub: {
    fontSize: 10,
    color: "#888",
    fontWeight: "600",
  },

  serviceHCard: {
    backgroundColor: HEAD_DARK,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    minHeight: 140,
  },
  serviceHIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: GlowColors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  serviceHName: {
    fontSize: 14,
    fontWeight: "700",
    color: TextColors.primary,
    lineHeight: 18,
  },
  serviceHDesc: {
    fontSize: 11,
    color: "#666",
  },
  serviceHFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "auto",
  },
  serviceHPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.accentText,
  },
  serviceHBookBtn: {
    backgroundColor: GlowColors.primary + "20",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  serviceHBookText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.accentText,
  },

  subsectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 10,
  },

  centerPad: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: TextColors.primary,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },

  marketplaceCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2ECC7130",
  },
  marketplaceGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    gap: 14,
  },
  marketplaceIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: "#2ECC7115",
    alignItems: "center",
    justifyContent: "center",
  },
  marketplaceInfo: {
    flex: 1,
    gap: 4,
  },
  marketplaceTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: TextColors.primary,
    letterSpacing: -0.2,
  },
  marketplaceSub: {
    fontSize: 12,
    color: "#666",
    lineHeight: 16,
  },
}));
