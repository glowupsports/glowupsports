import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, GlowColors, Backgrounds } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PRODUCT_CARD_WIDTH = 140;

interface ShopProduct {
  id: string;
  name: string;
  shortDescription?: string;
  price: string;
  compareAtPrice?: string;
  imageUrl?: string;
  currency?: string;
}

interface XPDiscount {
  discountPercent: number;
  tierName: string;
  currentXP: number;
  nextTierXP: number | null;
  level: number;
}

interface ShopData {
  categories: any[];
  featuredProducts: ShopProduct[];
  featuredServices: any[];
}

export function GlowMarketSpotlight() {
  const navigation = useNavigation<any>();

  const { data: shopData } = useQuery<ShopData>({
    queryKey: ["/api/player/shop"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: xpDiscount } = useQuery<XPDiscount>({
    queryKey: ["/api/player/shop/xp-discount"],
    staleTime: 10 * 60 * 1000,
  });

  const featuredProducts = shopData?.featuredProducts || [];

  const getDiscountPercent = (product: ShopProduct): number | null => {
    if (!product.compareAtPrice || !product.price) return null;
    const compare = Number(product.compareAtPrice);
    const current = Number(product.price);
    if (compare <= current || compare === 0) return null;
    return Math.round(((compare - current) / compare) * 100);
  };

  const formatPrice = (price: string, currency?: string) => {
    const cur = currency || "AED";
    return `${cur} ${Number(price).toFixed(0)}`;
  };

  const handleProductPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("Shop");
  };

  const handleViewAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("Shop");
  };

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      <LinearGradient
        colors={[GlowColors.primary + "08", Backgrounds.card, Backgrounds.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
              <Ionicons name="storefront" size={18} color={GlowColors.primary} />
            </View>
            <Text style={styles.headerTitle}>GLOW MARKET</Text>
          </View>
          <Pressable onPress={handleViewAll} style={styles.viewAllButton}>
            <Text style={styles.viewAllText}>Shop Now</Text>
            <Ionicons name="arrow-forward" size={14} color={GlowColors.primary} />
          </Pressable>
        </View>

        {xpDiscount && xpDiscount.discountPercent > 0 ? (
          <View style={styles.discountBadge}>
            <Ionicons name="diamond" size={12} color={GlowColors.primary} />
            <Text style={styles.discountText}>
              {xpDiscount.tierName} Member — {xpDiscount.discountPercent}% OFF
            </Text>
          </View>
        ) : null}

        {featuredProducts.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.productsScroll}
          >
            {featuredProducts.slice(0, 6).map((product) => {
              const discount = getDiscountPercent(product);
              return (
                <Pressable
                  key={product.id}
                  style={styles.productCard}
                  onPress={handleProductPress}
                >
                  <View style={styles.productImageContainer}>
                    {product.imageUrl ? (
                      <Image
                        source={{ uri: product.imageUrl }}
                        style={styles.productImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.productImagePlaceholder}>
                        <Ionicons name="tennisball" size={28} color={Colors.dark.textSubtle} />
                      </View>
                    )}
                    {discount ? (
                      <View style={styles.saleBadge}>
                        <Text style={styles.saleBadgeText}>-{discount}%</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.productPrice}>
                      {formatPrice(product.price, product.currency)}
                    </Text>
                    {product.compareAtPrice && discount ? (
                      <Text style={styles.comparePrice}>
                        {Number(product.compareAtPrice).toFixed(0)}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Pressable onPress={handleViewAll} style={styles.fallbackRow}>
            <Text style={styles.fallbackText}>Gear, services & exclusive deals</Text>
            <Ionicons name="chevron-forward" size={16} color={GlowColors.primary} />
          </Pressable>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GlowColors.primary + "15",
    overflow: "hidden",
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconContainer: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: GlowColors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: GlowColors.primary,
    letterSpacing: 1.5,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  discountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: GlowColors.primary + "12",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  discountText: {
    fontSize: 11,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 0.3,
  },
  productsScroll: {
    paddingHorizontal: Spacing.md,
    gap: 10,
    paddingBottom: Spacing.xs,
  },
  productCard: {
    width: PRODUCT_CARD_WIDTH,
    backgroundColor: Backgrounds.elevated,
    borderRadius: 12,
    overflow: "hidden",
  },
  productImageContainer: {
    width: "100%",
    height: 100,
    backgroundColor: Backgrounds.surface,
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
    backgroundColor: Backgrounds.surface,
  },
  saleBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#FF4D4D",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  saleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  productName: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
    paddingHorizontal: 8,
    paddingTop: 8,
    lineHeight: 16,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 4,
  },
  productPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  comparePrice: {
    fontSize: 11,
    fontWeight: "500",
    color: Colors.dark.textSubtle,
    textDecorationLine: "line-through",
  },
  fallbackRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.xs,
  },
  fallbackText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
});
