import React, { useState, useMemo, useEffect } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { LockedScreen } from "../components/LockedScreen";
import { apiRequest } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface Badge {
  id: string;
  name: string;
  description: string;
  iconName: string;
  iconColor: string;
  rarity: string;
  category: string;
  earnedAt?: string;
}

interface Title {
  id: string;
  name: string;
  description: string;
  rarity: string;
  unlockedAt?: string;
  isEquipped?: boolean;
}

interface CollectionData {
  badges: Badge[];
  titles: Title[];
  stats: {
    totalBadges: number;
    earnedBadges: number;
    totalTitles: number;
    unlockedTitles: number;
  };
}

const RARITY_COLORS: Record<string, string> = {
  common: Colors.dark.textMuted,
  uncommon: Colors.dark.primary,
  rare: Colors.dark.primary,
  epic: "#9B59B6",
  legendary: Colors.dark.orange,
};

const RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

const CATEGORY_ICONS: Record<string, string> = {
  attendance: "calendar-outline",
  skill: "trophy-outline",
  social: "people-outline",
  match: "tennisball-outline",
  milestone: "flag-outline",
  special: "star-outline",
};

type Tab = "badges" | "titles";

export default function CollectionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const track = useTrackFeature();
  const [activeTab, setActiveTab] = useState<Tab>("badges");
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);

  const { data, isLoading } = useQuery<CollectionData>({
    queryKey: ["/api/player/badges"],
  });

  const badges = data?.badges || [];
  const titles = data?.titles || [];
  const stats = data?.stats;

  const earnedBadges = badges.filter(b => b.earnedAt);
  const unearnedBadges = badges.filter(b => !b.earnedAt);
  const unlockedTitles = titles.filter(t => t.unlockedAt);
  const lockedTitles = titles.filter(t => !t.unlockedAt);

  const sortByRarity = <T extends { rarity: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => 
      RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)
    );
  };

  const handleBadgePress = (badge: Badge) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedBadge(badge);
  };

  const handleTitlePress = (title: Title) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTitle(title);
  };

  const renderBadge = (badge: Badge, index: number, isEarned: boolean) => {
    const rarityColor = RARITY_COLORS[badge.rarity] || Colors.dark.textMuted;
    const categoryIcon = CATEGORY_ICONS[badge.category] || "star-outline";

    return (
      <Animated.View
        key={badge.id}
        entering={FadeInDown.delay(index * 50).springify()}
      >
        <Pressable
          style={[styles.badgeCard, !isEarned && styles.badgeCardLocked]}
          onPress={() => handleBadgePress(badge)}
        >
          <View 
            style={[
              styles.badgeIconContainer,
              { backgroundColor: isEarned ? rarityColor + "20" : Colors.dark.backgroundTertiary },
            ]}
          >
            <Ionicons
              name={(badge.iconName || categoryIcon) as any}
              size={28}
              color={isEarned ? badge.iconColor || rarityColor : Colors.dark.textMuted}
            />
            {!isEarned ? (
              <View style={styles.lockOverlay}>
                <Ionicons name="lock-closed" size={14} color={Colors.dark.textMuted} />
              </View>
            ) : null}
          </View>
          <Text 
            style={[styles.badgeName, !isEarned && styles.badgeNameLocked]}
            numberOfLines={2}
          >
            {badge.name}
          </Text>
          <View style={[styles.rarityBadge, { backgroundColor: rarityColor + "20" }]}>
            <Text style={[styles.rarityText, { color: rarityColor }]}>
              {badge.rarity.toUpperCase()}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  const renderTitle = (title: Title, index: number, isUnlocked: boolean) => {
    const rarityColor = RARITY_COLORS[title.rarity] || Colors.dark.textMuted;

    return (
      <Animated.View
        key={title.id}
        entering={FadeInDown.delay(index * 50).springify()}
      >
        <Pressable
          style={[styles.titleCard, !isUnlocked && styles.titleCardLocked]}
          onPress={() => handleTitlePress(title)}
        >
          <View style={styles.titleLeft}>
            <View style={[styles.titleIcon, { borderColor: isUnlocked ? rarityColor : Colors.dark.backgroundTertiary }]}>
              {title.isEquipped ? (
                <Ionicons name="checkmark" size={16} color={Colors.dark.primary} />
              ) : (
                <Text style={[styles.titleInitial, { color: isUnlocked ? rarityColor : Colors.dark.textMuted }]}>
                  {title.name.charAt(0)}
                </Text>
              )}
            </View>
            <View style={styles.titleInfo}>
              <Text style={[styles.titleName, !isUnlocked && styles.titleNameLocked]}>
                {title.name}
              </Text>
              {title.isEquipped ? (
                <Text style={styles.equippedText}>Currently Equipped</Text>
              ) : null}
            </View>
          </View>
          <View style={[styles.titleRarity, { backgroundColor: rarityColor + "20" }]}>
            <Text style={[styles.titleRarityText, { color: rarityColor }]}>
              {title.rarity.slice(0, 4).toUpperCase()}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <LockedScreen featureKey="collection">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>My Collection</Text>
          <View style={styles.headerSpacer} />
        </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="ribbon" size={24} color={Colors.dark.gold} />
          <Text style={styles.statValue}>
            {stats?.earnedBadges || 0}/{stats?.totalBadges || 0}
          </Text>
          <Text style={styles.statLabel}>Badges</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="medal" size={24} color={Colors.dark.primary} />
          <Text style={styles.statValue}>
            {stats?.unlockedTitles || 0}/{stats?.totalTitles || 0}
          </Text>
          <Text style={styles.statLabel}>Titles</Text>
        </View>
      </View>

      <View style={styles.tabsContainer}>
        <Pressable
          style={[styles.tab, activeTab === "badges" && styles.tabActive]}
          onPress={() => { track("collection:badges"); setActiveTab("badges"); }}
        >
          <Ionicons 
            name="ribbon-outline" 
            size={20} 
            color={activeTab === "badges" ? Colors.dark.primary : Colors.dark.textSecondary} 
          />
          <Text style={[styles.tabText, activeTab === "badges" && styles.tabTextActive]}>
            Badges
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "titles" && styles.tabActive]}
          onPress={() => { track("collection:titles"); setActiveTab("titles"); }}
        >
          <Ionicons 
            name="medal-outline" 
            size={20} 
            color={activeTab === "titles" ? Colors.dark.primary : Colors.dark.textSecondary} 
          />
          <Text style={[styles.tabText, activeTab === "titles" && styles.tabTextActive]}>
            Titles
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator color={Colors.dark.primary} style={styles.loader} />
        ) : activeTab === "badges" ? (
          <>
            {earnedBadges.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Earned Badges</Text>
                <View style={styles.badgeGrid}>
                  {sortByRarity(earnedBadges).map((badge, i) => renderBadge(badge, i, true))}
                </View>
              </View>
            ) : null}

            {unearnedBadges.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Locked Badges</Text>
                <View style={styles.badgeGrid}>
                  {sortByRarity(unearnedBadges).map((badge, i) => renderBadge(badge, i, false))}
                </View>
              </View>
            ) : null}

            {badges.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="ribbon-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyText}>No Badges Yet</Text>
                <Text style={styles.emptySubtext}>
                  Keep playing and completing challenges to earn badges!
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            {unlockedTitles.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Unlocked Titles</Text>
                {sortByRarity(unlockedTitles).map((title, i) => renderTitle(title, i, true))}
              </View>
            ) : null}

            {lockedTitles.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Locked Titles</Text>
                {sortByRarity(lockedTitles).map((title, i) => renderTitle(title, i, false))}
              </View>
            ) : null}

            {titles.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="medal-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyText}>No Titles Yet</Text>
                <Text style={styles.emptySubtext}>
                  Level up to unlock awesome titles to display on your profile!
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal
        visible={!!selectedBadge}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBadge(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedBadge(null)}>
          <Animated.View entering={FadeIn} style={styles.modalContent}>
            {selectedBadge ? (
              <>
                <View 
                  style={[
                    styles.modalIcon,
                    { backgroundColor: (RARITY_COLORS[selectedBadge.rarity] || Colors.dark.textMuted) + "20" },
                  ]}
                >
                  <Ionicons
                    name={(selectedBadge.iconName || "star") as any}
                    size={48}
                    color={selectedBadge.iconColor || RARITY_COLORS[selectedBadge.rarity]}
                  />
                </View>
                <Text style={styles.modalTitle}>{selectedBadge.name}</Text>
                <View style={[styles.modalRarity, { backgroundColor: (RARITY_COLORS[selectedBadge.rarity] || Colors.dark.textMuted) + "20" }]}>
                  <Text style={[styles.modalRarityText, { color: RARITY_COLORS[selectedBadge.rarity] }]}>
                    {selectedBadge.rarity.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.modalDescription}>{selectedBadge.description}</Text>
                {selectedBadge.earnedAt ? (
                  <Text style={styles.modalDate}>
                    Earned on {new Date(selectedBadge.earnedAt).toLocaleDateString()}
                  </Text>
                ) : (
                  <Text style={styles.modalLocked}>Keep playing to unlock this badge!</Text>
                )}
              </>
            ) : null}
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal
        visible={!!selectedTitle}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTitle(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedTitle(null)}>
          <Animated.View entering={FadeIn} style={styles.modalContent}>
            {selectedTitle ? (
              <>
                <LinearGradient
                  colors={[(RARITY_COLORS[selectedTitle.rarity] || Colors.dark.textMuted) + "40", "transparent"]}
                  style={styles.modalTitleGradient}
                >
                  <Text style={[styles.modalTitleName, { color: RARITY_COLORS[selectedTitle.rarity] }]}>
                    {selectedTitle.name}
                  </Text>
                </LinearGradient>
                <View style={[styles.modalRarity, { backgroundColor: (RARITY_COLORS[selectedTitle.rarity] || Colors.dark.textMuted) + "20" }]}>
                  <Text style={[styles.modalRarityText, { color: RARITY_COLORS[selectedTitle.rarity] }]}>
                    {selectedTitle.rarity.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.modalDescription}>{selectedTitle.description}</Text>
                {selectedTitle.unlockedAt ? (
                  <Text style={styles.modalDate}>
                    Unlocked on {new Date(selectedTitle.unlockedAt).toLocaleDateString()}
                  </Text>
                ) : (
                  <Text style={styles.modalLocked}>Keep leveling up to unlock this title!</Text>
                )}
              </>
            ) : null}
          </Animated.View>
        </Pressable>
      </Modal>
      </View>
    </LockedScreen>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.heading3,
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 40,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  statValue: {
    ...Typography.heading3,
    color: Colors.dark.text,
    marginTop: Spacing.xs,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.xs,
  },
  tabActive: {
    backgroundColor: Colors.dark.primary + "20",
  },
  tabText: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  tabTextActive: {
    color: Colors.dark.primary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.heading4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  badgeCard: {
    width: 100,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    alignItems: "center",
  },
  badgeCardLocked: {
    opacity: 0.6,
  },
  badgeIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  lockOverlay: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 10,
    padding: 2,
  },
  badgeName: {
    ...Typography.caption,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
    height: 32,
  },
  badgeNameLocked: {
    color: Colors.dark.textMuted,
  },
  rarityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  rarityText: {
    fontSize: 9,
    fontWeight: "700",
  },
  titleCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  titleCardLocked: {
    opacity: 0.6,
  },
  titleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  titleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  titleInitial: {
    ...Typography.bodyLarge,
    fontWeight: "700",
  },
  titleInfo: {},
  titleName: {
    ...Typography.bodyLarge,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  titleNameLocked: {
    color: Colors.dark.textMuted,
  },
  equippedText: {
    ...Typography.caption,
    color: Colors.dark.primary,
  },
  titleRarity: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  titleRarityText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    ...Typography.bodyLarge,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.bodySmall,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xl,
  },
  loader: {
    marginVertical: Spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  modalIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.heading3,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  modalRarity: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  modalRarityText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  modalDescription: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  modalDate: {
    ...Typography.caption,
    color: Colors.dark.primary,
  },
  modalLocked: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  modalTitleGradient: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  modalTitleName: {
    ...Typography.heading2,
    textAlign: "center",
  },
}));
