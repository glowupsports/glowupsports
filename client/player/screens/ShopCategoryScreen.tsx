import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, GlowColors, TextColors } from "@/constants/theme";
import { useCart } from "../contexts/CartContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 3) / 2;

const HEAD_ORANGE = "#FF6600";
const HEAD_DARK = "#1A1A1A";

const HEAD_COLLECTIONS = ["All", "Speed", "Radical", "Extreme", "Gravity", "Boom", "Instinct", "Junior"];

type SortMode = "default" | "price_asc" | "price_desc";

interface Product {
  id: string;
  name: string;
  shortDescription?: string;
  price: string;
  compareAtPrice?: string;
  imageUrl?: string;
  isFeatured: boolean;
  sellerType?: string;
  currency?: string;
  order?: number;
  createdAt?: string;
}

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

export default function ShopCategoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState("All");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const { addItem } = useCart();

  const categoryId = route.params?.categoryId;
  const categoryName = route.params?.categoryName || "Products";
  const initialCollection = route.params?.collection;

  React.useEffect(() => {
    if (initialCollection) {
      setSelectedCollection(initialCollection);
    }
  }, [initialCollection]);

  const baseQueryUrl = categoryId
    ? `/api/player/shop/products?categoryId=${categoryId}`
    : `/api/player/shop/products`;

  const { data: allProducts = [], isLoading, refetch } = useQuery<Product[]>({
    queryKey: [baseQueryUrl],
    enabled: true,
  });

  const derivedCollections = useMemo(() => {
    const knownCollections = HEAD_COLLECTIONS.slice(1);
    const found = new Set<string>();
    for (const product of allProducts) {
      const name = product.name.toLowerCase();
      for (const col of knownCollections) {
        if (name.includes(col.toLowerCase())) {
          found.add(col);
        }
      }
    }
    const derived = knownCollections.filter((c) => found.has(c));
    return derived.length > 0 ? derived : knownCollections;
  }, [allProducts]);

  const availableCollections = useMemo(() => ["All", ...derivedCollections], [derivedCollections]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleProductPress = (product: Product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ProductDetail", { productId: product.id });
  };

  const handleAddToCart = (product: Product) => {
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

  const filtered = useMemo(() => {
    let list = [...allProducts];
    if (selectedCollection !== "All") {
      list = list.filter((p) => p.name.toLowerCase().includes(selectedCollection.toLowerCase()));
    }
    if (sortMode === "price_asc") {
      list.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    } else if (sortMode === "price_desc") {
      list.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    }
    return list;
  }, [allProducts, selectedCollection, sortMode]);

  const nextSort = (): SortMode => {
    if (sortMode === "default") return "price_asc";
    if (sortMode === "price_asc") return "price_desc";
    return "default";
  };

  const sortLabel = sortMode === "default" ? "Default" : sortMode === "price_asc" ? "Price: Low" : "Price: High";
  const sortIcon = sortMode === "default" ? "swap-vertical" : sortMode === "price_asc" ? "arrow-up" : "arrow-down";

  const headerCountStr = !isLoading ? ` · ${filtered.length} ${filtered.length === 1 ? "product" : "products"}` : "";

  if (!categoryId && !initialCollection) {
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{categoryName}{headerCountStr}</Text>
        </View>
        <Pressable
          style={styles.sortButton}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSortMode(nextSort()); }}
        >
          <Ionicons name={sortIcon as any} size={15} color={sortMode !== "default" ? HEAD_ORANGE : "#AAA"} />
          <Text style={[styles.sortLabel, sortMode !== "default" && { color: HEAD_ORANGE }]}>{sortLabel}</Text>
        </Pressable>
      </View>

      <View style={styles.collectionRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collectionRowContent}>
          {availableCollections.map((col) => {
            const isActive = selectedCollection === col;
            return (
              <Pressable
                key={col}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedCollection(col); }}
                style={[styles.collectionChip, isActive && styles.collectionChipActive]}
              >
                <Text style={[styles.collectionChipText, isActive && styles.collectionChipTextActive]}>{col}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={HEAD_ORANGE} size="large" />
          <Text style={styles.loadingText}>Loading products...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={HEAD_ORANGE} />
          }
        >
          {filtered.length === 0 ? (
            <Animated.View entering={FadeIn.duration(400)} style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={64} color={Colors.dark.textSecondary + "60"} />
              <Text style={styles.emptyText}>
                {selectedCollection !== "All" ? `No ${selectedCollection} products in this category` : "No products in this category yet"}
              </Text>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(400)} style={styles.productsGrid}>
              {filtered.map((product, index) => {
                const discount = getDiscount(product.price, product.compareAtPrice);
                return (
                  <Animated.View
                    key={product.id}
                    entering={FadeInUp.delay(index * 40).duration(300)}
                    style={styles.productCardWrap}
                  >
                    <Pressable
                      onPress={() => handleProductPress(product)}
                      style={styles.productCard}
                    >
                      <View style={styles.productImageWrap}>
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
                        {discount ? (
                          <View style={styles.discountBadge}>
                            <Text style={styles.discountText}>-{discount}%</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.productInfo}>
                        <Text style={styles.brandLabel}>HEAD</Text>
                        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                        <View style={styles.productPriceRow}>
                          <Text style={styles.productPrice}>{formatPrice(product.price, product.currency)}</Text>
                          {product.compareAtPrice ? (
                            <Text style={styles.productComparePrice}>
                              {formatPrice(product.compareAtPrice, product.currency)}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <Pressable
                        onPress={(e) => { e.stopPropagation?.(); handleAddToCart(product); }}
                        style={styles.addBtn}
                      >
                        <Ionicons name="add" size={18} color={TextColors.primary} />
                      </Pressable>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </Animated.View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
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
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A1A",
  },
  backButton: {
    padding: Spacing.xs,
    width: 36,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerCount: {
    fontSize: 11,
    color: "#666",
    marginTop: 1,
  },
  headerSpacer: {
    width: 36,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sortLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#AAA",
  },

  collectionRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A1A",
  },
  collectionRowContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  collectionChip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  collectionChipActive: {
    backgroundColor: HEAD_ORANGE,
    borderColor: HEAD_ORANGE,
  },
  collectionChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#AAA",
  },
  collectionChipTextActive: {
    color: TextColors.primary,
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
  productCardWrap: {
    width: CARD_WIDTH,
  },
  productCard: {
    backgroundColor: HEAD_DARK,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    position: "relative",
  },
  productImageWrap: {
    width: "100%",
    height: CARD_WIDTH,
    backgroundColor: "#141414",
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
    fontSize: 10,
    fontWeight: "800",
    color: TextColors.primary,
  },
  productInfo: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  brandLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#2ECC71",
    letterSpacing: 2,
    marginBottom: 3,
  },
  productName: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
    lineHeight: 17,
    marginBottom: Spacing.xs,
  },
  productPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flexWrap: "wrap",
  },
  productPrice: {
    fontSize: 15,
    fontWeight: "800",
    color: HEAD_ORANGE,
  },
  productComparePrice: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    textDecorationLine: "line-through",
  },
  addBtn: {
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
}));
