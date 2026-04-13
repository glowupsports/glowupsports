import logger from "@/lib/logger";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
  Platform,
  Image as RNImage,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { Colors, ProTennisColors, Backgrounds, Spacing, BorderRadius, GlowColors, FunctionColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { usePlayerLevel } from "@/player/hooks/usePlayerLevel";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.88;

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PlayerIdentityDrawerProps {
  visible: boolean;
  onClose: () => void;
  onNavigateToProfile?: () => void;
  onNavigate?: (screen: string, params?: any) => void;
}

interface PlayerData {
  id: string;
  name: string;
  level: number;
  xp: number;
  glowScore: number;
  ballLevel: string | null;
  streak: number;
  profilePhotoUrl?: string | null;
  isMinor?: boolean;
}

interface DrawerSection {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: DrawerItem[];
  showOnlyForMinor?: boolean;
}

interface DrawerItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen: string;
  params?: any;
  unlockLevel?: number;
  badge?: number;
  comingSoon?: boolean;
}

const DRAWER_SECTIONS: DrawerSection[] = [
  {
    id: "home",
    title: "HOME",
    icon: "home",
    items: [
      { id: "dashboard", title: "Dashboard", subtitle: "Your tennis hub", icon: "grid", screen: "PlayerTabs", params: { screen: "Home" } },
    ],
  },
  {
    id: "training",
    title: "TRAINING",
    icon: "fitness",
    items: [
      { id: "sessions", title: "My Sessions", subtitle: "Upcoming training", icon: "calendar", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "ScheduleMain" } } },
      { id: "plan", title: "My Plan & Progress", subtitle: "Academy program & XP", icon: "document-text", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "ProgressMain" } } },
      { id: "swinglab", title: "Swing Lab", subtitle: "Video analysis", icon: "videocam", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "SkillEvidence" } } },
      { id: "feedback", title: "Feedback Center", subtitle: "Skill assessments", icon: "stats-chart", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "FeedbackCenter" } } },
      { id: "coachfeedback", title: "Coach Feedback", subtitle: "Session reviews", icon: "chatbubbles", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "CoachFeedbackHistory" } } },
    ],
  },
  {
    id: "matches",
    title: "MATCHES & COMPETITION",
    icon: "trophy",
    items: [
      { id: "matchprep", title: "Match Prep", subtitle: "Opponent scouting", icon: "flag", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "Match", params: { initialTab: "upcoming" } } }, unlockLevel: 7 },
      { id: "matchlog", title: "Match Log", subtitle: "Results & history", icon: "list", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "Match", params: { initialTab: "history" } } }, unlockLevel: 7 },
      { id: "tournaments", title: "Tournaments", subtitle: "Brackets & stages", icon: "podium", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "Tournaments" } } },
      { id: "glowrank", title: "Glow Rank", subtitle: "Performance score", icon: "trending-up", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "GlowLeaderboard" } } },
      { id: "leaderboard", title: "Leaderboard", subtitle: "Global rankings", icon: "medal", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "GlowLeaderboard" } }, unlockLevel: 5 },
    ],
  },
  {
    id: "xp",
    title: "XP & QUESTS",
    icon: "rocket",
    items: [
      { id: "dailyquests", title: "Daily Quests", subtitle: "Today's challenges", icon: "flash", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "QuestsMain" } } },
      { id: "weeklyquests", title: "Weekly Quests", subtitle: "This week's goals", icon: "flame", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "QuestsMain" } } },
      { id: "rewards", title: "Claim Rewards", subtitle: "Your earned prizes", icon: "gift", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "QuestsMain" } } },
      { id: "unlockedfeatures", title: "Unlocked Features", subtitle: "What's available", icon: "lock-open", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "Collection" } } },
      { id: "levelhistory", title: "Level History", subtitle: "Your progress story", icon: "time", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "LevelUpHistory" } } },
    ],
  },
  {
    id: "career",
    title: "MY CAREER",
    icon: "ribbon",
    items: [
      { id: "skillradar", title: "Skill Radar", subtitle: "6 Pillars view", icon: "analytics", screen: "PlayerTabs", params: { screen: "Growth" } },
      { id: "progresstracker", title: "Progress Tracker", subtitle: "Domain trends", icon: "trending-up", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "XPHistory" } } },
      { id: "badges", title: "Badges & Titles", subtitle: "Rarity rewards", icon: "shield-checkmark", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "Collection" } } },
      { id: "locked", title: "Locked Features", subtitle: "What unlocks next", icon: "lock-closed", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "Collection" } } },
      { id: "collection", title: "Collection", subtitle: "Archives of growth", icon: "albums", screen: "PlayerTabs", params: { screen: "Growth", params: { screen: "Collection" } } },
    ],
  },
  {
    id: "social",
    title: "SOCIAL",
    icon: "people",
    items: [
      { id: "news", title: "Tennis News", subtitle: "Latest headlines", icon: "globe", screen: "News" },
      { id: "playerfinder", title: "Player Finder", subtitle: "Browse local players", icon: "search", screen: "PlayerFinder", unlockLevel: 6 },
      { id: "friends", title: "Friends", subtitle: "Your connections", icon: "people-circle", screen: "FriendsList" },
      { id: "feed", title: "Community Feed", subtitle: "Posts & reactions", icon: "newspaper", screen: "PlayerTabs", params: { screen: "Community" }, unlockLevel: 4 },
      { id: "groups", title: "Groups", subtitle: "Interest groups", icon: "layers", screen: "Groups", unlockLevel: 7 },
      { id: "messages", title: "Messages", subtitle: "1-on-1 chat", icon: "chatbubble", screen: "PlayerMessages" },
    ],
  },
  {
    id: "bookings",
    title: "BOOKINGS",
    icon: "calendar",
    items: [
      { id: "lessonbooking", title: "Lesson Booking", subtitle: "Book with coach", icon: "person-add", screen: "LessonBooking" },
      { id: "courtbooking", title: "Court Booking", subtitle: "Reserve courts", icon: "tennisball", screen: "CourtBooking", unlockLevel: 1 },
      { id: "mybookings", title: "My Bookings", subtitle: "Manage reservations", icon: "bookmark", screen: "MyCourtBookings" },
      { id: "vacation", title: "Vacation Mode", subtitle: "Set availability", icon: "airplane", screen: "Settings" },
    ],
  },
  {
    id: "shop",
    title: "SHOP & MARKETPLACE",
    icon: "storefront",
    items: [
      { id: "academyshop", title: "Academy Shop", subtitle: "Official products", icon: "bag-handle", screen: "Shop", unlockLevel: 9 },
      { id: "marketplace", title: "Marketplace", subtitle: "Buy & sell gear", icon: "pricetag", screen: "Marketplace", unlockLevel: 12 },
      { id: "cart", title: "Cart & Wallet", subtitle: "Glow Credits", icon: "wallet", screen: "Cart" },
    ],
  },
  {
    id: "family",
    title: "FAMILY PORTAL",
    icon: "people",
    showOnlyForMinor: true,
    items: [
      { id: "parentdash", title: "Parent Dashboard", subtitle: "Family overview", icon: "home", screen: "ParentDashboard" },
      { id: "lessons", title: "Lessons Overview", subtitle: "Child's sessions", icon: "school", screen: "ParentLessons" },
      { id: "creditstore", title: "Credit Store", subtitle: "Buy credits", icon: "card", screen: "ParentCreditStore" },
      { id: "familysettings", title: "Family Settings", subtitle: "PIN & access", icon: "settings", screen: "ParentSettings" },
    ],
  },
  {
    id: "settings",
    title: "SETTINGS & SUPPORT",
    icon: "settings",
    items: [
      { id: "profile", title: "My Profile", subtitle: "Edit your info", icon: "person", screen: "Settings" },
      { id: "preferences", title: "Preferences", subtitle: "Goals & playstyle", icon: "options", screen: "Settings" },
      { id: "notifications", title: "Notifications", subtitle: "Alert settings", icon: "notifications", screen: "PlayerNotifications" },
      { id: "support", title: "Support", subtitle: "Get help", icon: "help-circle", screen: "PlayerHelp" },
    ],
  },
];

function AccordionSection({ 
  section, 
  isExpanded, 
  onToggle, 
  playerLevel,
  onNavigate,
  unreadCount,
}: { 
  section: DrawerSection; 
  isExpanded: boolean; 
  onToggle: () => void;
  playerLevel: number;
  onNavigate: (screen: string, params?: any) => void;
  unreadCount: number;
}) {
  const activeColor = isExpanded ? ProTennisColors.electricGreen : ProTennisColors.white;
  
  return (
    <View style={[styles.sectionContainer, isExpanded && styles.sectionExpanded]}>
      <Pressable style={styles.sectionHeader} onPress={onToggle}>
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionIconWrap, isExpanded && styles.sectionIconActive]}>
            <Ionicons name={section.icon} size={18} color={activeColor} />
          </View>
          <Text style={[styles.sectionTitle, { color: activeColor }]}>{section.title}</Text>
        </View>
        <Ionicons 
          name={isExpanded ? "chevron-up" : "chevron-down"} 
          size={18} 
          color={isExpanded ? ProTennisColors.electricGreen : ProTennisColors.textMuted} 
        />
      </Pressable>
      
      {isExpanded && (
        <View style={styles.sectionItems}>
          {section.items.map((item) => {
            const isLocked = item.unlockLevel && playerLevel < item.unlockLevel;
            const badgeCount = item.id === "messages" ? unreadCount : item.badge;
            
            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && !isLocked && styles.menuItemPressed,
                  isLocked && styles.menuItemLocked,
                ]}
                onPress={() => {
                  if (isLocked || item.comingSoon) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    return;
                  }
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onNavigate(item.screen, item.params);
                }}
              >
                <View style={[styles.itemIconWrap, isLocked && styles.itemIconLocked]}>
                  <Ionicons 
                    name={isLocked ? "lock-closed" : item.icon} 
                    size={18} 
                    color={isLocked ? ProTennisColors.textMuted : ProTennisColors.neonCyan} 
                  />
                </View>
                <View style={styles.itemContent}>
                  <Text style={[styles.itemTitle, isLocked && styles.itemTitleLocked]}>
                    {item.title}
                  </Text>
                  <Text style={styles.itemSubtitle}>
                    {isLocked ? `Unlock at Level ${item.unlockLevel}` : item.comingSoon ? "Available Soon" : item.subtitle}
                  </Text>
                </View>
                {badgeCount && badgeCount > 0 && !isLocked ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badgeCount > 9 ? "9+" : badgeCount}</Text>
                  </View>
                ) : (
                  <Ionicons 
                    name="chevron-forward" 
                    size={16} 
                    color={isLocked ? ProTennisColors.textMuted + "50" : ProTennisColors.textMuted} 
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function PlayerIdentityDrawer({ visible, onClose, onNavigate }: PlayerIdentityDrawerProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { logout } = useAuth();
  const [expandedSection, setExpandedSection] = useState<string | null>("home");
  
  const translateX = useSharedValue(-DRAWER_WIDTH);
  const backdropOpacity = useSharedValue(0);
  const glowPulse = useSharedValue(1);

  const { data: profileData } = useQuery<{ player: PlayerData }>({
    queryKey: ["/api/player/me/profile"],
  });

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/player/me/unread-count"],
  });

  const player = profileData?.player;
  const playerId = player?.id || "";
  const { data: levelStatus } = usePlayerLevel(playerId);
  
  const playerLevel = levelStatus?.level ?? player?.level ?? 1;
  const playerTitle = levelStatus?.title || getPlayerTitle(playerLevel);
  const xpInLevel = levelStatus?.xpInCurrentLevel ?? 0;
  const xpNeeded = levelStatus?.xpNeededForNextLevel ?? 100;
  const levelProgress = xpNeeded > 0 ? Math.min(xpInLevel / xpNeeded, 1) : 0;
  
  const rawPhotoUrl = player?.profilePhotoUrl;
  const profilePhotoUrl = buildPhotoUrl(rawPhotoUrl);

  const unreadCount = unreadData?.unreadCount || 0;
  const isMinor = player?.isMinor ?? false;

  useEffect(() => {
    if (Platform.OS === "web") {
      translateX.value = visible ? 0 : -DRAWER_WIDTH;
      backdropOpacity.value = visible ? 1 : 0;
      return;
    }
    if (visible) {
      translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
      backdropOpacity.value = withTiming(1, { duration: 250 });
      glowPulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      translateX.value = withSpring(-DRAWER_WIDTH, { damping: 20, stiffness: 200 });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const glowRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowPulse.value }],
  }));

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const navigateAndClose = (screen: string, params?: any) => {
    // Use the onNavigate prop passed from parent (has correct Stack navigator context)
    if (onNavigate) {
      onNavigate(screen, params);
    } else {
      // Fallback to local navigation if prop not provided
      try {
        let rootNav = navigation;
        let parent = navigation.getParent();
        while (parent) {
          rootNav = parent;
          parent = parent.getParent();
        }
        
        if (screen === "PlayerTabs" && params?.screen) {
          // Pass full nested params for deep navigation (e.g., Progress -> Tournaments)
          rootNav.navigate("PlayerTabs", params);
        } else {
          rootNav.navigate(screen, params);
        }
      } catch (error) {
        logger.log("[Drawer] Navigation error:", error);
      }
      setTimeout(() => {
        handleClose();
      }, 100);
    }
  };

  const toggleSection = (sectionId: string) => {
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedSection(expandedSection === sectionId ? null : sectionId);
  };

  const handleLogout = () => {
    handleClose();
    logout();
  };

  const filteredSections = DRAWER_SECTIONS.filter(section => {
    if (section.showOnlyForMinor && !isMinor) return false;
    return true;
  });

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents={visible ? "auto" : "none"}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, drawerStyle, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={[ProTennisColors.midnightBlue, ProTennisColors.surfaceDark, ProTennisColors.midnightBlue]}
          style={styles.drawerGradient}
        >
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* PLAYER IDENTITY HEADER */}
            <View style={styles.identityHeader}>
              <Pressable 
                style={styles.avatarSection}
                onPress={() => navigateAndClose("PlayerProfile")}
              >
                <Animated.View style={[styles.glowRingOuter, glowRingStyle]}>
                  <Svg width={90} height={90} viewBox="0 0 90 90">
                    <Defs>
                      <SvgGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor={ProTennisColors.electricGreen} stopOpacity="1" />
                        <Stop offset="50%" stopColor={ProTennisColors.neonCyan} stopOpacity="0.8" />
                        <Stop offset="100%" stopColor={ProTennisColors.electricGreen} stopOpacity="1" />
                      </SvgGradient>
                    </Defs>
                    <Circle
                      cx="45"
                      cy="45"
                      r="42"
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="4"
                      fill="none"
                    />
                    <Circle
                      cx="45"
                      cy="45"
                      r="42"
                      stroke="url(#ringGrad)"
                      strokeWidth="4"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${levelProgress * 264} 264`}
                      transform="rotate(-90 45 45)"
                    />
                  </Svg>
                  
                  <View style={styles.avatarInner}>
                    {profilePhotoUrl ? (
                      Platform.OS === "web" ? (
                        <RNImage
                          source={{ uri: profilePhotoUrl }}
                          style={styles.avatarPhoto}
                          resizeMode="cover"
                        />
                      ) : (
                        <Image
                          source={{ uri: profilePhotoUrl }}
                          style={styles.avatarPhoto}
                          contentFit="cover"
                        />
                      )
                    ) : (
                      <LinearGradient
                        colors={[ProTennisColors.surfaceElevated, ProTennisColors.surfaceDark]}
                        style={styles.avatarGradient}
                      >
                        <Text style={styles.avatarInitial}>
                          {player?.name?.charAt(0)?.toUpperCase() || "P"}
                        </Text>
                      </LinearGradient>
                    )}
                  </View>
                </Animated.View>

                <View style={styles.levelBadge}>
                  <LinearGradient
                    colors={ProTennisColors.gradientElectric as [string, string]}
                    style={styles.levelBadgeGradient}
                  >
                    <Text style={styles.levelNumber}>{playerLevel}</Text>
                  </LinearGradient>
                </View>
              </Pressable>

              <View style={styles.identityInfo}>
                <Text style={styles.playerName}>{(player?.name || "Player").toUpperCase()}</Text>
                <View style={styles.titleRow}>
                  <View style={styles.titleBadge}>
                    <Text style={styles.titleText}>{playerTitle}</Text>
                  </View>
                </View>
                
                <View style={styles.xpSection}>
                  <Text style={styles.xpLabel}>FORM</Text>
                  <View style={styles.xpBarContainer}>
                    <View style={styles.xpBarBg}>
                      <View style={[styles.xpBarFill, { width: `${levelProgress * 100}%` }]} />
                    </View>
                    <Text style={styles.xpText}>{xpInLevel}/{xpNeeded} XP</Text>
                  </View>
                </View>
                
                <View style={styles.statsRow}>
                  {player?.glowScore && player.glowScore > 0 ? (
                    <View style={styles.statChip}>
                      <Ionicons name="flash" size={12} color={ProTennisColors.neonCyan} />
                      <Text style={styles.statChipText}>{player.glowScore}</Text>
                    </View>
                  ) : null}
                  {player?.streak && player.streak > 0 ? (
                    <View style={styles.streakChip}>
                      <Ionicons name="flame" size={12} color={ProTennisColors.warning} />
                      <Text style={styles.streakChipText}>{player.streak}d</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {/* ACCORDION SECTIONS */}
            <View style={styles.sectionsContainer}>
              {filteredSections.map((section) => (
                <AccordionSection
                  key={section.id}
                  section={section}
                  isExpanded={expandedSection === section.id}
                  onToggle={() => toggleSection(section.id)}
                  playerLevel={playerLevel}
                  onNavigate={navigateAndClose}
                  unreadCount={unreadCount}
                />
              ))}
            </View>

            {/* LOGOUT BUTTON */}
            <View style={styles.logoutSection}>
              <Pressable 
                style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutPressed]}
                onPress={handleLogout}
              >
                <Ionicons name="log-out-outline" size={20} color={FunctionColors.error} />
                <Text style={styles.logoutText}>Logout</Text>
              </Pressable>
            </View>
          </ScrollView>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

function getPlayerTitle(level: number): string {
  if (level >= 20) return "LEGEND";
  if (level >= 17) return "CHAMPION";
  if (level >= 15) return "ELITE";
  if (level >= 12) return "PRO PLAYER";
  if (level >= 10) return "RISING STAR";
  if (level >= 7) return "COURT WARRIOR";
  if (level >= 5) return "ACADEMY ACE";
  if (level >= 3) return "TENNIS TALENT";
  return "ROOKIE";
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.card,
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: Backgrounds.card,
    borderRightWidth: 1,
    borderRightColor: GlowColors.primary + "20",
  },
  drawerGradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },

  /* IDENTITY HEADER */
  identityHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: GlowColors.primary + "15",
    gap: Spacing.md,
  },
  avatarSection: {
    position: "relative",
  },
  glowRingOuter: {
    width: 90,
    height: 90,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInner: {
    position: "absolute",
    width: 74,
    height: 74,
    borderRadius: 37,
    overflow: "hidden",
    left: 8,
    top: 8,
  },
  avatarGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPhoto: {
    width: "100%",
    height: "100%",
    borderRadius: 37,
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: "800",
    color: GlowColors.primary,
    letterSpacing: -1,
  },
  levelBadge: {
    position: "absolute",
    bottom: -2,
    left: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  levelBadgeGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  levelNumber: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(255, 255, 255, 0.06)",
  },
  identityInfo: {
    flex: 1,
    paddingTop: 4,
  },
  playerName: {
    fontSize: 18,
    fontWeight: "800",
    color: ProTennisColors.white,
    letterSpacing: 1,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  titleBadge: {
    backgroundColor: GlowColors.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: GlowColors.primary + "40",
  },
  titleText: {
    fontSize: 10,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 0.5,
  },
  xpSection: {
    marginBottom: Spacing.xs,
  },
  xpLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: GlowColors.primary,
    marginBottom: 3,
  },
  xpBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  xpBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: Backgrounds.elevated,
    borderRadius: 3,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    backgroundColor: GlowColors.primary,
    borderRadius: 3,
  },
  xpText: {
    fontSize: 9,
    fontWeight: "600",
    color: ProTennisColors.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ProTennisColors.neonCyan + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  statChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: ProTennisColors.neonCyan,
  },
  streakChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ProTennisColors.warning + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  streakChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: ProTennisColors.warning,
  },

  /* SECTIONS */
  sectionsContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  sectionContainer: {
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  sectionExpanded: {
    borderColor: GlowColors.primary + "30",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Backgrounds.elevated,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionIconActive: {
    backgroundColor: GlowColors.primary + "20",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  sectionItems: {
    paddingBottom: Spacing.sm,
    backgroundColor: Backgrounds.card,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  menuItemPressed: {
    backgroundColor: Backgrounds.elevated,
  },
  menuItemLocked: {
    opacity: 0.5,
  },
  itemIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: ProTennisColors.neonCyan + "15",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  itemIconLocked: {
    backgroundColor: ProTennisColors.textMuted + "15",
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  itemTitleLocked: {
    color: ProTennisColors.textMuted,
  },
  itemSubtitle: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
    marginTop: 1,
  },
  badge: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },

  /* LOGOUT */
  logoutSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: FunctionColors.error + "15",
    borderWidth: 1,
    borderColor: FunctionColors.error + "30",
    gap: Spacing.sm,
  },
  logoutPressed: {
    backgroundColor: FunctionColors.error + "25",
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "600",
    color: FunctionColors.error,
  },
});
