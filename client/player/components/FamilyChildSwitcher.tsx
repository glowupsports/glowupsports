import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, BorderRadius, FontSizes } from "@/constants/theme";
import { useFamily, FamilyMember } from "@/player/context/FamilyContext";
import { getStaticAssetsUrl } from "@/lib/query-client";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

export default function FamilyChildSwitcher() {
  const { t } = useTranslation();
  const { isFamily, isParent, familyData, activePlayerId, setActivePlayer } = useFamily();

  if (!isFamily || !isParent || !familyData || familyData.members.length < 2) {
    return null;
  }

  const handleSelect = (member: FamilyMember) => {
    if (member.id === activePlayerId) return;
    Haptics.selectionAsync();
    setActivePlayer(member.id);
  };

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.wrapper}>
      <Text style={styles.label}>{t("player.schedule.viewingScheduleFor")}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {familyData.members.map((member) => {
          const isActive = member.id === activePlayerId;
          return (
            <Pressable
              key={member.id}
              onPress={() => handleSelect(member)}
              style={[
                styles.chip,
                isActive ? styles.chipActive : null,
              ]}
            >
              <View style={styles.avatar}>
                {member.avatarUrl ? (
                  <Image
                    source={{ uri: `${getStaticAssetsUrl()}${member.avatarUrl}` }}
                    style={styles.avatarImg}
                    contentFit="cover"
                  />
                ) : (
                  <Feather name="user" size={14} color={Colors.dark.textMuted} />
                )}
              </View>
              <Text
                style={[
                  styles.chipText,
                  isActive ? styles.chipTextActive : null,
                ]}
                numberOfLines={1}
              >
                {member.name}
              </Text>
              {isActive ? (
                <Feather name="check" size={14} color={Colors.dark.primary} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  row: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    maxWidth: 180,
  },
  chipActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  chipText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    flexShrink: 1,
  },
  chipTextActive: {
    color: Colors.dark.text,
  },
}));
