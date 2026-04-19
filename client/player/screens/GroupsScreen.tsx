import React, { useState, useMemo } from "react";
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
import { LockedScreen } from "../components/LockedScreen";
import GroupPreviewSheet, { type SheetGroup } from "@/player/components/community/GroupPreviewSheet";
import { useSport, getSportColor, getSportLabel, getSportIcon } from "@/player/context/SportContext";
import { SportSwitcherChips } from "@/player/components/SportSwitcherChips";

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
}

interface GroupsData {
  myGroups: Group[];
  discover: Group[];
}

type Props = NativeStackScreenProps<any, "Groups">;

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
                {group.memberCount} member{group.memberCount !== 1 ? "s" : ""} • {group.type}
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

export default function GroupsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = insets.bottom + 60;
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"my" | "discover">("my");
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

  const displayGroups = activeTab === "my" ? data?.myGroups || [] : data?.discover || [];

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons 
        name={activeTab === "my" ? "people-outline" : "compass-outline"} 
        size={64} 
        color={Colors.dark.textMuted} 
      />
      <Text style={styles.emptyTitle}>
        {activeTab === "my" ? "No Groups Yet" : "No Groups to Discover"}
      </Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === "my" 
          ? "Create a group or join one to connect with other players" 
          : "All available groups are shown in your groups"
        }
      </Text>
      {activeTab === "my" && (
        <Pressable style={styles.emptyButton} onPress={() => setShowCreateModal(true)}>
          <Ionicons name="add" size={18} color={Colors.dark.primary} />
          <Text style={styles.emptyButtonText}>Create Group</Text>
        </Pressable>
      )}
    </View>
  );

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
            style={[styles.tab, activeTab === "my" && styles.tabActive]}
            onPress={() => setActiveTab("my")}
          >
            <Text style={[styles.tabText, activeTab === "my" && styles.tabTextActive]}>My Groups</Text>
            {data?.myGroups?.length ? (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{data.myGroups.length}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable 
            style={[styles.tab, activeTab === "discover" && styles.tabActive]}
            onPress={() => setActiveTab("discover")}
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

const styles = StyleSheet.create({
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
});
