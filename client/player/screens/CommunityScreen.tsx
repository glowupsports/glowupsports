import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Share,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

const TAB_BAR_HEIGHT = 80;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInUp, useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DRAWER_HEIGHT = Math.min(SCREEN_HEIGHT * 0.55, 450);
import { useVideoPlayer, VideoView } from "expo-video";
import { Colors, Spacing, BorderRadius, Backgrounds, GlowColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { apiRequest, apiFetch, getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import { LockedScreen } from "../components/LockedScreen";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useWalkthrough } from "@/player/context/WalkthroughContext";
import { usePlayer } from "@/player/context/PlayerContext";
import OnlineSafetyModal, { hasShownSafetyReminder } from "@/player/components/OnlineSafetyModal";

type FeedFilter = "for_you" | "news" | "academy" | "moments" | "events";
type MainTab = "feed" | "friends" | "groups";

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
  { type: "event", label: "At Event", icon: "calendar", color: "#FF6B35" },
  { type: "group", label: "Group", icon: "people", color: "#4ECDC4" },
  { type: "achievement", label: "Achievement", icon: "ribbon", color: "#E040FB" },
  { type: "free_play", label: "Free Play", icon: "basketball", color: "#00D9FF" },
];

const CHEER_REACTIONS = [
  { emoji: "🔥", type: "fire" },
  { emoji: "⚡", type: "star" },
  { emoji: "🎾", type: "tennis" },
  { emoji: "💪", type: "muscle" },
  { emoji: "🏆", type: "clap" },
];

function VideoPostMedia({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
  });
  
  return (
    <View style={styles.videoContainer}>
      <VideoView
        player={player}
        style={styles.momentImage}
        contentFit="contain"
        nativeControls
      />
      <View style={styles.videoIndicator}>
        <Ionicons name="videocam" size={16} color={Colors.dark.text} />
      </View>
    </View>
  );
}

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
    blue: "#3B82F6",
    red: "#EF4444",
    orange: "#F97316",
    green: "#22C55E",
    yellow: "#EAB308",
    adult: "#00E5FF",
    glow: "#00E5FF",
  };
  return colors[level?.toLowerCase() || ""] || Colors.dark.textSecondary;
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
  const isVideo = hasMedia && post.mediaTypes && post.mediaTypes[0] === "video";
  const mediaUrl = hasMedia ? (post.mediaUrls[0].startsWith("http") ? post.mediaUrls[0] : `${getApiUrl()}${post.mediaUrls[0]}`) : "";
  
  return (
    <Animated.View entering={FadeInDown.delay(100).springify()}>
      <View style={styles.momentCard}>
        {/* Photo-first layout - 65% of card when media present */}
        {hasMedia ? (
          <View style={styles.mediaSection}>
            {isVideo ? (
              <VideoPostMedia uri={mediaUrl} />
            ) : (
              <View style={styles.momentImageContainer}>
                <Image 
                  source={{ uri: mediaUrl }} 
                  style={styles.momentImage}
                  contentFit="cover"
                  placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                  transition={200}
                />
              </View>
            )}
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
              {CHEER_REACTIONS.map((reaction, index) => (
                <Pressable 
                  key={index}
                  style={styles.cheerOption}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onReact(post.id, reaction.type);
                    setShowCheerPicker(false);
                  }}
                >
                  <ThemedText style={styles.cheerOptionEmoji}>{reaction.emoji}</ThemedText>
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

function MainTabBar({ active, onChange, friendRequestCount = 0 }: { active: MainTab; onChange: (t: MainTab) => void; friendRequestCount?: number }) {
  const tabs: { key: MainTab; label: string; icon: string }[] = [
    { key: "feed", label: "Feed", icon: "newspaper" },
    { key: "friends", label: "Friends", icon: "people" },
    { key: "groups", label: "Groups", icon: "grid" },
  ];

  return (
    <View style={styles.mainTabContainer}>
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.mainTab, isActive && styles.mainTabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(tab.key);
            }}
          >
            <Ionicons 
              name={tab.icon as any} 
              size={20} 
              color={isActive ? Colors.dark.primary : Colors.dark.textSecondary} 
            />
            <ThemedText style={[styles.mainTabText, isActive && styles.mainTabTextActive]}>
              {tab.label}
            </ThemedText>
            {tab.key === "friends" && friendRequestCount > 0 ? (
              <View style={styles.requestBadge}>
                <ThemedText style={styles.requestBadgeText}>{friendRequestCount}</ThemedText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function FeedFilterTabs({ active, onChange }: { active: FeedFilter; onChange: (f: FeedFilter) => void }) {
  const filters: { key: FeedFilter; label: string; icon: string }[] = [
    { key: "for_you", label: "For You", icon: "trophy" },
    { key: "news", label: "News", icon: "newspaper" },
    { key: "academy", label: "Academy", icon: "tennisball" },
    { key: "moments", label: "Moments", icon: "camera" },
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

interface Friend {
  id: string;
  name: string;
  username?: string;
  photoUrl?: string;
  ballLevel?: string;
  skillLevel?: number;
  glowRating?: number;
  openToPlay?: boolean;
  lastActive?: string;
}

interface Group {
  id: string;
  name: string;
  description?: string;
  type: string;
  memberCount: number;
  imageUrl?: string;
  isJoined?: boolean;
}

interface Achievement {
  id: string;
  type: "match_won" | "level_up" | "badge" | "streak" | "milestone" | "rating_up";
  title: string;
  description: string;
  date: string;
  icon: string;
  color: string;
  value?: string;
  shareImage?: string;
}

interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  thumbnail?: string;
  publishedAt: string;
}

interface FriendActivity {
  id: string;
  playerId: string;
  playerName: string;
  level: number;
  type: string;
  caption: string;
  time: string;
  cheers: number;
  photoUrl?: string;
}

function AchievementShowcase({ onSelectAchievement }: { onSelectAchievement: (achievement: Achievement) => void }) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;
  const { user } = useAuth();
  
  const { data: achievementsData, isLoading, refetch } = useQuery<{ achievements: Achievement[] }>({
    queryKey: ["/api/player/me/achievements"],
  });
  
  const DEMO_ACHIEVEMENTS: Achievement[] = [
    {
      id: "demo-1",
      type: "level_up",
      title: "Level Up!",
      description: "You reached Level 50 - Tennis Legend status unlocked!",
      icon: "arrow-up-circle",
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      value: "Level 50",
    },
    {
      id: "demo-2",
      type: "match_won",
      title: "Match Victory",
      description: "Won 3 consecutive matches this week",
      icon: "trophy",
      date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      value: "3 Wins",
    },
    {
      id: "demo-3",
      type: "streak",
      title: "Training Streak",
      description: "7 days of consistent training - keep it up!",
      icon: "flame",
      date: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      value: "7 Days",
    },
    {
      id: "demo-4",
      type: "badge",
      title: "Technique Master",
      description: "Achieved 70%+ in Technical skills assessment",
      icon: "ribbon",
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-5",
      type: "rating_up",
      title: "Rating Boost",
      description: "Your Glow Rating increased by 125 points",
      icon: "trending-up",
      date: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      value: "+125",
    },
  ];

  const achievements = achievementsData?.achievements?.length ? achievementsData.achievements : DEMO_ACHIEVEMENTS;
  
  const handleShare = async (achievement: Achievement) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const shareMessage = `${achievement.title}\n${achievement.description}\n\nAchieved on Glow Up Tennis`;
    
    try {
      await Share.share({
        message: shareMessage,
        title: achievement.title,
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  };
  
  const getAchievementGradient = (type: string): [string, string] => {
    switch (type) {
      case "match_won": return ["#FFD700", "#FF8C00"];
      case "level_up": return ["#C8FF3D", "#7CFC00"];
      case "streak": return ["#FF6B35", "#FF4500"];
      case "badge": return ["#E040FB", "#9C27B0"];
      case "rating_up": return ["#00E5FF", "#00BFFF"];
      default: return ["#C8FF3D", "#7CFC00"];
    }
  };
  
  const renderAchievementCard = ({ item }: { item: Achievement }) => {
    const gradient = getAchievementGradient(item.type);
    
    return (
      <Pressable 
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSelectAchievement(item);
        }}
      >
        <Animated.View entering={FadeInDown.delay(100)} style={achievementStyles.cardContainer}>
          <LinearGradient
            colors={[gradient[0] + "15", gradient[1] + "08"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={achievementStyles.card}
          >
            <View style={achievementStyles.cardHeader}>
              <LinearGradient
                colors={gradient}
                style={achievementStyles.iconContainer}
              >
                <Ionicons name={item.icon as any} size={24} color="#000" />
              </LinearGradient>
              <View style={achievementStyles.headerText}>
                <ThemedText style={[achievementStyles.title, { color: gradient[0] }]}>
                  {item.title}
                </ThemedText>
                <ThemedText style={achievementStyles.date}>
                  {formatTimeAgo(item.date)}
                </ThemedText>
              </View>
              {item.value ? (
                <View style={[achievementStyles.valueBadge, { backgroundColor: gradient[0] }]}>
                  <ThemedText style={achievementStyles.valueText}>{item.value}</ThemedText>
                </View>
              ) : null}
            </View>
            
            <ThemedText style={achievementStyles.description}>
              {item.description}
            </ThemedText>
            
            <View style={achievementStyles.shareButton}>
              <LinearGradient
                colors={gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={achievementStyles.shareGradient}
              >
                <Ionicons name="share-social" size={16} color="#000" />
                <ThemedText style={achievementStyles.shareText}>Share to Story</ThemedText>
              </LinearGradient>
            </View>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    );
  };
  
  return (
    <FlatList
      data={achievements}
      keyExtractor={(item) => item.id}
      renderItem={renderAchievementCard}
      contentContainerStyle={[
        achievementStyles.list,
        { paddingBottom: tabBarHeight + 80 + Spacing.xl }
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={refetch}
          tintColor={Colors.dark.primary}
        />
      }
      ListHeaderComponent={
        <View style={achievementStyles.header}>
          <LinearGradient
            colors={["#C8FF3D", "#7CFC00"]}
            style={achievementStyles.headerIconBg}
          >
            <Ionicons name="trophy" size={28} color="#000" />
          </LinearGradient>
          <ThemedText style={achievementStyles.headerTitle}>Your Achievements</ThemedText>
          <ThemedText style={achievementStyles.headerSubtitle}>
            Share your victories with friends
          </ThemedText>
        </View>
      }
      ListEmptyComponent={
        <View style={achievementStyles.empty}>
          <Ionicons name="trophy-outline" size={48} color={Colors.dark.textMuted} />
          <ThemedText style={achievementStyles.emptyTitle}>No Achievements Yet</ThemedText>
          <ThemedText style={achievementStyles.emptyText}>
            Start playing matches to earn achievements!
          </ThemedText>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

function NewsSection() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;
  
  const { data: newsData, isLoading, refetch } = useQuery<{ articles: NewsItem[] }>({
    queryKey: ["/api/player/news"],
  });
  
  const news = newsData?.articles || [];
  
  const getCategoryFromSource = (source: string): string => {
    const lowerSource = source.toLowerCase();
    if (lowerSource.includes("atp") || lowerSource.includes("espn")) return "atp";
    if (lowerSource.includes("wta")) return "wta";
    return "general";
  };
  
  const getCategoryColor = (source: string) => {
    const category = getCategoryFromSource(source);
    switch (category) {
      case "atp": return "#00A8E8";
      case "wta": return "#E040FB";
      default: return Colors.dark.primary;
    }
  };
  
  const handleOpenArticle = async (link: string) => {
    if (link && link !== "#") {
      try {
        await WebBrowser.openBrowserAsync(link);
      } catch (error) {
        console.error("Failed to open article:", error);
      }
    }
  };
  
  const renderNewsCard = ({ item }: { item: NewsItem }) => (
    <Animated.View entering={FadeInDown.delay(50)}>
      <Pressable style={newsStyles.card} onPress={() => handleOpenArticle(item.link)}>
        <View style={newsStyles.cardContent}>
          <View style={newsStyles.categoryRow}>
            <View style={[newsStyles.categoryBadge, { backgroundColor: getCategoryColor(item.source) + "20" }]}>
              <ThemedText style={[newsStyles.categoryText, { color: getCategoryColor(item.source) }]}>
                {getCategoryFromSource(item.source).toUpperCase()}
              </ThemedText>
            </View>
            <ThemedText style={newsStyles.source}>{item.source}</ThemedText>
          </View>
          
          <ThemedText style={newsStyles.title} numberOfLines={2}>
            {item.title}
          </ThemedText>
          
          <View style={newsStyles.footer}>
            <ThemedText style={newsStyles.time}>
              {formatTimeAgo(item.publishedAt)}
            </ThemedText>
            <View style={newsStyles.readMore}>
              <ThemedText style={newsStyles.readMoreText}>Read More</ThemedText>
              <Ionicons name="chevron-forward" size={14} color={Colors.dark.primary} />
            </View>
          </View>
        </View>
        
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={newsStyles.image} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[getCategoryColor(item.source), getCategoryColor(item.source) + "80"]}
            style={newsStyles.imagePlaceholder}
          >
            <Ionicons name="tennisball" size={32} color="#FFF" />
          </LinearGradient>
        )}
      </Pressable>
    </Animated.View>
  );
  
  return (
    <FlatList
      data={news}
      keyExtractor={(item) => item.id}
      renderItem={renderNewsCard}
      contentContainerStyle={[
        newsStyles.list,
        { paddingBottom: tabBarHeight + 80 + Spacing.xl }
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={refetch}
          tintColor={Colors.dark.primary}
        />
      }
      ListHeaderComponent={
        <View style={newsStyles.header}>
          <View style={newsStyles.headerRow}>
            <Ionicons name="newspaper" size={24} color={Colors.dark.primary} />
            <ThemedText style={newsStyles.headerTitle}>Tennis News</ThemedText>
          </View>
          <ThemedText style={newsStyles.headerSubtitle}>
            Latest from ATP, WTA & Tennis World
          </ThemedText>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

function FriendsSection({ onChallenge, onSelectActivity }: { onChallenge?: (friend: Friend) => void; onSelectActivity?: (activity: FriendActivity) => void }) {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;
  const [activeTab, setActiveTab] = useState<"activity" | "friends" | "requests">("activity");
  
  const { data: friendsData, isLoading, refetch } = useQuery<{ friends: Friend[]; pendingRequests: Friend[] }>({
    queryKey: ["/api/player/me/friends"],
  });
  
  const { data: friendsActivityData, isLoading: activityLoading } = useQuery<Post[]>({
    queryKey: ["/api/social/feed", { filter: "friends" }],
    queryFn: async () => {
      const response = await apiFetch("/api/social/feed?filter=friends");
      if (!response.ok) throw new Error("Failed to load activity");
      return response.json();
    },
  });
  
  const DEMO_FRIEND_ACTIVITY: Post[] = [
    {
      id: "activity-1",
      authorId: "friend-1",
      academyId: "demo-academy",
      contextType: "session_completed",
      caption: "Great training session today! Working on my backhand technique.",
      mediaUrls: [],
      mediaTypes: [],
      visibility: "friends",
      cheerCount: 12,
      commentCount: 3,
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      author: {
        id: "friend-1",
        name: "Sarah Johnson",
        photoUrl: null,
        ballLevel: "yellow",
        level: 35,
        title: "Rising Star",
      },
      userReaction: null,
    },
    {
      id: "activity-2",
      authorId: "friend-2",
      academyId: "demo-academy",
      contextType: "match",
      caption: "Won my doubles match 6-4, 6-2! Great teamwork with my partner.",
      mediaUrls: [],
      mediaTypes: [],
      visibility: "friends",
      cheerCount: 24,
      commentCount: 8,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      author: {
        id: "friend-2",
        name: "Marcus Williams",
        photoUrl: null,
        ballLevel: "green",
        level: 28,
        title: "Court Master",
      },
      userReaction: "fire",
    },
    {
      id: "activity-3",
      authorId: "friend-3",
      academyId: "demo-academy",
      contextType: "level_up",
      caption: "Just reached Level 40! Thank you everyone for the support!",
      mediaUrls: [],
      mediaTypes: [],
      visibility: "friends",
      cheerCount: 45,
      commentCount: 15,
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      author: {
        id: "friend-3",
        name: "Emma Chen",
        photoUrl: null,
        ballLevel: "yellow",
        level: 40,
        title: "Tennis Legend",
      },
      userReaction: null,
    },
    {
      id: "activity-4",
      authorId: "friend-4",
      academyId: "demo-academy",
      contextType: "training",
      caption: "Focus on serve technique today. Coach feedback was super helpful!",
      mediaUrls: [],
      mediaTypes: [],
      visibility: "friends",
      cheerCount: 8,
      commentCount: 2,
      createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      author: {
        id: "friend-4",
        name: "Alex Rodriguez",
        photoUrl: null,
        ballLevel: "orange",
        level: 22,
        title: "Serve Specialist",
      },
      userReaction: null,
    },
  ];

  const friendsActivity = friendsActivityData?.length ? friendsActivityData : DEMO_FRIEND_ACTIVITY;
  
  const friends = friendsData?.friends || [];
  const requests = friendsData?.pendingRequests || [];

  // DEBUG: Log friends data
  console.log("[DEBUG FRIENDS] friendsData raw:", JSON.stringify({
    hasFriendsData: !!friendsData,
    friendsArray: Array.isArray(friendsData?.friends),
    friendsCount: friends.length,
    rawData: friendsData
  }, null, 2).slice(0, 500));
  
  const cheerMutation = useMutation({
    mutationFn: async (postId: string) => {
      const response = await apiFetch(`/api/social/posts/${postId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactionType: "fire" }),
      });
      if (!response.ok) throw new Error("Failed to cheer");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
    },
  });
  
  const handleCheerPost = (postId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cheerMutation.mutate(postId);
  };
  
  const getBallColor = (level?: string) => {
    const colors: Record<string, string> = {
      blue: "#3B82F6", red: "#EF4444", orange: "#F97316",
      green: "#22C55E", yellow: "#EAB308", glow: Colors.dark.primary,
    };
    return colors[level?.toLowerCase() || ""] || Colors.dark.textSecondary;
  };
  
  const handleChallenge = (friend: Friend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    navigation.navigate("PlayStack", { 
      screen: "CreateMatch", 
      params: { opponentId: friend.id, opponentName: friend.name } 
    });
  };
  
  const handleMessage = (friend: Friend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("Messages", { recipientId: friend.id });
  };
  
  const handleAcceptRequest = async (requestId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await apiRequest("POST", `/api/player/friends/accept/${requestId}`);
      refetch();
    } catch (e) { console.log("Accept error", e); }
  };
  
  const handleRejectRequest = async (requestId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest("POST", `/api/player/friends/reject/${requestId}`);
      refetch();
    } catch (e) { console.log("Reject error", e); }
  };
  
  const renderFriendCard = (friend: Friend) => (
    <Animated.View key={friend.id} entering={FadeInDown.delay(100).springify()}>
      <Pressable 
        style={styles.friendCard}
        onPress={() => navigation.navigate("PublicProfile", { playerId: friend.id })}
      >
        <View style={styles.friendAvatarSection}>
          <View style={[styles.friendAvatarRing, { borderColor: getBallColor(friend.ballLevel) }]}>
            {friend.photoUrl ? (
              <Image source={{ uri: friend.photoUrl }} style={styles.friendAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.friendAvatarPlaceholder, { backgroundColor: getBallColor(friend.ballLevel) + "30" }]}>
                <ThemedText style={[styles.friendAvatarLetter, { color: getBallColor(friend.ballLevel) }]}>
                  {friend.name.charAt(0).toUpperCase()}
                </ThemedText>
              </View>
            )}
          </View>
          {friend.openToPlay ? (
            <View style={styles.onlineIndicator}>
              <View style={styles.onlineDot} />
            </View>
          ) : null}
        </View>
        
        <View style={styles.friendInfo}>
          <ThemedText style={styles.friendName} numberOfLines={1}>{friend.name}</ThemedText>
          <View style={styles.friendMeta}>
            <View style={[styles.friendLevelBadge, { backgroundColor: getBallColor(friend.ballLevel) }]}>
              <ThemedText style={styles.friendLevelText}>
                {friend.ballLevel?.toUpperCase() || "NEW"} {friend.skillLevel || ""}
              </ThemedText>
            </View>
            {friend.openToPlay ? (
              <ThemedText style={styles.friendStatus}>Open to Play</ThemedText>
            ) : null}
          </View>
        </View>
        
        <View style={styles.friendActions}>
          <Pressable 
            style={styles.friendActionBtn}
            onPress={(e) => { e.stopPropagation(); handleMessage(friend); }}
          >
            <Ionicons name="chatbubble" size={18} color={Colors.dark.textSecondary} />
          </Pressable>
          <Pressable 
            style={styles.friendChallengeBtn}
            onPress={(e) => { e.stopPropagation(); handleChallenge(friend); }}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primaryGlow || "#9AE66E"]}
              style={styles.friendChallengeBtnGradient}
            >
              <Ionicons name="flash" size={16} color={Colors.dark.backgroundRoot} />
            </LinearGradient>
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
  
  const renderRequestCard = (request: Friend) => (
    <Animated.View key={request.id} entering={FadeInDown.delay(100).springify()}>
      <View style={styles.requestCard}>
        <View style={styles.friendAvatarSection}>
          {request.photoUrl ? (
            <Image source={{ uri: request.photoUrl }} style={styles.friendAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.friendAvatarPlaceholder, { backgroundColor: Colors.dark.primary + "30" }]}>
              <ThemedText style={[styles.friendAvatarLetter, { color: Colors.dark.primary }]}>
                {request.name.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          )}
        </View>
        
        <View style={styles.friendInfo}>
          <ThemedText style={styles.friendName}>{request.name}</ThemedText>
          <ThemedText style={styles.requestSubtext}>Wants to be your tennis buddy</ThemedText>
        </View>
        
        <View style={styles.requestActions}>
          <Pressable style={styles.rejectBtn} onPress={() => handleRejectRequest(request.id)}>
            <Ionicons name="close" size={20} color={Colors.dark.error} />
          </Pressable>
          <Pressable style={styles.acceptBtn} onPress={() => handleAcceptRequest(request.id)}>
            <Ionicons name="checkmark" size={20} color={Colors.dark.backgroundRoot} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
  
  const renderActivityCard = (post: Post) => {
    const badgeStyle = CONTEXT_BADGE_STYLES[post.contextType] || CONTEXT_BADGE_STYLES.training;
    
    const handleOpenDetail = () => {
      if (onSelectActivity) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSelectActivity({
          id: post.id,
          playerId: post.authorId,
          playerName: post.author.name || "Unknown",
          level: post.author.level || 1,
          type: post.contextType,
          caption: post.caption || "",
          time: formatTimeAgo(post.createdAt),
          cheers: post.cheerCount,
          photoUrl: post.author.photoUrl,
        });
      }
    };
    
    return (
      <Animated.View key={post.id} entering={FadeInDown.delay(100).springify()}>
        <Pressable style={styles.activityCard} onPress={handleOpenDetail}>
          <View style={styles.activityHeader}>
            <View style={styles.activityAvatarContainer}>
              {post.author.photoUrl ? (
                <Image 
                  source={{ uri: post.author.photoUrl.startsWith("http") ? post.author.photoUrl : `${getApiUrl()}${post.author.photoUrl}` }} 
                  style={styles.activityAvatar} 
                  contentFit="cover" 
                />
              ) : (
                <LinearGradient
                  colors={[getBallColor(post.author.ballLevel) + "50", getBallColor(post.author.ballLevel) + "20"]}
                  style={styles.activityAvatarPlaceholder}
                >
                  <ThemedText style={[styles.activityAvatarLetter, { color: getBallColor(post.author.ballLevel) }]}>
                    {post.author.name?.charAt(0).toUpperCase() || "?"}
                  </ThemedText>
                </LinearGradient>
              )}
              <View style={[styles.activityTypeDot, { backgroundColor: badgeStyle.text }]} />
            </View>
            
            <View style={styles.activityInfo}>
              <View style={styles.activityNameRow}>
                <ThemedText style={styles.activityName}>{post.author.name}</ThemedText>
                <View style={[styles.activityLevelBadge, { backgroundColor: getBallColor(post.author.ballLevel) }]}>
                  <ThemedText style={styles.activityLevelText}>Lvl {post.author.level || 1}</ThemedText>
                </View>
              </View>
              <View style={styles.activityMetaRow}>
                <View style={[styles.activityContextBadge, { backgroundColor: badgeStyle.bg }]}>
                  <Ionicons name={badgeStyle.icon as any} size={10} color={badgeStyle.text} />
                  <ThemedText style={[styles.activityContextText, { color: badgeStyle.text }]}>
                    {post.contextType.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                  </ThemedText>
                </View>
                <ThemedText style={styles.activityTime}>{formatTimeAgo(post.createdAt)}</ThemedText>
              </View>
            </View>
          </View>
          
          {post.caption ? (
            <ThemedText style={styles.activityCaption}>{post.caption}</ThemedText>
          ) : null}
          
          <View style={styles.activityActions}>
            <View style={styles.activityReactions}>
              <Ionicons name="flame" size={14} color={post.userReaction ? Colors.dark.error : Colors.dark.primary} />
              <ThemedText style={styles.activityReactionCount}>{post.cheerCount}</ThemedText>
            </View>
            <Pressable 
              style={[styles.activityCheerBtn, post.userReaction && styles.activityCheerBtnActive]} 
              onPress={(e) => { e.stopPropagation(); handleCheerPost(post.id); }}
            >
              <ThemedText style={[styles.activityCheerText, post.userReaction && styles.activityCheerTextActive]}>
                {post.userReaction ? "Cheered!" : "Cheer"}
              </ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Animated.View>
    );
  };
  
  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionTabs}>
        <Pressable 
          style={[styles.sectionTab, activeTab === "activity" && styles.sectionTabActive]}
          onPress={() => setActiveTab("activity")}
        >
          <Ionicons name="pulse" size={16} color={activeTab === "activity" ? Colors.dark.primary : Colors.dark.textSecondary} />
          <ThemedText style={[styles.sectionTabText, activeTab === "activity" && styles.sectionTabTextActive]}>
            Activity
          </ThemedText>
        </Pressable>
        <Pressable 
          style={[styles.sectionTab, activeTab === "friends" && styles.sectionTabActive]}
          onPress={() => setActiveTab("friends")}
        >
          <Ionicons name="people" size={16} color={activeTab === "friends" ? Colors.dark.primary : Colors.dark.textSecondary} />
          <ThemedText style={[styles.sectionTabText, activeTab === "friends" && styles.sectionTabTextActive]}>
            Friends ({friends.length})
          </ThemedText>
        </Pressable>
        <Pressable 
          style={[styles.sectionTab, activeTab === "requests" && styles.sectionTabActive]}
          onPress={() => setActiveTab("requests")}
        >
          <Ionicons name="mail" size={16} color={activeTab === "requests" ? Colors.dark.primary : Colors.dark.textSecondary} />
          <ThemedText style={[styles.sectionTabText, activeTab === "requests" && styles.sectionTabTextActive]}>
            Requests {requests.length > 0 ? `(${requests.length})` : ""}
          </ThemedText>
          {requests.length > 0 ? <View style={styles.requestDot} /> : null}
        </Pressable>
      </View>
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : activeTab === "activity" ? (
        <FlatList
          data={friendsActivity}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderActivityCard(item)}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 100, paddingHorizontal: Spacing.md }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="pulse" size={48} color={Colors.dark.textSecondary} />
              </View>
              <ThemedText style={styles.emptyTitle}>No friend activity</ThemedText>
              <ThemedText style={styles.emptySubtitle}>Add friends to see their updates here</ThemedText>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      ) : activeTab === "friends" ? (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderFriendCard(item)}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 100, paddingHorizontal: Spacing.md }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="people" size={48} color={Colors.dark.primary} />
              </View>
              <ThemedText style={styles.emptyTitle}>No friends yet</ThemedText>
              <ThemedText style={styles.emptySubtitle}>Find and connect with other players at your academy</ThemedText>
              <Pressable 
                style={styles.findPlayersBtn}
                onPress={() => navigation.navigate("PlayStack", { screen: "OpenMatches" })}
              >
                <ThemedText style={styles.findPlayersBtnText}>Find Players</ThemedText>
                <Ionicons name="arrow-forward" size={16} color={Colors.dark.backgroundRoot} />
              </Pressable>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderRequestCard(item)}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 100, paddingHorizontal: Spacing.md }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="mail-open" size={48} color={Colors.dark.textSecondary} />
              </View>
              <ThemedText style={styles.emptyTitle}>No pending requests</ThemedText>
              <ThemedText style={styles.emptySubtitle}>Friend requests will appear here</ThemedText>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

type GroupFilter = "all" | "training" | "social";

const GROUP_FILTERS: { key: GroupFilter; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "apps" },
  { key: "training", label: "Training", icon: "tennisball" },
  { key: "social", label: "Social", icon: "people" },
];

function GroupsSection() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;
  const queryClient = useQueryClient();
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupType, setNewGroupType] = useState<"social" | "friends">("social");
  
  const { data: groupsData, isLoading } = useQuery<Group[]>({
    queryKey: ["/api/social/groups"],
  });
  
  const createGroupMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; type: string }) => {
      return apiRequest("/api/player/groups", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/groups"] });
      setShowCreateModal(false);
      setNewGroupName("");
      setNewGroupDescription("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });
  
  const handleCreateGroup = () => {
    if (!newGroupName.trim() || newGroupName.length < 2) return;
    createGroupMutation.mutate({
      name: newGroupName.trim(),
      description: newGroupDescription.trim(),
      type: newGroupType,
    });
  };
  
  const DEMO_GROUPS: Group[] = [
    {
      id: "group-1",
      name: "Yellow Ball Champions",
      description: "For advanced yellow ball players looking to compete",
      type: "skill_level",
      memberCount: 24,
      isJoined: true,
      createdBy: "coach-demo",
    },
    {
      id: "group-2",
      name: "Weekend Warriors",
      description: "Casual weekend tennis meetups and social events",
      type: "social",
      memberCount: 45,
      isJoined: true,
      createdBy: "player-1",
    },
    {
      id: "group-3",
      name: "Dubai Tennis League",
      description: "Official tournament group for league matches",
      type: "tournament",
      memberCount: 32,
      isJoined: false,
      createdBy: "academy-admin",
    },
    {
      id: "group-4",
      name: "Junior Development",
      description: "U16 players training together",
      type: "training",
      memberCount: 18,
      isJoined: false,
      createdBy: "coach-demo",
    },
    {
      id: "group-5",
      name: "Ladies Tennis Club",
      description: "Women's tennis community for all skill levels",
      type: "social",
      memberCount: 28,
      isJoined: true,
      createdBy: "player-2",
    },
  ];

  const allGroups = groupsData?.length ? groupsData : DEMO_GROUPS;
  
  const groups = useMemo(() => {
    if (groupFilter === "all") return allGroups;
    if (groupFilter === "training") {
      return allGroups.filter(g => g.type === "training" || g.type === "skill_level" || g.type === "tournament");
    }
    return allGroups.filter(g => g.type === "social" || g.type === "age_group");
  }, [allGroups, groupFilter]);
  
  const getGroupIcon = (type: string) => {
    switch (type) {
      case "skill_level": return "trophy";
      case "age_group": return "people";
      case "tournament": return "ribbon";
      case "social": return "tennisball";
      default: return "grid";
    }
  };
  
  const renderGroupCard = (group: Group) => (
    <Animated.View key={group.id} entering={FadeInDown.delay(100).springify()}>
      <Pressable style={styles.groupCard}>
        <View style={styles.groupIconContainer}>
          <LinearGradient
            colors={[Colors.dark.primary + "30", Colors.dark.backgroundSecondary]}
            style={styles.groupSectionIconBg}
          >
            <Ionicons name={getGroupIcon(group.type) as any} size={28} color={Colors.dark.primary} />
          </LinearGradient>
        </View>
        
        <View style={styles.groupSectionInfo}>
          <ThemedText style={styles.groupSectionName}>{group.name}</ThemedText>
          <ThemedText style={styles.groupSectionMeta}>
            <Ionicons name="people" size={12} color={Colors.dark.textSecondary} /> {group.memberCount} members
          </ThemedText>
          {group.description ? (
            <ThemedText style={styles.groupSectionDescription} numberOfLines={2}>{group.description}</ThemedText>
          ) : null}
        </View>
        
        <Pressable style={[styles.joinBtn, group.isJoined && styles.joinedBtn]}>
          <ThemedText style={[styles.joinBtnText, group.isJoined && styles.joinedBtnText]}>
            {group.isJoined ? "Joined" : "Join"}
          </ThemedText>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
  
  const renderFilterTabs = () => (
    <View style={styles.groupFilterContainer}>
      {GROUP_FILTERS.map((filter) => (
        <Pressable
          key={filter.key}
          style={[
            styles.groupFilterTab,
            groupFilter === filter.key && styles.groupFilterTabActive,
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setGroupFilter(filter.key);
          }}
        >
          <Ionicons
            name={filter.icon as any}
            size={16}
            color={groupFilter === filter.key ? Colors.dark.background : Colors.dark.textSecondary}
          />
          <ThemedText
            style={[
              styles.groupFilterText,
              groupFilter === filter.key && styles.groupFilterTextActive,
            ]}
          >
            {filter.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
  
  return (
    <View style={styles.sectionContainer}>
      {renderFilterTabs()}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderGroupCard(item)}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 100, paddingHorizontal: Spacing.md }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="grid" size={48} color={Colors.dark.primary} />
              </View>
              <ThemedText style={styles.emptyTitle}>No {groupFilter === "all" ? "" : groupFilter + " "}groups yet</ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                {groupFilter === "training" 
                  ? "Join training groups created by your coach" 
                  : groupFilter === "social"
                  ? "Create or join social groups with fellow players"
                  : "Join groups to connect with players of similar skill levels"}
              </ThemedText>
              {groupFilter !== "training" ? (
                <Pressable 
                  style={styles.createGroupBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowCreateModal(true);
                  }}
                >
                  <Ionicons name="add" size={18} color={Colors.dark.primary} />
                  <ThemedText style={styles.createGroupBtnText}>Create Group</ThemedText>
                </Pressable>
              ) : null}
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
      
      {groupFilter !== "training" ? (
        <Pressable 
          style={[styles.createGroupFab, { bottom: tabBarHeight + 20 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowCreateModal(true);
          }}
        >
          <Ionicons name="add" size={28} color={Colors.dark.background} />
        </Pressable>
      ) : null}
      
      <Modal visible={showCreateModal} transparent animationType="fade">
        <View style={styles.createGroupModalOverlay}>
          <Animated.View entering={FadeInDown.springify()} style={styles.createGroupModalContent}>
            <View style={styles.createGroupModalHeader}>
              <ThemedText style={styles.createGroupModalTitle}>Create Group</ThemedText>
              <Pressable onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
              </Pressable>
            </View>
            
            <View style={styles.createGroupForm}>
              <View style={styles.createGroupInputGroup}>
                <ThemedText style={styles.createGroupLabel}>Group Name</ThemedText>
                <TextInput
                  style={styles.createGroupInput}
                  placeholder="Enter group name..."
                  placeholderTextColor={Colors.dark.textMuted}
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  maxLength={50}
                />
              </View>
              
              <View style={styles.createGroupInputGroup}>
                <ThemedText style={styles.createGroupLabel}>Description (optional)</ThemedText>
                <TextInput
                  style={[styles.createGroupInput, styles.createGroupTextArea]}
                  placeholder="What's this group about?"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={newGroupDescription}
                  onChangeText={setNewGroupDescription}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                />
              </View>
              
              <View style={styles.createGroupInputGroup}>
                <ThemedText style={styles.createGroupLabel}>Group Type</ThemedText>
                <View style={styles.createGroupTypeRow}>
                  <Pressable 
                    style={[styles.createGroupTypeBtn, newGroupType === "social" && styles.createGroupTypeBtnActive]}
                    onPress={() => setNewGroupType("social")}
                  >
                    <Ionicons name="people" size={18} color={newGroupType === "social" ? Colors.dark.background : Colors.dark.textSecondary} />
                    <ThemedText style={[styles.createGroupTypeText, newGroupType === "social" && styles.createGroupTypeTextActive]}>Social</ThemedText>
                  </Pressable>
                  <Pressable 
                    style={[styles.createGroupTypeBtn, newGroupType === "friends" && styles.createGroupTypeBtnActive]}
                    onPress={() => setNewGroupType("friends")}
                  >
                    <Ionicons name="heart" size={18} color={newGroupType === "friends" ? Colors.dark.background : Colors.dark.textSecondary} />
                    <ThemedText style={[styles.createGroupTypeText, newGroupType === "friends" && styles.createGroupTypeTextActive]}>Friends</ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
            
            <Pressable 
              style={[styles.createGroupSubmitBtn, (!newGroupName.trim() || createGroupMutation.isPending) && styles.createGroupSubmitBtnDisabled]}
              onPress={handleCreateGroup}
              disabled={!newGroupName.trim() || createGroupMutation.isPending}
            >
              {createGroupMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.background} />
              ) : (
                <ThemedText style={styles.createGroupSubmitText}>Create Group</ThemedText>
              )}
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
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
  
  // Fetch user's liked comments for this post
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
  
  // Sync liked comments from server
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
      console.log("Comment error:", error);
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
    
    // Optimistic update
    setLikedComments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
    
    // Call API to persist like
    try {
      await apiRequest("POST", `/api/social/comments/${commentId}/like`);
      // Refetch comments to get updated like counts
      refetch();
    } catch (error) {
      console.log("Like error:", error);
      // Revert optimistic update on error
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
      console.log("Delete comment error:", error);
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
        style={styles.drawerBackdrop} 
        onPress={onClose}
      />
      <Animated.View style={[styles.commentsDrawer, animatedStyle, { bottom: tabBarHeight, height: isExpanded ? "85%" : DRAWER_HEIGHT }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={styles.drawerHandle}>
          <View style={styles.drawerHandleBar} />
        </View>
        
        <View style={styles.drawerHeader}>
          <ThemedText style={styles.drawerTitle}>Comments</ThemedText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable onPress={toggleExpand} style={styles.drawerCloseButton}>
              <Ionicons name={isExpanded ? "contract-outline" : "expand-outline"} size={18} color={Colors.dark.text} />
            </Pressable>
            <Pressable onPress={onClose} style={styles.drawerCloseButton}>
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
              <View style={[styles.commentItem, isReply && styles.commentItemReply]}>
                {hasPhoto ? (
                  <Image 
                    source={{ uri: item.author.photoUrl.startsWith("http") ? item.author.photoUrl : `${getApiUrl()}${item.author.photoUrl}` }} 
                    style={styles.commentAvatarImage} 
                  />
                ) : (
                  <View style={styles.commentAvatar}>
                    <ThemedText style={styles.commentAvatarText}>
                      {(item.author?.name || "?").charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                )}
                <View style={styles.commentContent}>
                  <ThemedText style={styles.commentAuthor}>{item.author?.name || "Unknown"}</ThemedText>
                  {item.replyToName && (
                    <View style={styles.replyBadge}>
                      <Ionicons name="return-down-forward" size={10} color={Colors.dark.primary} />
                      <ThemedText style={styles.replyBadgeText}>@{item.replyToName}</ThemedText>
                    </View>
                  )}
                  <ThemedText style={styles.commentText}>{item.text || item.content || ""}</ThemedText>
                  <View style={styles.commentActions}>
                    <Pressable style={styles.commentActionBtn} onPress={() => handleLike(item.id)}>
                      <Ionicons 
                        name={isLiked ? "heart" : "heart-outline"} 
                        size={14} 
                        color={isLiked ? "#EF4444" : Colors.dark.textMuted} 
                      />
                      {likeCount > 0 && (
                        <ThemedText style={[styles.commentActionText, isLiked && { color: "#EF4444" }]}>
                          {likeCount}
                        </ThemedText>
                      )}
                    </Pressable>
                    <Pressable style={styles.commentActionBtn} onPress={() => handleReply(item)}>
                      <Ionicons name="arrow-undo-outline" size={14} color={Colors.dark.textMuted} />
                      <ThemedText style={styles.commentActionText}>Reply</ThemedText>
                    </Pressable>
                    {item.authorId === user?.id && (
                      <Pressable style={styles.commentActionBtn} onPress={() => handleDeleteComment(item.id)}>
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyCommentsSmall}>
              <Ionicons name="chatbubble-outline" size={32} color={Colors.dark.textMuted} />
              <ThemedText style={styles.emptyCommentsText}>No comments yet</ThemedText>
            </View>
          }
          contentContainerStyle={{ paddingHorizontal: Spacing.md }}
        />
        
        {replyingTo && (
          <View style={styles.replyingToBar}>
            <View style={styles.replyingToContent}>
              <ThemedText style={styles.replyingToLabel}>Replying to</ThemedText>
              <ThemedText style={styles.replyingToName}>@{replyingTo.name}</ThemedText>
              <ThemedText style={styles.replyingToText} numberOfLines={1}>{replyingTo.text}</ThemedText>
            </View>
            <Pressable onPress={() => setReplyingTo(null)}>
              <Ionicons name="close-circle" size={20} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
        )}
        
        <View style={[styles.drawerInputContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom : Spacing.md }]}>
          <TextInput
            style={styles.commentInput}
            placeholder={replyingTo ? `Reply to @${replyingTo.name}...` : "Write a comment..."}
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

// Share Preview Modal - For sharing achievements with photo, caption, and background templates
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

function SharePreviewModal({ visible, achievement, onClose }: SharePreviewModalProps) {
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
          {/* Preview Card */}
          <View style={shareStyles.previewCard}>
            <LinearGradient
              colors={selectedBg.colors as unknown as readonly [string, string, ...string[]]}
              style={shareStyles.previewGradient}
            >
              {/* Photo area */}
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
              
              {/* Achievement info */}
              <View style={shareStyles.achievementInfo}>
                <LinearGradient
                  colors={gradient as readonly [string, string, ...string[]]}
                  style={shareStyles.achievementIcon}
                >
                  <Ionicons name={achievement.icon as any} size={32} color="#000" />
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
              
              {/* User badge */}
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
          
          {/* Caption Input */}
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
          
          {/* Background Selection */}
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
        
        {/* Share Buttons */}
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
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Ionicons name="share-social" size={20} color="#000" />
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
    color: "#000",
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
    color: "#000",
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
    color: "#000",
  },
});

// Post Detail Modal - For viewing friend activity posts with comments
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

function PostDetailModal({ visible, post, onClose, onCheer }: PostDetailModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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
          <View style={{ width: 40 }} />
        </View>
        
        <ScrollView style={postDetailStyles.content} showsVerticalScrollIndicator={false}>
          {/* Main Post */}
          <View style={postDetailStyles.postCard}>
            {/* Author header */}
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
            
            {/* Caption */}
            <ThemedText style={postDetailStyles.caption}>{post.caption}</ThemedText>
            
            {/* Actions */}
            <View style={postDetailStyles.actions}>
              <View style={postDetailStyles.reactions}>
                <ThemedText style={postDetailStyles.reactionEmoji}>🔥</ThemedText>
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
          
          {/* Comments Section */}
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
        
        {/* Comment Input */}
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
    color: "#000",
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
    color: "#000",
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
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  commentContent: {
    flex: 1,
    gap: 2,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  commentTime: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  commentText: {
    fontSize: 14,
    color: Colors.dark.text,
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
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 15,
    maxHeight: 100,
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
    backgroundColor: Colors.dark.backgroundTertiary,
  },
});

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

function CreateMomentModal({ visible, onClose, onSubmit, isSubmitting, userRole, userGroups }: CreateMomentModalProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"context" | "group_select" | "content">("context");
  const [selectedContext, setSelectedContext] = useState<ContextType | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  
  // Filter context options based on user role
  const isAdminOrCoach = userRole === "admin" || userRole === "coach" || userRole === "platform_owner" || userRole === "academy_owner";
  const availableContextOptions = CONTEXT_OPTIONS.filter(option => {
    // Event is only for admin/coach/owner
    if (option.type === "event") return isAdminOrCoach;
    // Achievement is typically auto-generated, but allow for now
    return true;
  });

  const handlePickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your photos and videos to share moments.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [16, 9],
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
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
        } else {
          formData.append("images", {
            uri,
            name: filename,
            type: mimeType,
          } as any);
        }
        
        const uploadResponse = await apiFetch("/api/social/posts/upload-images", {
          method: "POST",
          body: formData,
        });
        
        if (uploadResponse.ok) {
          const result = await uploadResponse.json();
          uploadedMediaUrls = result.images || [];
          uploadedMediaTypes = uploadedMediaUrls.map(() => selectedMedia.type);
          console.log("[Social] Uploaded media:", uploadedMediaUrls, "types:", uploadedMediaTypes);
        } else {
          const errorText = await uploadResponse.text();
          console.error("[Social] Upload failed:", errorText);
          Alert.alert("Error", "Failed to upload media. Please try again.");
          setIsUploading(false);
          return;
        }
      } catch (error) {
        console.error("[Social] Upload error:", error);
        Alert.alert("Error", "Failed to upload media. Please try again.");
        setIsUploading(false);
        return;
      }
    }
    
    console.log("[Social] Creating post with mediaUrls:", uploadedMediaUrls);
    
    // Determine visibility based on context type
    let visibility = "friends"; // default for Training, Match, Free Play
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
    // If Group is selected, show group selection step
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
            {step === "context" ? "New Moment" : step === "group_select" ? "Select Group" : "Share Your Moment"}
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
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
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
              {availableContextOptions.map((option) => (
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
        ) : step === "group_select" ? (
          <Animated.View entering={FadeIn} style={styles.contextStep}>
            <ThemedText style={styles.contextPrompt}>Which group are you posting to?</ThemedText>
            <ScrollView style={styles.groupList} showsVerticalScrollIndicator={false}>
              {userGroups && userGroups.length > 0 ? (
                userGroups.map((group) => (
                  <Pressable
                    key={group.id}
                    style={styles.groupOption}
                    onPress={() => handleSelectGroup(group.id, group.name)}
                  >
                    <View style={[styles.groupIconContainer, { backgroundColor: "#4ECDC420" }]}>
                      <Ionicons name="people" size={24} color="#4ECDC4" />
                    </View>
                    <View style={styles.groupInfo}>
                      <ThemedText style={styles.groupName}>{group.name}</ThemedText>
                      <ThemedText style={styles.groupType}>
                        {group.type === "training" ? "Training Group" : "Community Group"}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
                  </Pressable>
                ))
              ) : (
                <View style={styles.noGroupsMessage}>
                  <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
                  <ThemedText style={styles.noGroupsText}>You're not in any groups yet</ThemedText>
                </View>
              )}
            </ScrollView>
            <Pressable style={styles.backButton} onPress={() => setStep("context")}>
              <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
              <ThemedText style={styles.backButtonText}>Back</ThemedText>
            </Pressable>
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
                    {selectedGroupName ? ` → ${selectedGroupName}` : ""}
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

            {selectedMedia ? (
              <View style={styles.imagePreviewContainer}>
                {selectedMedia.type === "video" ? (
                  <View style={[styles.imagePreview, styles.videoPreview]}>
                    <Ionicons name="videocam" size={48} color={Colors.dark.primary} />
                    <ThemedText style={styles.videoLabel}>Video Selected</ThemedText>
                  </View>
                ) : (
                  <Image source={{ uri: selectedMedia.uri }} style={styles.imagePreview} />
                )}
                <Pressable 
                  style={styles.removeImageButton}
                  onPress={() => setSelectedMedia(null)}
                >
                  <Ionicons name="close-circle" size={28} color={Colors.dark.text} />
                </Pressable>
              </View>
            ) : null}

            <View style={styles.mediaButtons}>
              <Pressable style={styles.mediaButton} onPress={handlePickMedia}>
                <Ionicons name="images" size={24} color={Colors.dark.primary} />
                <ThemedText style={styles.mediaButtonText}>Gallery</ThemedText>
              </Pressable>
              <Pressable style={styles.mediaButton} onPress={handleTakePhoto}>
                <Ionicons name="camera" size={24} color={Colors.dark.primary} />
                <ThemedText style={styles.mediaButtonText}>Photo</ThemedText>
              </Pressable>
              <Pressable style={styles.mediaButton} onPress={handleRecordVideo}>
                <Ionicons name="videocam" size={24} color={Colors.dark.primary} />
                <ThemedText style={styles.mediaButtonText}>Video</ThemedText>
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
  const tabBarHeight = TAB_BAR_HEIGHT;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { hasSeenScreen, startWalkthrough } = useWalkthrough();
  const { isMinor, communityEnabled } = usePlayer();
  const [showSafetyModal, setShowSafetyModal] = useState(isMinor && !hasShownSafetyReminder());
  const canInteract = !isMinor || communityEnabled;
  const [mainTab, setMainTab] = useState<MainTab>("feed");
  const [filter, setFilter] = useState<FeedFilter>("for_you");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [showPostDetailModal, setShowPostDetailModal] = useState(false);
  const [selectedFriendActivity, setSelectedFriendActivity] = useState<FriendActivity | null>(null);
  const chatFooterHeight = 70;

  useEffect(() => {
    if (!hasSeenScreen("Social")) {
      const timer = setTimeout(() => {
        startWalkthrough("Social");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasSeenScreen, startWalkthrough]);
  
  // Fetch friend requests count for badge
  const { data: friendsData } = useQuery<{ friends: any[]; pendingRequests: any[] }>({
    queryKey: ["/api/player/me/friends"],
  });
  const friendRequestCount = friendsData?.pendingRequests?.length || 0;
  
  const DEMO_ACADEMY_FEED: Post[] = [
    {
      id: "academy-post-1",
      authorId: "coach-1",
      academyId: "demo-academy",
      contextType: "event",
      caption: "Exciting news! Our Summer Tennis Camp registration is now open. Limited spots available for all skill levels.",
      mediaUrls: [],
      mediaTypes: [],
      visibility: "academy",
      cheerCount: 34,
      commentCount: 12,
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      author: {
        id: "coach-1",
        name: "Coach Ahmed",
        photoUrl: null,
        isCoach: true,
        level: 50,
        title: "Head Coach",
      },
      userReaction: null,
    },
    {
      id: "academy-post-2",
      authorId: "admin-1",
      academyId: "demo-academy",
      contextType: "achievement",
      caption: "Congratulations to our Yellow Ball team for winning the Dubai Regional Championship! Amazing teamwork!",
      mediaUrls: [],
      mediaTypes: [],
      visibility: "academy",
      cheerCount: 89,
      commentCount: 28,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      author: {
        id: "admin-1",
        name: "Glow Up Academy",
        photoUrl: null,
        isCoach: true,
        level: 100,
        title: "Academy",
      },
      userReaction: "fire",
    },
    {
      id: "academy-post-3",
      authorId: "coach-2",
      academyId: "demo-academy",
      contextType: "training",
      caption: "New training schedule is out! Check your app for updated session times. See you on the court!",
      mediaUrls: [],
      mediaTypes: [],
      visibility: "academy",
      cheerCount: 22,
      commentCount: 5,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      author: {
        id: "coach-2",
        name: "Coach Maria",
        photoUrl: null,
        isCoach: true,
        level: 45,
        title: "Senior Coach",
      },
      userReaction: null,
    },
  ];

  const { data: rawFeed = [], isLoading, refetch, isFetching } = useQuery<Post[]>({
    queryKey: ["/api/social/feed", { filter }],
    queryFn: async () => {
      const response = await apiFetch(`/api/social/feed?filter=${filter}`);
      if (!response.ok) throw new Error("Failed to fetch feed");
      return response.json();
    },
  });
  
  const feed = rawFeed.length > 0 ? rawFeed : (filter === "academy" || filter === "moments") ? DEMO_ACADEMY_FEED : [];
  
  const { data: highlights } = useQuery<{ newMoments: number; openToPlay: number }>({
    queryKey: ["/api/social/highlights"],
  });
  
  // Fetch user's groups for group post selection
  const { data: userGroups = [] } = useQuery<{ id: string; name: string; type: string }[]>({
    queryKey: ["/api/social/groups"],
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
    mutationFn: async (data: { contextType: string; caption: string; mediaUrls: string[]; mediaTypes: string[]; visibility: string; groupId?: string }) => {
      return apiRequest("POST", "/api/social/posts", {
        contextType: data.contextType,
        caption: data.caption,
        mediaUrls: data.mediaUrls,
        mediaTypes: data.mediaTypes.length > 0 ? data.mediaTypes : data.mediaUrls.map(() => "image"),
        visibility: data.visibility,
        groupId: data.groupId,
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
    <LockedScreen featureKey="community_feed">
      <ThemedView style={styles.container}>
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, "#0a1a2e", Colors.dark.backgroundRoot]}
          style={StyleSheet.absoluteFill}
        />
      
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <ThemedText style={styles.title}>Social</ThemedText>
        
        <View style={styles.headerActions}>
          {mainTab === "feed" && canInteract ? (
            <Pressable 
              style={styles.headerButton}
              onPress={handleCreateMoment}
              testID="button-create-moment"
            >
              <View style={styles.addButton}>
                <Ionicons name="add" size={22} color={Colors.dark.buttonText} />
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>
      
      <MainTabBar active={mainTab} onChange={setMainTab} friendRequestCount={friendRequestCount} />

      {!canInteract ? (
        <View style={styles.restrictedBanner}>
          <Ionicons name="shield-checkmark" size={18} color="#00BCD4" />
          <ThemedText style={styles.restrictedText}>
            You can browse the community. Ask a parent to enable posting and commenting.
          </ThemedText>
        </View>
      ) : null}
      
      {mainTab === "feed" ? (
        <>
          <FeedFilterTabs active={filter} onChange={setFilter} />
          
          {filter === "for_you" ? (
            <AchievementShowcase 
              onSelectAchievement={(achievement) => {
                setSelectedAchievement(achievement);
                setShowShareModal(true);
              }}
            />
          ) : filter === "news" ? (
            <NewsSection />
          ) : isLoading ? (
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
        </>
      ) : mainTab === "friends" ? (
        <FriendsSection 
          onSelectActivity={(activity) => {
            setSelectedFriendActivity(activity);
            setShowPostDetailModal(true);
          }}
        />
      ) : (
        <GroupsSection />
      )}

      <CreateMomentModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={(data) => createPostMutation.mutate(data)}
        isSubmitting={createPostMutation.isPending}
        userRole={user?.role}
        userGroups={userGroups}
      />
      
      <CommentsModal
        visible={showCommentModal}
        postId={selectedCommentPostId}
        onClose={() => {
          setShowCommentModal(false);
          setSelectedCommentPostId(null);
        }}
      />
      
      <SharePreviewModal
        visible={showShareModal}
        achievement={selectedAchievement}
        onClose={() => {
          setShowShareModal(false);
          setSelectedAchievement(null);
        }}
      />
      
      <PostDetailModal
        visible={showPostDetailModal}
        post={selectedFriendActivity}
        onClose={() => {
          setShowPostDetailModal(false);
          setSelectedFriendActivity(null);
        }}
        onCheer={(postId) => {
          console.log("Cheer post:", postId);
        }}
      />

      <OnlineSafetyModal
        visible={showSafetyModal}
        onAccept={() => setShowSafetyModal(false)}
      />
      </ThemedView>
    </LockedScreen>
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
    aspectRatio: 16 / 9,
    maxHeight: 200,
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
    color: Colors.dark.text,
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
    color: Colors.dark.buttonText,
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
  groupList: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  groupOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  groupIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  groupType: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  noGroupsMessage: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  noGroupsText: {
    fontSize: 15,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
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
  momentImageContainer: {
    width: "100%",
    height: 200,
    backgroundColor: "rgba(0,0,0,0.3)",
    overflow: "hidden",
  },
  momentImage: {
    width: "100%",
    height: "100%",
  },
  videoContainer: {
    position: "relative",
  },
  videoIndicator: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 6,
    borderRadius: 12,
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
    color: Colors.dark.text,
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
  commentAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  drawerInputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  emptyCommentsSmall: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  // Main Tab Bar styles
  mainTabContainer: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: 4,
  },
  mainTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
  },
  mainTabActive: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  mainTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  mainTabTextActive: {
    color: Colors.dark.primary,
  },
  requestBadge: {
    backgroundColor: Colors.dark.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  requestBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  // Friends Section styles
  sectionContainer: {
    flex: 1,
  },
  sectionTabs: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  sectionTabActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
  },
  sectionTabText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  sectionTabTextActive: {
    color: Colors.dark.primary,
  },
  requestDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.error,
  },
  friendCard: {
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
  friendAvatarSection: {
    position: "relative",
  },
  friendAvatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    padding: 2,
    overflow: "hidden",
  },
  friendAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
  },
  friendAvatarPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  friendAvatarLetter: {
    fontSize: 20,
    fontWeight: "700",
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22C55E",
  },
  friendInfo: {
    flex: 1,
    gap: 4,
  },
  friendName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  friendMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  friendLevelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  friendLevelText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  friendStatus: {
    fontSize: 11,
    color: "#22C55E",
    fontWeight: "500",
  },
  friendActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  friendActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  friendChallengeBtn: {
    borderRadius: 20,
    overflow: "hidden",
  },
  friendChallengeBtnGradient: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  requestSubtext: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  requestActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.error + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  findPlayersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  findPlayersBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.backgroundRoot,
  },
  // Groups Section styles
  groupFilterContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  groupFilterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  groupFilterTabActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  groupFilterText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  groupFilterTextActive: {
    color: Colors.dark.background,
    fontWeight: "600",
  },
  createGroupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.dark.primary,
    marginTop: Spacing.lg,
  },
  createGroupBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  createGroupFab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  createGroupModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  createGroupModalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  createGroupModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  createGroupModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  createGroupForm: {
    gap: Spacing.md,
  },
  createGroupInputGroup: {
    gap: 6,
  },
  createGroupLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  createGroupInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  createGroupTextArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  createGroupTypeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  createGroupTypeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  createGroupTypeBtnActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  createGroupTypeText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  createGroupTypeTextActive: {
    color: Colors.dark.background,
    fontWeight: "600",
  },
  createGroupSubmitBtn: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  createGroupSubmitBtnDisabled: {
    opacity: 0.5,
  },
  createGroupSubmitText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.background,
  },
  groupCard: {
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
  groupSectionIconBg: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  groupSectionInfo: {
    flex: 1,
    gap: 2,
  },
  groupSectionName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  groupSectionMeta: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  groupSectionDescription: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  joinBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary,
  },
  joinedBtn: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  joinBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.backgroundRoot,
  },
  joinedBtnText: {
    color: Colors.dark.textSecondary,
  },
  activityCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  activityAvatarContainer: {
    position: "relative",
  },
  activityAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  activityAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  activityAvatarLetter: {
    fontSize: 20,
    fontWeight: "700",
  },
  activityTypeDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  activityInfo: {
    flex: 1,
    gap: 4,
  },
  activityNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  activityName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  activityLevelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activityLevelText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#000",
  },
  activityMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  activityContextBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activityContextText: {
    fontSize: 10,
    fontWeight: "600",
  },
  activityTime: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  activityCaption: {
    fontSize: 14,
    color: Colors.dark.text,
    marginTop: Spacing.md,
    lineHeight: 20,
  },
  activityActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  activityReactions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  activityReactionCount: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  activityCheerBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.md,
  },
  activityCheerBtnActive: {
    backgroundColor: Colors.dark.error + "20",
  },
  activityCheerText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  activityCheerTextActive: {
    color: Colors.dark.error,
  },
});

const achievementStyles = StyleSheet.create({
  list: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  headerIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  cardContainer: {
    marginBottom: Spacing.md,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  date: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  valueBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  valueText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#000",
  },
  description: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  shareButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  shareGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
  },
  shareText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  empty: {
    alignItems: "center",
    padding: Spacing.xl * 2,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
});

const newsStyles = StyleSheet.create({
  list: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  card: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.md,
  },
  cardContent: {
    flex: 1,
    padding: Spacing.md,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  categoryBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "700",
  },
  source: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
    lineHeight: 22,
  },
  summary: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  time: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  readMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  readMoreText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.dark.primary,
  },
  image: {
    width: 100,
    height: "100%",
    minHeight: 120,
  },
  imagePlaceholder: {
    width: 100,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  restrictedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,188,212,0.1)",
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  restrictedText: {
    flex: 1,
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
  },
});
