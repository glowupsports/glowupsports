import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Dimensions,
  Platform,
  Alert,
} from "react-native";
import PagerView from "react-native-pager-view";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/coach/context/AuthContext";
import { GlowColors, Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useNavigation } from "@react-navigation/native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_AUTO_ADVANCE_MS = 3500;
const TOTAL_CARDS = 5;

interface WeeklyDigestData {
  weekRange: string;
  xpEarned: number;
  sessionsAttended: number;
  streakCurrent: number;
  streakIsPersonalBest: boolean;
  questsCompleted: number;
  questsTotal: number;
  aiMessage: string;
  isFreePlayer: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const CARD_GRADIENTS: [string, string][] = [
  ["#1A1A2E", "#16213E"],
  ["#0F3460", "#533483"],
  ["#1B262C", "#0F3460"],
  ["#162447", "#1F4068"],
  ["#1A1A2E", "#533483"],
];

const CARD_ACCENT_COLORS = [
  GlowColors.primary,
  "#A78BFA",
  "#34D399",
  "#FBBF24",
  "#60A5FA",
];

function StatCard({
  index,
  data,
  shareRef,
}: {
  index: number;
  data: WeeklyDigestData;
  shareRef?: React.RefObject<View | null>;
}) {
  const accent = CARD_ACCENT_COLORS[index] ?? GlowColors.primary;
  const gradient = CARD_GRADIENTS[index] ?? (["#1A1A2E", "#16213E"] as [string, string]);

  const renderContent = () => {
    switch (index) {
      case 0:
        return (
          <>
            <View style={[cc.iconWrap, { borderColor: `${accent}44`, backgroundColor: `${accent}18` }]}>
              <Ionicons name="calendar-outline" size={32} color={accent} />
            </View>
            <Text style={[cc.eyebrow, { color: accent }]}>YOUR WEEK</Text>
            <Text style={cc.bigLabel}>{data.weekRange}</Text>
            <View style={[cc.statBadge, { borderColor: `${accent}44`, backgroundColor: `${accent}18` }]}>
              <Ionicons name="flash" size={16} color={accent} />
              <Text style={[cc.statBadgeText, { color: accent }]}>
                {data.xpEarned > 0 ? `+${data.xpEarned} XP earned` : "No XP yet this week"}
              </Text>
            </View>
            <Text style={cc.subLabel}>Your weekly performance snapshot</Text>
          </>
        );
      case 1:
        return (
          <>
            <View style={[cc.iconWrap, { borderColor: `${accent}44`, backgroundColor: `${accent}18` }]}>
              <Ionicons name="tennisball-outline" size={32} color={accent} />
            </View>
            <Text style={[cc.eyebrow, { color: accent }]}>SESSIONS</Text>
            <Text style={cc.bigNumber}>{data.sessionsAttended}</Text>
            <Text style={cc.bigLabel}>
              {data.sessionsAttended === 1 ? "session attended" : "sessions attended"}
            </Text>
            {data.streakCurrent > 0 ? (
              <View style={[cc.statBadge, { borderColor: `${accent}44`, backgroundColor: `${accent}18` }]}>
                <Ionicons name="flame" size={16} color={accent} />
                <Text style={[cc.statBadgeText, { color: accent }]}>
                  {data.streakCurrent}-day quest streak
                  {data.streakIsPersonalBest ? " — Personal best!" : ""}
                </Text>
              </View>
            ) : null}
          </>
        );
      case 2:
        return (
          <>
            <View style={[cc.iconWrap, { borderColor: `${accent}44`, backgroundColor: `${accent}18` }]}>
              <Ionicons name="checkmark-circle-outline" size={32} color={accent} />
            </View>
            <Text style={[cc.eyebrow, { color: accent }]}>QUESTS</Text>
            <Text style={cc.bigNumber}>{data.questsCompleted}</Text>
            <Text style={cc.bigLabel}>
              of {data.questsTotal > 0 ? data.questsTotal : "–"} quests completed
            </Text>
            {data.questsTotal > 0 ? (
              <View style={cc.progressTrack}>
                <View
                  style={[
                    cc.progressFill,
                    {
                      backgroundColor: accent,
                      width: `${Math.min(
                        (data.questsCompleted / data.questsTotal) * 100,
                        100,
                      )}%`,
                    },
                  ]}
                />
              </View>
            ) : null}
          </>
        );
      case 3:
        return (
          <>
            <View style={[cc.iconWrap, { borderColor: `${accent}44`, backgroundColor: `${accent}18` }]}>
              <Ionicons name="trophy-outline" size={32} color={accent} />
            </View>
            <Text style={[cc.eyebrow, { color: accent }]}>MILESTONE</Text>
            {data.sessionsAttended >= 3 ? (
              <>
                <Text style={cc.bigLabel}>3-session week</Text>
                <Text style={cc.subLabel}>You hit your weekly session target — elite consistency!</Text>
              </>
            ) : data.xpEarned >= 200 ? (
              <>
                <Text style={cc.bigLabel}>{data.xpEarned}+ XP earned</Text>
                <Text style={cc.subLabel}>Every point pushes you further up the ladder.</Text>
              </>
            ) : data.streakCurrent >= 5 ? (
              <>
                <Text style={cc.bigLabel}>{data.streakCurrent}-day streak</Text>
                <Text style={cc.subLabel}>Consistency is your superpower. Keep it going.</Text>
              </>
            ) : (
              <>
                <Text style={cc.bigLabel}>Showing up</Text>
                <Text style={cc.subLabel}>{"Progress is earned one session at a time. You're on your way."}</Text>
              </>
            )}
          </>
        );
      case 4:
        return (
          <View ref={shareRef as any} collapsable={false} style={cc.shareableCard}>
            <View style={[cc.iconWrap, { borderColor: `${accent}44`, backgroundColor: `${accent}18` }]}>
              <Ionicons name="sparkles" size={32} color={accent} />
            </View>
            <Text style={[cc.eyebrow, { color: accent }]}>AI COACH</Text>
            <Text style={[cc.aiMessage, { color: Colors.dark.text }]}>{`"${data.aiMessage}"`}</Text>
            <Text style={[cc.subLabel, { marginTop: Spacing.sm }]}>See you on court next week</Text>
            <View style={cc.brandingRow}>
              <Ionicons name="tennisball" size={11} color={GlowColors.primary} />
              <Text style={cc.brandingText}>Glow Sports</Text>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={cc.card}
    >
      <View style={cc.cardInner}>{renderContent()}</View>
    </LinearGradient>
  );
}

function FreePlayerUpsell({ onClose }: { onClose: () => void }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.root, { backgroundColor: "#0A0A14" }]}>
      <View style={[s.topBar, { marginTop: insets.top + Spacing.md }]}>
        <View style={s.topBarLeft}>
          <Ionicons name="sparkles" size={16} color={GlowColors.primary} />
          <Text style={s.topBarTitle}>Your Week in Tennis</Text>
        </View>
        <Pressable hitSlop={12} onPress={onClose} style={s.closeBtn}>
          <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
        </Pressable>
      </View>

      <View style={u.container}>
        <LinearGradient
          colors={["#1A1A2E", "#16213E"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={u.card}
        >
          <View style={u.lockIcon}>
            <Ionicons name="lock-closed" size={36} color={GlowColors.primary} />
          </View>
          <Text style={u.title}>Unlock Your Weekly Story</Text>
          <Text style={u.body}>
            Your personal weekly digest — XP earned, sessions attended, quest completions, streaks, and
            an AI coach message — is available for academy members.
          </Text>
          <Pressable
            style={u.ctaBtn}
            onPress={() => {
              onClose();
              try {
                navigation.navigate("AcademyBrowser");
              } catch {}
            }}
          >
            <Ionicons name="tennisball" size={14} color={Colors.dark.backgroundRoot} />
            <Text style={u.ctaText}>Find an Academy</Text>
          </Pressable>
        </LinearGradient>
      </View>
    </View>
  );
}

export function WeeklyDigestStory({ visible, onClose }: Props) {
  const { user, isGuest } = useAuth();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareCardRef = useRef<View>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sharing, setSharing] = useState(false);

  const isFreePlayer = !user?.academyId;

  const { data, isLoading } = useQuery<WeeklyDigestData>({
    queryKey: ["/api/player/me/weekly-digest"],
    enabled: visible && !!user?.playerId && !isGuest && !isFreePlayer,
    staleTime: 7 * 24 * 60_000,
  });

  const goNext = useCallback(() => {
    setActiveIndex((prev) => {
      if (prev >= TOTAL_CARDS - 1) return prev;
      const next = prev + 1;
      pagerRef.current?.setPage(next);
      return next;
    });
  }, []);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => {
      if (prev <= 0) return prev;
      const next = prev - 1;
      pagerRef.current?.setPage(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!visible) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (activeIndex < TOTAL_CARDS - 1) {
      timerRef.current = setTimeout(() => {
        goNext();
      }, CARD_AUTO_ADVANCE_MS);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeIndex, visible, goNext]);

  useEffect(() => {
    if (visible) {
      setActiveIndex(0);
      pagerRef.current?.setPage(0);
    }
  }, [visible]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    if (!shareCardRef.current) {
      return;
    }

    setSharing(true);
    try {
      const uri = await captureRef(shareCardRef, {
        format: "png",
        quality: 1,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "Share your week recap",
        });
      } else if (Platform.OS === "web") {
        Alert.alert("Share", "Sharing is only available on iOS and Android.");
      }
    } catch (err) {
      console.warn("[WeeklyDigest] Share failed:", err);
    } finally {
      setSharing(false);
    }
  }, [sharing]);

  if (!visible) return null;

  if (isGuest || isFreePlayer) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={false}
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <FreePlayerUpsell onClose={onClose} />
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[s.root, { backgroundColor: "#0A0A14" }]}>
        <View style={[s.progressBar, { marginTop: insets.top + 8 }]}>
          {Array.from({ length: TOTAL_CARDS }).map((_, i) => (
            <View key={i} style={s.progressSegmentWrap}>
              <View
                style={[
                  s.progressSegment,
                  i < activeIndex && s.progressSegmentDone,
                  i === activeIndex && s.progressSegmentActive,
                ]}
              />
            </View>
          ))}
        </View>

        <View style={s.topBar}>
          <View style={s.topBarLeft}>
            <Ionicons name="sparkles" size={16} color={GlowColors.primary} />
            <Text style={s.topBarTitle}>Your Week in Tennis</Text>
          </View>
          <Pressable hitSlop={12} onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        {isLoading || !data ? (
          <View style={s.loadingWrap}>
            <Ionicons name="sparkles" size={40} color={GlowColors.primary} />
            <Text style={s.loadingText}>Loading your week...</Text>
          </View>
        ) : (
          <>
            <PagerView
              ref={pagerRef}
              style={s.pager}
              initialPage={0}
              onPageSelected={(e) => {
                const idx = e.nativeEvent.position;
                setActiveIndex(idx);
                Haptics.selectionAsync().catch(() => {});
              }}
              scrollEnabled
            >
              {Array.from({ length: TOTAL_CARDS }).map((_, i) => (
                <View key={i} style={s.pageWrap}>
                  <StatCard
                    index={i}
                    data={data}
                    shareRef={i === TOTAL_CARDS - 1 ? shareCardRef : undefined}
                  />
                </View>
              ))}
            </PagerView>

            <View style={[s.bottomRow, { paddingBottom: insets.bottom + Spacing.md }]}>
              <Pressable
                style={({ pressed }) => [s.navBtn, pressed && { opacity: 0.7 }]}
                onPress={goPrev}
                disabled={activeIndex === 0}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={activeIndex === 0 ? Colors.dark.chipBackgroundStrong : Colors.dark.text}
                />
              </Pressable>

              <View style={s.dotsRow}>
                {Array.from({ length: TOTAL_CARDS }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      s.dot,
                      i === activeIndex
                        ? [s.dotActive, { backgroundColor: CARD_ACCENT_COLORS[activeIndex] ?? GlowColors.primary }]
                        : s.dotInactive,
                    ]}
                  />
                ))}
              </View>

              {activeIndex === TOTAL_CARDS - 1 ? (
                <Pressable
                  style={({ pressed }) => [s.shareBtn, pressed && { opacity: 0.8 }, sharing && { opacity: 0.6 }]}
                  onPress={handleShare}
                  disabled={sharing}
                >
                  <Ionicons name="share-outline" size={16} color={Colors.dark.backgroundRoot} />
                  <Text style={s.shareBtnText}>{sharing ? "Sharing..." : "Share"}</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [s.navBtn, pressed && { opacity: 0.7 }]}
                  onPress={goNext}
                >
                  <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  progressBar: {
    flexDirection: "row",
    gap: 4,
    marginHorizontal: Spacing.lg,
  },
  progressSegmentWrap: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  progressSegment: {
    height: "100%",
    width: "0%",
    backgroundColor: "transparent",
  },
  progressSegmentDone: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  progressSegmentActive: {
    width: "60%",
    backgroundColor: GlowColors.primary,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  topBarTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  pager: {
    flex: 1,
  },
  pageWrap: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 16,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
  },
  dotInactive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderRadius: BorderRadius.full,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.dark.backgroundRoot,
  },
});

const cc = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  cardInner: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  shareableCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
    backgroundColor: "#1A1A2E",
    borderRadius: BorderRadius.lg,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  bigNumber: {
    fontSize: 72,
    fontWeight: "900",
    color: Colors.dark.text,
    letterSpacing: -2,
    lineHeight: 80,
  },
  bigLabel: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    lineHeight: 28,
  },
  subLabel: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: SCREEN_WIDTH - 80,
  },
  statBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  statBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  progressTrack: {
    width: SCREEN_WIDTH - 80,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  aiMessage: {
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 25,
    fontStyle: "italic",
    maxWidth: SCREEN_WIDTH - 80,
  },
  brandingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: Spacing.sm,
  },
  brandingText: {
    fontSize: 11,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 1,
  },
});

const u = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  lockIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(200,255,61,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(200,255,61,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 21,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.dark.backgroundRoot,
  },
});
