import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  Alert,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { Colors, Backgrounds, Spacing, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface MarketplaceListing {
  id: string;
  title: string;
  description?: string;
  price: string;
  condition: string;
  category: string;
  brand?: string;
  images: string[];
  status: string;
  viewCount: number;
  favoriteCount: number;
  messageCount: number;
  createdAt: string;
}

const CONDITIONS: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: Colors.dark.primary },
  like_new: { label: "Like New", color: Colors.dark.primary },
  good: { label: "Good", color: Colors.dark.gold },
  fair: { label: "Fair", color: Colors.dark.textSecondary },
  used: { label: "Used", color: Colors.dark.textMuted },
};

export default function MyListingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: listings = [], isLoading, refetch } = useQuery<MarketplaceListing[]>({
    queryKey: ["/api/player/marketplace/my/listings"],
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleMarkSold = async (listingId: string) => {
    Alert.alert(
      "Mark as Sold",
      "Are you sure you want to mark this item as sold?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark Sold",
          style: "default",
          onPress: async () => {
            try {
              await apiRequest("POST", `/api/player/marketplace/${listingId}/sold`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refetch();
              queryClient.invalidateQueries({ queryKey: ["/api/player/marketplace"] });
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to update listing");
            }
          },
        },
      ]
    );
  };

  const handleDelete = async (listingId: string) => {
    Alert.alert(
      "Delete Listing",
      "Are you sure you want to delete this listing? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await apiRequest("DELETE", `/api/player/marketplace/${listingId}`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refetch();
              queryClient.invalidateQueries({ queryKey: ["/api/player/marketplace"] });
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to delete listing");
            }
          },
        },
      ]
    );
  };

  const formatPrice = (price: string) => `AED ${parseFloat(price).toFixed(0)}`;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const activeListings = listings.filter(l => l.status === "active");
  const soldListings = listings.filter(l => l.status === "sold");

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Listings</Text>
        <Pressable onPress={() => navigation.navigate("Marketplace")} style={styles.headerButton}>
          <Ionicons name="add" size={24} color={Colors.dark.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.primary} />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="cube-outline" size={48} color={Colors.dark.primary} />
            <Text style={styles.loadingText}>Loading your listings...</Text>
          </View>
        ) : listings.length === 0 ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.emptyContainer}>
            <Ionicons name="pricetag-outline" size={64} color={Colors.dark.textSecondary + "40"} />
            <Text style={styles.emptyTitle}>No Listings Yet</Text>
            <Text style={styles.emptyText}>Start selling your tennis gear!</Text>
            <Pressable
              onPress={() => navigation.navigate("Marketplace")}
              style={styles.createButton}
            >
              <Text style={styles.createButtonText}>Create Listing</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <>
            {activeListings.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active ({activeListings.length})</Text>
                {activeListings.map((listing, index) => {
                  const conditionInfo = CONDITIONS[listing.condition] || CONDITIONS.used;
                  return (
                    <Animated.View key={listing.id} entering={FadeInUp.delay(index * 50).duration(300)}>
                      <Pressable
                        onPress={() => navigation.navigate("MarketplaceListing", { listingId: listing.id })}
                        style={styles.listingCard}
                      >
                        <View style={styles.listingContent}>
                          {listing.images && listing.images.length > 0 ? (
                            <Image
                              source={{ uri: `${getApiUrl()}${listing.images[0]}` }}
                              style={styles.listingImage}
                            />
                          ) : (
                            <View style={styles.listingImagePlaceholder}>
                              <Ionicons name="image-outline" size={24} color={Colors.dark.textSecondary + "40"} />
                            </View>
                          )}

                          <View style={styles.listingInfo}>
                            <Text style={styles.listingTitle} numberOfLines={2}>{listing.title}</Text>
                            <Text style={styles.listingPrice}>{formatPrice(listing.price)}</Text>
                            <View style={styles.statsRow}>
                              <View style={styles.stat}>
                                <Ionicons name="eye-outline" size={14} color={Colors.dark.textSecondary} />
                                <Text style={styles.statText}>{listing.viewCount}</Text>
                              </View>
                              <View style={styles.stat}>
                                <Ionicons name="heart-outline" size={14} color={Colors.dark.textSecondary} />
                                <Text style={styles.statText}>{listing.favoriteCount}</Text>
                              </View>
                              <View style={styles.stat}>
                                <Ionicons name="chatbubble-outline" size={14} color={Colors.dark.textSecondary} />
                                <Text style={styles.statText}>{listing.messageCount}</Text>
                              </View>
                            </View>
                          </View>
                        </View>

                        <View style={styles.actions}>
                          <Pressable
                            onPress={() => handleMarkSold(listing.id)}
                            style={styles.actionButton}
                          >
                            <Ionicons name="checkmark-circle-outline" size={20} color={Colors.dark.primary} />
                            <Text style={styles.actionButtonText}>Sold</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDelete(listing.id)}
                            style={[styles.actionButton, styles.deleteButton]}
                          >
                            <Ionicons name="trash-outline" size={20} color={Colors.dark.error} />
                          </Pressable>
                        </View>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
            )}

            {soldListings.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Sold ({soldListings.length})</Text>
                {soldListings.map((listing, index) => (
                  <Animated.View key={listing.id} entering={FadeInUp.delay(index * 50).duration(300)}>
                    <View style={[styles.listingCard, styles.soldCard]}>
                      <View style={styles.listingContent}>
                        {listing.images && listing.images.length > 0 ? (
                          <Image
                            source={{ uri: `${getApiUrl()}${listing.images[0]}` }}
                            style={[styles.listingImage, styles.soldImage]}
                          />
                        ) : (
                          <View style={[styles.listingImagePlaceholder, styles.soldImage]}>
                            <Ionicons name="image-outline" size={24} color={Colors.dark.textSecondary + "40"} />
                          </View>
                        )}

                        <View style={styles.listingInfo}>
                          <Text style={[styles.listingTitle, styles.soldText]} numberOfLines={2}>
                            {listing.title}
                          </Text>
                          <Text style={[styles.listingPrice, styles.soldText]}>
                            {formatPrice(listing.price)}
                          </Text>
                          <View style={styles.soldBadge}>
                            <Ionicons name="checkmark-circle" size={14} color={Colors.dark.primary} />
                            <Text style={styles.soldBadgeText}>Sold</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </Animated.View>
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: insets.bottom + 20 }} />
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
    paddingVertical: Spacing.md,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
  },
  createButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    marginTop: Spacing.md,
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  listingCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  soldCard: {
    opacity: 0.7,
  },
  listingContent: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  listingImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  listingImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  soldImage: {
    opacity: 0.5,
  },
  listingInfo: {
    flex: 1,
    justifyContent: "center",
  },
  listingTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  listingPrice: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.primary,
    marginBottom: 6,
  },
  soldText: {
    color: Colors.dark.textSecondary,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary + "15",
    gap: Spacing.xs,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.primary,
  },
  deleteButton: {
    backgroundColor: Colors.dark.error + "15",
  },
  soldBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  soldBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.dark.primary,
  },
});
