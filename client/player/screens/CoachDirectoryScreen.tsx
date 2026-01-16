import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";

import { Colors, Spacing, BorderRadius, Typography, Backgrounds, GlowColors } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";

interface CoachDirectoryEntry {
  id: string;
  name: string;
  specialty: string | null;
  photoUrl: string | null;
  publicQuote: string | null;
  yearsExperience: string | null;
  specializations: string[] | null;
  languages: string[] | null;
  level: number | null;
  openToOpportunities: boolean | null;
  academyId: string | null;
  academyName: string | null;
  academyCity: string | null;
  academyCountry: string | null;
}

const EXPERIENCE_LABELS: Record<string, string> = {
  "0-2": "0-2 years",
  "3-5": "3-5 years",
  "6-10": "6-10 years",
  "10+": "10+ years",
};

function CoachCard({ coach, onPress }: { coach: CoachDirectoryEntry; onPress: () => void }) {
  return (
    <Pressable style={styles.coachCard} onPress={onPress}>
      <View style={styles.coachAvatar}>
        <Text style={styles.coachInitial}>{coach.name.charAt(0)}</Text>
      </View>
      <View style={styles.coachInfo}>
        <Text style={styles.coachName}>{coach.name}</Text>
        {coach.academyName ? (
          <View style={styles.academyRow}>
            <Ionicons name="school-outline" size={12} color={Colors.dark.textMuted} />
            <Text style={styles.academyName}>{coach.academyName}</Text>
            {coach.academyCity ? (
              <Text style={styles.academyCity}> - {coach.academyCity}</Text>
            ) : null}
          </View>
        ) : null}
        {coach.specialty ? (
          <Text style={styles.coachSpecialty}>{coach.specialty}</Text>
        ) : null}
        {coach.yearsExperience ? (
          <Text style={styles.experience}>
            {EXPERIENCE_LABELS[coach.yearsExperience] || coach.yearsExperience} experience
          </Text>
        ) : null}
      </View>
      <View style={styles.coachMeta}>
        {coach.level ? (
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>Lvl {coach.level}</Text>
          </View>
        ) : null}
        {coach.openToOpportunities ? (
          <View style={styles.openBadge}>
            <Ionicons name="checkmark-circle" size={12} color={Colors.dark.primary} />
            <Text style={styles.openText}>Open</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function CoachDirectoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [searchQuery, setSearchQuery] = useState("");
  const [showOpenOnly, setShowOpenOnly] = useState(false);

  const { data: coachesData, isLoading } = useQuery<{ coaches: CoachDirectoryEntry[] }>({
    queryKey: ["/api/coaches/directory", showOpenOnly ? "open" : "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (showOpenOnly) params.set("openToOpportunities", "true");
      const response = await apiFetch(`/api/coaches/directory?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load coaches");
      return response.json();
    },
  });

  const coaches = coachesData?.coaches || [];

  const filteredCoaches = searchQuery.trim()
    ? coaches.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.specialty?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.academyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.academyCity?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : coaches;

  const handleCoachPress = (coach: CoachDirectoryEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("CoachProfile", { coachId: coach.id });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.backRow}>
        <Pressable 
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Coach Directory</Text>
        <Text style={styles.subtitle}>Find tennis coaches across the platform</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name, specialty, or location..."
            placeholderTextColor={Colors.dark.textMuted}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={Colors.dark.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={[styles.filterButton, showOpenOnly && styles.filterButtonActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowOpenOnly(!showOpenOnly);
          }}
        >
          <Ionicons 
            name="briefcase-outline" 
            size={18} 
            color={showOpenOnly ? Colors.dark.backgroundRoot : Colors.dark.textMuted} 
          />
          <Text style={[styles.filterText, showOpenOnly && styles.filterTextActive]}>
            Open to Opportunities
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
          <Text style={styles.loadingText}>Loading coaches...</Text>
        </View>
      ) : filteredCoaches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No Coaches Found</Text>
          <Text style={styles.emptyText}>
            {searchQuery ? "Try adjusting your search" : "No coaches are visible in the directory yet"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCoaches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CoachCard coach={item} onPress={() => handleCoachPress(item)} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  backRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
  },
  filterButtonActive: {
    backgroundColor: Colors.dark.primary,
  },
  filterText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  filterTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  coachCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  coachAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  coachInitial: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  coachInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  academyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  academyName: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  academyCity: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  coachSpecialty: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  experience: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  coachMeta: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  levelBadge: {
    backgroundColor: "rgba(0, 200, 200, 0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  levelText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  openBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  openText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
});
