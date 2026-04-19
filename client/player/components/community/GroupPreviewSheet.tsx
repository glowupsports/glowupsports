import React, { useEffect, useState } from "react";
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Colors, Backgrounds, TextColors, GlowColors } from "@/constants/theme";
import { ThemedText as Text } from "@/components/ThemedText";
import { apiRequest } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
export interface SheetGroup {
  id: string;
  name: string;
  description?: string;
  type: string;
  memberCount: number;
  isJoined?: boolean;
  isMember?: boolean;
  isPrivate?: boolean;
  role?: string;
}

interface GroupDetailData {
  group: {
    id: string;
    name: string;
    description?: string;
    type: string;
    memberCount: number;
    isPrivate: boolean;
    allowChat: boolean;
    allowPosts: boolean;
  };
  isMember: boolean;
  myRole: string | null;
  members: {
    id: string;
    userId: string;
    name: string;
    role: string;
    joinedAt: string;
  }[];
  memberCount: number;
}

const GROUP_TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  level: { icon: "tennisball", color: "#9AE66E", label: "Level" },
  team: { icon: "shield", color: "#4ECDC4", label: "Team" },
  academy: { icon: "business", color: "#FFD700", label: "Academy" },
  event: { icon: "calendar", color: "#FF6B35", label: "Event" },
  friends: { icon: "people", color: "#E040FB", label: "Friends" },
  skill_level: { icon: "trophy", color: "#9AE66E", label: "Skill Level" },
  age_group: { icon: "people", color: "#4ECDC4", label: "Age Group" },
  tournament: { icon: "ribbon", color: "#FF6B35", label: "Tournament" },
  social: { icon: "tennisball", color: "#E040FB", label: "Social" },
  training: { icon: "barbell", color: "#9AE66E", label: "Training" },
};

interface Props {
  visible: boolean;
  group: SheetGroup | null;
  onClose: () => void;
  onOpenGroup: (group: SheetGroup) => void;
}

export default function GroupPreviewSheet({ visible, group, onClose, onOpenGroup }: Props) {
  const queryClient = useQueryClient();
  // In-sheet feedback + nested confirm Modal — Alert.alert from inside a
  // presented <Modal> mis-stacks (renders behind the sheet on web/iOS pageSheet).
  // See replit.md "Modal stacking" convention.
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (!visible) {
      setFeedback(null);
      setConfirmLeave(false);
    }
  }, [visible]);

  const { data, isLoading } = useQuery<GroupDetailData>({
    queryKey: [`/api/player/groups/${group?.id}`],
    enabled: !!group?.id && visible,
  });

  const joinMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/player/groups/${group!.id}/join`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/groups"] });
      queryClient.invalidateQueries({ queryKey: [`/api/player/groups/${group?.id}`] });
      if (group) onOpenGroup(group);
      onClose();
    },
    onError: (error: any) => {
      setFeedback(error?.message || "Could not join group");
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/player/groups/${group!.id}/leave`),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ["/api/player/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/groups"] });
      queryClient.invalidateQueries({ queryKey: [`/api/player/groups/${group?.id}`] });
      setConfirmLeave(false);
      onClose();
    },
    onError: (error: any) => {
      setConfirmLeave(false);
      setFeedback(error?.message || "Could not leave group");
    },
  });

  if (!group) return null;

  const typeConfig = GROUP_TYPE_CONFIG[group.type] || GROUP_TYPE_CONFIG.friends;
  const isMember = data?.isMember ?? group.isMember ?? (group.isJoined !== false);
  const isAdmin = data?.myRole === "admin" || group.role === "admin";
  const memberCount = data?.memberCount ?? group.memberCount ?? 0;
  const members = data?.members ?? [];
  const previewMembers = members.slice(0, 6);
  const extraCount = memberCount > previewMembers.length ? memberCount - previewMembers.length : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View style={styles.sheet} entering={FadeInDown.duration(300).springify()}>
        <View style={[styles.colorBorder, { backgroundColor: typeConfig.color }]} />

        <View style={styles.handle} />

        <View style={styles.groupHeader}>
          <LinearGradient
            colors={[typeConfig.color + "50", typeConfig.color + "15"]}
            style={[styles.groupIcon, { borderColor: typeConfig.color + "40" }]}
          >
            <Ionicons name={typeConfig.icon as any} size={30} color={typeConfig.color} />
          </LinearGradient>

          <View style={styles.groupTitleBlock}>
            <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
            <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + "20" }]}>
              <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
                {typeConfig.label}
              </Text>
            </View>
          </View>

          {group.isPrivate ? (
            <View style={styles.privateBadge}>
              <Ionicons name="lock-closed" size={15} color={Colors.dark.textMuted} />
            </View>
          ) : null}
        </View>

        {group.description ? (
          <Text style={styles.description} numberOfLines={2}>{group.description}</Text>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Ionicons name="people" size={14} color={typeConfig.color} />
            <Text style={styles.statText}>{memberCount} {memberCount === 1 ? "Member" : "Members"}</Text>
          </View>
          <View style={styles.statChip}>
            <Ionicons name="document-text" size={14} color="#7A8EA0" />
            <Text style={styles.statText}>{group.memberCount > 0 ? group.memberCount : 0} Posts</Text>
          </View>
          {data?.group.allowChat ? (
            <View style={styles.statChip}>
              <Ionicons name="chatbubble" size={14} color={Colors.dark.primary} />
              <Text style={styles.statText}>Chat</Text>
            </View>
          ) : null}
          {data?.group.isPrivate ? (
            <View style={styles.statChip}>
              <Ionicons name="lock-closed" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.statText}>Private</Text>
            </View>
          ) : null}
        </View>

        {isLoading ? (
          <View style={styles.membersLoading}>
            <ActivityIndicator size="small" color={Colors.dark.primary} />
          </View>
        ) : members.length > 0 ? (
          <View style={styles.memberAvatars}>
            <Text style={styles.memberAvatarsLabel}>Members</Text>
            <View style={styles.avatarRow}>
              {previewMembers.map((m, i) => (
                <View
                  key={m.id}
                  style={[
                    styles.memberAvatar,
                    { backgroundColor: typeConfig.color + "30", marginLeft: i > 0 ? -10 : 0, zIndex: 10 - i },
                  ]}
                >
                  <Text style={[styles.memberAvatarInitial, { color: typeConfig.color }]}>
                    {m.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              ))}
              {extraCount > 0 ? (
                <View style={[styles.memberAvatar, styles.extraAvatar, { marginLeft: -10, zIndex: 0 }]}>
                  <Text style={styles.extraAvatarText}>+{extraCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            style={styles.openButton}
            onPress={() => {
              onOpenGroup(group);
              onClose();
            }}
          >
            <LinearGradient
              colors={[typeConfig.color, typeConfig.color + "BB"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.openButtonGradient}
            >
              <Text style={styles.openButtonText}>Open Group</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.dark.buttonText} />
            </LinearGradient>
          </Pressable>

          {!isMember ? (
            <Pressable
              style={styles.joinButton}
              onPress={() => joinMutation.mutate()}
              disabled={joinMutation.isPending}
            >
              {joinMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.primary} />
              ) : (
                <>
                  <Ionicons name="add" size={18} color={Colors.dark.primary} />
                  <Text style={styles.joinButtonText}>Join</Text>
                </>
              )}
            </Pressable>
          ) : !isAdmin ? (
            <Pressable
              style={styles.leaveButton}
              onPress={() => {
                setFeedback(null);
                setConfirmLeave(true);
              }}
              disabled={leaveMutation.isPending}
            >
              {leaveMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.error} />
              ) : (
                <>
                  <Ionicons name="exit-outline" size={18} color={Colors.dark.error} />
                  <Text style={styles.leaveButtonText}>Leave</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>

        {feedback ? (
          <View style={styles.feedbackBanner}>
            <Ionicons name="alert-circle" size={16} color="#FF6B6B" />
            <Text style={styles.feedbackText} numberOfLines={3}>{feedback}</Text>
            <Pressable onPress={() => setFeedback(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color="#FF6B6B" />
            </Pressable>
          </View>
        ) : null}
      </Animated.View>

      {/* Nested confirmation Modal — must be a JSX child of the parent sheet
          so it stacks on top (per replit.md "Modal stacking" convention). */}
      <Modal
        visible={confirmLeave}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmLeave(false)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.confirmBackdrop}
          onPress={() => !leaveMutation.isPending && setConfirmLeave(false)}
        />
        <View style={styles.confirmCardWrap} pointerEvents="box-none">
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Leave Group</Text>
            <Text style={styles.confirmMessage}>Leave “{group.name}”?</Text>
            <View style={styles.confirmButtons}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmCancel]}
                onPress={() => setConfirmLeave(false)}
                disabled={leaveMutation.isPending}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmDestructive]}
                onPress={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
              >
                {leaveMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FF6B6B" />
                ) : (
                  <Text style={styles.confirmDestructiveText}>Leave</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  sheet: {
    backgroundColor: Backgrounds.root,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingBottom: 44,
    overflow: "hidden",
  },
  colorBorder: {
    height: 2.5,
    marginHorizontal: -22,
    opacity: 0.7,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 14,
    marginBottom: 22,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 14,
  },
  groupIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  groupTitleBlock: {
    flex: 1,
    gap: 6,
  },
  groupName: {
    fontSize: 20,
    fontWeight: "700",
    color: TextColors.primary,
  },
  typeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  privateBadge: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  description: {
    fontSize: 14,
    color: "#7A8EA0",
    lineHeight: 21,
    marginBottom: 18,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 22,
    flexWrap: "wrap",
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
  },
  statText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#9AAABB",
  },
  membersLoading: {
    height: 48,
    justifyContent: "center",
    marginBottom: 22,
  },
  memberAvatars: {
    marginBottom: 26,
    gap: 10,
  },
  memberAvatarsLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#445566",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Backgrounds.root,
  },
  memberAvatarInitial: {
    fontSize: 14,
    fontWeight: "700",
  },
  extraAvatar: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  extraAvatarText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#7A8EA0",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  openButton: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  openButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    gap: 8,
  },
  openButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  leaveButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: "rgba(255, 77, 77, 0.12)",
    gap: 6,
  },
  leaveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FF4D4D",
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: "rgba(200, 255, 61, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.25)",
    gap: 6,
  },
  joinButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 107, 107, 0.12)",
    borderColor: "rgba(255, 107, 107, 0.3)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  feedbackText: {
    flex: 1,
    fontSize: 13,
    color: "#FF6B6B",
    fontWeight: "500",
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  confirmCardWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  confirmCard: {
    backgroundColor: "#1A2030",
    borderRadius: 16,
    padding: 22,
    alignSelf: "stretch",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F0F4F8",
    marginBottom: 6,
  },
  confirmMessage: {
    fontSize: 14,
    color: "#C8D0DC",
    marginBottom: 18,
    lineHeight: 20,
  },
  confirmButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 9,
    minWidth: 80,
    alignItems: "center",
  },
  confirmCancel: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#C8D0DC",
  },
  confirmDestructive: {
    backgroundColor: "rgba(255,107,107,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.35)",
  },
  confirmDestructiveText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FF6B6B",
  },
}));
