import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
  TextInput,
  Alert,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Colors, Backgrounds, Spacing, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

type RouteParams = {
  MarketplaceListing: {
    listingId: string;
  };
};

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
  seller: {
    id: string;
    name: string;
    profilePhotoUrl?: string;
  };
}

const CONDITIONS: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: Colors.dark.primary },
  like_new: { label: "Like New", color: Colors.dark.primary },
  good: { label: "Good", color: Colors.dark.gold },
  fair: { label: "Fair", color: Colors.dark.textSecondary },
  used: { label: "Used", color: Colors.dark.textMuted },
};

export default function MarketplaceListingDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, "MarketplaceListing">>();
  const queryClient = useQueryClient();
  const { listingId } = route.params;

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const { data: listing, isLoading } = useQuery<MarketplaceListing>({
    queryKey: [`/api/player/marketplace/${listingId}`],
  });

  const handleFavorite = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (isFavorited) {
        await apiRequest("DELETE", `/api/player/marketplace/${listingId}/favorite`);
      } else {
        await apiRequest("POST", `/api/player/marketplace/${listingId}/favorite`);
      }
      setIsFavorited(!isFavorited);
      queryClient.invalidateQueries({ queryKey: ["/api/player/marketplace"] });
    } catch (error) {
      console.error("Favorite error:", error);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) {
      Alert.alert("Error", "Please enter a message");
      return;
    }

    setIsSending(true);
    try {
      await apiRequest("POST", `/api/player/marketplace/${listingId}/message`, {
        message: message.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMessage("");
      setShowMessageModal(false);
      Alert.alert("Sent!", "Your message has been sent to the seller.");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const formatPrice = (price: string) => `AED ${parseFloat(price).toFixed(0)}`;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (isLoading || !listing) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="cube-outline" size={48} color={Colors.dark.primary} />
          <Text style={styles.loadingText}>Loading listing...</Text>
        </View>
      </View>
    );
  }

  const conditionInfo = CONDITIONS[listing.condition] || CONDITIONS.used;
  const hasImages = listing.images && listing.images.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{listing.title}</Text>
        <Pressable onPress={handleFavorite} style={styles.headerButton}>
          <Ionicons
            name={isFavorited ? "heart" : "heart-outline"}
            size={24}
            color={isFavorited ? Colors.dark.error : Colors.dark.text}
          />
        </Pressable>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(400)}>
          {hasImages ? (
            <View style={styles.imageGallery}>
              <Image
                source={{ uri: `${getApiUrl()}${listing.images[currentImageIndex]}` }}
                style={styles.mainImage}
                resizeMode="cover"
              />
              {listing.images.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailScroll}>
                  <View style={styles.thumbnailRow}>
                    {listing.images.map((img, index) => (
                      <Pressable
                        key={index}
                        onPress={() => setCurrentImageIndex(index)}
                        style={[
                          styles.thumbnail,
                          currentImageIndex === index && styles.thumbnailActive,
                        ]}
                      >
                        <Image
                          source={{ uri: `${getApiUrl()}${img}` }}
                          style={styles.thumbnailImage}
                        />
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          ) : (
            <View style={styles.noImageContainer}>
              <Ionicons name="image-outline" size={64} color={Colors.dark.textSecondary + "40"} />
              <Text style={styles.noImageText}>No photos</Text>
            </View>
          )}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.detailsContainer}>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(listing.price)}</Text>
            <View style={[styles.conditionBadge, { backgroundColor: conditionInfo.color + "20" }]}>
              <Text style={[styles.conditionText, { color: conditionInfo.color }]}>
                {conditionInfo.label}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{listing.title}</Text>
          
          {listing.brand && (
            <Text style={styles.brand}>{listing.brand}</Text>
          )}

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="eye-outline" size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.metaText}>{listing.viewCount} views</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="heart-outline" size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.metaText}>{listing.favoriteCount} saves</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.metaText}>{formatDate(listing.createdAt)}</Text>
            </View>
          </View>

          {listing.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{listing.description}</Text>
            </View>
          )}

          <View style={styles.sellerSection}>
            <Text style={styles.sectionTitle}>Seller</Text>
            <View style={styles.sellerCard}>
              {listing.seller?.profilePhotoUrl ? (
                <Image
                  source={{ uri: `${getApiUrl()}${listing.seller.profilePhotoUrl}` }}
                  style={styles.sellerAvatar}
                />
              ) : (
                <View style={styles.sellerAvatarPlaceholder}>
                  <Text style={styles.sellerAvatarText}>
                    {listing.seller?.name?.charAt(0) || "?"}
                  </Text>
                </View>
              )}
              <View style={styles.sellerInfo}>
                <Text style={styles.sellerName}>{listing.seller?.name || "Seller"}</Text>
                <Text style={styles.sellerLabel}>Member</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <View style={{ height: insets.bottom + 100 }} />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable onPress={() => setShowMessageModal(true)} style={styles.messageButton}>
          <Ionicons name="chatbubble-outline" size={20} color={Colors.dark.primary} />
          <Text style={styles.messageButtonText}>Message Seller</Text>
        </Pressable>
      </View>

      {showMessageModal && (
        <View style={styles.messageModalOverlay}>
          <Pressable style={styles.messageModalBackdrop} onPress={() => setShowMessageModal(false)} />
          <Animated.View entering={FadeInUp.duration(300)} style={styles.messageModal}>
            <View style={styles.messageModalHeader}>
              <Text style={styles.messageModalTitle}>Send Message</Text>
              <Pressable onPress={() => setShowMessageModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            <TextInput
              style={styles.messageInput}
              value={message}
              onChangeText={setMessage}
              placeholder="Hi, is this still available?"
              placeholderTextColor={Colors.dark.textSecondary}
              multiline
              numberOfLines={4}
            />
            <Pressable
              onPress={handleSendMessage}
              disabled={isSending}
              style={[styles.sendButton, isSending && { opacity: 0.5 }]}
            >
              <Text style={styles.sendButtonText}>
                {isSending ? "Sending..." : "Send Message"}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
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
    paddingVertical: Spacing.md,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
    marginHorizontal: Spacing.sm,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
  },
  imageGallery: {
    marginBottom: Spacing.lg,
  },
  mainImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.8,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  thumbnailScroll: {
    marginTop: Spacing.sm,
  },
  thumbnailRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  thumbnail: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  thumbnailActive: {
    borderColor: Colors.dark.primary,
  },
  thumbnailImage: {
    width: 56,
    height: 56,
  },
  noImageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.6,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  noImageText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
  detailsContainer: {
    paddingHorizontal: Spacing.lg,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  price: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  conditionBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 12,
  },
  conditionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  brand: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  metaRow: {
    flexDirection: "row",
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  metaText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  descriptionSection: {
    marginBottom: Spacing.lg,
  },
  description: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
  },
  sellerSection: {
    marginBottom: Spacing.lg,
  },
  sellerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
  },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  sellerAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  sellerAvatarText: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  sellerInfo: {
    flex: 1,
  },
  sellerName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  sellerLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  messageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    gap: Spacing.sm,
  },
  messageButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  messageModalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  messageModalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  messageModal: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
  },
  messageModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  messageModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  messageInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.dark.text,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: Spacing.md,
  },
  sendButton: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    alignItems: "center",
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
}));
