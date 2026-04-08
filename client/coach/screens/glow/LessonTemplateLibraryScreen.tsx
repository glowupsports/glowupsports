import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors, TextColors } from "@/constants/theme";
import { apiFetch } from "@/lib/query-client";

interface DrillBlock {
  id: string;
  name: string;
  blockType: string;
  durationMinutes: number;
  pillars: string[];
  coachInstructions: string;
  playerInstructions: string;
  skillIds?: string[];
  orderIndex: number;
}

interface LessonTemplate {
  id: string;
  levelId: string;
  name: string;
  description: string;
  focus: string;
  durationMinutes: number;
  minPlayers: number;
  maxPlayers: number;
  ageGroup: string;
  tags: string[];
  blocks?: DrillBlock[];
}

type BallLevel = "BLUE" | "RED" | "ORANGE" | "GREEN" | "YELLOW" | "ADULT";

const BALL_LEVEL_CONFIG: Record<BallLevel, {
  label: string;
  color: string;
  gradientStart: string;
  gradientEnd: string;
  icon: string;
  ageRange: string;
  description: string;
}> = {
  BLUE: {
    label: "Blue Ball",
    color: "#3B82F6",
    gradientStart: "#3B82F6",
    gradientEnd: "#1E40AF",
    icon: "star-outline",
    ageRange: "2-4 jaar",
    description: "Pre-tennis foundation",
  },
  RED: {
    label: "Red Ball",
    color: "#EF4444",
    gradientStart: "#EF4444",
    gradientEnd: "#B91C1C",
    icon: "tennisball-outline",
    ageRange: "4-8 jaar",
    description: "First strokes & rallies",
  },
  ORANGE: {
    label: "Orange Ball",
    color: "#F97316",
    gradientStart: "#F97316",
    gradientEnd: "#C2410C",
    icon: "tennisball",
    ageRange: "7-10 jaar",
    description: "Bigger court, faster ball",
  },
  GREEN: {
    label: "Green Ball",
    color: "#22C55E",
    gradientStart: "#22C55E",
    gradientEnd: "#15803D",
    icon: "tennisball",
    ageRange: "9-12 jaar",
    description: "Full court transition",
  },
  YELLOW: {
    label: "Yellow Ball",
    color: "#EAB308",
    gradientStart: "#EAB308",
    gradientEnd: "#A16207",
    icon: "tennisball",
    ageRange: "11+ jaar",
    description: "Competition ready",
  },
  ADULT: {
    label: "Adult Glow",
    color: "#00E5FF",
    gradientStart: "#00E5FF",
    gradientEnd: "#0088CC",
    icon: "flash",
    ageRange: "18+ jaar",
    description: "DSS Rating System",
  },
};

const PILLAR_CONFIG: Record<string, { color: string; icon: string }> = {
  TECHNIQUE: { color: "#00E5FF", icon: "construct" },
  TACTICAL: { color: "#C8FF3D", icon: "bulb" },
  PHYSICAL: { color: "#F97316", icon: "fitness" },
  MENTAL: { color: "#A855F7", icon: "brain" },
  SOCIAL: { color: "#FFB020", icon: "people" },
  MATCH: { color: "#EF4444", icon: "trophy" },
};

const BLOCK_TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  warmup: { color: "#F97316", label: "Warming-up" },
  drill: { color: "#00E5FF", label: "Drill" },
  game: { color: "#C8FF3D", label: "Game" },
  cooldown: { color: "#A855F7", label: "Cool-down" },
  technical: { color: "#00E5FF", label: "Technical" },
  tactical: { color: "#C8FF3D", label: "Tactical" },
  points: { color: "#EF4444", label: "Points" },
  debrief: { color: "#7C8290", label: "Debrief" },
  fitness: { color: "#F97316", label: "Fitness" },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function BallLevelCard({ 
  level, 
  templates, 
  isExpanded, 
  onToggle 
}: { 
  level: BallLevel; 
  templates: LessonTemplate[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const config = BALL_LEVEL_CONFIG[level];
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onToggle();
  };
  
  return (
    <Animated.View entering={FadeInDown.delay(100)} style={styles.levelSection}>
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={() => { scale.value = withSpring(0.98, { damping: 15 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
        style={animatedStyle}
      >
        <LinearGradient
          colors={[config.gradientStart, config.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.levelHeader}
        >
          <View style={styles.levelHeaderContent}>
            <View style={styles.levelIconContainer}>
              <Ionicons name={config.icon as any} size={28} color="#FFFFFF" />
            </View>
            <View style={styles.levelInfo}>
              <ThemedText style={styles.levelLabel}>{config.label}</ThemedText>
              <ThemedText style={styles.levelMeta}>
                {config.ageRange} • {templates.length} templates
              </ThemedText>
              <ThemedText style={styles.levelDescription}>{config.description}</ThemedText>
            </View>
            <View style={styles.levelExpandIcon}>
              <Ionicons 
                name={isExpanded ? "chevron-up" : "chevron-down"} 
                size={24} 
                color="#FFFFFF" 
              />
            </View>
          </View>
        </LinearGradient>
      </AnimatedPressable>
      
      {isExpanded && templates.length > 0 && (
        <View style={styles.templatesContainer}>
          {templates.map((template, index) => (
            <TemplateCard key={template.id} template={template} index={index} />
          ))}
        </View>
      )}
      
      {isExpanded && templates.length === 0 && (
        <View style={styles.emptyTemplates}>
          <Ionicons name="document-outline" size={32} color={TextColors.muted} />
          <ThemedText style={styles.emptyText}>No templates yet</ThemedText>
        </View>
      )}
    </Animated.View>
  );
}

function TemplateCard({ template, index }: { template: LessonTemplate; index: number }) {
  const [showBlocks, setShowBlocks] = useState(false);
  const navigation = useNavigation<any>();
  const levelPrefix = template.levelId?.split("_")[0] as BallLevel;
  const config = BALL_LEVEL_CONFIG[levelPrefix] || BALL_LEVEL_CONFIG.RED;
  
  const { data: templateWithBlocks, isLoading } = useQuery<LessonTemplate>({
    queryKey: ["/api/lesson-templates", template.id],
    queryFn: async () => {
      const res = await apiFetch(`/api/lesson-templates/${template.id}`);
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: showBlocks,
  });
  
  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowBlocks(!showBlocks);
  };
  
  const handleUseTemplate = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    navigation.navigate("SessionPlan", { templateId: template.id });
  };
  
  const blocks = templateWithBlocks?.blocks || [];
  
  return (
    <Animated.View 
      entering={FadeIn.delay(index * 50)}
      style={styles.templateCard}
    >
      <Pressable onPress={handlePress}>
        <View style={styles.templateHeader}>
          <View style={[styles.templateAccent, { backgroundColor: config.color }]} />
          <View style={styles.templateContent}>
            <View style={styles.templateTitleRow}>
              <ThemedText style={styles.templateName}>{template.name}</ThemedText>
              <View style={styles.templateMeta}>
                <Ionicons name="time-outline" size={14} color={TextColors.muted} />
                <ThemedText style={styles.templateDuration}>{template.durationMinutes}min</ThemedText>
              </View>
            </View>
            <ThemedText style={styles.templateDescription} numberOfLines={2}>
              {template.description}
            </ThemedText>
            <View style={styles.templateTags}>
              <View style={styles.templateTag}>
                <Ionicons name="people-outline" size={12} color={TextColors.secondary} />
                <ThemedText style={styles.tagText}>{template.minPlayers}-{template.maxPlayers}</ThemedText>
              </View>
              <View style={styles.templateTag}>
                <Ionicons name="flag-outline" size={12} color={TextColors.secondary} />
                <ThemedText style={styles.tagText}>{template.focus}</ThemedText>
              </View>
              <View style={styles.templateExpandHint}>
                <Ionicons 
                  name={showBlocks ? "chevron-up" : "chevron-down"} 
                  size={16} 
                  color={TextColors.muted} 
                />
              </View>
            </View>
          </View>
        </View>
      </Pressable>
      
      {showBlocks && (
        <View style={styles.blocksContainer}>
          {isLoading ? (
            <View style={styles.loadingBlocks}>
              <ActivityIndicator size="small" color={config.color} />
              <ThemedText style={styles.loadingText}>Loading blocks...</ThemedText>
            </View>
          ) : blocks.length > 0 ? (
            <>
              <ThemedText style={styles.blocksTitle}>Drill Blocks ({blocks.length})</ThemedText>
              {blocks.map((block, idx) => (
                <DrillBlockCard key={block.id} block={block} index={idx} color={config.color} />
              ))}
              <Pressable style={[styles.useButton, { backgroundColor: config.color }]} onPress={handleUseTemplate}>
                <Ionicons name="play" size={18} color={Colors.dark.buttonText} />
                <ThemedText style={styles.useButtonText}>Use This Template</ThemedText>
              </Pressable>
            </>
          ) : (
            <ThemedText style={styles.noBlocksText}>No drill blocks defined</ThemedText>
          )}
        </View>
      )}
    </Animated.View>
  );
}

function DrillBlockCard({ block, index, color }: { block: DrillBlock; index: number; color: string }) {
  const [showDetails, setShowDetails] = useState(false);
  const blockConfig = BLOCK_TYPE_CONFIG[block.blockType] || { color: "#7C8290", label: block.blockType };
  
  return (
    <View style={styles.drillBlock}>
      <Pressable onPress={() => setShowDetails(!showDetails)} style={styles.drillBlockHeader}>
        <View style={styles.drillBlockLeft}>
          <View style={[styles.blockOrderBadge, { backgroundColor: blockConfig.color + "30" }]}>
            <ThemedText style={[styles.blockOrderText, { color: blockConfig.color }]}>{index + 1}</ThemedText>
          </View>
          <View style={styles.drillBlockInfo}>
            <ThemedText style={styles.drillBlockName}>{block.name}</ThemedText>
            <View style={styles.drillBlockMeta}>
              <View style={[styles.blockTypeBadge, { backgroundColor: blockConfig.color + "20" }]}>
                <ThemedText style={[styles.blockTypeText, { color: blockConfig.color }]}>{blockConfig.label}</ThemedText>
              </View>
              <ThemedText style={styles.drillBlockDuration}>{block.durationMinutes} min</ThemedText>
            </View>
          </View>
        </View>
        <View style={styles.pillarsRow}>
          {block.pillars?.slice(0, 3).map((pillar) => {
            const pillarConfig = PILLAR_CONFIG[pillar];
            return pillarConfig ? (
              <View 
                key={pillar} 
                style={[styles.pillarBadge, { backgroundColor: pillarConfig.color + "25" }]}
              >
                <Ionicons name={pillarConfig.icon as any} size={12} color={pillarConfig.color} />
              </View>
            ) : null;
          })}
        </View>
      </Pressable>
      
      {showDetails && (
        <View style={styles.drillBlockDetails}>
          <View style={styles.instructionSection}>
            <View style={styles.instructionHeader}>
              <Ionicons name="person" size={14} color="#00E5FF" />
              <ThemedText style={styles.instructionLabel}>Coach</ThemedText>
            </View>
            <ThemedText style={styles.instructionText}>{block.coachInstructions}</ThemedText>
          </View>
          <View style={styles.instructionSection}>
            <View style={styles.instructionHeader}>
              <Ionicons name="people" size={14} color="#C8FF3D" />
              <ThemedText style={styles.instructionLabel}>Players</ThemedText>
            </View>
            <ThemedText style={styles.instructionText}>{block.playerInstructions}</ThemedText>
          </View>
          {block.skillIds && block.skillIds.length > 0 && (
            <View style={styles.skillsRow}>
              {block.skillIds.slice(0, 4).map((skillId) => (
                <View key={skillId} style={styles.skillBadge}>
                  <ThemedText style={styles.skillText}>{skillId.replace(/_/g, " ").slice(-20)}</ThemedText>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function LessonTemplateLibraryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [expandedLevel, setExpandedLevel] = useState<BallLevel | null>(null);
  
  const { data: templates = [], isLoading } = useQuery<LessonTemplate[]>({
    queryKey: ["/api/lesson-templates"],
  });
  
  const templatesByLevel = useMemo(() => {
    const grouped: Record<BallLevel, LessonTemplate[]> = {
      BLUE: [],
      RED: [],
      ORANGE: [],
      GREEN: [],
      YELLOW: [],
      ADULT: [],
    };
    
    templates.forEach((template) => {
      const levelPrefix = template.levelId?.split("_")[0]?.toUpperCase() as BallLevel;
      if (grouped[levelPrefix]) {
        grouped[levelPrefix].push(template);
      } else if (template.levelId?.includes("ADULT") || template.levelId?.includes("GLOW")) {
        grouped.ADULT.push(template);
      }
    });
    
    return grouped;
  }, [templates]);
  
  const handleToggleLevel = (level: BallLevel) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpandedLevel(expandedLevel === level ? null : level);
  };
  
  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={GlowColors.primary} />
        <ThemedText style={styles.loadingText}>Loading lesson templates...</ThemedText>
      </View>
    );
  }
  
  const levels: BallLevel[] = ["BLUE", "RED", "ORANGE", "GREEN", "YELLOW", "ADULT"];
  
  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      <ScrollView 
        contentContainerStyle={[
          styles.scrollContent, 
          { paddingBottom: insets.bottom + Spacing.xl }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ThemedText style={styles.title}>Lesson Templates</ThemedText>
          <ThemedText style={styles.subtitle}>
            {templates.length} templates across {levels.length} ball levels
          </ThemedText>
        </View>
        
        <View style={styles.statsRow}>
          {levels.slice(0, 3).map((level) => {
            const config = BALL_LEVEL_CONFIG[level];
            const count = templatesByLevel[level].length;
            return (
              <View key={level} style={styles.statCard}>
                <View style={[styles.statDot, { backgroundColor: config.color }]} />
                <ThemedText style={styles.statCount}>{count}</ThemedText>
                <ThemedText style={styles.statLabel}>{level}</ThemedText>
              </View>
            );
          })}
        </View>
        
        <View style={styles.statsRow}>
          {levels.slice(3).map((level) => {
            const config = BALL_LEVEL_CONFIG[level];
            const count = templatesByLevel[level].length;
            return (
              <View key={level} style={styles.statCard}>
                <View style={[styles.statDot, { backgroundColor: config.color }]} />
                <ThemedText style={styles.statCount}>{count}</ThemedText>
                <ThemedText style={styles.statLabel}>{level}</ThemedText>
              </View>
            );
          })}
        </View>
        
        {levels.map((level) => (
          <BallLevelCard
            key={level}
            level={level}
            templates={templatesByLevel[level]}
            isExpanded={expandedLevel === level}
            onToggle={() => handleToggleLevel(level)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    color: TextColors.muted,
    fontSize: 14,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: TextColors.primary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: TextColors.muted,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  statDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statCount: {
    fontSize: 18,
    fontWeight: "700",
    color: TextColors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: TextColors.muted,
  },
  levelSection: {
    marginTop: Spacing.md,
  },
  levelHeader: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  levelHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  levelIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  levelInfo: {
    flex: 1,
  },
  levelLabel: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  levelMeta: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  levelDescription: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  levelExpandIcon: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  templatesContainer: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  emptyTemplates: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  emptyText: {
    color: TextColors.muted,
    fontSize: 14,
    marginTop: Spacing.sm,
  },
  templateCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  templateHeader: {
    flexDirection: "row",
  },
  templateAccent: {
    width: 4,
  },
  templateContent: {
    flex: 1,
    padding: Spacing.md,
  },
  templateTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  templateName: {
    fontSize: 16,
    fontWeight: "600",
    color: TextColors.primary,
    flex: 1,
  },
  templateMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  templateDuration: {
    fontSize: 13,
    color: TextColors.muted,
  },
  templateDescription: {
    fontSize: 13,
    color: TextColors.secondary,
    marginTop: Spacing.xs,
  },
  templateTags: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  templateTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Backgrounds.surface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  tagText: {
    fontSize: 11,
    color: TextColors.secondary,
  },
  templateExpandHint: {
    marginLeft: "auto",
  },
  blocksContainer: {
    padding: Spacing.md,
    paddingTop: 0,
    gap: Spacing.sm,
  },
  loadingBlocks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  blocksTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: TextColors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  noBlocksText: {
    fontSize: 13,
    color: TextColors.muted,
    textAlign: "center",
    padding: Spacing.md,
  },
  drillBlock: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  drillBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  drillBlockLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  blockOrderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  blockOrderText: {
    fontSize: 14,
    fontWeight: "700",
  },
  drillBlockInfo: {
    flex: 1,
  },
  drillBlockName: {
    fontSize: 14,
    fontWeight: "600",
    color: TextColors.primary,
  },
  drillBlockMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 4,
  },
  blockTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  blockTypeText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  drillBlockDuration: {
    fontSize: 12,
    color: TextColors.muted,
  },
  pillarsRow: {
    flexDirection: "row",
    gap: 4,
  },
  pillarBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  drillBlockDetails: {
    padding: Spacing.md,
    paddingTop: 0,
    gap: Spacing.md,
  },
  instructionSection: {
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  instructionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  instructionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: TextColors.muted,
    textTransform: "uppercase",
  },
  instructionText: {
    fontSize: 13,
    color: TextColors.secondary,
    lineHeight: 18,
  },
  skillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  skillBadge: {
    backgroundColor: Backgrounds.surface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  skillText: {
    fontSize: 10,
    color: TextColors.muted,
  },
  useButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  useButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
});
