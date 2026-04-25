import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";

import { Spacing, BorderRadius, TextColors, GlowColors, Backgrounds, Colors } from "@/constants/theme";
import { apiRequest, buildPhotoUrl } from "@/lib/query-client";
import { BALL_LEVEL_ORDER, type BallLevelId } from "@shared/ballLevel";

import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";
import { useCategoryAccent } from "@/player/theme/useCategoryAccent";
// Theme tokens are read at render time (or inside `makeReactiveStyles`) so
// they flip when the player toggles Light/Dark. Do NOT capture them into
// module-level `const` values — that freezes them at import.
const ACCENT = GlowColors.primary; // brand accent — same in both modes

interface Participant {
  id: string;
  name: string;
  profilePhotoUrl?: string | null;
  level?: number;
}

export interface OpenLessonSession {
  id: string;
  type: string;
  date?: string;
  time?: string;
  spotsLeft: number;
  maxPlayers: number;
  coachName?: string;
  coachId?: string;
  coachPhotoUrl?: string | null;
  ballLevel?: string;
  locationName?: string;
  locationLat?: number | null;
  locationLng?: number | null;
  participants?: Participant[];
  isEnrolled?: boolean;
  price?: number;
  sport?: string;
  title?: string;
  distanceKm?: number;
}

function getCourtTint(level?: string): string {
  const l = (level || "").toLowerCase();
  if (l.includes("blue")) return "#3B82F6";
  if (l.includes("red")) return "#EF4444";
  if (l.includes("orange")) return "#F97316";
  if (l.includes("green")) return "#22C55E";
  if (l.includes("yellow")) return "#EAB308";
  if (l.includes("glow")) return "#E040FB";
  return ACCENT;
}

function getRelativeLevelLabel(
  cardLevel: string | undefined,
  originalLevel: string | undefined,
): string | null {
  if (!cardLevel || !originalLevel) return null;
  const ci = BALL_LEVEL_ORDER.indexOf(cardLevel.toLowerCase() as BallLevelId);
  const oi = BALL_LEVEL_ORDER.indexOf(originalLevel.toLowerCase() as BallLevelId);
  if (ci < 0 || oi < 0) return null;
  const diff = ci - oi;
  if (diff === 0) return "Your level";
  if (diff === 1) return "1 above your level";
  if (diff === -1) return "1 below your level";
  return null;
}

function formatCountdown(dateStr?: string): string | null {
  if (!dateStr) return null;
  const now = Date.now();
  const target = new Date(dateStr).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - now;
  if (diff < 0) return null;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatTimeStr(dateStr?: string, timeStr?: string): string {
  if (timeStr && timeStr !== "TBD") return timeStr;
  if (!dateStr) return "TBD";
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-GB", {
      timeZone: "Asia/Dubai",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "TBD";
  }
}

function formatDayLabel(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (dDay.getTime() - today.getTime()) / 86400000;
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function LessonCard({
  session,
  width,
  onJoin,
  isJoining,
  onTap,
  relativeLevelLabel,
}: {
  session: OpenLessonSession;
  width: number;
  onJoin: (s: OpenLessonSession) => void;
  isJoining: boolean;
  onTap: (s: OpenLessonSession) => void;
  relativeLevelLabel?: string | null;
}) {
  const tint = getCourtTint(session.ballLevel);
  const brandAccent = useCategoryAccent("glowLessons", ACCENT);
  const filled = (session.participants || []).slice(0, session.maxPlayers);
  const emptyCount = Math.max(0, session.maxPlayers - filled.length);
  const showAvatars = session.maxPlayers > 0 && session.maxPlayers <= 8;
  const countdown = session.isEnrolled ? formatCountdown(session.date) : null;
  const dayLabel = formatDayLabel(session.date);
  const timeLabel = formatTimeStr(session.date, session.time);
  const isFull = session.spotsLeft === 0;
  const title =
    session.title ||
    (session.coachName ? `Class with ${session.coachName.split(" ")[0]}` : "Group Class");

  return (
    <View style={{ width, paddingHorizontal: Spacing.xs }}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { borderColor: tint + "55" },
          pressed && { opacity: 0.95 },
        ]}
        onPress={() => onTap(session)}
      >
        {/* Top row: badges */}
        <View style={styles.topRow}>
          <View style={[styles.typeChip, { backgroundColor: tint + "22", borderColor: tint + "55" }]}>
            <Ionicons name="people" size={10} color={tint} />
            <Text style={[styles.typeChipText, { color: tint }]}>GROUP</Text>
          </View>
          {session.ballLevel ? (
            <View style={[styles.levelChip, { borderColor: tint + "55" }]}>
              <View style={[styles.levelDot, { backgroundColor: tint }]} />
              <Text style={[styles.levelChipText, { color: tint }]}>
                {session.ballLevel.charAt(0).toUpperCase() + session.ballLevel.slice(1)}
              </Text>
            </View>
          ) : null}
          {relativeLevelLabel ? (
            <View
              style={[
                styles.relLevelChip,
                relativeLevelLabel === "Your level"
                  ? { backgroundColor: brandAccent + "20", borderColor: brandAccent + "55" }
                  : { backgroundColor: Colors.dark.chipBackgroundStrong, borderColor: Colors.dark.chipBackgroundStrong },
              ]}
            >
              <Text
                style={[
                  styles.relLevelChipText,
                  { color: relativeLevelLabel === "Your level" ? brandAccent : Colors.dark.text },
                ]}
              >
                {relativeLevelLabel}
              </Text>
            </View>
          ) : null}
          {session.isEnrolled ? (
            <View style={[styles.youInBadge, { backgroundColor: brandAccent + "20", borderColor: brandAccent + "55" }]}>
              <Ionicons name="checkmark-circle" size={11} color={brandAccent} />
              <Text style={[styles.youInText, { color: brandAccent }]}>You&apos;re in</Text>
            </View>
          ) : null}
        </View>

        {/* Body: avatar left, info right */}
        <View style={styles.body}>
          <View style={styles.avatarWrap}>
            {session.coachPhotoUrl ? (
              <ExpoImage
                source={{ uri: buildPhotoUrl(session.coachPhotoUrl)! }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, { borderColor: tint + "55" }]}>
                <Text style={styles.avatarInitial}>{(session.coachName || "?").charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {session.coachName ? (
              <Text style={styles.coach} numberOfLines={1}>with {session.coachName}</Text>
            ) : null}
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={11} color={Colors.dark.textSecondary} />
              <Text style={styles.metaText}>{dayLabel ? `${dayLabel} · ` : ""}{timeLabel}</Text>
              {countdown ? (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={[styles.metaText, { color: tint, fontWeight: "700" }]}>in {countdown}</Text>
                </>
              ) : null}
            </View>
            {session.locationName ? (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={11} color={Colors.dark.textSecondary} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {session.distanceKm != null ? `${session.distanceKm}km · ` : ""}
                  {session.locationName}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Participant avatar row — visualize filled vs empty slots */}
        {showAvatars ? (
          <View style={styles.participantsRow}>
            {filled.map((p) => (
              <View key={`p-${p.id}`} style={[styles.participantSlot, { borderColor: tint + "55" }]}>
                {p.profilePhotoUrl ? (
                  <ExpoImage
                    source={{ uri: buildPhotoUrl(p.profilePhotoUrl)! }}
                    style={styles.participantAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.participantAvatar, styles.participantPlaceholder]}>
                    <Text style={styles.participantInitial}>{(p.name || "?").charAt(0).toUpperCase()}</Text>
                  </View>
                )}
              </View>
            ))}
            {Array.from({ length: emptyCount }).map((_, i) => (
              <View
                key={`empty-${i}`}
                style={[styles.participantSlot, styles.participantEmpty, { borderColor: tint + "55" }]}
              >
                <Ionicons name="add" size={12} color={tint} />
              </View>
            ))}
          </View>
        ) : null}

        {/* Bottom: spots pill + CTA */}
        <View style={styles.bottomRow}>
          {isFull ? (
            <View style={[styles.spotsPill, { backgroundColor: "#FF5A5F22", borderColor: "#FF5A5F55" }]}>
              <Text style={[styles.spotsPillText, { color: "#FF5A5F" }]}>Full</Text>
            </View>
          ) : (
            <View style={[styles.spotsPill, { backgroundColor: tint + "1F", borderColor: tint + "55" }]}>
              <Text style={[styles.spotsPillText, { color: tint }]}>
                {session.spotsLeft} spot{session.spotsLeft === 1 ? "" : "s"} left
              </Text>
            </View>
          )}

          {session.isEnrolled ? (
            <Pressable
              style={({ pressed }) => [styles.viewBtn, pressed && { opacity: 0.8 }]}
              onPress={() => onTap(session)}
            >
              <Text style={styles.viewBtnText}>View</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.dark.text} />
            </Pressable>
          ) : isFull ? (
            <Pressable
              style={({ pressed }) => [styles.viewBtn, pressed && { opacity: 0.8 }]}
              onPress={() => onTap(session)}
            >
              <Text style={styles.viewBtnText}>Details</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.joinBtn, { backgroundColor: brandAccent }, pressed && { opacity: 0.85 }]}
              onPress={(e) => {
                onJoin(session);
              }}
              disabled={isJoining}
            >
              {isJoining ? (
                <ActivityIndicator size="small" color={Backgrounds.root} />
              ) : (
                <Text style={styles.joinBtnText}>
                  Join{session.price != null ? ` · AED ${session.price}` : ""}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </Pressable>
    </View>
  );
}

interface GlowLessonsStackProps {
  // If provided, the parent has an enrolled next-session — used to ensure it's surfaced first.
  enrolledSessionId?: string | null;
  fallback?: React.ReactNode;
  accent?: string;
  // When rendered inside the HeroCarousel, disable inner horizontal paging so
  // the outer carousel pan-gesture wins for any horizontal swipe. Inner taps
  // (Join, tap-to-open) still work; users can browse the full list via the
  // "View All" jump pill on the lens header.
  inCarousel?: boolean;
}

export function GlowLessonsStack({ enrolledSessionId, fallback, accent, inCarousel }: GlowLessonsStackProps) {
  useThemeReactivity();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const listRef = useRef<FlatList<OpenLessonSession>>(null);

  // The home GLOW LESSONS carousel opts into the server's adjacent-level
  // fallback. The query string is kept inside the queryKey's single string
  // element so the default queryFn (which joins the key into a URL) hits
  // `/api/player/me/social?levelFallback=adjacent` and we still benefit from
  // the shared 401/refresh handling. We mirror PlayerStateContext's
  // refetchInterval so this feed stays in sync with the rest of the home.
  const { data } = useQuery<{
    openSessions: OpenLessonSession[];
    groupLevelFallback?: { used: boolean; originalLevel: string; levels: string[] };
  }>({
    queryKey: ["/api/player/me/social?levelFallback=adjacent"],
    refetchInterval: 30000,
  });

  const groupLevelFallback = data?.groupLevelFallback;

  const groupSessions = useMemo<OpenLessonSession[]>(() => {
    const all = (data?.openSessions || []).filter((s) => s.type === "group");
    // Sort: enrolled session first, then by time ascending
    return [...all].sort((a, b) => {
      if (a.isEnrolled && !b.isEnrolled) return -1;
      if (!a.isEnrolled && b.isEnrolled) return 1;
      const ta = a.date ? new Date(a.date).getTime() : Infinity;
      const tb = b.date ? new Date(b.date).getTime() : Infinity;
      return ta - tb;
    });
  }, [data?.openSessions]);

  const joinMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("POST", `/api/play/sessions/${sessionId}/join`);
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social?levelFallback=adjacent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => setJoiningId(null),
  });

  const handleJoin = useCallback(
    (s: OpenLessonSession) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setJoiningId(s.id);
      joinMutation.mutate(s.id);
    },
    [joinMutation],
  );

  const handleTap = useCallback(
    (s: OpenLessonSession) => {
      navigation.navigate("ClassDetail", { session: s });
    },
    [navigation],
  );

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== activeIndex) {
      setActiveIndex(idx);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const tint = accent || ACCENT;

  if (groupSessions.length === 0) {
    if (fallback) return <>{fallback}</>;
    return (
      <View style={styles.root}>
        <View style={[styles.emptyCard, { borderColor: tint + "55", backgroundColor: Backgrounds.card }]}>
          <View style={[styles.emptyIconWrap, { backgroundColor: tint + "22", borderColor: tint + "55" }]}>
            <Ionicons name="people-outline" size={28} color={tint} />
          </View>
          <Text style={styles.emptyTitle}>No open group lessons</Text>
          <Text style={styles.emptySubtitle}>
            New classes drop daily — browse upcoming group sessions and grab a spot.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.emptyCta,
              { backgroundColor: tint },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              navigation.navigate("ClassesDiscovery");
            }}
          >
            <Text style={styles.emptyCtaText}>Browse Classes</Text>
            <Ionicons name="arrow-forward" size={14} color={Backgrounds.root} />
          </Pressable>
        </View>
      </View>
    );
  }

  const fallbackLabel = groupLevelFallback?.used
    ? `No ${groupLevelFallback.originalLevel.charAt(0).toUpperCase() + groupLevelFallback.originalLevel.slice(1)} classes — showing nearby levels`
    : null;

  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && w !== width) setWidth(w);
      }}
    >
      {fallbackLabel ? (
        <View style={styles.fallbackLabelRow}>
          <Ionicons name="information-circle-outline" size={12} color={Colors.dark.textSecondary} />
          <Text style={styles.fallbackLabelText} numberOfLines={1}>{fallbackLabel}</Text>
        </View>
      ) : null}
      {width > 0 ? (
        inCarousel ? (
          // Inside the HeroCarousel we surface only the first/enrolled lesson
          // and let the outer pan-gesture own all horizontal swipes. Taps on
          // Join / the card still work; the lens header's "View All" pill
          // navigates to the full Classes Discovery screen.
          <View style={{ width }}>
            <LessonCard
              session={groupSessions[0]}
              width={width}
              onJoin={handleJoin}
              isJoining={joiningId === groupSessions[0].id}
              onTap={handleTap}
              relativeLevelLabel={
                groupLevelFallback?.used
                  ? getRelativeLevelLabel(groupSessions[0].ballLevel, groupLevelFallback.originalLevel)
                  : null
              }
            />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={groupSessions}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(s) => s.id}
            renderItem={({ item }) => (
              <LessonCard
                session={item}
                width={width}
                onJoin={handleJoin}
                isJoining={joiningId === item.id}
                onTap={handleTap}
                relativeLevelLabel={
                  groupLevelFallback?.used
                    ? getRelativeLevelLabel(item.ballLevel, groupLevelFallback.originalLevel)
                    : null
                }
              />
            )}
            onMomentumScrollEnd={handleMomentumEnd}
            getItemLayout={(_, idx) => ({ length: width, offset: width * idx, index: idx })}
            decelerationRate="fast"
            snapToInterval={width}
          />
        )
      ) : null}

      {!inCarousel && groupSessions.length > 1 ? (
        <View style={styles.dotsRow}>
          {groupSessions.map((s, i) => {
            const active = i === activeIndex;
            return (
              <View
                key={s.id}
                style={[
                  styles.dot,
                  {
                    width: active ? 16 : 5,
                    backgroundColor: active ? tint : Colors.dark.chipBackgroundStrong,
                  },
                ]}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  root: { flex: 1, justifyContent: "center" },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    backgroundColor: Backgrounds.root,
    minHeight: 200,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  levelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  levelDot: { width: 5, height: 5, borderRadius: 3 },
  levelChipText: { fontSize: 10, fontWeight: "700" },
  relLevelChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  relLevelChipText: { fontSize: 10, fontWeight: "700" },
  youInBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: ACCENT + "20",
    borderColor: ACCENT + "55",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  youInText: { color: ACCENT, fontWeight: "800", fontSize: 10 },

  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  avatarWrap: { width: 56, height: 56 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: {
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: Colors.dark.text, fontSize: 22, fontWeight: "800" },
  info: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
  coach: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  metaText: { fontSize: 11, color: Colors.dark.textSecondary, flexShrink: 1 },
  metaDot: { color: Colors.dark.textMuted, fontSize: 11 },

  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  spotsPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  spotsPillText: { fontSize: 11, fontWeight: "700" },
  joinBtn: {
    backgroundColor: ACCENT,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    minWidth: 90,
    alignItems: "center",
  },
  joinBtnText: { fontSize: 13, fontWeight: "800", color: Backgrounds.root },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderColor: Colors.dark.chipBackgroundStrong,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  viewBtnText: { fontSize: 13, fontWeight: "700", color: Colors.dark.text },

  participantsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    flexWrap: "wrap",
  },
  participantSlot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    overflow: "hidden",
    marginRight: -8,
    backgroundColor: Backgrounds.root,
    alignItems: "center",
    justifyContent: "center",
  },
  participantAvatar: { width: 24, height: 24, borderRadius: 12 },
  participantPlaceholder: {
    backgroundColor: Colors.dark.chipBackgroundStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  participantInitial: { color: Colors.dark.text, fontSize: 10, fontWeight: "800" },
  participantEmpty: {
    backgroundColor: "transparent",
    borderStyle: "dashed",
  },

  emptyCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.text,
    marginBottom: 4,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  emptyCtaText: {
    fontSize: 13,
    fontWeight: "800",
    color: Backgrounds.root,
  },

  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: Spacing.sm,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
  fallbackLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  fallbackLabelText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    flexShrink: 1,
  },
}));
