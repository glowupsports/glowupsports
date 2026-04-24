import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  TextInput,
  Dimensions,
  Modal,
  Alert,
  Platform,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { LockedScreen } from "../components/LockedScreen";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 3) / 2;

interface MarketplaceListing {
  id: string;
  title: string;
  description?: string;
  price: string;
  currency?: string;
  condition: string;
  category: string;
  brand?: string;
  images: string[];
  status: string;
  viewCount: number;
  favoriteCount: number;
  createdAt: string;
  seller: {
    id: string;
    name: string;
    profilePhotoUrl?: string;
  };
}

const CATEGORIES = [
  { key: "all", label: "All", icon: "grid" },
  { key: "rackets", label: "Rackets", icon: "tennisball" },
  { key: "shoes", label: "Shoes", icon: "footsteps" },
  { key: "gear", label: "Gear", icon: "bag" },
  { key: "apparel", label: "Apparel", icon: "shirt" },
  { key: "accessories", label: "Accessories", icon: "glasses" },
];

const CONDITIONS = [
  { key: "new", label: "New", color: Colors.dark.primary },
  { key: "like_new", label: "Like New", color: Colors.dark.primary },
  { key: "good", label: "Good", color: Colors.dark.gold },
  { key: "fair", label: "Fair", color: Colors.dark.textSecondary },
  { key: "used", label: "Used", color: Colors.dark.textMuted },
];

export default function MarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: listings = [], isLoading, refetch } = useQuery<MarketplaceListing[]>({
    queryKey: ["/api/player/marketplace"],
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const filteredListings = listings.filter(listing => {
    if (selectedCategory !== "all" && listing.category !== selectedCategory) {
      return false;
    }
    if (searchQuery && !listing.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const formatPrice = (price: string, currency: string = "AED") => `${currency} ${parseFloat(price).toFixed(0)}`;

  const getConditionInfo = (condition: string) => {
    return CONDITIONS.find(c => c.key === condition) || CONDITIONS[4];
  };

  const handleListingPress = (listing: MarketplaceListing) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("MarketplaceListing", { listingId: listing.id });
  };

  const handleCreateListing = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCreateModal(true);
  };

  return (
    <LockedScreen featureKey="marketplace">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Marketplace</Text>
          <Pressable onPress={() => navigation.navigate("MyListings")} style={styles.headerButton}>
            <Ionicons name="list" size={22} color={Colors.dark.text} />
          </Pressable>
        </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.dark.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search marketplace..."
            placeholderTextColor={Colors.dark.textSecondary}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={Colors.dark.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContainer}
      >
        {CATEGORIES.map((category) => (
          <Pressable
            key={category.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedCategory(category.key);
            }}
            style={[
              styles.categoryChip,
              selectedCategory === category.key && styles.categoryChipActive,
            ]}
          >
            <Ionicons
              name={category.icon as any}
              size={16}
              color={selectedCategory === category.key ? Colors.dark.primary : Colors.dark.textSecondary}
            />
            <Text style={[
              styles.categoryChipText,
              selectedCategory === category.key && styles.categoryChipTextActive,
            ]}>
              {category.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.dark.primary}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="storefront-outline" size={48} color={Colors.dark.primary} />
            <Text style={styles.loadingText}>Loading marketplace...</Text>
          </View>
        ) : filteredListings.length === 0 ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.emptyContainer}>
            <Ionicons name="storefront-outline" size={64} color={Colors.dark.textSecondary + "40"} />
            <Text style={styles.emptyTitle}>No Listings Yet</Text>
            <Text style={styles.emptyText}>Be the first to list something!</Text>
            <Pressable onPress={handleCreateListing} style={styles.emptyButton}>
              <Text style={styles.emptyButtonText}>Create Listing</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <View style={styles.listingsGrid}>
            {filteredListings.map((listing, index) => {
              const conditionInfo = getConditionInfo(listing.condition);
              return (
                <Animated.View
                  key={listing.id}
                  entering={FadeInUp.delay(index * 50).duration(300)}
                >
                  <Pressable
                    onPress={() => handleListingPress(listing)}
                    style={styles.listingCard}
                  >
                    <LinearGradient
                      colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault]}
                      style={styles.listingGradient}
                    >
                      {listing.images && listing.images.length > 0 ? (
                        <Image
                          source={{ uri: listing.images[0] }}
                          style={styles.listingImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.listingImagePlaceholder}>
                          <Ionicons name="image-outline" size={32} color={Colors.dark.textSecondary + "40"} />
                        </View>
                      )}

                      <View style={[styles.conditionBadge, { backgroundColor: conditionInfo.color + "30" }]}>
                        <Text style={[styles.conditionText, { color: conditionInfo.color }]}>
                          {conditionInfo.label}
                        </Text>
                      </View>

                      <View style={styles.listingInfo}>
                        <Text style={styles.listingTitle} numberOfLines={2}>{listing.title}</Text>
                        {listing.brand && (
                          <Text style={styles.listingBrand}>{listing.brand}</Text>
                        )}
                        <Text style={styles.listingPrice}>{formatPrice(listing.price, listing.currency)}</Text>
                        
                        <View style={styles.sellerRow}>
                          {listing.seller?.profilePhotoUrl ? (
                            <Image
                              source={{ uri: listing.seller.profilePhotoUrl }}
                              style={styles.sellerAvatar}
                            />
                          ) : (
                            <View style={styles.sellerAvatarPlaceholder}>
                              <Text style={styles.sellerAvatarText}>
                                {listing.seller?.name?.charAt(0) || "?"}
                              </Text>
                            </View>
                          )}
                          <Text style={styles.sellerName} numberOfLines={1}>
                            {listing.seller?.name || "Seller"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.statsRow}>
                        <View style={styles.stat}>
                          <Ionicons name="eye-outline" size={12} color={Colors.dark.textSecondary} />
                          <Text style={styles.statText}>{listing.viewCount}</Text>
                        </View>
                        <View style={styles.stat}>
                          <Ionicons name="heart-outline" size={12} color={Colors.dark.textSecondary} />
                          <Text style={styles.statText}>{listing.favoriteCount}</Text>
                        </View>
                      </View>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        )}

        <View style={{ height: insets.bottom + 100 }} />
      </ScrollView>

      <Pressable onPress={handleCreateListing} style={[styles.fab, { bottom: insets.bottom + 90 }]}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.primary + "CC"]}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={28} color={Colors.dark.buttonText} />
        </LinearGradient>
      </Pressable>

      <CreateListingModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          refetch();
        }}
      />
      </View>
    </LockedScreen>
  );
}

function CreateListingModal({ visible, onClose, onSuccess }: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("rackets");
  const [condition, setCondition] = useState("good");
  const [brand, setBrand] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const pickImages = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow access to your photos to add images.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 5 - images.length,
        quality: 0.8,
        aspect: [4, 3],
      });

      if (!result.canceled && result.assets.length > 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        setIsUploading(true);
        try {
          const formData = new FormData();
          
          for (const asset of result.assets) {
            const uri = asset.uri;
            const filename = uri.split("/").pop() || `image-${Date.now()}.jpg`;
            const match = /\.(\w+)$/.exec(filename);
            const mimeType = match ? `image/${match[1].toLowerCase()}` : "image/jpeg";
            
            if (Platform.OS === "web") {
              const response = await fetch(uri);
              const blob = await response.blob();
              formData.append("images", blob, filename);
            } else {
              formData.append("images", {
                uri,
                name: filename,
                type: mimeType,
              } as unknown as Blob);
            }
          }

          const response = await fetch(`${getApiUrl()}/api/player/marketplace/upload-images`, {
            method: "POST",
            body: formData,
            credentials: "include",
          });

          if (response.ok) {
            const data = await response.json();
            setImages(prev => [...prev, ...data.images].slice(0, 5));
          } else {
            const { parseUploadErrorResponse } = await import("@/lib/uploads");
            const { message } = await parseUploadErrorResponse(
              response,
              "Failed to upload images. Please try again.",
            );
            Alert.alert("Upload Failed", message);
          }
        } catch (uploadError) {
          console.error("Image upload error:", uploadError);
          Alert.alert("Upload Failed", "Failed to upload images. Please try again.");
        } finally {
          setIsUploading(false);
        }
      }
    } catch (error) {
      console.error("Image picker error:", error);
    }
  };

  const removeImage = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !price.trim()) {
      Alert.alert("Error", "Title and price are required");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/player/marketplace", {
        title: title.trim(),
        description: description.trim() || undefined,
        price,
        category,
        condition,
        brand: brand.trim() || undefined,
        images: images.length > 0 ? images : undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTitle("");
      setDescription("");
      setPrice("");
      setBrand("");
      setImages([]);
      onSuccess();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to create listing");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={modalStyles.container}>
        <View style={modalStyles.header}>
          <Pressable onPress={onClose} style={modalStyles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={modalStyles.title}>Create Listing</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView style={modalStyles.content} showsVerticalScrollIndicator={false}>
          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Photos (up to 5)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={modalStyles.imageRow}>
                {images.map((uri, index) => (
                  <View key={index} style={modalStyles.imageWrapper}>
                    <Image source={{ uri: `${getApiUrl()}${uri}` }} style={modalStyles.imagePreview} />
                    <Pressable onPress={() => removeImage(index)} style={modalStyles.removeImageButton}>
                      <Ionicons name="close-circle" size={22} color={Colors.dark.error} />
                    </Pressable>
                  </View>
                ))}
                {images.length < 5 && (
                  <Pressable onPress={pickImages} style={modalStyles.addImageButton} disabled={isUploading}>
                    {isUploading ? (
                      <Text style={modalStyles.uploadingText}>...</Text>
                    ) : (
                      <>
                        <Ionicons name="camera" size={28} color={Colors.dark.primary} />
                        <Text style={modalStyles.addImageText}>Add</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Title *</Text>
            <TextInput
              style={modalStyles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="What are you selling?"
              placeholderTextColor={Colors.dark.textSecondary}
            />
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Price *</Text>
            <TextInput
              style={modalStyles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="0"
              placeholderTextColor={Colors.dark.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={modalStyles.optionsRow}>
                {CATEGORIES.filter(c => c.key !== "all").map((cat) => (
                  <Pressable
                    key={cat.key}
                    onPress={() => setCategory(cat.key)}
                    style={[
                      modalStyles.optionChip,
                      category === cat.key && modalStyles.optionChipActive,
                    ]}
                  >
                    <Text style={[
                      modalStyles.optionChipText,
                      category === cat.key && modalStyles.optionChipTextActive,
                    ]}>
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Condition</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={modalStyles.optionsRow}>
                {CONDITIONS.map((cond) => (
                  <Pressable
                    key={cond.key}
                    onPress={() => setCondition(cond.key)}
                    style={[
                      modalStyles.optionChip,
                      condition === cond.key && modalStyles.optionChipActive,
                    ]}
                  >
                    <Text style={[
                      modalStyles.optionChipText,
                      condition === cond.key && modalStyles.optionChipTextActive,
                    ]}>
                      {cond.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Brand (optional)</Text>
            <TextInput
              style={modalStyles.input}
              value={brand}
              onChangeText={setBrand}
              placeholder="e.g., Wilson, Babolat"
              placeholderTextColor={Colors.dark.textSecondary}
            />
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>Description (optional)</Text>
            <TextInput
              style={[modalStyles.input, modalStyles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Tell buyers about your item..."
              placeholderTextColor={Colors.dark.textSecondary}
              multiline
              numberOfLines={4}
            />
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting || isUploading}
            style={[modalStyles.submitButton, (isSubmitting || isUploading) && { opacity: 0.5 }]}
          >
            <Text style={modalStyles.submitButtonText}>
              {isSubmitting ? "Creating..." : "Create Listing"}
            </Text>
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
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
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark.text,
  },
  categoryScroll: {
    flexGrow: 0,
    marginBottom: Spacing.sm,
  },
  categoryContainer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    gap: Spacing.xs,
  },
  categoryChipActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  categoryChipText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  categoryChipTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
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
    textAlign: "center",
  },
  emptyButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    marginTop: Spacing.md,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  listingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  listingCard: {
    width: CARD_WIDTH,
  },
  listingGradient: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
  },
  listingImage: {
    width: "100%",
    height: CARD_WIDTH,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  listingImagePlaceholder: {
    width: "100%",
    height: CARD_WIDTH,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  conditionBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  conditionText: {
    fontSize: 10,
    fontWeight: "600",
  },
  listingInfo: {
    padding: Spacing.md,
  },
  listingTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
    lineHeight: 18,
  },
  listingBrand: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginBottom: 4,
  },
  listingPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.primary,
    marginBottom: Spacing.sm,
  },
  sellerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  sellerAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  sellerAvatarPlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  sellerAvatarText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  sellerName: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  statText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
  },
  fabGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
}));

const modalStyles = makeReactiveStyles(() => StyleSheet.create({
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  optionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  optionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  optionChipActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  optionChipText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  optionChipTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  imageRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  imageWrapper: {
    position: "relative",
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  removeImageButton: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 11,
  },
  addImageButton: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "40",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  addImageText: {
    fontSize: 11,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  uploadingText: {
    fontSize: 16,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  submitButton: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
}));
