import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Modal,
  Platform,
  TextInput,
  Share,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, { FadeInUp, FadeInRight, ZoomIn } from "react-native-reanimated";
import { Colors, Spacing, FontSizes, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { useFamily, FamilyMember } from "@/player/context/FamilyContext";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getStaticAssetsUrl, getApiUrl } from "@/lib/query-client";
import { getAuthToken, secureSet, clearAuthState } from "@/lib/auth";
import CreateFamilyMemberFlow from "@/player/components/CreateFamilyMemberFlow";
import GraduationFlow from "@/player/components/GraduationFlow";
import { PinPadModal } from "@/components/PinPadModal";
import { PinRecoveryModal } from "@/components/PinRecoveryModal";
import { LockAccountModal } from "@/player/components/LockAccountModal";
import { callFamilySwitch, applySwitchResult } from "@/lib/familySwitch";
import { reloadAppAsync } from "expo";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
// Retained as a transient reboot-redirect signal. The legacy "view as" banner
// has been removed but a few code paths still want to know "the user just
// switched accounts" during the reboot window, so we keep the storage key.
export const FAMILY_SWITCH_KEY = "family_switch";

function parseApiError(error: any, fallback: string): string {
  const raw: string = error?.message || "";
  const colonIdx = raw.indexOf(":");
  if (colonIdx !== -1) {
    try {
      const jsonPart = raw.substring(colonIdx + 1).trim();
      const parsed = JSON.parse(jsonPart);
      if (parsed?.error) return parsed.error;
    } catch {
    }
  }
  return raw || fallback;
}

function getBallColor(ball: string | null): string {
  switch (ball?.toLowerCase()) {
    case "green": return "#2ECC40";
    case "yellow": return "#FFDC00";
    case "orange": return "#FF851B";
    case "red": return "#FF4136";
    case "glow": return "#E040FB";
    default: return Colors.dark.textMuted;
  }
}

function formatNextSession(session: { date: string; type: string } | null): string {
  if (!session) return "No upcoming sessions";
  
  const date = new Date(session.date);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays === 0) {
    if (diffHours <= 0) return "Session now!";
    return `Today ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else if (diffDays === 1) {
    return `Tomorrow ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    return date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  }
}

function formatLastActive(lastActiveAt: string | null): string {
  if (!lastActiveAt) return "";
  
  const date = new Date(lastActiveAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMinutes < 5) return "Online now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// ---------------------------------------------------------------------------
// Smart Family Lobby — types + helpers shared by ChildCard, the Family Today
// strip, and the Carpool card. The shapes mirror the GET /api/family/me/today
// payload exactly; do NOT broaden them locally — extend the server interface
// instead so client/server stay in lockstep.
// ---------------------------------------------------------------------------

interface TodayMemberSession {
  id: string;
  startTime: string;
  endTime: string;
  status: string | null;
  sessionType: string | null;
  title: string | null;
  locationId: string | null;
  locationName: string | null;
  courtId: string | null;
  courtName: string | null;
  coachName: string | null;
}

interface TodayMemberInfo {
  playerId: string;
  name: string;
  isSelf: boolean;
  lastActiveAt: string | null;
  birthdayInDays: number | null;
  streakWeeks: number;
  rsvpPendingCount: number;
  openMatchInviteCount: number;
  upcomingSessions: TodayMemberSession[];
}

interface TodayStripRow {
  sessionId: string;
  playerId: string;
  playerName: string;
  startTime: string;
  endTime: string;
  locationName: string | null;
  courtName: string | null;
  coachName: string | null;
  sessionType: string | null;
  title: string | null;
}

interface CarpoolPair {
  locationId: string | null;
  locationName: string | null;
  courtName: string | null;
  members: {
    playerId: string;
    name: string;
    startTime: string;
    endTime: string;
    sessionId: string;
  }[];
  summary: string;
}

interface TodayPayload {
  familyGroupId: string;
  generatedAt: string;
  members: TodayMemberInfo[];
  todayStrip: TodayStripRow[];
  carpoolPairs: CarpoolPair[];
}

interface Chip {
  kind: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

function formatSessionTimeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Build up to two chips for a member card. Order matters — the highest-signal
// chip wins when more than two qualify (Lesson today > Match tomorrow > RSVP
// > Open match invite > Streak > Birthday).
function buildChipsFor(info: TodayMemberInfo | undefined): Chip[] {
  if (!info) return [];
  const chips: Chip[] = [];
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const todaySession = info.upcomingSessions.find((s) => isSameDay(new Date(s.startTime), now));
  const tomorrowSession = info.upcomingSessions.find((s) => isSameDay(new Date(s.startTime), tomorrow));

  if (todaySession) {
    const isMatch = (todaySession.sessionType ?? "").toLowerCase().includes("match");
    chips.push({
      kind: "today_session",
      label: `${isMatch ? "Match" : "Lesson"} today ${formatSessionTimeShort(todaySession.startTime)}`,
      icon: isMatch ? "trophy" : "school",
      color: "#2ECC40",
    });
  } else if (tomorrowSession) {
    const isMatch = (tomorrowSession.sessionType ?? "").toLowerCase().includes("match");
    chips.push({
      kind: "tomorrow_session",
      label: `${isMatch ? "Match" : "Lesson"} tomorrow`,
      icon: isMatch ? "trophy" : "calendar",
      color: "#00BCD4",
    });
  }

  if (chips.length < 2 && info.rsvpPendingCount > 0) {
    chips.push({
      kind: "rsvp",
      label: info.rsvpPendingCount > 1 ? `${info.rsvpPendingCount} RSVPs needed` : "RSVP needed",
      icon: "mail-unread",
      color: "#FF851B",
    });
  }

  if (chips.length < 2 && info.openMatchInviteCount > 0) {
    chips.push({
      kind: "open_match",
      label: info.openMatchInviteCount > 1 ? `${info.openMatchInviteCount} open matches` : "Open match invite",
      icon: "tennisball",
      color: "#E040FB",
    });
  }

  if (chips.length < 2 && info.streakWeeks >= 3) {
    chips.push({
      kind: "streak",
      label: `Streak ${info.streakWeeks} wk`,
      icon: "flame",
      color: "#FF4136",
    });
  }

  if (chips.length < 2 && info.birthdayInDays !== null && info.birthdayInDays >= 0 && info.birthdayInDays <= 7) {
    chips.push({
      kind: "birthday",
      label:
        info.birthdayInDays === 0
          ? "Birthday today"
          : info.birthdayInDays === 1
            ? "Birthday tomorrow"
            : `Birthday in ${info.birthdayInDays}d`,
      icon: "gift",
      color: "#FFDC00",
    });
  }

  return chips.slice(0, 2);
}

// Avatar ring color: gold when an in-progress session covers "now", green
// when something is scheduled today, gray when the player has been idle for 7+
// days, and the default primary blue otherwise.
function ringColorFor(info: TodayMemberInfo | undefined): string {
  if (!info) return Colors.dark.primary;
  const now = new Date();
  const playing = info.upcomingSessions.some((s) => {
    const start = new Date(s.startTime).getTime();
    const end = new Date(s.endTime).getTime();
    return start <= now.getTime() && end >= now.getTime();
  });
  if (playing) return "#FFD700"; // gold
  const today = info.upcomingSessions.some((s) => isSameDay(new Date(s.startTime), now));
  if (today) return "#2ECC40"; // green
  if (info.lastActiveAt) {
    const ageMs = now.getTime() - new Date(info.lastActiveAt).getTime();
    if (ageMs > 7 * 24 * 60 * 60 * 1000) return Colors.dark.textMuted; // gray
  } else {
    return Colors.dark.textMuted; // never active → gray
  }
  return Colors.dark.primary;
}

// Sort priority: self first, then anyone with a session today, then session
// in next 48h, then a streak ≥3, then most recently active.
function compareMembers(
  a: FamilyMember,
  b: FamilyMember,
  todayByPlayer: Map<string, TodayMemberInfo>,
  callerPlayerId: string | null,
): number {
  const aSelf = a.id === callerPlayerId ? 1 : 0;
  const bSelf = b.id === callerPlayerId ? 1 : 0;
  if (aSelf !== bSelf) return bSelf - aSelf;

  const ai = todayByPlayer.get(a.id);
  const bi = todayByPlayer.get(b.id);
  const now = new Date();

  const aToday = ai?.upcomingSessions.some((s) => isSameDay(new Date(s.startTime), now)) ? 1 : 0;
  const bToday = bi?.upcomingSessions.some((s) => isSameDay(new Date(s.startTime), now)) ? 1 : 0;
  if (aToday !== bToday) return bToday - aToday;

  const aSoon = ai && ai.upcomingSessions.length > 0 ? 1 : 0;
  const bSoon = bi && bi.upcomingSessions.length > 0 ? 1 : 0;
  if (aSoon !== bSoon) return bSoon - aSoon;

  const aStreak = (ai?.streakWeeks ?? 0) >= 3 ? 1 : 0;
  const bStreak = (bi?.streakWeeks ?? 0) >= 3 ? 1 : 0;
  if (aStreak !== bStreak) return bStreak - aStreak;

  const aLast = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
  const bLast = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
  return bLast - aLast;
}

interface ChildCardProps {
  member: FamilyMember;
  todayInfo?: TodayMemberInfo;
  onPress: () => void;
  onLongPress?: () => void;
  lockedUntil?: string | null;
  index: number;
  // Family G — Task #1138 — graduation entry-point (banner + button).
  onGraduate?: (member: FamilyMember) => void;
}

function formatLockBadge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const until = new Date(iso);
  if (Number.isNaN(until.getTime())) return null;
  const ms = until.getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const sameDay = until.toDateString() === new Date().toDateString();
  const timeStr = until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Until ${timeStr}`;
  return `Until ${until.toLocaleDateString([], { weekday: "short" })} ${timeStr}`;
}

function ChildCard({ member, todayInfo, onPress, onLongPress, lockedUntil, index, onGraduate }: ChildCardProps) {
  const lockBadge = formatLockBadge(lockedUntil);
  const hasOutstanding = member.outstandingBalance > 0;
  const lastActiveText = formatLastActive(member.lastActiveAt);
  const chips = buildChipsFor(todayInfo);
  const ringColor = ringColorFor(todayInfo);

  return (
    <Animated.View entering={FadeInRight.delay(index * 100).duration(400)}>
      <Pressable
        style={styles.childCard}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`Open player profile for ${member.name}`}
      >
        <LinearGradient
          colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault]}
          style={styles.cardGradient}
        >
          {lockBadge ? (
            <View style={lockedBadgeStyles.wrap}>
              <Ionicons name="lock-closed" size={12} color="#FF4136" />
              <Text style={lockedBadgeStyles.text}>{lockBadge}</Text>
            </View>
          ) : null}
          <View style={styles.avatarContainer}>
            {member.avatarUrl ? (
              <Image
                source={{ uri: `${getStaticAssetsUrl()}${member.avatarUrl}` }}
                style={[styles.avatar, { borderColor: ringColor }]}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, { borderColor: ringColor }]}>
                <Ionicons name="person" size={32} color={Colors.dark.textMuted} />
              </View>
            )}
            <View style={[styles.ballBadge, { backgroundColor: getBallColor(member.ballLevel) }]}>
              <Ionicons name="tennisball" size={12} color={Colors.dark.buttonText} />
            </View>
            {lastActiveText === "Online now" ? (
              <View style={styles.onlineIndicator} />
            ) : null}
          </View>

          <Text style={styles.childName} numberOfLines={1}>{member.name}</Text>

          {member.graduated ? (
            <View style={styles.graduatedBadge}>
              <Ionicons name="school" size={12} color="#00E676" />
              <Text style={styles.graduatedBadgeText}>Graduated</Text>
            </View>
          ) : member.daysUntilEighteen != null &&
            member.daysUntilEighteen <= 30 &&
            member.daysUntilEighteen >= 0 &&
            onGraduate ? (
            <Pressable
              style={styles.graduateBanner}
              onPress={(e) => {
                e.stopPropagation?.();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onGraduate(member);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Start graduation for ${member.name}`}
            >
              <Ionicons name="school-outline" size={12} color={Colors.dark.gold} />
              <Text style={styles.graduateBannerText}>
                {member.daysUntilEighteen === 0
                  ? "Turns 18 today — Graduate"
                  : `Turns 18 in ${member.daysUntilEighteen}d — Graduate`}
              </Text>
            </Pressable>
          ) : null}

          {member.ballLevel ? (
            <View style={[styles.ballLevelTextBadge, { backgroundColor: getBallColor(member.ballLevel) + "25" }]}>
              <Ionicons name="tennisball" size={12} color={getBallColor(member.ballLevel)} />
              <Text style={[styles.ballLevelTextLabel, { color: getBallColor(member.ballLevel) }]}>
                {member.ballLevel.charAt(0).toUpperCase() + member.ballLevel.slice(1)} Ball
              </Text>
            </View>
          ) : null}

          <View style={styles.levelRow}>
            <View style={styles.levelBadge}>
              <Ionicons name="star" size={14} color={Colors.dark.gold} />
              <Text style={styles.levelText}>Level {member.level}</Text>
            </View>
          </View>

          <View style={styles.xpRow}>
            <Ionicons name="flash" size={14} color={Colors.dark.primary} />
            <Text style={styles.xpText}>{member.xp.toLocaleString()} XP</Text>
          </View>

          <View style={styles.sessionRow}>
            <Ionicons 
              name="calendar" 
              size={12} 
              color={Colors.dark.textSecondary} 
            />
            <Text style={styles.sessionText}>{formatNextSession(member.nextSession)}</Text>
          </View>

          {lastActiveText && lastActiveText !== "Online now" ? (
            <Text style={styles.lastActiveText}>{lastActiveText}</Text>
          ) : null}

          {hasOutstanding ? (
            <View style={styles.outstandingBadge}>
              <Ionicons name="alert-circle" size={12} color={Colors.dark.gold} />
              <Text style={styles.outstandingText}>
                {member.outstandingBalance.toFixed(2)} open
              </Text>
            </View>
          ) : null}

          {chips.length > 0 ? (
            <View style={styles.chipRow}>
              {chips.map((c) => (
                <View
                  key={c.kind}
                  style={[styles.chip, { backgroundColor: c.color + "22", borderColor: c.color + "55" }]}
                >
                  <Ionicons name={c.icon} size={11} color={c.color} />
                  <Text style={[styles.chipText, { color: c.color }]} numberOfLines={1}>
                    {c.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.diveInButton}>
            <Text style={styles.diveInText}>Dive In</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.dark.primary} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function ParentalControlsCard({ member, onToggle }: { member: FamilyMember; onToggle: (field: "chatEnabled" | "communityEnabled", value: boolean) => void }) {
  return (
    <View style={styles.controlCard}>
      <View style={styles.controlHeader}>
        {member.avatarUrl ? (
          <Image
            source={{ uri: `${getStaticAssetsUrl()}${member.avatarUrl}` }}
            style={styles.controlAvatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.controlAvatar, styles.controlAvatarPlaceholder]}>
            <Ionicons name="person" size={16} color={Colors.dark.textMuted} />
          </View>
        )}
        <Text style={styles.controlName}>{member.name}</Text>
      </View>
      <View style={styles.controlRow}>
        <View style={styles.controlLabelRow}>
          <Ionicons name="chatbubbles-outline" size={18} color="#00BCD4" />
          <Text style={styles.controlLabel}>Player-to-Player Chat</Text>
        </View>
        <Switch
          value={member.chatEnabled ?? false}
          onValueChange={(val) => onToggle("chatEnabled", val)}
          trackColor={{ false: Colors.dark.backgroundSecondary, true: "#00E676" + "60" }}
          thumbColor={member.chatEnabled ? "#00E676" : Colors.dark.textMuted}
          accessibilityRole="switch"
          accessibilityLabel={`Toggle player-to-player chat for ${member.name}`}
        />
      </View>
      <View style={styles.controlRow}>
        <View style={styles.controlLabelRow}>
          <Ionicons name="people-outline" size={18} color="#00BCD4" />
          <Text style={styles.controlLabel}>Community Posting</Text>
        </View>
        <Switch
          value={member.communityEnabled ?? false}
          onValueChange={(val) => onToggle("communityEnabled", val)}
          trackColor={{ false: Colors.dark.backgroundSecondary, true: "#00E676" + "60" }}
          thumbColor={member.communityEnabled ? "#00E676" : Colors.dark.textMuted}
          accessibilityRole="switch"
          accessibilityLabel={`Toggle community posting for ${member.name}`}
        />
      </View>
    </View>
  );
}

// Family Today strip: a horizontal list of every family member's session
// today (chronological). Hidden when the family has zero today-sessions.
function FamilyTodayStrip({ rows }: { rows: TodayStripRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Animated.View entering={FadeInUp.duration(400)} style={styles.familyTodayWrap}>
      <View style={styles.familyTodayHeader}>
        <Ionicons name="today" size={16} color={Colors.dark.text} />
        <Text style={styles.familyTodayTitle}>Family Today</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.familyTodayContent}
      >
        {rows.map((r) => {
          const isMatch = (r.sessionType ?? "").toLowerCase().includes("match");
          const accent = isMatch ? "#E040FB" : "#00BCD4";
          return (
            <View key={`${r.sessionId}-${r.playerId}`} style={[styles.todayChip, { borderColor: accent + "55" }]}>
              <View style={[styles.todayChipDot, { backgroundColor: accent }]} />
              <Text style={styles.todayChipName} numberOfLines={1}>
                {r.playerName}
              </Text>
              <Text style={styles.todayChipTime} numberOfLines={1}>
                {formatSessionTimeShort(r.startTime)}
                {r.courtName ? ` · ${r.courtName}` : r.locationName ? ` · ${r.locationName}` : ""}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

// Carpool suggestion card: surfaces co-located family sessions with start
// times within 60 min of each other so a parent can plan a single trip.
function CarpoolCard({ pair }: { pair: CarpoolPair }) {
  return (
    <Animated.View entering={FadeInUp.duration(400)} style={styles.carpoolCard}>
      <View style={styles.carpoolHeader}>
        <Ionicons name="car-sport" size={18} color="#00BCD4" />
        <Text style={styles.carpoolTitle}>Carpool suggestion</Text>
      </View>
      <Text style={styles.carpoolBody}>{pair.summary}</Text>
    </Animated.View>
  );
}

export default function FamilyLobbyScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { familyData, isLoading, refreshFamily, isParent, isFamilyMember } = useFamily();
  const { user, loginWithToken } = useAuth();

  // Smart Lobby aggregation. Stays inside the lobby surface so the rest of
  // the app doesn't pay the cost on every render. Polled every 60s, matching
  // the server-side cache TTL.
  const todayQuery = useQuery<TodayPayload>({
    queryKey: ["/api/family/me/today"],
    enabled: !!familyData,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const todayByPlayer = useMemo(() => {
    const map = new Map<string, TodayMemberInfo>();
    for (const m of todayQuery.data?.members ?? []) {
      map.set(m.playerId, m);
    }
    return map;
  }, [todayQuery.data]);

  const callerPlayerId = useMemo(() => {
    return todayQuery.data?.members.find((m) => m.isSelf)?.playerId ?? null;
  }, [todayQuery.data]);

  const sortedMembers = useMemo(() => {
    if (!familyData) return [] as FamilyMember[];
    return [...familyData.members].sort((a, b) =>
      compareMembers(a, b, todayByPlayer, callerPlayerId),
    );
  }, [familyData, todayByPlayer, callerPlayerId]);
  const [switching, setSwitching] = useState(false);
  const [pinTarget, setPinTarget] = useState<FamilyMember | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinRecoveryOpen, setPinRecoveryOpen] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [lockTarget, setLockTarget] = useState<FamilyMember | null>(null);

  // Family F — fetch active locks for the family. Polled every 30s so a lock
  // applied from another device shows up quickly (the auth middleware enforces
  // it on every request anyway).
  const locksQuery = useQuery<{ locks: Array<{ playerId: string; lockedUntil: string; lockedByPlayerId: string | null; reason: string | null }> }>({
    queryKey: ["/api/family/locks"],
    refetchInterval: 30_000,
  });
  const locksByPlayerId = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of locksQuery.data?.locks ?? []) {
      if (l?.playerId && l.lockedUntil) map.set(l.playerId, l.lockedUntil);
    }
    return map;
  }, [locksQuery.data]);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showCreateMember, setShowCreateMember] = useState(false);
  const [addChildTab, setAddChildTab] = useState<"email" | "code" | "enter">("email");
  const [childEmail, setChildEmail] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteExpiry, setInviteExpiry] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const [enterCodeValue, setEnterCodeValue] = useState("");
  const [enterCodePreview, setEnterCodePreview] = useState<{ playerName: string; academyName: string } | null>(null);
  const [enterCodeError, setEnterCodeError] = useState<string | null>(null);
  const [enterCodeLoading, setEnterCodeLoading] = useState(false);
  const [enterCodeClaiming, setEnterCodeClaiming] = useState(false);
  const [enterCodeClaimed, setEnterCodeClaimed] = useState(false);

  // ── Family G — Account Graduation (Task #1138) ───────────────────────────
  // Holds the member whose graduation modal is currently open. The modal does
  // its own PIN elevation, so we don't need to thread one through here.
  const [graduationTarget, setGraduationTarget] = useState<FamilyMember | null>(null);

  // ── Family H — Spectator (read-only family stream) state ─────────────────
  const [showSpectator, setShowSpectator] = useState(false);
  const [spectatorTargetPlayerId, setSpectatorTargetPlayerId] = useState<string | null>(null);
  const [spectatorCopiedId, setSpectatorCopiedId] = useState<string | null>(null);

  // PIN elevation: cached short-lived token from /api/family/pin/verify, plus
  // the modal that prompts for the PIN when there's no valid token. We hold the
  // intended action so we can resume after the PIN is entered.
  const [pinElevation, setPinElevation] = useState<{ token: string; expiresAt: number } | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinPendingAction, setPinPendingAction] = useState<
    | { kind: "generate"; playerId: string }
    | { kind: "revoke"; linkId: string }
    | null
  >(null);

  const getValidElevation = (): string | null => {
    if (!pinElevation) return null;
    // Treat anything within 30s of expiry as expired to avoid race conditions.
    if (pinElevation.expiresAt - Date.now() < 30_000) return null;
    return pinElevation.token;
  };

  type SpectatorLinkRow = {
    id: string;
    token: string;
    url: string;
    playerId: string;
    createdByPlayerId: string;
    label: string | null;
    revokedAt: string | null;
    lastViewedAt: string | null;
    viewCount: number;
    createdAt: string | null;
  };

  const spectatorLinksQuery = useQuery<{ links: SpectatorLinkRow[] }>({
    queryKey: ["/api/family/spectator-links"],
    enabled: showSpectator,
    staleTime: 0,
  });

  const generateSpectatorLink = useMutation({
    mutationFn: async ({ playerId, elevationToken }: { playerId: string; elevationToken: string }) => {
      const res = await apiRequest("POST", "/api/family/spectator-link", {
        playerId,
        pinElevationToken: elevationToken,
      });
      return (await res.json()) as SpectatorLinkRow;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/family/spectator-links"] });
    },
    onError: (error: any) => {
      // Drop the cached elevation token if the server rejected it.
      if (String(error?.message || "").includes("PIN_ELEVATION_REQUIRED")) {
        setPinElevation(null);
      }
      Alert.alert("Error", parseApiError(error, "Could not generate spectator link."));
    },
  });

  const revokeSpectatorLink = useMutation({
    mutationFn: async ({ linkId, elevationToken }: { linkId: string; elevationToken: string }) => {
      const qs = `?pinElevationToken=${encodeURIComponent(elevationToken)}`;
      await apiRequest("DELETE", `/api/family/spectator-link/${linkId}${qs}`);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/family/spectator-links"] });
    },
    onError: (error: any) => {
      if (String(error?.message || "").includes("PIN_ELEVATION_REQUIRED")) {
        setPinElevation(null);
      }
      Alert.alert("Error", parseApiError(error, "Could not revoke link."));
    },
  });

  // ── PIN elevation flow ──────────────────────────────────────────────────
  // Each sensitive action (generate/revoke spectator link) calls this; if we
  // already hold a fresh elevation token, we run it immediately, otherwise we
  // open the PIN modal and stash the action until the PIN succeeds.
  const requestWithPin = (
    action: { kind: "generate"; playerId: string } | { kind: "revoke"; linkId: string },
  ) => {
    const cached = getValidElevation();
    if (cached) {
      runPendingAction(action, cached);
      return;
    }
    setPinPendingAction(action);
    setPinInput("");
    setPinError(null);
    setPinModalOpen(true);
  };

  const runPendingAction = (
    action: { kind: "generate"; playerId: string } | { kind: "revoke"; linkId: string },
    elevationToken: string,
  ) => {
    if (action.kind === "generate") {
      setSpectatorTargetPlayerId(action.playerId);
      generateSpectatorLink.mutate({ playerId: action.playerId, elevationToken });
    } else {
      revokeSpectatorLink.mutate({ linkId: action.linkId, elevationToken });
    }
  };

  const submitPin = async () => {
    if (!/^\d{4}$/.test(pinInput)) {
      setPinError("Enter your 4-digit Family PIN.");
      return;
    }
    setPinVerifying(true);
    setPinError(null);
    try {
      const res = await apiRequest("POST", "/api/family/pin/verify", { pin: pinInput });
      const data = (await res.json()) as { elevationToken: string; expiresAt: string };
      const expiresAt = new Date(data.expiresAt).getTime();
      setPinElevation({ token: data.elevationToken, expiresAt });
      setPinModalOpen(false);
      setPinInput("");
      const action = pinPendingAction;
      setPinPendingAction(null);
      if (action) runPendingAction(action, data.elevationToken);
    } catch (error: any) {
      setPinError(parseApiError(error, "Incorrect PIN. Try again."));
    } finally {
      setPinVerifying(false);
    }
  };

  const closePinModal = () => {
    setPinModalOpen(false);
    setPinInput("");
    setPinError(null);
    setPinPendingAction(null);
  };

  const handleCopySpectatorLink = async (link: SpectatorLinkRow) => {
    await Clipboard.setStringAsync(link.url);
    setSpectatorCopiedId(link.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setSpectatorCopiedId((prev) => (prev === link.id ? null : prev)), 2000);
  };

  const handleShareSpectatorLink = async (link: SpectatorLinkRow, playerName: string) => {
    try {
      await Share.share({
        message: `Follow ${playerName}'s tennis progress: ${link.url}`,
      });
    } catch (_) {}
  };

  const handleRevokeSpectatorLink = (link: SpectatorLinkRow) => {
    Alert.alert(
      "Revoke this link?",
      "Anyone with this link will see a 'no longer available' page. You can always create a new one.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => requestWithPin({ kind: "revoke", linkId: link.id }),
        },
      ],
    );
  };

  const controlsMutation = useMutation({
    mutationFn: async ({ playerId, field, value }: { playerId: string; field: string; value: boolean }) => {
      return apiRequest("PUT", `/api/family/parental-controls/${playerId}`, { [field]: value });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshFamily();
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Could not update setting.");
    },
  });

  const handleToggleControl = (playerId: string, field: "chatEnabled" | "communityEnabled", value: boolean) => {
    controlsMutation.mutate({ playerId, field, value });
  };

  const payAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/billing/pay-bulk", {
        playerIds: familyData?.members.map(m => m.id) || [],
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Payment Successful!", "All outstanding balances have been paid.");
      queryClient.invalidateQueries({ queryKey: ["/api/family/status"] });
    },
    onError: (error: any) => {
      Alert.alert("Payment Failed", error.message || "Could not process payment. Please try again.");
    },
  });

  const addChildMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/family/add-child", { email });
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setChildEmail("");
      setShowAddChild(false);
      refreshFamily();
    },
    onError: (error: any) => {
      const msg = parseApiError(error, "Please try again.");
      Alert.alert("Could not add member", msg);
    },
  });

  const inviteCodeMutation = useMutation({
    mutationFn: async () => {
      // Symmetric model — any family member can mint an invite code.
      const res = await apiRequest("POST", "/api/family/members/invite");
      return res.json() as Promise<{ code: string; expiresAt: string }>;
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setInviteCode(data.code);
      setInviteExpiry(data.expiresAt);
    },
    onError: (error: any) => {
      const msg = parseApiError(error, "Could not generate invite code.");
      Alert.alert("Error", msg);
    },
  });

  const handleOpenAddChildModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setChildEmail("");
    setInviteCode(null);
    setInviteExpiry(null);
    setCodeCopied(false);
    setAddChildTab("email");
    setEnterCodeValue("");
    setEnterCodePreview(null);
    setEnterCodeError(null);
    setEnterCodeClaimed(false);
    setShowAddChild(true);
  };

  const handleTabChange = (tab: "email" | "code" | "enter") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddChildTab(tab);
    if (tab === "code" && !inviteCode) {
      inviteCodeMutation.mutate();
    }
  };

  const handleEnterCodeLookup = async () => {
    const code = enterCodeValue.trim().toUpperCase();
    if (!code) return;
    setEnterCodeLoading(true);
    setEnterCodePreview(null);
    setEnterCodeError(null);
    try {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/player-invites/${code}/preview`, baseUrl).toString();
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEnterCodeError(data.message || data.error || "Code not found. Please check and try again.");
      } else {
        const data = await res.json();
        setEnterCodePreview({ playerName: data.playerName, academyName: data.academyName });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      setEnterCodeError("Could not reach the server. Please try again.");
    } finally {
      setEnterCodeLoading(false);
    }
  };

  const handleEnterCodeClaim = async () => {
    if (!enterCodePreview) return;
    const userId = user?.id;
    if (!userId) {
      setEnterCodeError("You must be signed in to claim an invite.");
      return;
    }
    setEnterCodeClaiming(true);
    try {
      await apiRequest("POST", "/api/player-invite/claim", {
        inviteCode: enterCodeValue.trim().toUpperCase(),
        userId,
      });
      setEnterCodeClaimed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        setShowAddChild(false);
        setEnterCodeClaimed(false);
        setEnterCodeValue("");
        setEnterCodePreview(null);
        refreshFamily();
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not claim the invite. Please try again.";
      setEnterCodeError(message);
    } finally {
      setEnterCodeClaiming(false);
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    setCodeCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleShareCode = async () => {
    if (!inviteCode) return;
    try {
      await Share.share({
        message: `Join my family on the app! Use code: ${inviteCode} (valid for 48 hours)`,
      });
    } catch (_) {}
  };

  // Family B — real auth-swap. If the target has a PIN we open the PIN pad
  // and retry the switch with the entered PIN. On success we apply the new
  // token and reboot via reloadAppAsync so every provider rehydrates from
  // scratch under the new identity.
  const performSwitch = async (member: FamilyMember, pin?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const outcome = await callFamilySwitch(member.id, pin ? { pin } : {});
    if (outcome.ok) {
      await applySwitchResult(outcome, queryClient);
      // Persist a transient signal so the booted app can show a "Hi {name}"
      // welcome banner once on next mount. Cleared by whoever consumes it.
      try {
        await secureSet(
          FAMILY_SWITCH_KEY,
          JSON.stringify({ switchedPlayerName: member.name, at: Date.now() })
        );
      } catch (_) {}
      try {
        await reloadAppAsync();
      } catch {
        // Web / fallback: drive AuthContext + reset navigation.
        await loginWithToken(outcome.token, outcome.user, outcome.refreshToken);
        navigation.reset({ index: 0, routes: [{ name: "PlayerTabs" as never }] });
      }
      return { ok: true as const };
    }
    return outcome;
  };

  const handleSelectChild = async (member: FamilyMember) => {
    if (switching) return;
    setSwitching(true);
    try {
      const outcome = await performSwitch(member);
      if (outcome.ok) return;
      if ("pinRequired" in outcome && outcome.pinRequired) {
        // Hand off to the PIN-pad modal; it will re-enter performSwitch with the PIN.
        setPinTarget(member);
        if ("locked" in outcome && outcome.locked) {
          setPinError(outcome.message || "Too many wrong attempts. Try again later.");
        }
        return;
      }
      Alert.alert("Switch Failed", outcome.message || "Could not switch to this account. Please try again.");
    } catch (error: any) {
      Alert.alert("Switch Failed", parseApiError(error, "Could not switch to this account. Please try again."));
    } finally {
      setSwitching(false);
    }
  };

  const handleUnlockMember = async (member: FamilyMember) => {
    // Family F — unlock requires the locker's PIN OR the target's PIN. We
    // try the target's PIN flow first because it's the most universal path
    // (a kid lifting their own bedtime lock when a parent allows it).
    setPinTarget(null);
    Alert.alert(
      `Unlock ${member.name}?`,
      "You'll need a 4-digit PIN to confirm. Use either the family member who locked it, or the target's own PIN.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Enter PIN",
          onPress: async () => {
            const pinPromise = new Promise<string | null>((resolve) => {
              // Reuse PinPadModal via a lightweight inline prompt — Alert.prompt
              // isn't cross-platform, so we hijack the existing pinTarget flow.
              setPinTarget({ ...member, _unlockMode: true } as any);
              (handleUnlockMember as any)._resolve = resolve;
            });
            await pinPromise;
          },
        },
      ],
    );
  };

  const handleMemberLongPress = (member: FamilyMember) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isLocked = locksByPlayerId.has(member.id);
    const buttons: Array<{ text: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }> = [
      {
        text: "View activity log",
        onPress: () => {
          (navigation as any).navigate("AccountAuditLog", {
            playerId: member.id,
            playerName: member.name,
          });
        },
      },
    ];
    if (isLocked) {
      buttons.push({
        text: "Unlock account",
        onPress: () => handleUnlockMember(member),
      });
    } else {
      buttons.push({
        text: "Lock for screen-time break",
        style: "destructive",
        onPress: () => setLockTarget(member),
      });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert(member.name, "What would you like to do?", buttons);
  };

  const handlePinSubmit = async (pin: string): Promise<string | null> => {
    if (!pinTarget) return "No account selected";
    // Unlock branch — when long-press chose "Unlock", we reuse the PinPadModal
    // and route the PIN to the unlock endpoint instead of switching.
    if ((pinTarget as any)._unlockMode) {
      const target = pinTarget;
      try {
        const res = await apiRequest("DELETE", `/api/family/lock/${target.id}`, { pin });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (typeof data?.attemptsLeft === "number") {
            return `Wrong PIN — ${data.attemptsLeft} attempts left`;
          }
          return data?.error || "Couldn't unlock";
        }
        setPinTarget(null);
        queryClient.invalidateQueries({ queryKey: ["/api/family/locks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/account/audit-log"] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Unlocked", `${target.name} is back in the app.`);
        return null;
      } catch (err: any) {
        return err?.message || "Couldn't unlock";
      }
    }
    const outcome = await performSwitch(pinTarget, pin);
    if (outcome.ok) {
      setPinTarget(null);
      return null;
    }
    if ("locked" in outcome && outcome.locked) {
      return outcome.message || "Too many attempts. Try again later.";
    }
    if ("attemptsLeft" in outcome && typeof outcome.attemptsLeft === "number") {
      return `Incorrect PIN — ${outcome.attemptsLeft} attempt${outcome.attemptsLeft === 1 ? "" : "s"} left`;
    }
    return outcome.message || "Incorrect PIN";
  };

  const handlePayAll = () => {
    if (!familyData || familyData.outstandingTotal <= 0) return;

    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        `Pay all outstanding balances totaling ${familyData.outstandingTotal.toFixed(2)}?`
      );
      if (confirmed) {
        payAllMutation.mutate();
      }
    } else {
      Alert.alert(
        "Pay All Balances",
        `Pay all outstanding balances totaling ${familyData.outstandingTotal.toFixed(2)}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Pay Now",
            onPress: () => payAllMutation.mutate(),
          },
        ]
      );
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loading, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading family...</Text>
      </View>
    );
  }

  if (!familyData) {
    return (
      <View style={[styles.container, styles.loading, { paddingTop: insets.top, paddingHorizontal: Spacing.xl }]}>
        <Ionicons name="people-outline" size={64} color={Colors.dark.textMuted} />
        <Text style={[styles.loadingText, { marginTop: Spacing.lg, fontSize: FontSizes.lg, fontWeight: "700", color: Colors.dark.text }]}>
          Family Lobby is empty
        </Text>
        <Text
          style={{
            marginTop: Spacing.sm,
            fontSize: FontSizes.sm,
            color: Colors.dark.textMuted,
            textAlign: "center",
            maxWidth: 320,
            lineHeight: 20,
          }}
        >
          {"We couldn\u2019t find any other players linked to your account yet. Add a family member to get started, or try again if you just made a change."}
        </Text>

        <View style={{ marginTop: Spacing.xl, width: "100%", maxWidth: 320, gap: Spacing.sm }}>
          {/* Symmetric family-group model: any member can add a player. */}
          {isFamilyMember || isParent ? (
            <Pressable
              style={{
                paddingHorizontal: Spacing.xl,
                paddingVertical: Spacing.md,
                backgroundColor: Colors.dark.primary,
                borderRadius: BorderRadius.md,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: Spacing.sm,
              }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowCreateMember(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Add a family member"
            >
              <Ionicons name="person-add" size={18} color={Colors.dark.buttonText} />
              <Text style={{ color: Colors.dark.buttonText, fontSize: FontSizes.md, fontWeight: "600" }}>
                Add Family Member
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            style={{
              paddingHorizontal: Spacing.xl,
              paddingVertical: Spacing.md,
              backgroundColor: "transparent",
              borderRadius: BorderRadius.md,
              borderWidth: 1,
              borderColor: Colors.dark.border,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: Spacing.sm,
            }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              refreshFamily();
            }}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Ionicons name="refresh" size={18} color={Colors.dark.text} />
            <Text style={{ color: Colors.dark.text, fontSize: FontSizes.md, fontWeight: "600" }}>
              Try Again
            </Text>
          </Pressable>

          <Pressable
            style={{
              paddingHorizontal: Spacing.xl,
              paddingVertical: Spacing.md,
              alignItems: "center",
            }}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={{ color: Colors.dark.textMuted, fontSize: FontSizes.md, fontWeight: "500" }}>
              Back
            </Text>
          </Pressable>
        </View>

        <CreateFamilyMemberFlow
          visible={showCreateMember}
          onClose={() => setShowCreateMember(false)}
          onComplete={(_newPlayerId, newPlayerName) => {
            setShowCreateMember(false);
            refreshFamily();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert(
              "Profile created!",
              `${newPlayerName} has been added to the Family Lobby.`,
              [{ text: "OK" }]
            );
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View entering={FadeInUp.duration(400)} style={styles.header}>
        <View style={styles.welcomeRow}>
          <Ionicons name="home" size={24} color={Colors.dark.primary} />
          <Text style={styles.welcomeText}>Family Lobby</Text>
        </View>
        <Text style={styles.subtitle}>Choose a profile to continue</Text>
        {(familyData.creatorName || familyData.creatorEmail || familyData.parentEmail) ? (
          <View style={styles.roleBadgeRow}>
            <Text style={styles.parentEmailText} numberOfLines={1}>
              Family creator: {familyData.creatorName || familyData.creatorEmail || familyData.parentEmail}
            </Text>
          </View>
        ) : null}
      </Animated.View>

      {familyData.outstandingTotal > 0 && (
        <Animated.View entering={ZoomIn.delay(200).duration(400)}>
          <Pressable
            style={styles.payAllCard}
            onPress={handlePayAll}
            disabled={payAllMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={`Pay all outstanding balances totaling ${familyData.outstandingTotal.toFixed(2)}`}
          >
            <LinearGradient
              colors={[Colors.dark.gold + "20", Colors.dark.gold + "10"]}
              style={styles.payAllGradient}
            >
              <View style={styles.payAllContent}>
                <View style={styles.payAllLeft}>
                  <Text style={styles.payAllLabel}>Total Outstanding</Text>
                  <Text style={styles.payAllAmount}>
                    {familyData.outstandingTotal.toFixed(2)}
                  </Text>
                  <Text style={styles.payAllBreakdown}>
                    {familyData.members.filter(m => m.outstandingBalance > 0).map(m => 
                      `${m.name}: ${m.outstandingBalance.toFixed(2)}`
                    ).join(" | ")}
                  </Text>
                </View>
                <View style={styles.payAllButton}>
                  {payAllMutation.isPending ? (
                    <ActivityIndicator color={Colors.dark.buttonText} size="small" />
                  ) : (
                    <>
                      <Ionicons name="card" size={20} color={Colors.dark.buttonText} />
                      <Text style={styles.payAllButtonText}>Pay All</Text>
                    </>
                  )}
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isParent ? (
          <Pressable
            style={styles.parentalControlsButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowControls(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Open parental controls"
          >
            <Ionicons name="shield-checkmark" size={20} color="#00BCD4" />
            <Text style={styles.parentalControlsText}>Parental Controls</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
          </Pressable>
        ) : null}

        <Pressable
          style={styles.parentalControlsButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSpectatorTargetPlayerId(null);
            setShowSpectator(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open share with family — read-only spectator links"
        >
          <Ionicons name="eye-outline" size={20} color={Colors.dark.primary} />
          <Text style={styles.parentalControlsText}>Share with Family</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
        </Pressable>

        {todayQuery.data ? <FamilyTodayStrip rows={todayQuery.data.todayStrip} /> : null}

        {todayQuery.data?.carpoolPairs?.map((pair, idx) => (
          <CarpoolCard key={`carpool-${idx}-${pair.locationName ?? pair.courtName ?? "x"}`} pair={pair} />
        ))}

        {isFamilyMember || isParent ? (
          <Pressable
            style={styles.parentalControlsButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowWallet(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Open family wallet"
          >
            <Ionicons name="wallet" size={20} color="#00BCD4" />
            <Text style={styles.parentalControlsText}>Family Wallet</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
          </Pressable>
        ) : null}

        <View style={styles.cardsGrid}>
          {sortedMembers.map((member, index) => (
            <ChildCard
              key={member.id}
              member={member}
              todayInfo={todayByPlayer.get(member.id)}
              onPress={() => handleSelectChild(member)}
              onLongPress={() => handleMemberLongPress(member)}
              lockedUntil={locksByPlayerId.get(member.id) ?? null}
              index={index}
              onGraduate={(m) => setGraduationTarget(m)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.addChildStickyWrapper}>
          <Pressable
            style={[styles.addChildStickyButton, styles.createMemberButton]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowCreateMember(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Create a new player profile for a family member"
          >
            <Ionicons name="person-add" size={20} color={Colors.dark.buttonText} />
            <Text style={styles.addChildStickyText}>Add New Player</Text>
          </Pressable>
        </Animated.View>
        <View style={styles.footerRow}>
          <Ionicons name="people" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.footerText}>
            {familyData.members.length} player{familyData.members.length !== 1 ? "s" : ""} linked to {familyData.parentEmail}
          </Text>
        </View>
      </View>

      <CreateFamilyMemberFlow
        visible={showCreateMember}
        onClose={() => setShowCreateMember(false)}
        onComplete={(_newPlayerId, newPlayerName) => {
          setShowCreateMember(false);
          refreshFamily();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            "Profile created!",
            `${newPlayerName} has been added to the Family Lobby.`,
            [{ text: "OK" }]
          );
        }}
      />

      <PinPadModal
        visible={!!pinTarget && !pinRecoveryOpen}
        title={pinTarget ? `Enter ${pinTarget.name}'s PIN` : "Enter PIN"}
        subtitle="Switching to this account is protected by a 4-digit PIN."
        onSubmit={handlePinSubmit}
        onClose={() => {
          setPinTarget(null);
          setPinError(null);
        }}
        onForgotPin={() => setPinRecoveryOpen(true)}
        errorMessage={pinError}
      />

      <PinRecoveryModal
        visible={!!pinTarget && pinRecoveryOpen}
        targetPlayerId={pinTarget?.id}
        onClose={() => setPinRecoveryOpen(false)}
      />

      {/* Family G — Account Graduation (Task #1138) */}
      <GraduationFlow
        visible={!!graduationTarget}
        targetPlayerId={graduationTarget?.id ?? null}
        targetName={graduationTarget?.name ?? null}
        currentEmail={null}
        daysUntilEighteen={graduationTarget?.daysUntilEighteen ?? null}
        onClose={() => setGraduationTarget(null)}
        onComplete={() => {
          setGraduationTarget(null);
          // Reload family roster so the "Graduated" badge appears.
          refreshFamily();
          queryClient.invalidateQueries({ queryKey: ["/api/family/me/group"] });
        }}
      />

      {/* Family F — Screen-time lock (Task #1137) */}
      <LockAccountModal
        visible={!!lockTarget}
        targetPlayerId={lockTarget?.id ?? null}
        targetName={lockTarget?.name ?? null}
        onClose={() => setLockTarget(null)}
        onLocked={() => {
          locksQuery.refetch();
        }}
      />

      <Modal visible={showControls} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="shield-checkmark" size={24} color="#00BCD4" />
                <Text style={styles.modalTitle}>Parental Controls</Text>
              </View>
              <Pressable onPress={() => setShowControls(false)} accessibilityRole="button" accessibilityLabel="Close parental controls">
                <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              Manage what your family members can do in the app
            </Text>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {familyData.members.map((member) => (
                <ParentalControlsCard
                  key={member.id}
                  member={member}
                  onToggle={(field, value) => handleToggleControl(member.id, field, value)}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showAddChild} transparent animationType="slide" onRequestClose={() => setShowAddChild(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="person-add" size={24} color={Colors.dark.primary} />
                <Text style={styles.modalTitle}>Add Member</Text>
              </View>
              <Pressable onPress={() => setShowAddChild(false)} accessibilityRole="button" accessibilityLabel="Close add member modal">
                <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
              </Pressable>
            </View>

            <View style={styles.tabRow}>
              <Pressable
                style={[styles.tab, addChildTab === "email" ? styles.tabActive : null]}
                onPress={() => handleTabChange("email")}
                accessibilityRole="button"
              >
                <Ionicons name="mail-outline" size={16} color={addChildTab === "email" ? Colors.dark.primary : Colors.dark.textMuted} />
                <Text style={[styles.tabText, addChildTab === "email" ? styles.tabTextActive : null]}>By Email</Text>
              </Pressable>
              <Pressable
                style={[styles.tab, addChildTab === "code" ? styles.tabActive : null]}
                onPress={() => handleTabChange("code")}
                accessibilityRole="button"
              >
                <Ionicons name="share-social-outline" size={16} color={addChildTab === "code" ? Colors.dark.primary : Colors.dark.textMuted} />
                <Text style={[styles.tabText, addChildTab === "code" ? styles.tabTextActive : null]}>By Invite Code</Text>
              </Pressable>
              <Pressable
                style={[styles.tab, addChildTab === "enter" ? styles.tabActive : null]}
                onPress={() => handleTabChange("enter")}
                accessibilityRole="button"
              >
                <Ionicons name="key-outline" size={16} color={addChildTab === "enter" ? Colors.dark.primary : Colors.dark.textMuted} />
                <Text style={[styles.tabText, addChildTab === "enter" ? styles.tabTextActive : null]}>Enter Code</Text>
              </Pressable>
            </View>

            {addChildTab === "email" ? (
              <View style={styles.tabContent}>
                <Text style={styles.modalSubtitle}>
                  Enter the email address the player registered with
                </Text>
                <TextInput
                  style={styles.emailInput}
                  placeholder="member@example.com"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={childEmail}
                  onChangeText={setChildEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Member email address"
                />
                <Pressable
                  style={[styles.addButton, (!childEmail.trim() || addChildMutation.isPending) ? styles.addButtonDisabled : null]}
                  onPress={() => {
                    if (childEmail.trim()) {
                      addChildMutation.mutate(childEmail.trim());
                    }
                  }}
                  disabled={!childEmail.trim() || addChildMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Add member by email"
                >
                  {addChildMutation.isPending ? (
                    <ActivityIndicator color={Colors.dark.buttonText} size="small" />
                  ) : (
                    <Text style={styles.addButtonText}>Add to Family</Text>
                  )}
                </Pressable>
              </View>
            ) : addChildTab === "code" ? (
              <View style={styles.tabContent}>
                <Text style={styles.modalSubtitle}>
                  Share this code with the player. They can enter it in Settings to join your family.
                </Text>
                {inviteCodeMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.primary} size="large" style={{ marginVertical: Spacing.xl }} />
                ) : inviteCode ? (
                  <>
                    <View style={styles.codeBox}>
                      <Text style={styles.codeText}>{inviteCode}</Text>
                    </View>
                    {inviteExpiry ? (
                      <Text style={styles.codeExpiry}>
                        Expires {new Date(inviteExpiry).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    ) : null}
                    <View style={styles.codeActions}>
                      <Pressable style={styles.codeActionBtn} onPress={handleCopyCode} accessibilityRole="button" accessibilityLabel="Copy invite code">
                        <Ionicons name={codeCopied ? "checkmark-circle" : "copy-outline"} size={20} color={codeCopied ? "#00E676" : Colors.dark.primary} />
                        <Text style={[styles.codeActionText, codeCopied ? { color: "#00E676" } : null]}>{codeCopied ? "Copied!" : "Copy Code"}</Text>
                      </Pressable>
                      <Pressable style={styles.codeActionBtn} onPress={handleShareCode} accessibilityRole="button" accessibilityLabel="Share invite code">
                        <Ionicons name="share-outline" size={20} color={Colors.dark.primary} />
                        <Text style={styles.codeActionText}>Share</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      style={styles.refreshCodeBtn}
                      onPress={() => inviteCodeMutation.mutate()}
                      accessibilityRole="button"
                      accessibilityLabel="Generate new invite code"
                    >
                      <Ionicons name="refresh-outline" size={16} color={Colors.dark.textMuted} />
                      <Text style={styles.refreshCodeText}>Generate New Code</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : (
              <View style={styles.tabContent}>
                <Text style={styles.modalSubtitle}>
                  Enter the 6-character code your coach shared with you to link a player profile instantly.
                </Text>
                {enterCodeClaimed && enterCodePreview ? (
                  <View style={styles.enterCodeSuccess}>
                    <Ionicons name="checkmark-circle" size={40} color={Colors.dark.primary} />
                    <Text style={styles.enterCodeSuccessTitle}>Linked!</Text>
                    <Text style={styles.enterCodeSuccessText}>
                      {enterCodePreview.playerName} has been added to your family.
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.enterCodeRow}>
                      <TextInput
                        style={styles.enterCodeInput}
                        value={enterCodeValue}
                        onChangeText={(t) => {
                          setEnterCodeValue(t.toUpperCase());
                          setEnterCodePreview(null);
                          setEnterCodeError(null);
                        }}
                        autoCapitalize="characters"
                        maxLength={8}
                        placeholder="ABC123"
                        placeholderTextColor={Colors.dark.textMuted}
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={handleEnterCodeLookup}
                      />
                      <Pressable
                        style={[styles.enterCodeLookupBtn, (!enterCodeValue.trim() || enterCodeLoading) ? styles.enterCodeLookupBtnDisabled : null]}
                        onPress={handleEnterCodeLookup}
                        disabled={!enterCodeValue.trim() || enterCodeLoading}
                        accessibilityRole="button"
                        accessibilityLabel="Look up invite code"
                      >
                        {enterCodeLoading ? (
                          <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                        ) : (
                          <Text style={styles.enterCodeLookupBtnText}>Look up</Text>
                        )}
                      </Pressable>
                    </View>

                    {enterCodeError ? (
                      <Text style={styles.enterCodeErrorText}>{enterCodeError}</Text>
                    ) : null}

                    {enterCodePreview ? (
                      <View style={styles.enterCodePreviewCard}>
                        <View style={styles.enterCodePreviewRow}>
                          <Ionicons name="checkmark-circle" size={18} color={Colors.dark.primary} />
                          <Text style={styles.enterCodePreviewLabel}>Player found:</Text>
                        </View>
                        <Text style={styles.enterCodePreviewName}>{enterCodePreview.playerName}</Text>
                        <Text style={styles.enterCodePreviewAcademy}>{enterCodePreview.academyName}</Text>
                        <Pressable
                          style={[styles.addButton, enterCodeClaiming ? styles.addButtonDisabled : null]}
                          onPress={handleEnterCodeClaim}
                          disabled={enterCodeClaiming}
                          accessibilityRole="button"
                          accessibilityLabel="Confirm and link player"
                        >
                          {enterCodeClaiming ? (
                            <ActivityIndicator color={Colors.dark.buttonText} size="small" />
                          ) : (
                            <Text style={styles.addButtonText}>Add {enterCodePreview.playerName} to Family</Text>
                          )}
                        </Pressable>
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Family H — Spectator Links modal */}
      <Modal visible={showSpectator} transparent animationType="slide" onRequestClose={() => setShowSpectator(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="eye-outline" size={24} color={Colors.dark.primary} />
                <Text style={styles.modalTitle}>Share with Family</Text>
              </View>
              <Pressable onPress={() => setShowSpectator(false)} accessibilityRole="button" accessibilityLabel="Close share with family">
                <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              Generate a read-only web link for grandparents and family who don&apos;t have the app. They&apos;ll see recent matches, level-ups and posts. No login needed.
            </Text>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {familyData.members.map((member) => {
                const memberLinks = (spectatorLinksQuery.data?.links ?? []).filter((l) => l.playerId === member.id);
                const isGenerating = generateSpectatorLink.isPending && spectatorTargetPlayerId === member.id;
                return (
                  <View key={member.id} style={styles.spectatorMemberCard}>
                    <View style={styles.spectatorMemberHeader}>
                      {member.avatarUrl ? (
                        <Image
                          source={{ uri: `${getStaticAssetsUrl()}${member.avatarUrl}` }}
                          style={styles.controlAvatar}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.controlAvatar, styles.controlAvatarPlaceholder]}>
                          <Ionicons name="person" size={16} color={Colors.dark.textMuted} />
                        </View>
                      )}
                      <Text style={styles.controlName}>{member.name}</Text>
                    </View>

                    {memberLinks.length === 0 ? (
                      <Text style={styles.spectatorEmpty}>No spectator links yet.</Text>
                    ) : (
                      memberLinks.map((link) => (
                        <View key={link.id} style={[styles.spectatorLinkRow, link.revokedAt ? styles.spectatorLinkRevoked : null]}>
                          <View style={styles.spectatorLinkInfo}>
                            <Text
                              style={[styles.spectatorLinkUrl, link.revokedAt ? styles.spectatorLinkUrlMuted : null]}
                              numberOfLines={1}
                            >
                              {link.url.replace(/^https?:\/\//, "")}
                            </Text>
                            <Text style={styles.spectatorLinkMeta}>
                              {link.revokedAt
                                ? "Revoked"
                                : `${link.viewCount} view${link.viewCount === 1 ? "" : "s"}${link.lastViewedAt ? " • Last viewed " + formatLastActive(link.lastViewedAt).toLowerCase() : ""}`}
                            </Text>
                          </View>
                          {!link.revokedAt ? (
                            <View style={styles.spectatorLinkActions}>
                              <Pressable
                                style={styles.spectatorIconBtn}
                                onPress={() => handleCopySpectatorLink(link)}
                                accessibilityRole="button"
                                accessibilityLabel="Copy spectator link"
                              >
                                <Ionicons
                                  name={spectatorCopiedId === link.id ? "checkmark-circle" : "copy-outline"}
                                  size={18}
                                  color={spectatorCopiedId === link.id ? "#00E676" : Colors.dark.primary}
                                />
                              </Pressable>
                              <Pressable
                                style={styles.spectatorIconBtn}
                                onPress={() => handleShareSpectatorLink(link, member.name)}
                                accessibilityRole="button"
                                accessibilityLabel="Share spectator link"
                              >
                                <Ionicons name="share-outline" size={18} color={Colors.dark.primary} />
                              </Pressable>
                              <Pressable
                                style={styles.spectatorIconBtn}
                                onPress={() => handleRevokeSpectatorLink(link)}
                                accessibilityRole="button"
                                accessibilityLabel="Revoke spectator link"
                              >
                                <Ionicons name="trash-outline" size={18} color={Colors.dark.gold} />
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      ))
                    )}

                    <Pressable
                      style={[styles.spectatorGenerateBtn, isGenerating ? styles.addButtonDisabled : null]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        requestWithPin({ kind: "generate", playerId: member.id });
                      }}
                      disabled={isGenerating}
                      accessibilityRole="button"
                      accessibilityLabel={`Generate a new spectator link for ${member.name}`}
                    >
                      {isGenerating ? (
                        <ActivityIndicator color={Colors.dark.buttonText} size="small" />
                      ) : (
                        <>
                          <Ionicons name="add-circle-outline" size={16} color={Colors.dark.buttonText} />
                          <Text style={styles.spectatorGenerateText}>Generate New Link</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                );
              })}

              {spectatorLinksQuery.isLoading ? (
                <ActivityIndicator color={Colors.dark.primary} style={{ marginVertical: Spacing.lg }} />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pinModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closePinModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pinModalCard}>
            <Text style={styles.pinModalTitle}>Enter Family PIN</Text>
            <Text style={styles.pinModalSubtitle}>
              Confirm your 4-digit Family PIN to manage spectator links. (Default is 1234 — change it in settings.)
            </Text>
            <TextInput
              value={pinInput}
              onChangeText={(t) => {
                setPinError(null);
                setPinInput(t.replace(/\D/g, "").slice(0, 4));
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder="••••"
              placeholderTextColor={Colors.dark.textMuted}
              style={styles.pinModalInput}
              autoFocus
              accessibilityLabel="Family PIN"
            />
            {pinError ? <Text style={styles.pinModalError}>{pinError}</Text> : null}
            <View style={styles.pinModalActions}>
              <Pressable
                onPress={closePinModal}
                style={[styles.pinModalBtn, styles.pinModalBtnCancel]}
                accessibilityRole="button"
              >
                <Text style={styles.pinModalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitPin}
                style={[
                  styles.pinModalBtn,
                  styles.pinModalBtnConfirm,
                  pinVerifying || pinInput.length !== 4 ? styles.addButtonDisabled : null,
                ]}
                disabled={pinVerifying || pinInput.length !== 4}
                accessibilityRole="button"
              >
                {pinVerifying ? (
                  <ActivityIndicator color={Colors.dark.buttonText} size="small" />
                ) : (
                  <Text style={styles.pinModalBtnConfirmText}>Confirm</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <FamilyWalletModal
        visible={showWallet}
        onClose={() => setShowWallet(false)}
      />
    </View>
  );
}

// ===========================================================================
// Task #1136 — Family Wallet modal: payment method + per-member spend caps +
// "this month" statement. Symmetric model: any family member can edit.
// ===========================================================================

type WalletCategory = "court_bookings" | "glow_market" | "tournament_fees";

interface WalletResponse {
  familyGroupId: string;
  paymentMethod: { brand: string | null; last4: string | null } | null;
  categories: { key: WalletCategory; label: string }[];
  members: Array<{
    playerId: string;
    name: string;
    avatarUrl: string | null;
    limits: Record<WalletCategory, number | null>;
  }>;
}

interface StatementResponse {
  familyGroupId: string;
  month: string;
  currency: string;
  members: Array<{
    playerId: string;
    playerName: string;
    byCategory: Record<WalletCategory, number>;
    total: number;
  }>;
  totals: {
    court_bookings: number;
    glow_market: number;
    tournament_fees: number;
    grandTotal: number;
  };
}

function FamilyWalletModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();

  // Wallet config: payment method + per-member limits.
  const wallet = useQuery<WalletResponse>({
    queryKey: ["/api/family/me/wallet"],
    enabled: visible,
  });

  // Statement: this month's per-member spend.
  const statement = useQuery<StatementResponse>({
    queryKey: ["/api/family/me/statement"],
    enabled: visible,
  });

  // Stripe Checkout (mode=setup) — opens hosted UI to add the family card.
  const setupIntent = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/family/me/wallet/setup-intent");
      return res.json() as Promise<{ checkoutUrl: string }>;
    },
    onSuccess: async (data) => {
      if (!data.checkoutUrl) {
        Alert.alert("Setup failed", "Could not start the payment setup. Please try again.");
        return;
      }
      try {
        await WebBrowser.openBrowserAsync(data.checkoutUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
      } catch {
        Alert.alert("Setup failed", "Could not open the payment page.");
      }
      // The webhook persists the card; refresh to pick it up.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/family/me/wallet"] });
      }, 1500);
    },
    onError: (e: any) => {
      Alert.alert("Setup failed", parseApiError(e, "Could not start payment setup"));
    },
  });

  const removeCard = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/family/me/wallet/payment-method");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family/me/wallet"] });
    },
    onError: (e: any) => {
      Alert.alert("Could not remove card", parseApiError(e, "Please try again."));
    },
  });

  // Stripe Customer Portal — opens hosted invoice/receipt history.
  const billingPortal = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/family/me/wallet/billing-portal");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: async (data) => {
      if (!data?.url) {
        Alert.alert("Couldn't open invoices", "Please try again.");
        return;
      }
      try {
        await WebBrowser.openBrowserAsync(data.url, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
      } catch {
        Alert.alert("Couldn't open invoices", "Could not open the billing page.");
      }
    },
    onError: (e: any) => {
      Alert.alert("Couldn't open invoices", parseApiError(e, "Please try again."));
    },
  });

  const setLimit = useMutation({
    mutationFn: async (vars: { playerId: string; category: WalletCategory; monthlyCap: number | null }) => {
      await apiRequest("PUT", "/api/family/me/wallet/limits", vars);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family/me/wallet"] });
    },
    onError: (e: any) => {
      Alert.alert("Could not save limit", parseApiError(e, "Please try again."));
    },
  });

  // Local edit buffers, keyed by `${playerId}:${category}`.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const handleSave = (playerId: string, category: WalletCategory) => {
    const key = `${playerId}:${category}`;
    const raw = (edits[key] ?? "").trim();
    let monthlyCap: number | null = null;
    if (raw !== "") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        Alert.alert("Invalid amount", "Enter a non-negative number, or leave blank for no limit.");
        return;
      }
      monthlyCap = n;
    }
    setLimit.mutate(
      { playerId, category, monthlyCap },
      {
        onSuccess: () => {
          setEdits((e) => {
            const next = { ...e };
            delete next[key];
            return next;
          });
        },
      },
    );
  };

  const cardLabel = wallet.data?.paymentMethod
    ? `${wallet.data.paymentMethod.brand?.toUpperCase() ?? "CARD"} •••• ${wallet.data.paymentMethod.last4 ?? "----"}`
    : "No card on file";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={walletStyles.overlay}>
        <View style={walletStyles.container}>
          <View style={walletStyles.header}>
            <View style={walletStyles.titleRow}>
              <Ionicons name="wallet" size={24} color="#00BCD4" />
              <Text style={walletStyles.title}>Family Wallet</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close family wallet">
              <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={walletStyles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Payment method */}
            <Text style={walletStyles.sectionTitle}>Payment method</Text>
            <View style={walletStyles.card}>
              <View style={walletStyles.cardRow}>
                <Ionicons
                  name={wallet.data?.paymentMethod ? "card" : "card-outline"}
                  size={22}
                  color={Colors.dark.text}
                />
                <Text style={walletStyles.cardLabel}>{cardLabel}</Text>
              </View>
              <View style={walletStyles.cardActions}>
                <Pressable
                  style={[walletStyles.actionBtn, walletStyles.actionPrimary]}
                  onPress={() => setupIntent.mutate()}
                  disabled={setupIntent.isPending}
                >
                  {setupIntent.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                  ) : (
                    <Text style={walletStyles.actionPrimaryText}>
                      {wallet.data?.paymentMethod ? "Update card" : "Add card"}
                    </Text>
                  )}
                </Pressable>
                {wallet.data?.paymentMethod ? (
                  <Pressable
                    style={[walletStyles.actionBtn, walletStyles.actionSecondary]}
                    onPress={() => removeCard.mutate()}
                    disabled={removeCard.isPending}
                  >
                    {removeCard.isPending ? (
                      <ActivityIndicator size="small" color={Colors.dark.text} />
                    ) : (
                      <Text style={walletStyles.actionSecondaryText}>Remove</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
              {wallet.data?.paymentMethod ? (
                <Pressable
                  style={walletStyles.linkRow}
                  onPress={() => billingPortal.mutate()}
                  disabled={billingPortal.isPending}
                  accessibilityRole="link"
                  accessibilityLabel="View family invoices and receipts"
                >
                  {billingPortal.isPending ? (
                    <ActivityIndicator size="small" color="#00BCD4" />
                  ) : (
                    <>
                      <Ionicons name="receipt-outline" size={18} color="#00BCD4" />
                      <Text style={walletStyles.linkText}>View invoices &amp; receipts</Text>
                      <Ionicons name="open-outline" size={16} color="#00BCD4" />
                    </>
                  )}
                </Pressable>
              ) : null}
              <Text style={walletStyles.cardHint}>
                One card pays for everyone in your family. Per-member caps still apply.
              </Text>
            </View>

            {/* Per-member spend limits */}
            <Text style={walletStyles.sectionTitle}>Monthly spend limits</Text>
            {wallet.isLoading ? (
              <ActivityIndicator color={Colors.dark.text} />
            ) : wallet.data?.members.length === 0 ? (
              <Text style={walletStyles.muted}>No family members yet.</Text>
            ) : (
              wallet.data?.members.map((m) => (
                <View key={m.playerId} style={walletStyles.card}>
                  <Text style={walletStyles.memberName}>{m.name}</Text>
                  {wallet.data!.categories.map((cat) => {
                    const key = `${m.playerId}:${cat.key}`;
                    const currentCents = m.limits[cat.key];
                    const placeholder = currentCents == null ? "No limit" : (currentCents / 100).toFixed(2);
                    const draft = edits[key];
                    const dirty = draft !== undefined;
                    const saving = setLimit.isPending && setLimit.variables?.playerId === m.playerId && setLimit.variables?.category === cat.key;
                    return (
                      <View key={cat.key} style={walletStyles.limitRow}>
                        <Text style={walletStyles.limitLabel}>{cat.label}</Text>
                        <View style={walletStyles.limitInputRow}>
                          <Text style={walletStyles.currency}>AED</Text>
                          <TextInput
                            style={walletStyles.limitInput}
                            value={draft ?? ""}
                            onChangeText={(v) => setEdits((e) => ({ ...e, [key]: v }))}
                            placeholder={placeholder}
                            placeholderTextColor={Colors.dark.textMuted}
                            keyboardType="numeric"
                            inputMode="decimal"
                          />
                          {dirty ? (
                            <Pressable
                              style={walletStyles.saveBtn}
                              onPress={() => handleSave(m.playerId, cat.key)}
                              disabled={saving}
                            >
                              {saving ? (
                                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                              ) : (
                                <Text style={walletStyles.saveBtnText}>Save</Text>
                              )}
                            </Pressable>
                          ) : currentCents != null ? (
                            <Pressable
                              style={walletStyles.clearBtn}
                              onPress={() =>
                                setLimit.mutate({ playerId: m.playerId, category: cat.key, monthlyCap: null })
                              }
                              accessibilityLabel={`Remove ${cat.label} limit for ${m.name}`}
                            >
                              <Ionicons name="close" size={18} color={Colors.dark.textMuted} />
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            )}

            {/* Statement */}
            <Text style={walletStyles.sectionTitle}>This month</Text>
            {statement.isLoading ? (
              <ActivityIndicator color={Colors.dark.text} />
            ) : statement.data ? (
              <View style={walletStyles.card}>
                <Text style={walletStyles.muted}>Month: {statement.data.month}</Text>
                {statement.data.members.map((m) => (
                  <View key={m.playerId} style={walletStyles.statementRow}>
                    <Text style={walletStyles.statementName}>{m.playerName || "Player"}</Text>
                    <Text style={walletStyles.statementAmount}>
                      {statement.data!.currency} {m.total.toFixed(2)}
                    </Text>
                  </View>
                ))}
                <View style={[walletStyles.statementRow, walletStyles.statementTotal]}>
                  <Text style={[walletStyles.statementName, walletStyles.statementTotalText]}>Total</Text>
                  <Text style={[walletStyles.statementAmount, walletStyles.statementTotalText]}>
                    {statement.data.currency} {statement.data.totals.grandTotal.toFixed(2)}
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const walletStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { fontSize: FontSizes.lg, fontWeight: "700", color: Colors.dark.text },
  body: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xl * 2 },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  cardLabel: { color: Colors.dark.text, fontSize: FontSizes.md, fontWeight: "600" },
  cardActions: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.xs },
  actionBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPrimary: { backgroundColor: "#00BCD4" },
  actionPrimaryText: { color: Colors.dark.buttonText, fontWeight: "700" },
  actionSecondary: { backgroundColor: Colors.dark.backgroundSecondary, borderWidth: 1, borderColor: Colors.dark.border },
  actionSecondaryText: { color: Colors.dark.text, fontWeight: "600" },
  cardHint: { color: Colors.dark.textMuted, fontSize: FontSizes.sm, marginTop: Spacing.xs },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  linkText: { color: "#00BCD4", fontWeight: "600", fontSize: FontSizes.sm },
  memberName: { color: Colors.dark.text, fontSize: FontSizes.md, fontWeight: "700", marginBottom: Spacing.xs },
  limitRow: { gap: Spacing.xs, marginTop: Spacing.xs },
  limitLabel: { color: Colors.dark.textMuted, fontSize: FontSizes.sm },
  limitInputRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  currency: { color: Colors.dark.textMuted, fontSize: FontSizes.sm, width: 36 },
  limitInput: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    color: Colors.dark.text,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    fontSize: FontSizes.md,
  },
  saveBtn: {
    backgroundColor: "#00BCD4",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  saveBtnText: { color: Colors.dark.buttonText, fontWeight: "700" },
  clearBtn: {
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  muted: { color: Colors.dark.textMuted, fontSize: FontSizes.sm },
  statementRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
  },
  statementName: { color: Colors.dark.text, fontSize: FontSizes.md },
  statementAmount: { color: Colors.dark.text, fontSize: FontSizes.md, fontVariant: ["tabular-nums"] },
  statementTotal: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  statementTotalText: { fontWeight: "700" },
});

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
  },
  welcomeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  welcomeText: {
    fontSize: FontSizes["3xl"],
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    marginLeft: 32,
  },
  payAllCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
  },
  payAllGradient: {
    padding: Spacing.md,
  },
  payAllContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  payAllLeft: {
    flex: 1,
    gap: 2,
  },
  payAllLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.gold,
    fontWeight: "500",
  },
  payAllAmount: {
    fontSize: FontSizes["2xl"],
    fontWeight: "700",
    color: Colors.dark.text,
  },
  payAllBreakdown: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  payAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.gold,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
  },
  payAllButtonText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    justifyContent: "center",
  },
  familyTodayWrap: {
    marginBottom: Spacing.md,
  },
  familyTodayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  familyTodayTitle: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.text,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  familyTodayContent: {
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  todayChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    maxWidth: 220,
  },
  todayChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  todayChipName: {
    fontSize: FontSizes.xs,
    color: Colors.dark.text,
    fontWeight: "600",
    maxWidth: 80,
  },
  todayChipTime: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    flexShrink: 1,
  },
  carpoolCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "#00BCD4" + "55",
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: 6,
  },
  carpoolHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  carpoolTitle: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: "#00BCD4",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  carpoolBody: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    justifyContent: "center",
    marginTop: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    maxWidth: 140,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "600",
    flexShrink: 1,
  },
  childCard: {
    width: 160,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardGradient: {
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: Colors.dark.primary,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  ballBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  onlineIndicator: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  childName: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  ballLevelTextBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    alignSelf: "center",
    marginBottom: 2,
  },
  ballLevelTextLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  levelText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  xpText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sessionText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
  },
  lastActiveText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  outstandingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  outstandingText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  graduateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "22",
    borderWidth: 1,
    borderColor: Colors.dark.gold + "55",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginTop: 4,
  },
  graduateBannerText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  graduatedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#00E676" + "22",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginTop: 4,
  },
  graduatedBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: "#00E676",
  },
  diveInButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  diveInText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  roleBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginLeft: 32,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  roleBadgeParent: {
    backgroundColor: "rgba(0,188,212,0.15)",
    borderWidth: 1,
    borderColor: "rgba(0,188,212,0.3)",
  },
  roleBadgeChild: {
    backgroundColor: Colors.dark.primary + "18",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "35",
  },
  roleBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  roleBadgeTextParent: {
    color: "#00BCD4",
  },
  roleBadgeTextChild: {
    color: Colors.dark.primary,
  },
  parentEmailText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    flexShrink: 1,
  },
  addChildStickyWrapper: {
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  addChildStickyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  createMemberButton: {
    backgroundColor: Colors.dark.primary,
  },
  addMemberSecondaryButton: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  addChildStickyText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  addMemberSecondaryText: {
    color: Colors.dark.textSecondary,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  footerText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  parentalControlsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(0,188,212,0.1)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(0,188,212,0.2)",
  },
  parentalControlsText: {
    flex: 1,
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: "#00BCD4",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  pinModalCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "90%",
    maxWidth: 360,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  pinModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "800",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  pinModalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  pinModalInput: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    textAlign: "center",
    letterSpacing: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  pinModalError: {
    fontSize: FontSizes.sm,
    color: "#FF6B6B",
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  pinModalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  pinModalBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  pinModalBtnCancel: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  pinModalBtnCancelText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  pinModalBtnConfirm: {
    backgroundColor: Colors.dark.primary,
  },
  pinModalBtnConfirmText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  modalContainer: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  modalSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  modalScroll: {
    maxHeight: 400,
  },
  controlCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  controlHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  controlAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  controlAvatarPlaceholder: {
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  controlName: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  controlLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  controlLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  tabRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  tabActive: {
    backgroundColor: Colors.dark.backgroundDefault,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: FontSizes.sm,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  tabContent: {
    gap: Spacing.md,
  },
  emailInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  addButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  spectatorMemberCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  spectatorMemberHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  spectatorEmpty: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
    paddingVertical: Spacing.sm,
  },
  spectatorLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  spectatorLinkRevoked: {
    opacity: 0.5,
  },
  spectatorLinkInfo: {
    flex: 1,
    minWidth: 0,
  },
  spectatorLinkUrl: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  spectatorLinkUrlMuted: {
    color: Colors.dark.textMuted,
    textDecorationLine: "line-through",
  },
  spectatorLinkMeta: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  spectatorLinkActions: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  spectatorIconBtn: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  spectatorGenerateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  spectatorGenerateText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  addButtonText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  codeBox: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  codeText: {
    fontSize: FontSizes["3xl"],
    fontWeight: "800",
    color: Colors.dark.primary,
    letterSpacing: 6,
  },
  codeExpiry: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  codeActions: {
    flexDirection: "row",
    gap: Spacing.md,
    justifyContent: "center",
  },
  codeActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  codeActionText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  refreshCodeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  refreshCodeText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  enterCodeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "center",
  },
  enterCodeInput: {
    flex: 1,
    backgroundColor: `${Colors.dark.primary}10`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 4,
    textAlign: "center",
  },
  enterCodeLookupBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  enterCodeLookupBtnDisabled: { opacity: 0.5 },
  enterCodeLookupBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  enterCodeErrorText: {
    fontSize: FontSizes.sm,
    color: "#FF5C5C",
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  enterCodePreviewCard: {
    backgroundColor: `${Colors.dark.primary}15`,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  enterCodePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  enterCodePreviewLabel: { fontSize: FontSizes.sm, color: Colors.dark.textMuted },
  enterCodePreviewName: { fontSize: FontSizes.lg, fontWeight: "700", color: Colors.dark.text },
  enterCodePreviewAcademy: { fontSize: FontSizes.sm, color: Colors.dark.textMuted, marginBottom: Spacing.xs },
  enterCodeSuccess: {
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  enterCodeSuccessTitle: { fontSize: FontSizes.xl, fontWeight: "700", color: Colors.dark.text },
  enterCodeSuccessText: { fontSize: FontSizes.md, color: Colors.dark.textMuted, textAlign: "center" },
}));

// Family F — small floating badge shown on a ChildCard when that account is
// currently in a screen-time lock. Kept outside the reactive style block so
// the badge doesn't get rebuilt on every theme tick.
const lockedBadgeStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,65,54,0.18)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.md,
    zIndex: 5,
  },
  text: { color: "#FF4136", fontSize: FontSizes.xs, fontWeight: "600" },
});
