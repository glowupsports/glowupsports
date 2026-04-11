import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";

interface LevelSkill {
  skillId: string;
  skillName: string;
  pillar: string;
  targetScore: number;
  weight: number;
  rubric: {
    score: number;
    observable: string;
  }[];
}

interface LevelTest {
  id: string;
  name: string;
  description: string;
  type: string;
  metrics: Record<string, unknown>;
}

interface TechnicalSpecs {
  courtLengthM?: number;
  courtWidthM?: number;
  netHeightCm?: number;
  racketSizeLabel?: string;
  racketSizeInchMin?: number;
  racketSizeInchMax?: number;
  ageBand?: string;
  itfStageName?: string;
  ballDescription?: string;
  note?: string;
}

interface BallLevel {
  id: string;
  stage: string;
  rank: number;
  displayNamePlayer: string;
  displayNameCoach: string;
  identity: string;
  courtType: string;
  ballType: string;
  technicalSpecs?: TechnicalSpecs | null;
  promotionRequirements: {
    skillAchievedCount: number;
    pillarMinimum: Record<string, number>;
    tests: string[];
    evidenceMin: number;
    matchEvents: number;
    matchWins?: number;
  };
  skills: LevelSkill[];
  tests: LevelTest[];
}

const STAGES = ["RED", "ORANGE", "GREEN", "YELLOW", "BLUE"] as const;
const PILLARS = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"] as const;

const STAGE_COLORS: Record<string, string> = {
  RED: Colors.dark.ballRed,
  ORANGE: Colors.dark.ballOrange,
  GREEN: Colors.dark.ballGreen,
  YELLOW: Colors.dark.ballYellow,
  BLUE: Colors.dark.xpCyan,
};

const PILLAR_COLORS: Record<string, string> = {
  TECHNIQUE: Colors.dark.xpCyan,
  TACTICAL: Colors.dark.primary,
  PHYSICAL: Colors.dark.orange,
  MENTAL: Colors.dark.gold,
  SOCIAL: Colors.dark.ballGlow,
  MATCH: Colors.dark.ballRed,
};

const PILLAR_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  TECHNIQUE: "hand-left-outline",
  TACTICAL: "bulb-outline",
  PHYSICAL: "fitness-outline",
  MENTAL: "brain-outline",
  SOCIAL: "people-outline",
  MATCH: "trophy-outline",
};

export default function LevelCardsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  
  const [selectedStage, setSelectedStage] = useState<typeof STAGES[number]>("RED");
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);

  const { data: levels = [] } = useQuery<BallLevel[]>({
    queryKey: ["/api/glow-leveling/levels", selectedStage],
  });

  const stageLevels = levels.filter(l => l.stage === selectedStage).sort((a, b) => b.rank - a.rank);

  const handleStageSelect = (stage: typeof STAGES[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedStage(stage);
    setExpandedLevel(null);
    setExpandedPillar(null);
  };

  const handleLevelExpand = (levelId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedLevel(expandedLevel === levelId ? null : levelId);
    setExpandedPillar(null);
  };

  const handlePillarExpand = (pillar: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedPillar(expandedPillar === pillar ? null : pillar);
  };

  const getSkillsByPillar = (skills: LevelSkill[], pillar: string) => {
    return skills.filter(s => s.pillar === pillar);
  };

  const getScoreLabel = (score: number) => {
    switch (score) {
      case 0: return "Not Yet";
      case 1: return "Emerging";
      case 2: return "Achieved";
      default: return "";
    }
  };

  const getScoreColor = (score: number) => {
    switch (score) {
      case 0: return Colors.dark.error;
      case 1: return Colors.dark.orange;
      case 2: return Colors.dark.successNeon;
      default: return Colors.dark.text;
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <ThemedText style={styles.title}>Level Cards</ThemedText>
      <ThemedText style={styles.subtitle}>
        Complete skill definitions and requirements for each level
      </ThemedText>

      <View style={styles.stageSelector}>
        {STAGES.map((stage) => (
          <Pressable
            key={stage}
            style={[
              styles.stageButton,
              selectedStage === stage && { 
                backgroundColor: STAGE_COLORS[stage] + "30",
                borderColor: STAGE_COLORS[stage],
              },
            ]}
            onPress={() => handleStageSelect(stage)}
          >
            <Ionicons 
              name="tennisball" 
              size={16} 
              color={selectedStage === stage ? STAGE_COLORS[stage] : Colors.dark.text} 
            />
            <ThemedText style={[
              styles.stageButtonText,
              selectedStage === stage && { color: STAGE_COLORS[stage] },
            ]}>
              {stage}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {stageLevels.map((level) => {
        const isExpanded = expandedLevel === level.id;
        const stageColor = STAGE_COLORS[level.stage];

        return (
          <Card key={level.id} style={styles.levelCard}>
            <Pressable style={styles.levelHeader} onPress={() => handleLevelExpand(level.id)}>
              <View style={[styles.levelBadge, { backgroundColor: stageColor + "20", borderColor: stageColor }]}>
                <ThemedText style={[styles.levelBadgeText, { color: stageColor }]}>
                  {level.rank}
                </ThemedText>
              </View>

              <View style={styles.levelInfo}>
                <ThemedText style={styles.levelName}>{level.displayNameCoach}</ThemedText>
                <ThemedText style={styles.levelIdentity}>{level.identity}</ThemedText>
              </View>

              <Ionicons 
                name={isExpanded ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={Colors.dark.text} 
              />
            </Pressable>

            {isExpanded ? (
              <View style={styles.levelContent}>
                <View style={styles.courtInfo}>
                  <View style={styles.infoItem}>
                    <Ionicons name="tennisball-outline" size={14} color={stageColor} />
                    <ThemedText style={styles.infoText}>{level.ballType.replace(/_/g, " ")}</ThemedText>
                  </View>
                  <View style={styles.infoItem}>
                    <Ionicons name="resize-outline" size={14} color={stageColor} />
                    <ThemedText style={styles.infoText}>{level.courtType.replace(/_/g, " ")}</ThemedText>
                  </View>
                </View>

                {level.technicalSpecs ? (
                  <View style={styles.courtSetupCard}>
                    <View style={styles.courtSetupHeader}>
                      <Ionicons name="grid-outline" size={14} color="#C8FF3D" />
                      <ThemedText style={styles.courtSetupTitle}>Court Setup</ThemedText>
                      {level.technicalSpecs.itfStageName ? (
                        <View style={styles.itfBadge}>
                          <ThemedText style={styles.itfBadgeText}>{level.technicalSpecs.itfStageName}</ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.courtSetupGrid}>
                      {level.technicalSpecs.courtLengthM ? (
                        <View style={styles.courtSpecItem}>
                          <ThemedText style={styles.courtSpecLabel}>Court Length</ThemedText>
                          <ThemedText style={styles.courtSpecValue}>{level.technicalSpecs.courtLengthM} m</ThemedText>
                        </View>
                      ) : null}
                      {level.technicalSpecs.courtWidthM ? (
                        <View style={styles.courtSpecItem}>
                          <ThemedText style={styles.courtSpecLabel}>Court Width</ThemedText>
                          <ThemedText style={styles.courtSpecValue}>{level.technicalSpecs.courtWidthM} m</ThemedText>
                        </View>
                      ) : null}
                      {level.technicalSpecs.netHeightCm ? (
                        <View style={styles.courtSpecItem}>
                          <ThemedText style={styles.courtSpecLabel}>Net Height</ThemedText>
                          <ThemedText style={styles.courtSpecValue}>{level.technicalSpecs.netHeightCm} cm</ThemedText>
                        </View>
                      ) : null}
                      {level.technicalSpecs.racketSizeLabel ? (
                        <View style={styles.courtSpecItem}>
                          <ThemedText style={styles.courtSpecLabel}>Racket Size</ThemedText>
                          <ThemedText style={styles.courtSpecValue}>{level.technicalSpecs.racketSizeLabel}</ThemedText>
                        </View>
                      ) : null}
                    </View>
                    {level.technicalSpecs.ageBand ? (
                      <View style={styles.courtSpecRow}>
                        <Ionicons name="person-outline" size={12} color={Colors.dark.text + "99"} />
                        <ThemedText style={styles.courtSpecMeta}>Age band: {level.technicalSpecs.ageBand}</ThemedText>
                      </View>
                    ) : null}
                    {level.technicalSpecs.ballDescription ? (
                      <View style={styles.courtSpecRow}>
                        <Ionicons name="tennisball-outline" size={12} color={Colors.dark.text + "99"} />
                        <ThemedText style={styles.courtSpecMeta}>{level.technicalSpecs.ballDescription}</ThemedText>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.courtSetupCard}>
                    <View style={styles.courtSetupHeader}>
                      <Ionicons name="grid-outline" size={14} color="#C8FF3D" />
                      <ThemedText style={styles.courtSetupTitle}>Court Setup</ThemedText>
                    </View>
                    <ThemedText style={styles.courtSpecMeta}>
                      Full court (23.77 m x 8.23 m) - standard yellow ball
                    </ThemedText>
                  </View>
                )}

                <View style={styles.requirementsSection}>
                  <ThemedText style={styles.sectionTitle}>Promotion Requirements</ThemedText>
                  <View style={styles.requirementsList}>
                    <View style={styles.requirementItem}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.dark.successNeon} />
                      <ThemedText style={styles.requirementText}>
                        {level.promotionRequirements.skillAchievedCount} skills achieved
                      </ThemedText>
                    </View>
                    <View style={styles.requirementItem}>
                      <Ionicons name="document-text" size={16} color={Colors.dark.xpCyan} />
                      <ThemedText style={styles.requirementText}>
                        {level.promotionRequirements.evidenceMin} evidence videos
                      </ThemedText>
                    </View>
                    <View style={styles.requirementItem}>
                      <Ionicons name="trophy" size={16} color={Colors.dark.gold} />
                      <ThemedText style={styles.requirementText}>
                        {level.promotionRequirements.matchEvents} match events
                        {level.promotionRequirements.matchWins ? ` (${level.promotionRequirements.matchWins} wins)` : ""}
                      </ThemedText>
                    </View>
                  </View>
                </View>

                <View style={styles.pillarsSection}>
                  <ThemedText style={styles.sectionTitle}>Skills by Pillar</ThemedText>
                  
                  {PILLARS.map((pillar) => {
                    const pillarSkills = getSkillsByPillar(level.skills, pillar);
                    if (pillarSkills.length === 0) return null;
                    
                    const isPillarExpanded = expandedPillar === pillar;
                    const pillarColor = PILLAR_COLORS[pillar];
                    const minRequired = level.promotionRequirements.pillarMinimum?.[pillar] || 0;

                    return (
                      <View key={pillar} style={styles.pillarSection}>
                        <Pressable 
                          style={styles.pillarHeader}
                          onPress={() => handlePillarExpand(pillar)}
                        >
                          <View style={styles.pillarTitle}>
                            <View style={[styles.pillarIcon, { backgroundColor: pillarColor + "20" }]}>
                              <Ionicons name={PILLAR_ICONS[pillar]} size={14} color={pillarColor} />
                            </View>
                            <ThemedText style={styles.pillarName}>{pillar}</ThemedText>
                            <View style={styles.pillarBadge}>
                              <ThemedText style={styles.pillarCount}>{pillarSkills.length}</ThemedText>
                            </View>
                          </View>
                          
                          {minRequired > 0 ? (
                            <ThemedText style={[styles.minRequired, { color: pillarColor }]}>
                              Min: {minRequired}
                            </ThemedText>
                          ) : null}
                          
                          <Ionicons 
                            name={isPillarExpanded ? "chevron-up" : "chevron-down"} 
                            size={16} 
                            color={Colors.dark.text} 
                          />
                        </Pressable>

                        {isPillarExpanded ? (
                          <View style={styles.skillsList}>
                            {pillarSkills.map((skill) => (
                              <View key={skill.skillId} style={styles.skillItem}>
                                <View style={styles.skillHeader}>
                                  <ThemedText style={styles.skillName}>{skill.skillName}</ThemedText>
                                  <View style={[
                                    styles.targetBadge, 
                                    { backgroundColor: getScoreColor(skill.targetScore) + "20" }
                                  ]}>
                                    <ThemedText style={[
                                      styles.targetText, 
                                      { color: getScoreColor(skill.targetScore) }
                                    ]}>
                                      Target: {skill.targetScore}
                                    </ThemedText>
                                  </View>
                                </View>

                                <View style={styles.rubricList}>
                                  {skill.rubric.map((r) => (
                                    <View key={r.score} style={styles.rubricItem}>
                                      <View style={[
                                        styles.scoreIndicator, 
                                        { backgroundColor: getScoreColor(r.score) }
                                      ]}>
                                        <ThemedText style={styles.scoreText}>{r.score}</ThemedText>
                                      </View>
                                      <View style={styles.rubricContent}>
                                        <ThemedText style={[
                                          styles.scoreLabel, 
                                          { color: getScoreColor(r.score) }
                                        ]}>
                                          {getScoreLabel(r.score)}
                                        </ThemedText>
                                        <ThemedText style={styles.observableText}>
                                          {r.observable}
                                        </ThemedText>
                                      </View>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>

                {level.tests.length > 0 ? (
                  <View style={styles.testsSection}>
                    <ThemedText style={styles.sectionTitle}>Trial Tests</ThemedText>
                    {level.tests.map((test) => (
                      <View key={test.id} style={styles.testItem}>
                        <View style={styles.testHeader}>
                          <Ionicons name="clipboard-outline" size={16} color={Colors.dark.xpCyan} />
                          <ThemedText style={styles.testName}>{test.name}</ThemedText>
                        </View>
                        <ThemedText style={styles.testDescription}>{test.description}</ThemedText>
                        <View style={styles.testType}>
                          <ThemedText style={styles.testTypeText}>{test.type.replace(/_/g, " ")}</ThemedText>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
    marginBottom: Spacing.xl,
  },
  stageSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  stageButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 2,
    borderColor: "transparent",
  },
  stageButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  levelCard: {
    marginBottom: Spacing.md,
    padding: 0,
    overflow: "hidden",
  },
  levelHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  levelBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  levelBadgeText: {
    fontSize: 18,
    fontWeight: "700",
  },
  levelInfo: {
    flex: 1,
  },
  levelName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  levelIdentity: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  levelContent: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
    padding: Spacing.lg,
  },
  courtInfo: {
    flexDirection: "row",
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  infoText: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.8,
    textTransform: "capitalize",
  },
  courtSetupCard: {
    backgroundColor: "#C8FF3D0D",
    borderWidth: 1,
    borderColor: "#C8FF3D25",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  courtSetupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  courtSetupTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#C8FF3D",
    flex: 1,
  },
  itfBadge: {
    backgroundColor: "#C8FF3D20",
    borderRadius: 10,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  itfBadgeText: {
    fontSize: 10,
    color: "#C8FF3D",
    fontWeight: "500",
  },
  courtSetupGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  courtSpecItem: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    minWidth: "44%",
    flex: 1,
  },
  courtSpecLabel: {
    fontSize: 10,
    color: Colors.dark.text,
    opacity: 0.5,
    marginBottom: 2,
  },
  courtSpecValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  courtSpecRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  courtSpecMeta: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.6,
    flex: 1,
  },
  requirementsSection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  requirementsList: {
    gap: Spacing.sm,
  },
  requirementItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  requirementText: {
    fontSize: 13,
    color: Colors.dark.text,
  },
  pillarsSection: {
    gap: Spacing.sm,
  },
  pillarSection: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  pillarHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
  },
  pillarTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pillarIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pillarName: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
    textTransform: "capitalize",
  },
  pillarBadge: {
    backgroundColor: Colors.dark.backgroundTertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  pillarCount: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.8,
  },
  minRequired: {
    fontSize: 11,
    fontWeight: "600",
    marginRight: Spacing.sm,
  },
  skillsList: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  skillItem: {
    backgroundColor: Colors.dark.backgroundDefault,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  skillHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  skillName: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  targetBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  targetText: {
    fontSize: 10,
    fontWeight: "600",
  },
  rubricList: {
    gap: Spacing.xs,
  },
  rubricItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  scoreIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  rubricContent: {
    flex: 1,
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  observableText: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.8,
    lineHeight: 16,
  },
  testsSection: {
    marginTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
    paddingTop: Spacing.lg,
  },
  testItem: {
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  testHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  testName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  testDescription: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.8,
    lineHeight: 16,
    marginBottom: Spacing.sm,
  },
  testType: {
    alignSelf: "flex-start",
    backgroundColor: Colors.dark.backgroundTertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  testTypeText: {
    fontSize: 10,
    color: Colors.dark.text,
    opacity: 0.6,
    textTransform: "uppercase",
  },
});
