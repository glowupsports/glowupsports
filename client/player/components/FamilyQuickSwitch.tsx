import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, SlideInUp } from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, FontSizes, BorderRadius, GlowColors } from "@/constants/theme";
import { useFamily, FamilyMember } from "@/player/context/FamilyContext";
import { getStaticAssetsUrl } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
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

interface QuickSwitchButtonProps {
  currentMember: FamilyMember;
  onPress: () => void;
}

function QuickSwitchButton({ currentMember, onPress }: QuickSwitchButtonProps) {
  return (
    <Pressable
      style={styles.switchButton}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={styles.avatarContainer}>
        {currentMember.avatarUrl ? (
          <Image
            source={{ uri: `${getStaticAssetsUrl()}${currentMember.avatarUrl}` }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={14} color={Colors.dark.textMuted} />
          </View>
        )}
        <View style={[styles.ballDot, { backgroundColor: getBallColor(currentMember.ballLevel) }]} />
      </View>
      <Ionicons name="chevron-down" size={12} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

export default function FamilyQuickSwitch() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isFamily, familyData, activePlayerId, setActivePlayer } = useFamily();
  const [showModal, setShowModal] = useState(false);

  if (!isFamily || !familyData) {
    return null;
  }

  const currentMember = familyData.members.find(m => m.id === activePlayerId) || familyData.members[0];
  const otherMembers = familyData.members.filter(m => m.id !== activePlayerId);

  const handleSelectMember = (member: FamilyMember) => {
    setShowModal(false);
    if (member.id !== activePlayerId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setActivePlayer(member.id);
      navigation.reset({
        index: 0,
        routes: [{ name: "PlayerTabs" as never }],
      });
    }
  };

  const handleGoToLobby = () => {
    setShowModal(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("FamilyLobby" as never);
  };

  return (
    <>
      <QuickSwitchButton
        currentMember={currentMember}
        onPress={() => setShowModal(true)}
      />

      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowModal(false)}
        >
          <Animated.View 
            entering={SlideInUp.duration(200)}
            style={[styles.dropdown, { marginTop: insets.top + 50 }]}
          >
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Switch Player</Text>
              <Pressable 
                style={styles.lobbyButton}
                onPress={handleGoToLobby}
              >
                <Ionicons name="home" size={14} color={Colors.dark.primary} />
                <Text style={styles.lobbyButtonText}>Lobby</Text>
              </Pressable>
            </View>

            <View style={styles.currentMemberRow}>
              <View style={styles.memberAvatar}>
                {currentMember.avatarUrl ? (
                  <Image
                    source={{ uri: `${getStaticAssetsUrl()}${currentMember.avatarUrl}` }}
                    style={styles.memberAvatarImage}
                    contentFit="cover"
                  />
                ) : (
                  <Ionicons name="person" size={20} color={Colors.dark.textMuted} />
                )}
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{currentMember.name}</Text>
                <Text style={styles.memberLevel}>Level {currentMember.level}</Text>
              </View>
              <View style={styles.currentBadge}>
                <Ionicons name="checkmark" size={14} color={Colors.dark.primary} />
              </View>
            </View>

            {otherMembers.length > 0 && (
              <View style={styles.divider} />
            )}

            {otherMembers.map((member) => (
              <Pressable
                key={member.id}
                style={styles.memberRow}
                onPress={() => handleSelectMember(member)}
              >
                <View style={styles.memberAvatar}>
                  {member.avatarUrl ? (
                    <Image
                      source={{ uri: `${getStaticAssetsUrl()}${member.avatarUrl}` }}
                      style={styles.memberAvatarImage}
                      contentFit="cover"
                    />
                  ) : (
                    <Ionicons name="person" size={20} color={Colors.dark.textMuted} />
                  )}
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberLevel}>Level {member.level}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={Colors.dark.textMuted} />
              </Pressable>
            ))}
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  switchButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Backgrounds.elevated,
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.dark.accentText,
  },
  avatarPlaceholder: {
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  ballDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.dark.chipBackground,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  dropdown: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
  },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  dropdownTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  lobbyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary + "20",
  },
  lobbyButtonText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  currentMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  memberAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  memberLevel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  currentBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.sm,
  },
}));
