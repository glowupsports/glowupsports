import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  DimensionValue,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";

const PURPLE = "#9B59B6";
const CYAN = Colors.dark.xpCyan;
const GREEN = Colors.dark.primary;
const AMBER = "#F39C12";
const RED = Colors.dark.error;

type Tab = "features" | "players" | "dead_zones";

const KNOWN_FEATURES: { key: string; label: string; category: string }[] = [
  { key: "tab:home", label: "Home Tab", category: "Navigation" },
  { key: "tab:social", label: "Social Tab", category: "Navigation" },
  { key: "tab:play", label: "Play Tab", category: "Navigation" },
  { key: "tab:schedule", label: "Schedule Tab", category: "Navigation" },
  { key: "tab:quests", label: "Quests Tab", category: "Navigation" },
  { key: "tab:stats", label: "Stats Tab", category: "Navigation" },
  { key: "tab:me", label: "Profile Tab", category: "Navigation" },
  { key: "action:book_lesson", label: "Book Lesson", category: "Training" },
  { key: "action:classes", label: "Classes", category: "Training" },
  { key: "action:open_session", label: "Open Session", category: "Training" },
  { key: "action:match", label: "Match", category: "Training" },
  { key: "screen:create_match", label: "Create Match", category: "Training" },
  { key: "screen:lesson_booking", label: "Lesson Booking", category: "Training" },
  { key: "screen:quick_book", label: "Quick Book", category: "Training" },
  { key: "action:chat_coach", label: "Chat Coach", category: "Training" },
  { key: "action:record_video", label: "Record Video", category: "Progress" },
  { key: "progress:skill_radar", label: "Skill Radar", category: "Progress" },
  { key: "progress:pillar_tap", label: "Pillar Tap", category: "Progress" },
  { key: "progress:level_readiness", label: "Level Readiness", category: "Progress" },
  { key: "progress:video_feedback", label: "Video Feedback", category: "Progress" },
  { key: "progress:coach_notes_all", label: "All Coach Notes", category: "Progress" },
  { key: "quests:tab_daily", label: "Daily Quests", category: "Training" },
  { key: "quests:tab_weekly", label: "Weekly Quests", category: "Training" },
  { key: "quests:tab_monthly", label: "Monthly Quests", category: "Training" },
  { key: "quests:claim", label: "Quest Claim", category: "Training" },
  { key: "quests:upload_proof", label: "Quest Proof Upload", category: "Training" },
  { key: "collection:badges", label: "Badges", category: "Progress" },
  { key: "collection:titles", label: "Titles", category: "Progress" },
  { key: "collection:equip_title", label: "Equip Title", category: "Progress" },
  { key: "tournaments:upcoming", label: "Upcoming Tournaments", category: "Competition" },
  { key: "tournaments:my_tournaments", label: "My Tournaments", category: "Competition" },
  { key: "tournaments:ladders", label: "Ladders", category: "Competition" },
  { key: "tournaments:register", label: "Tournament Register", category: "Competition" },
  { key: "ladder:challenge", label: "Ladder Challenge", category: "Competition" },
  { key: "community:feed_for_you", label: "For You Feed", category: "Social" },
  { key: "community:feed_friends", label: "Friends Feed", category: "Social" },
  { key: "community:create_post", label: "Create Post", category: "Social" },
  { key: "action:messages", label: "Messages", category: "Social" },
  { key: "action:marketplace", label: "Marketplace", category: "Shop" },
  { key: "action:shop", label: "Shop", category: "Shop" },
  { key: "screen:shop", label: "Shop Screen", category: "Shop" },
  { key: "action:equipment", label: "Equipment", category: "Shop" },
  { key: "schedule:session_detail", label: "Session Detail", category: "Training" },
  { key: "schedule:vacation_mode", label: "Vacation Mode", category: "Training" },
  { key: "match:log_match", label: "Log Match", category: "Training" },
  { key: "match:history", label: "Match History", category: "Training" },
  { key: "booking:court", label: "Court Booking", category: "Training" },
  { key: "home:quest_tracker", label: "Quest Tracker", category: "Training" },
  { key: "home:streak", label: "Streak", category: "Training" },
  { key: "home:family_lobby", label: "Family Lobby", category: "Navigation" },
  { key: "action:quests", label: "Quests Action", category: "Training" },
];

const CATEGORY_ORDER = ["Navigation", "Training", "Progress", "Social", "Competition", "Shop"];

const CATEGORY_COLORS: Record<string, string> = {
  Navigation: PURPLE,
  Training: GREEN,
  Progress: CYAN,
  Social: "#E74C3C",
  Competition: "#F39C12",
  Shop: "#27AE60",
};

interface FeatureUsageItem {
  feature: string;
  total: number;
  intensity: number;
}

interface PlayerActivityItem {
  player_id: string;
  player_name: string;
  level: number;
  xp: number;
  streak: number;
  matches_played: number;
  no_show_count: number;
  onboarding_completed: boolean;
  academy_id: string;
  academy_name: string;
  feature_events_period: number;
  feature_events_all_time: number;
  sessions_attended: number;
  bookings_made: number;
  feedback_given: number;
  quests_completed: number;
  engagement_score: number;
}

interface DrilldownPlayer {
  user_id: string;
  player_id: string;
  player_name: string;
  academy_name: string;
  count: number;
}

interface Academy {
  id: string;
  name: string;
}

function useAcademies() {
  return useQuery<{ academies: Academy[] }>({
    queryKey: ["/api/platform/academies"],
    queryFn: async () => {
      const url = new URL("/api/platform/academies", getApiUrl());
      const res = await fetch(url.toString(), { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });
}

function useFeatureUsage(days: number, academyId: string | null) {
  return useQuery<{ features: FeatureUsageItem[] }>({
    queryKey: ["/api/platform/analytics/feature-usage", days, academyId],
    queryFn: async ({ queryKey }) => {
      const [, d, aId] = queryKey as [string, number, string | null];
      let url = new URL(`/api/platform/analytics/feature-usage?days=${d}`, getApiUrl());
      if (aId) url.searchParams.set("academyId", aId);
      const res = await fetch(url.toString(), { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 1000 * 60 * 2,
  });
}

function usePlayerActivity(days: number, academyId: string | null) {
  return useQuery<{ players: PlayerActivityItem[] }>({
    queryKey: ["/api/platform/analytics/player-activity", days, academyId],
    queryFn: async ({ queryKey }) => {
      const [, d, aId] = queryKey as [string, number, string | null];
      let url = new URL(`/api/platform/analytics/player-activity?days=${d}`, getApiUrl());
      if (aId) url.searchParams.set("academyId", aId);
      const res = await fetch(url.toString(), { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 1000 * 60 * 2,
  });
}

function useFeatureDrilldown(feature: string | null, days: number, academyId: string | null) {
  return useQuery<{ players: DrilldownPlayer[] }>({
    queryKey: ["/api/platform/analytics/feature-drilldown", feature, days, academyId],
    queryFn: async ({ queryKey }) => {
      const [, f, d, aId] = queryKey as [string, string, number, string | null];
      let url = new URL(`/api/platform/analytics/feature-drilldown?feature=${encodeURIComponent(f)}&days=${d}`, getApiUrl());
      if (aId) url.searchParams.set("academyId", aId);
      const res = await fetch(url.toString(), { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!feature,
    staleTime: 1000 * 60 * 2,
  });
}

function FilterPills({ options, value, onChange }: {
  options: { label: string; value: string | number | null }[];
  value: string | number | null;
  onChange: (v: any) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
      {options.map((opt) => (
        <Pressable
          key={String(opt.value)}
          style={[s.pill, opt.value === value && s.pillActive]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(opt.value); }}
        >
          <Text style={[s.pillText, opt.value === value && s.pillTextActive]}>{opt.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function EngagementBar({ score }: { score: number }) {
  const color = score >= 60 ? GREEN : score >= 30 ? AMBER : score > 0 ? RED : Colors.dark.textSubtle;
  return (
    <View style={s.engBar}>
      <View style={[s.engFill, { width: `${Math.max(score, 2)}%` as DimensionValue, backgroundColor: color }]} />
    </View>
  );
}

function StatBadge({ icon, value, color }: { icon: string; value: number; color: string }) {
  return (
    <View style={s.statBadge}>
      <Ionicons name={icon as any} size={11} color={color} />
      <Text style={[s.statBadgeText, { color }]}>{value}</Text>
    </View>
  );
}

function PlayerCard({ player }: { player: PlayerActivityItem }) {
  const [expanded, setExpanded] = useState(false);
  const score = player.engagement_score;
  const engColor = score >= 60 ? GREEN : score >= 30 ? AMBER : score > 0 ? RED : Colors.dark.textSubtle;
  const isNeverOpened = player.feature_events_all_time === 0;
  const isActiveThisWeek = player.feature_events_period > 0;

  return (
    <Pressable
      style={s.playerCard}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setExpanded(e => !e); }}
    >
      <View style={s.playerCardHeader}>
        <View style={s.playerCardLeft}>
          <View style={[s.levelBadge, { backgroundColor: `${PURPLE}20` }]}>
            <Text style={[s.levelText, { color: PURPLE }]}>{player.level}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.playerName} numberOfLines={1}>{player.player_name}</Text>
            <Text style={s.academyName} numberOfLines={1}>{player.academy_name || "No academy"}</Text>
          </View>
        </View>
        <View style={s.playerCardRight}>
          <Text style={[s.scoreText, { color: engColor }]}>{score}</Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={Colors.dark.textMuted} />
        </View>
      </View>
      <EngagementBar score={score} />
      <View style={s.statRow}>
        <StatBadge icon="calendar" value={player.sessions_attended} color={CYAN} />
        <StatBadge icon="bookmark" value={player.bookings_made} color={GREEN} />
        <StatBadge icon="star" value={player.quests_completed} color={AMBER} />
        <StatBadge icon="chatbubble" value={player.feedback_given} color={PURPLE} />
        <StatBadge icon="phone-portrait" value={player.feature_events_period} color={Colors.dark.textMuted} />
      </View>
      <View style={s.badgeRow}>
        {player.onboarding_completed ? (
          <View style={[s.tag, { backgroundColor: `${GREEN}18`, borderColor: `${GREEN}40` }]}>
            <Text style={[s.tagText, { color: GREEN }]}>Activated</Text>
          </View>
        ) : (
          <View style={[s.tag, { backgroundColor: `${RED}18`, borderColor: `${RED}40` }]}>
            <Text style={[s.tagText, { color: RED }]}>Not activated</Text>
          </View>
        )}
        {isNeverOpened && (
          <View style={[s.tag, { backgroundColor: `${RED}18`, borderColor: `${RED}40` }]}>
            <Text style={[s.tagText, { color: RED }]}>Never opened app</Text>
          </View>
        )}
        {isActiveThisWeek && !isNeverOpened && (
          <View style={[s.tag, { backgroundColor: `${GREEN}18`, borderColor: `${GREEN}40` }]}>
            <Text style={[s.tagText, { color: GREEN }]}>Active this period</Text>
          </View>
        )}
        {player.no_show_count >= 2 && (
          <View style={[s.tag, { backgroundColor: `${AMBER}18`, borderColor: `${AMBER}40` }]}>
            <Text style={[s.tagText, { color: AMBER }]}>No-show risk</Text>
          </View>
        )}
      </View>
      {expanded && (
        <View style={s.expandedDetails}>
          <DetailRow label="Sessions attended" value={player.sessions_attended} />
          <DetailRow label="Lessons booked" value={player.bookings_made} />
          <DetailRow label="Quests completed" value={player.quests_completed} />
          <DetailRow label="Coach reviews given" value={player.feedback_given} />
          <DetailRow label="App events (period)" value={player.feature_events_period} />
          <DetailRow label="App events (all time)" value={player.feature_events_all_time} />
          <DetailRow label="Matches played" value={player.matches_played} />
          <DetailRow label="XP total" value={player.xp} />
          <DetailRow label="Streak days" value={player.streak} />
          <DetailRow label="No-shows" value={player.no_show_count} />
        </View>
      )}
    </Pressable>
  );
}

function DetailRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

function FeatureRow({ item, rank, days, academyId }: {
  item: FeatureUsageItem;
  rank: number;
  days: number;
  academyId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: drilldown, isLoading: drillLoading } = useFeatureDrilldown(
    expanded ? item.feature : null,
    days,
    academyId,
  );
  const known = KNOWN_FEATURES.find(f => f.key === item.feature);
  const label = known?.label || item.feature;
  const category = known?.category || "Other";
  const barColor = CATEGORY_COLORS[category] || PURPLE;

  return (
    <View>
      <Pressable
        style={[s.featureRow, { borderBottomWidth: expanded ? 0 : 1 }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setExpanded(e => !e); }}
      >
        <View style={s.featureRowLeft}>
          <View style={[s.rankBadge, { backgroundColor: `${barColor}18` }]}>
            <Text style={[s.rankText, { color: barColor }]}>{rank}</Text>
          </View>
          <View>
            <Text style={s.featureLabel} numberOfLines={1}>{label}</Text>
            <Text style={[s.categoryLabel, { color: barColor }]}>{category}</Text>
          </View>
        </View>
        <View style={s.featureRowRight}>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${Math.max(item.intensity * 100, 4)}%` as DimensionValue, backgroundColor: barColor }]} />
          </View>
          <Text style={s.countText}>{item.total}</Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={13} color={Colors.dark.textMuted} />
        </View>
      </Pressable>
      {expanded && (
        <View style={s.drilldownContainer}>
          {drillLoading ? (
            <ActivityIndicator size="small" color={PURPLE} style={{ marginVertical: 8 }} />
          ) : (drilldown?.players || []).length === 0 ? (
            <Text style={s.drillEmptyText}>No player data available</Text>
          ) : (
            drilldown!.players.map((p, i) => (
              <View key={p.user_id} style={[s.drillRow, i < drilldown!.players.length - 1 && s.drillBorder]}>
                <Text style={s.drillRank}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.drillName} numberOfLines={1}>{p.player_name || "Unknown player"}</Text>
                  <Text style={s.drillAcademy} numberOfLines={1}>{p.academy_name || "No academy"}</Text>
                </View>
                <Text style={[s.drillCount, { color: barColor }]}>{p.count}×</Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

function FeaturesTab({ days, academyId }: { days: number; academyId: string | null }) {
  const { data, isLoading, refetch, isRefetching } = useFeatureUsage(days, academyId);
  const features = data?.features || [];
  const usedKeys = new Set(features.map(f => f.feature));
  const deadZones = KNOWN_FEATURES.filter(f => !usedKeys.has(f.key));

  if (isLoading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={s.emptyText}>Loading features...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={PURPLE} />}
    >
      {features.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="bar-chart-outline" size={40} color={Colors.dark.textMuted} />
          <Text style={s.emptyText}>No events recorded yet</Text>
          <Text style={s.emptySubText}>Events appear as players use the app</Text>
        </View>
      ) : (
        <View style={s.card}>
          {features.map((item, index) => (
            <FeatureRow key={item.feature} item={item} rank={index + 1} days={days} academyId={academyId} />
          ))}
        </View>
      )}

      {deadZones.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <View style={s.sectionHeaderRow}>
            <Ionicons name="eye-off-outline" size={16} color={RED} />
            <Text style={[s.sectionLabel, { color: RED }]}>Not used in this period</Text>
            <View style={[s.countBadge, { backgroundColor: `${RED}20` }]}>
              <Text style={[s.countBadgeText, { color: RED }]}>{deadZones.length}</Text>
            </View>
          </View>
          <View style={s.card}>
            {CATEGORY_ORDER.map(cat => {
              const catDead = deadZones.filter(f => f.category === cat);
              if (!catDead.length) return null;
              const catColor = CATEGORY_COLORS[cat] || PURPLE;
              return (
                <View key={cat}>
                  <View style={[s.catHeader, { borderBottomColor: Colors.dark.border }]}>
                    <View style={[s.catDot, { backgroundColor: catColor }]} />
                    <Text style={[s.catTitle, { color: catColor }]}>{cat}</Text>
                  </View>
                  {catDead.map((f, i) => (
                    <View key={f.key} style={[s.deadRow, i < catDead.length - 1 && s.drillBorder]}>
                      <Text style={s.deadLabel}>{f.label}</Text>
                      <View style={[s.zeroBadge, { borderColor: `${RED}40` }]}>
                        <Text style={[s.zeroText, { color: RED }]}>0</Text>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function PlayersTab({ days, academyId }: { days: number; academyId: string | null }) {
  const { data, isLoading, refetch, isRefetching } = usePlayerActivity(days, academyId);
  const players = data?.players || [];
  const neverOpened = players.filter(p => p.feature_events_all_time === 0);
  const active = players.filter(p => p.feature_events_all_time > 0);

  if (isLoading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={s.emptyText}>Loading players...</Text>
      </View>
    );
  }

  if (players.length === 0) {
    return (
      <View style={s.centered}>
        <Ionicons name="people-outline" size={40} color={Colors.dark.textMuted} />
        <Text style={s.emptyText}>No players found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={PURPLE} />}
    >
      <View style={s.legendRow}>
        <View style={s.legendItem}>
          <Ionicons name="calendar" size={11} color={CYAN} />
          <Text style={s.legendText}>Sessions</Text>
        </View>
        <View style={s.legendItem}>
          <Ionicons name="bookmark" size={11} color={GREEN} />
          <Text style={s.legendText}>Bookings</Text>
        </View>
        <View style={s.legendItem}>
          <Ionicons name="star" size={11} color={AMBER} />
          <Text style={s.legendText}>Quests</Text>
        </View>
        <View style={s.legendItem}>
          <Ionicons name="chatbubble" size={11} color={PURPLE} />
          <Text style={s.legendText}>Feedback</Text>
        </View>
        <View style={s.legendItem}>
          <Ionicons name="phone-portrait" size={11} color={Colors.dark.textMuted} />
          <Text style={s.legendText}>App opens</Text>
        </View>
      </View>

      {active.map(p => <PlayerCard key={p.player_id} player={p} />)}

      {neverOpened.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <View style={s.sectionHeaderRow}>
            <Ionicons name="person-remove-outline" size={16} color={RED} />
            <Text style={[s.sectionLabel, { color: RED }]}>Never opened the app</Text>
            <View style={[s.countBadge, { backgroundColor: `${RED}20` }]}>
              <Text style={[s.countBadgeText, { color: RED }]}>{neverOpened.length}</Text>
            </View>
          </View>
          {neverOpened.map(p => <PlayerCard key={p.player_id} player={p} />)}
        </View>
      )}
    </ScrollView>
  );
}

function DeadZonesTab({ days, academyId }: { days: number; academyId: string | null }) {
  const { data, isLoading } = useFeatureUsage(days, academyId);
  const features = data?.features || [];
  const usedKeys = new Set(features.map(f => f.feature));
  const deadZones = KNOWN_FEATURES.filter(f => !usedKeys.has(f.key));

  if (isLoading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={s.emptyText}>Analyzing...</Text>
      </View>
    );
  }

  if (deadZones.length === 0) {
    return (
      <View style={s.centered}>
        <Ionicons name="checkmark-circle-outline" size={40} color={GREEN} />
        <Text style={s.emptyText}>All features are being used!</Text>
        <Text style={s.emptySubText}>No dead zones in this period.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.deadZoneSummary}>
        <Ionicons name="warning-outline" size={18} color={AMBER} />
        <Text style={s.deadZoneSummaryText}>
          {deadZones.length} features unused — consider promoting these to players
        </Text>
      </View>
      {CATEGORY_ORDER.map(cat => {
        const catDead = deadZones.filter(f => f.category === cat);
        if (!catDead.length) return null;
        const catColor = CATEGORY_COLORS[cat] || PURPLE;
        return (
          <View key={cat} style={{ marginBottom: 16 }}>
            <View style={s.sectionHeaderRow}>
              <View style={[s.catDot, { backgroundColor: catColor }]} />
              <Text style={[s.sectionLabel, { color: catColor }]}>{cat}</Text>
              <View style={[s.countBadge, { backgroundColor: `${catColor}20` }]}>
                <Text style={[s.countBadgeText, { color: catColor }]}>{catDead.length}</Text>
              </View>
            </View>
            <View style={s.card}>
              {catDead.map((f, i) => (
                <View key={f.key} style={[s.deadRowFull, i < catDead.length - 1 && s.drillBorder]}>
                  <View style={[s.catDot, { backgroundColor: catColor, marginRight: 8 }]} />
                  <Text style={[s.deadLabel, { flex: 1 }]}>{f.label}</Text>
                  <View style={[s.zeroBadge, { borderColor: `${RED}40` }]}>
                    <Text style={[s.zeroText, { color: RED }]}>0 players</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function PlayerActivityScreen({ route }: { route?: { params?: { initialTab?: Tab } } }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>(route?.params?.initialTab || "features");
  const [days, setDays] = useState(7);
  const [academyId, setAcademyId] = useState<string | null>(null);
  const { data: academiesData } = useAcademies();
  const academies = academiesData?.academies || [];

  const periodOptions = [
    { label: "Today", value: 1 },
    { label: "7d", value: 7 },
    { label: "30d", value: 30 },
  ];

  const academyOptions = useMemo(() => [
    { label: "All", value: null as string | null },
    ...academies.map(a => ({ label: a.name, value: a.id })),
  ], [academies]);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "features", label: "Features", icon: "analytics" },
    { key: "players", label: "Players", icon: "people" },
    { key: "dead_zones", label: "Dead Zones", icon: "eye-off" },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <Text style={s.headerTitle}>Player Activity</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={s.filtersBlock}>
        <FilterPills
          options={periodOptions}
          value={days}
          onChange={(v) => setDays(v as number)}
        />
        {academyOptions.length > 1 && (
          <FilterPills
            options={academyOptions}
            value={academyId}
            onChange={(v) => setAcademyId(v as string | null)}
          />
        )}
      </View>

      <View style={s.tabRow}>
        {tabs.map(tab => (
          <Pressable
            key={tab.key}
            style={[s.tabBtn, activeTab === tab.key && s.tabBtnActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(tab.key); }}
          >
            <Ionicons name={tab.icon as any} size={14} color={activeTab === tab.key ? PURPLE : Colors.dark.textMuted} />
            <Text style={[s.tabLabel, activeTab === tab.key && s.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.content}>
        {activeTab === "features" && <FeaturesTab days={days} academyId={academyId} />}
        {activeTab === "players" && <PlayersTab days={days} academyId={academyId} />}
        {activeTab === "dead_zones" && <DeadZonesTab days={days} academyId={academyId} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { ...Typography.h3, color: Colors.dark.text },
  filtersBlock: {
    paddingTop: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  pillRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  pillActive: {
    backgroundColor: `${PURPLE}20`,
    borderColor: PURPLE,
  },
  pillText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    fontSize: 12,
  },
  pillTextActive: { color: PURPLE },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  tabBtnActive: {
    backgroundColor: `${PURPLE}18`,
    borderColor: PURPLE,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  tabLabelActive: { color: PURPLE },
  content: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingTop: 60,
  },
  emptyText: { ...Typography.body, color: Colors.dark.textMuted, textAlign: "center" },
  emptySubText: { ...Typography.small, color: Colors.dark.textSubtle, textAlign: "center" },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  sectionLabel: { ...Typography.small, fontWeight: "700", flex: 1 },
  countBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: { fontSize: 11, fontWeight: "700" },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.sm,
    borderBottomColor: Colors.dark.border,
  },
  featureRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { fontSize: 11, fontWeight: "700" },
  featureLabel: { ...Typography.body, color: Colors.dark.text, fontSize: 13 },
  categoryLabel: { fontSize: 10, fontWeight: "600", marginTop: 1 },
  featureRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    width: 130,
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 3 },
  countText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    width: 28,
    textAlign: "right",
    fontWeight: "600",
  },
  drilldownContainer: {
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  drillRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
  },
  drillBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  drillRank: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    width: 20,
    textAlign: "center",
  },
  drillName: { ...Typography.small, color: Colors.dark.text, fontWeight: "600" },
  drillAcademy: { fontSize: 10, color: Colors.dark.textMuted },
  drillCount: { fontSize: 13, fontWeight: "700", minWidth: 30, textAlign: "right" },
  drillEmptyText: { ...Typography.small, color: Colors.dark.textMuted, textAlign: "center", padding: Spacing.sm },
  playerCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    marginBottom: 8,
    gap: 8,
  },
  playerCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  playerCardLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  playerCardRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  levelBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  levelText: { fontSize: 13, fontWeight: "700" },
  playerName: { ...Typography.body, color: Colors.dark.text, fontWeight: "600", fontSize: 14 },
  academyName: { fontSize: 11, color: Colors.dark.textMuted },
  scoreText: { fontSize: 18, fontWeight: "700" },
  engBar: {
    height: 5,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 3,
    overflow: "hidden",
  },
  engFill: { height: "100%", borderRadius: 3 },
  statRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  statBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statBadgeText: { fontSize: 11, fontWeight: "700" },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
  },
  tagText: { fontSize: 10, fontWeight: "600" },
  expandedDetails: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    gap: 6,
  },
  detailRow: { flexDirection: "row", justifyContent: "space-between" },
  detailLabel: { ...Typography.small, color: Colors.dark.textMuted },
  detailValue: { ...Typography.small, color: Colors.dark.text, fontWeight: "600" },
  legendRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendText: { fontSize: 10, color: Colors.dark.textMuted },
  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderBottomWidth: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  catDot: { width: 7, height: 7, borderRadius: 4 },
  catTitle: { fontSize: 11, fontWeight: "700" },
  deadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  deadRowFull: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  deadLabel: { ...Typography.small, color: Colors.dark.textMuted },
  zeroBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  zeroText: { fontSize: 10, fontWeight: "700" },
  deadZoneSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${AMBER}15`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${AMBER}30`,
  },
  deadZoneSummaryText: { ...Typography.small, color: Colors.dark.text, flex: 1, lineHeight: 18 },
});
