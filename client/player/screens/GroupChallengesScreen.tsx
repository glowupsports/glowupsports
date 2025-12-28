import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";

interface GroupChallenge {
  id: string;
  title: string;
  description: string;
  type: "footwork" | "consistency" | "rally" | "team";
  progress: number;
  goal: number;
  participants: number;
  daysRemaining: number;
  isActive: boolean;
  createdBy: string;
}

const CHALLENGE_CONFIG: Record<string, { icon: string; color: string }> = {
  footwork: { icon: "walk", color: Colors.dark.orange },
  consistency: { icon: "repeat", color: Colors.dark.primary },
  rally: { icon: "tennisball", color: Colors.dark.xpCyan },
  team: { icon: "people", color: Colors.dark.gold },
};

function ChallengeCard({ challenge }: { challenge: GroupChallenge }) {
  const config = CHALLENGE_CONFIG[challenge.type] || CHALLENGE_CONFIG.team;
  const progressPercent = Math.round((challenge.progress / challenge.goal) * 100);
  
  return (
    <View style={styles.challengeCard}>
      <View style={styles.challengeHeader}>
        <View style={[styles.challengeIcon, { backgroundColor: `${config.color}20` }]}>
          <Ionicons name={config.icon as any} size={24} color={config.color} />
        </View>
        <View style={styles.challengeInfo}>
          <Text style={styles.challengeTitle}>{challenge.title}</Text>
          <Text style={styles.challengeCreatedBy}>by {challenge.createdBy}</Text>
        </View>
        {challenge.isActive ? (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.challengeDescription}>{challenge.description}</Text>

      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Group Progress</Text>
          <Text style={[styles.progressValue, { color: config.color }]}>{progressPercent}%</Text>
        </View>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { width: `${progressPercent}%`, backgroundColor: config.color }
            ]} 
          />
        </View>
      </View>

      <View style={styles.challengeFooter}>
        <View style={styles.footerStat}>
          <Ionicons name="people-outline" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.footerStatText}>{challenge.participants} players</Text>
        </View>
        <View style={styles.footerStat}>
          <Ionicons name="time-outline" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.footerStatText}>{challenge.daysRemaining} days left</Text>
        </View>
      </View>
    </View>
  );
}

export default function GroupChallengesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const { data: challenges, isLoading } = useQuery<GroupChallenge[]>({
    queryKey: ["/api/player/challenges"],
  });

  const mockChallenges: GroupChallenge[] = [
    {
      id: "1",
      title: "Footwork Focus Week",
      description: "Complete 50 footwork drills as a group this week",
      type: "footwork",
      progress: 38,
      goal: 50,
      participants: 8,
      daysRemaining: 3,
      isActive: true,
      createdBy: "Coach Mike",
    },
    {
      id: "2",
      title: "Rally Consistency Challenge",
      description: "Maintain a 10+ rally in training sessions",
      type: "rally",
      progress: 72,
      goal: 100,
      participants: 12,
      daysRemaining: 5,
      isActive: true,
      createdBy: "Coach Sarah",
    },
    {
      id: "3",
      title: "Team Spirit Week",
      description: "Complete 20 group sessions together",
      type: "team",
      progress: 15,
      goal: 20,
      participants: 6,
      daysRemaining: 7,
      isActive: false,
      createdBy: "Coach Mike",
    },
  ];

  const data = challenges || mockChallenges;
  const activeChallenges = data.filter(c => c.isActive);
  const upcomingChallenges = data.filter(c => !c.isActive);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Group Challenges</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={Colors.dark.xpCyan} />
          <Text style={styles.infoText}>
            Group challenges are created by your coach. Work together with your training partners to achieve shared goals!
          </Text>
        </View>

        {activeChallenges.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Challenges</Text>
            {activeChallenges.map(challenge => (
              <ChallengeCard key={challenge.id} challenge={challenge} />
            ))}
          </View>
        ) : null}

        {upcomingChallenges.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming</Text>
            {upcomingChallenges.map(challenge => (
              <ChallengeCard key={challenge.id} challenge={challenge} />
            ))}
          </View>
        ) : null}

        {data.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No challenges yet</Text>
            <Text style={styles.emptySubtext}>
              Your coach will create group challenges for you and your training partners
            </Text>
          </View>
        ) : null}
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
  infoCard: {
    flexDirection: "row",
    ...CardStyles.statusCard,
    padding: Spacing.lg,
    gap: Spacing.md,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    ...Typography.small,
    color: Colors.dark.textMuted,
    lineHeight: 20,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
  },
  challengeCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
  },
  challengeHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  challengeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  challengeInfo: {
    flex: 1,
  },
  challengeTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  challengeCreatedBy: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  activeBadge: {
    backgroundColor: "rgba(46, 204, 64, 0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  activeBadgeText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  challengeDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  progressSection: {
    marginBottom: Spacing.md,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  progressLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  progressValue: {
    ...Typography.caption,
    fontWeight: "700",
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  challengeFooter: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  footerStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerStatText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["4xl"],
    gap: Spacing.md,
  },
  emptyText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    maxWidth: 250,
  },
});
