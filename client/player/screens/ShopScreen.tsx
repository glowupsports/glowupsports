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
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInUp, FadeInRight } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, GlowColors } from "@/constants/theme";
import { useCart } from "../contexts/CartContext";
import { LockedScreen } from "../components/LockedScreen";
import { getApiUrl } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PRODUCT_CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - 12) / 2;

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
}

interface XPDiscount {
  discountPercent: number;
  tierName: string;
  currentXP: number;
  nextTierXP: number | null;
  level: number;
}

interface SearchResults {
  products: ShopProduct[];
  services: ShopService[];
}

const CATEGORY_ICONS: Record<string, string> = {
  rackets: "tennisball",
  shoes: "footsteps",
  gear: "briefcase",
  strings: "construct",
  services: "build",
};

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { itemCount, addItem } = useCart();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: shopData, isLoading, refetch } = useQuery<ShopData>({
    queryKey: ["/api/player/shop"],
  });

  const { data: xpDiscount } = useQuery<XPDiscount>({
    queryKey: ["/api/player/shop/xp-discount"],
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const formatPrice = (price: string, currency: string = "AED") => {
    const num = parseFloat(price);
    if (num >= 1000) {
      return `${currency} ${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return `${currency} ${num.toFixed(0)}`;
  };

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/player/shop/search?q=${encodeURIComponent(query)}`,
        { credentials: "include" }
      );
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
    if (activeCategory === category.slug) {
      setActiveCategory(null);
    } else {
      setActiveCategory(category.slug);
      navigation.navigate("ShopCategory", { categoryId: category.id, categoryName: category.name });
    }
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

  const categories = shopData?.categories || [];
  const featuredProducts = shopData?.featuredProducts || [];
  const featuredServices = shopData?.featuredServices || [];
  const hasContent = categories.length > 0 || featuredProducts.length > 0 || featuredServices.length > 0;
  const showSearchResults = searchQuery.length >= 2 && searchResults;

  const getDiscount = (price: string, compareAt?: string) => {
    if (!compareAt) return null;
    const p = parseFloat(price);
    const c = parseFloat(compareAt);
    if (c <= p) return null;
    return Math.round(((c - p) / c) * 100);
  };

  const getCategoryIcon = (slug: string, iconName: string) => {
    return CATEGORY_ICONS[slug] || iconName || "pricetag";
  };

  return (
    <LockedScreen featureKey="academy_shop">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingPulse}>
              <Ionicons name="tennisball" size={36} color={GlowColors.primary} />
            </View>
            <Text style={styles.loadingText}>Loading your pro shop...</Text>
          </View>
        ) : (
          <>
            <View style={styles.topBar}>
              <Pressable onPress={() => navigation.goBack()} style={styles.topBarButton}>
                <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
              </Pressable>
              <View style={styles.topBarCenter}>
                <Ionicons name="tennisball" size={16} color={GlowColors.primary} />
                <Text style={styles.topBarTitle}>GLOW MARKET</Text>
              </View>
              <Pressable onPress={handleCartPress} style={styles.topBarButton}>
                <Ionicons name="bag-outline" size={22} color="#FFFFFF" />
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
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GlowColors.primary} />
              }
              keyboardShouldPersistTaps="handled"
            >
              <Animated.View entering={FadeIn.duration(500)}>
                <LinearGradient
                  colors={["#1A2E0A", "#0D1B0A", Colors.dark.backgroundDefault]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroBanner}
                >
                  <View style={styles.heroContent}>
                    <Text style={styles.heroLabel}>EXCLUSIVE TENNIS GEAR</Text>
                    <Text style={styles.heroTitle}>Glow Up Your{"\n"}Tennis Gear!</Text>
                    <Text style={styles.heroSubtitle}>Premium equipment & services from your academy</Text>
                  </View>
                  <View style={styles.heroAccent}>
                    <Ionicons name="tennisball" size={120} color={GlowColors.primary + "08"} />
                  </View>
                </LinearGradient>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.searchSection}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={18} color="#666" />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={handleSearch}
                    placeholder="Search gear, shoes, services..."
                    placeholderTextColor="#555"
                  />
                  {searchQuery.length > 0 ? (
                    <Pressable onPress={() => { setSearchQuery(""); setSearchResults(null); }}>
                      <Ionicons name="close-circle" size={18} color="#666" />
                    </Pressable>
                  ) : null}
                </View>
              </Animated.View>

              {xpDiscount && xpDiscount.discountPercent > 0 ? (
                <Animated.View entering={FadeInUp.delay(150).duration(400)} style={styles.xpSection}>
                  <LinearGradient
                    colors={["#2A1F00", "#1A1400", Colors.dark.backgroundDefault]}
                    style={styles.xpCard}
                  >
                    <View style={styles.xpIconWrap}>
                      <Ionicons name="flash" size={22} color="#FFD700" />
                    </View>
                    <View style={styles.xpInfo}>
                      <Text style={styles.xpTier}>{xpDiscount.tierName} Member</Text>
                      <Text style={styles.xpDesc}>Your XP discount is applied automatically</Text>
                    </View>
                    <View style={styles.xpBadge}>
                      <Text style={styles.xpBadgeText}>{xpDiscount.discountPercent}%</Text>
                      <Text style={styles.xpBadgeLabel}>OFF</Text>
                    </View>
                  </LinearGradient>
                </Animated.View>
              ) : null}

              {showSearchResults ? (
                <Animated.View entering={FadeIn.duration(300)}>
                  <Text style={styles.sectionTitle}>Results</Text>
                  {isSearching ? (
                    <View style={styles.searchingContainer}>
                      <Text style={styles.searchingText}>Searching...</Text>
                    </View>
                  ) : (
                    <>
                      {searchResults.products.length === 0 && searchResults.services.length === 0 ? (
                        <View style={styles.noResults}>
                          <Ionicons name="search-outline" size={40} color="#333" />
                          <Text style={styles.noResultsText}>No results for "{searchQuery}"</Text>
                        </View>
                      ) : (
                        <>
                          {searchResults.services.length > 0 ? (
                            <>
                              <Text style={styles.subsectionTitle}>Services</Text>
                              {searchResults.services.map((service) => (
                                <ServiceCard key={service.id} service={service} onPress={handleServicePress} formatPrice={formatPrice} />
                              ))}
                            </>
                          ) : null}
                          {searchResults.products.length > 0 ? (
                            <>
                              <Text style={styles.subsectionTitle}>Products</Text>
                              <View style={styles.productsGrid}>
                                {searchResults.products.map((product) => (
                                  <ProductCard
                                    key={product.id}
                                    product={product}
                                    onPress={handleProductPress}
                                    onAddToBag={handleAddToBag}
                                    formatPrice={formatPrice}
                                    getDiscount={getDiscount}
                                  />
                                ))}
                              </View>
                            </>
                          ) : null}
                        </>
                      )}
                    </>
                  )}
                </Animated.View>
              ) : !hasContent ? (
                <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.emptyState}>
                  <Ionicons name="tennisball-outline" size={56} color="#333" />
                  <Text style={styles.emptyTitle}>Coming Soon</Text>
                  <Text style={styles.emptyText}>Premium gear and services will be available here shortly.</Text>
                </Animated.View>
              ) : (
                <>
                  {categories.length > 0 ? (
                    <Animated.View entering={FadeInUp.delay(200).duration(400)}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryRow}
                      >
                        {categories.map((cat, i) => {
                          const isActive = activeCategory === cat.slug;
                          return (
                            <Animated.View key={cat.id} entering={FadeInRight.delay(200 + i * 60).duration(350)}>
                              <Pressable
                                onPress={() => handleCategoryPress(cat)}
                                style={[styles.categoryPill, isActive && styles.categoryPillActive]}
                              >
                                <Ionicons
                                  name={getCategoryIcon(cat.slug, cat.iconName) as any}
                                  size={16}
                                  color={isActive ? "#0A0A0A" : "#AAA"}
                                />
                                <Text style={[styles.categoryPillText, isActive && styles.categoryPillTextActive]}>
                                  {cat.name}
                                </Text>
                              </Pressable>
                            </Animated.View>
                          );
                        })}
                      </ScrollView>
                    </Animated.View>
                  ) : null}

                  {featuredServices.length > 0 ? (
                    <Animated.View entering={FadeInUp.delay(300).duration(400)}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Pro Services</Text>
                      </View>
                      {featuredServices.map((service, i) => (
                        <Animated.View key={service.id} entering={FadeInUp.delay(350 + i * 60).duration(400)}>
                          <ServiceCard service={service} onPress={handleServicePress} formatPrice={formatPrice} />
                        </Animated.View>
                      ))}
                    </Animated.View>
                  ) : null}

                  {featuredProducts.length > 0 ? (
                    <Animated.View entering={FadeInUp.delay(400).duration(400)}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Featured Gear</Text>
                        <Pressable style={styles.seeAllButton}>
                          <Text style={styles.seeAllText}>See All</Text>
                          <Ionicons name="arrow-forward" size={14} color={GlowColors.primary} />
                        </Pressable>
                      </View>
                      <View style={styles.productsGrid}>
                        {featuredProducts.map((product, index) => (
                          <Animated.View key={product.id} entering={FadeInUp.delay(450 + index * 60).duration(400)}>
                            <ProductCard
                              product={product}
                              onPress={handleProductPress}
                              onAddToBag={handleAddToBag}
                              formatPrice={formatPrice}
                              getDiscount={getDiscount}
                            />
                          </Animated.View>
                        ))}
                      </View>
                    </Animated.View>
                  ) : null}

                  <Animated.View entering={FadeInUp.delay(550).duration(400)}>
                    <Pressable onPress={() => navigation.navigate("Marketplace")} style={styles.marketplaceCard}>
                      <LinearGradient
                        colors={["#0A1A2A", "#0D1520", Colors.dark.backgroundDefault]}
                        style={styles.marketplaceGradient}
                      >
                        <View style={styles.marketplaceTop}>
                          <View style={styles.marketplaceIconWrap}>
                            <Ionicons name="people" size={22} color="#00D9FF" />
                          </View>
                          <View style={styles.marketplaceNewBadge}>
                            <Text style={styles.marketplaceNewText}>NEW</Text>
                          </View>
                        </View>
                        <Text style={styles.marketplaceTitle}>Community Marketplace</Text>
                        <Text style={styles.marketplaceDesc}>Buy & sell pre-owned gear from fellow players</Text>
                        <View style={styles.marketplaceFeatures}>
                          <View style={styles.marketplaceFeature}>
                            <Ionicons name="swap-horizontal" size={16} color="#00D9FF" />
                            <Text style={styles.marketplaceFeatureText}>Trade</Text>
                          </View>
                          <View style={styles.marketplaceFeature}>
                            <Ionicons name="shield-checkmark" size={16} color="#00D9FF" />
                            <Text style={styles.marketplaceFeatureText}>Verified</Text>
                          </View>
                          <View style={styles.marketplaceFeature}>
                            <Ionicons name="cash" size={16} color="#00D9FF" />
                            <Text style={styles.marketplaceFeatureText}>Great Deals</Text>
                          </View>
                        </View>
                      </LinearGradient>
                    </Pressable>
                  </Animated.View>
                </>
              )}
            </ScrollView>
          </>
        )}
      </View>
    </LockedScreen>
  );
}

function ServiceCard({
  service,
  onPress,
  formatPrice,
}: {
  service: ShopService;
  onPress: (s: ShopService) => void;
  formatPrice: (price: string, currency?: string) => string;
}) {
  return (
    <Pressable onPress={() => onPress(service)} style={styles.serviceCard}>
      <View style={styles.serviceLeft}>
        <View style={styles.serviceIcon}>
          <Ionicons name={(service.iconName as any) || "build"} size={20} color={GlowColors.primary} />
        </View>
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceName}>{service.name}</Text>
          {service.shortDescription ? (
            <Text style={styles.serviceDesc} numberOfLines={1}>{service.shortDescription}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.serviceRight}>
        <Text style={styles.servicePrice}>{formatPrice(service.price, service.currency)}</Text>
        {service.durationMinutes ? (
          <Text style={styles.serviceDuration}>{service.durationMinutes} min</Text>
        ) : null}
        <View style={styles.bookButton}>
          <Text style={styles.bookButtonText}>Book</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ProductCard({
  product,
  onPress,
  onAddToBag,
  formatPrice,
  getDiscount,
}: {
  product: ShopProduct;
  onPress: (p: ShopProduct) => void;
  onAddToBag: (p: ShopProduct) => void;
  formatPrice: (price: string, currency?: string) => string;
  getDiscount: (price: string, compareAt?: string) => number | null;
}) {
  const discount = getDiscount(product.price, product.compareAtPrice);

  return (
    <Pressable onPress={() => onPress(product)} style={styles.productCard}>
      <View style={styles.productImageWrap}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="cover" />
        ) : (
          <View style={styles.productImagePlaceholder}>
            <Ionicons name="tennisball-outline" size={32} color="#333" />
          </View>
        )}
        {discount ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discount}%</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.productDetails}>
        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
        {product.shortDescription ? (
          <Text style={styles.productDesc} numberOfLines={1}>{product.shortDescription}</Text>
        ) : null}
        <View style={styles.productPriceRow}>
          <Text style={styles.productPrice}>{formatPrice(product.price, product.currency)}</Text>
          {product.compareAtPrice ? (
            <Text style={styles.productComparePrice}>{formatPrice(product.compareAtPrice, product.currency)}</Text>
          ) : null}
        </View>
      </View>
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onAddToBag(product);
        }}
        style={styles.addToBagButton}
      >
        <Ionicons name="add" size={18} color="#0A0A0A" />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingPulse: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: GlowColors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: "#0A0A0A",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topBarTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 2,
  },
  cartBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: GlowColors.primary,
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
    color: "#0A0A0A",
  },

  heroBanner: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 24,
    minHeight: 160,
    overflow: "hidden",
    position: "relative",
  },
  heroContent: {
    zIndex: 1,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 2,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    lineHeight: 36,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 13,
    color: "#888",
    lineHeight: 18,
  },
  heroAccent: {
    position: "absolute",
    right: -20,
    bottom: -20,
    opacity: 1,
  },

  searchSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#FFFFFF",
  },

  xpSection: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  xpCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  xpIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFD70015",
    alignItems: "center",
    justifyContent: "center",
  },
  xpInfo: {
    flex: 1,
  },
  xpTier: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFD700",
  },
  xpDesc: {
    fontSize: 11,
    color: "#888",
    marginTop: 2,
  },
  xpBadge: {
    alignItems: "center",
    backgroundColor: "#FFD70018",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  xpBadgeText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFD700",
  },
  xpBadgeLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFD70099",
    letterSpacing: 1,
  },

  categoryRow: {
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 16,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#141414",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  categoryPillActive: {
    backgroundColor: GlowColors.primary,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#AAA",
  },
  categoryPillTextActive: {
    color: "#0A0A0A",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 28,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },

  serviceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#141414",
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  serviceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  serviceIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: GlowColors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  serviceDesc: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  serviceRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  servicePrice: {
    fontSize: 15,
    fontWeight: "800",
    color: GlowColors.primary,
  },
  serviceDuration: {
    fontSize: 11,
    color: "#666",
  },
  bookButton: {
    backgroundColor: GlowColors.primary + "20",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginTop: 2,
  },
  bookButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: GlowColors.primary,
  },

  productsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
  },
  productCard: {
    width: PRODUCT_CARD_WIDTH,
    backgroundColor: "#141414",
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  productImageWrap: {
    width: "100%",
    height: PRODUCT_CARD_WIDTH,
    backgroundColor: "#1A1A1A",
    position: "relative",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  productImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A1A",
  },
  discountBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#FF3B30",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  discountText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  productDetails: {
    padding: 12,
    paddingBottom: 14,
  },
  productName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    lineHeight: 18,
    marginBottom: 3,
  },
  productDesc: {
    fontSize: 11,
    color: "#666",
    marginBottom: 6,
  },
  productPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: "800",
    color: GlowColors.primary,
  },
  productComparePrice: {
    fontSize: 12,
    color: "#555",
    textDecorationLine: "line-through",
  },
  addToBagButton: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GlowColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  marketplaceCard: {
    marginHorizontal: 16,
    marginTop: 28,
    borderRadius: 18,
    overflow: "hidden",
  },
  marketplaceGradient: {
    padding: 20,
  },
  marketplaceTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  marketplaceIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#00D9FF15",
    alignItems: "center",
    justifyContent: "center",
  },
  marketplaceNewBadge: {
    backgroundColor: "#00D9FF20",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  marketplaceNewText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#00D9FF",
    letterSpacing: 1.5,
  },
  marketplaceTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  marketplaceDesc: {
    fontSize: 13,
    color: "#777",
    lineHeight: 18,
    marginBottom: 16,
  },
  marketplaceFeatures: {
    flexDirection: "row",
    gap: 20,
  },
  marketplaceFeature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  marketplaceFeatureText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#AAA",
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
    color: "#FFFFFF",
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  noResults: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  noResultsText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  searchingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  searchingText: {
    fontSize: 14,
    color: "#666",
  },
});
