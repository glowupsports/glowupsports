import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Share,
  Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";

import { Spacing, BorderRadius, Backgrounds, TextColors, GlowColors } from "@/constants/theme";
import { apiRequest, buildPhotoUrl } from "@/lib/query-client";
import { openDirections } from "@/lib/maps";
import CoachRemindersCard from "@/player/components/CoachRemindersCard";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const BG = Backgrounds.root;
const CARD_BG = "#12151C";
const CARD_BORDER = "#1E2332";
const TEXT_PRIMARY = TextColors.primary;
const TEXT_SECONDARY = "#8A95A8";
const TEXT_MUTED = "#4A5568";
const ACCENT = GlowColors.primary;
const DANGER = "#FF5A5F";

interface Participant {
  id: string;
  name: string;
  profilePhotoUrl?: string | null;
  level?: number;
}

interface ClassSessionParam {
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
  locationAddress?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  participants?: Participant[];
  isEnrolled?: boolean;
  price?: number;
  sport?: string;
  title?: string;
  description?: string;
  xpReward?: number;
  credits?: number;
  distanceKm?: number;
}

function getBallLevelColor(level?: string): string {
  const l = (level || "").toLowerCase();
  if (l.includes("blue")) return "#3B82F6";
  if (l.includes("red")) return "#EF4444";
  if (l.includes("orange")) return "#F97316";
  if (l.includes("green")) return "#22C55E";
  if (l.includes("yellow")) return "#EAB308";
  if (l.includes("glow")) return "#E040FB";
  return ACCENT;
}

function formatLongDate(dateStr?: string): string {
  if (!dateStr) return "TBD";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return "TBD";
  }
}

function formatTime(dateStr?: string, timeStr?: string): string {
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

export default function ClassDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const session: ClassSessionParam = route.params?.session || {};
  const [isWorking, setIsWorking] = useState(false);

  const levelColor = getBallLevelColor(session.ballLevel);
  const isFull = (session.spotsLeft ?? 0) === 0;
  const currentPlayers = (session.maxPlayers || 6) - (session.spotsLeft ?? 0);

  const typeLabel =
    session.type === "group"
      ? "Group Class"
      : session.type === "private"
      ? "Private"
      : session.type === "open_match"
      ? "Open Match"
      : "Session";

  const title =
    session.title ||
    (session.coachName ? `Class with ${session.coachName.split(" ")[0]}` : typeLabel);

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/play/sessions/${session.id}/join`);
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      Alert.alert("Booked", "You're in! See you on court.");
      navigation.goBack();
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", e?.message || "Failed to join class");
    },
    onSettled: () => setIsWorking(false),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/play/sessions/${session.id}/leave`);
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      Alert.alert("Cancelled", "Your spot has been released.");
      navigation.goBack();
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", e?.message || "Failed to cancel");
    },
    onSettled: () => setIsWorking(false),
  });

  const handleJoin = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsWorking(true);
    joinMutation.mutate();
  }, [joinMutation]);

  const handleCancel = useCallback(() => {
    Alert.alert(
      "Cancel class",
      "Release your spot in this class?",
      [
        { text: "Keep spot", style: "cancel" },
        {
          text: "Cancel",
          style: "destructive",
          onPress: () => {
            setIsWorking(true);
            cancelMutation.mutate();
          },
        },
      ],
    );
  }, [cancelMutation]);

  const handleShare = useCallback(async () => {
    try {
      Haptics.selectionAsync().catch(() => {});
      const domain = process.env.EXPO_PUBLIC_DOMAIN || "https://glow.app";
      const link = `${domain.replace(/\/$/, "")}/class/${session.id}`;
      const message =
        `Join me at ${title}` +
        (session.coachName ? ` with Coach ${session.coachName}` : "") +
        (session.date ? ` on ${formatLongDate(session.date)}` : "") +
        ` — ${link}`;
      await Share.share({
        message,
        url: Platform.OS === "ios" ? link : undefined,
        title,
      });
    } catch {}
  }, [session.id, session.coachName, session.date, title]);

  const goCoach = () => {
    if (session.coachId) navigation.navigate("CoachProfile", { coachId: session.coachId });
  };

  return (
    <View style={[styles.root, { backgroundColor: BG }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl + 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header banner with court tint */}
        <View style={[styles.banner, { backgroundColor: levelColor + "18", borderBottomColor: levelColor + "30" }]}>
          <View style={styles.bannerTopRow}>
            <View style={[styles.typeChip, { backgroundColor: levelColor + "22", borderColor: levelColor + "55" }]}>
              <Ionicons name={session.type === "group" ? "people" : "person"} size={12} color={levelColor} />
              <Text style={[styles.typeChipText, { color: levelColor }]}>{typeLabel}</Text>
            </View>
            {session.ballLevel ? (
              <View style={[styles.levelChip, { borderColor: levelColor + "60", backgroundColor: levelColor + "20" }]}>
                <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                <Text style={[styles.levelChipText, { color: levelColor }]}>
                  {session.ballLevel.charAt(0).toUpperCase() + session.ballLevel.slice(1)}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.title} numberOfLines={2}>{title}</Text>

          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={14} color={TEXT_SECONDARY} />
            <Text style={styles.metaText}>{formatLongDate(session.date)}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Ionicons name="time-outline" size={14} color={TEXT_SECONDARY} />
            <Text style={styles.metaText}>{formatTime(session.date, session.time)}</Text>
          </View>

          {session.isEnrolled ? (
            <View style={styles.youInBadge}>
              <Ionicons name="checkmark-circle" size={14} color={ACCENT} />
              <Text style={styles.youInText}>You're in</Text>
            </View>
          ) : null}
        </View>

        {/* Recent reminders from coach (only for enrolled players in series-backed classes) */}
        {session.isEnrolled && session.id ? (
          <View style={styles.section}>
            <CoachRemindersCard sessionId={session.id} />
          </View>
        ) : null}

        {/* Coach */}
        {session.coachName ? (
          <Pressable style={styles.section} onPress={goCoach}>
            <Text style={styles.sectionLabel}>Coach</Text>
            <View style={styles.coachRow}>
              {session.coachPhotoUrl ? (
                <ExpoImage
                  source={{ uri: buildPhotoUrl(session.coachPhotoUrl)! }}
                  style={styles.coachAvatar}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.coachAvatar, styles.coachAvatarPlaceholder]}>
                  <Text style={styles.coachAvatarInitial}>{session.coachName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.coachName}>{session.coachName}</Text>
                {session.sport ? (
                  <Text style={styles.coachSub}>{session.sport.charAt(0).toUpperCase() + session.sport.slice(1)} coach</Text>
                ) : null}
              </View>
              {session.coachId ? <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} /> : null}
            </View>
          </Pressable>
        ) : null}

        {/* Location */}
        {session.locationName ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Location</Text>
            <Pressable
              style={styles.locationCard}
              onPress={() =>
                openDirections({
                  lat: session.locationLat,
                  lng: session.locationLng,
                  label: session.locationName,
                  address: session.locationAddress ?? undefined,
                })
              }
            >
              <Ionicons name="location" size={20} color={ACCENT} />
              <View style={{ flex: 1 }}>
                <Text style={styles.locationName}>{session.locationName}</Text>
                {session.distanceKm != null ? (
                  <Text style={styles.locationSub}>{session.distanceKm}km away</Text>
                ) : null}
              </View>
              <View style={styles.directionsBtn}>
                <Ionicons name="navigate" size={14} color={BG} />
                <Text style={styles.directionsBtnText}>Directions</Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        {/* Participants */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            Participants {currentPlayers}/{session.maxPlayers || 6}
          </Text>
          <View style={styles.participantsRow}>
            {(session.participants || []).slice(0, 6).map((p, i) => (
              <View key={p.id} style={[styles.participantAvatar, { marginLeft: i > 0 ? -10 : 0, zIndex: 6 - i }]}>
                {p.profilePhotoUrl ? (
                  <ExpoImage source={{ uri: buildPhotoUrl(p.profilePhotoUrl)! }} style={styles.participantImage} contentFit="cover" />
                ) : (
                  <View style={styles.participantPlaceholder}>
                    <Text style={styles.participantInitial}>{p.name?.charAt(0)?.toUpperCase() || "?"}</Text>
                  </View>
                )}
              </View>
            ))}
            {(session.participants?.length || 0) === 0 ? (
              <Text style={styles.metaText}>No one signed up yet — be the first!</Text>
            ) : null}
            <View style={{ flex: 1 }} />
            {(session.spotsLeft ?? 0) > 0 ? (
              <View style={styles.spotsPill}>
                <Text style={styles.spotsPillText}>{session.spotsLeft} spots open</Text>
              </View>
            ) : (
              <View style={[styles.spotsPill, { backgroundColor: DANGER + "20", borderColor: DANGER + "55" }]}>
                <Text style={[styles.spotsPillText, { color: DANGER }]}>Full</Text>
              </View>
            )}
          </View>
        </View>

        {/* Description / notes */}
        {session.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About</Text>
            <Text style={styles.description}>{session.description}</Text>
          </View>
        ) : null}

        {/* Cost & XP */}
        <View style={styles.section}>
          <View style={styles.costRow}>
            {session.price != null || session.credits != null ? (
              <View style={styles.costItem}>
                <Ionicons name="card-outline" size={16} color={TEXT_SECONDARY} />
                <Text style={styles.costText}>
                  {session.credits != null
                    ? `${session.credits} credit${session.credits === 1 ? "" : "s"}`
                    : `AED ${session.price}`}
                </Text>
              </View>
            ) : null}
            {session.xpReward != null ? (
              <View style={styles.costItem}>
                <Ionicons name="flame" size={16} color="#FFA94D" />
                <Text style={styles.costText}>+{session.xpReward} XP</Text>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <Pressable
          style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.7 }]}
          onPress={handleShare}
        >
          <Ionicons name="share-outline" size={18} color={TEXT_PRIMARY} />
          <Text style={styles.shareBtnText}>Invite a friend</Text>
        </Pressable>

        {session.isEnrolled ? (
          <Pressable
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85 }]}
            onPress={handleCancel}
            disabled={isWorking}
          >
            {isWorking ? (
              <ActivityIndicator size="small" color={DANGER} />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={18} color={DANGER} />
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </>
            )}
          </Pressable>
        ) : isFull ? (
          <View style={[styles.primaryBtn, { backgroundColor: TEXT_MUTED }]}>
            <Text style={styles.primaryBtnText}>Full</Text>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={handleJoin}
            disabled={isWorking}
          >
            {isWorking ? (
              <ActivityIndicator size="small" color={BG} />
            ) : (
              <Text style={styles.primaryBtnText}>
                Join{session.price != null ? ` — AED ${session.price}` : ""}
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  root: { flex: 1 },
  banner: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bannerTopRow: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.md },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  levelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  levelChipText: { fontSize: 11, fontWeight: "700" },
  title: { fontSize: 24, fontWeight: "800", color: TEXT_PRIMARY, lineHeight: 30 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
    flexWrap: "wrap",
  },
  metaText: { fontSize: 13, color: TEXT_SECONDARY },
  metaDot: { color: TEXT_MUTED, fontSize: 13 },
  youInBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: ACCENT + "20",
    borderColor: ACCENT + "55",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: Spacing.md,
  },
  youInText: { color: ACCENT, fontWeight: "700", fontSize: 12 },

  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: TEXT_MUTED,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
  },

  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: CARD_BG,
    borderColor: CARD_BORDER,
    borderWidth: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  coachAvatar: { width: 48, height: 48, borderRadius: 24 },
  coachAvatarPlaceholder: {
    backgroundColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  coachAvatarInitial: { color: TEXT_PRIMARY, fontWeight: "700", fontSize: 18 },
  coachName: { fontSize: 15, fontWeight: "700", color: TEXT_PRIMARY },
  coachSub: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },

  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: CARD_BG,
    borderColor: CARD_BORDER,
    borderWidth: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  locationName: { fontSize: 14, fontWeight: "600", color: TEXT_PRIMARY },
  locationSub: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },
  directionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: ACCENT,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  directionsBtnText: { fontSize: 12, fontWeight: "700", color: BG },

  participantsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: CARD_BG,
    borderColor: CARD_BORDER,
    borderWidth: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  participantAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: CARD_BG, overflow: "hidden" },
  participantImage: { width: "100%", height: "100%" },
  participantPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  participantInitial: { color: TEXT_PRIMARY, fontWeight: "700", fontSize: 12 },
  spotsPill: {
    backgroundColor: ACCENT + "20",
    borderColor: ACCENT + "55",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  spotsPillText: { fontSize: 11, fontWeight: "700", color: ACCENT },

  description: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 20,
    backgroundColor: CARD_BG,
    borderColor: CARD_BORDER,
    borderWidth: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },

  costRow: { flexDirection: "row", gap: Spacing.lg },
  costItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  costText: { fontSize: 14, fontWeight: "600", color: TEXT_PRIMARY },

  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BG,
    borderTopColor: CARD_BORDER,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "center",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
  },
  shareBtnText: { fontSize: 13, fontWeight: "600", color: TEXT_PRIMARY },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: ACCENT,
  },
  primaryBtnText: { fontSize: 15, fontWeight: "700", color: BG },
  cancelBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: DANGER + "60",
    backgroundColor: DANGER + "12",
  },
  cancelBtnText: { fontSize: 15, fontWeight: "700", color: DANGER },
}));
