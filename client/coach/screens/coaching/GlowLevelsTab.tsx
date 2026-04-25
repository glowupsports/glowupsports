import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { glowLevelsStyles } from "./glowLevelsStyles";
import type { TabProps, BallLevel, LevelSkill } from "./types";
import { useCoachingScroll } from "./CoachingScrollContext";

const STAGES = ["RED", "ORANGE", "GREEN", "YELLOW"] as const;
const PILLARS = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"] as const;

const STAGE_COLORS: Record<string, string> = {
  RED: Colors.dark.ballRed,
  ORANGE: Colors.dark.ballOrange,
  GREEN: Colors.dark.ballGreen,
  YELLOW: Colors.dark.ballYellow,
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
  MENTAL: "sparkles-outline",
  SOCIAL: "people-outline",
  MATCH: "trophy-outline",
};

export function GlowLevelsTab({ insets, tabBarHeight }: TabProps) {
  const onScroll = useCoachingScroll();
  const [selectedStage, setSelectedStage] = useState<typeof STAGES[number]>("RED");
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);

  const { data: levels = [], isLoading } = useQuery<BallLevel[]>({
    queryKey: ["/api/glow-leveling/levels"],
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

  if (isLoading) {
    return (
      <View style={glowLevelsStyles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={glowLevelsStyles.loadingText}>Loading levels...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={glowLevelsStyles.container}
      contentContainerStyle={{ 
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingTop: Spacing.md,
      }}
      showsVerticalScrollIndicator={false}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={glowLevelsStyles.header}>
        <Text style={glowLevelsStyles.title}>Glow Level Cards</Text>
        <Text style={glowLevelsStyles.subtitle}>
          Skill requirements and rubrics for each level
        </Text>
      </View>

      <View style={glowLevelsStyles.stageSelector}>
        {STAGES.map((stage) => (
          <Pressable
            key={stage}
            style={[
              glowLevelsStyles.stageButton,
              selectedStage === stage && { 
                backgroundColor: STAGE_COLORS[stage] + "30",
                borderColor: STAGE_COLORS[stage],
              },
            ]}
            onPress={() => handleStageSelect(stage)}
          >
            <Ionicons 
              name="tennisball" 
              size={14} 
              color={selectedStage === stage ? STAGE_COLORS[stage] : Colors.dark.text} 
            />
            <Text style={[
              glowLevelsStyles.stageButtonText,
              selectedStage === stage && { color: STAGE_COLORS[stage] },
            ]}>
              {stage}
            </Text>
          </Pressable>
        ))}
      </View>

      {stageLevels.map((level) => {
        const isExpanded = expandedLevel === level.id;
        const stageColor = STAGE_COLORS[level.stage];

        return (
          <View key={level.id} style={glowLevelsStyles.levelCard}>
            <Pressable style={glowLevelsStyles.levelHeader} onPress={() => handleLevelExpand(level.id)}>
              <View style={[glowLevelsStyles.levelBadge, { backgroundColor: stageColor + "20", borderColor: stageColor }]}>
                <Text style={[glowLevelsStyles.levelBadgeText, { color: stageColor }]}>
                  {level.rank}
                </Text>
              </View>

              <View style={glowLevelsStyles.levelInfo}>
                <Text style={glowLevelsStyles.levelName}>{level.displayNameCoach}</Text>
                <Text style={glowLevelsStyles.levelIdentity}>{level.identity}</Text>
              </View>

              <Ionicons 
                name={isExpanded ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={Colors.dark.text} 
              />
            </Pressable>

            {isExpanded ? (
              <View style={glowLevelsStyles.levelContent}>
                <View style={glowLevelsStyles.courtInfo}>
                  <View style={glowLevelsStyles.infoItem}>
                    <Ionicons name="tennisball-outline" size={14} color={stageColor} />
                    <Text style={glowLevelsStyles.infoText}>{level.ballType.replace(/_/g, " ")}</Text>
                  </View>
                  <View style={glowLevelsStyles.infoItem}>
                    <Ionicons name="resize-outline" size={14} color={stageColor} />
                    <Text style={glowLevelsStyles.infoText}>{level.courtType.replace(/_/g, " ")}</Text>
                  </View>
                </View>

                <View style={glowLevelsStyles.requirementsSection}>
                  <Text style={glowLevelsStyles.sectionTitle}>Promotion Requirements</Text>
                  <View style={glowLevelsStyles.requirementsList}>
                    <View style={glowLevelsStyles.requirementItem}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.dark.successNeon} />
                      <Text style={glowLevelsStyles.requirementText}>
                        {level.promotionRequirements.skillAchievedCount} skills achieved
                      </Text>
                    </View>
                    <View style={glowLevelsStyles.requirementItem}>
                      <Ionicons name="document-text" size={16} color={Colors.dark.xpCyan} />
                      <Text style={glowLevelsStyles.requirementText}>
                        {level.promotionRequirements.evidenceMin} evidence videos
                      </Text>
                    </View>
                    <View style={glowLevelsStyles.requirementItem}>
                      <Ionicons name="trophy" size={16} color={Colors.dark.gold} />
                      <Text style={glowLevelsStyles.requirementText}>
                        {level.promotionRequirements.matchEvents} match events
                        {level.promotionRequirements.matchWins ? ` (${level.promotionRequirements.matchWins} wins)` : ""}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={glowLevelsStyles.pillarsSection}>
                  <Text style={glowLevelsStyles.sectionTitle}>Skills by Pillar</Text>
                  
                  {PILLARS.map((pillar) => {
                    const pillarSkills = level.skillsByPillar?.[pillar] || [];
                    if (pillarSkills.length === 0) return null;
                    
                    const isPillarExpanded = expandedPillar === pillar;
                    const pillarColor = PILLAR_COLORS[pillar];
                    const minRequired = level.promotionRequirements.pillarMinimum?.[pillar] || 0;

                    return (
                      <View key={pillar} style={glowLevelsStyles.pillarSection}>
                        <Pressable 
                          style={glowLevelsStyles.pillarHeader}
                          onPress={() => handlePillarExpand(pillar)}
                        >
                          <View style={glowLevelsStyles.pillarTitle}>
                            <View style={[glowLevelsStyles.pillarIcon, { backgroundColor: pillarColor + "20" }]}>
                              <Ionicons name={PILLAR_ICONS[pillar]} size={14} color={pillarColor} />
                            </View>
                            <Text style={glowLevelsStyles.pillarName}>{pillar}</Text>
                            <View style={glowLevelsStyles.pillarBadge}>
                              <Text style={glowLevelsStyles.pillarCount}>{pillarSkills.length}</Text>
                            </View>
                          </View>
                          
                          {minRequired > 0 ? (
                            <Text style={[glowLevelsStyles.minRequired, { color: pillarColor }]}>
                              Min: {minRequired}
                            </Text>
                          ) : null}
                          
                          <Ionicons 
                            name={isPillarExpanded ? "chevron-up" : "chevron-down"} 
                            size={16} 
                            color={Colors.dark.text} 
                          />
                        </Pressable>

                        {isPillarExpanded ? (
                          <View style={glowLevelsStyles.skillsList}>
                            {pillarSkills.map((skill) => (
                              <View key={skill.id} style={glowLevelsStyles.skillItem}>
                                <View style={glowLevelsStyles.skillHeader}>
                                  <Text style={glowLevelsStyles.skillName}>{skill.name}</Text>
                                  <View style={[
                                    glowLevelsStyles.targetBadge, 
                                    { backgroundColor: getScoreColor(skill.targetScore) + "20" }
                                  ]}>
                                    <Text style={[
                                      glowLevelsStyles.targetText, 
                                      { color: getScoreColor(skill.targetScore) }
                                    ]}>
                                      Target: {skill.targetScore}
                                    </Text>
                                  </View>
                                </View>

                                {skill.rubric && skill.rubric.length > 0 ? (
                                  <View style={glowLevelsStyles.rubricList}>
                                    {skill.rubric.map((r) => (
                                      <View key={r.score} style={glowLevelsStyles.rubricItem}>
                                        <View style={[
                                          glowLevelsStyles.scoreIndicator, 
                                          { backgroundColor: getScoreColor(r.score) }
                                        ]}>
                                          <Text style={glowLevelsStyles.scoreText}>{r.score}</Text>
                                        </View>
                                        <View style={glowLevelsStyles.rubricContent}>
                                          <Text style={[
                                            glowLevelsStyles.scoreLabel, 
                                            { color: getScoreColor(r.score) }
                                          ]}>
                                            {getScoreLabel(r.score)}
                                          </Text>
                                          <Text style={glowLevelsStyles.observableText}>
                                            {r.observable}
                                          </Text>
                                        </View>
                                      </View>
                                    ))}
                                  </View>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
