import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiFetch, getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.md) / 2;

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
  rating?: number;
  totalStudents?: number;
}

const EXPERIENCE_LABELS: Record<string, string> = {
  "0-2": "Emerging",
  "3-5": "Experienced",
  "6-10": "Senior",
  "10+": "Master",
};

const SPECIALTY_COLORS: Record<string, string> = {
  "All-Round Development": "#10B981",
  "Competitive Training": "#F59E0B",
  "Junior Development": "#EC4899",
  "Adult Beginners": "#8B5CF6",
  "High Performance": "#EF4444",
  "Doubles Strategy": "#3B82F6",
  "Mental Game": "#06B6D4",
};

function PremiumCoachCard({ coach, onPress, index }: { coach: CoachDirectoryEntry; onPress: () => void; index: number }) {
  const specialtyColor = SPECIALTY_COLORS[coach.specialty || ""] || GlowColors.primary;
  
  return (
    <Animated.View 
      entering={FadeInDown.delay(index * 80).springify()}
      style={styles.cardWrapper}
    >
      <Pressable onPress={onPress} style={styles.cardPressable}>
        <LinearGradient
          colors={["rgba(30, 35, 45, 0.95)", "rgba(20, 25, 30, 0.98)"]}
          style={[styles.coachCard, { borderColor: specialtyColor + "40" }]}
        >
          <View style={styles.cardImageSection}>
            {coach.photoUrl ? (
              <Image 
                source={{ uri: buildPhotoUrl(coach.photoUrl)! }} 
                style={styles.coachPhoto}
                contentFit="cover"
              />
            ) : (
              <LinearGradient
                colors={[specialtyColor + "40", specialtyColor + "20"]}
                style={styles.coachPhotoPlaceholder}
              >
                <Text style={[styles.coachInitial, { color: specialtyColor }]}>
                  {coach.name.charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>
            )}
            
            {coach.level ? (
              <View style={[styles.levelBadge, { backgroundColor: Colors.dark.xpCyan }]}>
                <Text style={styles.levelText}>Lvl {coach.level}</Text>
              </View>
            ) : null}
            
            {coach.openToOpportunities ? (
              <View style={styles.availableBadge}>
                <Ionicons name="checkmark-circle" size={10} color="#fff" />
              </View>
            ) : null}
          </View>
          
          <View style={styles.cardContent}>
            <Text style={styles.coachName} numberOfLines={1}>{coach.name}</Text>
            
            {coach.academyName ? (
              <View style={styles.academyRow}>
                <Ionicons name="school-outline" size={11} color={Colors.dark.textMuted} />
                <Text style={styles.academyName} numberOfLines={1}>{coach.academyName}</Text>
              </View>
            ) : null}
            
            {coach.specialty ? (
              <View style={[styles.specialtyBadge, { backgroundColor: specialtyColor + "20", borderColor: specialtyColor + "50" }]}>
                <Text style={[styles.specialtyText, { color: specialtyColor }]} numberOfLines={1}>
                  {coach.specialty}
                </Text>
              </View>
            ) : null}
            
            <View style={styles.statsRow}>
              {coach.yearsExperience ? (
                <View style={styles.statItem}>
                  <Ionicons name="ribbon-outline" size={12} color={Colors.dark.primary} />
                  <Text style={styles.statText}>
                    {EXPERIENCE_LABELS[coach.yearsExperience] || coach.yearsExperience}
                  </Text>
                </View>
              ) : null}
              {coach.rating ? (
                <View style={styles.statItem}>
                  <Ionicons name="star" size={12} color="#FFD700" />
                  <Text style={styles.statText}>{coach.rating.toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          </View>
          
          <View style={styles.cardFooter}>
            <LinearGradient
              colors={[specialtyColor, specialtyColor + "CC"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.viewButton}
            >
              <Text style={styles.viewButtonText}>View Profile</Text>
              <Ionicons name="chevron-forward" size={14} color="#fff" />
            </LinearGradient>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

type FilterTab = "all" | "academy" | "open";

export default function CoachDirectoryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const { data: coachesData, isLoading } = useQuery<{ coaches: CoachDirectoryEntry[] }>({
    queryKey: ["/api/coaches/directory", activeTab === "open" ? "open" : "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeTab === "open") params.set("openToOpportunities", "true");
      const response = await apiFetch(`/api/coaches/directory?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load coaches");
      return response.json();
    },
  });

  const coaches = coachesData?.coaches || [];

  const filteredCoaches = useMemo(() => {
    let list = coaches;
    
    if (activeTab === "academy" && user?.academyId) {
      list = list.filter(c => c.academyId === user.academyId);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.specialty?.toLowerCase().includes(query) ||
          c.academyName?.toLowerCase().includes(query) ||
          c.academyCity?.toLowerCase().includes(query)
      );
    }
    
    return list;
  }, [coaches, searchQuery, activeTab, user?.academyId]);

  const handleCoachPress = (coach: CoachDirectoryEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("CoachProfile", { coachId: coach.id });
  };

  const tabs: { key: FilterTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "all", label: "All Coaches", icon: "people" },
    { key: "academy", label: "My Academy", icon: "school" },
    { key: "open", label: "Available", icon: "checkmark-circle" },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundSecondary]}
        style={styles.headerGradient}
      >
        <View style={[styles.header, { paddingTop: headerHeight + Spacing.md }]}>
          <View style={styles.titleRow}>
            <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.title}>Find Coaches</Text>
            <View style={styles.coachCount}>
              <Ionicons name="people" size={14} color={GlowColors.primary} />
              <Text style={styles.coachCountText}>{filteredCoaches.length}</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            Discover world-class tennis coaches
          </Text>
        </View>
        
        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search coaches..."
              placeholderTextColor={Colors.dark.textMuted}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color={Colors.dark.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>
        
        <View style={styles.tabsContainer}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab(tab.key);
              }}
            >
              <Ionicons 
                name={tab.icon} 
                size={16} 
                color={activeTab === tab.key ? Colors.dark.backgroundRoot : Colors.dark.textMuted} 
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={GlowColors.primary} />
          <Text style={styles.loadingText}>Finding coaches...</Text>
        </View>
      ) : filteredCoaches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <LinearGradient
            colors={[GlowColors.primary + "30", GlowColors.primary + "10"]}
            style={styles.emptyIcon}
          >
            <Ionicons name="people-outline" size={40} color={GlowColors.primary} />
          </LinearGradient>
          <Text style={styles.emptyTitle}>No Coaches Found</Text>
          <Text style={styles.emptyText}>
            {searchQuery ? "Try adjusting your search" : "No coaches match your filters"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCoaches}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          renderItem={({ item, index }) => (
            <PremiumCoachCard coach={item} onPress={() => handleCoachPress(item)} index={index} />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
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
  headerGradient: {
    paddingBottom: Spacing.lg,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    marginRight: Spacing.sm,
    padding: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: -0.5,
  },
  coachCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.md,
  },
  coachCountText: {
    fontSize: 14,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark.text,
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Backgrounds.card,
  },
  tabActive: {
    backgroundColor: GlowColors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: Colors.dark.textMuted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  row: {
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  cardWrapper: {
    width: CARD_WIDTH,
  },
  cardPressable: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  coachCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardImageSection: {
    height: 120,
    position: "relative",
  },
  coachPhoto: {
    width: "100%",
    height: "100%",
  },
  coachPhotoPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  coachInitial: {
    fontSize: 40,
    fontWeight: "800",
  },
  levelBadge: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  levelText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  availableBadge: {
    position: "absolute",
    top: Spacing.sm,
    left: Spacing.sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#22C55E",
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: {
    padding: Spacing.sm,
  },
  coachName: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  academyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
  },
  academyName: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  specialtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
    borderWidth: 1,
    marginBottom: 6,
  },
  specialtyText: {
    fontSize: 10,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  statText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  cardFooter: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  viewButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
});
