import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, GlowColors } from "@/constants/theme";
import { useCart } from "../contexts/CartContext";
import { apiRequest } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Product {
  id: string;
  name: string;
  shortDescription?: string;
  description?: string;
  price: string;
  compareAtPrice?: string;
  imageUrl?: string;
  imageUrls?: string[];
  isFeatured: boolean;
  stock?: number;
  sku?: string;
  brand?: string;
  tags?: string[];
  sellerType?: string;
}

interface XPDiscount {
  discountPercent: number;
  tierName: string;
  currentXP: number;
  nextTierLevel: number | null;
  level: number;
}

export default function ProductDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { addItem } = useCart();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);

  const productId = route.params?.productId;

  if (!productId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Product not found</Text>
        </View>
      </View>
    );
  }

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: [`/api/player/shop/products/${productId}`],
    enabled: !!productId,
  });

  const { data: xpDiscount } = useQuery<XPDiscount>({
    queryKey: ["/api/player/shop/xp-discount"],
  });

  const { data: wishlistData } = useQuery<{ items: any[] }>({
    queryKey: ["/api/player/shop/wishlist"],
  });

  const isInWishlist = wishlistData?.items?.some(
    (item) => item.productId === productId
  );

  const wishlistMutation = useMutation({
    mutationFn: async () => {
      if (isInWishlist) {
        const item = wishlistData?.items?.find((i) => i.productId === productId);
        if (item) {
          await apiRequest("DELETE", `/api/player/shop/wishlist/${item.id}`);
        }
      } else {
        await apiRequest("POST", "/api/player/shop/wishlist", { productId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/shop/wishlist"] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const handleAddToCart = () => {
    if (!product) return;
    
    const price = xpDiscount?.discountPercent
      ? parseFloat(product.price) * (1 - xpDiscount.discountPercent / 100)
      : parseFloat(product.price);

    addItem({
      type: "product",
      productId: product.id,
      name: product.name,
      price,
      quantity,
      imageUrl: product.imageUrl,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const getSellerBadge = () => {
    const type = product?.sellerType || "academy";
    switch (type) {
      case "official":
        return { icon: "shield-checkmark", color: Colors.dark.primary, label: "Official Store" };
      case "academy":
        return { icon: "business", color: Colors.dark.primary, label: "Academy" };
      case "pro":
        return { icon: "star", color: Colors.dark.gold, label: "Pro Seller" };
      default:
        return { icon: "person", color: Colors.dark.textSecondary, label: "Community" };
    }
  };

  if (isLoading || !product) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="cube-outline" size={48} color={Colors.dark.primary} />
          <Text style={styles.loadingText}>Loading product...</Text>
        </View>
      </View>
    );
  }

  const sellerBadge = getSellerBadge();
  const discountedPrice = getDiscountedPrice(product.price);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
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
        <Animated.View entering={FadeIn.duration(400)}>
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              style={styles.productImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.productImagePlaceholder}>
              <Ionicons
                name="tennisball-outline"
                size={80}
                color={Colors.dark.primary + "40"}
              />
            </View>
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(100).duration(400)}
          style={styles.content}
        >
          <View style={styles.sellerBadge}>
            <Ionicons
              name={sellerBadge.icon as any}
              size={14}
              color={sellerBadge.color}
            />
            <Text style={[styles.sellerBadgeText, { color: sellerBadge.color }]}>
              {sellerBadge.label}
            </Text>
          </View>

          <Text style={styles.productName}>{product.name}</Text>

          {product.brand && (
            <Text style={styles.brandName}>{product.brand}</Text>
          )}

          <View style={styles.priceContainer}>
            {discountedPrice ? (
              <>
                <Text style={styles.discountedPrice}>{discountedPrice}</Text>
                <Text style={styles.originalPrice}>{formatPrice(product.price)}</Text>
                <View style={styles.xpDiscountBadge}>
                  <Ionicons name="flash" size={12} color={Colors.dark.gold} />
                  <Text style={styles.xpDiscountText}>
                    {xpDiscount?.discountPercent}% {xpDiscount?.tierName} Discount
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.price}>{formatPrice(product.price)}</Text>
            )}
          </View>

          {product.compareAtPrice && !discountedPrice && (
            <Text style={styles.comparePrice}>
              Was {formatPrice(product.compareAtPrice)}
            </Text>
          )}

          {product.shortDescription && (
            <Text style={styles.shortDescription}>{product.shortDescription}</Text>
          )}

          {product.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{product.description}</Text>
            </View>
          )}

          {product.stock !== undefined && (
            <View style={styles.stockInfo}>
              <Ionicons
                name={product.stock > 0 ? "checkmark-circle" : "close-circle"}
                size={16}
                color={product.stock > 0 ? Colors.dark.primary : Colors.dark.error}
              />
              <Text
                style={[
                  styles.stockText,
                  { color: product.stock > 0 ? Colors.dark.primary : Colors.dark.error },
                ]}
              >
                {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
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
                  Reach Level {xpDiscount.nextTierLevel} to unlock {xpDiscount.nextTierLevel && xpDiscount.nextTierLevel >= 41 ? "20" : xpDiscount.nextTierLevel && xpDiscount.nextTierLevel >= 31 ? "15" : xpDiscount.nextTierLevel && xpDiscount.nextTierLevel >= 21 ? "10" : "5"}% off
                </Text>
              </View>
            </LinearGradient>
          )}

          <View style={styles.quantitySection}>
            <Text style={styles.quantityLabel}>Quantity</Text>
            <View style={styles.quantityControls}>
              <Pressable
                onPress={() => setQuantity(Math.max(1, quantity - 1))}
                style={styles.quantityButton}
              >
                <Ionicons name="remove" size={20} color={Colors.dark.text} />
              </Pressable>
              <Text style={styles.quantityValue}>{quantity}</Text>
              <Pressable
                onPress={() => setQuantity(quantity + 1)}
                style={styles.quantityButton}
              >
                <Ionicons name="add" size={20} color={Colors.dark.text} />
              </Pressable>
            </View>
          </View>
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
            {discountedPrice
              ? `AED ${(parseFloat(product.price) * (1 - (xpDiscount?.discountPercent || 0) / 100) * quantity).toFixed(0)}`
              : `AED ${(parseFloat(product.price) * quantity).toFixed(0)}`}
          </Text>
        </View>
        <Pressable
          onPress={handleAddToCart}
          style={[
            styles.addToCartButton,
            addedToCart && styles.addedToCartButton,
          ]}
        >
          <Ionicons
            name={addedToCart ? "checkmark" : "bag-add"}
            size={20}
            color={Colors.dark.backgroundDefault}
          />
          <Text style={styles.addToCartText}>
            {addedToCart ? "Added!" : "Add to Cart"}
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundDefault + "CC",
    alignItems: "center",
    justifyContent: "center",
  },
  wishlistButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundDefault + "CC",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 0,
  },
  productImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  productImagePlaceholder: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: Spacing.lg,
  },
  sellerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginBottom: Spacing.sm,
  },
  sellerBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  productName: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  brandName: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  price: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  discountedPrice: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.primary,
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
  comparePrice: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textDecorationLine: "line-through",
    marginBottom: Spacing.md,
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
  stockInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.lg,
  },
  stockText: {
    fontSize: 14,
    fontWeight: "500",
  },
  xpPromoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: 16,
    marginBottom: Spacing.lg,
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
  quantitySection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: 4,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
    minWidth: 30,
    textAlign: "center",
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
  addToCartButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 14,
  },
  addedToCartButton: {
    backgroundColor: Colors.dark.successNeon,
  },
  addToCartText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.backgroundDefault,
  },
});
