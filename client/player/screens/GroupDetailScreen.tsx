import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Share,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, TextColors, Backgrounds } from "@/constants/theme";
import { ThemedText as Text } from "@/components/ThemedText";
import { apiRequest, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { useWebSocket, type NewMessagePayload } from "@/lib/useWebSocket";
import { useChatStickyBottom } from "@/lib/useChatStickyBottom";
import { useAuth } from "@/coach/context/AuthContext";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface GroupDetail {
  group: {
    id: string;
    name: string;
    description?: string;
    type: string;
    memberCount: number;
    avatarUrl?: string;
    accentColor?: string;
    isPrivate: boolean;
    allowChat: boolean;
    allowPosts: boolean;
  };
  isMember: boolean;
  myRole: string | null;
  members: {
    id: string;
    userId: string;
    name: string;
    role: string;
    joinedAt: string;
    avatarUrl?: string | null;
  }[];
  memberCount: number;
}

interface Post {
  id: string;
  authorId: string;
  caption?: string;
  mediaUrls: string[];
  createdAt: string;
  authorName: string;
  cheerCount?: number;
  commentCount?: number;
  userReaction?: string | null;
}

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    photoUrl?: string | null;
  };
}

interface SuggestedPlayer {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

interface GroupEvent {
  id: string;
  groupId: string;
  creatorId: string;
  eventType: string;
  title: string;
  description?: string | null;
  location?: string | null;
  sport?: string | null;
  eventDate: string;
  maxPlayers?: number | null;
  opponentUserId?: string | null;
  matchChallengeId?: string | null;
  wager?: string | null;
  wagerCurrency?: string | null;
  createdAt: string;
  goingCount: number;
  maybeCount: number;
  notGoingCount: number;
  myRsvpStatus: string | null;
  goingAvatars: { name: string; avatarUrl: string | null }[];
}

interface Court {
  id: string;
  name: string;
  sport?: string | null;
  surface?: string | null;
  isActive?: boolean | null;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: string | null;
  senderPlayerId: string | null;
  body: string;
  createdAt: string;
  reactions: Array<{ id: string; emoji: string; reactorPlayerId: string | null }>;
}

type Tab = "feed" | "events" | "chat" | "members";
type Props = NativeStackScreenProps<any, "GroupDetail">;

const GROUP_TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  level: { icon: "tennisball", color: "#9AE66E", label: "Level" },
  team: { icon: "shield", color: "#4ECDC4", label: "Team" },
  academy: { icon: "business", color: "#FFD700", label: "Academy" },
  event: { icon: "calendar", color: "#FF6B35", label: "Event" },
  friends: { icon: "people", color: "#E040FB", label: "Friends" },
  skill_level: { icon: "trophy", color: "#9AE66E", label: "Skill Level" },
  age_group: { icon: "people", color: "#4ECDC4", label: "Age Group" },
  tournament: { icon: "ribbon", color: "#FF6B35", label: "Tournament" },
  social: { icon: "tennisball", color: "#E040FB", label: "Social" },
  training: { icon: "barbell", color: "#9AE66E", label: "Training" },
};

function getPhotoUri(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("data:") || url.startsWith("http")) return url;
  return `${getApiUrl()}${url}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── MEMBER GRID CELL ──────────────────────────────────────────────────────────

function MemberGridCell({ member, typeColor }: { member: GroupDetail["members"][0]; typeColor: string }) {
  const photoUri = getPhotoUri(member.avatarUrl);
  return (
    <Animated.View entering={FadeInDown.duration(200)} style={styles.memberCell}>
      <View style={styles.memberCellAvatarWrap}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.memberCellAvatarImg} />
        ) : (
          <View style={[styles.memberCellAvatar, { backgroundColor: typeColor + "30" }]}>
            <Text style={[styles.memberCellInitial, { color: typeColor }]}>
              {member.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        {member.role === "admin" ? (
          <View style={styles.adminStarBadge}>
            <Ionicons name="star" size={9} color={Colors.dark.gold} />
          </View>
        ) : null}
      </View>
      <Text style={styles.memberCellName} numberOfLines={1}>{member.name.split(" ")[0]}</Text>
    </Animated.View>
  );
}

// ─── COMMENTS SHEET ────────────────────────────────────────────────────────────

function CommentsSheet({
  postId,
  visible,
  onClose,
  typeColor,
  onCommentAdded,
}: {
  postId: string;
  visible: boolean;
  onClose: () => void;
  typeColor: string;
  onCommentAdded: () => void;
}) {
  const [text, setText] = useState("");
  const insets = useSafeAreaInsets();

  const { data: comments = [], isLoading, refetch } = useQuery<Comment[]>({
    queryKey: [`/api/social/posts/${postId}/comments`],
    enabled: visible && !!postId,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/social/posts/${postId}/comments`, { text: text.trim() }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setText("");
      refetch();
      onCommentAdded();
    },
    onError: (error: unknown) => {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to add comment");
    },
  });

  const handleClose = () => {
    setText("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleClose} />
        <View style={[styles.commentsSheet, { paddingBottom: insets.bottom || 16 }]}>
          <View style={styles.composeHandle} />

          {/* Header */}
          <View style={styles.commentsHeader}>
            <Text style={styles.commentsTitle}>Comments</Text>
            <Pressable onPress={handleClose} style={styles.addMembersCloseBtn}>
              <Ionicons name="close" size={20} color="#7A8EA0" />
            </Pressable>
          </View>

          {/* Comment list */}
          {isLoading ? (
            <View style={styles.commentsLoading}>
              <ActivityIndicator color={typeColor} />
            </View>
          ) : comments.length === 0 ? (
            <View style={styles.commentsEmpty}>
              <Ionicons name="chatbubble-outline" size={36} color="#334455" />
              <Text style={styles.commentsEmptyText}>Be the first to comment</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.commentsList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {comments.map((c) => {
                const photoUri = getPhotoUri(c.author?.photoUrl);
                return (
                  <View key={c.id} style={styles.commentRow}>
                    <View style={styles.commentAvatarWrap}>
                      {photoUri ? (
                        <Image source={{ uri: photoUri }} style={styles.commentAvatar} />
                      ) : (
                        <View style={[styles.commentAvatar, { backgroundColor: typeColor + "30", justifyContent: "center", alignItems: "center" }]}>
                          <Text style={[styles.commentAvatarInitial, { color: typeColor }]}>
                            {(c.author?.name || "?").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.commentBubble}>
                      <View style={styles.commentBubbleHeader}>
                        <Text style={styles.commentAuthor}>{c.author?.name || "Unknown"}</Text>
                        <Text style={styles.commentTime}>{timeAgo(c.createdAt)}</Text>
                      </View>
                      <Text style={styles.commentText}>{c.text}</Text>
                    </View>
                  </View>
                );
              })}
              <View style={{ height: 12 }} />
            </ScrollView>
          )}

          {/* Input row */}
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              placeholderTextColor="#445566"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
            />
            <Pressable
              style={[styles.commentSendBtn, { backgroundColor: typeColor }, (!text.trim() || addMutation.isPending) && { opacity: 0.4 }]}
              disabled={!text.trim() || addMutation.isPending}
              onPress={() => addMutation.mutate()}
            >
              {addMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <Ionicons name="send" size={16} color={Colors.dark.buttonText} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── POST CARD ─────────────────────────────────────────────────────────────────

function PostCard({
  post,
  typeColor,
  groupId,
  onCommentPress,
}: {
  post: Post;
  typeColor: string;
  groupId: string;
  onCommentPress: () => void;
}) {
  const queryClient = useQueryClient();
  const [liked, setLiked] = useState(post.userReaction === "clap");
  const [likeCount, setLikeCount] = useState(post.cheerCount || 0);

  const likeMutation = useMutation({
    mutationFn: () =>
      liked
        ? apiRequest("DELETE", `/api/social/posts/${post.id}/reactions`)
        : apiRequest("POST", `/api/social/posts/${post.id}/reactions`, { reactionType: "clap" }),
    onMutate: () => {
      setLiked(prev => !prev);
      setLikeCount(c => liked ? Math.max(0, c - 1) : c + 1);
    },
    onError: () => {
      setLiked(prev => !prev);
      setLikeCount(c => liked ? c + 1 : Math.max(0, c - 1));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/player/groups/${groupId}/feed`] });
    },
  });

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    likeMutation.mutate();
  };

  const mediaUrls = post.mediaUrls?.filter(Boolean) || [];
  const commentCount = post.commentCount || 0;

  return (
    <Animated.View entering={FadeInDown.duration(250)} style={styles.postCard}>
      {/* Author header */}
      <View style={styles.postHeader}>
        <View style={[styles.postAvatar, { backgroundColor: typeColor + "25" }]}>
          <Text style={[styles.postAvatarInitial, { color: typeColor }]}>
            {post.authorName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.postMeta}>
          <Text style={styles.postAuthor}>{post.authorName}</Text>
          <Text style={styles.postTime}>{timeAgo(post.createdAt)}</Text>
        </View>
      </View>

      {/* Caption */}
      {post.caption ? (
        <Text style={styles.postCaption}>{post.caption}</Text>
      ) : null}

      {/* Media strip */}
      {mediaUrls.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.mediaStrip}
          contentContainerStyle={styles.mediaStripContent}
        >
          {mediaUrls.map((url, idx) => {
            const uri = getPhotoUri(url);
            return uri ? (
              <Image
                key={idx}
                source={{ uri }}
                style={[
                  styles.mediaImage,
                  mediaUrls.length === 1 && styles.mediaImageSingle,
                ]}
                resizeMode="cover"
              />
            ) : null;
          })}
        </ScrollView>
      ) : null}

      {/* Actions */}
      <View style={styles.postActions}>
        <Pressable style={styles.actionBtn} onPress={handleLike}>
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={18}
            color={liked ? "#FF4D6D" : Colors.dark.textMuted}
          />
          <Text style={[styles.actionBtnText, liked && { color: "#FF4D6D" }]}>
            {likeCount > 0 ? likeCount : "Like"}
          </Text>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={onCommentPress}>
          <Ionicons name="chatbubble-outline" size={17} color={Colors.dark.textMuted} />
          <Text style={styles.actionBtnText}>
            {commentCount > 0 ? `Comment ${commentCount}` : "Comment"}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── COMPOSE MODAL ─────────────────────────────────────────────────────────────

function ComposePostModal({
  visible,
  onClose,
  groupId,
  typeColor,
}: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  typeColor: string;
}) {
  const queryClient = useQueryClient();
  const [caption, setCaption] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const MAX = 280;

  const handlePickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 5 - images.length,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setImages((prev) => [...prev, ...uris].slice(0, 5));
    }
  };

  const handleRemoveImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadImages = async (): Promise<string[]> => {
    if (images.length === 0) return [];

    if (Platform.OS === "web") {
      // Web: use fetch + FormData (supports multiple files in one request)
      const formData = new FormData();
      for (let idx = 0; idx < images.length; idx++) {
        const uri = images[idx];
        const blob = await fetch(uri).then(r => r.blob());
        formData.append("images", blob, `photo_${idx}.jpg`);
      }
      const base = getApiUrl();
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      const authToken = await AsyncStorage.getItem("auth_token");
      const res = await fetch(`${base}/api/social/posts/upload-images`, {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Image upload failed${errText ? `: ${errText}` : ""}`);
      }
      const json = await res.json();
      return json.images || [];
    } else {
      // React Native: use expo-file-system uploadAsync (one file at a time, multipart)
      const { uploadAsync, FileSystemUploadType } = await import("expo-file-system/legacy");
      const uploadUrl = `${getApiUrl()}/api/social/posts/upload-images`;
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      const authToken = await AsyncStorage.getItem("auth_token");
      const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const allUrls: string[] = [];
      for (const uri of images) {
        const result = await uploadAsync(uploadUrl, uri, {
          fieldName: "images",
          httpMethod: "POST",
          uploadType: FileSystemUploadType.MULTIPART,
          mimeType: "image/jpeg",
          headers: authHeaders,
        });
        if (result.status >= 200 && result.status < 300) {
          const json = JSON.parse(result.body);
          if (Array.isArray(json.images)) allUrls.push(...json.images);
        } else {
          throw new Error(`Image upload failed: ${result.body}`);
        }
      }
      return allUrls;
    }
  };

  const postMutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      let mediaUrls: string[] = [];
      try {
        mediaUrls = await uploadImages();
      } finally {
        setUploading(false);
      }
      return apiRequest("POST", "/api/social/posts", {
        contextType: "group",
        groupId,
        visibility: "group",
        caption: caption.trim(),
        mediaUrls,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/player/groups/${groupId}/feed`] });
      setCaption("");
      setImages([]);
      onClose();
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Failed to post";
      Alert.alert("Error", msg);
    },
  });

  const canPost = (caption.trim().length > 0 || images.length > 0) && !postMutation.isPending && !uploading;

  const handleClose = () => {
    setCaption("");
    setImages([]);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleClose} />
        <View style={styles.composeSheet}>
          <View style={styles.composeHandle} />

          <View style={styles.composeHeader}>
            <Pressable onPress={handleClose} style={styles.composeCancelBtn}>
              <Text style={styles.composeCancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.composeTitle}>New Post</Text>
            <Pressable
              onPress={() => postMutation.mutate()}
              disabled={!canPost}
              style={[
                styles.composePostBtn,
                { backgroundColor: typeColor },
                !canPost && { opacity: 0.4 },
              ]}
            >
              {postMutation.isPending || uploading ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <Text style={styles.composePostBtnText}>Post</Text>
              )}
            </Pressable>
          </View>

          <TextInput
            style={styles.composeInput}
            placeholder="Share something with the group..."
            placeholderTextColor="#445566"
            multiline
            maxLength={MAX}
            value={caption}
            onChangeText={setCaption}
            autoFocus={images.length === 0}
          />

          {/* Image thumbnails */}
          {images.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.composeThumbnailStrip}
              contentContainerStyle={styles.composeThumbnailContent}
            >
              {images.map((uri, idx) => (
                <View key={idx} style={styles.composeThumbnailWrap}>
                  <Image source={{ uri }} style={styles.composeThumbnail} />
                  <Pressable
                    style={styles.composeThumbnailRemove}
                    onPress={() => handleRemoveImage(idx)}
                  >
                    <Ionicons name="close-circle" size={20} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {/* Footer: counter + photo button */}
          <View style={styles.composeFooter}>
            <Pressable
              style={[styles.composePhotoBtn, images.length >= 5 && { opacity: 0.4 }]}
              onPress={handlePickImages}
              disabled={images.length >= 5}
            >
              <Ionicons name="image-outline" size={22} color={typeColor} />
              {images.length > 0 ? (
                <Text style={[styles.composePhotoBtnLabel, { color: typeColor }]}>
                  {images.length}/5
                </Text>
              ) : null}
            </Pressable>
            <Text style={[styles.composeCounter, caption.length > MAX * 0.9 && { color: "#FF4D6D" }]}>
              {caption.length}/{MAX}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── ADD MEMBERS MODAL ─────────────────────────────────────────────────────────

function AddMembersModal({
  visible,
  onClose,
  groupId,
  typeColor,
}: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  typeColor: string;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ friends: SuggestedPlayer[]; academy: SuggestedPlayer[] }>({
    queryKey: [`/api/player/groups/${groupId}/member-suggestions`],
    enabled: visible,
  });

  const addMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("POST", `/api/player/groups/${groupId}/members`, { userId }),
    onSuccess: (_res, userId) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddedIds(prev => new Set([...prev, userId]));
      queryClient.invalidateQueries({ queryKey: [`/api/player/groups/${groupId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/player/groups/${groupId}/member-suggestions`] });
    },
    onError: (error: unknown) => {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to add member");
    },
  });

  const handleClose = () => {
    setSearch("");
    setAddedIds(new Set());
    onClose();
  };

  const filterPlayers = (list: SuggestedPlayer[]) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((p) => p.name.toLowerCase().includes(q));
  };

  const friends = filterPlayers(data?.friends || []);
  const academy = filterPlayers(data?.academy || []);
  const isEmpty = friends.length === 0 && academy.length === 0;

  const renderPlayer = (item: SuggestedPlayer) => {
    const photoUri = getPhotoUri(item.avatarUrl);
    const added = addedIds.has(item.userId);
    return (
      <View key={item.userId} style={styles.suggestionRow}>
        <View style={styles.suggestionAvatarWrap}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.suggestionAvatarImg} />
          ) : (
            <View style={[styles.suggestionAvatar, { backgroundColor: typeColor + "30" }]}>
              <Text style={[styles.suggestionInitial, { color: typeColor }]}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.suggestionName} numberOfLines={1}>{item.name}</Text>
        <Pressable
          style={[styles.addBtn, added ? styles.addBtnDone : { backgroundColor: typeColor }]}
          disabled={added || addMutation.isPending}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            addMutation.mutate(item.userId);
          }}
        >
          {added ? (
            <Ionicons name="checkmark" size={16} color={typeColor} />
          ) : (
            <Text style={styles.addBtnText}>Add</Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={handleClose} />
        <View style={styles.addMembersSheet}>
          <View style={styles.composeHandle} />

          <View style={styles.addMembersHeader}>
            <Text style={styles.addMembersTitle}>Add Members</Text>
            <Pressable onPress={handleClose} style={styles.addMembersCloseBtn}>
              <Ionicons name="close" size={20} color="#7A8EA0" />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color="#445566" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search players..."
              placeholderTextColor="#445566"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
          </View>

          {isLoading ? (
            <View style={styles.addMembersLoading}>
              <ActivityIndicator color={typeColor} />
            </View>
          ) : isEmpty ? (
            <View style={styles.addMembersEmpty}>
              <Ionicons name="people-outline" size={40} color="#334455" />
              <Text style={styles.addMembersEmptyText}>
                {search.trim() ? "No players match your search" : "Everyone in your academy is already in the group"}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.addMembersScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {friends.length > 0 ? (
                <>
                  <View style={styles.sectionHeaderRow}>
                    <Ionicons name="heart" size={12} color={typeColor} />
                    <Text style={[styles.sectionHeaderText, { color: typeColor }]}>Friends</Text>
                  </View>
                  {friends.map(renderPlayer)}
                </>
              ) : null}
              {academy.length > 0 ? (
                <>
                  <View style={styles.sectionHeaderRow}>
                    <Ionicons name="business" size={12} color="#7A8EA0" />
                    <Text style={styles.sectionHeaderText}>Academy Players</Text>
                  </View>
                  {academy.map(renderPlayer)}
                </>
              ) : null}
              <View style={{ height: 32 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── EVENTS TAB ────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  { value: "casual", label: "Casual Play", icon: "sunny" },
  { value: "training", label: "Training", icon: "barbell" },
  { value: "match", label: "Match", icon: "trophy" },
  { value: "tournament", label: "Tournament", icon: "medal" },
  { value: "social", label: "Social", icon: "people" },
] as const;

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return `Today ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return `Tomorrow ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function EventCard({
  event,
  typeColor,
  onRsvp,
  onDelete,
  onEdit,
  isAdmin,
  currentUserId,
}: {
  event: GroupEvent;
  typeColor: string;
  onRsvp: (eventId: string, status: "going" | "maybe" | "not_going") => void;
  onDelete: (eventId: string) => void;
  onEdit: (event: GroupEvent) => void;
  isAdmin: boolean;
  currentUserId?: string;
}) {
  const isPast = new Date(event.eventDate) < new Date();
  const goingCount = event.goingCount ?? 0;
  const maybeCount = event.maybeCount ?? 0;
  const isCreator = event.creatorId === currentUserId;

  return (
    <Animated.View entering={FadeInDown} style={evtStyles.card}>
      <View style={evtStyles.cardHeader}>
        <View style={[evtStyles.eventTypeBadge, { backgroundColor: typeColor + "20" }]}>
          <Ionicons
            name={(EVENT_TYPES.find(e => e.value === event.eventType)?.icon ?? "calendar") as any}
            size={13}
            color={typeColor}
          />
          <Text style={[evtStyles.eventTypeTxt, { color: typeColor }]}>
            {EVENT_TYPES.find(e => e.value === event.eventType)?.label ?? event.eventType}
          </Text>
        </View>
        {(isAdmin || isCreator) ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => onEdit(event)} style={evtStyles.deleteBtn}>
              <Ionicons name="create-outline" size={16} color={typeColor} />
            </Pressable>
            <Pressable onPress={() => {
              Alert.alert("Delete Event", "Remove this event?", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => onDelete(event.id) },
              ]);
            }} style={evtStyles.deleteBtn}>
              <Ionicons name="trash-outline" size={16} color="#FF6B6B" />
            </Pressable>
          </View>
        ) : null}
      </View>

      <Text style={evtStyles.eventTitle}>{event.title}</Text>
      {event.description ? <Text style={evtStyles.eventDesc}>{event.description}</Text> : null}

      <View style={evtStyles.metaRow}>
        <Ionicons name="time-outline" size={14} color="#7A8EA0" />
        <Text style={evtStyles.metaTxt}>{formatEventDate(event.eventDate)}</Text>
      </View>
      {event.location ? (
        <View style={evtStyles.metaRow}>
          <Ionicons name="location-outline" size={14} color="#7A8EA0" />
          <Text style={evtStyles.metaTxt}>{event.location}</Text>
        </View>
      ) : null}
      {event.maxPlayers ? (
        <View style={evtStyles.metaRow}>
          <Ionicons name="people-outline" size={14} color="#7A8EA0" />
          <Text style={evtStyles.metaTxt}>{goingCount}/{event.maxPlayers} going</Text>
        </View>
      ) : null}
      {event.wager ? (
        <View style={evtStyles.metaRow}>
          <Ionicons name="cash-outline" size={14} color="#FFD700" />
          <Text style={[evtStyles.metaTxt, { color: "#FFD700", fontWeight: "700" }]}>
            {event.wagerCurrency || "AED"} {parseFloat(event.wager).toFixed(2)} Inzet
          </Text>
        </View>
      ) : null}

      {(event.goingAvatars.length > 0 || maybeCount > 0) && (
        <View style={evtStyles.avatarRow}>
          {event.goingAvatars.slice(0, 5).map((a, i) => (
            <View key={i} style={[evtStyles.miniAvatar, { marginLeft: i > 0 ? -8 : 0, zIndex: 10 - i, backgroundColor: typeColor + "40" }]}>
              {a.avatarUrl ? (
                <Image source={{ uri: a.avatarUrl }} style={evtStyles.miniAvatarImg} />
              ) : (
                <Text style={[evtStyles.miniAvatarInit, { color: typeColor }]}>{a.name[0]?.toUpperCase()}</Text>
              )}
            </View>
          ))}
          <Text style={evtStyles.goingTxt}>
            {goingCount > 0 && maybeCount > 0
              ? `${goingCount} going · ${maybeCount} maybe`
              : goingCount > 0
              ? `${goingCount} going`
              : `${maybeCount} maybe`}
          </Text>
        </View>
      )}

      {!isPast && (
        <View style={evtStyles.rsvpRow}>
          {(["going", "maybe", "not_going"] as const).map((status) => {
            const active = event.myRsvpStatus === status;
            const labels: Record<string, string> = { going: "Going", maybe: "Maybe", not_going: "Decline" };
            const colors: Record<string, string> = { going: "#4ECDC4", maybe: "#FFD166", not_going: "#FF6B6B" };
            return (
              <Pressable
                key={status}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRsvp(event.id, status); }}
                style={[evtStyles.rsvpBtn, active && { backgroundColor: colors[status] + "30", borderColor: colors[status] }]}
              >
                <Text style={[evtStyles.rsvpBtnTxt, active && { color: colors[status], fontWeight: "700" }]}>
                  {labels[status]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Animated.View>
  );
}

/**
 * CreateEventWizard
 *
 * Two different flows depending on event type:
 *
 * Match (2 steps):
 *   Step 0 — Select opponent (required from group members)
 *   Step 1 — Pick date, time & location → Create (challenge auto-sent)
 *
 * Non-match (3 steps):
 *   Step 0 — Select event type
 *   Step 1 — Title, description, location, max players
 *   Step 2 — Date & time → Create
 */
function CreateEventWizard({
  visible,
  onClose,
  groupId,
  typeColor,
  members,
}: {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  typeColor: string;
  members: GroupDetail["members"];
}) {
  const queryClient = useQueryClient();
  // "match" launches a 2-step quick-plan; everything else uses the 3-step wizard
  const [isMatchFlow, setIsMatchFlow] = useState(false);
  const [step, setStep] = useState(0); // 0..1 for match, 0..2 for non-match
  const [eventType, setEventType] = useState<string>("social");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [selectedCourtId, setSelectedCourtId] = useState<string>("");
  const [maxPlayers, setMaxPlayers] = useState("");
  const [wager, setWager] = useState("");
  const [eventDate, setEventDate] = useState(new Date(Date.now() + 86400000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [opponentUserId, setOpponentUserId] = useState<string>("");

  const { data: courts = [] } = useQuery<Court[]>({
    queryKey: ["/api/player/courts"],
    enabled: visible,
  });

  const resetWizard = () => {
    setIsMatchFlow(false); setStep(0); setEventType("social"); setTitle("");
    setDescription(""); setLocation(""); setSelectedCourtId(""); setMaxPlayers(""); setWager("");
    setEventDate(new Date(Date.now() + 86400000));
    setOpponentUserId(""); setShowDatePicker(false); setShowTimePicker(false);
  };

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", `/api/player/groups/${groupId}/events`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/player/groups/${groupId}/events`] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetWizard();
      onClose();
    },
    onError: (e: any) => Alert.alert("Error", e.message || "Failed to create event"),
  });

  const resolvedLocation = selectedCourtId
    ? (courts.find(c => c.id === selectedCourtId)?.name ?? location.trim())
    : location.trim();

  const submitCreate = (overrides: Record<string, unknown> = {}) => {
    const wagerNum = wager.trim() ? parseFloat(wager.trim()) : undefined;
    if (wagerNum !== undefined && (isNaN(wagerNum) || wagerNum < 0)) {
      Alert.alert("Invalid Wager", "Please enter a valid non-negative amount for Inzet / Prijs.");
      return;
    }
    mutation.mutate({
      eventType, title: title.trim(),
      description: description.trim() || undefined,
      location: resolvedLocation || undefined,
      maxPlayers: maxPlayers ? parseInt(maxPlayers, 10) : undefined,
      eventDate: eventDate.toISOString(),
      wager: wagerNum,
      wagerCurrency: "AED",
      ...overrides,
    });
  };

  // ── Match flow helpers ──────────────────────────────────────────────────────
  const matchStepCount = 2;
  const canAdvanceMatch = step === 0 ? !!opponentUserId : true;

  const handleNextMatch = () => {
    if (step === 0) {
      // Auto-title the match event
      const opponent = members.find(m => m.userId === opponentUserId);
      if (!title.trim()) setTitle(`Match vs ${opponent?.name?.split(" ")[0] ?? "Opponent"}`);
      setStep(1);
    } else {
      // Step 1 → submit; opponentUserId required, challenger auto-created on server
      submitCreate({ eventType: "match", opponentUserId });
    }
  };

  // ── Regular flow helpers ────────────────────────────────────────────────────
  const regularStepCount = 3;
  const canAdvanceRegular = step === 0 ? !!eventType : step === 1 ? title.trim().length > 0 : true;

  const handleNextRegular = () => {
    if (step === 0) {
      if (!title.trim()) {
        const label = EVENT_TYPES.find(e => e.value === eventType)?.label ?? eventType;
        setTitle(label + " Session");
      }
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else {
      submitCreate();
    }
  };

  const totalSteps = isMatchFlow ? matchStepCount : regularStepCount;
  const canAdvance = isMatchFlow ? canAdvanceMatch : canAdvanceRegular;
  const handleNext = isMatchFlow ? handleNextMatch : handleNextRegular;
  const isLastStep = step === totalSteps - 1;

  // Entry screen: choose match flow vs. other event type
  const showEntryTypeSelector = !isMatchFlow && step === 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { resetWizard(); onClose(); }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.modalOverlay} onPress={() => { resetWizard(); onClose(); }}>
          <View style={styles.modalBackdrop} />
        </Pressable>
        <View style={evtStyles.wizardSheet}>
          <View style={styles.composeHandle} />
          <View style={styles.composeHeader}>
            <Pressable
              onPress={() => {
                if (step > 0) { setStep(step - 1); }
                else if (isMatchFlow) { setIsMatchFlow(false); setSelectedCourtId(""); setLocation(""); setWager(""); }
                else { resetWizard(); onClose(); }
              }}
              style={styles.composeCancelBtn}
            >
              <Text style={styles.composeCancelText}>{step > 0 || isMatchFlow ? "Back" : "Cancel"}</Text>
            </Pressable>
            <Text style={styles.composeTitle}>
              {isMatchFlow ? (step === 0 ? "Match — Select Opponent" : "Match — Date & Time") : "Create Event"}
            </Text>
            <Pressable
              onPress={handleNext}
              disabled={!canAdvance || mutation.isPending}
              style={[styles.composePostBtn, { backgroundColor: canAdvance ? typeColor : typeColor + "50" }]}
            >
              {mutation.isPending && isLastStep ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <Text style={styles.composePostBtnText}>{isLastStep ? (isMatchFlow ? "Challenge" : "Create") : "Next"}</Text>
              )}
            </Pressable>
          </View>

          {/* Step indicator dots */}
          <View style={evtStyles.stepRow}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View key={i} style={[evtStyles.stepDot, i <= step && { backgroundColor: typeColor }]} />
            ))}
          </View>

          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>

            {/* ── Match flow ── */}
            {isMatchFlow && step === 0 && (
              <View style={evtStyles.wizardSection}>
                <Text style={evtStyles.wizardLabel}>Select your opponent from the group</Text>
                {members.filter(m => m.userId !== undefined).length === 0 ? (
                  <Text style={{ color: "#7A8EA0", marginTop: 12 }}>No group members to challenge.</Text>
                ) : null}
                <View style={evtStyles.typeGrid}>
                  {members.filter(m => m.userId !== undefined).map(m => (
                    <Pressable
                      key={m.userId}
                      onPress={() => { setOpponentUserId(opponentUserId === m.userId ? "" : (m.userId ?? "")); Haptics.selectionAsync(); }}
                      style={[evtStyles.typeChip, { flexDirection: "row", gap: 10, alignItems: "center" },
                        opponentUserId === m.userId && { borderColor: typeColor, backgroundColor: typeColor + "20" }]}
                    >
                      <View style={[evtStyles.opponentAvatar, { backgroundColor: typeColor + "30" }]}>
                        {m.avatarUrl ? (
                          <Image source={{ uri: m.avatarUrl }} style={evtStyles.opponentAvatarImg} />
                        ) : (
                          <Text style={[evtStyles.opponentAvatarInit, { color: typeColor }]}>{m.name[0]?.toUpperCase()}</Text>
                        )}
                      </View>
                      <Text style={[evtStyles.typeChipTxt, opponentUserId === m.userId && { color: typeColor, fontWeight: "700" }]} numberOfLines={1}>{m.name}</Text>
                      {opponentUserId === m.userId ? <Ionicons name="checkmark-circle" size={18} color={typeColor} /> : null}
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {isMatchFlow && step === 1 && (
              <View style={evtStyles.wizardSection}>
                {(() => {
                  const opponent = members.find(m => m.userId === opponentUserId);
                  return opponent ? (
                    <View style={[evtStyles.wizardSummary, { borderColor: typeColor + "30", backgroundColor: typeColor + "10", marginBottom: 16 }]}>
                      <Text style={evtStyles.wizardSummaryTitle}>Match vs {opponent.name}</Text>
                      <Text style={evtStyles.wizardSummaryMeta}>A challenge will be sent automatically</Text>
                    </View>
                  ) : null;
                })()}

                <Text style={evtStyles.wizardLabel}>Baan / Court (optioneel)</Text>
                {courts.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {courts.map(court => {
                      const selected = selectedCourtId === court.id;
                      return (
                        <Pressable
                          key={court.id}
                          onPress={() => { setSelectedCourtId(selected ? "" : court.id); Haptics.selectionAsync(); }}
                          style={[evtStyles.courtRow, selected && { borderColor: typeColor, backgroundColor: typeColor + "15" }]}
                        >
                          <Ionicons name="tennisball-outline" size={16} color={selected ? typeColor : "#7A8EA0"} />
                          <Text style={[evtStyles.courtRowTxt, selected && { color: typeColor, fontWeight: "700" }]} numberOfLines={1}>{court.name}</Text>
                          {court.surface ? (
                            <Text style={evtStyles.courtSurface}>{court.surface}</Text>
                          ) : null}
                          {selected ? <Ionicons name="checkmark-circle" size={18} color={typeColor} /> : null}
                        </Pressable>
                      );
                    })}
                    {selectedCourtId === "" ? (
                      <TextInput
                        style={[evtStyles.wizardInput, { marginTop: 4 }]}
                        value={location}
                        onChangeText={setLocation}
                        placeholder="Of typ een locatie..."
                        placeholderTextColor="#445566"
                      />
                    ) : null}
                  </View>
                ) : (
                  <TextInput
                    style={evtStyles.wizardInput}
                    value={location}
                    onChangeText={setLocation}
                    placeholder="e.g. Court 3, Main Club"
                    placeholderTextColor="#445566"
                  />
                )}

                <Text style={[evtStyles.wizardLabel, { marginTop: 16 }]}>Inzet / Prijs (optioneel)</Text>
                <View style={evtStyles.wagerRow}>
                  <Text style={evtStyles.wagerCurrency}>AED</Text>
                  <TextInput
                    style={[evtStyles.wizardInput, { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}
                    value={wager}
                    onChangeText={setWager}
                    placeholder="0"
                    placeholderTextColor="#445566"
                    keyboardType="decimal-pad"
                  />
                </View>

                <Text style={[evtStyles.wizardLabel, { marginTop: 16 }]}>Datum</Text>
                <Pressable onPress={() => setShowDatePicker(true)} style={evtStyles.dateBtn}>
                  <Ionicons name="calendar-outline" size={18} color={typeColor} />
                  <Text style={[evtStyles.dateBtnTxt, { color: typeColor }]}>
                    {eventDate.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </Text>
                </Pressable>
                {showDatePicker && (
                  Platform.OS === "web" ? (
                    <input
                      type="date"
                      min={toLocalDateString(new Date())}
                      value={toLocalDateString(eventDate)}
                      onChange={e => {
                        if (e.target.value) {
                          const [y, m, d] = e.target.value.split("-").map(Number);
                          setEventDate(prev => { const n = new Date(prev); n.setFullYear(y, m - 1, d); return n; });
                        }
                        setShowDatePicker(false);
                      }}
                      style={{ display: "block", marginTop: 8, padding: 8, fontSize: 16, width: "100%", borderRadius: 8, border: "1px solid #ccc" }}
                    />
                  ) : Platform.OS === "ios" ? (
                    <View>
                      <DateTimePicker
                        value={eventDate}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        onChange={(_, d) => { if (d) setEventDate(prev => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes()); return n; }); }}
                      />
                      <Pressable onPress={() => setShowDatePicker(false)} style={evtStyles.pickerDoneBtn}>
                        <Text style={evtStyles.pickerDoneTxt}>Klaar</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <DateTimePicker value={eventDate} mode="date" minimumDate={new Date()}
                      onChange={(_, d) => { setShowDatePicker(false); if (d) setEventDate(prev => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes()); return n; }); }} />
                  )
                )}
                <Text style={[evtStyles.wizardLabel, { marginTop: 16 }]}>Tijd</Text>
                <Pressable
                  onPress={() => setShowTimePicker(true)}
                  style={[evtStyles.dateBtn, { borderWidth: 1.5, borderColor: typeColor + "60" }]}
                >
                  <Ionicons name="time" size={18} color={typeColor} />
                  <Text style={[evtStyles.dateBtnTxt, { color: typeColor, fontSize: 17, fontWeight: "700" }]}>
                    {eventDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={typeColor + "80"} style={{ marginLeft: "auto" }} />
                </Pressable>
                {showTimePicker && (
                  Platform.OS === "web" ? (
                    <input
                      type="time"
                      value={`${String(eventDate.getHours()).padStart(2, "0")}:${String(eventDate.getMinutes()).padStart(2, "0")}`}
                      onChange={e => {
                        if (e.target.value) {
                          const [h, m] = e.target.value.split(":").map(Number);
                          setEventDate(prev => { const n = new Date(prev); n.setHours(h, m); return n; });
                        }
                        setShowTimePicker(false);
                      }}
                      style={{ display: "block", marginTop: 8, padding: 8, fontSize: 16, width: "100%", borderRadius: 8, border: "1px solid #ccc" }}
                    />
                  ) : Platform.OS === "ios" ? (
                    <View>
                      <DateTimePicker
                        value={eventDate}
                        mode="time"
                        display="spinner"
                        onChange={(_, d) => { if (d) setEventDate(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; }); }}
                      />
                      <Pressable onPress={() => setShowTimePicker(false)} style={evtStyles.pickerDoneBtn}>
                        <Text style={evtStyles.pickerDoneTxt}>Klaar</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <DateTimePicker value={eventDate} mode="time"
                      onChange={(_, d) => { setShowTimePicker(false); if (d) setEventDate(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; }); }} />
                  )
                )}
              </View>
            )}

            {/* ── Non-match flow ── */}
            {showEntryTypeSelector && (
              <View style={evtStyles.wizardSection}>
                <Text style={evtStyles.wizardLabel}>What kind of event?</Text>
                {/* Match shortcut — takes user into dedicated 2-step match flow */}
                <Pressable
                  onPress={() => { setEventType("match"); setIsMatchFlow(true); Haptics.selectionAsync(); }}
                  style={[evtStyles.typeChip, { flexDirection: "row", gap: 10, marginBottom: 4 }]}
                >
                  <Ionicons name="trophy" size={20} color="#7A8EA0" />
                  <View style={{ flex: 1 }}>
                    <Text style={evtStyles.typeChipTxt}>Match Challenge</Text>
                    <Text style={{ color: "#7A8EA0", fontSize: 11, marginTop: 2 }}>Select opponent + pick date in 2 steps</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#7A8EA0" />
                </Pressable>
                <View style={evtStyles.typeGrid}>
                  {EVENT_TYPES.filter(e => e.value !== "match").map((et) => (
                    <Pressable
                      key={et.value}
                      onPress={() => { setEventType(et.value); Haptics.selectionAsync(); }}
                      style={[evtStyles.typeChip, eventType === et.value && { borderColor: typeColor, backgroundColor: typeColor + "20" }]}
                    >
                      <Ionicons name={et.icon as any} size={20} color={eventType === et.value ? typeColor : "#7A8EA0"} />
                      <Text style={[evtStyles.typeChipTxt, eventType === et.value && { color: typeColor, fontWeight: "700" }]}>{et.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {!isMatchFlow && step === 1 && (
              <View style={evtStyles.wizardSection}>
                <Text style={evtStyles.wizardLabel}>Event title</Text>
                <TextInput
                  style={evtStyles.wizardInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Sunday Doubles"
                  placeholderTextColor="#445566"
                  autoFocus
                />
                <Text style={[evtStyles.wizardLabel, { marginTop: 16 }]}>Description (optional)</Text>
                <TextInput
                  style={[evtStyles.wizardInput, { minHeight: 80, textAlignVertical: "top" }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What should people know?"
                  placeholderTextColor="#445566"
                  multiline
                />
                <Text style={[evtStyles.wizardLabel, { marginTop: 16 }]}>Location (optional)</Text>
                <TextInput
                  style={evtStyles.wizardInput}
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Where is it?"
                  placeholderTextColor="#445566"
                />
                <Text style={[evtStyles.wizardLabel, { marginTop: 16 }]}>Max players (optional)</Text>
                <TextInput
                  style={evtStyles.wizardInput}
                  value={maxPlayers}
                  onChangeText={setMaxPlayers}
                  placeholder="No limit"
                  placeholderTextColor="#445566"
                  keyboardType="number-pad"
                />
              </View>
            )}

            {!isMatchFlow && step === 2 && (
              <View style={evtStyles.wizardSection}>
                <Text style={evtStyles.wizardLabel}>Date</Text>
                <Pressable onPress={() => setShowDatePicker(true)} style={evtStyles.dateBtn}>
                  <Ionicons name="calendar-outline" size={18} color={typeColor} />
                  <Text style={[evtStyles.dateBtnTxt, { color: typeColor }]}>
                    {eventDate.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </Text>
                </Pressable>
                {showDatePicker && (
                  Platform.OS === "web" ? (
                    <input
                      type="date"
                      min={toLocalDateString(new Date())}
                      value={toLocalDateString(eventDate)}
                      onChange={e => {
                        if (e.target.value) {
                          const [y, m, d] = e.target.value.split("-").map(Number);
                          setEventDate(prev => { const n = new Date(prev); n.setFullYear(y, m - 1, d); return n; });
                        }
                        setShowDatePicker(false);
                      }}
                      style={{ display: "block", marginTop: 8, padding: 8, fontSize: 16, width: "100%", borderRadius: 8, border: "1px solid #ccc" }}
                    />
                  ) : Platform.OS === "ios" ? (
                    <View>
                      <DateTimePicker
                        value={eventDate}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        onChange={(_, d) => { if (d) setEventDate(prev => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes()); return n; }); }}
                      />
                      <Pressable onPress={() => setShowDatePicker(false)} style={evtStyles.pickerDoneBtn}>
                        <Text style={evtStyles.pickerDoneTxt}>Klaar</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <DateTimePicker value={eventDate} mode="date" minimumDate={new Date()}
                      onChange={(_, d) => { setShowDatePicker(false); if (d) setEventDate(prev => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes()); return n; }); }} />
                  )
                )}
                <Text style={[evtStyles.wizardLabel, { marginTop: 16 }]}>Tijd</Text>
                <Pressable
                  onPress={() => setShowTimePicker(true)}
                  style={[evtStyles.dateBtn, { borderWidth: 1.5, borderColor: typeColor + "60" }]}
                >
                  <Ionicons name="time" size={18} color={typeColor} />
                  <Text style={[evtStyles.dateBtnTxt, { color: typeColor, fontSize: 17, fontWeight: "700" }]}>
                    {eventDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={typeColor + "80"} style={{ marginLeft: "auto" }} />
                </Pressable>
                {showTimePicker && (
                  Platform.OS === "web" ? (
                    <input
                      type="time"
                      value={`${String(eventDate.getHours()).padStart(2, "0")}:${String(eventDate.getMinutes()).padStart(2, "0")}`}
                      onChange={e => {
                        if (e.target.value) {
                          const [h, m] = e.target.value.split(":").map(Number);
                          setEventDate(prev => { const n = new Date(prev); n.setHours(h, m); return n; });
                        }
                        setShowTimePicker(false);
                      }}
                      style={{ display: "block", marginTop: 8, padding: 8, fontSize: 16, width: "100%", borderRadius: 8, border: "1px solid #ccc" }}
                    />
                  ) : Platform.OS === "ios" ? (
                    <View>
                      <DateTimePicker
                        value={eventDate}
                        mode="time"
                        display="spinner"
                        onChange={(_, d) => { if (d) setEventDate(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; }); }}
                      />
                      <Pressable onPress={() => setShowTimePicker(false)} style={evtStyles.pickerDoneBtn}>
                        <Text style={evtStyles.pickerDoneTxt}>Klaar</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <DateTimePicker value={eventDate} mode="time"
                      onChange={(_, d) => { setShowTimePicker(false); if (d) setEventDate(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; }); }} />
                  )
                )}
                <View style={[evtStyles.wizardSummary, { borderColor: typeColor + "30", backgroundColor: typeColor + "10" }]}>
                  <Text style={evtStyles.wizardSummaryTitle}>{title}</Text>
                  <Text style={evtStyles.wizardSummaryMeta}>{EVENT_TYPES.find(e => e.value === eventType)?.label} • {formatEventDate(eventDate.toISOString())}</Text>
                  {location ? <Text style={evtStyles.wizardSummaryMeta}>{location}</Text> : null}
                </View>
              </View>
            )}

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface AttendeeGroup {
  going: { userId: string; name: string; avatarUrl: string | null }[];
  maybe: { userId: string; name: string; avatarUrl: string | null }[];
  notGoing: { userId: string; name: string; avatarUrl: string | null }[];
}

function EventDetailSheet({
  event,
  groupId,
  typeColor,
  visible,
  onClose,
  onRsvp,
  isAdmin,
  currentUserId,
  onDelete,
  onEdit,
}: {
  event: GroupEvent | null;
  groupId: string;
  typeColor: string;
  visible: boolean;
  onClose: () => void;
  onRsvp: (eventId: string, status: "going" | "maybe" | "not_going") => void;
  isAdmin: boolean;
  currentUserId?: string;
  onDelete: (eventId: string) => void;
  onEdit: (event: GroupEvent) => void;
}) {
  const insets = useSafeAreaInsets();
  const { data: attendees } = useQuery<AttendeeGroup>({
    queryKey: [`/api/player/groups/${groupId}/events/${event?.id}/attendees`],
    enabled: visible && !!event?.id,
  });

  if (!event) return null;
  const isPast = new Date(event.eventDate) < new Date();
  const isCreator = event.creatorId === currentUserId;
  const goingCount = event.goingCount ?? 0;
  const maybeCount = event.maybeCount ?? 0;

  const RSVP_LABELS: Record<string, string> = { going: "Going", maybe: "Maybe", not_going: "Decline" };
  const RSVP_COLORS: Record<string, string> = { going: "#4ECDC4", maybe: "#FFD166", not_going: "#FF6B6B" };

  const renderAttendeeRow = (a: { userId: string; name: string; avatarUrl: string | null }, idx: number) => {
    const photoUri = getPhotoUri(a.avatarUrl);
    return (
      <View key={a.userId + idx} style={detailStyles.attendeeRow}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={detailStyles.attendeeAvatar} />
        ) : (
          <View style={[detailStyles.attendeeAvatarFallback, { backgroundColor: typeColor + "30" }]}>
            <Text style={[detailStyles.attendeeAvatarInit, { color: typeColor }]}>{a.name[0]?.toUpperCase()}</Text>
          </View>
        )}
        <Text style={detailStyles.attendeeName}>{a.name}</Text>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[detailStyles.sheet, { paddingBottom: insets.bottom || 20 }]}>
          <View style={styles.composeHandle} />

          {/* Header */}
          <View style={detailStyles.header}>
            <View style={{ flex: 1 }}>
              <View style={[evtStyles.eventTypeBadge, { backgroundColor: typeColor + "20", alignSelf: "flex-start", marginBottom: 8 }]}>
                <Ionicons
                  name={(EVENT_TYPES.find(e => e.value === event.eventType)?.icon ?? "calendar") as any}
                  size={13}
                  color={typeColor}
                />
                <Text style={[evtStyles.eventTypeTxt, { color: typeColor }]}>
                  {EVENT_TYPES.find(e => e.value === event.eventType)?.label ?? event.eventType}
                </Text>
              </View>
              <Text style={detailStyles.title}>{event.title}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(isAdmin || isCreator) ? (
                <>
                  <Pressable onPress={() => { onClose(); setTimeout(() => onEdit(event), 300); }} style={evtStyles.deleteBtn}>
                    <Ionicons name="create-outline" size={18} color={typeColor} />
                  </Pressable>
                  <Pressable onPress={() => {
                    Alert.alert("Delete Event", "Remove this event?", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => { onDelete(event.id); onClose(); } },
                    ]);
                  }} style={evtStyles.deleteBtn}>
                    <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                  </Pressable>
                </>
              ) : null}
              <Pressable onPress={onClose} style={evtStyles.deleteBtn}>
                <Ionicons name="close" size={18} color="#7A8EA0" />
              </Pressable>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {/* Event info */}
            {event.description ? <Text style={detailStyles.desc}>{event.description}</Text> : null}

            <View style={detailStyles.metaSection}>
              <View style={evtStyles.metaRow}>
                <Ionicons name="time-outline" size={14} color="#7A8EA0" />
                <Text style={evtStyles.metaTxt}>{formatEventDate(event.eventDate)}</Text>
              </View>
              {event.location ? (
                <View style={evtStyles.metaRow}>
                  <Ionicons name="location-outline" size={14} color="#7A8EA0" />
                  <Text style={evtStyles.metaTxt}>{event.location}</Text>
                </View>
              ) : null}
              {event.maxPlayers ? (
                <View style={evtStyles.metaRow}>
                  <Ionicons name="people-outline" size={14} color="#7A8EA0" />
                  <Text style={evtStyles.metaTxt}>{goingCount}/{event.maxPlayers} going</Text>
                </View>
              ) : null}
            </View>

            {/* Summary pill */}
            <View style={detailStyles.countRow}>
              {goingCount > 0 && (
                <View style={[detailStyles.countPill, { backgroundColor: "#4ECDC420" }]}>
                  <Text style={[detailStyles.countNum, { color: "#4ECDC4" }]}>{goingCount}</Text>
                  <Text style={detailStyles.countLabel}>Going</Text>
                </View>
              )}
              {maybeCount > 0 && (
                <View style={[detailStyles.countPill, { backgroundColor: "#FFD16620" }]}>
                  <Text style={[detailStyles.countNum, { color: "#FFD166" }]}>{maybeCount}</Text>
                  <Text style={detailStyles.countLabel}>Maybe</Text>
                </View>
              )}
            </View>

            {/* Attendees list */}
            {attendees && (attendees.going.length > 0 || attendees.maybe.length > 0 || attendees.notGoing.length > 0) ? (
              <View style={detailStyles.attendeeSection}>
                {attendees.going.length > 0 && (
                  <>
                    <Text style={[detailStyles.sectionLabel, { color: "#4ECDC4" }]}>Going ({attendees.going.length})</Text>
                    {attendees.going.map((a, i) => renderAttendeeRow(a, i))}
                  </>
                )}
                {attendees.maybe.length > 0 && (
                  <>
                    <Text style={[detailStyles.sectionLabel, { color: "#FFD166", marginTop: 12 }]}>Maybe ({attendees.maybe.length})</Text>
                    {attendees.maybe.map((a, i) => renderAttendeeRow(a, i))}
                  </>
                )}
                {attendees.notGoing.length > 0 && (
                  <>
                    <Text style={[detailStyles.sectionLabel, { color: "#FF6B6B", marginTop: 12 }]}>Can't make it ({attendees.notGoing.length})</Text>
                    {attendees.notGoing.map((a, i) => renderAttendeeRow(a, i))}
                  </>
                )}
              </View>
            ) : null}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* RSVP buttons */}
          {!isPast && (
            <View style={[evtStyles.rsvpRow, { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)" }]}>
              {(["going", "maybe", "not_going"] as const).map((status) => {
                const active = event.myRsvpStatus === status;
                return (
                  <Pressable
                    key={status}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRsvp(event.id, status); }}
                    style={[evtStyles.rsvpBtn, active && { backgroundColor: RSVP_COLORS[status] + "30", borderColor: RSVP_COLORS[status] }]}
                  >
                    <Text style={[evtStyles.rsvpBtnTxt, active && { color: RSVP_COLORS[status], fontWeight: "700" }]}>
                      {RSVP_LABELS[status]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function GroupEventsTab({
  groupId,
  typeColor,
  isAdmin,
  currentUserId,
  members,
}: {
  groupId: string;
  typeColor: string;
  isAdmin: boolean;
  currentUserId?: string;
  members: GroupDetail["members"];
}) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingEvent, setEditingEvent] = useState<GroupEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<GroupEvent | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editWager, setEditWager] = useState("");
  const [editDate, setEditDate] = useState(new Date());
  const [editShowDatePicker, setEditShowDatePicker] = useState(false);
  const [editShowTimePicker, setEditShowTimePicker] = useState(false);
  const insets = useSafeAreaInsets();

  const { data: events = [], isLoading, refetch } = useQuery<GroupEvent[]>({
    queryKey: [`/api/player/groups/${groupId}/events`],
  });

  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: string }) =>
      apiRequest("POST", `/api/player/groups/${groupId}/events/${eventId}/rsvp`, { status }),
    onMutate: async ({ eventId, status }) => {
      await queryClient.cancelQueries({ queryKey: [`/api/player/groups/${groupId}/events`] });
      const previous = queryClient.getQueryData<GroupEvent[]>([`/api/player/groups/${groupId}/events`]);
      // Snapshot selectedEvent for rollback
      let previousSelectedEvent: GroupEvent | null = null;
      queryClient.setQueryData<GroupEvent[]>([`/api/player/groups/${groupId}/events`], (old = []) =>
        old.map((e) => {
          if (e.id !== eventId) return e;
          const prev = e.myRsvpStatus;
          const goingDelta = (status === "going" ? 1 : 0) - (prev === "going" ? 1 : 0);
          const maybeDelta = (status === "maybe" ? 1 : 0) - (prev === "maybe" ? 1 : 0);
          const notGoingDelta = (status === "not_going" ? 1 : 0) - (prev === "not_going" ? 1 : 0);
          return {
            ...e,
            myRsvpStatus: status,
            goingCount: Math.max(0, e.goingCount + goingDelta),
            maybeCount: Math.max(0, e.maybeCount + maybeDelta),
            notGoingCount: Math.max(0, e.notGoingCount + notGoingDelta),
          };
        })
      );
      // Also update selectedEvent so detail sheet reflects change instantly
      setSelectedEvent(prev => {
        if (!prev || prev.id !== eventId) return prev;
        previousSelectedEvent = prev;
        const goingDelta = (status === "going" ? 1 : 0) - (prev.myRsvpStatus === "going" ? 1 : 0);
        const maybeDelta = (status === "maybe" ? 1 : 0) - (prev.myRsvpStatus === "maybe" ? 1 : 0);
        const notGoingDelta = (status === "not_going" ? 1 : 0) - (prev.myRsvpStatus === "not_going" ? 1 : 0);
        return {
          ...prev,
          myRsvpStatus: status,
          goingCount: Math.max(0, prev.goingCount + goingDelta),
          maybeCount: Math.max(0, prev.maybeCount + maybeDelta),
          notGoingCount: Math.max(0, prev.notGoingCount + notGoingDelta),
        };
      });
      return { previous, previousSelectedEvent };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData([`/api/player/groups/${groupId}/events`], context.previous);
      }
      if (context?.previousSelectedEvent) {
        setSelectedEvent(context.previousSelectedEvent);
      }
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/player/groups/${groupId}/events`] });
      // Refresh attendee list for the event so groupings stay accurate
      queryClient.invalidateQueries({ queryKey: [`/api/player/groups/${groupId}/events/${vars.eventId}/attendees`] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => apiRequest("DELETE", `/api/player/groups/${groupId}/events/${eventId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/player/groups/${groupId}/events`] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert("Error", e.message || "Failed to delete event"),
  });

  const editMutation = useMutation({
    mutationFn: ({ eventId, payload }: { eventId: string; payload: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/player/groups/${groupId}/events/${eventId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/player/groups/${groupId}/events`] });
      setEditingEvent(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert("Error", e.message || "Failed to update event"),
  });

  const openEditModal = (event: GroupEvent) => {
    setEditingEvent(event);
    setEditTitle(event.title);
    setEditDescription(event.description ?? "");
    setEditLocation(event.location ?? "");
    setEditWager(event.wager ? String(parseFloat(event.wager)) : "");
    setEditDate(new Date(event.eventDate));
  };

  const submitEdit = () => {
    if (!editingEvent || !editTitle.trim()) return;
    editMutation.mutate({
      eventId: editingEvent.id,
      payload: {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        location: editLocation.trim() || null,
        eventDate: editDate.toISOString(),
        wager: editWager.trim() ? parseFloat(editWager.trim()) : null,
      },
    });
  };

  if (isLoading) {
    return <ActivityIndicator style={{ marginTop: 60 }} color={typeColor} />;
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Edit Event Modal */}
      <Modal visible={editingEvent !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingEvent(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#0A1628" }}>
          <View style={evtStyles.wizardHeader}>
            <Pressable onPress={() => setEditingEvent(null)}><Text style={evtStyles.wizardCancel}>Cancel</Text></Pressable>
            <Text style={evtStyles.wizardTitle}>Edit Event</Text>
            <Pressable onPress={submitEdit} disabled={!editTitle.trim() || editMutation.isPending}>
              <Text style={[evtStyles.wizardNext, { color: typeColor, opacity: editTitle.trim() ? 1 : 0.4 }]}>
                {editMutation.isPending ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <View style={evtStyles.wizardSection}>
              <Text style={evtStyles.wizardLabel}>Title</Text>
              <TextInput
                style={evtStyles.wizardInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Event title"
                placeholderTextColor="#445566"
              />
            </View>
            <View style={evtStyles.wizardSection}>
              <Text style={evtStyles.wizardLabel}>Description (optional)</Text>
              <TextInput
                style={[evtStyles.wizardInput, { height: 80 }]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Add a description"
                placeholderTextColor="#445566"
                multiline
              />
            </View>
            <View style={evtStyles.wizardSection}>
              <Text style={evtStyles.wizardLabel}>Location (optional)</Text>
              <TextInput
                style={evtStyles.wizardInput}
                value={editLocation}
                onChangeText={setEditLocation}
                placeholder="Where is it?"
                placeholderTextColor="#445566"
              />
            </View>
            {editingEvent?.eventType === "match" ? (
              <View style={evtStyles.wizardSection}>
                <Text style={evtStyles.wizardLabel}>Inzet / Prijs (optioneel)</Text>
                <View style={evtStyles.wagerRow}>
                  <Text style={evtStyles.wagerCurrency}>AED</Text>
                  <TextInput
                    style={[evtStyles.wizardInput, { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}
                    value={editWager}
                    onChangeText={setEditWager}
                    placeholder="0"
                    placeholderTextColor="#445566"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            ) : null}
            <View style={evtStyles.wizardSection}>
              <Text style={evtStyles.wizardLabel}>Date</Text>
              <Pressable onPress={() => setEditShowDatePicker(true)} style={evtStyles.dateBtn}>
                <Ionicons name="calendar-outline" size={18} color={typeColor} />
                <Text style={[evtStyles.dateBtnTxt, { color: typeColor }]}>
                  {editDate.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </Text>
              </Pressable>
              {editShowDatePicker && (
                <DateTimePicker
                  value={editDate}
                  mode="date"
                  onChange={(_, d) => { setEditShowDatePicker(false); if (d) setEditDate(prev => { const n = new Date(d); n.setHours(prev.getHours(), prev.getMinutes()); return n; }); }}
                />
              )}
              <Text style={[evtStyles.wizardLabel, { marginTop: 16 }]}>Time</Text>
              <Pressable
                onPress={() => setEditShowTimePicker(true)}
                style={[evtStyles.dateBtn, { borderWidth: 1.5, borderColor: typeColor + "60" }]}
              >
                <Ionicons name="time" size={18} color={typeColor} />
                <Text style={[evtStyles.dateBtnTxt, { color: typeColor, fontSize: 17, fontWeight: "700" }]}>
                  {editDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
                <Ionicons name="chevron-down" size={14} color={typeColor + "80"} style={{ marginLeft: "auto" }} />
              </Pressable>
              {editShowTimePicker && (
                <DateTimePicker
                  value={editDate}
                  mode="time"
                  onChange={(_, d) => { setEditShowTimePicker(false); if (d) setEditDate(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; }); }}
                />
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedEvent(item); }}>
            <EventCard
              event={item}
              typeColor={typeColor}
              onRsvp={(id, status) => rsvpMutation.mutate({ eventId: id, status })}
              onDelete={(id) => deleteMutation.mutate(id)}
              onEdit={openEditModal}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
            />
          </Pressable>
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={typeColor} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: typeColor + "20" }]}>
              <Ionicons name="calendar-outline" size={36} color={typeColor} />
            </View>
            <Text style={styles.emptyTitle}>No upcoming events</Text>
            <Text style={styles.emptySubtitle}>Tap + to create a group event</Text>
          </View>
        }
      />
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowCreate(true); }}
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
      >
        <LinearGradient
          colors={[typeColor, typeColor + "BB"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={28} color={Colors.dark.buttonText} />
        </LinearGradient>
      </Pressable>
      <CreateEventWizard
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        groupId={groupId}
        typeColor={typeColor}
        members={members}
      />
      <EventDetailSheet
        event={selectedEvent}
        groupId={groupId}
        typeColor={typeColor}
        visible={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
        onRsvp={(id, status) => rsvpMutation.mutate({ eventId: id, status })}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        onDelete={(id) => deleteMutation.mutate(id)}
        onEdit={openEditModal}
      />
    </View>
  );
}

// ─── GROUP CHAT TAB ────────────────────────────────────────────────────────────

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎾", "🔥"];

function GroupChatTab({
  groupId,
  typeColor,
  groupName,
}: {
  groupId: string;
  typeColor: string;
  groupName: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingConv, setLoadingConv] = useState(true);
  const [convError, setConvError] = useState(false);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  // Server-backed read state: latest timestamp that any other participant has read up to
  const [othersLastReadAt, setOthersLastReadAt] = useState<Date | null>(null);
  const stick = useChatStickyBottom<ChatMessage>({
    itemCount: chatMessages.length,
    resetKey: conversationId,
  });

  const initConversation = useCallback(async () => {
    setLoadingConv(true);
    setConvError(false);
    try {
      const res = await apiRequest("POST", "/api/player/me/conversations", {
        type: "group",
        groupId,
      });
      const data = await res.json();
      setConversationId(data.id);
    } catch (e) {
      console.error("Failed to get group conversation:", e);
      setConvError(true);
    } finally {
      setLoadingConv(false);
    }
  }, [groupId]);

  // Get or create group conversation on mount
  useEffect(() => {
    initConversation();
  }, [initConversation]);

  // Load messages + fetch others' read state
  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const [msgsRes, readStateRes] = await Promise.all([
        apiRequest("GET", `/api/player/me/conversations/${conversationId}/messages?limit=100`),
        apiRequest("GET", `/api/player/me/conversations/${conversationId}/read-state`).catch(async () => new Response("[]", { status: 200 })),
      ]);
      const msgs = await msgsRes.json();
      const readState = await readStateRes.json().catch(() => []);
      setChatMessages(msgs);
      // Mark self as read
      apiRequest("POST", `/api/player/me/conversations/${conversationId}/read`).catch(() => {});
      // Compute the latest timestamp any other participant has read up to
      if (Array.isArray(readState) && readState.length > 0) {
        const latest = readState.reduce<Date | null>((max, p) => {
          if (!p.lastReadAt) return max;
          const d = new Date(p.lastReadAt);
          return max === null || d > max ? d : max;
        }, null);
        setOthersLastReadAt(latest);
      }
    } catch (e) {
      console.error("Failed to load messages:", e);
    }
  }, [conversationId]);

  // Load messages when conversationId first becomes available
  useEffect(() => {
    if (conversationId) loadMessages();
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time via WebSocket
  useWebSocket({
    onNewMessage: useCallback((payload: NewMessagePayload) => {
      if (payload.conversationId === conversationId) {
        setChatMessages(prev => {
          const exists = prev.find(m => m.id === payload.message.id);
          if (exists) return prev;
          const wsMsg: ChatMessage = {
            id: payload.message.id,
            conversationId: payload.conversationId,
            senderType: payload.message.senderType,
            senderPlayerId: payload.message.senderId ?? null,
            body: payload.message.content,
            createdAt: payload.message.createdAt,
            reactions: [],
          };
          return [...prev, wsMsg];
        });
      }
    }, [conversationId]),
    onMessageRead: useCallback(() => {
      // Refresh read state when another participant marks the conversation read
      if (conversationId) {
        apiRequest("GET", `/api/player/me/conversations/${conversationId}/read-state`)
          .then(res => res.json())
          .then((readState: Array<{ playerId: string | null; lastReadAt: string | Date | null }>) => {
            if (Array.isArray(readState) && readState.length > 0) {
              const latest = readState.reduce<Date | null>((max, p) => {
                if (!p.lastReadAt) return max;
                const d = new Date(p.lastReadAt);
                return max === null || d > max ? d : max;
              }, null);
              setOthersLastReadAt(latest);
            }
          })
          .catch(() => {});
      }
    }, [conversationId]),
  });

  const sendMessage = async () => {
    if (!inputText.trim() || !conversationId || sending) return;
    const text = inputText.trim();
    setInputText("");
    setSending(true);
    try {
      await apiRequest("POST", `/api/player/me/conversations/${conversationId}/messages`, { body: text });
      await loadMessages();
      setTimeout(() => stick.scrollToBottom(true), 150);
    } catch {
      Alert.alert("Error", "Failed to send message");
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const addReaction = async (messageId: string, emoji: string) => {
    if (!conversationId) return;
    try {
      await apiRequest("POST", `/api/player/me/messages/${messageId}/reactions`, { emoji });
      await loadMessages();
    } catch {
      // silent fail — reactions are non-critical
    }
  };

  if (loadingConv) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={typeColor} />
      </View>
    );
  }

  if (convError && !conversationId) {
    return (
      <View style={styles.emptyState}>
        <View style={[styles.emptyIcon, { backgroundColor: typeColor + "20" }]}>
          <Ionicons name="chatbubbles-outline" size={36} color={typeColor} />
        </View>
        <Text style={styles.emptyTitle}>Couldn't load chat</Text>
        <Text style={styles.emptySubtitle}>Check your connection and try again</Text>
        <Pressable onPress={initConversation} style={{ marginTop: 20, alignSelf: "center", borderRadius: 24, overflow: "hidden" }}>
          <LinearGradient colors={[typeColor, typeColor + "BB"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, paddingHorizontal: 28, paddingVertical: 13 }}>
            <Text style={{ color: Colors.dark.buttonText, fontWeight: "700", fontSize: 15 }}>Try Again</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={stick.ref}
        data={chatMessages}
        keyExtractor={(m) => m.id}
        renderItem={({ item, index }) => {
          // Server-backed seen indicator: show "Seen" on the last sent message that
          // falls before the latest timestamp any other participant has read up to
          const isMyLastSeen = item.senderPlayerId === user?.playerId &&
            othersLastReadAt !== null &&
            new Date(item.createdAt) <= othersLastReadAt &&
            (index === chatMessages.length - 1 ||
              chatMessages.slice(index + 1).every(m => m.senderPlayerId !== user?.playerId));
          return (
            <ChatBubble
              message={item}
              typeColor={typeColor}
              currentPlayerId={user?.playerId ?? null}
              showSeenIndicator={isMyLastSeen}
              onReact={(emoji) => addReaction(item.id, emoji)}
            />
          );
        }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 }}
        onContentSizeChange={stick.onContentSizeChange}
        onLayout={stick.onLayout}
        onScroll={stick.onScroll}
        scrollEventThrottle={stick.scrollEventThrottle}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: typeColor + "20" }]}>
              <Ionicons name="chatbubbles-outline" size={36} color={typeColor} />
            </View>
            <Text style={styles.emptyTitle}>Start the conversation</Text>
            <Text style={styles.emptySubtitle}>Send the first message to the group</Text>
          </View>
        }
      />
      {stick.hasNewBelow ? (
        <Pressable
          style={{
            position: "absolute",
            bottom: 80,
            alignSelf: "center",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: typeColor,
          }}
          onPress={() => stick.scrollToBottom(true)}
        >
          <Ionicons name="arrow-down" size={14} color="#000" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#000" }}>{t("chat.newMessage")}</Text>
        </Pressable>
      ) : null}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[chatStyles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={chatStyles.chatInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message group..."
            placeholderTextColor="#445566"
            multiline
            maxLength={1000}
          />
          <Pressable
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
            style={[chatStyles.sendBtn, { backgroundColor: inputText.trim() ? typeColor : typeColor + "40" }]}
          >
            {sending ? <ActivityIndicator size="small" color={Colors.dark.buttonText} /> : <Ionicons name="send" size={18} color={Colors.dark.buttonText} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function ChatBubble({
  message,
  typeColor,
  currentPlayerId,
  showSeenIndicator,
  onReact,
}: {
  message: ChatMessage;
  typeColor: string;
  currentPlayerId: string | null;
  showSeenIndicator: boolean;
  onReact: (emoji: string) => void;
}) {
  const isMe = message.senderPlayerId === currentPlayerId;
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const [showReactions, setShowReactions] = useState(false);

  // Aggregate reactions
  const reactionCounts = message.reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <View style={[chatStyles.bubbleWrap, isMe ? chatStyles.bubbleWrapMe : chatStyles.bubbleWrapOther]}>
      <Pressable
        onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowReactions(true); }}
        style={[chatStyles.bubble, isMe ? [chatStyles.bubbleMe, { backgroundColor: typeColor + "30", borderColor: typeColor + "50" }] : chatStyles.bubbleOther]}
      >
        <Text style={[chatStyles.bubbleTxt, isMe && { color: TextColors.primary }]}>{message.body}</Text>
        <View style={chatStyles.bubbleFooter}>
          <Text style={[chatStyles.bubbleTime, isMe && { color: typeColor }]}>{time}</Text>
          {isMe ? (
            <Ionicons name="checkmark-done" size={13} color={typeColor} style={{ marginLeft: 4 }} />
          ) : null}
        </View>
      </Pressable>

      {/* Reaction counts */}
      {Object.keys(reactionCounts).length > 0 && (
        <View style={[chatStyles.reactionRow, isMe ? chatStyles.reactionRowMe : chatStyles.reactionRowOther]}>
          {Object.entries(reactionCounts).map(([emoji, count]) => (
            <Pressable key={emoji} onPress={() => onReact(emoji)} style={chatStyles.reactionChip}>
              <Text style={chatStyles.reactionEmoji}>{emoji}</Text>
              {count > 1 ? <Text style={chatStyles.reactionCount}>{count}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}

      {/* Quick reaction picker */}
      {showReactions ? (
        <Pressable onPress={() => setShowReactions(false)} style={chatStyles.reactionPickerBackdrop}>
          <View style={[chatStyles.reactionPicker, isMe ? { right: 0 } : { left: 0 }]}>
            {QUICK_REACTIONS.map(emoji => (
              <Pressable
                key={emoji}
                onPress={() => { setShowReactions(false); onReact(emoji); }}
                style={chatStyles.reactionPickerBtn}
              >
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      ) : null}

      {/* Server-backed seen indicator — shown on sender's message once others have read past it */}
      {showSeenIndicator ? (
        <Text style={[chatStyles.seenLabel, { alignSelf: "flex-end" }]}>Seen</Text>
      ) : null}
    </View>
  );
}

// ─── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function GroupDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { groupId, groupName = "" } = route.params as { groupId: string; groupName?: string };
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [composeVisible, setComposeVisible] = useState(false);
  const [addMembersVisible, setAddMembersVisible] = useState(false);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery<GroupDetail>({
    queryKey: [`/api/player/groups/${groupId}`],
  });

  const { data: feedData, isLoading: feedLoading, refetch: refetchFeed } = useQuery<{ posts: Post[] }>({
    queryKey: [`/api/player/groups/${groupId}/feed`],
    enabled: activeTab === "feed",
  });

  const leaveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/player/groups/${groupId}/leave`),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ["/api/player/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/groups"] });
      navigation.goBack();
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to leave group");
    },
  });

  const handleLeave = () => {
    Alert.alert("Leave Group", `Leave "${groupName}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => leaveMutation.mutate() },
    ]);
  };

  const handleInvite = async () => {
    const name = data?.group.name || groupName;
    const domain = process.env.EXPO_PUBLIC_DOMAIN || "glowupsports.com";
    const inviteUrl = `https://${domain}/group/${groupId}`;
    try {
      await Share.share({
        message: `Join my group "${name}" on Glow Up Sports! ${inviteUrl}`,
        title: `Join ${name}`,
        url: inviteUrl,
      });
    } catch {
      Alert.alert("Error", "Could not open share sheet");
    }
  };

  const handleMenu = () => {
    const isAdmin = data?.myRole === "admin";
    const isMember = data?.isMember;
    const options: Array<{ text: string; style?: "destructive" | "cancel"; onPress?: () => void }> = [];
    if (isMember) options.push({ text: "Invite to Group", onPress: handleInvite });
    if (isMember && !isAdmin) options.push({ text: "Leave Group", style: "destructive", onPress: handleLeave });
    options.push({ text: "Cancel", style: "cancel" });
    Alert.alert(data?.group.name || groupName, undefined, options);
  };

  const typeConfig = GROUP_TYPE_CONFIG[data?.group.type || "friends"] || GROUP_TYPE_CONFIG.friends;
  const typeColor = typeConfig.color;
  const isAdmin = data?.myRole === "admin";

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  const posts = feedData?.posts || [];
  const members = data?.members || [];

  return (
    <View style={styles.container}>
      {/* HERO HEADER */}
      <View style={styles.heroWrapper}>
        <LinearGradient
          colors={[typeColor + "CC", typeColor + "44", Backgrounds.root]}
          locations={[0, 0.55, 1]}
          style={[styles.hero, { paddingTop: insets.top + 12 }]}
        >
          <View style={styles.heroTopRow}>
            <Pressable style={styles.heroBackBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            {data?.isMember ? (
              <Pressable style={styles.heroMenuBtn} onPress={handleMenu}>
                <Ionicons name="ellipsis-horizontal" size={20} color="rgba(255,255,255,0.8)" />
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.heroIcon, { backgroundColor: typeColor + "35", borderColor: typeColor + "60" }]}>
            <Ionicons name={typeConfig.icon as any} size={36} color={typeColor} />
          </View>

          <Text style={styles.heroName}>{data?.group.name || groupName}</Text>

          <View style={[styles.heroBadge, { backgroundColor: typeColor + "25" }]}>
            <Text style={[styles.heroBadgeText, { color: typeColor }]}>{typeConfig.label}</Text>
          </View>
        </LinearGradient>
      </View>

      {/* STATS PILLS */}
      <Animated.View entering={FadeIn.duration(400)}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statsScroll}
          contentContainerStyle={styles.statsContent}
        >
          <View style={styles.statPill}>
            <Ionicons name="people" size={13} color={typeColor} />
            <Text style={styles.statPillText}>{data?.memberCount ?? 0} Members</Text>
          </View>
          <View style={styles.statPill}>
            <Ionicons name="document-text" size={13} color="#7A8EA0" />
            <Text style={styles.statPillText}>{posts.length} Posts</Text>
          </View>
          {data?.group.isPrivate ? (
            <View style={styles.statPill}>
              <Ionicons name="lock-closed" size={13} color="#7A8EA0" />
              <Text style={styles.statPillText}>Private</Text>
            </View>
          ) : null}
          {data?.group.allowChat ? (
            <View style={[styles.statPill, { borderColor: Colors.dark.primary + "30" }]}>
              <Ionicons name="chatbubble" size={13} color={Colors.dark.primary} />
              <Text style={[styles.statPillText, { color: Colors.dark.primary }]}>Chat On</Text>
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>

      {/* TABS */}
      <View style={styles.tabRow}>
        {([
          { id: "feed", label: "Feed" },
          { id: "events", label: "Events" },
          { id: "chat", label: "Chat" },
          { id: "members", label: "Members" },
        ] as const).map((tab) => (
          <Pressable key={tab.id} style={styles.tabItem} onPress={() => setActiveTab(tab.id)}>
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>{tab.label}</Text>
            {activeTab === tab.id ? <View style={[styles.tabUnderline, { backgroundColor: typeColor }]} /> : null}
          </Pressable>
        ))}
        {activeTab === "members" && isAdmin ? (
          <Pressable
            style={styles.tabAddBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAddMembersVisible(true);
            }}
          >
            <Ionicons name="person-add-outline" size={18} color={typeColor} />
          </Pressable>
        ) : null}
      </View>

      {/* CONTENT */}
      {activeTab === "feed" ? (
        feedLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.dark.primary} />
          </View>
        ) : (
          <FlatList
            key="feed"
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PostCard
                post={item}
                typeColor={typeColor}
                groupId={groupId}
                onCommentPress={() => setCommentPostId(item.id)}
              />
            )}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 110 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.primary} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: typeColor + "15" }]}>
                  <Ionicons name="tennisball" size={36} color={typeColor} />
                </View>
                <Text style={styles.emptyTitle}>No Posts Yet</Text>
                <Text style={styles.emptySubtitle}>
                  {data?.isMember ? "Be the first to share something!" : "Join the group to see posts"}
                </Text>
              </View>
            }
          />
        )
      ) : activeTab === "events" ? (
        <GroupEventsTab
          groupId={groupId}
          typeColor={typeColor}
          isAdmin={isAdmin}
          currentUserId={user?.id}
          members={members}
        />
      ) : activeTab === "chat" ? (
        data?.isMember ? (
          <GroupChatTab
            groupId={groupId}
            typeColor={typeColor}
            groupName={data?.group.name ?? groupName}
          />
        ) : (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: typeColor + "15" }]}>
              <Ionicons name="chatbubbles-outline" size={36} color={typeColor} />
            </View>
            <Text style={styles.emptyTitle}>Members Only</Text>
            <Text style={styles.emptySubtitle}>Join the group to access group chat</Text>
          </View>
        )
      ) : (
        <FlatList
          key="members"
          data={members}
          keyExtractor={(item) => item.id}
          numColumns={4}
          renderItem={({ item }) => <MemberGridCell member={item} typeColor={typeColor} />}
          contentContainerStyle={[styles.memberGrid, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: typeColor + "15" }]}>
                <Ionicons name="people" size={36} color={typeColor} />
              </View>
              <Text style={styles.emptyTitle}>No Members Yet</Text>
              <Text style={styles.emptySubtitle}>Be the first to join!</Text>
            </View>
          }
        />
      )}

      {/* POST FAB — only on feed tab */}
      {activeTab === "feed" && data?.isMember && data?.group.allowPosts ? (
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 20 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setComposeVisible(true);
          }}
        >
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.primary + "CC"]}
            style={styles.fabGradient}
          >
            <Ionicons name="add" size={26} color={Colors.dark.buttonText} />
          </LinearGradient>
        </Pressable>
      ) : null}

      {/* MODALS */}
      <ComposePostModal
        visible={composeVisible}
        onClose={() => setComposeVisible(false)}
        groupId={groupId}
        typeColor={typeColor}
      />

      <AddMembersModal
        visible={addMembersVisible}
        onClose={() => setAddMembersVisible(false)}
        groupId={groupId}
        typeColor={typeColor}
      />

      <CommentsSheet
        postId={commentPostId || ""}
        visible={!!commentPostId}
        onClose={() => setCommentPostId(null)}
        typeColor={typeColor}
        onCommentAdded={() => refetchFeed()}
      />
    </View>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────────

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: Backgrounds.root },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Hero
  heroWrapper: { overflow: "hidden" },
  hero: { paddingHorizontal: 20, paddingBottom: 28, alignItems: "center" },
  heroTopRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  heroBackBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  heroMenuBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  heroIcon: { width: 80, height: 80, borderRadius: 24, justifyContent: "center", alignItems: "center", borderWidth: 1.5, marginBottom: 14 },
  heroName: { fontSize: 22, fontWeight: "800", color: TextColors.primary, textAlign: "center", marginBottom: 10, letterSpacing: 0.3 },
  heroBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  heroBadgeText: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },

  // Stats
  statsScroll: { backgroundColor: Backgrounds.root },
  statsContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  statPill: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.chipBackground, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, gap: 6, borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong, marginRight: 8 },
  statPillText: { fontSize: 13, fontWeight: "500", color: "#7A8EA0" },

  // Tabs
  tabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)", backgroundColor: Backgrounds.root, alignItems: "center" },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 13, position: "relative" },
  tabLabel: { fontSize: 14, fontWeight: "600", color: "#445566" },
  tabLabelActive: { color: TextColors.primary },
  tabUnderline: { position: "absolute", bottom: 0, left: "20%", right: "20%", height: 2.5, borderRadius: 2 },
  tabAddBtn: { paddingHorizontal: 16, paddingVertical: 13, justifyContent: "center", alignItems: "center" },

  // Feed list
  listContent: { paddingHorizontal: 16, paddingTop: 14 },

  // Post card
  postCard: { backgroundColor: Backgrounds.root, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.dark.chipBackground },
  postHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  postAvatar: { width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center" },
  postAvatarInitial: { fontSize: 15, fontWeight: "700" },
  postMeta: { flex: 1, marginLeft: 10 },
  postAuthor: { fontSize: 14, fontWeight: "600", color: TextColors.primary },
  postTime: { fontSize: 12, color: "#445566", marginTop: 1 },
  postCaption: { fontSize: 14, color: "#8899AA", lineHeight: 21, marginBottom: 10 },

  // Media
  mediaStrip: { marginHorizontal: -16, marginBottom: 10 },
  mediaStripContent: { paddingHorizontal: 16, gap: 8 },
  mediaImage: { width: 180, height: 200, borderRadius: 12 },
  mediaImageSingle: { width: "100%", height: 240 },

  // Post actions
  postActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.dark.chipBackground, paddingTop: 10, marginTop: 2, gap: 20 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2, paddingHorizontal: 4 },
  actionBtnText: { fontSize: 13, fontWeight: "500", color: "#445566" },

  // Members grid
  memberGrid: { paddingHorizontal: 12, paddingTop: 16 },
  memberCell: { flex: 1, alignItems: "center", paddingVertical: 14, maxWidth: "25%" },
  memberCellAvatarWrap: { position: "relative", marginBottom: 7 },
  memberCellAvatar: { width: 58, height: 58, borderRadius: 29, justifyContent: "center", alignItems: "center" },
  memberCellAvatarImg: { width: 58, height: 58, borderRadius: 29 },
  memberCellInitial: { fontSize: 20, fontWeight: "700" },
  adminStarBadge: { position: "absolute", bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.dark.gold + "25", borderWidth: 1.5, borderColor: Backgrounds.root, justifyContent: "center", alignItems: "center" },
  memberCellName: { fontSize: 11, fontWeight: "500", color: "#7A8EA0", textAlign: "center", maxWidth: 70 },

  // Empty state
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center", marginBottom: 18 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: TextColors.primary, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: "#445566", textAlign: "center" },

  // FAB
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28, overflow: "hidden", elevation: 8, shadowColor: Colors.dark.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
  fabGradient: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Shared modal
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },

  // Compose modal
  composeSheet: { backgroundColor: Backgrounds.root, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, minHeight: 300, borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong },
  composeHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginTop: 10, marginBottom: 4 },
  composeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  composeCancelBtn: { paddingVertical: 4, paddingHorizontal: 4, minWidth: 60 },
  composeCancelText: { fontSize: 15, color: "#7A8EA0" },
  composeTitle: { fontSize: 16, fontWeight: "700", color: TextColors.primary },
  composePostBtn: { paddingVertical: 7, paddingHorizontal: 18, borderRadius: 20, minWidth: 60, alignItems: "center" },
  composePostBtnText: { fontSize: 14, fontWeight: "700", color: Colors.dark.buttonText },
  composeInput: { color: TextColors.primary, fontSize: 16, lineHeight: 24, padding: 16, minHeight: 100, textAlignVertical: "top" },
  composeThumbnailStrip: { maxHeight: 90 },
  composeThumbnailContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  composeThumbnailWrap: { position: "relative" },
  composeThumbnail: { width: 72, height: 72, borderRadius: 10 },
  composeThumbnailRemove: { position: "absolute", top: -6, right: -6 },
  composeFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 10 },
  composePhotoBtn: { flexDirection: "row", alignItems: "center", gap: 6, padding: 4 },
  composePhotoBtnLabel: { fontSize: 13, fontWeight: "600" },
  composeCounter: { fontSize: 12, color: "#445566" },

  // Comments sheet
  commentsSheet: { backgroundColor: Backgrounds.root, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong },
  commentsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  commentsTitle: { fontSize: 17, fontWeight: "700", color: TextColors.primary },
  commentsLoading: { paddingVertical: 40, alignItems: "center" },
  commentsEmpty: { paddingVertical: 40, alignItems: "center", gap: 12 },
  commentsEmptyText: { fontSize: 14, color: "#445566" },
  commentsList: { flex: 1, paddingTop: 4 },
  commentRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 10, alignItems: "flex-start" },
  commentAvatarWrap: {},
  commentAvatar: { width: 36, height: 36, borderRadius: 18 },
  commentAvatarInitial: { fontSize: 14, fontWeight: "700" },
  commentBubble: { flex: 1, backgroundColor: Colors.dark.chipBackground, borderRadius: 14, padding: 10 },
  commentBubbleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  commentAuthor: { fontSize: 13, fontWeight: "600", color: TextColors.primary },
  commentTime: { fontSize: 11, color: "#445566" },
  commentText: { fontSize: 14, color: "#8899AA", lineHeight: 20 },
  commentInputRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)", gap: 10 },
  commentInput: { flex: 1, backgroundColor: Colors.dark.chipBackground, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: TextColors.primary, fontSize: 14, maxHeight: 100, minHeight: 42 },
  commentSendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },

  // Add members sheet
  addMembersSheet: { backgroundColor: Backgrounds.root, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong },
  addMembersHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  addMembersTitle: { fontSize: 17, fontWeight: "700", color: TextColors.primary },
  addMembersCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.07)", justifyContent: "center", alignItems: "center" },
  searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.chipBackground, borderRadius: 12, marginHorizontal: 16, marginTop: 14, marginBottom: 4, paddingHorizontal: 12, gap: 8 },
  searchIcon: { marginRight: 2 },
  searchInput: { flex: 1, height: 42, color: TextColors.primary, fontSize: 15 },
  addMembersScroll: { flex: 1, paddingTop: 6 },
  addMembersLoading: { paddingVertical: 40, alignItems: "center" },
  addMembersEmpty: { paddingVertical: 40, alignItems: "center", paddingHorizontal: 32, gap: 14 },
  addMembersEmptyText: { fontSize: 14, color: "#445566", textAlign: "center", lineHeight: 20 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  sectionHeaderText: { fontSize: 11, fontWeight: "700", color: "#7A8EA0", textTransform: "uppercase", letterSpacing: 0.8 },
  suggestionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  suggestionAvatarWrap: {},
  suggestionAvatar: { width: 46, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center" },
  suggestionAvatarImg: { width: 46, height: 46, borderRadius: 23 },
  suggestionInitial: { fontSize: 17, fontWeight: "700" },
  suggestionName: { flex: 1, fontSize: 15, fontWeight: "600", color: TextColors.primary },
  addBtn: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 20, minWidth: 56, alignItems: "center", justifyContent: "center" },
  addBtnDone: { backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong },
  addBtnText: { fontSize: 13, fontWeight: "700", color: Colors.dark.buttonText },
}));

const evtStyles = makeReactiveStyles(() => StyleSheet.create({
  card: { backgroundColor: Backgrounds.root, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.dark.chipBackground },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  eventTypeBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  eventTypeTxt: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  deleteBtn: { padding: 6 },
  eventTitle: { fontSize: 16, fontWeight: "700", color: TextColors.primary, marginBottom: 4 },
  eventDesc: { fontSize: 14, color: "#7A8EA0", lineHeight: 20, marginBottom: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  metaTxt: { fontSize: 13, color: "#7A8EA0" },
  avatarRow: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 4 },
  miniAvatar: { width: 26, height: 26, borderRadius: 13, justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: Backgrounds.root },
  miniAvatarImg: { width: 26, height: 26, borderRadius: 13 },
  miniAvatarInit: { fontSize: 10, fontWeight: "700" },
  goingTxt: { fontSize: 12, color: "#7A8EA0", marginLeft: 10 },
  rsvpRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  rsvpBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong, backgroundColor: Colors.dark.chipBackground },
  rsvpBtnTxt: { fontSize: 13, fontWeight: "600", color: "#7A8EA0" },

  // Wizard header
  wizardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  wizardCancel: { fontSize: 15, color: "#7A8EA0", fontWeight: "600" },
  wizardTitle: { fontSize: 16, fontWeight: "700", color: TextColors.primary },
  wizardNext: { fontSize: 15, fontWeight: "700" },

  // Wizard
  wizardSheet: { backgroundColor: Backgrounds.root, borderTopLeftRadius: 24, borderTopRightRadius: 24, flex: 1, maxHeight: "96%", minHeight: "75%", borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong },
  stepRow: { flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: 12 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.15)" },
  wizardSection: { paddingHorizontal: 20, paddingTop: 4 },
  wizardLabel: { fontSize: 13, fontWeight: "700", color: "#7A8EA0", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 },
  wizardInput: { backgroundColor: Colors.dark.chipBackground, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: TextColors.primary, fontSize: 15, borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.dark.chipBackgroundStrong, backgroundColor: Colors.dark.chipBackground, minWidth: "45%" },
  typeChipTxt: { fontSize: 14, fontWeight: "600", color: "#7A8EA0" },
  opponentChip: { alignItems: "center", padding: 10, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.dark.chipBackgroundStrong, backgroundColor: Colors.dark.chipBackground, minWidth: 70 },
  opponentAvatar: { width: 46, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center", marginBottom: 6 },
  opponentAvatarImg: { width: 46, height: 46, borderRadius: 23 },
  opponentAvatarInit: { fontSize: 17, fontWeight: "700" },
  opponentName: { fontSize: 12, fontWeight: "600", color: "#7A8EA0", textAlign: "center" },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.dark.chipBackground, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong },
  dateBtnTxt: { fontSize: 15, fontWeight: "600" },
  wizardSummary: { marginTop: 20, borderRadius: 14, padding: 16, borderWidth: 1 },
  wizardSummaryTitle: { fontSize: 16, fontWeight: "700", color: TextColors.primary, marginBottom: 4 },
  wizardSummaryMeta: { fontSize: 13, color: "#7A8EA0", marginTop: 2 },
  courtRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.dark.chipBackground, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1.5, borderColor: Colors.dark.chipBackgroundStrong },
  courtRowTxt: { flex: 1, fontSize: 14, fontWeight: "600", color: "#7A8EA0" },
  courtSurface: { fontSize: 11, color: "#445566", textTransform: "capitalize" },
  wagerRow: { flexDirection: "row", alignItems: "center" },
  wagerCurrency: { fontSize: 14, fontWeight: "700", color: TextColors.primary, backgroundColor: Colors.dark.chipBackgroundStrong, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong, borderRightWidth: 0 },
  pickerDoneBtn: { alignSelf: "flex-end", marginTop: 8, marginRight: 16, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.dark.chipBackgroundStrong },
  pickerDoneTxt: { fontSize: 15, fontWeight: "700", color: TextColors.primary },
}));

const chatStyles = makeReactiveStyles(() => StyleSheet.create({
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)", backgroundColor: Backgrounds.root },
  chatInput: { flex: 1, backgroundColor: Colors.dark.chipBackground, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: TextColors.primary, fontSize: 14, maxHeight: 100, minHeight: 42, borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong },
  sendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
  bubbleWrap: { marginBottom: 10, maxWidth: "80%" },
  bubbleWrapMe: { alignSelf: "flex-end" },
  bubbleWrapOther: { alignSelf: "flex-start" },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  bubbleMe: { borderColor: "transparent" },
  bubbleOther: { backgroundColor: Colors.dark.chipBackground, borderColor: Colors.dark.chipBackgroundStrong },
  bubbleTxt: { fontSize: 14, color: "#CCDDEE", lineHeight: 20 },
  bubbleFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 4 },
  bubbleTime: { fontSize: 10, color: "#445566" },
  reactionRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  reactionRowMe: { justifyContent: "flex-end" },
  reactionRowOther: { justifyContent: "flex-start" },
  reactionChip: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.chipBackgroundStrong, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, gap: 3, borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, color: "#7A8EA0", fontWeight: "600" },
  reactionPickerBackdrop: { position: "absolute", top: -48, left: -10, right: -10, zIndex: 99 },
  reactionPicker: { flexDirection: "row", position: "absolute", backgroundColor: "#1A2535", borderRadius: 24, paddingHorizontal: 8, paddingVertical: 6, gap: 4, borderWidth: 1, borderColor: Colors.dark.chipBorder, top: 0 },
  reactionPickerBtn: { padding: 4 },
  seenLabel: { fontSize: 10, color: "#445566", marginTop: 2 },
}));

const detailStyles = makeReactiveStyles(() => StyleSheet.create({
  sheet: { backgroundColor: Backgrounds.root, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", paddingTop: 8, borderWidth: 1, borderColor: Colors.dark.chipBackgroundStrong },
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 12 },
  title: { fontSize: 20, fontWeight: "700", color: TextColors.primary, flexShrink: 1 },
  desc: { fontSize: 14, color: "#7A8EA0", lineHeight: 22, paddingHorizontal: 16, marginBottom: 12 },
  metaSection: { paddingHorizontal: 16, marginBottom: 16, gap: 4 },
  countRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  countPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  countNum: { fontSize: 16, fontWeight: "700" },
  countLabel: { fontSize: 13, color: "#7A8EA0" },
  attendeeSection: { paddingHorizontal: 16, marginBottom: 8 },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 },
  attendeeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  attendeeAvatar: { width: 34, height: 34, borderRadius: 17 },
  attendeeAvatarFallback: { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center" },
  attendeeAvatarInit: { fontSize: 14, fontWeight: "700" },
  attendeeName: { fontSize: 14, color: "#CCDDEE", fontWeight: "500" },
}));
