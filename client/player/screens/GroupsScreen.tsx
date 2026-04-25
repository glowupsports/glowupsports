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
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown, SlideInUp } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { ThemedText as Text } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { apiRequest, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { LockedScreen } from "../components/LockedScreen";
import GroupPreviewSheet, { type SheetGroup } from "@/player/components/community/GroupPreviewSheet";
import { useSport, getSportColor, getSportLabel, getSportIcon } from "@/player/context/SportContext";
import { SportSwitcherChips } from "@/player/components/SportSwitcherChips";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface Group {
  id: string;
  name: string;
  description?: string;
  type: string;
  memberCount: number;
  avatarUrl?: string;
  accentColor?: string;
  isPrivate: boolean;
  isMember: boolean;
  role?: string;
  seriesId?: string | null;
  seriesDayOfWeek?: number | null;
  seriesStartTime?: string | null;
  seriesSessionType?: string | null;
  lastMessageAt?: string | null;
}

interface GroupsData {
  myGroups: Group[];
  discover: Group[];
}

type ActiveTab = "communities" | "training" | "discover";
type DayChip = "all" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type FormatChip = "all" | "group" | "semi_private" | "private";
type TrainingSort = "schedule" | "recent";

type Props = NativeStackScreenProps<PlayerStackParamList, "Groups">;

const DAY_CHIPS: { key: DayChip; label: string; dow: number | null }[] = [
  { key: "all", label: "All days", dow: null },
  { key: "mon", label: "Mon", dow: 1 },
  { key: "tue", label: "Tue", dow: 2 },
  { key: "wed", label: "Wed", dow: 3 },
  { key: "thu", label: "Thu", dow: 4 },
  { key: "fri", label: "Fri", dow: 5 },
  { key: "sat", label: "Sat", dow: 6 },
  { key: "sun", label: "Sun", dow: 0 },
];

const FORMAT_CHIPS: { key: FormatChip; label: string; sessionTypes: string[] | null }[] = [
  { key: "all", label: "All", sessionTypes: null },
  { key: "group", label: "Group", sessionTypes: ["group"] },
  { key: "semi_private", label: "Semi-Private", sessionTypes: ["semi", "semi_private"] },
  { key: "private", label: "Private", sessionTypes: ["private"] },
];

const DAY_LABEL_LONG: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

const DAY_LABEL_SHORT: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

function isTrainingGroup(g: Group): boolean {
  return !!g.seriesId;
}

function filterTrainingGroups(groups: Group[], day: DayChip, format: FormatChip): Group[] {
  const dayCfg = DAY_CHIPS.find((c) => c.key === day);
  const fmtCfg = FORMAT_CHIPS.find((c) => c.key === format);
  return groups.filter((g) => {
    if (dayCfg?.dow !== null && dayCfg?.dow !== undefined) {
      if (g.seriesDayOfWeek !== dayCfg.dow) return false;
    }
    if (fmtCfg?.sessionTypes) {
      const st = g.seriesSessionType ?? "";
      if (!fmtCfg.sessionTypes.includes(st)) return false;
    }
    return true;
  });
}

function sortTrainingGroups(groups: Group[], sortBy: TrainingSort): Group[] {
  const arr = [...groups];
  if (sortBy === "recent") {
    arr.sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tb - ta;
    });
  } else {
    // By schedule: Monday first, Sunday last, irregular/unknown (-1, null, undefined) last,
    // then start time as a tiebreaker.
    const norm = (d: number | null | undefined): number => {
      if (d === null || d === undefined || d < 0 || d > 6) return 999;
      return d === 0 ? 7 : d; // Sun -> 7 so Mon comes first
    };
    arr.sort((a, b) => {
      const na = norm(a.seriesDayOfWeek);
      const nb = norm(b.seriesDayOfWeek);
      if (na !== nb) return na - nb;
      const sa = a.seriesStartTime ?? "99:99";
      const sb = b.seriesStartTime ?? "99:99";
      return sa.localeCompare(sb);
    });
  }
  return arr;
}

function sortCommunityGroups(groups: Group[]): Group[] {
  return [...groups].sort((a, b) => a.name.localeCompare(b.name));
}

function trainingSubtitle(g: Group): string | null {
  if (g.seriesDayOfWeek === null || g.seriesDayOfWeek === undefined) return null;
  const dow = g.seriesDayOfWeek;
  if (dow < 0 || dow > 6) return null;
  const day = DAY_LABEL_SHORT[dow];
  const time = g.seriesStartTime ?? "";
  return time ? `${day} • ${time}` : day;
}

const GROUP_TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  level: { icon: "tennisball", color: "#9AE66E" },
  team: { icon: "shield", color: "#4ECDC4" },
  academy: { icon: "business", color: "#FFD700" },
  event: { icon: "calendar", color: "#FF6B35" },
  friends: { icon: "people", color: "#E040FB" },
};

function GroupCard({ 
  group, 
  onPress, 
  onJoin, 
  onLeave 
}: { 
  group: Group; 
  onPress: () => void;
  onJoin?: () => void;
  onLeave?: () => void;
}) {
  const typeConfig = GROUP_TYPE_ICONS[group.type] || GROUP_TYPE_ICONS.friends;
  const trainingMeta = isTrainingGroup(group) ? trainingSubtitle(group) : null;
  
  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <Pressable onPress={onPress}>
        <Card style={styles.groupCard}>
          <View style={styles.groupHeader}>
            <View style={[styles.groupAvatar, { backgroundColor: group.accentColor || typeConfig.color + "30" }]}>
              {group.avatarUrl ? (
                <Ionicons name="image" size={24} color={typeConfig.color} />
              ) : (
                <Ionicons name={typeConfig.icon as any} size={24} color={typeConfig.color} />
              )}
            </View>
            <View style={styles.groupInfo}>
              <View style={styles.groupNameRow}>
                <Text style={styles.groupName}>{group.name}</Text>
                {group.isPrivate && (
                  <Ionicons name="lock-closed" size={14} color={Colors.dark.textMuted} style={{ marginLeft: 6 }} />
                )}
              </View>
              <Text style={styles.groupMeta}>
                {trainingMeta
                  ? `${trainingMeta} • ${group.memberCount} member${group.memberCount !== 1 ? "s" : ""}`
                  : `${group.memberCount} member${group.memberCount !== 1 ? "s" : ""} • ${group.type}`}
              </Text>
            </View>
            {group.isMember ? (
              group.role === "admin" ? (
                <View style={styles.adminBadge}>
                  <Ionicons name="star" size={12} color={Colors.dark.gold} />
                  <Text style={styles.adminBadgeText}>Admin</Text>
                </View>
              ) : (
                <Pressable style={styles.memberBadge} onPress={onLeave}>
                  <Ionicons name="checkmark" size={14} color={Colors.dark.primary} />
                  <Text style={styles.memberBadgeText}>Joined</Text>
                </Pressable>
              )
            ) : (
              <Pressable style={styles.joinButton} onPress={onJoin}>
                <Text style={styles.joinButtonText}>Join</Text>
              </Pressable>
            )}
          </View>
          {group.description && (
            <Text style={styles.groupDescription} numberOfLines={2}>
              {group.description}
            </Text>
          )}
        </Card>
      </Pressable>
    </Animated.View>
  );
}

function CreateGroupModal({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; description: string; type: string; isPrivate: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("friends");
  const [isPrivate, setIsPrivate] = useState(false);

  const handleCreate = () => {
    if (name.trim().length < 2) {
      Alert.alert("Invalid Name", "Group name must be at least 2 characters");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCreate({ name: name.trim(), description: description.trim(), type, isPrivate });
    setName("");
    setDescription("");
    setType("friends");
    setIsPrivate(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <Animated.View entering={SlideInUp.duration(300)} style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Group</Text>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          <Text style={styles.inputLabel}>Group Name</Text>
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={setName}
            placeholder="Enter group name..."
            placeholderTextColor={Colors.dark.textMuted}
            maxLength={50}
          />

          <Text style={styles.inputLabel}>Description (optional)</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What's this group about?"
            placeholderTextColor={Colors.dark.textMuted}
            maxLength={200}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.inputLabel}>Group Type</Text>
          <View style={styles.typeSelector}>
            {Object.entries(GROUP_TYPE_ICONS).map(([key, config]) => (
              <Pressable
                key={key}
                style={[styles.typeOption, type === key && { borderColor: config.color, backgroundColor: config.color + "20" }]}
                onPress={() => setType(key)}
              >
                <Ionicons name={config.icon as any} size={18} color={type === key ? config.color : Colors.dark.textMuted} />
                <Text style={[styles.typeOptionText, type === key && { color: config.color }]}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.privateToggle} onPress={() => setIsPrivate(!isPrivate)}>
            <View style={styles.privateToggleLeft}>
              <Ionicons name="lock-closed" size={18} color={Colors.dark.textSecondary} />
              <Text style={styles.privateToggleText}>Private Group</Text>
            </View>
            <View style={[styles.toggleSwitch, isPrivate && styles.toggleSwitchActive]}>
              <View style={[styles.toggleKnob, isPrivate && styles.toggleKnobActive]} />
            </View>
          </Pressable>

          <Pressable style={styles.createButton} onPress={handleCreate}>
            <LinearGradient
              colors={[Colors.dark.primary, "#5ABB44"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.createButtonGradient}
            >
              <Text style={styles.createButtonText}>Create Group</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function TrainingFilterBar({
  dayChip,
  formatChip,
  sortBy,
  onDayChange,
  onFormatChange,
  onSortChange,
  totalCount,
  shownCount,
  filterActive,
}: {
  dayChip: DayChip;
  formatChip: FormatChip;
  sortBy: TrainingSort;
  onDayChange: (d: DayChip) => void;
  onFormatChange: (f: FormatChip) => void;
  onSortChange: (s: TrainingSort) => void;
  totalCount: number;
  shownCount: number;
  filterActive: boolean;
}) {
  return (
    <View style={styles.filterBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipsRow}
      >
        {DAY_CHIPS.map((c) => {
          const isActive = c.key === dayChip;
          return (
            <Pressable
              key={c.key}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onDayChange(c.key);
              }}
              style={[styles.filterChip, isActive ? styles.filterChipActive : styles.filterChipInactive]}
            >
              <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : styles.filterChipTextInactive]}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipsRowSecondary}
      >
        {FORMAT_CHIPS.map((c) => {
          const isActive = c.key === formatChip;
          return (
            <Pressable
              key={c.key}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onFormatChange(c.key);
              }}
              style={[styles.filterChipSmall, isActive ? styles.filterChipActive : styles.filterChipInactive]}
            >
              <Text style={[styles.filterChipTextSmall, isActive ? styles.filterChipTextActive : styles.filterChipTextInactive]}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.filterMetaRow}>
        {filterActive ? (
          <Text style={styles.filterCountText}>
            Showing {shownCount} of {totalCount} {totalCount === 1 ? "class" : "classes"}
          </Text>
        ) : (
          <View />
        )}
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onSortChange(sortBy === "schedule" ? "recent" : "schedule");
          }}
          style={styles.sortToggle}
          hitSlop={10}
        >
          <Ionicons
            name={sortBy === "schedule" ? "calendar-outline" : "time-outline"}
            size={14}
            color={Colors.dark.textSecondary}
          />
          <Text style={styles.sortToggleText}>
            {sortBy === "schedule" ? "By schedule" : "By recently active"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function GroupsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = insets.bottom + 60;
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const routeInitialTab = route.params?.initialTab;
  const resolveInitialTab = (t: typeof routeInitialTab): ActiveTab =>
    t === "training" ? "training" : t === "discover" ? "discover" : "communities";
  const [activeTab, setActiveTab] = useState<ActiveTab>(resolveInitialTab(routeInitialTab));
  // If the screen is already mounted and a deep-link re-navigates to Groups
  // with a new initialTab (e.g. from a push notification pre-stack), apply it.
  useEffect(() => {
    if (routeInitialTab) {
      setActiveTab(resolveInitialTab(routeInitialTab));
    }
  }, [routeInitialTab]);
  const [dayChip, setDayChip] = useState<DayChip>("all");
  const [formatChip, setFormatChip] = useState<FormatChip>("all");
  const [trainingSort, setTrainingSort] = useState<TrainingSort>("schedule");
  const [previewGroup, setPreviewGroup] = useState<SheetGroup | null>(null);
  const { isMultiSport, activeSport } = useSport();

  const { data, isLoading, refetch, isRefetching } = useQuery<GroupsData>({
    queryKey: ["/api/player/groups", activeSport],
    queryFn: async () => {
      const url = new URL("/api/player/groups", getApiUrl());
      url.searchParams.set("sport", activeSport);
      const res = await fetch(url.toString(), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to load groups");
      return res.json() as Promise<GroupsData>;
    },
  });

  const joinMutation = useMutation({
    mutationFn: (groupId: string) => apiRequest("POST", `/api/player/groups/${groupId}/join`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/groups"] });
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to join group");
    },
  });

  const leaveMutation = useMutation({
    mutationFn: (groupId: string) => apiRequest("POST", `/api/player/groups/${groupId}/leave`),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ["/api/player/groups"] });
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to leave group");
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; type: string; isPrivate: boolean }) =>
      apiRequest("POST", "/api/player/groups", data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/groups"] });
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to create group");
    },
  });

  const handleGroupPress = (group: Group) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPreviewGroup({
      id: group.id,
      name: group.name,
      description: group.description,
      type: group.type,
      memberCount: group.memberCount,
      isMember: group.isMember,
      isPrivate: group.isPrivate,
      role: group.role,
    });
  };

  const handleLeave = (group: Group) => {
    Alert.alert("Leave Group", `Are you sure you want to leave "${group.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => leaveMutation.mutate(group.id) },
    ]);
  };

  const myGroups = data?.myGroups || [];
  const communityGroups = useMemo(
    () => sortCommunityGroups(myGroups.filter((g) => !isTrainingGroup(g))),
    [myGroups],
  );
  const trainingGroupsAll = useMemo(
    () => myGroups.filter((g) => isTrainingGroup(g)),
    [myGroups],
  );
  const trainingGroupsFiltered = useMemo(
    () => sortTrainingGroups(filterTrainingGroups(trainingGroupsAll, dayChip, formatChip), trainingSort),
    [trainingGroupsAll, dayChip, formatChip, trainingSort],
  );

  const trainingFilterActive = dayChip !== "all" || formatChip !== "all";

  const displayGroups: Group[] =
    activeTab === "communities"
      ? communityGroups
      : activeTab === "training"
      ? trainingGroupsFiltered
      : data?.discover || [];

  const clearTrainingFilter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDayChip("all");
    setFormatChip("all");
  };

  const renderEmptyState = () => {
    if (activeTab === "training") {
      if (trainingGroupsAll.length === 0) {
        return (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color={Colors.dark.textMuted} />
            <Text style={styles.emptyTitle}>No Classes Yet</Text>
            <Text style={styles.emptySubtitle}>
              When you join a recurring class, it&apos;ll show up here automatically.
            </Text>
          </View>
        );
      }
      // Has training groups but filter matched none
      const dayCfg = DAY_CHIPS.find((c) => c.key === dayChip);
      const longDay = dayCfg?.dow !== null && dayCfg?.dow !== undefined ? DAY_LABEL_LONG[dayCfg!.dow!] : null;
      const fmtCfg = FORMAT_CHIPS.find((c) => c.key === formatChip);
      const fmtLabel = fmtCfg?.sessionTypes ? fmtCfg.label.toLowerCase() : null;
      const message = longDay && fmtLabel
        ? `No ${fmtLabel} classes on ${longDay}`
        : longDay
        ? `No classes on ${longDay}`
        : fmtLabel
        ? `No ${fmtLabel} classes`
        : "No classes match your filter";
      return (
        <View style={styles.emptyState}>
          <Ionicons name="funnel-outline" size={64} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>{message}</Text>
          <Pressable style={styles.emptyButton} onPress={clearTrainingFilter}>
            <Ionicons name="close" size={16} color={Colors.dark.primary} />
            <Text style={styles.emptyButtonText}>Clear filter</Text>
          </Pressable>
        </View>
      );
    }
    if (activeTab === "communities") {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No Communities Yet</Text>
          <Text style={styles.emptySubtitle}>
            Communities are social groups outside your classes — create one or discover some.
          </Text>
          <Pressable style={styles.emptyButton} onPress={() => setShowCreateModal(true)}>
            <Ionicons name="add" size={18} color={Colors.dark.primary} />
            <Text style={styles.emptyButtonText}>Create Community</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name="compass-outline" size={64} color={Colors.dark.textMuted} />
        <Text style={styles.emptyTitle}>No Groups to Discover</Text>
        <Text style={styles.emptySubtitle}>
          All available groups are already in your list.
        </Text>
      </View>
    );
  };

  return (
    <LockedScreen featureKey="groups">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Groups</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Groups</Text>
          <View style={[styles.sportTagBadge, { borderColor: getSportColor(activeSport) + "60", backgroundColor: getSportColor(activeSport) + "15" }]}>
            <Ionicons name={getSportIcon(activeSport) as keyof typeof Ionicons.glyphMap} size={12} color={getSportColor(activeSport)} />
            <Text style={[styles.sportTagText, { color: getSportColor(activeSport) }]}>{getSportLabel(activeSport)}</Text>
          </View>
          <Pressable 
            style={styles.createIconButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowCreateModal(true);
            }}
          >
            <Ionicons name="add-circle" size={28} color={Colors.dark.primary} />
          </Pressable>
        </View>

        <View style={styles.tabs}>
          <Pressable 
            style={[styles.tab, activeTab === "communities" && styles.tabActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab("communities");
            }}
          >
            <Text style={[styles.tabText, activeTab === "communities" && styles.tabTextActive]}>Communities</Text>
            {communityGroups.length ? (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{communityGroups.length}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable 
            style={[styles.tab, activeTab === "training" && styles.tabActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab("training");
            }}
          >
            <Text style={[styles.tabText, activeTab === "training" && styles.tabTextActive]}>Training</Text>
            {trainingGroupsAll.length ? (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{trainingGroupsAll.length}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable 
            style={[styles.tab, activeTab === "discover" && styles.tabActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab("discover");
            }}
          >
            <Text style={[styles.tabText, activeTab === "discover" && styles.tabTextActive]}>Discover</Text>
            {data?.discover?.length ? (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{data.discover.length}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {isMultiSport ? <SportSwitcherChips style={styles.sportChips} /> : null}

        {activeTab === "training" && trainingGroupsAll.length > 0 ? (
          <TrainingFilterBar
            dayChip={dayChip}
            formatChip={formatChip}
            sortBy={trainingSort}
            onDayChange={setDayChip}
            onFormatChange={setFormatChip}
            onSortChange={setTrainingSort}
            totalCount={trainingGroupsAll.length}
            shownCount={trainingGroupsFiltered.length}
            filterActive={trainingFilterActive}
          />
        ) : null}

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          </View>
        ) : (
          <FlatList
            data={displayGroups}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <GroupCard
                group={item}
                onPress={() => handleGroupPress(item)}
                onJoin={() => joinMutation.mutate(item.id)}
                onLeave={() => handleLeave(item)}
              />
            )}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: tabBarHeight + Spacing.xl },
              displayGroups.length === 0 && styles.emptyListContent,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={Colors.dark.primary}
              />
            }
            ListEmptyComponent={renderEmptyState}
          />
        )}

        <CreateGroupModal
          visible={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={(data) => createMutation.mutate(data)}
        />

        <GroupPreviewSheet
          visible={!!previewGroup}
          group={previewGroup}
          onClose={() => setPreviewGroup(null)}
          onOpenGroup={(g) => {
            setPreviewGroup(null);
            navigation.navigate("GroupDetail", { groupId: g.id, groupName: g.name });
          }}
        />
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
    justifyContent: "space-between",
    alignItems: "center",
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
    fontSize: 17,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  createIconButton: {
    padding: Spacing.xs,
  },
  sportTagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  sportTagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sportChips: {
    marginBottom: Spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  tabActive: {
    backgroundColor: Colors.dark.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.buttonText,
  },
  tabBadge: {
    marginLeft: Spacing.xs,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: "center",
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  filterBar: {
    paddingBottom: Spacing.sm,
  },
  filterChipsRow: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  filterChipsRowSecondary: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
  },
  filterChipSmall: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.primary,
  },
  filterChipInactive: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  filterChipTextSmall: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  filterChipTextActive: {
    color: Colors.dark.buttonText,
  },
  filterChipTextInactive: {
    color: Colors.dark.textMuted,
  },
  filterMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
  filterCountText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  sortToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  sortToggleText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyListContent: {
    flex: 1,
  },
  groupCard: {
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  groupInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  groupNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  groupName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  groupMeta: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  groupDescription: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  memberBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  memberBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  joinButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  joinButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xl,
    gap: Spacing.xs,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  modalCloseButton: {
    padding: Spacing.xs,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  textInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  typeSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  typeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.xs,
  },
  typeOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  privateToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  privateToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  privateToggleText: {
    fontSize: 15,
    color: Colors.dark.text,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: 2,
  },
  toggleSwitchActive: {
    backgroundColor: Colors.dark.primary,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.textMuted,
  },
  toggleKnobActive: {
    backgroundColor: Colors.dark.backgroundRoot,
    marginLeft: "auto",
  },
  createButton: {
    marginTop: Spacing.xl,
  },
  createButtonGradient: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: "center",
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
}));
