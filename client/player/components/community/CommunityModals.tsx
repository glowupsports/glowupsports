import logger from "@/lib/logger";
import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Share,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown, SlideInUp, useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { apiRequest, apiFetch, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import {
  type Achievement,
  type FriendActivity,
  type ContextType,
  CONTEXT_OPTIONS,
  CONTEXT_BADGE_STYLES,
  DRAWER_HEIGHT,
} from "./CommunityTypes";

interface CommentsModalProps {
  visible: boolean;
  postId: string | null;
  onClose: () => void;
}

export function CommentsModal({ visible, postId, onClose }: CommentsModalProps) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 85;
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string; text: string } | null>(null);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const translateY = useSharedValue(DRAWER_HEIGHT);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 150 });
    } else {
      translateY.value = withSpring(DRAWER_HEIGHT, { damping: 20, stiffness: 150 });
      setReplyingTo(null);
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

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

  const { data: myLikedData } = useQuery<{ likedCommentIds: string[] }>({
    queryKey: ["/api/social/posts", postId, "my-liked-comments"],
    queryFn: async () => {
      if (!postId) return { likedCommentIds: [] };
      const response = await apiFetch(`/api/social/posts/${postId}/my-liked-comments`);
      if (!response.ok) return { likedCommentIds: [] };
      return response.json();
    },
    enabled: !!postId && visible,
  });

  useEffect(() => {
    if (myLikedData?.likedCommentIds) {
      setLikedComments(new Set(myLikedData.likedCommentIds));
    }
  }, [myLikedData]);

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !postId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const payload: any = { text: commentText.trim() };
      if (replyingTo) {
        payload.parentId = replyingTo.id;
      }
      await apiRequest("POST", `/api/social/posts/${postId}/comments`, payload);
      setCommentText("");
      setReplyingTo(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
    } catch (error) {
      logger.log("Comment error:", error);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert("Failed to post comment. Please try again.");
      } else {
        Alert.alert("Error", "Failed to post comment. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLike = async (commentId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setLikedComments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });

    try {
      await apiRequest("POST", `/api/social/comments/${commentId}/like`);
      refetch();
    } catch (error) {
      logger.log("Like error:", error);
      setLikedComments(prev => {
        const newSet = new Set(prev);
        if (newSet.has(commentId)) {
          newSet.delete(commentId);
        } else {
          newSet.add(commentId);
        }
        return newSet;
      });
    }
  };

  const handleReply = (comment: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReplyingTo({
      id: comment.id,
      name: comment.author?.name || "Unknown",
      text: comment.text || comment.content || ""
    });
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await apiRequest("DELETE", `/api/social/comments/${commentId}`);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
    } catch (error) {
      logger.log("Delete comment error:", error);
    }
  };

  const toggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(!isExpanded);
  };

  if (!visible) return null;

  return (
    <>
      <Pressable
        style={commentStyles.drawerBackdrop}
        onPress={onClose}
      />
      <Animated.View style={[commentStyles.commentsDrawer, animatedStyle, { bottom: tabBarHeight, height: isExpanded ? "85%" : DRAWER_HEIGHT }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
          style={StyleSheet.absoluteFill}
        />

        <View style={commentStyles.drawerHandle}>
          <View style={commentStyles.drawerHandleBar} />
        </View>

        <View style={commentStyles.drawerHeader}>
          <ThemedText style={commentStyles.drawerTitle}>Comments</ThemedText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable onPress={toggleExpand} style={commentStyles.drawerCloseButton}>
              <Ionicons name={isExpanded ? "contract-outline" : "expand-outline"} size={18} color={Colors.dark.text} />
            </Pressable>
            <Pressable onPress={onClose} style={commentStyles.drawerCloseButton}>
              <Ionicons name="close" size={20} color={Colors.dark.text} />
            </Pressable>
          </View>
        </View>

        <FlatList
          data={comments}
          keyExtractor={(item: any) => item.id}
          style={{ flex: 1, maxHeight: isExpanded ? "100%" : DRAWER_HEIGHT - 160 }}
          renderItem={({ item }) => {
            const isLiked = likedComments.has(item.id);
            const likeCount = item.likeCount || 0;
            const hasPhoto = item.author?.photoUrl;
            const isReply = !!item.replyToName || !!item.parentId;

            return (
              <View style={[commentStyles.commentItem, isReply && commentStyles.commentItemReply]}>
                {hasPhoto ? (
                  <Image
                    source={{ uri: item.author.photoUrl.startsWith("http") ? item.author.photoUrl : `${getApiUrl()}${item.author.photoUrl}` }}
                    style={commentStyles.commentAvatarImage}
                  />
                ) : (
                  <View style={commentStyles.commentAvatar}>
                    <ThemedText style={commentStyles.commentAvatarText}>
                      {(item.author?.name || "?").charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                )}
                <View style={commentStyles.commentContent}>
                  <ThemedText style={commentStyles.commentAuthor}>{item.author?.name || "Unknown"}</ThemedText>
                  {item.replyToName && (
                    <View style={commentStyles.replyBadge}>
                      <Ionicons name="return-down-forward" size={10} color={Colors.dark.primary} />
                      <ThemedText style={commentStyles.replyBadgeText}>@{item.replyToName}</ThemedText>
                    </View>
                  )}
                  <ThemedText style={commentStyles.commentText}>{item.text || item.content || ""}</ThemedText>
                  <View style={commentStyles.commentActions}>
                    <Pressable style={commentStyles.commentActionBtn} onPress={() => handleLike(item.id)}>
                      <Ionicons
                        name={isLiked ? "heart" : "heart-outline"}
                        size={14}
                        color={isLiked ? "#EF4444" : Colors.dark.textMuted}
                      />
                      {likeCount > 0 && (
                        <ThemedText style={[commentStyles.commentActionText, isLiked && { color: "#EF4444" }]}>
                          {likeCount}
                        </ThemedText>
                      )}
                    </Pressable>
                    <Pressable style={commentStyles.commentActionBtn} onPress={() => handleReply(item)}>
                      <Ionicons name="arrow-undo-outline" size={14} color={Colors.dark.textMuted} />
                      <ThemedText style={commentStyles.commentActionText}>Reply</ThemedText>
                    </Pressable>
                    {item.authorId === user?.id && (
                      <Pressable style={commentStyles.commentActionBtn} onPress={() => handleDeleteComment(item.id)}>
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={commentStyles.emptyCommentsSmall}>
              <Ionicons name="chatbubble-outline" size={32} color={Colors.dark.textMuted} />
              <ThemedText style={commentStyles.emptyCommentsText}>No comments yet</ThemedText>
            </View>
          }
          contentContainerStyle={{ paddingHorizontal: Spacing.md }}
        />

        {replyingTo && (
          <View style={commentStyles.replyingToBar}>
            <View style={commentStyles.replyingToContent}>
              <ThemedText style={commentStyles.replyingToLabel}>Replying to</ThemedText>
              <ThemedText style={commentStyles.replyingToName}>@{replyingTo.name}</ThemedText>
              <ThemedText style={commentStyles.replyingToText} numberOfLines={1}>{replyingTo.text}</ThemedText>
            </View>
            <Pressable onPress={() => setReplyingTo(null)}>
              <Ionicons name="close-circle" size={20} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
        )}

        <View style={[commentStyles.drawerInputContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom : Spacing.md }]}>
          <TextInput
            style={commentStyles.commentInput}
            placeholder={replyingTo ? `Reply to @${replyingTo.name}...` : "Write a comment..."}
            placeholderTextColor={Colors.dark.textMuted}
            value={commentText}
            onChangeText={setCommentText}
            multiline
          />
          <Pressable
            style={[commentStyles.sendButton, (!commentText.trim() || isSubmitting) && commentStyles.sendButtonDisabled]}
            onPress={handleSubmitComment}
            disabled={!commentText.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <Ionicons name="send" size={18} color={Colors.dark.buttonText} />
            )}
          </Pressable>
        </View>
      </Animated.View>
    </>
  );
}

interface SharePreviewModalProps {
  visible: boolean;
  achievement: Achievement | null;
  onClose: () => void;
}

const SHARE_BACKGROUNDS = [
  { id: "neon", name: "Neon Glow", colors: ["#0B0D10", "#1a1a2e", "#16213e"] as const },
  { id: "court", name: "Court Green", colors: ["#0B0D10", "#0d2818", "#1e4d2b"] as const },
  { id: "gold", name: "Champion Gold", colors: ["#0B0D10", "#2d1f00", "#4a3200"] as const },
  { id: "purple", name: "Royal Purple", colors: ["#0B0D10", "#1a0a2e", "#2d1b4e"] as const },
  { id: "fire", name: "On Fire", colors: ["#0B0D10", "#2d0a00", "#4a1a00"] as const },
];

export function SharePreviewModal({ visible, achievement, onClose }: SharePreviewModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedBg, setSelectedBg] = useState(SHARE_BACKGROUNDS[0]);
  const [caption, setCaption] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (visible && achievement) {
      setCaption(`${achievement.title} - ${achievement.description}`);
    }
  }, [visible, achievement]);

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedPhoto(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your camera.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedPhoto(result.assets[0].uri);
    }
  };

  const handleShare = async () => {
    if (!achievement) return;
    setIsSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const shareMessage = `${caption}\n\nAchieved on Glow Up Tennis`;
      await Share.share({
        message: shareMessage,
        title: achievement.title,
      });
    } catch (error) {
      console.error("Share error:", error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleClose = () => {
    setSelectedPhoto(null);
    setCaption("");
    setSelectedBg(SHARE_BACKGROUNDS[0]);
    onClose();
  };

  const gradient: [string, string] = achievement ? (
    achievement.type === "match_won" ? ["#FFD700", "#FF8C00"] :
    achievement.type === "level_up" ? ["#C8FF3D", "#7CFC00"] :
    achievement.type === "streak" ? ["#FF6B35", "#FF4500"] :
    achievement.type === "badge" ? ["#E040FB", "#9C27B0"] :
    ["#00E5FF", "#00BFFF"]
  ) : ["#C8FF3D", "#7CFC00"];

  if (!visible || !achievement) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={shareStyles.container}>
        <LinearGradient
          colors={selectedBg.colors as unknown as readonly [string, string, ...string[]]}
          style={StyleSheet.absoluteFill}
        />

        <View style={[shareStyles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <Pressable onPress={handleClose} style={shareStyles.closeBtn}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <ThemedText style={shareStyles.headerTitle}>Share Achievement</ThemedText>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={shareStyles.content}
          contentContainerStyle={shareStyles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={shareStyles.previewCard}>
            <LinearGradient
              colors={selectedBg.colors as unknown as readonly [string, string, ...string[]]}
              style={shareStyles.previewGradient}
            >
              {selectedPhoto ? (
                <Pressable onPress={handlePickPhoto} style={shareStyles.photoContainer}>
                  <Image source={{ uri: selectedPhoto }} style={shareStyles.photo} contentFit="cover" />
                  <View style={shareStyles.photoOverlay}>
                    <Ionicons name="camera" size={24} color="#fff" />
                    <ThemedText style={shareStyles.photoOverlayText}>Change Photo</ThemedText>
                  </View>
                </Pressable>
              ) : (
                <View style={shareStyles.photoPlaceholder}>
                  <View style={shareStyles.photoActions}>
                    <Pressable style={shareStyles.photoBtn} onPress={handleTakePhoto}>
                      <Ionicons name="camera" size={28} color={Colors.dark.primary} />
                      <ThemedText style={shareStyles.photoBtnText}>Camera</ThemedText>
                    </Pressable>
                    <Pressable style={shareStyles.photoBtn} onPress={handlePickPhoto}>
                      <Ionicons name="images" size={28} color={Colors.dark.primary} />
                      <ThemedText style={shareStyles.photoBtnText}>Gallery</ThemedText>
                    </Pressable>
                  </View>
                  <ThemedText style={shareStyles.photoHint}>Add a photo to personalize</ThemedText>
                </View>
              )}

              <View style={shareStyles.achievementInfo}>
                <LinearGradient
                  colors={gradient as readonly [string, string, ...string[]]}
                  style={shareStyles.achievementIcon}
                >
                  <Ionicons name={achievement.icon as any} size={32} color={Colors.dark.buttonText} />
                </LinearGradient>

                <ThemedText style={[shareStyles.achievementTitle, { color: gradient[0] }]}>
                  {achievement.title}
                </ThemedText>

                {achievement.value ? (
                  <View style={[shareStyles.achievementValue, { backgroundColor: gradient[0] }]}>
                    <ThemedText style={shareStyles.achievementValueText}>{achievement.value}</ThemedText>
                  </View>
                ) : null}

                <ThemedText style={shareStyles.achievementDesc}>{achievement.description}</ThemedText>
              </View>

              <View style={shareStyles.userBadge}>
                <View style={[shareStyles.userAvatar, { backgroundColor: gradient[0] }]}>
                  <ThemedText style={shareStyles.userAvatarText}>
                    {(user?.username || "P").charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
                <View>
                  <ThemedText style={shareStyles.userName}>{user?.username || "Player"}</ThemedText>
                  <ThemedText style={shareStyles.appBrand}>Glow Up Tennis</ThemedText>
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={shareStyles.captionSection}>
            <ThemedText style={shareStyles.sectionTitle}>Caption</ThemedText>
            <TextInput
              style={shareStyles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Write something about this achievement..."
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              maxLength={280}
            />
            <ThemedText style={shareStyles.charCount}>{caption.length}/280</ThemedText>
          </View>

          <View style={shareStyles.bgSection}>
            <ThemedText style={shareStyles.sectionTitle}>Background</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={shareStyles.bgOptions}>
                {SHARE_BACKGROUNDS.map((bg) => (
                  <Pressable
                    key={bg.id}
                    style={[
                      shareStyles.bgOption,
                      selectedBg.id === bg.id && shareStyles.bgOptionActive
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedBg(bg);
                    }}
                  >
                    <LinearGradient
                      colors={bg.colors as unknown as readonly [string, string, ...string[]]}
                      style={shareStyles.bgOptionGradient}
                    />
                    <ThemedText style={shareStyles.bgOptionName}>{bg.name}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </ScrollView>

        <View style={[shareStyles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Pressable
            style={shareStyles.shareBtn}
            onPress={handleShare}
            disabled={isSharing}
          >
            <LinearGradient
              colors={["#C8FF3D", "#7CFC00"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={shareStyles.shareBtnGradient}
            >
              {isSharing ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <>
                  <Ionicons name="share-social" size={20} color={Colors.dark.buttonText} />
                  <ThemedText style={shareStyles.shareBtnText}>Share to Story</ThemedText>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

interface PostDetailModalProps {
  visible: boolean;
  post: FriendActivity | null;
  onClose: () => void;
  onCheer: (postId: string) => void;
}

interface CommentData {
  id: string;
  author: { id: string; name: string; photoUrl?: string | null };
  text: string;
  createdAt: string;
  likeCount: number;
}

export function PostDetailModal({ visible, post, onClose, onCheer }: PostDetailModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isOwnPost = !!user && !!post && user.id === post.playerId;

  const handleMoreOptions = () => {
    if (!post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "Post Options",
      undefined,
      [
        {
          text: "Report Post",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Report Post",
              "Why are you reporting this post?",
              [
                { text: "Inappropriate", onPress: () => submitReport("Inappropriate") },
                { text: "Spam", onPress: () => submitReport("Spam") },
                { text: "Harassment", onPress: () => submitReport("Harassment") },
                { text: "Other", onPress: () => submitReport("Other") },
                { text: "Cancel", style: "cancel" },
              ]
            );
          },
        },
        {
          text: "Block User",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Block User",
              `Block ${post.playerName}? Their posts will no longer appear in your feed.`,
              [
                {
                  text: "Block",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await apiRequest("POST", `/api/social/users/${post.playerId}/block`, {});
                      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
                      setTimeout(() => onClose(), 350);
                    } catch (err) {
                      Alert.alert("Error", "Failed to block user. Please try again.");
                    }
                  },
                },
                { text: "Cancel", style: "cancel" },
              ]
            );
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const submitReport = async (reason: string) => {
    if (!post) return;
    try {
      await apiRequest("POST", `/api/social/posts/${post.id}/report`, { reason });
      Alert.alert("Report Submitted", "Thank you for helping keep the community safe. We'll review this post.");
    } catch (err) {
      Alert.alert("Error", "Failed to submit report. Please try again.");
    }
  };

  const { data: commentsData, refetch: refetchComments } = useQuery<CommentData[]>({
    queryKey: ["/api/social/posts", post?.id, "comments"],
    queryFn: async () => {
      if (!post?.id) return [];
      const response = await apiFetch(`/api/social/posts/${post.id}/comments`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: visible && !!post?.id,
  });

  const comments = commentsData || [];

  const submitCommentMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiFetch(`/api/social/posts/${post?.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error("Failed to post comment");
      return response.json();
    },
    onSuccess: () => {
      refetchComments();
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
    },
  });

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !post?.id) return;
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await submitCommentMutation.mutateAsync(commentText.trim());
      setCommentText("");
    } catch (error) {
      console.error("Failed to post comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  };

  const getContextStyle = (type: string) => {
    return CONTEXT_BADGE_STYLES[type] || CONTEXT_BADGE_STYLES.training;
  };

  const getContextLabel = (type: string) => {
    switch (type) {
      case "match_won": return "Match Won";
      case "level_up": return "Level Up";
      case "training": return "Training";
      case "free_play": return "Free Play";
      default: return type.replace("_", " ");
    }
  };

  if (!visible || !post) return null;

  const contextStyle = getContextStyle(post.type);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={postDetailStyles.container}>
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, "#0a1a2e", Colors.dark.backgroundRoot]}
          style={StyleSheet.absoluteFill}
        />

        <View style={[postDetailStyles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <Pressable onPress={onClose} style={postDetailStyles.closeBtn}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <ThemedText style={postDetailStyles.headerTitle}>Post</ThemedText>
          {isOwnPost ? (
            <View style={{ width: 40 }} />
          ) : (
            <Pressable onPress={handleMoreOptions} style={postDetailStyles.closeBtn} accessibilityLabel="More options">
              <Ionicons name="ellipsis-horizontal" size={22} color={Colors.dark.text} />
            </Pressable>
          )}
        </View>

        <ScrollView style={postDetailStyles.content} showsVerticalScrollIndicator={false}>
          <View style={postDetailStyles.postCard}>
            <View style={postDetailStyles.authorRow}>
              <View style={[postDetailStyles.avatar, { backgroundColor: Colors.dark.primary }]}>
                <ThemedText style={postDetailStyles.avatarText}>
                  {post.playerName.charAt(0).toUpperCase()}
                </ThemedText>
              </View>
              <View style={postDetailStyles.authorInfo}>
                <View style={postDetailStyles.nameRow}>
                  <ThemedText style={postDetailStyles.authorName}>{post.playerName}</ThemedText>
                  <View style={[postDetailStyles.levelBadge, { backgroundColor: Colors.dark.primary }]}>
                    <ThemedText style={postDetailStyles.levelText}>Lvl {post.level}</ThemedText>
                  </View>
                </View>
                <View style={postDetailStyles.contextRow}>
                  <View style={[postDetailStyles.contextBadge, { backgroundColor: contextStyle.bg }]}>
                    <Ionicons name={contextStyle.icon as any} size={12} color={contextStyle.text} />
                    <ThemedText style={[postDetailStyles.contextText, { color: contextStyle.text }]}>
                      {getContextLabel(post.type)}
                    </ThemedText>
                  </View>
                  <ThemedText style={postDetailStyles.time}>{post.time}</ThemedText>
                </View>
              </View>
            </View>

            <ThemedText style={postDetailStyles.caption}>{post.caption}</ThemedText>

            <View style={postDetailStyles.actions}>
              <View style={postDetailStyles.reactions}>
                <ThemedText style={postDetailStyles.reactionEmoji}>{"\u{1F525}"}</ThemedText>
                <ThemedText style={postDetailStyles.reactionCount}>{post.cheers} cheers</ThemedText>
              </View>
              <Pressable
                style={postDetailStyles.cheerBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onCheer(post.id);
                }}
              >
                <Ionicons name="flame" size={18} color={Colors.dark.primary} />
                <ThemedText style={postDetailStyles.cheerBtnText}>Cheer</ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={postDetailStyles.commentsSection}>
            <ThemedText style={postDetailStyles.commentsTitle}>
              Comments ({comments.length})
            </ThemedText>

            {comments.map((comment) => (
              <View key={comment.id} style={postDetailStyles.commentItem}>
                <View style={postDetailStyles.commentAvatar}>
                  <ThemedText style={postDetailStyles.commentAvatarText}>
                    {(comment.author?.name || "?").charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={postDetailStyles.commentContent}>
                  <View style={postDetailStyles.commentHeader}>
                    <ThemedText style={postDetailStyles.commentAuthor}>{comment.author?.name || "Player"}</ThemedText>
                    <ThemedText style={postDetailStyles.commentTime}>{formatTime(comment.createdAt)}</ThemedText>
                  </View>
                  <ThemedText style={postDetailStyles.commentText}>{comment.text}</ThemedText>
                  <View style={postDetailStyles.commentActions}>
                    <Pressable style={postDetailStyles.commentAction}>
                      <Ionicons name="heart-outline" size={14} color={Colors.dark.textMuted} />
                      {comment.likeCount > 0 ? (
                        <ThemedText style={postDetailStyles.commentActionText}>{comment.likeCount}</ThemedText>
                      ) : null}
                    </Pressable>
                    <Pressable style={postDetailStyles.commentAction}>
                      <Ionicons name="arrow-undo-outline" size={14} color={Colors.dark.textMuted} />
                      <ThemedText style={postDetailStyles.commentActionText}>Reply</ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={[postDetailStyles.inputContainer, { paddingBottom: insets.bottom + Spacing.sm }]}>
            <TextInput
              style={postDetailStyles.input}
              placeholder="Write a comment..."
              placeholderTextColor={Colors.dark.textMuted}
              value={commentText}
              onChangeText={setCommentText}
              multiline
            />
            <Pressable
              style={[postDetailStyles.sendBtn, !commentText.trim() && postDetailStyles.sendBtnDisabled]}
              onPress={handleSubmitComment}
              disabled={!commentText.trim() || isSubmitting}
            >
              <Ionicons name="send" size={18} color={Colors.dark.buttonText} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

interface CreateMomentModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { contextType: string; caption: string; mediaUrls: string[]; mediaTypes: string[]; visibility: string; groupId?: string }) => void;
  isSubmitting: boolean;
  userRole?: string;
  userGroups?: { id: string; name: string; type: string }[];
}

interface SelectedMedia {
  uri: string;
  type: "image" | "video";
}

export function CreateMomentModal({ visible, onClose, onSubmit, isSubmitting, userRole, userGroups }: CreateMomentModalProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"context" | "group_select" | "content">("context");
  const [selectedContext, setSelectedContext] = useState<ContextType | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);

  const isAdminOrCoach = userRole === "admin" || userRole === "coach" || userRole === "platform_owner" || userRole === "academy_owner";
  const availableContextOptions = CONTEXT_OPTIONS.filter(option => {
    if (option.type === "event") return isAdminOrCoach;
    return true;
  });

  const handlePickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your photos and videos to share moments.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.5,
      videoMaxDuration: 30,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const isVideo = asset.type === "video" || asset.uri.includes(".mp4") || asset.uri.includes(".mov");
      setSelectedMedia({ uri: asset.uri, type: isVideo ? "video" : "image" });
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your camera to take photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.5,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedMedia({ uri: result.assets[0].uri, type: "image" });
    }
  };

  const handleRecordVideo = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your camera to record videos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 30,
      quality: 0.5,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedMedia({ uri: result.assets[0].uri, type: "video" });
    }
  };

  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async () => {
    if (!selectedContext || isSubmitting || isUploading) return;

    setIsUploading(true);
    let uploadedMediaUrls: string[] = [];
    let uploadedMediaTypes: string[] = [];

    if (selectedMedia) {
      try {
        const formData = new FormData();
        const uri = selectedMedia.uri;
        const isVideo = selectedMedia.type === "video";
        const ext = uri.includes(".") ? uri.split(".").pop()?.split("?")[0] || (isVideo ? "mp4" : "jpg") : (isVideo ? "mp4" : "jpg");
        const filename = `${isVideo ? "video" : "photo"}-${Date.now()}.${ext}`;
        const mimeType = isVideo ? `video/${ext === "mov" ? "quicktime" : ext}` : `image/${ext === "jpg" ? "jpeg" : ext}`;

        if (Platform.OS === "web") {
          const response = await fetch(uri);
          const blob = await response.blob();
          formData.append("images", blob, filename);
          const uploadResponse = await apiFetch("/api/social/posts/upload-images", {
            method: "POST",
            body: formData,
          });
          if (uploadResponse.ok) {
            const result = await uploadResponse.json();
            uploadedMediaUrls = result.images || [];
            uploadedMediaTypes = uploadedMediaUrls.map(() => selectedMedia.type);
          } else {
            const errorText = await uploadResponse.text();
            console.error("[Social] Upload failed:", errorText);
            Alert.alert("Error", "Failed to upload media. Please try again.");
            setIsUploading(false);
            return;
          }
        } else {
          // Use expo-file-system uploadAsync for React Native multipart upload
          const { uploadAsync, FileSystemUploadType } = await import("expo-file-system/legacy");
          const uploadUrl = `${getApiUrl()}/api/social/posts/upload-images`;
          const uploadResult = await uploadAsync(uploadUrl, uri, {
            fieldName: "images",
            httpMethod: "POST",
            uploadType: FileSystemUploadType.MULTIPART,
            mimeType,
            headers: getAuthHeaders(),
          });
          if (uploadResult.status >= 200 && uploadResult.status < 300) {
            const result = JSON.parse(uploadResult.body);
            uploadedMediaUrls = result.images || [];
            uploadedMediaTypes = uploadedMediaUrls.map(() => selectedMedia.type);
            logger.log("[Social] Uploaded media:", uploadedMediaUrls, "types:", uploadedMediaTypes);
          } else {
            console.error("[Social] Upload failed:", uploadResult.body);
            Alert.alert("Error", "Failed to upload media. Please try again.");
            setIsUploading(false);
            return;
          }
        }
      } catch (error) {
        console.error("[Social] Upload error:", error);
        Alert.alert("Error", "Failed to upload media. Please try again.");
        setIsUploading(false);
        return;
      }
    }

    logger.log("[Social] Creating post with mediaUrls:", uploadedMediaUrls);

    let visibility = "friends";
    if (selectedContext === "group") {
      visibility = "group";
    } else if (selectedContext === "event" || selectedContext === "achievement") {
      visibility = "academy";
    }

    onSubmit({
      contextType: selectedContext,
      caption: caption.trim(),
      mediaUrls: uploadedMediaUrls,
      mediaTypes: uploadedMediaTypes,
      visibility,
      groupId: selectedGroupId || undefined,
    });
    setIsUploading(false);
  };

  const handleClose = () => {
    setStep("context");
    setSelectedContext(null);
    setSelectedGroupId(null);
    setSelectedGroupName(null);
    setCaption("");
    setSelectedMedia(null);
    onClose();
  };

  const handleSelectContext = (context: ContextType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedContext(context);
    if (context === "group" && userGroups && userGroups.length > 0) {
      setStep("group_select");
    } else {
      setStep("content");
    }
  };

  const handleSelectGroup = (groupId: string, groupName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGroupId(groupId);
    setSelectedGroupName(groupName);
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
        style={createStyles.modalContainer}
      >
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, "#0a1a2e", Colors.dark.backgroundRoot]}
          style={StyleSheet.absoluteFill}
        />

        <View style={[createStyles.modalHeader, { paddingTop: insets.top + Spacing.sm }]}>
          <Pressable onPress={handleClose} style={createStyles.modalCloseButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <ThemedText style={createStyles.modalTitle}>
            {step === "context" ? "New Moment" : step === "group_select" ? "Select Group" : "Share Your Moment"}
          </ThemedText>
          {step === "content" ? (
            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting || isUploading || !caption.trim()}
              style={[
                createStyles.postButton,
                (!caption.trim() || isSubmitting || isUploading) && createStyles.postButtonDisabled
              ]}
            >
              {(isSubmitting || isUploading) ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <ThemedText style={createStyles.postButtonText}>Post</ThemedText>
              )}
            </Pressable>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        {step === "context" ? (
          <Animated.View entering={FadeIn} style={createStyles.contextStep}>
            <ThemedText style={createStyles.contextPrompt}>What are you sharing?</ThemedText>
            <View style={createStyles.contextGrid}>
              {availableContextOptions.map((option) => (
                <Pressable
                  key={option.type}
                  style={createStyles.contextOption}
                  onPress={() => handleSelectContext(option.type)}
                >
                  <View style={[createStyles.contextIconContainer, { backgroundColor: option.color + "20" }]}>
                    <Ionicons name={option.icon as any} size={32} color={option.color} />
                  </View>
                  <ThemedText style={createStyles.contextOptionLabel}>{option.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ) : step === "group_select" ? (
          <Animated.View entering={FadeIn} style={createStyles.contextStep}>
            <ThemedText style={createStyles.contextPrompt}>Which group are you posting to?</ThemedText>
            <ScrollView style={createStyles.groupList} showsVerticalScrollIndicator={false}>
              {userGroups && userGroups.length > 0 ? (
                userGroups.map((group) => (
                  <Pressable
                    key={group.id}
                    style={createStyles.groupOption}
                    onPress={() => handleSelectGroup(group.id, group.name)}
                  >
                    <View style={[createStyles.groupIconContainer, { backgroundColor: "#4ECDC420" }]}>
                      <Ionicons name="people" size={24} color="#4ECDC4" />
                    </View>
                    <View style={createStyles.groupInfo}>
                      <ThemedText style={createStyles.groupName}>{group.name}</ThemedText>
                      <ThemedText style={createStyles.groupType}>
                        {group.type === "training" ? "Training Group" : "Community Group"}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
                  </Pressable>
                ))
              ) : (
                <View style={createStyles.noGroupsMessage}>
                  <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
                  <ThemedText style={createStyles.noGroupsText}>You're not in any groups yet</ThemedText>
                </View>
              )}
            </ScrollView>
            <Pressable style={createStyles.backButton} onPress={() => setStep("context")}>
              <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
              <ThemedText style={createStyles.backButtonText}>Back</ThemedText>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={SlideInUp} style={createStyles.contentStep}>
            <View style={createStyles.selectedContextBadge}>
              {selectedContext ? (
                <>
                  <Ionicons
                    name={CONTEXT_OPTIONS.find(c => c.type === selectedContext)?.icon as any}
                    size={16}
                    color={CONTEXT_OPTIONS.find(c => c.type === selectedContext)?.color}
                  />
                  <ThemedText style={createStyles.selectedContextText}>
                    {CONTEXT_OPTIONS.find(c => c.type === selectedContext)?.label}
                    {selectedGroupName ? ` \u2192 ${selectedGroupName}` : ""}
                  </ThemedText>
                  <Pressable onPress={() => setStep("context")}>
                    <Ionicons name="pencil" size={14} color={Colors.dark.textSecondary} />
                  </Pressable>
                </>
              ) : null}
            </View>

            <TextInput
              style={createStyles.captionInput}
              placeholder="What's happening on court?"
              placeholderTextColor={Colors.dark.textSecondary}
              value={caption}
              onChangeText={setCaption}
              maxLength={280}
              multiline
              autoFocus
            />

            <ThemedText style={createStyles.charCount}>{caption.length}/280</ThemedText>

            {selectedMedia ? (
              <View style={createStyles.imagePreviewContainer}>
                {selectedMedia.type === "video" ? (
                  <View style={[createStyles.imagePreview, createStyles.videoPreview]}>
                    <Ionicons name="videocam" size={48} color={Colors.dark.primary} />
                    <ThemedText style={createStyles.videoLabel}>Video Selected</ThemedText>
                  </View>
                ) : (
                  <Image source={{ uri: selectedMedia.uri }} style={createStyles.imagePreview} />
                )}
                <Pressable
                  style={createStyles.removeImageButton}
                  onPress={() => setSelectedMedia(null)}
                >
                  <Ionicons name="close-circle" size={28} color={Colors.dark.text} />
                </Pressable>
              </View>
            ) : null}

            <View style={createStyles.mediaButtons}>
              <Pressable style={createStyles.mediaButton} onPress={handlePickMedia}>
                <Ionicons name="images" size={24} color={Colors.dark.primary} />
                <ThemedText style={createStyles.mediaButtonText}>Gallery</ThemedText>
              </Pressable>
              <Pressable style={createStyles.mediaButton} onPress={handleTakePhoto}>
                <Ionicons name="camera" size={24} color={Colors.dark.primary} />
                <ThemedText style={createStyles.mediaButtonText}>Photo</ThemedText>
              </Pressable>
              <Pressable style={createStyles.mediaButton} onPress={handleRecordVideo}>
                <Ionicons name="videocam" size={24} color={Colors.dark.primary} />
                <ThemedText style={createStyles.mediaButtonText}>Video</ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const commentStyles = StyleSheet.create({
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 998,
  },
  commentsDrawer: {
    position: "absolute",
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    overflow: "hidden",
    zIndex: 999,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderBottomWidth: 0,
  },
  drawerHandle: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  drawerHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.textMuted,
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  drawerCloseButton: {
    padding: Spacing.xs,
  },
  commentItem: {
    flexDirection: "row",
    padding: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  commentItemReply: {
    marginLeft: 32,
    backgroundColor: Colors.dark.backgroundSecondary + "80",
    borderLeftWidth: 2,
    borderLeftColor: Colors.dark.primary + "50",
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
  commentAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: 6,
  },
  commentActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  commentActionText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  replyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  replyBadgeText: {
    fontSize: 11,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  replyingToBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  replyingToContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginRight: Spacing.sm,
  },
  replyingToLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  replyingToName: {
    fontSize: 12,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  replyingToText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  emptyCommentsSmall: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyCommentsText: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  drawerInputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
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

const shareStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  previewCard: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  previewGradient: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  photoContainer: {
    aspectRatio: 1,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0,
  },
  photoOverlayText: {
    color: "#fff",
    fontSize: 12,
    marginTop: 4,
  },
  photoPlaceholder: {
    aspectRatio: 16 / 9,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: Colors.dark.border,
  },
  photoActions: {
    flexDirection: "row",
    gap: Spacing.xl,
  },
  photoBtn: {
    alignItems: "center",
    gap: 4,
  },
  photoBtnText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  photoHint: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  achievementInfo: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  achievementIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  achievementTitle: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  achievementValue: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  achievementValueText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  achievementDesc: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  userBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    alignSelf: "center",
    marginTop: Spacing.md,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  userName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  appBrand: {
    fontSize: 11,
    color: Colors.dark.primary,
  },
  captionSection: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  captionInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    textAlign: "right",
  },
  bgSection: {
    gap: Spacing.sm,
  },
  bgOptions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  bgOption: {
    width: 80,
    alignItems: "center",
    gap: 4,
  },
  bgOptionActive: {
    opacity: 1,
  },
  bgOptionGradient: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  bgOptionName: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  shareBtn: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  shareBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  shareBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
});

const postDetailStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
  },
  postCard: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  authorInfo: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  authorName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  levelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  levelText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  contextBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  contextText: {
    fontSize: 10,
    fontWeight: "600",
  },
  time: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  caption: {
    fontSize: 16,
    color: Colors.dark.text,
    lineHeight: 24,
    marginTop: Spacing.lg,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  reactions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reactionEmoji: {
    fontSize: 16,
  },
  reactionCount: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  cheerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.md,
  },
  cheerBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  commentsSection: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  commentsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  commentItem: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  commentContent: {
    flex: 1,
    gap: 4,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  commentTime: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  commentText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: 4,
  },
  commentAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  commentActionText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  input: {
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
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: Colors.dark.primary + "50",
  },
});

const createStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  postButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    minWidth: 60,
    alignItems: "center",
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
  postButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  contextStep: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  contextPrompt: {
    fontSize: 22,
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
    alignItems: "center",
    width: 100,
    gap: Spacing.sm,
  },
  contextIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  contextOptionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  groupList: {
    flex: 1,
    paddingTop: Spacing.md,
  },
  groupOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  groupIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  groupInfo: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  groupType: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  noGroupsMessage: {
    alignItems: "center",
    padding: Spacing.xl * 2,
    gap: Spacing.md,
  },
  noGroupsText: {
    fontSize: 16,
    color: Colors.dark.textMuted,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    alignSelf: "center",
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  backButtonText: {
    fontSize: 15,
    color: Colors.dark.text,
    fontWeight: "500",
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
    aspectRatio: 16 / 9,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  videoPreview: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    borderStyle: "dashed",
  },
  videoLabel: {
    marginTop: Spacing.sm,
    fontSize: 14,
    color: Colors.dark.textSecondary,
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
