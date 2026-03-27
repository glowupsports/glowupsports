import React, { useState, useRef } from "react";
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
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText as Text } from "@/components/ThemedText";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

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

type Tab = "feed" | "members";
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
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Ionicons name="send" size={16} color="#000" />
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
  onCommentPress,
}: {
  post: Post;
  typeColor: string;
  onCommentPress: () => void;
}) {
  const queryClient = useQueryClient();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.cheerCount || 0);

  const likeMutation = useMutation({
    mutationFn: () =>
      liked
        ? apiRequest("DELETE", `/api/social/posts/${post.id}/reactions`)
        : apiRequest("POST", `/api/social/posts/${post.id}/reactions`, { reactionType: "clap" }),
    onMutate: () => {
      setLiked(prev => !prev);
      setLikeCount(c => liked ? c - 1 : c + 1);
    },
    onError: () => {
      setLiked(prev => !prev);
      setLikeCount(c => liked ? c + 1 : c - 1);
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
            {commentCount > 0 ? commentCount : "Comment"}
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
    const formData = new FormData();
    images.forEach((uri, idx) => {
      formData.append("images", {
        uri,
        type: "image/jpeg",
        name: `photo_${idx}.jpg`,
      } as any);
    });
    const base = getApiUrl();
    const token = (await import("@react-native-async-storage/async-storage")).default.getItem("auth_token");
    const authToken = await token;
    const res = await fetch(`${base}/api/social/posts/upload-images`, {
      method: "POST",
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      body: formData,
    });
    if (!res.ok) throw new Error("Image upload failed");
    const json = await res.json();
    return json.images || [];
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
                <ActivityIndicator size="small" color="#000" />
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

// ─── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function GroupDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { groupId, groupName } = route.params as { groupId: string; groupName: string };
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
    try {
      await Share.share({
        message: `Join my group "${name}" on Glow Up Sports!\ngups://group/${groupId}`,
        title: `Join ${name}`,
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
          colors={[typeColor + "CC", typeColor + "44", "#0a0f1a"]}
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
        <Pressable style={styles.tabItem} onPress={() => setActiveTab("feed")}>
          <Text style={[styles.tabLabel, activeTab === "feed" && styles.tabLabelActive]}>Feed</Text>
          {activeTab === "feed" ? <View style={[styles.tabUnderline, { backgroundColor: Colors.dark.primary }]} /> : null}
        </Pressable>
        <Pressable style={styles.tabItem} onPress={() => setActiveTab("members")}>
          <Text style={[styles.tabLabel, activeTab === "members" && styles.tabLabelActive]}>Members</Text>
          {activeTab === "members" ? <View style={[styles.tabUnderline, { backgroundColor: Colors.dark.primary }]} /> : null}
        </Pressable>
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
                onCommentPress={() => setCommentPostId(item.id)}
              />
            )}
            contentContainerStyle={styles.listContent}
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
      ) : (
        <FlatList
          key="members"
          data={members}
          keyExtractor={(item) => item.id}
          numColumns={4}
          renderItem={({ item }) => <MemberGridCell member={item} typeColor={typeColor} />}
          contentContainerStyle={styles.memberGrid}
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

      {/* POST FAB */}
      {data?.isMember && data?.group.allowPosts ? (
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
            <Ionicons name="add" size={26} color="#000" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0f1a" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Hero
  heroWrapper: { overflow: "hidden" },
  hero: { paddingHorizontal: 20, paddingBottom: 28, alignItems: "center" },
  heroTopRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  heroBackBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  heroMenuBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  heroIcon: { width: 80, height: 80, borderRadius: 24, justifyContent: "center", alignItems: "center", borderWidth: 1.5, marginBottom: 14 },
  heroName: { fontSize: 22, fontWeight: "800", color: "#FFFFFF", textAlign: "center", marginBottom: 10, letterSpacing: 0.3 },
  heroBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  heroBadgeText: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },

  // Stats
  statsScroll: { backgroundColor: "#0a0f1a" },
  statsContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  statPill: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, gap: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginRight: 8 },
  statPillText: { fontSize: 13, fontWeight: "500", color: "#7A8EA0" },

  // Tabs
  tabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)", backgroundColor: "#0a0f1a", alignItems: "center" },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 13, position: "relative" },
  tabLabel: { fontSize: 14, fontWeight: "600", color: "#445566" },
  tabLabelActive: { color: "#FFFFFF" },
  tabUnderline: { position: "absolute", bottom: 0, left: "20%", right: "20%", height: 2.5, borderRadius: 2 },
  tabAddBtn: { paddingHorizontal: 16, paddingVertical: 13, justifyContent: "center", alignItems: "center" },

  // Feed list
  listContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 110 },

  // Post card
  postCard: { backgroundColor: "#0F141B", borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  postHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  postAvatar: { width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center" },
  postAvatarInitial: { fontSize: 15, fontWeight: "700" },
  postMeta: { flex: 1, marginLeft: 10 },
  postAuthor: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  postTime: { fontSize: 12, color: "#445566", marginTop: 1 },
  postCaption: { fontSize: 14, color: "#8899AA", lineHeight: 21, marginBottom: 10 },

  // Media
  mediaStrip: { marginHorizontal: -16, marginBottom: 10 },
  mediaStripContent: { paddingHorizontal: 16, gap: 8 },
  mediaImage: { width: 180, height: 200, borderRadius: 12 },
  mediaImageSingle: { width: "100%", height: 240 },

  // Post actions
  postActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 10, marginTop: 2, gap: 20 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2, paddingHorizontal: 4 },
  actionBtnText: { fontSize: 13, fontWeight: "500", color: "#445566" },

  // Members grid
  memberGrid: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 100 },
  memberCell: { flex: 1, alignItems: "center", paddingVertical: 14, maxWidth: "25%" },
  memberCellAvatarWrap: { position: "relative", marginBottom: 7 },
  memberCellAvatar: { width: 58, height: 58, borderRadius: 29, justifyContent: "center", alignItems: "center" },
  memberCellAvatarImg: { width: 58, height: 58, borderRadius: 29 },
  memberCellInitial: { fontSize: 20, fontWeight: "700" },
  adminStarBadge: { position: "absolute", bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.dark.gold + "25", borderWidth: 1.5, borderColor: "#0a0f1a", justifyContent: "center", alignItems: "center" },
  memberCellName: { fontSize: 11, fontWeight: "500", color: "#7A8EA0", textAlign: "center", maxWidth: 70 },

  // Empty state
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center", marginBottom: 18 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#FFFFFF", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: "#445566", textAlign: "center" },

  // FAB
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28, overflow: "hidden", elevation: 8, shadowColor: Colors.dark.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
  fabGradient: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Shared modal
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },

  // Compose modal
  composeSheet: { backgroundColor: "#0F141B", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, minHeight: 300, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  composeHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginTop: 10, marginBottom: 4 },
  composeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  composeCancelBtn: { paddingVertical: 4, paddingHorizontal: 4, minWidth: 60 },
  composeCancelText: { fontSize: 15, color: "#7A8EA0" },
  composeTitle: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  composePostBtn: { paddingVertical: 7, paddingHorizontal: 18, borderRadius: 20, minWidth: 60, alignItems: "center" },
  composePostBtnText: { fontSize: 14, fontWeight: "700", color: "#000" },
  composeInput: { color: "#FFFFFF", fontSize: 16, lineHeight: 24, padding: 16, minHeight: 100, textAlignVertical: "top" },
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
  commentsSheet: { backgroundColor: "#0F141B", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  commentsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  commentsTitle: { fontSize: 17, fontWeight: "700", color: "#FFFFFF" },
  commentsLoading: { paddingVertical: 40, alignItems: "center" },
  commentsEmpty: { paddingVertical: 40, alignItems: "center", gap: 12 },
  commentsEmptyText: { fontSize: 14, color: "#445566" },
  commentsList: { flex: 1, paddingTop: 4 },
  commentRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 10, alignItems: "flex-start" },
  commentAvatarWrap: {},
  commentAvatar: { width: 36, height: 36, borderRadius: 18 },
  commentAvatarInitial: { fontSize: 14, fontWeight: "700" },
  commentBubble: { flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 10 },
  commentBubbleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  commentAuthor: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },
  commentTime: { fontSize: 11, color: "#445566" },
  commentText: { fontSize: 14, color: "#8899AA", lineHeight: 20 },
  commentInputRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)", gap: 10 },
  commentInput: { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: "#FFFFFF", fontSize: 14, maxHeight: 100, minHeight: 42 },
  commentSendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },

  // Add members sheet
  addMembersSheet: { backgroundColor: "#0F141B", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  addMembersHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  addMembersTitle: { fontSize: 17, fontWeight: "700", color: "#FFFFFF" },
  addMembersCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.07)", justifyContent: "center", alignItems: "center" },
  searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, marginHorizontal: 16, marginTop: 14, marginBottom: 4, paddingHorizontal: 12, gap: 8 },
  searchIcon: { marginRight: 2 },
  searchInput: { flex: 1, height: 42, color: "#FFFFFF", fontSize: 15 },
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
  suggestionName: { flex: 1, fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  addBtn: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 20, minWidth: 56, alignItems: "center", justifyContent: "center" },
  addBtnDone: { backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  addBtnText: { fontSize: 13, fontWeight: "700", color: "#000" },
});
