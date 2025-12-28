import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";

type RouteParams = {
  PeerJourney: {
    peerId: string;
    peerName: string;
  };
};

interface PeerJourneyData {
  id: string;
  name: string;
  level: number;
  ballLevel: string;
  recentAchievements: {
    id: string;
    type: string;
    title: string;
    date: string;
  }[];
  domains: {
    domain: string;
    status: "ahead" | "same" | "behind";
  }[];
}

const BALL_COLORS: Record<string, string> = {
  red: "#E74C3C",
  orange: "#F39C12",
  green: Colors.dark.primary,
  yellow: "#F1C40F",
};

const DOMAIN_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  technical: { icon: "construct", color: Colors.dark.primary, label: "Technical" },
  mental: { icon: "brain", color: "#9B59B6", label: "Mental" },
  physical: { icon: "fitness", color: Colors.dark.orange, label: "Physical" },
  tactical: { icon: "compass", color: Colors.dark.gold, label: "Tactical" },
  social: { icon: "people", color: Colors.dark.xpCyan, label: "Social" },
};

export default function PeerJourneyScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, "PeerJourney">>();
  const { peerId, peerName } = route.params || { peerId: "1", peerName: "Player" };

  const { data: peerData, isLoading } = useQuery<PeerJourneyData>({
    queryKey: ["/api/player/peers", peerId, "journey"],
    enabled: !!peerId,
  });

  const mockData: PeerJourneyData = {
    id: peerId,
    name: peerName,
    level: 7,
    ballLevel: "orange",
    recentAchievements: [
      { id: "1", type: "level_up", title: "Reached Level 7", date: "3 days ago" },
      { id: "2", type: "badge", title: "Consistency Award", date: "1 week ago" },
      { id: "3", type: "milestone", title: "100 Sessions Completed", date: "2 weeks ago" },
    ],
    domains: [
      { domain: "technical", status: "same" },
      { domain: "mental", status: "ahead" },
      { domain: "physical", status: "behind" },
      { domain: "tactical", status: "same" },
      { domain: "social", status: "ahead" },
    ],
  };

  const data = peerData || mockData;
  const ballColor = BALL_COLORS[data.ballLevel] || BALL_COLORS.orange;

  const getAchievementIcon = (type: string) => {
    switch (type) {
      case "level_up": return "arrow-up-circle";
      case "badge": return "ribbon";
      case "milestone": return "flag";
      default: return "star";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ahead": return "You're ahead";
      case "behind": return "You're behind";
      default: return "Same level";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ahead": return Colors.dark.primary;
      case "behind": return Colors.dark.orange;
      default: return Colors.dark.textMuted;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Training Partner</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.peerHeader}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { borderColor: ballColor }]}>
              <Text style={styles.avatarText}>
                {data.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={[styles.levelBadge, { backgroundColor: ballColor }]}>
              <Text style={styles.levelText}>{data.level}</Text>
            </View>
          </View>
          <Text style={styles.peerName}>{data.name}</Text>
          <View style={styles.ballBadge}>
            <View style={[styles.ballDot, { backgroundColor: ballColor }]} />
            <Text style={styles.ballText}>
              {data.ballLevel.charAt(0).toUpperCase() + data.ballLevel.slice(1)} Ball
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trophy" size={18} color={Colors.dark.gold} />
            <Text style={styles.sectionTitle}>Recent Achievements</Text>
          </View>
          {data.recentAchievements.map((achievement) => (
            <View key={achievement.id} style={styles.achievementRow}>
              <View style={styles.achievementIcon}>
                <Ionicons 
                  name={getAchievementIcon(achievement.type) as any} 
                  size={18} 
                  color={Colors.dark.gold} 
                />
              </View>
              <View style={styles.achievementInfo}>
                <Text style={styles.achievementTitle}>{achievement.title}</Text>
                <Text style={styles.achievementDate}>{achievement.date}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="git-compare" size={18} color={Colors.dark.xpCyan} />
            <Text style={styles.sectionTitle}>Comparison</Text>
          </View>
          <Text style={styles.comparisonNote}>
            How you compare in each skill domain
          </Text>
          {data.domains.map((item) => {
            const config = DOMAIN_CONFIG[item.domain] || DOMAIN_CONFIG.technical;
            return (
              <View key={item.domain} style={styles.domainRow}>
                <View style={[styles.domainIcon, { backgroundColor: `${config.color}20` }]}>
                  <Ionicons name={config.icon as any} size={16} color={config.color} />
                </View>
                <Text style={styles.domainLabel}>{config.label}</Text>
                <Text style={[styles.statusLabel, { color: getStatusColor(item.status) }]}>
                  {getStatusLabel(item.status)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.privacyNote}>
          <Ionicons name="shield-checkmark" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.privacyText}>
            Only basic progress info is shared between training partners
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  peerHeader: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
  },
  avatarText: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  levelBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  levelText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  peerName: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  ballBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  ballDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ballText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  sectionCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  achievementRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  achievementIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(243, 156, 18, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  achievementInfo: {
    flex: 1,
  },
  achievementTitle: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  achievementDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  comparisonNote: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  domainRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  domainIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  domainLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  statusLabel: {
    ...Typography.caption,
    fontWeight: "600",
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  privacyText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    flex: 1,
  },
});
