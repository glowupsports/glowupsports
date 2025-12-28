import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import type { OwnerStackParamList } from "@/owner/navigation/OwnerNavigator";

type TabType = "coaches" | "players";

interface PersonData {
  id: string;
  name: string;
  role: string;
  status: "active" | "paused" | "onboarding";
  stats: { label: string; value: string }[];
}

interface PeopleData {
  coaches: PersonData[];
  players: PersonData[];
}

interface PersonCardProps {
  name: string;
  role: string;
  status: "active" | "paused" | "onboarding";
  stats: { label: string; value: string }[];
}

function PersonCard({ name, role, status, stats }: PersonCardProps) {
  const statusColors = {
    active: Colors.dark.primary,
    paused: Colors.dark.orange,
    onboarding: Colors.dark.xpCyan,
  };

  return (
    <Pressable style={[styles.personCard, CardStyles.elevated]}>
      <View style={styles.personCardHeader}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={24} color={Colors.dark.textMuted} />
        </View>
        <View style={styles.personInfo}>
          <Text style={styles.personName}>{name}</Text>
          <Text style={styles.personRole}>{role}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColors[status]}20` }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColors[status] }]} />
          <Text style={[styles.statusText, { color: statusColors[status] }]}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        {stats.map((stat, index) => (
          <View key={index} style={styles.stat}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

export default function PeopleScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<OwnerStackParamList>>();
  const [activeTab, setActiveTab] = useState<TabType>("coaches");

  const { data: peopleData, isLoading } = useQuery<PeopleData>({
    queryKey: ["/api/owner/people"],
  });

  const coaches = peopleData?.coaches || [];
  const players = peopleData?.players || [];

  const handleTabChange = (tab: TabType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const handleInviteCoach = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("InviteManagement");
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
        <Text style={styles.loadingText}>Loading people...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>People</Text>
        <Text style={styles.subtitle}>Manage your coaches and players</Text>
      </View>

      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, activeTab === "coaches" && styles.tabActive]}
          onPress={() => handleTabChange("coaches")}
        >
          <Ionicons 
            name="tennisball" 
            size={18} 
            color={activeTab === "coaches" ? Colors.dark.backgroundRoot : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "coaches" && styles.tabTextActive]}>
            Coaches ({coaches.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "players" && styles.tabActive]}
          onPress={() => handleTabChange("players")}
        >
          <Ionicons 
            name="people" 
            size={18} 
            color={activeTab === "players" ? Colors.dark.backgroundRoot : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "players" && styles.tabTextActive]}>
            Players ({players.length})
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.actionsRow}>
          <Pressable 
            style={styles.addButton}
            onPress={activeTab === "coaches" ? handleInviteCoach : undefined}
          >
            <Ionicons name="add" size={20} color={Colors.dark.gold} />
            <Text style={styles.addButtonText}>
              {activeTab === "coaches" ? "Invite Coach" : "Add Player"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.list}>
          {(activeTab === "coaches" ? coaches : players).map((person) => (
            <PersonCard key={person.id} {...person} />
          ))}
        </View>

        {(activeTab === "coaches" ? coaches : players).length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons 
              name={activeTab === "coaches" ? "tennisball-outline" : "people-outline"} 
              size={48} 
              color={Colors.dark.textMuted} 
            />
            <Text style={styles.emptyText}>
              No {activeTab} yet
            </Text>
            <Text style={styles.emptySubtext}>
              {activeTab === "coaches" 
                ? "Invite coaches to start building your team" 
                : "Add players to your academy"}
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
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  header: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  tabActive: {
    backgroundColor: Colors.dark.gold,
  },
  tabText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  tabTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: Spacing.md,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: `${Colors.dark.gold}15`,
    borderRadius: BorderRadius.md,
  },
  addButtonText: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  list: {
    gap: Spacing.md,
  },
  personCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  personCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  personInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  personName: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  personRole: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    ...Typography.small,
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyText: {
    ...Typography.h3,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
});
