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
  Share,
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
import { apiRequest, apiFetch, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import * as Clipboard from "expo-clipboard";

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

const CHEER_EMOJIS = ["🔥", "⚡", "🎾", "💪", "🏆", "✨"];

const CONTEXT_BADGE_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  training: { bg: "#9AE66E20", text: "#9AE66E", icon: "tennisball" },
  match: { bg: "#FFD70020", text: "#FFD700", icon: "trophy" },
  event: { bg: "#FF6B3520", text: "#FF6B35", icon: "calendar" },
  group: { bg: "#4ECDC420", text: "#4ECDC4", icon: "people" },
  achievement: { bg: "#E040FB20", text: "#E040FB", icon: "ribbon" },
  free_play: { bg: "#00D9FF20", text: "#00D9FF", icon: "basketball" },
  session_completed: { bg: "#9AE66E20", text: "#9AE66E", icon: "checkmark-circle" },
  level_up: { bg: "#FFD70020", text: "#FFD700", icon: "arrow-up-circle" },
  badge_earned: { bg: "#E040FB20", text: "#E040FB", icon: "ribbon" },
  streak: { bg: "#FF6B3520", text: "#FF6B35", icon: "flame" },
  milestone: { bg: "#00D9FF20", text: "#00D9FF", icon: "flag" },
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

function MomentCard({ 
  post, 
  onReact, 
  onComment, 
  onShare, 
  onDelete,
  currentUserId 
}: { 
  post: Post; 
  onReact: (postId: string, type: string) => void;
  onComment: (postId: string) => void;
  onShare: (post: Post) => void;
  onDelete: (postId: string) => void;
  currentUserId?: string;
}) {
  const [showCheerPicker, setShowCheerPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const isOwnPost = currentUserId && post.authorId === currentUserId;
  
  const contextLabel = useMemo(() => {
    switch (post.contextType) {
      case "training": return "Training";
      case "match": return "Match";
      case "event": return "Event";
      case "group": return "Group";
      case "achievement": return "Achievement";
      case "free_play": return "Free Play";
      case "session_completed": return "Session";
      case "level_up": return "Level Up!";
      case "badge_earned": return "Badge";
      case "streak": return "Streak";
      case "milestone": return "Milestone";
      default: return "";
    }
  }, [post.contextType]);
  
  const contextStyle = CONTEXT_BADGE_STYLES[post.contextType] || CONTEXT_BADGE_STYLES.training;
  const hasMedia = post.mediaUrls && post.mediaUrls.length > 0;
  
  return (
    <Animated.View entering={FadeInDown.delay(100).springify()}>
      <View style={styles.momentCard}>
        {/* Photo-first layout - 65% of card when media present */}
        {hasMedia ? (
          <View style={styles.mediaSection}>
            <Image 
              source={{ uri: post.mediaUrls[0].startsWith("http") ? post.mediaUrls[0] : `${getApiUrl()}${post.mediaUrls[0]}` }} 
              style={styles.momentImage}
              resizeMode="cover"
            />
            {/* Context badge overlay on photo */}
            <View style={[styles.contextBadgeOverlay, { backgroundColor: contextStyle.bg }]}>
              <Ionicons name={contextStyle.icon as any} size={12} color={contextStyle.text} />
              <ThemedText style={[styles.contextBadgeText, { color: contextStyle.text }]}>
                {contextLabel}
              </ThemedText>
            </View>
            {post.mediaUrls.length > 1 ? (
              <View style={styles.mediaCountBadge}>
                <ThemedText style={styles.mediaCountText}>+{post.mediaUrls.length - 1}</ThemedText>
              </View>
            ) : null}
          </View>
        ) : (
          /* No media - show context badge in header area */
          <View style={styles.noMediaHeader}>
            <View style={[styles.contextBadgeLarge, { backgroundColor: contextStyle.bg }]}>
              <Ionicons name={contextStyle.icon as any} size={24} color={contextStyle.text} />
              <ThemedText style={[styles.contextBadgeLargeText, { color: contextStyle.text }]}>
                {contextLabel}
              </ThemedText>
            </View>
          </View>
        )}
        
        {/* Content section */}
        <View style={styles.momentContent}>
          {/* Author header with avatar, name, title */}
          <View style={styles.momentHeader}>
            <View style={styles.avatarGlow}>
              {post.author.photoUrl ? (
                <Image source={{ uri: post.author.photoUrl.startsWith("http") ? post.author.photoUrl : `${getApiUrl()}${post.author.photoUrl}` }} style={styles.momentAvatar} />
              ) : (
                <View style={[styles.momentAvatar, styles.avatarPlaceholder]}>
                  <ThemedText style={styles.avatarInitial}>
                    {(post.author.name || post.author.username || "?").charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
              )}
            </View>
            <View style={styles.authorMeta}>
              <View style={styles.nameAndTitle}>
                <ThemedText style={styles.momentAuthorName}>
                  {post.author.name || post.author.username}
                </ThemedText>
                {post.author.isCoach ? (
                  <View style={styles.coachTag}>
                    <ThemedText style={styles.coachTagText}>Coach</ThemedText>
                  </View>
                ) : null}
              </View>
              {/* Title badge with glow effect */}
              {post.author.title ? (
                <View style={styles.titleBadge}>
                  <ThemedText style={styles.titleBadgeText}>{post.author.title}</ThemedText>
                </View>
              ) : post.author.level ? (
                <View style={styles.titleBadge}>
                  <ThemedText style={styles.titleBadgeText}>Level {post.author.level}</ThemedText>
                </View>
              ) : null}
            </View>
            <ThemedText style={styles.momentTime}>{formatTimeAgo(post.createdAt)}</ThemedText>
          </View>
          
          {/* Caption */}
          {post.caption ? (
            <ThemedText style={styles.momentCaption}>{post.caption}</ThemedText>
          ) : null}
          
          {/* Actions row with cheers and XP */}
          <View style={styles.momentActions}>
            {/* Cheer button with emoji */}
            <Pressable 
              style={[styles.cheerButton, post.userReaction && styles.cheerButtonActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowCheerPicker(!showCheerPicker);
              }}
            >
              <ThemedText style={styles.cheerEmoji}>
                {post.userReaction ? "🔥" : "👏"}
              </ThemedText>
              <ThemedText style={[styles.cheerCount, post.userReaction && styles.cheerCountActive]}>
                {post.cheerCount || 0}
              </ThemedText>
              {/* XP indicator */}
              <View style={styles.xpBadge}>
                <ThemedText style={styles.xpBadgeText}>+5 XP</ThemedText>
              </View>
            </Pressable>
            
            {/* Comment button with preview */}
            <Pressable 
              style={styles.commentButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onComment(post.id);
              }}
            >
              <Ionicons name="chatbubble-outline" size={18} color={Colors.dark.textMuted} />
              <ThemedText style={styles.commentCount}>{post.commentCount || 0}</ThemedText>
            </Pressable>
            
            {/* Share button */}
            <Pressable 
              style={styles.shareButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onShare(post);
              }}
            >
              <Ionicons name="share-outline" size={18} color={Colors.dark.textMuted} />
            </Pressable>

            {/* Delete button for own posts */}
            {isOwnPost ? (
              <Pressable 
                style={styles.deleteButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onDelete(post.id);
                }}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
              </Pressable>
            ) : null}
          </View>
          
          {/* Emoji picker */}
          {showCheerPicker ? (
            <Animated.View entering={FadeIn.duration(150)} style={styles.cheerPicker}>
              {CHEER_EMOJIS.map((emoji, index) => (
                <Pressable 
                  key={index}
                  style={styles.cheerOption}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onReact(post.id, emoji);
                    setShowCheerPicker(false);
                  }}
                >
                  <ThemedText style={styles.cheerOptionEmoji}>{emoji}</ThemedText>
                </Pressable>
              ))}
            </Animated.View>
          ) : null}
        </View>
      </View>
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
  const filters: { key: FeedFilter; label: string; icon: string }[] = [
    { key: "for_you", label: "For You", icon: "sparkles" },
    { key: "friends", label: "Friends", icon: "people" },
    { key: "groups", label: "Groups", icon: "grid" },
    { key: "academy", label: "Academy", icon: "tennisball" },
    { key: "events", label: "Events", icon: "calendar" },
  ];

  return (
    <View style={styles.filterContainer}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterPills}
      >
        {filters.map((filter) => {
          const isActive = active === filter.key;
          return (
            <Pressable
              key={filter.key}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChange(filter.key);
              }}
            >
              <Ionicons 
                name={filter.icon as any} 
                size={14} 
                color={isActive ? Colors.dark.backgroundRoot : Colors.dark.textSecondary} 
              />
              <ThemedText style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                {filter.label}
              </ThemedText>
              {isActive ? (
                <View style={styles.xpSpark}>
                  <ThemedText style={styles.xpSparkText}>✨</ThemedText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

interface CommentsModalProps {
  visible: boolean;
  postId: string | null;
  onClose: () => void;
}

function CommentsModal({ visible, postId, onClose }: CommentsModalProps) {
  const insets = useSafeAreaInsets();
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  
  // Fetch comments for this post
  const { data: comments = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/social/posts", postId, "comments"],
    queryFn: async () => {
      if (!postId) return [];
      const response = await apiFetch(`/api/social/posts/${postId}/comments`);
      if (!response.ok) throw new Error("Failed to fetch comments");
      return response.json();
    },
    enabled: !!postId && visible,
  });
  
  const handleSubmitComment = async () => {
    if (!commentText.trim() || !postId || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await apiRequest("POST", `/api/social/posts/${postId}/comments`, { content: commentText.trim() });
      setCommentText("");
      refetch();
      // Also invalidate the main feed to update comment counts
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
    } catch (error) {
      console.log("Comment error:", error);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert("Failed to post comment. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalContainer}
      >
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, "#0a1a2e", Colors.dark.backgroundRoot]}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={[styles.modalHeader, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable onPress={onClose} style={{ padding: Spacing.sm }}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <ThemedText style={styles.modalTitle}>Comments</ThemedText>
          <View style={{ width: 32 }} />
        </View>
        
        <FlatList
          data={comments}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }) => (
            <View style={styles.commentItem}>
              <View style={styles.commentAvatar}>
                <ThemedText style={styles.commentAvatarText}>
                  {(item.author?.name || "?").charAt(0).toUpperCase()}
                </ThemedText>
              </View>
              <View style={styles.commentContent}>
                <ThemedText style={styles.commentAuthor}>{item.author?.name || "Unknown"}</ThemedText>
                <ThemedText style={styles.commentText}>{item.content}</ThemedText>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyComments}>
              <Ionicons name="chatbubble-outline" size={48} color={Colors.dark.textMuted} />
              <ThemedText style={styles.emptyCommentsText}>No comments yet</ThemedText>
              <ThemedText style={styles.emptyCommentsSubtext}>Be the first to comment!</ThemedText>
            </View>
          }
          contentContainerStyle={styles.commentsList}
        />
        
        <View style={[styles.commentInputContainer, { paddingBottom: insets.bottom + Spacing.md }]}>
          <TextInput
            style={styles.commentInput}
            placeholder="Write a comment..."
            placeholderTextColor={Colors.dark.textMuted}
            value={commentText}
            onChangeText={setCommentText}
            multiline
          />
          <Pressable 
            style={[styles.sendButton, (!commentText.trim() || isSubmitting) && styles.sendButtonDisabled]}
            onPress={handleSubmitComment}
            disabled={!commentText.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
      mediaTypes: ['images'],
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

  const [isUploading, setIsUploading] = useState(false);
  
  const handleSubmit = async () => {
    if (!selectedContext || isSubmitting || isUploading) return;
    
    setIsUploading(true);
    let uploadedMediaUrls: string[] = [];
    
    if (selectedImage) {
      try {
        const formData = new FormData();
        const uri = selectedImage;
        const ext = uri.includes(".") ? uri.split(".").pop()?.split("?")[0] || "jpg" : "jpg";
        const filename = `photo-${Date.now()}.${ext}`;
        const type = `image/${ext === "jpg" ? "jpeg" : ext}`;
        
        if (Platform.OS === "web") {
          const response = await fetch(uri);
          const blob = await response.blob();
          formData.append("images", blob, filename);
        } else {
          formData.append("images", {
            uri,
            name: filename,
            type,
          } as any);
        }
        
        const uploadResponse = await apiFetch("/api/social/posts/upload-images", {
          method: "POST",
          body: formData,
        });
        
        if (uploadResponse.ok) {
          const result = await uploadResponse.json();
          uploadedMediaUrls = result.images || [];
          console.log("[Social] Uploaded images:", uploadedMediaUrls);
        } else {
          const errorText = await uploadResponse.text();
          console.error("[Social] Upload failed:", errorText);
          Alert.alert("Error", "Failed to upload image. Please try again.");
          setIsUploading(false);
          return;
        }
      } catch (error) {
        console.error("[Social] Upload error:", error);
        Alert.alert("Error", "Failed to upload image. Please try again.");
        setIsUploading(false);
        return;
      }
    }
    
    console.log("[Social] Creating post with mediaUrls:", uploadedMediaUrls);
    onSubmit({
      contextType: selectedContext,
      caption: caption.trim(),
      mediaUrls: uploadedMediaUrls,
    });
    setIsUploading(false);
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
              disabled={isSubmitting || isUploading || !caption.trim()}
              style={[
                styles.postButton,
                (!caption.trim() || isSubmitting || isUploading) && styles.postButtonDisabled
              ]}
            >
              {(isSubmitting || isUploading) ? (
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
  const { user } = useAuth();
  const [filter, setFilter] = useState<FeedFilter>("for_you");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const chatFooterHeight = 70;
  
  const { data: feed = [], isLoading, refetch, isFetching } = useQuery<Post[]>({
    queryKey: ["/api/social/feed", { filter }],
    queryFn: async () => {
      const response = await apiFetch(`/api/social/feed?filter=${filter}`);
      if (!response.ok) throw new Error("Failed to fetch feed");
      return response.json();
    },
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
  
  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      return apiRequest("DELETE", `/api/social/posts/${postId}`);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete post. Please try again.");
    },
  });

  const handleReact = (postId: string, type: string) => {
    reactMutation.mutate({ postId, type });
  };

  const [selectedCommentPostId, setSelectedCommentPostId] = useState<string | null>(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  
  const handleComment = (postId: string) => {
    setSelectedCommentPostId(postId);
    setShowCommentModal(true);
  };

  const handleShare = async (post: Post) => {
    try {
      const message = post.caption 
        ? `Check out this moment from ${post.author.name || post.author.username}: "${post.caption}"` 
        : `Check out this moment from ${post.author.name || post.author.username}!`;
      
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(message);
        // Use window.alert for web compatibility
        if (typeof window !== "undefined") {
          window.alert("Copied to clipboard!");
        }
      } else {
        await Share.share({
          message,
          title: "Share Moment",
        });
      }
    } catch (error) {
      console.log("Share error:", error);
      try {
        await Clipboard.setStringAsync(post.caption || "Check out this moment!");
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.alert("Copied to clipboard!");
        }
      } catch (e) {
        console.log("Clipboard error:", e);
      }
    }
  };

  const handleDelete = (postId: string) => {
    // Use window.confirm for web, Alert.alert for native
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Are you sure you want to delete this post?")) {
        deletePostMutation.mutate(postId);
      }
    } else {
      Alert.alert(
        "Delete Post",
        "Are you sure you want to delete this post?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deletePostMutation.mutate(postId) }
        ]
      );
    }
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
            <MomentCard 
              post={item} 
              onReact={handleReact}
              onComment={handleComment}
              onShare={handleShare}
              onDelete={handleDelete}
              currentUserId={user?.id}
            />
          )}
          contentContainerStyle={[
            styles.feedList,
            { paddingBottom: tabBarHeight + chatFooterHeight + Spacing.xl }
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
      
      <CommentsModal
        visible={showCommentModal}
        postId={selectedCommentPostId}
        onClose={() => {
          setShowCommentModal(false);
          setSelectedCommentPostId(null);
        }}
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
  filterContainer: {
    paddingBottom: Spacing.sm,
  },
  filterPills: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
    alignItems: "center",
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterPillActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  filterPillText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  filterPillTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  xpSpark: {
    marginLeft: 2,
  },
  xpSparkText: {
    fontSize: 10,
  },
  filterTabs: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minWidth: 70,
    alignItems: "center",
  },
  filterTabActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  filterTabText: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  filterTabTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
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
  // New MomentCard styles - Photo-first premium design
  momentCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  mediaSection: {
    position: "relative",
  },
  momentImage: {
    width: "100%",
    aspectRatio: 4 / 5,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  contextBadgeOverlay: {
    position: "absolute",
    top: Spacing.sm,
    left: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  contextBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mediaCountBadge: {
    position: "absolute",
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  mediaCountText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  noMediaHeader: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  contextBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 20,
  },
  contextBadgeLargeText: {
    fontSize: 16,
    fontWeight: "700",
  },
  momentContent: {
    padding: Spacing.md,
  },
  momentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  avatarGlow: {
    borderRadius: 22,
    padding: 2,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "50",
  },
  momentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  authorMeta: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  nameAndTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  momentAuthorName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  coachTag: {
    backgroundColor: "#FFD700" + "25",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  coachTagText: {
    fontSize: 10,
    color: "#FFD700",
    fontWeight: "700",
  },
  titleBadge: {
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  titleBadgeText: {
    fontSize: 10,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  momentTime: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  momentCaption: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  momentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  cheerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cheerButtonActive: {
    backgroundColor: "#FF6B3520",
    borderColor: "#FF6B35",
  },
  cheerEmoji: {
    fontSize: 18,
  },
  cheerCount: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  cheerCountActive: {
    color: "#FF6B35",
  },
  xpBadge: {
    backgroundColor: Colors.dark.primary + "30",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
  },
  xpBadgeText: {
    fontSize: 10,
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  commentButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
  },
  commentCount: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  shareButton: {
    padding: 8,
  },
  deleteButton: {
    padding: 8,
    marginLeft: "auto",
  },
  cheerPicker: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
  },
  cheerOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cheerOptionEmoji: {
    fontSize: 22,
  },
  // Comments modal styles
  commentItem: {
    flexDirection: "row",
    padding: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary + "30",
    justifyContent: "center",
    alignItems: "center",
  },
  commentAvatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  commentContent: {
    flex: 1,
    gap: 4,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  commentText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  emptyComments: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
    gap: Spacing.md,
  },
  emptyCommentsText: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  emptyCommentsSubtext: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  commentsList: {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
  },
  commentInputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  commentInput: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    color: Colors.dark.text,
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: Colors.dark.primary + "50",
  },
});
