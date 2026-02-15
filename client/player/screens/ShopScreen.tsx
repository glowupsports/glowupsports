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
  FlatList,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, GlowColors } from "@/constants/theme";
import { useCart } from "../contexts/CartContext";
import { LockedScreen } from "../components/LockedScreen";
import { getApiUrl } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 3) / 2;

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

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { itemCount } = useCart();
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

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const formatPrice = (price: string, currency: string = "AED") => {
    return `${currency} ${parseFloat(price).toFixed(0)}`;
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

  const getSellerBadge = (type?: string) => {
    switch (type) {
      case "official":
        return { icon: "shield-checkmark", color: Colors.dark.primary, label: "Official" };
      case "pro":
        return { icon: "star", color: Colors.dark.gold, label: "Pro" };
      default:
        return { icon: "business", color: Colors.dark.xpCyan, label: "Academy" };
    }
  };

  const categories = shopData?.categories || [];
  const featuredProducts = shopData?.featuredProducts || [];
  const featuredServices = shopData?.featuredServices || [];
  const hasContent = categories.length > 0 || featuredProducts.length > 0 || featuredServices.length > 0;
  const showSearchResults = searchQuery.length >= 2 && searchResults;

  return (
    <LockedScreen featureKey="academy_shop">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="storefront" size={48} color={Colors.dark.primary} />
            <Text style={styles.loadingText}>Loading Glow Market...</Text>
          </View>
        ) : (
          <>
            <View style={styles.fixedHeader}>
              <View style={styles.headerTitleRow}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
                  <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
                </Pressable>
                <Text style={styles.headerTitle}>Glow Market</Text>
                <View style={styles.headerActions}>
                  <Pressable onPress={() => navigation.navigate("Marketplace")} style={styles.marketplaceButton}>
                    <Ionicons name="storefront-outline" size={22} color={Colors.dark.xpCyan} />
                  </Pressable>
                  <Pressable onPress={handleCartPress} style={styles.cartButton}>
                    <Ionicons name="bag-outline" size={24} color={Colors.dark.text} />
                    {itemCount > 0 && (
                      <View style={styles.cartBadge}>
                        <Text style={styles.cartBadgeText}>{itemCount > 9 ? "9+" : itemCount}</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={Colors.dark.primary}
                />
              }
              keyboardShouldPersistTaps="handled"
            >
              <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
                <Text style={styles.headerSubtitle}>Premium gear & services for champions</Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(50).duration(400)} style={styles.searchContainer}>
                <View style={styles.searchInputContainer}>
                  <Ionicons name="search" size={20} color={Colors.dark.textSecondary} />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={handleSearch}
                    placeholder="Search products & services..."
                    placeholderTextColor={Colors.dark.textSecondary + "80"}
                  />
                  {searchQuery.length > 0 && (
                    <Pressable onPress={() => { setSearchQuery(""); setSearchResults(null); }}>
                      <Ionicons name="close-circle" size={20} color={Colors.dark.textSecondary} />
                    </Pressable>
                  )}
                </View>
              </Animated.View>

              {xpDiscount && xpDiscount.discountPercent > 0 && (
                <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.xpDiscountBanner}>
                  <LinearGradient
                    colors={[Colors.dark.gold + "20", Colors.dark.backgroundSecondary]}
                    style={styles.xpDiscountGradient}
                  >
                    <Ionicons name="flash" size={20} color={Colors.dark.gold} />
                    <View style={styles.xpDiscountContent}>
                      <Text style={styles.xpDiscountTitle}>
                        {xpDiscount.tierName} Member - {xpDiscount.discountPercent}% Off
                      </Text>
                      <Text style={styles.xpDiscountText}>
                        XP discount applied to all purchases!
                      </Text>
                    </View>
                  </LinearGradient>
                </Animated.View>
              )}

              <Animated.View entering={FadeInUp.delay(150).duration(400)} style={styles.marketplaceBanner}>
                <Pressable onPress={() => navigation.navigate("Marketplace")}>
                  <LinearGradient
                    colors={[Colors.dark.xpCyan + "15", Colors.dark.backgroundSecondary]}
                    style={styles.marketplaceBannerGradient}
                  >
                    <View style={styles.marketplaceBannerIcon}>
                      <Ionicons name="people" size={24} color={Colors.dark.xpCyan} />
                    </View>
                    <View style={styles.marketplaceBannerContent}>
                      <Text style={styles.marketplaceBannerTitle}>Community Marketplace</Text>
                      <Text style={styles.marketplaceBannerText}>Buy & sell used gear from fellow players</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.dark.xpCyan} />
                  </LinearGradient>
                </Pressable>
              </Animated.View>

              {showSearchResults ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <Text style={styles.sectionTitle}>Search Results</Text>
            {isSearching ? (
              <View style={styles.searchingContainer}>
                <Text style={styles.searchingText}>Searching...</Text>
              </View>
            ) : (
              <>
                {searchResults.products.length === 0 && searchResults.services.length === 0 ? (
                  <View style={styles.noResultsContainer}>
                    <Ionicons name="search-outline" size={48} color={Colors.dark.textSecondary + "60"} />
                    <Text style={styles.noResultsText}>No results found for "{searchQuery}"</Text>
                  </View>
                ) : (
                  <>
                    {searchResults.services.length > 0 && (
                      <>
                        <Text style={styles.subSectionTitle}>Services ({searchResults.services.length})</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.servicesContainer}>
                          {searchResults.services.map((service) => (
                            <Pressable key={service.id} onPress={() => handleServicePress(service)} style={styles.serviceCard}>
                              <LinearGradient colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault + "E0"]} style={styles.serviceGradient}>
                                <View style={styles.serviceIconContainer}>
                                  <Ionicons name={(service.iconName as any) || "build"} size={24} color={Colors.dark.xpCyan} />
                                </View>
                                <Text style={styles.serviceName}>{service.name}</Text>
                                <View style={styles.servicePriceRow}>
                                  <Text style={styles.servicePrice}>{formatPrice(service.price, service.currency)}</Text>
                                </View>
                              </LinearGradient>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </>
                    )}
                    {searchResults.products.length > 0 && (
                      <>
                        <Text style={styles.subSectionTitle}>Products ({searchResults.products.length})</Text>
                        <View style={styles.productsGrid}>
                          {searchResults.products.map((product) => {
                            const badge = getSellerBadge(product.sellerType);
                            return (
                              <Pressable key={product.id} onPress={() => handleProductPress(product)} style={styles.productCard}>
                                <LinearGradient colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault]} style={styles.productGradient}>
                                  {product.imageUrl ? (
                                    <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="cover" />
                                  ) : (
                                    <View style={styles.productImagePlaceholder}>
                                      <Ionicons name="tennisball-outline" size={40} color={Colors.dark.primary + "40"} />
                                    </View>
                                  )}
                                  <View style={styles.sellerBadgeSmall}>
                                    <Ionicons name={badge.icon as any} size={10} color={badge.color} />
                                  </View>
                                  <View style={styles.productInfo}>
                                    <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                                    <Text style={styles.productPrice}>{formatPrice(product.price, product.currency)}</Text>
                                  </View>
                                </LinearGradient>
                              </Pressable>
                            );
                          })}
                        </View>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </Animated.View>
        ) : !hasContent ? (
          <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.emptyState}>
            <LinearGradient
              colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault]}
              style={styles.emptyCard}
            >
              <Ionicons name="storefront-outline" size={64} color={Colors.dark.primary + "60"} />
              <Text style={styles.emptyTitle}>Coming Soon</Text>
              <Text style={styles.emptyText}>
                Your academy's shop is being set up. Check back soon for premium gear, services, and exclusive deals!
              </Text>
            </LinearGradient>
          </Animated.View>
        ) : (
          <>
            {categories.length > 0 && (
              <Animated.View entering={FadeInUp.delay(150).duration(400)}>
                <Text style={styles.sectionTitle}>Categories</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoriesContainer}
                >
                  {categories.map((category) => (
                    <Pressable
                      key={category.id}
                      onPress={() => handleCategoryPress(category)}
                      style={styles.categoryCard}
                    >
                      <LinearGradient
                        colors={[
                          category.iconColor + "20",
                          Colors.dark.backgroundSecondary,
                        ]}
                        style={styles.categoryGradient}
                      >
                        <Ionicons
                          name={(category.iconName as any) || "pricetag"}
                          size={28}
                          color={category.iconColor || Colors.dark.primary}
                        />
                        <Text style={styles.categoryName}>{category.name}</Text>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </ScrollView>
              </Animated.View>
            )}

            {featuredServices.length > 0 && (
              <Animated.View entering={FadeInUp.delay(200).duration(400)}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Services</Text>
                  <View style={styles.sectionBadge}>
                    <Ionicons name="flash" size={12} color={Colors.dark.gold} />
                    <Text style={styles.sectionBadgeText}>Book Now</Text>
                  </View>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.servicesContainer}
                >
                  {featuredServices.map((service) => (
                    <Pressable
                      key={service.id}
                      onPress={() => handleServicePress(service)}
                      style={styles.serviceCard}
                    >
                      <LinearGradient
                        colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault + "E0"]}
                        style={styles.serviceGradient}
                      >
                        <View style={styles.serviceIconContainer}>
                          <Ionicons
                            name={(service.iconName as any) || "build"}
                            size={24}
                            color={Colors.dark.xpCyan}
                          />
                        </View>
                        <Text style={styles.serviceName}>{service.name}</Text>
                        {service.shortDescription && (
                          <Text style={styles.serviceDescription} numberOfLines={2}>
                            {service.shortDescription}
                          </Text>
                        )}
                        <View style={styles.servicePriceRow}>
                          <Text style={styles.servicePrice}>{formatPrice(service.price, service.currency)}</Text>
                          {service.durationMinutes && (
                            <Text style={styles.serviceDuration}>{service.durationMinutes} min</Text>
                          )}
                        </View>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </ScrollView>
              </Animated.View>
            )}

            {featuredProducts.length > 0 && (
              <Animated.View entering={FadeInUp.delay(300).duration(400)}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Featured Products</Text>
                  <View style={[styles.sectionBadge, { backgroundColor: Colors.dark.primary + "20" }]}>
                    <Ionicons name="star" size={12} color={Colors.dark.primary} />
                    <Text style={[styles.sectionBadgeText, { color: Colors.dark.primary }]}>Hot</Text>
                  </View>
                </View>
                <View style={styles.productsGrid}>
                  {featuredProducts.map((product, index) => {
                    const badge = getSellerBadge(product.sellerType);
                    return (
                      <Animated.View
                        key={product.id}
                        entering={FadeInUp.delay(350 + index * 50).duration(400)}
                      >
                        <Pressable
                          onPress={() => handleProductPress(product)}
                          style={styles.productCard}
                        >
                          <LinearGradient
                            colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault]}
                            style={styles.productGradient}
                          >
                            {product.imageUrl ? (
                              <Image
                                source={{ uri: product.imageUrl }}
                                style={styles.productImage}
                                resizeMode="cover"
                              />
                            ) : (
                              <View style={styles.productImagePlaceholder}>
                                <Ionicons name="tennisball-outline" size={40} color={Colors.dark.primary + "40"} />
                              </View>
                            )}
                            <View style={styles.sellerBadgeSmall}>
                              <Ionicons name={badge.icon as any} size={10} color={badge.color} />
                            </View>
                            <View style={styles.productInfo}>
                              <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                              <View style={styles.productPriceRow}>
                                <Text style={styles.productPrice}>{formatPrice(product.price, product.currency)}</Text>
                                {product.compareAtPrice && (
                                  <Text style={styles.productComparePrice}>
                                    {formatPrice(product.compareAtPrice, product.currency)}
                                  </Text>
                                )}
                              </View>
                            </View>
                          </LinearGradient>
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>
              </Animated.View>
            )}

            <Animated.View entering={FadeInUp.delay(450).duration(400)} style={styles.marketplaceSection}>
              <LinearGradient
                colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault]}
                style={styles.marketplaceCard}
              >
                <View style={styles.marketplaceBadge}>
                  <Ionicons name="rocket" size={16} color={Colors.dark.xpCyan} />
                  <Text style={styles.marketplaceBadgeText}>COMING SOON</Text>
                </View>
                <Text style={styles.marketplaceTitle}>Player Marketplace</Text>
                <Text style={styles.marketplaceText}>
                  Buy, sell, and trade pre-owned gear with fellow players. List your old rackets, find great deals, and connect with your tennis community.
                </Text>
                <View style={styles.marketplaceFeatures}>
                  <View style={styles.marketplaceFeature}>
                    <Ionicons name="swap-horizontal" size={20} color={Colors.dark.primary} />
                    <Text style={styles.marketplaceFeatureText}>Trade</Text>
                  </View>
                  <View style={styles.marketplaceFeature}>
                    <Ionicons name="shield-checkmark" size={20} color={Colors.dark.primary} />
                    <Text style={styles.marketplaceFeatureText}>Verified</Text>
                  </View>
                  <View style={styles.marketplaceFeature}>
                    <Ionicons name="people" size={20} color={Colors.dark.primary} />
                    <Text style={styles.marketplaceFeatureText}>Community</Text>
                  </View>
                </View>
              </LinearGradient>
            </Animated.View>
                <View style={{ height: insets.bottom + 100 }} />
              </>
            )}
            </ScrollView>
          </>
        )}
      </View>
    </LockedScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
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
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  fixedHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    padding: Spacing.sm,
    marginRight: Spacing.sm,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  marketplaceButton: {
    padding: Spacing.xs,
    backgroundColor: Colors.dark.xpCyan + "20",
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: -0.5,
  },
  cartButton: {
    padding: Spacing.xs,
    position: "relative",
  },
  cartBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.backgroundDefault,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  searchContainer: {
    marginBottom: Spacing.md,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark.text,
  },
  xpDiscountBanner: {
    marginBottom: Spacing.md,
  },
  xpDiscountGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
  },
  xpDiscountContent: {
    flex: 1,
  },
  xpDiscountTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  xpDiscountText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  marketplaceBanner: {
    marginBottom: Spacing.md,
  },
  marketplaceBannerGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  marketplaceBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.dark.xpCyan + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  marketplaceBannerContent: {
    flex: 1,
  },
  marketplaceBannerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  marketplaceBannerText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  searchingContainer: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  searchingText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
  noResultsContainer: {
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  noResultsText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    textAlign: "center",
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  emptyState: {
    marginTop: Spacing.xl,
  },
  emptyCard: {
    borderRadius: 20,
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.gold,
    textTransform: "uppercase",
  },
  categoriesContainer: {
    paddingRight: Spacing.lg,
    gap: Spacing.sm,
  },
  categoryCard: {
    width: 90,
    height: 90,
  },
  categoryGradient: {
    flex: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  categoryName: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
  },
  servicesContainer: {
    paddingRight: Spacing.lg,
    gap: Spacing.md,
  },
  serviceCard: {
    width: 180,
  },
  serviceGradient: {
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minHeight: 140,
  },
  serviceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  serviceDescription: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 16,
    marginBottom: Spacing.sm,
  },
  servicePriceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "auto",
  },
  servicePrice: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  serviceDuration: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  productsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  productCard: {
    width: CARD_WIDTH,
  },
  productGradient: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  productImage: {
    width: "100%",
    height: CARD_WIDTH,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  productImagePlaceholder: {
    width: "100%",
    height: CARD_WIDTH,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  sellerBadgeSmall: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: Colors.dark.backgroundDefault + "E0",
    borderRadius: 10,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  productInfo: {
    padding: Spacing.md,
  },
  productName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  productPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  productComparePrice: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textDecorationLine: "line-through",
  },
  marketplaceSection: {
    marginTop: Spacing.xl,
  },
  marketplaceCard: {
    borderRadius: 20,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  marketplaceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.xpCyan + "15",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginBottom: Spacing.md,
  },
  marketplaceBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    letterSpacing: 1,
  },
  marketplaceTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  marketplaceText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  marketplaceFeatures: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  marketplaceFeature: {
    alignItems: "center",
    gap: 6,
  },
  marketplaceFeatureText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});
