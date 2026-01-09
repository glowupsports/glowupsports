import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  Dimensions,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Colors, Spacing } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 3) / 2;

interface Product {
  id: string;
  name: string;
  shortDescription?: string;
  price: string;
  compareAtPrice?: string;
  imageUrl?: string;
  isFeatured: boolean;
  sellerType?: string;
}

export default function ShopCategoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [refreshing, setRefreshing] = useState(false);

  const categoryId = route.params?.categoryId;
  const categoryName = route.params?.categoryName || "Products";

  const { data: products = [], isLoading, refetch } = useQuery<Product[]>({
    queryKey: [`/api/player/shop/products?categoryId=${categoryId}`],
    enabled: !!categoryId,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const formatPrice = (price: string) => {
    return `AED ${parseFloat(price).toFixed(0)}`;
  };

  const handleProductPress = (product: Product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ProductDetail", { productId: product.id });
  };

  const getSellerBadge = (type?: string) => {
    switch (type) {
      case "official":
        return { icon: "shield-checkmark", color: Colors.dark.primary };
      case "pro":
        return { icon: "star", color: Colors.dark.gold };
      default:
        return { icon: "business", color: Colors.dark.xpCyan };
    }
  };

  if (!categoryId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Products</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Category not found</Text>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="cube-outline" size={48} color={Colors.dark.primary} />
          <Text style={styles.loadingText}>Loading products...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{categoryName}</Text>
        <View style={styles.headerSpacer} />
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
      >
        {products.length === 0 ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={64} color={Colors.dark.textSecondary + "60"} />
            <Text style={styles.emptyText}>No products in this category yet</Text>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={styles.productsGrid}>
            {products.map((product, index) => {
              const badge = getSellerBadge(product.sellerType);
              return (
                <Animated.View
                  key={product.id}
                  entering={FadeInUp.delay(index * 50).duration(300)}
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
                          <Text style={styles.productPrice}>{formatPrice(product.price)}</Text>
                          {product.compareAtPrice && (
                            <Text style={styles.productComparePrice}>
                              {formatPrice(product.compareAtPrice)}
                            </Text>
                          )}
                        </View>
                      </View>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              );
            })}
          </Animated.View>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
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
  headerSpacer: {
    width: 44,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
    textAlign: "center",
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
});
