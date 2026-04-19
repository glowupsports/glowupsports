import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";

import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface CoachProfileDrawerProps {
  visible: boolean;
  onClose: () => void;
  onSelectCoach: () => void;
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
    certifications?: string[] | null;
    languages?: string[] | null;
    availableForPrivate?: boolean;
    availableForGroup?: boolean;
  } | null;
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

const BALL_LEVEL_LABELS: Record<string, string> = {
  red: "Red Ball",
  orange: "Orange Ball",
  green: "Green Ball",
  yellow: "Yellow Ball",
  adult_dss: "Adult DSS",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  "0-2": "2+ years experience",
  "3-5": "5+ years experience",
  "6-10": "10+ years experience",
  "10+": "10+ years experience",
  "10-15": "15+ years experience",
  "15-20": "20+ years experience",
  "20+": "20+ years experience",
};

export default function CoachProfileDrawer({
  visible,
  onClose,
  onSelectCoach,
  coach,
}: CoachProfileDrawerProps) {
  const insets = useSafeAreaInsets();

  if (!coach) return null;

  const specialtyColor = SPECIALTY_COLORS[coach.specialty || ""] || GlowColors.primary;

  const handleSelect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelectCoach();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        
        <Animated.View 
          entering={SlideInDown.springify().damping(20)}
          style={[styles.drawer, { paddingBottom: insets.bottom + Spacing.lg }]}
        >
          <View style={styles.handle} />
          
          <ScrollView 
            showsVerticalScrollIndicator={false}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.heroSection}>
              {coach.profilePhotoUrl ? (
                <Image
                  source={{ uri: buildPhotoUrl(coach.profilePhotoUrl)! }}
                  style={styles.heroPhoto}
                  contentFit="cover"
                />
              ) : (
                <LinearGradient
                  colors={[specialtyColor + "40", specialtyColor + "20"]}
                  style={styles.heroPhotoPlaceholder}
                >
                  <Text style={[styles.heroInitial, { color: specialtyColor }]}>
                    {coach.name.charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
              
              <View style={styles.heroInfo}>
                <Text style={styles.heroName}>{coach.name}</Text>
                
                {coach.specialty && (
                  <View style={[styles.specialtyBadge, { backgroundColor: specialtyColor + "20", borderColor: specialtyColor + "40" }]}>
                    <Text style={[styles.specialtyText, { color: specialtyColor }]}>{coach.specialty}</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.quickStatsRow}>
              {coach.yearsExperience && (
                <View style={styles.quickStatCard}>
                  <Ionicons name="ribbon" size={20} color={Colors.dark.primary} />
                  <Text style={styles.quickStatValue}>
                    {EXPERIENCE_LABELS[coach.yearsExperience] || coach.yearsExperience}
                  </Text>
                </View>
              )}
              {!isNaN(Number(coach.rating)) && Number(coach.rating) > 0 && (
                <View style={styles.quickStatCard}>
                  <Ionicons name="star" size={20} color="#FFD700" />
                  <Text style={styles.quickStatValue}>{Number(coach.rating).toFixed(1)} rating</Text>
                </View>
              )}
              {coach.totalSessions && coach.totalSessions > 0 && (
                <View style={styles.quickStatCard}>
                  <Ionicons name="calendar-outline" size={20} color={Colors.dark.accentText} />
                  <Text style={styles.quickStatValue}>{coach.totalSessions} sessions</Text>
                </View>
              )}
            </View>

            <View style={styles.availabilitySection}>
              <Text style={styles.sectionTitle}>Availability</Text>
              <View style={styles.availabilityCards}>
                <View style={[styles.availabilityCard, coach.availableForPrivate && styles.availabilityCardActive]}>
                  <Ionicons 
                    name={coach.availableForPrivate ? "checkmark-circle" : "close-circle"} 
                    size={18} 
                    color={coach.availableForPrivate ? "#22C55E" : Colors.dark.textMuted} 
                  />
                  <Text style={[styles.availabilityLabel, coach.availableForPrivate && styles.availabilityLabelActive]}>
                    Private Lessons
                  </Text>
                </View>
                <View style={[styles.availabilityCard, coach.availableForGroup && styles.availabilityCardActive]}>
                  <Ionicons 
                    name={coach.availableForGroup ? "checkmark-circle" : "close-circle"} 
                    size={18} 
                    color={coach.availableForGroup ? "#22C55E" : Colors.dark.textMuted} 
                  />
                  <Text style={[styles.availabilityLabel, coach.availableForGroup && styles.availabilityLabelActive]}>
                    Group Sessions
                  </Text>
                </View>
              </View>
            </View>

            {coach.ballLevels && coach.ballLevels.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Coaching Levels</Text>
                <View style={styles.ballLevelsGrid}>
                  {coach.ballLevels.map((level) => (
                    <View 
                      key={level} 
                      style={[styles.ballLevelTag, { backgroundColor: (BALL_LEVEL_COLORS[level] || Colors.dark.primary) + "20" }]}
                    >
                      <View style={[styles.ballLevelDot, { backgroundColor: BALL_LEVEL_COLORS[level] || Colors.dark.primary }]} />
                      <Text style={[styles.ballLevelText, { color: BALL_LEVEL_COLORS[level] || Colors.dark.primary }]}>
                        {BALL_LEVEL_LABELS[level] || level}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {coach.specializations && coach.specializations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Specializations</Text>
                <View style={styles.tagsGrid}>
                  {coach.specializations.map((spec, index) => (
                    <View key={index} style={styles.specTag}>
                      <Ionicons name="tennisball-outline" size={12} color={Colors.dark.accentText} />
                      <Text style={styles.specTagText}>{spec}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {coach.bio && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <Text style={styles.bioText}>{coach.bio}</Text>
              </View>
            )}

            {coach.certifications && coach.certifications.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Certifications</Text>
                {coach.certifications.map((cert, index) => (
                  <View key={index} style={styles.certRow}>
                    <Ionicons name="ribbon-outline" size={16} color={Colors.dark.primary} />
                    <Text style={styles.certText}>{cert}</Text>
                  </View>
                ))}
              </View>
            )}

            {coach.languages && coach.languages.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Languages</Text>
                <View style={styles.languagesRow}>
                  {coach.languages.map((lang, index) => (
                    <View key={index} style={styles.languageTag}>
                      <Text style={styles.languageText}>{lang}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
            <Pressable style={styles.selectButton} onPress={handleSelect}>
              <LinearGradient
                colors={[GlowColors.primary, GlowColors.primary + "CC"]}
                style={styles.selectButtonGradient}
              >
                <Ionicons name="checkmark-circle" size={20} color="#1A1A1A" />
                <Text style={styles.selectButtonText}>Select {coach.name.split(" ")[0]}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.overlay,
  },
  drawer: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.textMuted,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  heroSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  heroPhoto: {
    width: 90,
    height: 90,
    borderRadius: BorderRadius.lg,
    marginRight: Spacing.md,
  },
  heroPhotoPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: BorderRadius.lg,
    marginRight: Spacing.md,
    justifyContent: "center",
    alignItems: "center",
  },
  heroInitial: {
    fontSize: 36,
    fontWeight: "800",
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  specialtyBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  specialtyText: {
    fontSize: 12,
    fontWeight: "600",
  },
  quickStatsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  quickStatCard: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  quickStatValue: {
    fontSize: 11,
    color: Colors.dark.text,
    fontWeight: "600",
    textAlign: "center",
  },
  availabilitySection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  availabilityCards: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  availabilityCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  availabilityCardActive: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  availabilityLabel: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  availabilityLabelActive: {
    color: "#22C55E",
  },
  section: {
    marginBottom: Spacing.lg,
  },
  ballLevelsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  ballLevelTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  ballLevelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ballLevelText: {
    fontSize: 12,
    fontWeight: "600",
  },
  tagsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  specTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  specTagText: {
    fontSize: 12,
    color: Colors.dark.accentText,
    fontWeight: "500",
  },
  bioText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
  },
  certRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  certText: {
    fontSize: 13,
    color: Colors.dark.text,
  },
  languagesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  languageTag: {
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  languageText: {
    fontSize: 12,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  footer: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  closeButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  selectButton: {
    flex: 2,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  selectButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
  },
}));
