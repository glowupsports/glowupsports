import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { openDirections } from "@/lib/maps";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp, FadeIn } from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest, getStaticAssetsUrl, buildPhotoUrl, getApiUrl, getAuthHeaders } from "@/lib/query-client";

const BG = "#090E17";
const CARD_BG = "#12151C";
const CARD_BORDER = "#1E2332";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#8A95A8";
const TEXT_MUTED = "#4A5568";
const ACCENT = "#C8FF3D";

type SportFilter = "all" | "tennis" | "padel" | "pickleball";
type TypeFilter = "all" | "group" | "private" | "open_match";
type TravelTimeFilter = "any" | "20" | "30" | "45";

interface Participant {
  id: string;
  name: string;
  profilePhotoUrl?: string | null;
  level?: number;
}

interface ClassSession {
  id: string;
  type: string;
  date: string;
  time: string;
  spotsLeft: number;
  maxPlayers: number;
  coachName?: string;
  coachId?: string;
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
  distanceKm?: number;
}

interface DateGroup {
  dateLabel: string;
  dateKey: string;
  sessions: ClassSession[];
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

function formatDateLabel(dateStr: string): string {
  if (!dateStr) return "Today";
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const sessionDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (sessionDay.getTime() === today.getTime()) return "Today";
  if (sessionDay.getTime() === tomorrow.getTime()) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
}

function formatSessionTime(dateStr?: string, timeStr?: string): string {
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
    return timeStr || "TBD";
  }
}

function groupSessionsByDate(sessions: ClassSession[]): DateGroup[] {
  const map = new Map<string, ClassSession[]>();
  for (const s of sessions) {
    const dateStr = s.date || new Date().toISOString();
    const d = new Date(dateStr);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  const groups: DateGroup[] = [];
  for (const [key, sArr] of map.entries()) {
    groups.push({
      dateKey: key,
      dateLabel: formatDateLabel(sArr[0]?.date),
      sessions: sArr,
    });
  }
  groups.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return groups;
}

function SportFilterBottomSheet({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: SportFilter;
  onSelect: (s: SportFilter) => void;
  onClose: () => void;
}) {
  const sports: { id: SportFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: "all", label: "All Sports", icon: "globe-outline" },
    { id: "tennis", label: "Tennis", icon: "tennisball-outline" },
    { id: "padel", label: "Padel", icon: "square-outline" },
    { id: "pickleball", label: "Pickleball", icon: "oval-outline" },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Select Sport</Text>
        {sports.map((s) => (
          <Pressable
            key={s.id}
            style={[styles.sheetOption, selected === s.id && styles.sheetOptionSelected]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(s.id);
              onClose();
            }}
          >
            <View style={[styles.sheetRadio, selected === s.id && styles.sheetRadioSelected]}>
              {selected === s.id && <View style={styles.sheetRadioDot} />}
            </View>
            <Ionicons name={s.icon} size={20} color={selected === s.id ? ACCENT : TEXT_SECONDARY} />
            <Text style={[styles.sheetOptionText, selected === s.id && styles.sheetOptionTextSelected]}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

function ParticipantAvatars({ participants, maxPlayers }: { participants?: Participant[]; maxPlayers: number }) {
  if (!participants || participants.length === 0) return null;
  const shown = participants.slice(0, 5);
  const extra = participants.length > 5 ? participants.length - 5 : 0;
  return (
    <View style={styles.avatarsRow}>
      {shown.map((p, i) => (
        <View key={p.id} style={[styles.avatarCircle, { marginLeft: i > 0 ? -10 : 0, zIndex: 5 - i }]}>
          {p.profilePhotoUrl ? (
            <ExpoImage
              source={{ uri: buildPhotoUrl(p.profilePhotoUrl)! }}
              style={styles.avatarImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{p.name?.charAt(0)?.toUpperCase() || "?"}</Text>
            </View>
          )}
        </View>
      ))}
      {extra > 0 && (
        <View style={[styles.avatarCircle, styles.avatarExtra, { marginLeft: -10 }]}>
          <Text style={styles.avatarExtraText}>+{extra}</Text>
        </View>
      )}
      <Text style={styles.spotsText}>
        {participants.length}/{maxPlayers}
      </Text>
    </View>
  );
}

function SessionCard({
  session,
  onJoin,
  isJoining,
}: {
  session: ClassSession;
  onJoin: (id: string, type: string) => void;
  isJoining: boolean;
}) {
  const levelColor = getBallLevelColor(session.ballLevel);
  const currentPlayers = (session.maxPlayers || 6) - session.spotsLeft;
  const isFull = session.spotsLeft === 0;

  const typeLabel =
    session.type === "group"
      ? "Group Class"
      : session.type === "private"
      ? "Private"
      : session.type === "open_match"
      ? "Open Match"
      : "Session";

  const typeIcon: keyof typeof Ionicons.glyphMap =
    session.type === "group" ? "people" : session.type === "private" ? "person" : "tennisball";

  const sessionTime = formatSessionTime(session.date, session.time);

  return (
    <View style={[styles.sessionCard, { borderColor: levelColor + "30" }]}>
      <View style={styles.sessionCardInner}>
        <View style={styles.sessionCardTop}>
          <View style={styles.sessionTypeTag}>
            <Ionicons name={typeIcon} size={12} color={levelColor} />
            <Text style={[styles.sessionTypeText, { color: levelColor }]}>{typeLabel}</Text>
          </View>
          {session.ballLevel && (
            <View style={[styles.levelBadge, { backgroundColor: levelColor + "20", borderColor: levelColor + "60" }]}>
              <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
              <Text style={[styles.levelBadgeText, { color: levelColor }]}>
                {session.ballLevel.charAt(0).toUpperCase() + session.ballLevel.slice(1)}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.sessionTitle} numberOfLines={1}>
          {session.title ||
            (session.coachName
              ? `Class with ${session.coachName.split(" ")[0]}`
              : typeLabel)}
        </Text>

        <View style={styles.sessionMeta}>
          <Ionicons name="time-outline" size={13} color={TEXT_MUTED} />
          <Text style={styles.sessionMetaText}>{sessionTime}</Text>
          {session.locationName && (
            <>
              <Text style={styles.sessionMetaDot}>·</Text>
              <Pressable
                style={styles.locationLink}
                onPress={() => openDirections({ lat: session.locationLat, lng: session.locationLng, label: session.locationName, address: session.locationAddress })}
              >
                <Ionicons name="navigate-outline" size={12} color={ACCENT} />
                <Text style={styles.locationLinkText} numberOfLines={1}>
                  {session.distanceKm !== undefined ? `${session.distanceKm}km · ` : ""}
                  {session.locationName}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.sessionBottom}>
          <ParticipantAvatars participants={session.participants} maxPlayers={session.maxPlayers || 6} />

          {session.isEnrolled ? (
            <View style={styles.bookedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={ACCENT} />
              <Text style={styles.bookedText}>Booked</Text>
            </View>
          ) : isFull ? (
            <View style={styles.fullBadge}>
              <Text style={styles.fullBadgeText}>Full</Text>
            </View>
          ) : (
            <Pressable
              style={[styles.joinButton, isJoining && styles.joinButtonDisabled]}
              onPress={() => !isJoining && onJoin(session.id, session.type)}
            >
              {isJoining ? (
                <ActivityIndicator size="small" color={BG} />
              ) : (
                <>
                  <Text style={styles.joinButtonText}>
                    Join{session.price != null ? ` — AED ${session.price}` : ""}
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ClassesDiscoveryScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"available" | "my">("available");
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [aroundMeActive, setAroundMeActive] = useState(false);
  const [showSportSheet, setShowSportSheet] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [travelTimeFilter, setTravelTimeFilter] = useState<TravelTimeFilter>("any");
  const [sessionTravelMinutes, setSessionTravelMinutes] = useState<Map<string, number>>(new Map());

  const queryParams = new URLSearchParams();
  if (sportFilter !== "all") queryParams.set("sport", sportFilter);
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  const queryString = queryParams.toString();
  const socialQueryKey = queryString
    ? `/api/player/me/social?${queryString}`
    : "/api/player/me/social";

  const { data, isLoading, refetch, isRefetching } = useQuery<{
    openSessions: ClassSession[];
  }>({
    queryKey: [socialQueryKey],
  });

  const { data: playerProfile } = useQuery<{ player: { lastLatitude?: number | null; lastLongitude?: number | null } }>({
    queryKey: ["/api/player/me"],
  });
  const playerLat = playerProfile?.player?.lastLatitude ?? null;
  const playerLng = playerProfile?.player?.lastLongitude ?? null;

  const allSessions: ClassSession[] = data?.openSessions || [];

  useEffect(() => {
    if (playerLat == null || playerLng == null || allSessions.length === 0) return;
    const locDests: Array<{ id: string; lat: number; lng: number }> = [];
    const seen = new Set<string>();
    for (const s of allSessions) {
      if (s.locationLat != null && s.locationLng != null) {
        const key = `${s.locationLat},${s.locationLng}`;
        if (!seen.has(key)) {
          seen.add(key);
          locDests.push({ id: key, lat: s.locationLat, lng: s.locationLng });
        }
      }
    }
    if (locDests.length === 0) return;
    const controller = new AbortController();
    const fetchTimes = async () => {
      try {
        const destsJson = encodeURIComponent(JSON.stringify(locDests));
        const url = new URL(`/api/maps/distance-matrix?originLat=${playerLat}&originLng=${playerLng}&destinations=${destsJson}`, getApiUrl()).toString();
        const res = await fetch(url, { credentials: "include", headers: getAuthHeaders(), signal: controller.signal });
        if (!res.ok) return;
        const resp = await res.json();
        const newMap = new Map<string, number>();
        for (const r of resp.results || []) {
          if (r.durationMinutes != null) newMap.set(r.id, r.durationMinutes);
        }
        setSessionTravelMinutes(newMap);
      } catch { }
    };
    fetchTimes();
    return () => controller.abort();
  }, [playerLat, playerLng, allSessions.map((s: ClassSession) => s.id).join(",")]);

  const joinSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("POST", `/api/play/sessions/${sessionId}/join`);
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social"] });
      queryClient.invalidateQueries({ queryKey: [socialQueryKey] });
      Alert.alert("Booked", "You have successfully joined this session.");
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error.message || "Failed to join session");
    },
    onSettled: () => setJoiningId(null),
  });

  const joinMatchRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest("POST", `/api/play/match-requests/${requestId}/join`);
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social"] });
      queryClient.invalidateQueries({ queryKey: [socialQueryKey] });
      Alert.alert("Match Accepted", "You have accepted this open match challenge.");
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error.message || "Failed to join match request");
    },
    onSettled: () => setJoiningId(null),
  });

  const handleJoin = useCallback(
    (sessionId: string, sessionType: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setJoiningId(sessionId);
      if (sessionType === "open_match") {
        joinMatchRequestMutation.mutate(sessionId);
      } else {
        joinSessionMutation.mutate(sessionId);
      }
    },
    [joinSessionMutation, joinMatchRequestMutation],
  );

  const filteredSessions = useMemo(() => {
    let sessions = allSessions;
    if (typeFilter !== "all") {
      sessions = sessions.filter((s) => s.type === typeFilter);
    }
    if (activeTab === "my") {
      sessions = sessions.filter((s) => s.isEnrolled);
    }
    if (travelTimeFilter !== "any" && sessionTravelMinutes.size > 0) {
      const maxMin = parseInt(travelTimeFilter);
      sessions = sessions.filter((s) => {
        if (s.locationLat == null || s.locationLng == null) return true;
        const key = `${s.locationLat},${s.locationLng}`;
        const mins = sessionTravelMinutes.get(key);
        if (mins == null) return true;
        return mins <= maxMin;
      });
    }
    if (aroundMeActive) {
      sessions = [...sessions].sort((a, b) => {
        const getMin = (s: ClassSession) => {
          if (s.locationLat != null && s.locationLng != null) {
            const m = sessionTravelMinutes.get(`${s.locationLat},${s.locationLng}`);
            if (m != null) return m;
          }
          return s.distanceKm ?? Infinity;
        };
        return getMin(a) - getMin(b);
      });
    }
    return sessions;
  }, [allSessions, typeFilter, activeTab, aroundMeActive, travelTimeFilter, sessionTravelMinutes]);

  const dateGroups = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions]);

  const listData = useMemo(() => {
    const items: Array<{ type: "header"; label: string } | { type: "session"; session: ClassSession }> = [];
    for (const group of dateGroups) {
      items.push({ type: "header", label: group.dateLabel });
      for (const s of group.sessions) {
        items.push({ type: "session", session: s });
      }
    }
    return items;
  }, [dateGroups]);

  const typeFilters: { id: TypeFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "group", label: "Group" },
    { id: "private", label: "Private" },
    { id: "open_match", label: "Open Match" },
  ];

  const sportLabel =
    sportFilter === "all"
      ? "Sport"
      : sportFilter.charAt(0).toUpperCase() + sportFilter.slice(1);

  const renderItem = useCallback(
    ({ item, index }: { item: typeof listData[0]; index: number }) => {
      if (item.type === "header") {
        return (
          <Animated.View entering={FadeIn.duration(300)}>
            <View style={styles.dateHeader}>
              <Text style={styles.dateHeaderText}>{item.label}</Text>
            </View>
          </Animated.View>
        );
      }
      const { session } = item;
      return (
        <Animated.View entering={FadeInUp.delay(50).duration(300)}>
          <SessionCard
            session={session}
            onJoin={handleJoin}
            isJoining={joiningId === session.id}
          />
        </Animated.View>
      );
    },
    [handleJoin, joiningId],
  );

  const keyExtractor = useCallback((item: typeof listData[0], index: number) => {
    if (item.type === "header") return `header-${item.label}`;
    return `session-${item.session.id}-${index}`;
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: BG }]}>
      <SportFilterBottomSheet
        visible={showSportSheet}
        selected={sportFilter}
        onSelect={setSportFilter}
        onClose={() => setShowSportSheet(false)}
      />

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === "available" && styles.tabActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab("available");
          }}
        >
          <Text style={[styles.tabText, activeTab === "available" && styles.tabTextActive]}>
            Available
          </Text>
          {activeTab === "available" && <View style={styles.tabIndicator} />}
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "my" && styles.tabActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab("my");
          }}
        >
          <Text style={[styles.tabText, activeTab === "my" && styles.tabTextActive]}>
            My Classes
          </Text>
          {activeTab === "my" && <View style={styles.tabIndicator} />}
        </Pressable>
      </View>

      <View style={styles.filtersRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScroll}
        >
          <Pressable
            style={[styles.filterChip, sportFilter !== "all" && styles.filterChipActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowSportSheet(true);
            }}
          >
            <Ionicons
              name="tennisball-outline"
              size={14}
              color={sportFilter !== "all" ? ACCENT : TEXT_SECONDARY}
            />
            <Text style={[styles.filterChipText, sportFilter !== "all" && styles.filterChipTextActive]}>
              {sportLabel}
            </Text>
            <Ionicons name="chevron-down" size={12} color={sportFilter !== "all" ? ACCENT : TEXT_SECONDARY} />
          </Pressable>

          {typeFilters.map((tf) => (
            <Pressable
              key={tf.id}
              style={[styles.filterChip, typeFilter === tf.id && tf.id !== "all" && styles.filterChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTypeFilter(tf.id);
              }}
            >
              <Text
                style={[
                  styles.filterChipText,
                  typeFilter === tf.id && tf.id !== "all" && styles.filterChipTextActive,
                  typeFilter === tf.id && tf.id === "all" && styles.filterChipTextSelected,
                ]}
              >
                {tf.label}
              </Text>
            </Pressable>
          ))}

          <Pressable
            style={[styles.filterChip, aroundMeActive && styles.filterChipActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAroundMeActive((prev) => !prev);
            }}
          >
            <Ionicons
              name="location-outline"
              size={14}
              color={aroundMeActive ? ACCENT : TEXT_SECONDARY}
            />
            <Text style={[styles.filterChipText, aroundMeActive && styles.filterChipTextActive]}>
              Around me
            </Text>
          </Pressable>

          {(["any", "20", "30", "45"] as TravelTimeFilter[]).map((t) => {
            const isAny = t === "any";
            const isActive = travelTimeFilter === t;
            return (
              <Pressable
                key={t}
                style={[styles.filterChip, isActive && !isAny && styles.filterChipActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTravelTimeFilter(t);
                }}
              >
                {!isAny && (
                  <Ionicons
                    name="car-outline"
                    size={13}
                    color={isActive ? ACCENT : TEXT_SECONDARY}
                  />
                )}
                <Text
                  style={[
                    styles.filterChipText,
                    isActive && !isAny && styles.filterChipTextActive,
                    isActive && isAny && styles.filterChipTextSelected,
                  ]}
                >
                  {isAny ? "Any drive" : `<${t} min`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.loadingText}>Finding classes near you...</Text>
        </View>
      ) : listData.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="calendar-outline" size={52} color={TEXT_MUTED} />
          <Text style={styles.emptyTitle}>
            {activeTab === "my" ? "No booked classes" : "No classes available"}
          </Text>
          <Text style={styles.emptySubtitle}>
            {activeTab === "my"
              ? "Classes you join will appear here."
              : "Try adjusting your filters or check back later."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={ACCENT}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
    backgroundColor: BG,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    position: "relative",
  },
  tabActive: {},
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: TEXT_SECONDARY,
  },
  tabTextActive: {
    color: TEXT_PRIMARY,
    fontWeight: "700",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    right: "20%",
    height: 2,
    backgroundColor: ACCENT,
    borderRadius: 1,
  },
  filtersRow: {
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
    backgroundColor: BG,
  },
  filtersScroll: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
  },
  filterChipActive: {
    borderColor: ACCENT + "80",
    backgroundColor: ACCENT + "15",
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: TEXT_SECONDARY,
  },
  filterChipTextActive: {
    color: ACCENT,
    fontWeight: "600",
  },
  filterChipTextSelected: {
    color: TEXT_PRIMARY,
    fontWeight: "600",
  },
  listContent: {
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  dateHeader: {
    paddingVertical: Spacing.md,
    paddingTop: Spacing.lg,
  },
  dateHeaderText: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    letterSpacing: 0.3,
  },
  sessionCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    backgroundColor: CARD_BG,
    marginBottom: Spacing.sm,
    overflow: "hidden",
  },
  sessionCardInner: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sessionCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sessionTypeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sessionTypeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    lineHeight: 20,
  },
  sessionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  sessionMetaText: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    flexShrink: 1,
  },
  sessionMetaDot: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginHorizontal: 2,
  },
  locationLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 1,
  },
  locationLinkText: {
    fontSize: 12,
    color: ACCENT,
    flexShrink: 1,
  },
  sessionBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  avatarsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BG,
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1E2332",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 11,
    fontWeight: "700",
    color: TEXT_SECONDARY,
  },
  avatarExtra: {
    backgroundColor: "#1E2332",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarExtraText: {
    fontSize: 9,
    fontWeight: "700",
    color: TEXT_SECONDARY,
  },
  spotsText: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginLeft: Spacing.xs,
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: ACCENT,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    justifyContent: "center",
  },
  joinButtonDisabled: {
    opacity: 0.6,
  },
  joinButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0B0D10",
  },
  bookedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: ACCENT + "15",
    borderWidth: 1,
    borderColor: ACCENT + "40",
  },
  bookedText: {
    fontSize: 13,
    fontWeight: "700",
    color: ACCENT,
  },
  fullBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#EF444420",
    borderWidth: 1,
    borderColor: "#EF444440",
  },
  fullBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#EF4444",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 20,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#12151C",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: 40,
    gap: Spacing.sm,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#2A2E3A",
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: Spacing.sm,
  },
  sheetOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  sheetOptionSelected: {
    backgroundColor: ACCENT + "10",
  },
  sheetRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#3A4050",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetRadioSelected: {
    borderColor: ACCENT,
  },
  sheetRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ACCENT,
  },
  sheetOptionText: {
    fontSize: 15,
    fontWeight: "500",
    color: TEXT_SECONDARY,
    flex: 1,
  },
  sheetOptionTextSelected: {
    color: TEXT_PRIMARY,
    fontWeight: "700",
  },
});
