import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInUp } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { apiRequest } from "@/lib/query-client";

type FeedFilter = "for_you" | "friends" | "groups" | "academy" | "events";

interface Post {
  id: string;
  authorId: string;
  academyId: string;
  contextType: string;
  contextId?: string;
  caption?: string;
  mediaUrls: string[];
  mediaTypes: string[];
  visibility: string;
  cheerCount: number;
  commentCount: number;
  createdAt: string;
  author: {
    id: string;
    username?: string;
    name?: string;
    photoUrl?: string;
    ballLevel?: string;
    isCoach?: boolean;
    level?: number;
    title?: string;
  };
  userReaction: string | null;
}

type ContextType = "training" | "match" | "event" | "group" | "achievement" | "free_play";

interface ContextOption {
  type: ContextType;
  label: string;
  icon: string;
  color: string;
}

const CONTEXT_OPTIONS: ContextOption[] = [
  { type: "training", label: "Training", icon: "tennisball", color: "#9AE66E" },
  { type: "match", label: "Match", icon: "trophy", color: "#FFD700" },
  { type: "event", label: "Event", icon: "calendar", color: "#FF6B35" },
  { type: "group", label: "Group", icon: "people", color: "#4ECDC4" },
  { type: "achievement", label: "Achievement", icon: "ribbon", color: "#E040FB" },
  { type: "free_play", label: "Free Play", icon: "basketball", color: "#00D9FF" },
];

const REACTION_ICONS: Record<string, { name: string; color: string }> = {
  clap: { name: "hand-left", color: "#FFD700" },
  fire: { name: "flame", color: "#FF6B35" },
  tennis: { name: "tennisball", color: "#9AE66E" },
  muscle: { name: "fitness", color: "#4ECDC4" },
  star: { name: "star", color: "#E040FB" },
};

function formatTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return date.toLocaleDateString();
}

function getBallLevelColor(level?: string): string {
  const colors: Record<string, string> = {
    red: "#FF4444",
    orange: "#FF8C00",
    green: "#32CD32",
    yellow: "#FFD700",
  };
  return colors[level || ""] || Colors.dark.textSecondary;
}

function MomentCard({ post, onReact }: { post: Post; onReact: (postId: string, type: string) => void }) {
  const [showReactions, setShowReactions] = useState(false);
  
  const contextLabel = useMemo(() => {
    switch (post.contextType) {
      case "training": return "Training Session";
      case "match": return "Match Result";
      case "event": return "Event";
      case "group": return "Group Post";
      case "achievement": return "Achievement";
      case "free_play": return "Free Play";
      case "session_completed": return "Completed Session";
      case "level_up": return "Level Up!";
      case "badge_earned": return "Badge Earned";
      case "streak": return "Streak";
      case "milestone": return "Milestone";
      default: return "";
    }
  }, [post.contextType]);
  
  const contextColor = useMemo(() => {
    const colors: Record<string, string> = {
      training: "#9AE66E",
      match: "#FFD700",
      event: "#FF6B35",
      group: "#4ECDC4",
      achievement: "#E040FB",
      free_play: "#00D9FF",
      level_up: "#FFD700",
      badge_earned: "#E040FB",
    };
    return colors[post.contextType] || Colors.dark.primary;
  }, [post.contextType]);
  
  return (
    <Animated.View entering={FadeInDown.delay(100).springify()}>
      <Card style={styles.postCard}>
        <View style={styles.postHeader}>
          <View style={styles.authorInfo}>
            {post.author.photoUrl ? (
              <Image source={{ uri: post.author.photoUrl }} style={styles.authorAvatar} />
            ) : (
              <View style={[styles.authorAvatar, styles.avatarPlaceholder]}>
                <Ionicons 
                  name={post.author.isCoach ? "school" : "person"} 
                  size={20} 
                  color={Colors.dark.textSecondary} 
                />
              </View>
            )}
            <View style={styles.authorDetails}>
              <View style={styles.nameRow}>
                <ThemedText style={styles.authorName}>
                  {post.author.name || post.author.username}
                </ThemedText>
                {post.author.level ? (
                  <View style={styles.levelBadge}>
                    <ThemedText style={styles.levelBadgeText}>LVL {post.author.level}</ThemedText>
                  </View>
                ) : null}
                {post.author.ballLevel ? (
                  <View style={[styles.ballBadge, { backgroundColor: getBallLevelColor(post.author.ballLevel) }]}>
                    <Ionicons name="tennisball" size={10} color="#fff" />
                  </View>
                ) : null}
                {post.author.isCoach ? (
                  <View style={styles.coachBadge}>
                    <ThemedText style={styles.coachBadgeText}>Coach</ThemedText>
                  </View>
                ) : null}
              </View>
              <View style={styles.timeRow}>
                <ThemedText style={styles.timeText}>{formatTimeAgo(post.createdAt)}</ThemedText>
                {contextLabel ? (
                  <>
                    <View style={styles.dot} />
                    <ThemedText style={[styles.contextLabel, { color: contextColor }]}>{contextLabel}</ThemedText>
                  </>
                ) : null}
              </View>
              {post.author.title ? (
                <ThemedText style={styles.titleText}>{post.author.title}</ThemedText>
              ) : null}
            </View>
          </View>
        </View>
        
        {post.caption ? (
          <ThemedText style={styles.caption}>{post.caption}</ThemedText>
        ) : null}
        
        {post.mediaUrls && post.mediaUrls.length > 0 ? (
          <View style={styles.mediaContainer}>
            <Image 
              source={{ uri: post.mediaUrls[0] }} 
              style={styles.mediaImage}
              resizeMode="cover"
            />
            {post.mediaUrls.length > 1 ? (
              <View style={styles.moreMedia}>
                <ThemedText style={styles.moreMediaText}>+{post.mediaUrls.length - 1}</ThemedText>
              </View>
            ) : null}
          </View>
        ) : null}
        
        <View style={styles.postActions}>
          <Pressable 
            style={styles.actionButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowReactions(!showReactions);
            }}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowReactions(true);
            }}
          >
            <Ionicons 
              name={post.userReaction ? "heart" : "heart-outline"} 
              size={22} 
              color={post.userReaction ? "#FF6B6B" : Colors.dark.textSecondary} 
            />
            <ThemedText style={styles.actionCount}>{post.cheerCount || ""}</ThemedText>
          </Pressable>
          
          <Pressable style={styles.actionButton}>
            <Ionicons name="chatbubble-outline" size={20} color={Colors.dark.textSecondary} />
            <ThemedText style={styles.actionCount}>{post.commentCount || ""}</ThemedText>
          </Pressable>
          
          <Pressable style={styles.actionButton}>
            <Ionicons name="share-outline" size={20} color={Colors.dark.textSecondary} />
          </Pressable>
        </View>
        
        {showReactions ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.reactionPicker}>
            {Object.entries(REACTION_ICONS).map(([type, icon]) => (
              <Pressable 
                key={type}
                style={[
                  styles.reactionOption,
                  post.userReaction === type && styles.reactionSelected
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onReact(post.id, type);
                  setShowReactions(false);
                }}
              >
                <Ionicons 
                  name={icon.name as any} 
                  size={24} 
                  color={icon.color} 
                />
              </Pressable>
            ))}
          </Animated.View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

function EmptyFeed({ filter }: { filter: FeedFilter }) {
  const getMessage = () => {
    switch (filter) {
      case "friends":
        return "No moments from friends yet. Connect with players to see their updates!";
      case "groups":
        return "No group posts yet. Join a group to see their moments!";
      case "academy":
        return "No academy moments yet. Be the first to share!";
      case "events":
        return "No event updates yet. Check back during events!";
      default:
        return "Complete a session or achieve something to share your first Moment!";
    }
  };

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="sparkles" size={48} color={Colors.dark.primary} />
      </View>
      <ThemedText style={styles.emptyTitle}>No Moments Yet</ThemedText>
      <ThemedText style={styles.emptySubtitle}>{getMessage()}</ThemedText>
    </View>
  );
}

function FilterTabs({ active, onChange }: { active: FeedFilter; onChange: (f: FeedFilter) => void }) {
  const filters: { key: FeedFilter; label: string }[] = [
    { key: "for_you", label: "For You" },
    { key: "friends", label: "Friends" },
    { key: "groups", label: "Groups" },
    { key: "academy", label: "Academy" },
    { key: "events", label: "Events" },
  ];

  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterTabs}
    >
      {filters.map((filter) => (
        <Pressable
          key={filter.key}
          style={[styles.filterTab, active === filter.key && styles.filterTabActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(filter.key);
          }}
        >
          <ThemedText style={[styles.filterTabText, active === filter.key && styles.filterTabTextActive]}>
            {filter.label}
          </ThemedText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

interface CreateMomentModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { contextType: string; caption: string; mediaUrls: string[] }) => void;
  isSubmitting: boolean;
}

function CreateMomentModal({ visible, onClose, onSubmit, isSubmitting }: CreateMomentModalProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"context" | "content">("context");
  const [selectedContext, setSelectedContext] = useState<ContextType | null>(null);
  const [caption, setCaption] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your photos to share moments.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your camera to take photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handleSubmit = () => {
    if (!selectedContext) return;
    
    onSubmit({
      contextType: selectedContext,
      caption: caption.trim(),
      mediaUrls: selectedImage ? [selectedImage] : [],
    });
  };

  const handleClose = () => {
    setStep("context");
    setSelectedContext(null);
    setCaption("");
    setSelectedImage(null);
    onClose();
  };

  const handleSelectContext = (context: ContextType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedContext(context);
    setStep("content");
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalContainer}
      >
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, "#0a1a2e", Colors.dark.backgroundRoot]}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={[styles.modalHeader, { paddingTop: insets.top + Spacing.sm }]}>
          <Pressable onPress={handleClose} style={styles.modalCloseButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <ThemedText style={styles.modalTitle}>
            {step === "context" ? "New Moment" : "Share Your Moment"}
          </ThemedText>
          {step === "content" ? (
            <Pressable 
              onPress={handleSubmit}
              disabled={isSubmitting || !caption.trim()}
              style={[
                styles.postButton,
                (!caption.trim() || isSubmitting) && styles.postButtonDisabled
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.postButtonText}>Post</ThemedText>
              )}
            </Pressable>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        {step === "context" ? (
          <Animated.View entering={FadeIn} style={styles.contextStep}>
            <ThemedText style={styles.contextPrompt}>What are you sharing?</ThemedText>
            <View style={styles.contextGrid}>
              {CONTEXT_OPTIONS.map((option) => (
                <Pressable
                  key={option.type}
                  style={styles.contextOption}
                  onPress={() => handleSelectContext(option.type)}
                >
                  <View style={[styles.contextIconContainer, { backgroundColor: option.color + "20" }]}>
                    <Ionicons name={option.icon as any} size={32} color={option.color} />
                  </View>
                  <ThemedText style={styles.contextOptionLabel}>{option.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={SlideInUp} style={styles.contentStep}>
            <View style={styles.selectedContextBadge}>
              {selectedContext ? (
                <>
                  <Ionicons 
                    name={CONTEXT_OPTIONS.find(c => c.type === selectedContext)?.icon as any} 
                    size={16} 
                    color={CONTEXT_OPTIONS.find(c => c.type === selectedContext)?.color} 
                  />
                  <ThemedText style={styles.selectedContextText}>
                    {CONTEXT_OPTIONS.find(c => c.type === selectedContext)?.label}
                  </ThemedText>
                  <Pressable onPress={() => setStep("context")}>
                    <Ionicons name="pencil" size={14} color={Colors.dark.textSecondary} />
                  </Pressable>
                </>
              ) : null}
            </View>

            <TextInput
              style={styles.captionInput}
              placeholder="What's happening on court?"
              placeholderTextColor={Colors.dark.textSecondary}
              value={caption}
              onChangeText={setCaption}
              maxLength={280}
              multiline
              autoFocus
            />
            
            <ThemedText style={styles.charCount}>{caption.length}/280</ThemedText>

            {selectedImage ? (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
                <Pressable 
                  style={styles.removeImageButton}
                  onPress={() => setSelectedImage(null)}
                >
                  <Ionicons name="close-circle" size={28} color="#fff" />
                </Pressable>
              </View>
            ) : null}

            <View style={styles.mediaButtons}>
              <Pressable style={styles.mediaButton} onPress={handlePickImage}>
                <Ionicons name="image" size={24} color={Colors.dark.primary} />
                <ThemedText style={styles.mediaButtonText}>Gallery</ThemedText>
              </Pressable>
              <Pressable style={styles.mediaButton} onPress={handleTakePhoto}>
                <Ionicons name="camera" size={24} color={Colors.dark.primary} />
                <ThemedText style={styles.mediaButtonText}>Camera</ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FeedFilter>("for_you");
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const { data: feed = [], isLoading, refetch, isFetching } = useQuery<Post[]>({
    queryKey: ["/api/social/feed", filter],
  });
  
  const { data: highlights } = useQuery<{ newMoments: number; openToPlay: number }>({
    queryKey: ["/api/social/highlights"],
  });
  
  const reactMutation = useMutation({
    mutationFn: async ({ postId, type }: { postId: string; type: string }) => {
      return apiRequest("POST", `/api/social/posts/${postId}/reactions`, { reactionType: type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
    },
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: { contextType: string; caption: string; mediaUrls: string[] }) => {
      return apiRequest("POST", "/api/social/posts", {
        contextType: data.contextType,
        caption: data.caption,
        mediaUrls: data.mediaUrls,
        mediaTypes: data.mediaUrls.map(() => "image"),
        visibility: "academy",
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
      setShowCreateModal(false);
    },
    onError: () => {
      Alert.alert("Error", "Failed to create moment. Please try again.");
    },
  });
  
  const handleReact = (postId: string, type: string) => {
    reactMutation.mutate({ postId, type });
  };

  const handleCreateMoment = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCreateModal(true);
  };
  
  return (
    <ThemedView style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, "#0a1a2e", Colors.dark.backgroundRoot]}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <ThemedText style={styles.title}>Community</ThemedText>
        
        <View style={styles.headerActions}>
          {highlights?.openToPlay && highlights.openToPlay > 0 ? (
            <Pressable style={styles.openToPlayBadge}>
              <Ionicons name="tennisball" size={16} color={Colors.dark.primary} />
              <ThemedText style={styles.openToPlayText}>{highlights.openToPlay} Open</ThemedText>
            </Pressable>
          ) : null}
          <Pressable 
            style={styles.headerButton}
            onPress={handleCreateMoment}
            testID="button-create-moment"
          >
            <View style={styles.addButton}>
              <Ionicons name="add" size={22} color="#fff" />
            </View>
          </Pressable>
        </View>
      </View>
      
      <FilterTabs active={filter} onChange={setFilter} />
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MomentCard post={item} onReact={handleReact} />
          )}
          contentContainerStyle={[
            styles.feedList,
            { paddingBottom: tabBarHeight + Spacing.xl }
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={Colors.dark.primary}
            />
          }
          ListEmptyComponent={<EmptyFeed filter={filter} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <CreateMomentModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={(data) => createPostMutation.mutate(data)}
        isSubmitting={createPostMutation.isPending}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  openToPlayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  openToPlayText: {
    fontSize: 12,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  filterTabs: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  filterTabActive: {
    backgroundColor: Colors.dark.primary,
  },
  filterTabText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  filterTabTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  feedList: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  postCard: {
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  postHeader: {
    marginBottom: Spacing.sm,
  },
  authorInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  authorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  authorDetails: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  authorName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  levelBadge: {
    backgroundColor: Colors.dark.primary + "30",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  levelBadgeText: {
    fontSize: 10,
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  ballBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  coachBadge: {
    backgroundColor: "#FFD700" + "30",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  coachBadgeText: {
    fontSize: 10,
    color: "#FFD700",
    fontWeight: "600",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  timeText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.dark.textSecondary,
    marginHorizontal: 6,
  },
  contextLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  titleText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
    marginTop: 2,
  },
  caption: {
    fontSize: 15,
    color: Colors.dark.text,
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  mediaContainer: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  mediaImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  moreMedia: {
    position: "absolute",
    right: Spacing.sm,
    bottom: Spacing.sm,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  moreMediaText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: Spacing.xs,
  },
  actionCount: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  reactionPicker: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    marginTop: Spacing.sm,
  },
  reactionOption: {
    padding: Spacing.sm,
    borderRadius: 20,
  },
  reactionSelected: {
    backgroundColor: Colors.dark.primary + "30",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  postButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    minWidth: 60,
    alignItems: "center",
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
  postButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  contextStep: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  contextPrompt: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  contextGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  contextOption: {
    width: 100,
    alignItems: "center",
    gap: Spacing.sm,
  },
  contextIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
  },
  contextOptionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  contentStep: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  selectedContextBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 16,
    marginBottom: Spacing.md,
  },
  selectedContextText: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  captionInput: {
    fontSize: 18,
    color: Colors.dark.text,
    minHeight: 100,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  imagePreviewContainer: {
    marginTop: Spacing.md,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  imagePreview: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  removeImageButton: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
  },
  mediaButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  mediaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
  },
  mediaButtonText: {
    fontSize: 14,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
});
