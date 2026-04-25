import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const OWNER_COLOR = Colors.dark.gold;

interface OwnerCardProps {
  ownerName: string;
  academyName: string;
  role: string;
  visionTags: string[];
  publicMessage?: string;
  compact?: boolean;
}

const visionLabels: Record<string, string> = {
  player_development: "Player Development",
  long_term_growth: "Long-term Growth",
  fun_confidence: "Fun & Confidence",
  performance_pathway: "Performance Pathway",
  community: "Community",
};

export function OwnerCard({ 
  ownerName, 
  academyName, 
  role, 
  visionTags, 
  publicMessage,
  compact = false 
}: OwnerCardProps) {
  const roleLabels: Record<string, string> = {
    owner: "Owner",
    director: "Director",
    founder: "Founder",
    academy_owner: "Academy Owner",
    platform_owner: "Platform Owner",
    head_coach: "Head Coach",
    managing_director: "Managing Director",
  };

  if (compact) {
    return (
      <View style={styles.compactCard}>
        <View style={styles.compactHeader}>
          <View style={styles.ownerIcon}>
            <Ionicons name="shield-checkmark" size={16} color={OWNER_COLOR} />
          </View>
          <View style={styles.compactInfo}>
            <Text style={styles.compactName}>{ownerName}</Text>
            <Text style={styles.compactRole}>{roleLabels[role] || role}</Text>
          </View>
        </View>
        {visionTags.length > 0 ? (
          <View style={styles.compactTags}>
            {visionTags.slice(0, 2).map((tag, i) => (
              <View key={i} style={styles.compactTag}>
                <Text style={styles.compactTagText}>{visionLabels[tag] || tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={24} color={OWNER_COLOR} />
          </View>
          <View style={styles.badge}>
            <Ionicons name="shield-checkmark" size={12} color={Colors.dark.buttonText} />
          </View>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{ownerName}</Text>
          <Text style={styles.roleText}>{roleLabels[role] || role}</Text>
          <Text style={styles.academyText}>{academyName}</Text>
        </View>
      </View>

      {visionTags.length > 0 ? (
        <View style={styles.visionSection}>
          <Text style={styles.visionLabel}>Academy Vision</Text>
          <View style={styles.visionTags}>
            {visionTags.slice(0, 3).map((tag, i) => (
              <View key={i} style={styles.visionTag}>
                <Ionicons name="star" size={10} color={OWNER_COLOR} style={styles.tagIcon} />
                <Text style={styles.visionTagText}>{visionLabels[tag] || tag}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {publicMessage ? (
        <View style={styles.messageSection}>
          <View style={styles.messageQuote}>
            <Ionicons name="chatbubble-ellipses" size={14} color={Colors.dark.textMuted} />
          </View>
          <Text style={styles.messageText}>&quot;{publicMessage}&quot;</Text>
        </View>
      ) : null}

      <View style={styles.trustFooter}>
        <Ionicons name="checkmark-circle" size={14} color={Colors.dark.primary} />
        <Text style={styles.trustText}>Verified Academy Leadership</Text>
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: `${OWNER_COLOR}30`,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  avatarContainer: {
    position: "relative",
    marginRight: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${OWNER_COLOR}20`,
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: OWNER_COLOR,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: 2,
  },
  roleText: {
    ...Typography.caption,
    color: OWNER_COLOR,
    fontWeight: "600",
    marginBottom: 2,
  },
  academyText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  visionSection: {
    marginBottom: Spacing.md,
  },
  visionLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  visionTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  visionTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${OWNER_COLOR}15`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  tagIcon: {
    marginRight: 4,
  },
  visionTagText: {
    ...Typography.caption,
    color: OWNER_COLOR,
  },
  messageSection: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    flexDirection: "row",
  },
  messageQuote: {
    marginRight: Spacing.sm,
    marginTop: 2,
  },
  messageText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
    flex: 1,
    lineHeight: 20,
  },
  trustFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  trustText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginLeft: Spacing.xs,
  },
  compactCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: `${OWNER_COLOR}20`,
  },
  compactHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  ownerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${OWNER_COLOR}15`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  compactInfo: {
    flex: 1,
  },
  compactName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  compactRole: {
    ...Typography.caption,
    color: OWNER_COLOR,
  },
  compactTags: {
    flexDirection: "row",
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  compactTag: {
    backgroundColor: `${OWNER_COLOR}10`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  compactTagText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
}));
