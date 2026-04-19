import React from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - Spacing.lg * 2;

interface BookingCoachCardProps {
  coach: {
    id: string;
    name: string;
    profilePhotoUrl?: string | null;
    specialty?: string | null;
    yearsExperience?: string | null;
    specializations?: string[] | null;
    ballLevels?: string[] | null;
    rating?: number | null;
    totalSessions?: number | null;
    bio?: string | null;
    availableForPrivate?: boolean;
    availableForGroup?: boolean;
  };
  isSelected: boolean;
  onSelect?: () => void;
  onInfoPress?: () => void;
  index: number;
}

const SPECIALTY_COLORS: Record<string, string> = {
  "All-Round Development": "#10B981",
  "Competitive Training": "#F59E0B",
  "Junior Development": "#EC4899",
  "Adult Beginners": "#8B5CF6",
  "High Performance": "#EF4444",
  "Doubles Strategy": "#3B82F6",
  "Mental Game": "#06B6D4",
  "Serve & Return": "#10B981",
  "Footwork": "#F59E0B",
  "Match Strategy": "#3B82F6",
};

const BALL_LEVEL_COLORS: Record<string, string> = {
  red: "#EF4444",
  orange: "#F97316",
  green: "#22C55E",
  yellow: "#EAB308",
  adult_dss: "#8B5CF6",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  "0-2": "2+ years",
  "3-5": "5+ years",
  "6-10": "10+ years",
  "10+": "10+ years",
  "10-15": "15+ years",
  "15-20": "20+ years",
  "20+": "20+ years",
};

export default function BookingCoachCard({
  coach,
  isSelected,
  onSelect,
  onInfoPress,
  index,
}: BookingCoachCardProps) {
  const specialtyColor = SPECIALTY_COLORS[coach.specialty || ""] || GlowColors.primary;
  const safeName = coach?.name ?? "";

  const handleSelect = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    if (typeof onSelect === "function") onSelect();
  };

  const handleInfoPress = (e: any) => {
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    if (typeof onInfoPress === "function") onInfoPress();
  };

  return (
    <Animated.View 
      entering={FadeInDown.delay(index * 100).springify()}
      style={styles.cardWrapper}
    >
      <Pressable onPress={handleSelect}>
        <LinearGradient
          colors={
            isSelected 
              ? [GlowColors.primary + "30", GlowColors.primary + "10"]
              : ["rgba(30, 35, 45, 0.95)", "rgba(20, 25, 30, 0.98)"]
          }
          style={[
            styles.card, 
            isSelected && styles.cardSelected,
            { borderColor: isSelected ? GlowColors.primary : "rgba(255,255,255,0.1)" }
          ]}
        >
          <View style={styles.cardContent}>
            <View style={styles.photoSection}>
              {coach.profilePhotoUrl ? (
                <Image
                  source={{ uri: buildPhotoUrl(coach.profilePhotoUrl)! }}
                  style={styles.photo}
                  contentFit="cover"
                />
              ) : (
                <LinearGradient
                  colors={[specialtyColor + "40", specialtyColor + "20"]}
                  style={styles.photoPlaceholder}
                >
                  <Text style={[styles.photoInitial, { color: specialtyColor }]}>
                    {(safeName.charAt(0) || "?").toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
              
              {isSelected && (
                <View style={styles.selectedBadge}>
                  <Ionicons name="checkmark" size={16} color={Colors.dark.buttonText} />
                </View>
              )}
            </View>

            <View style={styles.infoSection}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{safeName}</Text>
                <Pressable onPress={handleInfoPress} style={styles.infoButton}>
                  <Ionicons name="information-circle-outline" size={22} color={Colors.dark.textSecondary} />
                </Pressable>
              </View>

              {coach.specialty && (
                <View style={[styles.specialtyBadge, { backgroundColor: specialtyColor + "20", borderColor: specialtyColor + "40" }]}>
                  <Text style={[styles.specialtyText, { color: specialtyColor }]}>{coach.specialty}</Text>
                </View>
              )}

              <View style={styles.statsRow}>
                {coach.yearsExperience && (
                  <View style={styles.statItem}>
                    <Ionicons name="ribbon-outline" size={14} color={Colors.dark.primary} />
                    <Text style={styles.statText}>
                      {EXPERIENCE_LABELS[coach.yearsExperience] || coach.yearsExperience}
                    </Text>
                  </View>
                )}
                {coach.rating && !isNaN(Number(coach.rating)) && (
                  <View style={styles.statItem}>
                    <Ionicons name="star" size={14} color="#FFD700" />
                    <Text style={styles.statText}>{Number(coach.rating).toFixed(1)}</Text>
                  </View>
                )}
                {coach.totalSessions && coach.totalSessions > 0 && (
                  <View style={styles.statItem}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.dark.textSecondary} />
                    <Text style={styles.statText}>{coach.totalSessions} sessions</Text>
                  </View>
                )}
              </View>

              {Array.isArray(coach.ballLevels) && coach.ballLevels.length > 0 && (
                <View style={styles.ballLevelsRow}>
                  {coach.ballLevels.slice(0, 4).map((level) => (
                    <View 
                      key={level} 
                      style={[styles.ballLevelDot, { backgroundColor: BALL_LEVEL_COLORS[level] || Colors.dark.primary }]}
                    />
                  ))}
                  <Text style={styles.ballLevelLabel}>Ball Levels</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.availabilityRow}>
            {coach.availableForPrivate && (
              <View style={styles.availabilityBadge}>
                <Ionicons name="person" size={12} color="#22C55E" />
                <Text style={styles.availabilityText}>Private</Text>
              </View>
            )}
            {coach.availableForGroup && (
              <View style={styles.availabilityBadge}>
                <Ionicons name="people" size={12} color="#22C55E" />
                <Text style={styles.availabilityText}>Group</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  cardWrapper: {
    marginBottom: Spacing.md,
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardSelected: {
    borderWidth: 2,
  },
  cardContent: {
    flexDirection: "row",
    padding: Spacing.md,
  },
  photoSection: {
    position: "relative",
    marginRight: Spacing.md,
  },
  photo: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.md,
  },
  photoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  photoInitial: {
    fontSize: 32,
    fontWeight: "800",
  },
  selectedBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  infoSection: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    flex: 1,
  },
  infoButton: {
    padding: 4,
  },
  specialtyBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  specialtyText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  ballLevelsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ballLevelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ballLevelLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginLeft: 4,
  },
  availabilityRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  availabilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  availabilityText: {
    fontSize: 11,
    color: "#22C55E",
    fontWeight: "500",
  },
}));
