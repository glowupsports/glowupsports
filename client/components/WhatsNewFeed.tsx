import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  Dimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import Animated, {
  FadeInDown,
  FadeIn,
} from "react-native-reanimated";
import {
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
  FunctionColors,
Backgrounds, } from "@/constants/theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const STORAGE_KEY = "@glow_whats_new_last_seen";

export interface WhatsNewItem {
  id: string;
  date: string;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  tag?: "new" | "improved" | "fix";
}

export interface WhatsNewFeedProps {
  visible: boolean;
  onClose: () => void;
  items: WhatsNewItem[];
}

const TAG_COLORS: Record<string, string> = {
  new: FunctionColors.success,
  improved: FunctionColors.info,
  fix: FunctionColors.social,
};

function getTagLabel(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

export function useWhatsNewBadgeCount(items: WhatsNewItem[]): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const lastSeen = await AsyncStorage.getItem(STORAGE_KEY);
        if (!lastSeen) {
          setCount(items.length);
        } else {
          const unseen = items.filter((item) => item.id > lastSeen);
          setCount(unseen.length);
        }
      } catch {
        setCount(items.length);
      }
    })();
  }, [items]);

  return count;
}

export function WhatsNewFeed({ visible, onClose, items }: WhatsNewFeedProps) {
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        setLastSeenId(stored);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (visible && items.length > 0) {
      const latestId = items.reduce((max, item) =>
        item.id > max ? item.id : max, items[0].id
      );
      AsyncStorage.setItem(STORAGE_KEY, latestId).catch(() => {});
      setLastSeenId(latestId);
    }
  }, [visible, items]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const isUnseen = useCallback(
    (itemId: string) => {
      if (!lastSeenId) return true;
      return itemId > lastSeenId;
    },
    [lastSeenId]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>

          <Animated.View entering={FadeIn.duration(300)} style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <Ionicons name="sparkles" size={24} color={GlowColors.primary} />
              <Text style={styles.sheetTitle}>What&apos;s New</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={TextColors.secondary} />
            </Pressable>
          </Animated.View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {items.map((item, index) => (
              <Animated.View
                key={item.id}
                entering={FadeInDown.delay(index * 60).duration(300)}
                style={[
                  styles.itemCard,
                  isUnseen(item.id) ? styles.itemCardUnseen : null,
                ]}
              >
                <View style={styles.itemHeader}>
                  <View style={[styles.itemIconContainer, { backgroundColor: `${item.iconColor}20` }]}>
                    <Ionicons
                      name={item.icon as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={item.iconColor}
                    />
                  </View>
                  <View style={styles.itemHeaderText}>
                    <View style={styles.itemTitleRow}>
                      <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                      {item.tag ? (
                        <View style={[styles.tagBadge, { backgroundColor: `${TAG_COLORS[item.tag]}20` }]}>
                          <Text style={[styles.tagText, { color: TAG_COLORS[item.tag] }]}>
                            {getTagLabel(item.tag)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.itemDate}>{item.date}</Text>
                  </View>
                </View>
                <Text style={styles.itemDescription}>{item.description}</Text>
                {isUnseen(item.id) ? (
                  <View style={styles.unseenDot} />
                ) : null}
              </Animated.View>
            ))}
            {items.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="sparkles-outline" size={48} color={TextColors.disabled} />
                <Text style={styles.emptyStateText}>No updates yet</Text>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Backgrounds.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    height: SCREEN_HEIGHT * 0.7,
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  dragHandleContainer: {
    alignItems: "center",
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: TextColors.disabled,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sheetTitle: {
    ...Typography.h2,
    color: TextColors.primary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Backgrounds.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["2xl"],
  },
  itemCard: {
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    padding: Spacing.lg,
    position: "relative",
  },
  itemCardUnseen: {
    borderColor: `${GlowColors.primary}30`,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  itemIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  itemHeaderText: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  itemTitle: {
    ...Typography.small,
    fontWeight: "600",
    color: TextColors.primary,
    flex: 1,
  },
  itemDate: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  tagBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  tagText: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "600",
  },
  itemDescription: {
    ...Typography.small,
    color: TextColors.secondary,
    lineHeight: 20,
  },
  unseenDot: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GlowColors.primary,
  },
  emptyState: {
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Spacing["5xl"],
  },
  emptyStateText: {
    ...Typography.body,
    color: TextColors.muted,
    marginTop: Spacing.md,
  },
}));

export default WhatsNewFeed;
