import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

interface AcademyData {
  id: string;
  name: string;
  coaches: number;
  players: number;
  mrr: number;
  status: "active" | "trial" | "paused" | "overdue";
  lastActivity: string;
}

interface PlatformStats {
  academies: AcademyData[];
  metrics: {
    activeAcademies: number;
  };
}

interface AcademyCardProps {
  name: string;
  coaches: number;
  players: number;
  mrr: number;
  status: "active" | "trial" | "paused" | "overdue";
  lastActivity: string;
  onPress?: () => void;
}

function AcademyCard({ name, coaches, players, mrr, status, lastActivity, onPress }: AcademyCardProps) {
  const statusConfig = {
    active: { color: Colors.dark.primary, label: "Active" },
    trial: { color: Colors.dark.xpCyan, label: "Trial" },
    paused: { color: Colors.dark.orange, label: "Paused" },
    overdue: { color: Colors.dark.error, label: "Overdue" },
  };

  const config = statusConfig[status];

  const formatLastActivity = (dateStr: string) => {
    if (!dateStr) return "Recently";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "Recently";
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffHours < 1) return "Just now";
      if (diffHours < 24) return `${diffHours} hours ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays > 0) return `${diffDays} days ago`;
      return "Recently";
    } catch {
      return "Recently";
    }
  };

  return (
    <Pressable 
      style={[styles.academyCard, CardStyles.elevated]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
    >
      <View style={styles.academyHeader}>
        <View style={styles.academyIcon}>
          <Ionicons name="business" size={24} color={PLATFORM_COLOR} />
        </View>
        <View style={styles.academyInfo}>
          <Text style={styles.academyName}>{name}</Text>
          <Text style={styles.academyActivity}>Last active: {formatLastActivity(lastActivity)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${config.color}20` }]}>
          <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
        </View>
      </View>
      
      <View style={styles.academyStats}>
        <View style={styles.academyStat}>
          <Ionicons name="people-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.statValue}>{coaches}</Text>
          <Text style={styles.statLabel}>Coaches</Text>
        </View>
        <View style={styles.academyStat}>
          <Ionicons name="person-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.statValue}>{players}</Text>
          <Text style={styles.statLabel}>Players</Text>
        </View>
        <View style={styles.academyStat}>
          <Ionicons name="card-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={[styles.statValue, { color: Colors.dark.gold }]}>${mrr}</Text>
          <Text style={styles.statLabel}>MRR</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function AcademiesScreen() {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats"],
  });

  const academies = stats?.academies || [];

  const filteredAcademies = academies.filter(academy => {
    const matchesSearch = academy.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus ? academy.status === filterStatus : true;
    return matchesSearch && matchesFilter;
  });

  const statusFilters = [
    { key: null, label: "All" },
    { key: "active", label: "Active" },
    { key: "trial", label: "Trial" },
    { key: "paused", label: "Paused" },
    { key: "overdue", label: "Overdue" },
  ];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading academies...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Academies</Text>
          <Text style={styles.subtitle}>{academies.length} total academies</Text>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.dark.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search academies..."
            placeholderTextColor={Colors.dark.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContainer}
        >
          {statusFilters.map((filter) => (
            <Pressable
              key={filter.key || "all"}
              style={[
                styles.filterChip,
                filterStatus === filter.key && styles.filterChipActive
              ]}
              onPress={() => setFilterStatus(filter.key)}
            >
              <Text style={[
                styles.filterChipText,
                filterStatus === filter.key && styles.filterChipTextActive
              ]}>
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.academiesList}>
          {filteredAcademies.map((academy) => (
            <AcademyCard key={academy.id} {...academy} />
          ))}
        </View>

        {filteredAcademies.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No academies found</Text>
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
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h1,
    color: PLATFORM_COLOR,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    color: Colors.dark.text,
    ...Typography.body,
  },
  filtersScroll: {
    marginBottom: Spacing.lg,
  },
  filtersContainer: {
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
  },
  filterChip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
  },
  filterChipActive: {
    backgroundColor: PLATFORM_COLOR,
  },
  filterChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  filterChipTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  academiesList: {
    gap: Spacing.md,
  },
  academyCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  academyHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  academyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${PLATFORM_COLOR}20`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  academyInfo: {
    flex: 1,
  },
  academyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  academyActivity: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.small,
    fontSize: 11,
    fontWeight: "600",
  },
  academyStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  academyStat: {
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
});
