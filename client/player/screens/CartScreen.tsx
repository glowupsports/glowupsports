import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInUp, FadeOutLeft } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, GlowColors } from "@/constants/theme";
import { useCart } from "../contexts/CartContext";
import { apiRequest } from "@/lib/query-client";

interface XPDiscount {
  discountPercent: number;
  tierName: string;
  currentXP: number;
  nextTierLevel: number | null;
  level: number;
}

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { items, itemCount, subtotal, discountPercent, discountAmount, total, removeItem, updateQuantity, clearCart, setDiscount } = useCart();

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: xpDiscount } = useQuery<XPDiscount>({
    queryKey: ["/api/player/shop/xp-discount"],
  });

  React.useEffect(() => {
    if (xpDiscount?.discountPercent) {
      setDiscount(xpDiscount.discountPercent);
    }
  }, [xpDiscount?.discountPercent]);

  const formatPrice = (price: number) => {
    return `AED ${price.toFixed(0)}`;
  };

  const handleRemoveItem = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeItem(id);
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;

    setIsSubmitting(true);
    try {
      const orderItems = items.map((item) => ({
        productId: item.productId,
        serviceId: item.serviceId,
        quantity: item.quantity,
        variantId: item.variantId,
        variantName: item.variantName,
        serviceDetails: item.serviceDetails,
      }));

      const res = await apiRequest("POST", "/api/player/shop/orders", {
        items: orderItems,
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      const response = await res.json() as { order: { orderNumber: string } };

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["/api/player/shop/orders"] });

      Alert.alert(
        "Order Placed!",
        `Your order #${response.order.orderNumber} has been placed successfully. The academy will contact you to confirm.`,
        [
          {
            text: "Continue Shopping",
            onPress: () => navigation.navigate("Shop"),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to place order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Cart</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.emptyContainer}>
          <Ionicons name="bag-outline" size={80} color={Colors.dark.primary + "40"} />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptyText}>
            Browse the Glow Market to find premium gear and services
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.shopButton}
          >
            <Text style={styles.shopButtonText}>Start Shopping</Text>
          </Pressable>
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
        <Text style={styles.headerTitle}>Cart ({itemCount})</Text>
        <Pressable onPress={() => clearCart()} style={styles.clearButton}>
          <Text style={styles.clearButtonText}>Clear</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)}>
          {items.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={FadeInUp.delay(index * 50).duration(300)}
              exiting={FadeOutLeft.duration(200)}
              style={styles.cartItem}
            >
              <LinearGradient
                colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault]}
                style={styles.cartItemGradient}
              >
                {item.type === "product" && item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
                ) : (
                  <View style={styles.itemIconContainer}>
                    <Ionicons
                      name={(item.iconName as any) || (item.type === "service" ? "build" : "tennisball-outline")}
                      size={24}
                      color={item.type === "service" ? Colors.dark.primary : Colors.dark.primary}
                    />
                  </View>
                )}

                <View style={styles.itemInfo}>
                  <View style={styles.itemTypeBadge}>
                    <Text style={styles.itemTypeText}>
                      {item.type === "service" ? "Service" : "Product"}
                    </Text>
                  </View>
                  <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                  {item.durationMinutes && (
                    <Text style={styles.itemDuration}>{item.durationMinutes} min</Text>
                  )}
                  <Text style={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</Text>
                </View>

                <View style={styles.itemActions}>
                  {item.type === "product" && (
                    <View style={styles.quantityControls}>
                      <Pressable
                        onPress={() => updateQuantity(item.id, item.quantity - 1)}
                        style={styles.quantityButton}
                      >
                        <Ionicons name="remove" size={16} color={Colors.dark.text} />
                      </Pressable>
                      <Text style={styles.quantityValue}>{item.quantity}</Text>
                      <Pressable
                        onPress={() => updateQuantity(item.id, item.quantity + 1)}
                        style={styles.quantityButton}
                      >
                        <Ionicons name="add" size={16} color={Colors.dark.text} />
                      </Pressable>
                    </View>
                  )}
                  <Pressable
                    onPress={() => handleRemoveItem(item.id)}
                    style={styles.removeButton}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                  </Pressable>
                </View>
              </LinearGradient>
            </Animated.View>
          ))}
        </Animated.View>

        {xpDiscount && xpDiscount.discountPercent > 0 && (
          <Animated.View
            entering={FadeInUp.delay(200).duration(400)}
            style={styles.discountCard}
          >
            <LinearGradient
              colors={[Colors.dark.gold + "20", Colors.dark.backgroundSecondary]}
              style={styles.discountCardGradient}
            >
              <Ionicons name="flash" size={24} color={Colors.dark.gold} />
              <View style={styles.discountInfo}>
                <Text style={styles.discountTitle}>
                  {xpDiscount.tierName} Member Discount
                </Text>
                <Text style={styles.discountText}>
                  {xpDiscount.discountPercent}% off applied to your order!
                </Text>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        <Animated.View
          entering={FadeInUp.delay(300).duration(400)}
          style={styles.contactSection}
        >
          <Text style={styles.sectionTitle}>Contact Details (Optional)</Text>
          <TextInput
            style={styles.input}
            value={contactName}
            onChangeText={setContactName}
            placeholder="Your name"
            placeholderTextColor={Colors.dark.textSecondary + "80"}
          />
          <TextInput
            style={styles.input}
            value={contactPhone}
            onChangeText={setContactPhone}
            placeholder="Phone number"
            placeholderTextColor={Colors.dark.textSecondary + "80"}
            keyboardType="phone-pad"
          />
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Order notes..."
            placeholderTextColor={Colors.dark.textSecondary + "80"}
            multiline
            numberOfLines={2}
          />
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(400).duration(400)}
          style={styles.summarySection}
        >
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
          </View>
          {discountAmount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: Colors.dark.gold }]}>
                XP Discount ({discountPercent}%)
              </Text>
              <Text style={[styles.summaryValue, { color: Colors.dark.gold }]}>
                -{formatPrice(discountAmount)}
              </Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPrice(total)}</Text>
          </View>
        </Animated.View>

        <View style={styles.paymentNote}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.dark.textSecondary} />
          <Text style={styles.paymentNoteText}>
            Payment will be collected by the academy. They will contact you to confirm your order.
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <Animated.View
        entering={FadeInUp.delay(500).duration(400)}
        style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}
      >
        <Pressable
          onPress={handleCheckout}
          disabled={isSubmitting || items.length === 0}
          style={[
            styles.checkoutButton,
            (isSubmitting || items.length === 0) && styles.checkoutButtonDisabled,
          ]}
        >
          <Ionicons
            name={isSubmitting ? "hourglass-outline" : "checkmark-circle"}
            size={22}
            color={Colors.dark.backgroundDefault}
          />
          <Text style={styles.checkoutButtonText}>
            {isSubmitting ? "Placing Order..." : `Place Order - ${formatPrice(total)}`}
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
  clearButton: {
    padding: Spacing.xs,
  },
  clearButtonText: {
    fontSize: 14,
    color: Colors.dark.error,
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  shopButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 14,
  },
  shopButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.backgroundDefault,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  cartItem: {
    marginBottom: Spacing.md,
  },
  cartItemGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  itemImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  itemIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  itemTypeBadge: {
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  itemTypeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
  },
  itemName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  itemDuration: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  itemActions: {
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 8,
    padding: 2,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityValue: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    minWidth: 24,
    textAlign: "center",
  },
  removeButton: {
    padding: Spacing.xs,
  },
  discountCard: {
    marginVertical: Spacing.md,
  },
  discountCardGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
  },
  discountInfo: {
    flex: 1,
  },
  discountTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  discountText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  contactSection: {
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: Spacing.md,
    fontSize: 14,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  notesInput: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  summarySection: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  totalRow: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    marginBottom: 0,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  paymentNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary + "80",
    borderRadius: 12,
  },
  paymentNoteText: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  checkoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: 14,
  },
  checkoutButtonDisabled: {
    opacity: 0.5,
  },
  checkoutButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.backgroundDefault,
  },
});
