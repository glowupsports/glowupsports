import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Modal, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, CardStyles, Backgrounds, GlowColors } from "@/constants/theme";
import Svg, { Polygon, Circle, Text as SvgText, Line, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import BallLevelBadge from "@/components/BallLevelBadge";
import PillarProgressRings from "@/components/PillarProgressRings";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { getStageFromLevel, type BallStage } from "@shared/language-switch";

interface DomainInsights {
  recentHighlights: string[];
  focusAreas: string[];
  lastObservation: {
    direction: string;
    note: string | null;
    date: string | null;
  } | null;
  avgDelta: number;
}

interface SkillRadarItem {
  domain: string;
  domainId: string;
  color: string;
  icon: string;
  progress: number;
  trend: string;
  momentum: string;
  xp: number;
  observationCount: number;
  assessmentStatus: string;
  insights: DomainInsights;
}

interface LevelRequirement {
  domainId: string;
  domainName: string;
  required: string;
  current: string;
  met: boolean;
}

interface LevelReadiness {
  isReady: boolean;
  requirements: LevelRequirement[];
  sessionCount: number;
  minSessionsRequired: number;
  coachApprovalRequired: boolean;
  coachApprovalStatus: string;
}

interface ProgressData {
  level: number;
  xp: number;
  xpForNextLevel: number;
  glowScore: number;
  ballLevel: string | null;
  nextBallLevel: string;
  skillRadar: SkillRadarItem[];
  overallInsights: {
    strengths: string[];
    focusAreas: string[];
  };
  levelReadiness: LevelReadiness | null;
}

interface SkillDomain {
  id: string;
  name: string;
  value: number;
  maxValue: number;
  icon: string;
  color: string;
  trend?: string;
  insights?: DomainInsights;
}

function SkillRadar({ domains }: { domains: SkillDomain[] }) {
  const size = 280;
  const center = size / 2;
  const radius = 90;

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / domains.length - Math.PI / 2;
    const r = (value / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const points = domains.map((d, i) => getPoint(i, d.value));
  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <View style={styles.radarContainer}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={GlowColors.primary} stopOpacity="0.4" />
            <Stop offset="50%" stopColor="#00E5FF" stopOpacity="0.3" />
            <Stop offset="100%" stopColor="#E040FB" stopOpacity="0.2" />
          </SvgLinearGradient>
          <SvgLinearGradient id="radarStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={GlowColors.primary} stopOpacity="1" />
            <Stop offset="50%" stopColor="#00E5FF" stopOpacity="1" />
            <Stop offset="100%" stopColor="#E040FB" stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>
        
        {[1, 2, 3, 4, 5].map((level) => {
          const levelPoints = domains.map((_, i) => getPoint(i, level * 20));
          return (
            <Polygon
              key={level}
              points={levelPoints.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={level === 5 ? "rgba(200, 255, 61, 0.3)" : "rgba(255,255,255,0.08)"}
              strokeWidth={level === 5 ? 2 : 1}
              strokeDasharray={level === 5 ? undefined : "4,4"}
            />
          );
        })}
        
        {domains.map((domain, i) => {
          const endPoint = getPoint(i, 100);
          return (
            <Line
              key={i}
              x1={center}
              y1={center}
              x2={endPoint.x}
              y2={endPoint.y}
              stroke={domain.color + "40"}
              strokeWidth={1}
            />
          );
        })}

        <Polygon
          points={polygonPoints}
          fill="url(#radarGradient)"
          stroke="url(#radarStroke)"
          strokeWidth={3}
        />

        {points.map((point, i) => (
          <React.Fragment key={i}>
            <Circle
              cx={point.x}
              cy={point.y}
              r={8}
              fill={domains[i].color + "30"}
            />
            <Circle
              cx={point.x}
              cy={point.y}
              r={5}
              fill={domains[i].color}
              stroke="#0B0D10"
              strokeWidth={2}
            />
          </React.Fragment>
        ))}

        {domains.map((domain, i) => {
          const labelPoint = getPoint(i, 135);
          return (
            <React.Fragment key={i}>
              <Circle
                cx={labelPoint.x}
                cy={labelPoint.y}
                r={16}
                fill={domain.color + "20"}
              />
              <SvgText
                x={labelPoint.x}
                y={labelPoint.y + 1}
                fill={domain.color}
                fontSize={11}
                fontWeight="bold"
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {domain.name.slice(0, 3).toUpperCase()}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

function getBallLevelDisplay(level: string | null): string {
  if (!level) return "Unknown";
  const map: Record<string, string> = {
    red1: "Red 1", red2: "Red 2", red3: "Red 3",
    orange1: "Orange 1", orange2: "Orange 2", orange3: "Orange 3",
    green1: "Green 1", green2: "Green 2", green3: "Green 3",
    yellow1: "Yellow 1", yellow2: "Yellow 2", yellow3: "Yellow 3",
    glow: "Glow Master",
  };
  return map[level] || level;
}

function getBallLevelColor(level: string | null): string {
  if (!level) return Colors.dark.textMuted;
  const levelLower = level.toLowerCase();
  if (levelLower.startsWith("blue")) return "#3B82F6";
  if (levelLower.startsWith("red")) return "#EF4444";
  if (levelLower.startsWith("orange")) return "#F97316";
  if (levelLower.startsWith("green")) return "#22C55E";
  if (levelLower.startsWith("yellow")) return "#EAB308";
  if (levelLower.includes("adult") || levelLower === "glow") return "#00E5FF";
  return Colors.dark.textMuted;
}

function getStatusDisplay(status: string): string {
  const map: Record<string, string> = {
    not_yet: "Not Started",
    developing: "Developing",
    meets: "Meets Standard",
    above: "Above Standard",
  };
  return map[status] || status;
}

function LevelReadinessSection({ 
  readiness, 
  currentLevel, 
  nextLevel 
}: { 
  readiness: LevelReadiness; 
  currentLevel: string | null;
  nextLevel: string;
}) {
  const allMet = readiness.requirements.every(r => r.met);
  const sessionsReady = readiness.sessionCount >= readiness.minSessionsRequired;
  const isReady = allMet && sessionsReady;
  
  return (
    <View style={styles.readinessSection}>
      <Text style={styles.sectionTitle}>Next Level: {getBallLevelDisplay(nextLevel)}</Text>
      <View style={styles.readinessCard}>
        <View style={styles.readinessHeader}>
          <View style={[
            styles.readinessIcon,
            { backgroundColor: isReady ? "rgba(200, 255, 61, 0.2)" : "rgba(255, 149, 0, 0.2)" }
          ]}>
            <Ionicons 
              name={isReady ? "checkmark-circle" : "time"} 
              size={24} 
              color={isReady ? GlowColors.primary : Colors.dark.orange} 
            />
          </View>
          <View style={styles.readinessInfo}>
            <Text style={[
              styles.readinessStatus,
              { color: isReady ? GlowColors.primary : Colors.dark.orange }
            ]}>
              {isReady ? "Ready for Level Up!" : "Not Ready Yet"}
            </Text>
            <Text style={styles.readinessSubtext}>
              {isReady 
                ? "Ask your coach to approve your level up" 
                : "Keep training to unlock the next level"}
            </Text>
          </View>
        </View>
        
        <View style={styles.readinessProgress}>
          <View style={styles.progressItem}>
            <View style={styles.progressLabel}>
              <Ionicons 
                name={sessionsReady ? "checkmark-circle" : "ellipse-outline"} 
                size={16} 
                color={sessionsReady ? GlowColors.primary : Colors.dark.textMuted} 
              />
              <Text style={styles.progressText}>
                Sessions: {readiness.sessionCount} / {readiness.minSessionsRequired}
              </Text>
            </View>
            <View style={styles.miniProgressBar}>
              <View style={[
                styles.miniProgressFill,
                { 
                  width: `${Math.min(100, (readiness.sessionCount / readiness.minSessionsRequired) * 100)}%`,
                  backgroundColor: sessionsReady ? GlowColors.primary : Colors.dark.textMuted
                }
              ]} />
            </View>
          </View>
        </View>
        
        {readiness.requirements.length > 0 ? (
          <View style={styles.requirementsSection}>
            <Text style={styles.requirementsTitle}>Skill Requirements</Text>
            {readiness.requirements.map((req, index) => (
              <View key={index} style={styles.requirementRow}>
                <Ionicons 
                  name={req.met ? "checkmark-circle" : "ellipse-outline"} 
                  size={16} 
                  color={req.met ? GlowColors.primary : Colors.dark.textMuted} 
                />
                <Text style={styles.requirementDomain}>{req.domainName}</Text>
                <Text style={[
                  styles.requirementStatus,
                  { color: req.met ? GlowColors.primary : Colors.dark.textMuted }
                ]}>
                  {getStatusDisplay(req.current)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        
        <View style={styles.approvalNote}>
          <Ionicons name="shield-checkmark" size={20} color={isReady ? GlowColors.primary : Colors.dark.orange} />
          <Text style={[styles.approvalText, { color: isReady ? GlowColors.primary : Colors.dark.orange }]}>
            {isReady ? "Ready! Ask your coach for approval" : "Coach approval required for level up"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function LevelExplanationModal({ 
  visible, 
  onClose, 
  currentLevel 
}: { 
  visible: boolean; 
  onClose: () => void;
  currentLevel: number;
}) {
  const insets = useSafeAreaInsets();
  
  const getLevelTitle = (level: number) => {
    if (level >= 30) return "Legend";
    if (level >= 25) return "Champion";
    if (level >= 20) return "Elite Competitor";
    if (level >= 15) return "Rising Star";
    if (level >= 10) return "Rising Force";
    if (level >= 7) return "Contender";
    if (level >= 5) return "Challenger";
    if (level >= 3) return "Rising Player";
    if (level >= 2) return "New Challenger";
    return "Just Started";
  };

  const levelMilestones = [
    { level: 1, title: "Just Started", unlocks: "Basic profile, session tracking", xp: 0 },
    { level: 3, title: "Rising Player", unlocks: "Skill radar unlocked, basic badges", xp: 200 },
    { level: 5, title: "Challenger", unlocks: "Coach messaging, session booking", xp: 400 },
    { level: 7, title: "Contender", unlocks: "Court booking, match challenges", xp: 600 },
    { level: 10, title: "Rising Force", unlocks: "Public profile, leaderboard entry", xp: 900 },
    { level: 15, title: "Rising Star", unlocks: "Advanced analytics, training plans", xp: 1400 },
    { level: 20, title: "Elite Competitor", unlocks: "Priority booking, coach selection", xp: 1900 },
    { level: 25, title: "Champion", unlocks: "Premium features, special events", xp: 2400 },
    { level: 30, title: "Legend", unlocks: "All features, lifetime status", xp: 2900 },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={[modalStyles.content, { paddingBottom: insets.bottom + 20 }]}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Understanding Levels</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={modalStyles.body} showsVerticalScrollIndicator={false}>
            <View style={modalStyles.currentLevel}>
              <View style={modalStyles.currentLevelCircle}>
                <Text style={modalStyles.currentLevelNumber}>{currentLevel}</Text>
              </View>
              <View style={modalStyles.currentLevelInfo}>
                <Text style={modalStyles.currentLevelTitle}>{getLevelTitle(currentLevel)}</Text>
                <Text style={modalStyles.currentLevelDesc}>Your current rank</Text>
              </View>
            </View>

            <View style={modalStyles.howToLevel}>
              <Text style={modalStyles.sectionTitle}>How to Level Up</Text>
              <View style={modalStyles.howToItem}>
                <Ionicons name="calendar" size={18} color={GlowColors.primary} />
                <Text style={modalStyles.howToText}>Attend training sessions</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <Ionicons name="star" size={18} color={Colors.dark.xpCyan} />
                <Text style={modalStyles.howToText}>Earn XP from coach feedback</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <Ionicons name="trophy" size={18} color={Colors.dark.orange} />
                <Text style={modalStyles.howToText}>Complete skill assessments</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <Ionicons name="flame" size={18} color="#FF4444" />
                <Text style={modalStyles.howToText}>Maintain training streaks</Text>
              </View>
            </View>

            <View style={modalStyles.milestonesSection}>
              <Text style={modalStyles.sectionTitle}>Level Milestones</Text>
              {levelMilestones.map((milestone, index) => (
                <View 
                  key={milestone.level} 
                  style={[
                    modalStyles.milestone,
                    currentLevel >= milestone.level && modalStyles.milestoneUnlocked
                  ]}
                >
                  <View style={[
                    modalStyles.milestoneBadge,
                    currentLevel >= milestone.level && modalStyles.milestoneBadgeUnlocked
                  ]}>
                    <Text style={[
                      modalStyles.milestoneLevelNum,
                      currentLevel >= milestone.level && { color: Colors.dark.buttonText }
                    ]}>
                      {milestone.level}
                    </Text>
                  </View>
                  <View style={modalStyles.milestoneInfo}>
                    <Text style={modalStyles.milestoneTitle}>{milestone.title}</Text>
                    <Text style={modalStyles.milestoneUnlocks}>{milestone.unlocks}</Text>
                  </View>
                  {currentLevel >= milestone.level ? (
                    <Ionicons name="checkmark-circle" size={18} color={GlowColors.primary} />
                  ) : (
                    <Ionicons name="lock-closed" size={16} color={Colors.dark.textMuted} />
                  )}
                </View>
              ))}
            </View>

            <View style={modalStyles.xpInfo}>
              <Ionicons name="flash" size={18} color={Colors.dark.xpCyan} />
              <Text style={modalStyles.xpInfoText}>
                Earn 500 XP to reach the next level. XP is awarded by your coach after each training session based on effort and improvement.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function GlowScoreModal({ 
  visible, 
  onClose, 
  glowScore 
}: { 
  visible: boolean; 
  onClose: () => void;
  glowScore: number;
}) {
  const insets = useSafeAreaInsets();
  
  const glowRanks = [
    { name: "Bronze", min: 0, max: 99, color: "#CD7F32", icon: "shield" as const },
    { name: "Silver", min: 100, max: 249, color: "#C0C0C0", icon: "shield" as const },
    { name: "Gold", min: 250, max: 499, color: "#FFD700", icon: "shield" as const },
    { name: "Platinum", min: 500, max: 999, color: "#00E5FF", icon: "diamond" as const },
    { name: "Diamond", min: 1000, max: 1999, color: "#E040FB", icon: "diamond" as const },
    { name: "Master", min: 2000, max: 4999, color: "#FF4444", icon: "star" as const },
    { name: "Grandmaster", min: 5000, max: 9999, color: "#C8FF3D", icon: "star" as const },
    { name: "Legend", min: 10000, max: Infinity, color: "#FFD700", icon: "trophy" as const },
  ];
  
  const getCurrentRank = (score: number) => {
    return glowRanks.find(r => score >= r.min && score <= r.max) || glowRanks[0];
  };
  
  const currentRank = getCurrentRank(glowScore);
  const nextRank = glowRanks[glowRanks.indexOf(currentRank) + 1];
  const progressToNext = nextRank 
    ? ((glowScore - currentRank.min) / (nextRank.min - currentRank.min)) * 100
    : 100;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={[modalStyles.content, { paddingBottom: insets.bottom + 20 }]}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Understanding Glow Score</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={modalStyles.body} showsVerticalScrollIndicator={false}>
            <View style={modalStyles.currentLevel}>
              <View style={[modalStyles.currentLevelCircle, { borderColor: currentRank.color, backgroundColor: currentRank.color + "20" }]}>
                <Ionicons name={currentRank.icon} size={24} color={currentRank.color} />
              </View>
              <View style={modalStyles.currentLevelInfo}>
                <Text style={[modalStyles.currentLevelTitle, { color: currentRank.color }]}>{currentRank.name}</Text>
                <Text style={modalStyles.currentLevelDesc}>{glowScore} Glow Points</Text>
              </View>
            </View>

            {nextRank ? (
              <View style={[modalStyles.howToLevel, { marginBottom: Spacing.md }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.xs }}>
                  <Text style={modalStyles.descriptionText}>Progress to {nextRank.name}</Text>
                  <Text style={[modalStyles.descriptionText, { color: nextRank.color }]}>{nextRank.min - glowScore} to go</Text>
                </View>
                <View style={{ height: 8, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 4 }}>
                  <View style={{ 
                    height: "100%", 
                    width: `${Math.min(progressToNext, 100)}%`, 
                    backgroundColor: currentRank.color,
                    borderRadius: 4
                  }} />
                </View>
              </View>
            ) : null}

            <View style={modalStyles.howToLevel}>
              <Text style={modalStyles.sectionTitle}>What is Glow Score?</Text>
              <Text style={modalStyles.descriptionText}>
                Glow Score is unlimited, just like in video games! Keep improving to climb the ranks and unlock higher tiers. There is no ceiling - the more you train, the higher you go!
              </Text>
            </View>

            <View style={modalStyles.howToLevel}>
              <Text style={modalStyles.sectionTitle}>How to Earn Glow Points</Text>
              <View style={modalStyles.howToItem}>
                <Ionicons name="tennisball" size={18} color="#10B981" />
                <Text style={modalStyles.howToText}>Improve pillar skills (+5-20 pts)</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <Ionicons name="star" size={18} color={Colors.dark.gold} />
                <Text style={modalStyles.howToText}>Coach assessments (+10-50 pts)</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <Ionicons name="trophy" size={18} color="#3B82F6" />
                <Text style={modalStyles.howToText}>Win matches (+25-100 pts)</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <Ionicons name="ribbon" size={18} color="#E040FB" />
                <Text style={modalStyles.howToText}>Complete achievements (bonus pts)</Text>
              </View>
            </View>

            <View style={modalStyles.milestonesSection}>
              <Text style={modalStyles.sectionTitle}>Rank Progression</Text>
              {glowRanks.map((rank, index) => {
                const isCurrentRank = currentRank.name === rank.name;
                const isPassed = glowScore >= rank.min && glowRanks.indexOf(currentRank) > index;
                
                return (
                  <View 
                    key={rank.name} 
                    style={[
                      modalStyles.milestone, 
                      isCurrentRank && { borderLeftWidth: 3, borderLeftColor: rank.color, opacity: 1 },
                      isPassed && { opacity: 1 }
                    ]}
                  >
                    <View style={[modalStyles.milestoneBadge, { backgroundColor: rank.color + "20", borderColor: rank.color }]}>
                      <Ionicons name={rank.icon} size={18} color={rank.color} />
                    </View>
                    <View style={modalStyles.milestoneContent}>
                      <Text style={[modalStyles.milestoneTitle, { color: isCurrentRank ? rank.color : Colors.dark.text }]}>
                        {rank.name}
                      </Text>
                      <Text style={modalStyles.milestoneUnlocks}>
                        {rank.max === Infinity ? `${rank.min}+ points` : `${rank.min} - ${rank.max} points`}
                      </Text>
                    </View>
                    {isPassed ? (
                      <Ionicons name="checkmark-circle" size={20} color={GlowColors.primary} />
                    ) : isCurrentRank ? (
                      <Ionicons name="radio-button-on" size={20} color={rank.color} />
                    ) : null}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function XpExplanationModal({ 
  visible, 
  onClose, 
  totalXp 
}: { 
  visible: boolean; 
  onClose: () => void;
  totalXp: number;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={[modalStyles.content, { paddingBottom: insets.bottom + 20 }]}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Understanding XP</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={modalStyles.body} showsVerticalScrollIndicator={false}>
            <View style={modalStyles.currentLevel}>
              <View style={[modalStyles.currentLevelCircle, { borderColor: Colors.dark.xpCyan }]}>
                <Text style={[modalStyles.currentLevelNumber, { color: Colors.dark.xpCyan, fontSize: 24 }]}>{totalXp}</Text>
              </View>
              <View style={modalStyles.currentLevelInfo}>
                <Text style={[modalStyles.currentLevelTitle, { color: Colors.dark.xpCyan }]}>Total XP</Text>
                <Text style={modalStyles.currentLevelDesc}>Experience points earned</Text>
              </View>
            </View>

            <View style={modalStyles.howToLevel}>
              <Text style={modalStyles.sectionTitle}>What is XP?</Text>
              <Text style={modalStyles.descriptionText}>
                XP (Experience Points) tracks your journey and progress. Earn 500 XP to level up and unlock new features.
              </Text>
            </View>

            <View style={modalStyles.howToLevel}>
              <Text style={modalStyles.sectionTitle}>How to Earn XP</Text>
              <View style={modalStyles.howToItem}>
                <Ionicons name="calendar-outline" size={18} color={GlowColors.primary} />
                <Text style={modalStyles.howToText}>Attend sessions (+25-50 XP)</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <Ionicons name="star" size={18} color={Colors.dark.gold} />
                <Text style={modalStyles.howToText}>Receive coach praise (+10-30 XP)</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <Ionicons name="trending-up" size={18} color="#10B981" />
                <Text style={modalStyles.howToText}>Show improvement (+20-40 XP)</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <Ionicons name="flame" size={18} color="#FF4444" />
                <Text style={modalStyles.howToText}>Training streaks (bonus XP)</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <Ionicons name="ribbon" size={18} color={Colors.dark.xpCyan} />
                <Text style={modalStyles.howToText}>Complete achievements (+50-100 XP)</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function BallLevelModal({ 
  visible, 
  onClose, 
  currentLevel 
}: { 
  visible: boolean; 
  onClose: () => void;
  currentLevel: string | null;
}) {
  const insets = useSafeAreaInsets();
  
  const ballLevels = [
    { id: "blue", name: "Blue Ball", color: "#3B82F6", description: "Ages 4-6: Foam balls, mini court", ages: "4-6 years" },
    { id: "red", name: "Red Ball", color: "#EF4444", description: "Ages 6-8: 75% slower balls, small court", ages: "6-8 years" },
    { id: "orange", name: "Orange Ball", color: "#F97316", description: "Ages 8-10: 50% slower balls, 3/4 court", ages: "8-10 years" },
    { id: "green", name: "Green Ball", color: "#22C55E", description: "Ages 9-12: 25% slower balls, full court", ages: "9-12 years" },
    { id: "yellow", name: "Yellow Ball", color: "#EAB308", description: "Ages 11+: Regular balls, full court", ages: "11+ years" },
    { id: "glow", name: "Glow Master", color: "#00E5FF", description: "Advanced: Tournament-ready, all skills mastered", ages: "Any age" },
  ];
  
  const getCurrentLevelInfo = () => {
    if (!currentLevel) return null;
    const levelLower = currentLevel.toLowerCase();
    return ballLevels.find(l => levelLower.startsWith(l.id));
  };
  
  const currentLevelInfo = getCurrentLevelInfo();
  const currentLevelNumber = currentLevel?.match(/\d+/)?.[0] || "";

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={[modalStyles.content, { paddingBottom: insets.bottom + 20 }]}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Understanding Ball Levels</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={modalStyles.body} showsVerticalScrollIndicator={false}>
            {currentLevelInfo ? (
              <View style={modalStyles.currentLevel}>
                <View style={[modalStyles.currentLevelCircle, { borderColor: currentLevelInfo.color, backgroundColor: currentLevelInfo.color + "20" }]}>
                  <Ionicons name="tennisball" size={28} color={currentLevelInfo.color} />
                </View>
                <View style={modalStyles.currentLevelInfo}>
                  <Text style={[modalStyles.currentLevelTitle, { color: currentLevelInfo.color }]}>
                    {currentLevelInfo.name} {currentLevelNumber}
                  </Text>
                  <Text style={modalStyles.currentLevelDesc}>Your current ball level</Text>
                </View>
              </View>
            ) : null}

            <View style={modalStyles.howToLevel}>
              <Text style={modalStyles.sectionTitle}>What are Ball Levels?</Text>
              <Text style={modalStyles.descriptionText}>
                Ball levels follow the ITF Play and Stay pathway. Slower balls and smaller courts help players develop proper technique before progressing to the full game.
              </Text>
            </View>

            <View style={modalStyles.howToLevel}>
              <Text style={modalStyles.sectionTitle}>How to Level Up</Text>
              <View style={modalStyles.howToItem}>
                <Ionicons name="checkmark-circle" size={18} color={GlowColors.primary} />
                <Text style={modalStyles.howToText}>Master skills at your current level</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <Ionicons name="star" size={18} color={Colors.dark.gold} />
                <Text style={modalStyles.howToText}>Pass coach skill assessments</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <Ionicons name="trophy" size={18} color={Colors.dark.xpCyan} />
                <Text style={modalStyles.howToText}>Complete all 3 sub-levels (1, 2, 3)</Text>
              </View>
            </View>

            <View style={modalStyles.milestonesSection}>
              <Text style={modalStyles.sectionTitle}>Ball Level Progression</Text>
              {ballLevels.map((level, index) => {
                const isCurrentLevel = currentLevelInfo?.id === level.id;
                const isPassed = ballLevels.findIndex(l => l.id === currentLevelInfo?.id) > index;
                
                return (
                  <View 
                    key={level.id} 
                    style={[
                      modalStyles.milestone, 
                      isCurrentLevel && { borderLeftWidth: 3, borderLeftColor: level.color, opacity: 1 },
                      isPassed && { opacity: 1 }
                    ]}
                  >
                    <View style={[modalStyles.milestoneBadge, { backgroundColor: level.color + "20", borderColor: level.color }]}>
                      <Ionicons name="tennisball" size={18} color={level.color} />
                    </View>
                    <View style={modalStyles.milestoneContent}>
                      <Text style={[modalStyles.milestoneTitle, { color: isCurrentLevel ? level.color : Colors.dark.text }]}>
                        {level.name}
                      </Text>
                      <Text style={modalStyles.milestoneUnlocks}>{level.description}</Text>
                      <Text style={[modalStyles.milestoneUnlocks, { color: level.color }]}>{level.ages}</Text>
                    </View>
                    {isPassed ? (
                      <Ionicons name="checkmark-circle" size={20} color={GlowColors.primary} />
                    ) : isCurrentLevel ? (
                      <Ionicons name="radio-button-on" size={20} color={level.color} />
                    ) : null}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SkillBar({ domain, onPress }: { domain: SkillDomain; onPress: () => void }) {
  const progress = domain.value / domain.maxValue;
  
  const getTrendIcon = () => {
    if (domain.trend === "rising") return "trending-up";
    if (domain.trend === "falling") return "trending-down";
    return "remove";
  };
  
  const getTrendColor = () => {
    if (domain.trend === "rising") return GlowColors.primary;
    if (domain.trend === "falling") return Colors.dark.orange;
    return Colors.dark.textMuted;
  };
  
  return (
    <Pressable style={styles.skillCard} onPress={onPress}>
      <View style={styles.skillHeader}>
        <View style={[styles.skillIcon, { backgroundColor: `${domain.color}20` }]}>
          <Ionicons name={domain.icon as any} size={18} color={domain.color} />
        </View>
        <View style={styles.skillInfo}>
          <Text style={styles.skillName}>{domain.name}</Text>
          {domain.trend ? (
            <View style={styles.trendRow}>
              <Ionicons name={getTrendIcon() as any} size={12} color={getTrendColor()} />
              <Text style={[styles.skillUpdated, { color: getTrendColor() }]}>
                {domain.trend === "rising" ? "Improving" : domain.trend === "falling" ? "Needs focus" : "Stable"}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.skillValue, { color: domain.color }]}>
          {domain.value}%
        </Text>
      </View>
      <View style={styles.skillBarTrack}>
        <View 
          style={[
            styles.skillBarFill, 
            { width: `${progress * 100}%`, backgroundColor: domain.color }
          ]} 
        />
      </View>
      <View style={styles.tapHint}>
        <Text style={styles.tapHintText}>Tap for details</Text>
        <Ionicons name="chevron-forward" size={12} color={Colors.dark.textMuted} />
      </View>
    </Pressable>
  );
}

interface AttendanceClass {
  id: string;
  title: string;
  dayOfWeek: string;
  time: string;
  sessionType: string;
  status: string;
  joinedAt: string | null;
  leftAt: string | null;
  attendance: {
    present: number;
    vacation: number;
    absent: number;
    total: number;
    rate: number;
  };
}

interface AttendanceData {
  classes: AttendanceClass[];
  summary: {
    totalPresent: number;
    totalSessions: number;
    attendanceRate: number;
  };
}

function getSessionTypeIcon(type: string): string {
  const map: Record<string, string> = {
    private: "person",
    semi_private: "people",
    group: "people-circle",
  };
  return map[type] || "tennisball";
}

function getSessionTypeColor(type: string): string {
  const map: Record<string, string> = {
    private: Colors.dark.sessionPrivate,
    semi_private: Colors.dark.sessionSemiPrivate,
    group: Colors.dark.sessionGroup,
  };
  return map[type] || Colors.dark.textMuted;
}

export default function PlayerProgressScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [showGlowScoreModal, setShowGlowScoreModal] = useState(false);
  const [showXpModal, setShowXpModal] = useState(false);
  const [showBallLevelModal, setShowBallLevelModal] = useState(false);

  const handleDomainPress = (domainId: string) => {
    navigation.navigate("SkillDetail", { domain: domainId });
  };

  const { data, isLoading, error } = useQuery<ProgressData>({
    queryKey: ["/api/player/me/progress"],
  });

  const { data: attendanceData } = useQuery<AttendanceData>({
    queryKey: ["/api/player/me/attendance"],
  });

  interface CoachFeedbackItem {
    id: string;
    feedbackType: string;
    message: string;
    xpAwarded: number;
    createdAt: string;
    sessionId: string;
  }

  const { data: coachFeedback } = useQuery<CoachFeedbackItem[]>({
    queryKey: ["/api/player/me/feedback"],
  });

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        <Text style={styles.loadingText}>Loading your progress...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Unable to load progress</Text>
        <Text style={styles.errorSubtext}>Please try again later</Text>
      </View>
    );
  }

  const domains: SkillDomain[] = data.skillRadar.map(skill => ({
    id: skill.domainId,
    name: skill.domain,
    value: skill.progress,
    maxValue: 100,
    icon: skill.icon || "star",
    color: skill.color,
    trend: skill.trend,
    insights: skill.insights,
  }));

  const currentLevelXp = data.xp % 500;

  const totalObservations = data.skillRadar.reduce((sum, s) => sum + s.observationCount, 0);
  const isNewPlayer = totalObservations === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Premium Header with Gradient Border */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.title}>My Progress</Text>
            {isNewPlayer && (
              <View style={styles.newPlayerBadge}>
                <Ionicons name="sparkles" size={12} color="#C8FF3D" />
                <Text style={styles.newPlayerBadgeText}>NEW</Text>
              </View>
            )}
          </View>
          <Text style={styles.subtitle}>
            {isNewPlayer 
              ? "Start your tennis journey - your coach will track your progress"
              : "Coach-validated skill development"}
          </Text>
        </View>

        {/* Ball Level Badge - Always Shown with Neon Border */}
        <View style={styles.ballLevelSection}>
          <LinearGradient
            colors={["rgba(200, 255, 61, 0.3)", "rgba(0, 229, 255, 0.3)", "rgba(224, 64, 251, 0.3)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ballLevelGradientBorder}
          >
            <Pressable 
              style={styles.ballLevelInner}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowBallLevelModal(true);
              }}
            >
              <BallLevelBadge 
                levelId={data.ballLevel || "red1"} 
                size="large" 
                showLabel={true}
              />
              <View style={styles.levelLabelRow}>
                <Text style={styles.ballLevelHint}>{isNewPlayer ? "Your starting level" : "Tap to learn more"}</Text>
                <Ionicons name="information-circle-outline" size={12} color={Colors.dark.textMuted} />
              </View>
            </Pressable>
          </LinearGradient>
        </View>

        {/* Stats Row - Premium Gaming Cards */}
        <View style={styles.statsRow}>
          <Pressable 
            style={[styles.statCard, styles.statCardGlow]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowGlowScoreModal(true);
            }}
          >
            <View style={styles.glowCircle}>
              <Text style={styles.glowValue}>{data.glowScore}</Text>
            </View>
            <View style={styles.levelLabelRow}>
              <Text style={styles.statLabel}>GLOW SCORE</Text>
              <Ionicons name="information-circle-outline" size={12} color={Colors.dark.textMuted} />
            </View>
            {isNewPlayer && <Text style={styles.statHint}>Tap to learn</Text>}
          </Pressable>
          <Pressable 
            style={[styles.statCard, styles.statCardLevel]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowLevelModal(true);
            }}
          >
            <View style={styles.levelCircle}>
              <Text style={styles.levelValue}>{data.level}</Text>
            </View>
            <View style={styles.levelLabelRow}>
              <Text style={styles.statLabel}>LEVEL</Text>
              <Ionicons name="information-circle-outline" size={12} color={Colors.dark.textMuted} />
            </View>
            {isNewPlayer && <Text style={styles.statHint}>Tap to learn</Text>}
          </Pressable>
          <Pressable 
            style={[styles.statCard, styles.statCardXp]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowXpModal(true);
            }}
          >
            <View style={styles.xpCircle}>
              <Text style={styles.xpValue}>{data.xp}</Text>
            </View>
            <View style={styles.levelLabelRow}>
              <Text style={styles.statLabel}>TOTAL XP</Text>
              <Ionicons name="information-circle-outline" size={12} color={Colors.dark.textMuted} />
            </View>
            {isNewPlayer && <Text style={styles.statHint}>Tap to learn</Text>}
          </Pressable>
        </View>

        <View style={styles.xpSection}>
          <View style={styles.xpHeader}>
            <Text style={styles.xpLabel}>XP to Level {data.level + 1}</Text>
            <Text style={styles.xpAmount}>{currentLevelXp} / 500</Text>
          </View>
          <View style={styles.xpBarTrack}>
            <LinearGradient
              colors={[GlowColors.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.xpBarFill, { width: `${(currentLevelXp / 500) * 100}%` }]}
            />
          </View>
        </View>

        {/* New Player Getting Started Section */}
        {isNewPlayer && (
          <View style={styles.gettingStartedSection}>
            <LinearGradient
              colors={["rgba(200, 255, 61, 0.1)", "rgba(0, 229, 255, 0.05)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gettingStartedCard}
            >
              <View style={styles.gettingStartedHeader}>
                <View style={styles.gettingStartedIconWrap}>
                  <Ionicons name="rocket" size={24} color="#C8FF3D" />
                </View>
                <View style={styles.gettingStartedInfo}>
                  <Text style={styles.gettingStartedTitle}>START YOUR JOURNEY</Text>
                  <Text style={styles.gettingStartedSubtitle}>Here's how to level up</Text>
                </View>
              </View>
              <View style={styles.gettingStartedSteps}>
                <View style={styles.gettingStartedStep}>
                  <View style={[styles.stepNumber, { backgroundColor: "rgba(200, 255, 61, 0.2)" }]}>
                    <Text style={[styles.stepNumberText, { color: "#C8FF3D" }]}>1</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Attend Training Sessions</Text>
                    <Text style={styles.stepDesc}>Your coach will observe and track your skills</Text>
                  </View>
                </View>
                <View style={styles.gettingStartedStep}>
                  <View style={[styles.stepNumber, { backgroundColor: "rgba(0, 229, 255, 0.2)" }]}>
                    <Text style={[styles.stepNumberText, { color: "#00E5FF" }]}>2</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Earn XP & Badges</Text>
                    <Text style={styles.stepDesc}>Get rewarded for effort and improvement</Text>
                  </View>
                </View>
                <View style={styles.gettingStartedStep}>
                  <View style={[styles.stepNumber, { backgroundColor: "rgba(224, 64, 251, 0.2)" }]}>
                    <Text style={[styles.stepNumberText, { color: "#E040FB" }]}>3</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Level Up Your Skills</Text>
                    <Text style={styles.stepDesc}>Progress through the 6 skill pillars</Text>
                  </View>
                </View>
              </View>
              <Pressable 
                style={styles.gettingStartedCta}
                onPress={() => navigation.navigate("Schedule")}
              >
                <Text style={styles.gettingStartedCtaText}>Book Your First Session</Text>
                <Ionicons name="arrow-forward" size={16} color="#0B0D10" />
              </Pressable>
            </LinearGradient>
          </View>
        )}

        {data.levelReadiness && !isNewPlayer ? (
          <LevelReadinessSection 
            readiness={data.levelReadiness} 
            currentLevel={data.ballLevel}
            nextLevel={data.nextBallLevel}
          />
        ) : null}

        {/* Pillar Progress Rings - 6 Core Pillars - ALWAYS SHOWN */}
        <View style={styles.pillarRingsSection}>
          <View style={styles.pillarHeaderRow}>
            <Text style={styles.sectionTitle}>THE 6 PILLARS</Text>
            {isNewPlayer && (
              <View style={styles.pillarNewBadge}>
                <Ionicons name="information-circle" size={12} color="#00E5FF" />
                <Text style={styles.pillarNewBadgeText}>Your coach will rate these</Text>
              </View>
            )}
          </View>
          <PillarProgressRings 
            pillars={Object.fromEntries(
              domains.length > 0 
                ? domains.map(d => [
                    d.id.toUpperCase(), 
                    { 
                      pillar: d.id.toUpperCase(), 
                      currentScore: d.value, 
                      trend: d.trend === "rising" ? "up" : d.trend === "falling" ? "down" : "stable" 
                    }
                  ])
                : [
                    ["TECHNIQUE", { pillar: "TECHNIQUE", currentScore: 0, trend: "stable" }],
                    ["TACTICAL", { pillar: "TACTICAL", currentScore: 0, trend: "stable" }],
                    ["PHYSICAL", { pillar: "PHYSICAL", currentScore: 0, trend: "stable" }],
                    ["MENTAL", { pillar: "MENTAL", currentScore: 0, trend: "stable" }],
                    ["SOCIAL", { pillar: "SOCIAL", currentScore: 0, trend: "stable" }],
                    ["MATCH", { pillar: "MATCH", currentScore: 0, trend: "stable" }],
                  ]
            )}
            stage={getStageFromLevel(data.ballLevel || "red1")}
            role="player"
            onPillarPress={(pillar) => handleDomainPress(pillar.toLowerCase())}
          />
        </View>

        {/* Skill Radar - Always shown, with placeholder for new players */}
        <View style={styles.radarSection}>
          <View style={styles.radarHeader}>
            <Text style={styles.sectionTitle}>SKILL RADAR</Text>
            {isNewPlayer && (
              <Text style={styles.radarHint}>Will fill as you train</Text>
            )}
          </View>
          <View style={styles.radarWrapper}>
            <SkillRadar domains={domains.length > 0 ? domains : [
              { id: "technique", name: "Technique", value: 5, maxValue: 100, icon: "tennisball", color: "#10B981" },
              { id: "tactical", name: "Tactical", value: 5, maxValue: 100, icon: "bulb", color: "#F59E0B" },
              { id: "physical", name: "Physical", value: 5, maxValue: 100, icon: "fitness", color: "#EF4444" },
              { id: "mental", name: "Mental", value: 5, maxValue: 100, icon: "flash", color: "#8B5CF6" },
              { id: "social", name: "Social", value: 5, maxValue: 100, icon: "people", color: "#EC4899" },
              { id: "match", name: "Match", value: 5, maxValue: 100, icon: "trophy", color: "#3B82F6" },
            ]} />
          </View>
        </View>


        {data.overallInsights.strengths.length > 0 ? (
          <View style={styles.insightsSection}>
            <Text style={styles.sectionTitle}>Your Strengths</Text>
            <View style={styles.insightsList}>
              {data.overallInsights.strengths.map((strength, i) => (
                <View key={i} style={styles.insightItem}>
                  <Ionicons name="checkmark-circle" size={16} color={GlowColors.primary} />
                  <Text style={styles.insightText}>{strength}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {data.overallInsights.focusAreas.length > 0 ? (
          <View style={styles.insightsSection}>
            <Text style={styles.sectionTitle}>Focus Areas</Text>
            <View style={styles.insightsList}>
              {data.overallInsights.focusAreas.map((area, i) => (
                <View key={i} style={styles.insightItem}>
                  <Ionicons name="arrow-forward-circle" size={16} color={Colors.dark.xpCyan} />
                  <Text style={styles.insightText}>{area}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Coach Feedback Section */}
        {coachFeedback && coachFeedback.length > 0 ? (
          <View style={styles.feedbackSection}>
            <View style={styles.feedbackHeader}>
              <Text style={styles.sectionTitle}>Coach Feedback</Text>
              <View style={styles.feedbackBadge}>
                <Ionicons name="star" size={12} color={GlowColors.primary} />
                <Text style={styles.feedbackBadgeText}>{coachFeedback.length}</Text>
              </View>
            </View>
            <View style={styles.feedbackList}>
              {coachFeedback.slice(0, 5).map((feedback) => {
                const feedbackIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
                  praise: "star",
                  effort: "flame",
                  technique: "bulb",
                  improvement: "trending-up",
                };
                const feedbackColors: Record<string, string> = {
                  praise: GlowColors.primary,
                  effort: Colors.dark.orange,
                  technique: Colors.dark.xpCyan,
                  improvement: "#10B981",
                };
                return (
                  <View key={feedback.id} style={styles.feedbackCard}>
                    <View style={[styles.feedbackIconContainer, { backgroundColor: (feedbackColors[feedback.feedbackType] || GlowColors.primary) + "20" }]}>
                      <Ionicons 
                        name={feedbackIcons[feedback.feedbackType] || "chatbubble"} 
                        size={18} 
                        color={feedbackColors[feedback.feedbackType] || GlowColors.primary} 
                      />
                    </View>
                    <View style={styles.feedbackContent}>
                      <Text style={styles.feedbackMessage}>{feedback.message}</Text>
                      <View style={styles.feedbackMeta}>
                        <Text style={styles.feedbackDate}>
                          {new Date(feedback.createdAt).toLocaleDateString()}
                        </Text>
                        {feedback.xpAwarded > 0 && (
                          <View style={styles.feedbackXp}>
                            <Ionicons name="sparkles" size={10} color={GlowColors.primary} />
                            <Text style={styles.feedbackXpText}>+{feedback.xpAwarded} XP</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}


        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={Colors.dark.xpCyan} />
          <Text style={styles.infoText}>
            Progress is updated by your coach after each training session. 
            Keep training to unlock new levels!
          </Text>
        </View>
      </ScrollView>

      <LevelExplanationModal 
        visible={showLevelModal}
        onClose={() => setShowLevelModal(false)}
        currentLevel={data.level}
      />
      <GlowScoreModal 
        visible={showGlowScoreModal}
        onClose={() => setShowGlowScoreModal(false)}
        glowScore={data.glowScore}
      />
      <XpExplanationModal 
        visible={showXpModal}
        onClose={() => setShowXpModal(false)}
        totalXp={data.xp}
      />
      <BallLevelModal 
        visible={showBallLevelModal}
        onClose={() => setShowBallLevelModal(false)}
        currentLevel={data.ballLevel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  errorSubtext: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  newPlayerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.3)",
  },
  newPlayerBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#C8FF3D",
    letterSpacing: 1,
  },
  subtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  ballLevelSection: {
    alignItems: "center",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  ballLevelGradientBorder: {
    borderRadius: BorderRadius.lg,
    padding: 2,
    width: "100%",
  },
  ballLevelInner: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg - 2,
    paddingVertical: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  ballLevelHint: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    ...CardStyles.base,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  statCardGlow: {
    borderColor: "rgba(0, 229, 255, 0.2)",
  },
  statCardLevel: {
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  statCardXp: {
    borderColor: "rgba(200, 255, 61, 0.2)",
  },
  statHint: {
    fontSize: 9,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  glowCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0, 229, 255, 0.15)",
    borderWidth: 2,
    borderColor: "#00E5FF",
    justifyContent: "center",
    alignItems: "center",
  },
  glowValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#00E5FF",
  },
  levelCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderWidth: 2,
    borderColor: Colors.dark.gold,
    justifyContent: "center",
    alignItems: "center",
  },
  xpCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
    borderWidth: 2,
    borderColor: "#C8FF3D",
    justifyContent: "center",
    alignItems: "center",
  },
  xpValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#C8FF3D",
  },
  levelValue: {
    ...Typography.numberMedium,
    color: Colors.dark.gold,
  },
  sessionsCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
    borderWidth: 2,
    borderColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sessionsValue: {
    ...Typography.numberMedium,
    color: GlowColors.primary,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  xpSection: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  xpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  xpLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  xpAmount: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  xpBarTrack: {
    height: 10,
    backgroundColor: Backgrounds.card,
    borderRadius: 5,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 5,
  },
  pillarRingsSection: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  pillarHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  pillarNewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 229, 255, 0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  pillarNewBadgeText: {
    fontSize: 9,
    color: "#00E5FF",
  },
  radarSection: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  radarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  radarHint: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  radarWrapper: {
    position: "relative",
  },
  radarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(11, 13, 16, 0.5)",
    borderRadius: BorderRadius.lg,
  },
  radarOverlayContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(200, 255, 61, 0.1)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.3)",
  },
  radarOverlayText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#C8FF3D",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.lg,
  },
  radarContainer: {
    alignItems: "center",
    ...CardStyles.base,
    padding: Spacing.lg,
    marginHorizontal: Spacing.xl,
  },
  gettingStartedSection: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  gettingStartedCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.2)",
  },
  gettingStartedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  gettingStartedIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  gettingStartedInfo: {
    flex: 1,
  },
  gettingStartedTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#C8FF3D",
    letterSpacing: 1,
  },
  gettingStartedSubtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  gettingStartedSteps: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  gettingStartedStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: "800",
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 16,
  },
  gettingStartedCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "#C8FF3D",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  gettingStartedCtaText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0B0D10",
  },
  skillsSection: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  skillsList: {
    gap: Spacing.md,
  },
  skillCard: {
    ...CardStyles.base,
    padding: Spacing.lg,
  },
  skillHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  skillIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  skillInfo: {
    flex: 1,
  },
  skillName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  skillUpdated: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  skillValue: {
    ...Typography.numberMedium,
  },
  skillBarTrack: {
    height: 6,
    backgroundColor: Backgrounds.card,
    borderRadius: 3,
    overflow: "hidden",
  },
  skillBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  infoCard: {
    flexDirection: "row",
    marginHorizontal: Spacing.xl,
    ...CardStyles.base,
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
  insightsSection: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  insightsList: {
    ...CardStyles.base,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  insightItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  insightText: {
    ...Typography.body,
  },
  feedbackSection: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  feedbackHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  feedbackBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    borderRadius: BorderRadius.sm,
  },
  feedbackBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  feedbackList: {
    gap: Spacing.sm,
  },
  feedbackCard: {
    ...CardStyles.base,
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  feedbackIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackContent: {
    flex: 1,
  },
  feedbackMessage: {
    ...Typography.body,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  feedbackMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  feedbackDate: {
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
  },
  feedbackXp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: GlowColors.primary + "20",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  feedbackXpText: {
    fontSize: 10,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  feedbackEmpty: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  readinessSection: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  readinessCard: {
    ...CardStyles.base,
    padding: Spacing.lg,
  },
  readinessHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  readinessIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  readinessInfo: {
    flex: 1,
  },
  readinessStatus: {
    ...Typography.h3,
    fontWeight: "600",
  },
  readinessSubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  readinessProgress: {
    marginBottom: Spacing.lg,
  },
  progressItem: {
    gap: Spacing.xs,
  },
  progressLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  progressText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  miniProgressBar: {
    height: 6,
    backgroundColor: Backgrounds.card,
    borderRadius: 3,
    overflow: "hidden",
    marginLeft: 24,
  },
  miniProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  requirementsSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  requirementsTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  requirementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  requirementDomain: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  requirementStatus: {
    ...Typography.small,
  },
  approvalNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  approvalText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
  tapHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: Spacing.sm,
    gap: 4,
  },
  tapHintText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  levelLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  attendanceSection: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  attendanceSummary: {
    flexDirection: "row",
    ...CardStyles.base,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    alignItems: "center",
    justifyContent: "space-around",
  },
  attendanceSummaryItem: {
    alignItems: "center",
    flex: 1,
  },
  attendanceSummaryValue: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  attendanceSummaryLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  attendanceSummaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  attendanceCard: {
    ...CardStyles.base,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  attendanceCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  attendanceTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  attendanceCardInfo: {
    flex: 1,
  },
  attendanceCardTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  attendanceCardTime: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  formerBadge: {
    backgroundColor: Colors.dark.textMuted + "30",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  formerBadgeText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  attendanceStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  attendanceStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  attendanceStatText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  attendanceRateBar: {
    height: 6,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 3,
    marginBottom: Spacing.xs,
  },
  attendanceRateFill: {
    height: "100%",
    backgroundColor: GlowColors.primary,
    borderRadius: 3,
  },
  attendanceRateText: {
    ...Typography.caption,
    color: GlowColors.primary,
    textAlign: "right",
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  content: {
    backgroundColor: Backgrounds.root,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.lg,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  body: {
    paddingHorizontal: Spacing.xl,
  },
  currentLevel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
    ...CardStyles.base,
    padding: Spacing.lg,
  },
  currentLevelCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(200, 255, 61, 0.2)",
    borderWidth: 3,
    borderColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  currentLevelNumber: {
    ...Typography.h1,
    color: GlowColors.primary,
    fontSize: 28,
  },
  currentLevelInfo: {
    flex: 1,
  },
  currentLevelTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  currentLevelDesc: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  howToLevel: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  howToItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  howToText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  descriptionText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    lineHeight: 22,
  },
  milestonesSection: {
    marginBottom: Spacing.xl,
  },
  milestone: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...CardStyles.base,
    opacity: 0.6,
  },
  milestoneUnlocked: {
    opacity: 1,
    borderLeftWidth: 3,
    borderLeftColor: GlowColors.primary,
  },
  milestoneBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  milestoneBadgeUnlocked: {
    backgroundColor: GlowColors.primary,
  },
  milestoneLevelNum: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  milestoneInfo: {
    flex: 1,
  },
  milestoneTitle: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  milestoneUnlocks: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  xpInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  xpInfoText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    flex: 1,
  },
});
