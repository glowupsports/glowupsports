import logger from "@/lib/logger";
import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Modal, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, CardStyles, GlowColors, TextColors, FunctionColors } from "@/constants/theme";
import Svg, { Polygon, Circle, Text as SvgText, Line, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import BallLevelBadge from "@/components/BallLevelBadge";
import PillarProgressRings from "@/components/PillarProgressRings";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { getStageFromLevel, type BallStage } from "@shared/language-switch";
import { useWalkthrough } from "@/player/context/WalkthroughContext";
import { useSport, SPORT_DEFINITIONS, getSportColor, getSportLabel, getSportIcon } from "@/player/context/SportContext";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import { CoachReviewModal } from "@/player/components/CoachReviewModal";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";

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
  sport?: string;
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

interface CoachFeedbackItem {
  id: string;
  feedbackType: string;
  message: string;
  xpAwarded: number;
  createdAt: string;
  sessionId: string;
}

interface StrokeEntry {
  stroke: string;
  rating: number;
  note?: string;
}

interface StrokeFeedbackRow {
  id: string;
  sessionId: string;
  strokeFeedback: StrokeEntry[] | null;
  lessonIntensity: string | null;
  playerNote: string | null;
  overall: number | null;
  effort: number | null;
  createdAt: string;
}

interface SessionFeedbackItem {
  id: string;
  sessionId: string;
  sessionDate: string;
  sessionType: string;
  coachName: string;
  coachId: string;
  feedbackType: string;
  message: string;
  xpAwarded: number;
  visibility: string;
  pillarId: string | null;
  createdAt: string;
}

interface VideoFeedbackItem {
  id: string;
  coachId: string;
  playerId: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  annotations: { timestamp: number; text: string }[];
  createdAt: string;
}

interface PlayerProfileData {
  player: {
    id: string;
    name: string;
    coachId: string | null;
  } | null;
  coach: {
    id: string;
    name: string;
  } | null;
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
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#10B98130", justifyContent: "center", alignItems: "center" }}>
                  <Text style={{ color: "#10B981", fontWeight: "bold", fontSize: 12 }}>1</Text>
                </View>
                <Text style={modalStyles.howToText}>Improve your 6 Pillars (+10-30 pts)</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#3B82F630", justifyContent: "center", alignItems: "center" }}>
                  <Text style={{ color: "#3B82F6", fontWeight: "bold", fontSize: 12 }}>2</Text>
                </View>
                <Text style={modalStyles.howToText}>Win matches (+25-100 pts)</Text>
              </View>
              <View style={modalStyles.howToItem}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#E040FB30", justifyContent: "center", alignItems: "center" }}>
                  <Text style={{ color: "#E040FB", fontWeight: "bold", fontSize: 12 }}>3</Text>
                </View>
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

function AdultGlowLevelModal({ 
  visible, 
  onClose, 
  currentLevel 
}: { 
  visible: boolean; 
  onClose: () => void;
  currentLevel: string | null;
}) {
  const insets = useSafeAreaInsets();
  
  const glowLevels = [
    { 
      rank: 9, name: "Absolute Beginner", color: "#6B7280",
      summary: "Just starting tennis. Learning to make contact with the ball.",
      skills: ["Basic grip knowledge", "Can hit ball over net", "Understanding of court layout"]
    },
    { 
      rank: 8, name: "Beginner", color: "#8B5CF6",
      summary: "Building fundamental strokes. Starting to rally.",
      skills: ["Consistent forehand contact", "Basic backhand", "Underhand serve"]
    },
    { 
      rank: 7, name: "Lower Intermediate", color: "#3B82F6",
      summary: "Can sustain rallies. Learning tactical basics.",
      skills: ["Rally 10+ balls", "Overhead serve attempts", "Basic positioning"]
    },
    { 
      rank: 6, name: "Intermediate", color: "#22C55E",
      summary: "Solid fundamentals. Developing game patterns.",
      skills: ["Directional control", "Consistent serve", "Net approach basics"]
    },
    { 
      rank: 5, name: "Upper Intermediate", color: "#10B981",
      summary: "Strong all-court game. Ready for competitive play.",
      skills: ["Spin control", "Tactical patterns", "Match composure"]
    },
    { 
      rank: 4, name: "Lower Advanced", color: "#F59E0B",
      summary: "Competing in club tournaments. Refined technique.",
      skills: ["Weapon shot developed", "Serve & volley", "Point construction"]
    },
    { 
      rank: 3, name: "Advanced", color: "#F97316",
      summary: "Winning club events. Tournament-ready player.",
      skills: ["All strokes mastered", "Mental toughness", "Match strategy"]
    },
    { 
      rank: 2, name: "Elite Amateur", color: "#EF4444",
      summary: "Top club player. Regional competition level.",
      skills: ["High-level consistency", "Pressure performance", "Complete game"]
    },
    { 
      rank: 1, name: "Elite / Semi-Pro", color: "#FFD700",
      summary: "Professional-level skills. National/international competition.",
      skills: ["World-class technique", "Elite fitness", "Championship mentality"]
    },
  ];
  
  const getCurrentRank = () => {
    if (!currentLevel) return null;
    const match = currentLevel.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  };
  
  const currentRank = getCurrentRank();
  const currentLevelInfo = glowLevels.find(l => l.rank === currentRank);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={[modalStyles.content, { paddingBottom: insets.bottom + 20, maxHeight: "85%" }]}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Adult Glow Ranking</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={modalStyles.body} showsVerticalScrollIndicator={false}>
            {currentLevelInfo ? (
              <View style={modalStyles.currentLevel}>
                <View style={[modalStyles.currentLevelCircle, { borderColor: currentLevelInfo.color, backgroundColor: currentLevelInfo.color + "20" }]}>
                  <Text style={[modalStyles.currentLevelNumber, { color: currentLevelInfo.color, fontSize: 28 }]}>{currentRank}</Text>
                </View>
                <View style={modalStyles.currentLevelInfo}>
                  <Text style={[modalStyles.currentLevelTitle, { color: currentLevelInfo.color }]}>{currentLevelInfo.name}</Text>
                  <Text style={modalStyles.currentLevelDesc}>Your current Glow rank</Text>
                </View>
              </View>
            ) : null}

            <View style={modalStyles.howToLevel}>
              <Text style={modalStyles.sectionTitle}>How It Works</Text>
              <Text style={modalStyles.descriptionText}>
                Glow ranks go from 9 (beginner) to 1 (elite). Your coach tracks your progress across all 6 pillars. As you improve, you'll climb the ranks!
              </Text>
            </View>

            <View style={modalStyles.milestonesSection}>
              <Text style={modalStyles.sectionTitle}>Level Progression (9 → 1)</Text>
              {glowLevels.map((level) => {
                const isCurrentLevel = currentRank === level.rank;
                const isPassed = currentRank !== null && currentRank < level.rank;
                
                return (
                  <Pressable 
                    key={level.rank} 
                    style={[
                      modalStyles.milestone, 
                      isCurrentLevel && { borderLeftWidth: 3, borderLeftColor: level.color },
                      { paddingVertical: Spacing.sm }
                    ]}
                  >
                    <View style={[modalStyles.milestoneBadge, { backgroundColor: level.color + "20", borderColor: level.color }]}>
                      <Text style={{ color: level.color, fontWeight: "bold", fontSize: 14 }}>{level.rank}</Text>
                    </View>
                    <View style={[modalStyles.milestoneContent, { flex: 1 }]}>
                      <Text style={[modalStyles.milestoneTitle, { color: isCurrentLevel ? level.color : Colors.dark.text }]}>
                        {level.name}
                      </Text>
                      <Text style={modalStyles.milestoneUnlocks} numberOfLines={2}>
                        {level.summary}
                      </Text>
                    </View>
                    {isPassed ? (
                      <Ionicons name="checkmark-circle" size={20} color={GlowColors.primary} />
                    ) : isCurrentLevel ? (
                      <Ionicons name="radio-button-on" size={20} color={level.color} />
                    ) : null}
                  </Pressable>
                );
              })}
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

interface SkillCategory {
  name: string;
  skills: {
    id: string;
    name: string;
    description: string;
    score: number;
    maxScore: number;
    observable?: string;
  }[];
}


function SkillProgressBar({ score, maxScore, color }: { score: number; maxScore: number; color: string }) {
  const progress = maxScore > 0 ? (score / maxScore) * 100 : 0;
  
  return (
    <View style={skillBarStyles.container}>
      <View style={skillBarStyles.track}>
        <View 
          style={[
            skillBarStyles.fill, 
            { 
              width: `${progress}%`, 
              backgroundColor: color,
              shadowColor: color,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 4,
            }
          ]} 
        />
      </View>
      <View style={skillBarStyles.scoreContainer}>
        <Text style={[skillBarStyles.score, { color }]}>{score}</Text>
        <Text style={skillBarStyles.maxScore}>/{maxScore}</Text>
      </View>
    </View>
  );
}

const skillBarStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  track: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
  },
  scoreContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    minWidth: 35,
    justifyContent: "flex-end",
  },
  score: {
    fontSize: 14,
    fontWeight: "700",
  },
  maxScore: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
});

const BALL_LEVEL_DISPLAY: Record<string, string> = {
  blue: "BLUE 3",
  red: "RED 3",
  orange: "ORANGE 3",
  green: "GREEN 3",
  yellow: "YELLOW 3",
  glow: "GLOW",
};

interface SkillScoreItem {
  skillId: string;
  name: string;
  pillar: string;
  description: string | null;
  targetScore: number;
  isRequired: boolean | null;
  playerScore: number;
  levelId: string;
}

function PillarDetailModal({ 
  visible, 
  onClose, 
  domain,
  playerId,
  currentLevel,
}: { 
  visible: boolean; 
  onClose: () => void;
  domain: SkillDomain | null;
  playerId?: string;
  currentLevel?: string | null;
}) {
  const insets = useSafeAreaInsets();
  
  const pillarKey = domain?.id ?? "";

  const skillQueryKey = pillarKey
    ? `/api/player/me/skill-scores?pillar=${encodeURIComponent(pillarKey)}`
    : "/api/player/me/skill-scores";

  const { data: skillData, isLoading: skillsLoading } = useQuery<SkillScoreItem[]>({
    queryKey: [skillQueryKey],
    enabled: visible && !!pillarKey,
  });
  
  if (!domain) return null;
  
  const levelLabel = currentLevel
    ? (BALL_LEVEL_DISPLAY[currentLevel.toLowerCase()] ?? currentLevel.toUpperCase().replace("_", " "))
    : null;
  
  const getScoreColor = (score: number, maxScore: number) => {
    const percent = maxScore > 0 ? (score / maxScore) * 100 : 0;
    if (percent >= 80) return "#10B981";
    if (percent >= 50) return "#F59E0B";
    if (percent > 0) return "#3B82F6";
    return Colors.dark.textMuted;
  };
  
  const getScoreLabel = (score: number, maxScore: number) => {
    const percent = maxScore > 0 ? (score / maxScore) * 100 : 0;
    if (percent >= 80) return "Excellent";
    if (percent >= 50) return "Developing";
    if (percent > 0) return "Beginner";
    return "Not Assessed";
  };

  const avgScore = skillData && skillData.length > 0
    ? skillData.reduce((sum, s) => sum + s.playerScore, 0) / skillData.length
    : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={[modalStyles.content, { paddingBottom: insets.bottom + 20, maxHeight: "90%" }]}>
          <View style={modalStyles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: domain.color + "25", borderWidth: 2, borderColor: domain.color + "40", justifyContent: "center", alignItems: "center" }}>
                <Ionicons name={domain.icon as any} size={20} color={domain.color} />
              </View>
              <View>
                <Text style={[modalStyles.title, { color: domain.color }]}>{domain.name}</Text>
                {levelLabel ? (
                  <Text style={{ fontSize: 12, color: Colors.dark.xpCyan, marginTop: 2 }}>
                    Your Level: {levelLabel}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={modalStyles.body} showsVerticalScrollIndicator={false}>
            <View style={[modalStyles.currentLevel, { marginBottom: Spacing.lg }]}>
              <View style={[modalStyles.currentLevelCircle, { borderColor: domain.color, backgroundColor: domain.color + "20" }]}>
                <Text style={[modalStyles.currentLevelNumber, { color: domain.color, fontSize: 28 }]}>{domain.value}</Text>
              </View>
              <View style={modalStyles.currentLevelInfo}>
                <Text style={[modalStyles.currentLevelTitle, { color: domain.color }]}>
                  {domain.value >= 80 ? "Excellent" : domain.value >= 60 ? "Good" : domain.value >= 40 ? "Developing" : "Beginner"}
                </Text>
                <Text style={modalStyles.currentLevelDesc}>Current proficiency level</Text>
              </View>
            </View>

            <View style={{ marginBottom: Spacing.lg }}>
              <Text style={modalStyles.sectionTitle}>SKILL BREAKDOWN</Text>
              
              {skillsLoading ? (
                <View style={{ paddingVertical: Spacing.xl, alignItems: "center" }}>
                  <ActivityIndicator size="small" color={domain.color} />
                </View>
              ) : skillData && skillData.length > 0 ? (
                <View style={skillCategoryStyles.container}>
                  <View style={skillCategoryStyles.header}>
                    <View style={skillCategoryStyles.headerLeft}>
                      <View style={[skillCategoryStyles.iconCircle, { backgroundColor: domain.color + "20" }]}>
                        <Ionicons name={domain.icon as any} size={16} color={domain.color} />
                      </View>
                      <Text style={skillCategoryStyles.categoryName}>{domain.name} Skills</Text>
                    </View>
                    <View style={skillCategoryStyles.headerRight}>
                      <View style={[skillCategoryStyles.avgBadge, { backgroundColor: getScoreColor(avgScore, 2) + "20" }]}>
                        <Text style={[skillCategoryStyles.avgText, { color: getScoreColor(avgScore, 2) }]}>
                          {getScoreLabel(avgScore, 2)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={skillCategoryStyles.skillsList}>
                    {skillData.map((skill) => {
                      const scoreColor = getScoreColor(skill.playerScore, skill.targetScore);
                      return (
                        <View key={skill.skillId} style={skillCategoryStyles.skillRow}>
                          <View style={skillCategoryStyles.skillInfo}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs }}>
                              <Text style={skillCategoryStyles.skillName}>{skill.name}</Text>
                              {skill.isRequired ? (
                                <View style={{ backgroundColor: domain.color + "20", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                  <Text style={{ fontSize: 9, color: domain.color, fontWeight: "700" }}>REQ</Text>
                                </View>
                              ) : null}
                            </View>
                            {skill.description ? (
                              <Text style={skillCategoryStyles.skillDesc} numberOfLines={1}>{skill.description}</Text>
                            ) : null}
                          </View>
                          <SkillProgressBar score={skill.playerScore} maxScore={skill.targetScore} color={scoreColor} />
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <View style={{ paddingVertical: Spacing.xl, alignItems: "center", gap: Spacing.sm }}>
                  <Ionicons name="bar-chart-outline" size={36} color={Colors.dark.textMuted} />
                  <Text style={{ color: Colors.dark.textMuted, fontSize: 14, textAlign: "center" }}>
                    No skills assigned to your level yet
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const skillCategoryStyles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  categoryName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  avgBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  avgText: {
    fontSize: 11,
    fontWeight: "600",
  },
  skillsList: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  skillRow: {
    gap: Spacing.xs,
  },
  skillInfo: {
    marginBottom: 4,
  },
  skillName: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  skillDesc: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
});

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

const SESSION_TYPE_LABELS: Record<string, string> = {
  private: "Private",
  semi_private: "Semi-Private",
  group: "Group",
  camp: "Camp",
};

function getSessionTypeLabel(sessionType: string): string {
  const key = sessionType?.toLowerCase()?.replace("-", "_") || "private";
  return SESSION_TYPE_LABELS[key] || sessionType;
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function PlayerProgressScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const track = useTrackFeature();
  const { hasSeenScreen, startWalkthrough } = useWalkthrough();
  const { activeSports, activeSport, setActiveSport, isMultiSport } = useSport();
  const { logout, isGuest } = useAuth();
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [showGlowScoreModal, setShowGlowScoreModal] = useState(false);
  const [showXpModal, setShowXpModal] = useState(false);
  const [showBallLevelModal, setShowBallLevelModal] = useState(false);
  const [showAdultGlowModal, setShowAdultGlowModal] = useState(false);
  const [showPillarModal, setShowPillarModal] = useState(false);
  const [selectedPillar, setSelectedPillar] = useState<SkillDomain | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const makeSportUrl = (path: string) => {
    const url = new URL(path, getApiUrl());
    url.searchParams.set("sport", activeSport);
    return url.toString();
  };

  const { data, isLoading, error } = useQuery<ProgressData>({
    queryKey: ["/api/player/me/progress", activeSport],
    enabled: !isGuest,
    queryFn: async () => {
      const r = await fetch(makeSportUrl("/api/player/me/progress"), { headers: getAuthHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const { data: attendanceData } = useQuery<AttendanceData>({
    queryKey: ["/api/player/me/attendance", activeSport],
    enabled: !isGuest,
    queryFn: async () => {
      const r = await fetch(makeSportUrl("/api/player/me/attendance"), { headers: getAuthHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const { data: coachFeedback } = useQuery<CoachFeedbackItem[]>({
    queryKey: ["/api/player/me/feedback", activeSport],
    enabled: !isGuest,
    queryFn: async () => {
      const r = await fetch(makeSportUrl("/api/player/me/feedback"), { headers: getAuthHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const { data: strokeFeedbackData } = useQuery<StrokeFeedbackRow[]>({
    queryKey: ["/api/player/me/stroke-feedback", activeSport],
    enabled: !isGuest,
    queryFn: async () => {
      const r = await fetch(makeSportUrl("/api/player/me/stroke-feedback"), { headers: getAuthHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  interface PillarProgressEntry {
    name: string;
    score: number;
    trend: string;
    skillsTotal: number;
    skillsMeetsOrAbove: number;
    masteryPct: number;
    lastUpdated: string | null;
  }
  interface PillarProgressSummary {
    pillars: PillarProgressEntry[];
    overallReadiness: number;
    trialGateReady: boolean;
    recentFeedbackCount: number;
    glowScore: number;
  }
  const { data: pillarProgressData } = useQuery<PillarProgressSummary>({
    queryKey: ["/api/player/me/pillar-progress"],
    enabled: !isGuest,
    queryFn: async () => {
      const url = new URL("/api/player/me/pillar-progress", getApiUrl());
      const r = await fetch(url.toString(), { headers: getAuthHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const { data: sessionFeedbacks } = useQuery<SessionFeedbackItem[]>({
    queryKey: ["/api/player/me/session-feedback"],
    enabled: !isGuest,
  });

  interface GlowRatingItem {
    id: string;
    sessionId: string;
    effort: number;
    execution: number;
    understanding: number;
    overall: string;
    note: string | null;
    createdAt: string;
    sessionDate: string | null;
    coachName: string | null;
  }
  const { data: glowRatings = [] } = useQuery<GlowRatingItem[]>({
    queryKey: ["/api/player/me/glow-ratings"],
    enabled: !isGuest,
  });

  const { data: videoFeedbacks } = useQuery<VideoFeedbackItem[]>({
    queryKey: ["/api/player/me/video-feedback"],
    enabled: !isGuest,
  });

  const { data: playerProfile } = useQuery<PlayerProfileData>({
    queryKey: ["/api/player/me/profile"],
    enabled: !isGuest,
  });

  const recentNotes = useMemo(() => {
    if (!sessionFeedbacks || sessionFeedbacks.length === 0) return [];
    return [...sessionFeedbacks]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  }, [sessionFeedbacks]);

  const videoCount = videoFeedbacks?.length ?? 0;
  const assignedCoach = playerProfile?.coach ?? null;

  useEffect(() => {
    if (!hasSeenScreen("Progress")) {
      const timer = setTimeout(() => {
        startWalkthrough("Progress");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasSeenScreen, startWalkthrough]);

  
  const isAdultPlayer = (level: string | null) => {
    if (!level) return false;
    return level.toLowerCase().startsWith("glow");
  };
  
  const handleBallLevelPress = () => {
    if (data && isAdultPlayer(data.ballLevel)) {
      setShowAdultGlowModal(true);
    } else {
      setShowBallLevelModal(true);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDomainPress = (pillarKey: string) => {
    const pillarMapping: Record<string, { id: string; name: string; icon: string; color: string }> = {
      "TECHNIQUE": { id: "technical", name: "Technical", icon: "tennisball", color: "#10B981" },
      "TACTICAL": { id: "tactical", name: "Tactical", icon: "bulb", color: "#F59E0B" },
      "PHYSICAL": { id: "physical", name: "Physical", icon: "fitness", color: "#EF4444" },
      "MENTAL": { id: "mental", name: "Mental", icon: "flash", color: "#8B5CF6" },
      "SOCIAL": { id: "social", name: "Social", icon: "people", color: "#EC4899" },
      "MATCH": { id: "competition", name: "Competition", icon: "trophy", color: "#3B82F6" },
    };
    
    const mapping = pillarMapping[pillarKey.toUpperCase()];
    if (mapping) {
      const pillarData = domains.find(d => d.id === mapping.id) || {
        id: mapping.id,
        name: mapping.name,
        value: 0,
        maxValue: 100,
        icon: mapping.icon,
        color: mapping.color,
      };
      track("progress:pillar_tap");
      setSelectedPillar(pillarData);
      setShowPillarModal(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  if (isGuest) {
    type GuestIconName = React.ComponentProps<typeof Ionicons>["name"];
    const guestFeatures: Array<{ icon: GuestIconName; text: string }> = [
      { icon: "radio-button-on-outline", text: "See your Skill Radar across all domains" },
      { icon: "flash-outline", text: "Track your XP level & Glow Rank" },
      { icon: "tennisball-outline", text: "View your ball level progression" },
      { icon: "chatbubble-ellipses-outline", text: "Read coach feedback & session notes" },
    ];
    return (
      <View style={[styles.container, styles.centered, styles.guestContainer]}>
        <View style={styles.guestAvatarRing}>
          <Ionicons name="stats-chart" size={52} color={Colors.dark.primary} />
        </View>
        <Text style={styles.guestBrand}>Glow Up Sports</Text>
        <Text style={styles.guestTitle}>Browsing as Guest</Text>
        <Text style={styles.guestSubtitle}>Sign in to unlock your full stats</Text>
        <View style={styles.guestFeatureList}>
          {guestFeatures.map((f) => (
            <View key={f.text} style={styles.guestFeatureRow}>
              <Ionicons name={f.icon} size={18} color={Colors.dark.primary} />
              <Text style={styles.guestFeatureText}>{f.text}</Text>
            </View>
          ))}
        </View>
        <Pressable
          style={({ pressed }) => [styles.guestCta, { opacity: pressed ? 0.85 : 1 }]}
          onPress={logout}
        >
          <LinearGradient
            colors={[Colors.dark.primary, "#9AE66E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.guestCtaGradient}
          >
            <Ionicons name="person-add-outline" size={20} color="#000" />
            <Text style={styles.guestCtaText}>Create Account / Sign In</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        <Text style={styles.loadingText}>Loading your progress...</Text>
      </View>
    );
  }

  if (error || !data || !Array.isArray(data.skillRadar)) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Unable to load progress</Text>
        <Text style={styles.errorSubtext}>Please try again later</Text>
      </View>
    );
  }

  const domains: SkillDomain[] = (data.skillRadar ?? []).map(skill => ({
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

  const totalObservations = (data.skillRadar ?? []).reduce((sum, s) => sum + s.observationCount, 0);
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
              ? "Start your journey - your coach will track your progress"
              : "Coach-validated skill development"}
          </Text>
        </View>

        {/* Sport Tab Switcher */}
        {isMultiSport ? (
          <View style={styles.sportTabsRow}>
            {SPORT_DEFINITIONS.filter(s => activeSports.includes(s.key)).map(sport => {
              const isActive = activeSport === sport.key;
              return (
                <Pressable
                  key={sport.key}
                  style={[styles.sportTab, isActive && { borderBottomColor: sport.color, borderBottomWidth: 2 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActiveSport(sport.key);
                  }}
                >
                  <Ionicons
                    name={sport.icon as keyof typeof Ionicons.glyphMap}
                    size={15}
                    color={isActive ? sport.color : Colors.dark.textMuted}
                  />
                  <Text style={[styles.sportTabText, isActive && { color: sport.color }]}>
                    {sport.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Sport context label - shows which sport's stats are displayed */}
        {isMultiSport ? (
          <View style={styles.sportContextRow}>
            <Ionicons
              name={getSportIcon(activeSport) as keyof typeof Ionicons.glyphMap}
              size={13}
              color={getSportColor(activeSport)}
            />
            <Text style={[styles.sportContextLabel, { color: getSportColor(activeSport) }]}>
              {getSportLabel(activeSport)} Stats
            </Text>
          </View>
        ) : null}

        {/* Progression Level Badge - Sport-Aware */}
        <View style={styles.ballLevelSection}>
          <LinearGradient
            colors={["rgba(200, 255, 61, 0.3)", "rgba(0, 229, 255, 0.3)", "rgba(224, 64, 251, 0.3)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ballLevelGradientBorder}
          >
            <Pressable 
              style={styles.ballLevelInner}
              onPress={handleBallLevelPress}
            >
              <BallLevelBadge 
                levelId={data.ballLevel || "red1"} 
                size="large" 
                showLabel={true}
              />
              <View style={styles.levelLabelRow}>
                <Text style={styles.ballLevelHint}>
                  {isNewPlayer
                    ? "Your starting level"
                    : activeSport === "padel"
                    ? "Padel level"
                    : activeSport === "pickleball"
                    ? "Pickleball rating"
                    : "Tap to learn more"}
                </Text>
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
          <Pressable onPress={() => track("progress:level_readiness")}>
            <LevelReadinessSection 
              readiness={data.levelReadiness} 
              currentLevel={data.ballLevel}
              nextLevel={data.nextBallLevel}
            />
          </Pressable>
        ) : null}

        {/* Pillar Progress Rings - 6 Core Pillars - ALWAYS SHOWN */}
        <View style={styles.pillarRingsSection}>
          <View style={styles.pillarHeaderRow}>
            <Text style={styles.sectionTitle}>
              {activeSport === "padel" ? "PADEL SKILLS" : activeSport === "pickleball" ? "PICKLEBALL SKILLS" : "THE 6 PILLARS"}
            </Text>
            {isNewPlayer && (
              <View style={styles.pillarNewBadge}>
                <Ionicons name="information-circle" size={12} color="#00E5FF" />
                <Text style={styles.pillarNewBadgeText}>Your coach will rate these</Text>
              </View>
            )}
          </View>
          <PillarProgressRings 
            pillars={(() => {
              const ALL_PILLARS = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"];
              const domainMap = new Map(domains.map(d => [d.name.toUpperCase(), d]));
              const pillarMap = new Map((pillarProgressData?.pillars ?? []).map(p => [p.name, p]));
              return Object.fromEntries(
                ALL_PILLARS.map(key => {
                  const pillarEntry = pillarMap.get(key);
                  const hasRealFeedback = pillarEntry && pillarEntry.lastUpdated !== null;
                  if (hasRealFeedback) {
                    const hasCurriculum = pillarEntry!.skillsTotal > 0;
                    const score = hasCurriculum
                      ? pillarEntry!.masteryPct
                      : Math.round(pillarEntry!.score * 50);
                    const subtitle = hasCurriculum
                      ? `${pillarEntry!.skillsMeetsOrAbove} of ${pillarEntry!.skillsTotal} skills mastered`
                      : undefined;
                    return [key, {
                      pillar: key,
                      currentScore: score,
                      trend: (pillarEntry!.trend === "improving" ? "improving" : pillarEntry!.trend === "declining" ? "declining" : "stable") as "improving" | "stable" | "declining",
                      subtitle,
                    }];
                  }
                  const domain = domainMap.get(key);
                  if (domain) {
                    return [key, {
                      pillar: key,
                      currentScore: domain.value,
                      trend: (domain.trend === "rising" ? "improving" : domain.trend === "falling" ? "declining" : "stable") as "improving" | "stable" | "declining",
                    }];
                  }
                  return [key, { pillar: key, currentScore: 0, trend: "stable" as const }];
                })
              );
            })()}
            stage={getStageFromLevel(data.ballLevel || "red1")}
            role="player"
            onPillarPress={(pillar) => handleDomainPress(pillar)}
          />
          <Pressable 
            style={styles.feedbackCenterLink}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("FeedbackCenter");
            }}
          >
            <View style={styles.feedbackCenterIcon}>
              <Ionicons name="school" size={18} color={GlowColors.primary} />
            </View>
            <View style={styles.feedbackCenterInfo}>
              <Text style={styles.feedbackCenterTitle}>Skill Assessments</Text>
              <Text style={styles.feedbackCenterSubtitle}>View deep skill-by-skill evaluations</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>
          <Pressable 
            style={styles.feedbackCenterLink}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("Tournaments");
            }}
          >
            <View style={[styles.feedbackCenterIcon, { backgroundColor: "rgba(224, 64, 251, 0.15)" }]}>
              <Ionicons name="trophy" size={18} color="#E040FB" />
            </View>
            <View style={styles.feedbackCenterInfo}>
              <Text style={styles.feedbackCenterTitle}>Tournaments & Ladders</Text>
              <Text style={styles.feedbackCenterSubtitle}>Compete in events and climb the rankings</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        {/* Skill Radar - Always shown, with placeholder for new players */}
        <Pressable style={styles.radarSection} onPress={() => track("progress:skill_radar")}>
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
        </Pressable>


        {(data.overallInsights?.strengths?.length ?? 0) > 0 ? (
          <View style={styles.insightsSection}>
            <Text style={styles.sectionTitle}>Your Strengths</Text>
            <View style={styles.insightsList}>
              {(data.overallInsights?.strengths ?? []).map((strength, i) => (
                <View key={i} style={styles.insightItem}>
                  <Ionicons name="checkmark-circle" size={16} color={GlowColors.primary} />
                  <Text style={styles.insightText}>{strength}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {(data.overallInsights?.focusAreas?.length ?? 0) > 0 ? (
          <View style={styles.insightsSection}>
            <Text style={styles.sectionTitle}>Focus Areas</Text>
            <View style={styles.insightsList}>
              {(data.overallInsights?.focusAreas ?? []).map((area, i) => (
                <View key={i} style={styles.insightItem}>
                  <Ionicons name="arrow-forward-circle" size={16} color={Colors.dark.xpCyan} />
                  <Text style={styles.insightText}>{area}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Latest Coach Ratings (Section 2 - D1) */}
        {glowRatings.length > 0 ? (
          <View style={styles.feedbackSection}>
            <View style={styles.feedbackHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionIconSmall, { backgroundColor: Colors.dark.successNeon + "20" }]}>
                  <Ionicons name="star" size={16} color={Colors.dark.successNeon} />
                </View>
                <Text style={styles.sectionTitle}>Latest Coach Ratings</Text>
              </View>
            </View>
            <View style={styles.feedbackList}>
              {glowRatings.slice(0, 3).map((rating) => {
                const overallColor = rating.overall === "improved" ? Colors.dark.successNeon : rating.overall === "declined" ? Colors.dark.error : Colors.dark.textMuted;
                const overallIcon = rating.overall === "improved" ? "trending-up" : rating.overall === "declined" ? "trending-down" : "remove";
                const overallLabel = rating.overall === "improved" ? "Improved" : rating.overall === "declined" ? "Declined" : "Stable";
                return (
                  <View key={rating.id} style={styles.noteCard}>
                    <View style={styles.noteCardHeader}>
                      <Text style={styles.noteDateText}>{formatShortDate(rating.sessionDate || rating.createdAt)}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Ionicons name={overallIcon as any} size={12} color={overallColor} />
                        <Text style={[styles.noteTypeText, { color: overallColor }]}>{overallLabel}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 12, marginVertical: 6 }}>
                      {[
                        { label: "Effort", value: rating.effort },
                        { label: "Execution", value: rating.execution },
                        { label: "Understanding", value: rating.understanding },
                      ].map((metric) => (
                        <View key={metric.label} style={{ alignItems: "center", flex: 1 }}>
                          <Text style={{ fontSize: 10, color: Colors.dark.textMuted, marginBottom: 2 }}>{metric.label}</Text>
                          <View style={{ flexDirection: "row", gap: 2 }}>
                            {[0, 1, 2].map((i) => (
                              <View
                                key={i}
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 4,
                                  backgroundColor: i <= (metric.value ?? 0) ? Colors.dark.xpCyan : Colors.dark.backgroundSecondary,
                                }}
                              />
                            ))}
                          </View>
                        </View>
                      ))}
                    </View>
                    {rating.note ? (
                      <Text style={styles.noteMessage} numberOfLines={2}>{rating.note}</Text>
                    ) : null}
                    {rating.coachName ? (
                      <Text style={styles.noteCoach}>{rating.coachName}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Coach Notes Section */}
        <View style={styles.feedbackSection}>
          <View style={styles.feedbackHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionIconSmall, { backgroundColor: Colors.dark.orange + "20" }]}>
                <Ionicons name="document-text" size={16} color={Colors.dark.orange} />
              </View>
              <Text style={styles.sectionTitle}>Coach Notes</Text>
            </View>
          </View>
          {recentNotes.length > 0 ? (
            <>
              <View style={styles.feedbackList}>
                {recentNotes.map((note) => (
                  <View key={note.id} style={styles.noteCard}>
                    <View style={styles.noteCardHeader}>
                      <Text style={styles.noteDateText}>{formatShortDate(note.sessionDate || note.createdAt)}</Text>
                      <View style={styles.noteTypeBadge}>
                        <Text style={styles.noteTypeText}>{getSessionTypeLabel(note.sessionType)}</Text>
                      </View>
                    </View>
                    <Text style={styles.noteMessage} numberOfLines={3}>{note.message}</Text>
                    <Text style={styles.noteCoach}>{note.coachName}</Text>
                  </View>
                ))}
              </View>
              <Pressable
                style={styles.seeAllButton}
                onPress={() => {
                  track("progress:coach_notes_all");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("CoachFeedbackHistory");
                }}
              >
                <Text style={styles.seeAllText}>See all</Text>
                <Ionicons name="chevron-forward" size={14} color={GlowColors.primary} />
              </Pressable>
            </>
          ) : (
            <View style={styles.emptyFeedbackCard}>
              <Ionicons name="document-outline" size={24} color={Colors.dark.textMuted} />
              <Text style={styles.emptyFeedbackText}>No coach notes yet. Your coach will leave written feedback after sessions.</Text>
            </View>
          )}
        </View>

        {/* Video Feedback Section */}
        <View style={styles.feedbackSection}>
          <View style={styles.feedbackHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionIconSmall, { backgroundColor: FunctionColors.planning + "20" }]}>
                <Ionicons name="videocam" size={16} color={FunctionColors.planning} />
              </View>
              <Text style={styles.sectionTitle}>Video Feedback</Text>
              {videoCount > 0 ? (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{videoCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {videoCount > 0 ? (
            <Pressable
              style={styles.videoCard}
              onPress={() => {
                track("progress:video_feedback");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("VideoFeedbackPlayer");
              }}
            >
              <View style={styles.videoCardIcon}>
                <Ionicons name="play-circle" size={32} color={FunctionColors.planning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.videoCardTitle}>
                  {videoCount} video clip{videoCount !== 1 ? "s" : ""} available
                </Text>
                <Text style={styles.videoCardSubtitle}>Tap to watch your coach's technique feedback</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
            </Pressable>
          ) : (
            <View style={styles.emptyFeedbackCard}>
              <Ionicons name="videocam-outline" size={24} color={Colors.dark.textMuted} />
              <Text style={styles.emptyFeedbackText}>No video feedback yet. Your coach will share technique clips here.</Text>
            </View>
          )}
        </View>

        {/* Stroke Feedback Timeline */}
        {strokeFeedbackData && strokeFeedbackData.some(r => r.strokeFeedback && r.strokeFeedback.length > 0) ? (
          <View style={styles.feedbackSection}>
            <View style={styles.feedbackHeader}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Slag Voortgang</Text>
                <View style={[styles.feedbackBadge, { backgroundColor: Colors.dark.orange + "20" }]}>
                  <Ionicons name="tennisball" size={12} color={Colors.dark.orange} />
                </View>
              </View>
            </View>
            {(() => {
              const RATING_COLORS = ["#FF4D4D", Colors.dark.orange, "#22C55E"];
              const RATING_LABELS = ["Aandachtspunt", "In Ontwikkeling", "Goed"];
              const recentRows = strokeFeedbackData.slice(0, 5);
              const allStrokes = Array.from(new Set(
                recentRows.flatMap(r => (r.strokeFeedback || []).map((e: StrokeEntry) => e.stroke))
              ));
              const strokeTotals: Record<string, number[]> = {};
              recentRows.forEach(row => {
                if (!row.strokeFeedback) return;
                row.strokeFeedback.forEach((entry: StrokeEntry) => {
                  if (!strokeTotals[entry.stroke]) strokeTotals[entry.stroke] = [0, 0, 0];
                  const r = Math.max(0, Math.min(2, entry.rating));
                  strokeTotals[entry.stroke][r]++;
                });
              });
              return allStrokes.map(stroke => {
                const ratings = recentRows
                  .map(r => (r.strokeFeedback || []).find((e: StrokeEntry) => e.stroke === stroke))
                  .filter(Boolean) as StrokeEntry[];
                const totals = strokeTotals[stroke] || [0, 0, 0];
                const dominantIdx = totals[2] >= totals[1] && totals[2] >= totals[0]
                  ? 2
                  : totals[1] >= totals[0] ? 1 : 0;
                const domColor = RATING_COLORS[dominantIdx];
                return (
                  <View key={stroke} style={styles.strokeFeedbackRow}>
                    <View style={styles.strokeLabelCol}>
                      <Text style={styles.strokeName}>{stroke}</Text>
                      <View style={[styles.strokeRatingBadge, { backgroundColor: domColor + "25" }]}>
                        <Text style={[styles.strokeRatingText, { color: domColor }]}>
                          {RATING_LABELS[dominantIdx]}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.strokeDotRow}>
                      {ratings.map((entry, i) => {
                        const r = Math.max(0, Math.min(2, entry.rating));
                        return (
                          <View
                            key={i}
                            style={[styles.strokeDot, { backgroundColor: RATING_COLORS[r] }]}
                          />
                        );
                      })}
                    </View>
                  </View>
                );
              });
            })()}
            <View style={styles.strokeLegend}>
              <View style={styles.strokeLegendItem}>
                <View style={[styles.strokeDot, { backgroundColor: "#22C55E" }]} />
                <Text style={styles.strokeLegendText}>Goed</Text>
              </View>
              <View style={styles.strokeLegendItem}>
                <View style={[styles.strokeDot, { backgroundColor: Colors.dark.orange }]} />
                <Text style={styles.strokeLegendText}>In Ontwikkeling</Text>
              </View>
              <View style={styles.strokeLegendItem}>
                <View style={[styles.strokeDot, { backgroundColor: "#FF4D4D" }]} />
                <Text style={styles.strokeLegendText}>Aandachtspunt</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Rate My Coach Section */}
        {assignedCoach ? (
          <View style={styles.feedbackSection}>
            <View style={styles.rateCoachCard}>
              <View style={styles.rateCoachAvatar}>
                <Text style={styles.rateCoachAvatarText}>{assignedCoach.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rateCoachTitle}>Rate My Coach</Text>
                <Text style={styles.rateCoachSubtitle}>{assignedCoach.name}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.rateCoachButton, { opacity: pressed ? 0.8 : 1 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowReviewModal(true);
                }}
              >
                <Ionicons name="star" size={14} color={Colors.dark.backgroundRoot} />
                <Text style={styles.rateCoachButtonText}>Write a review</Text>
              </Pressable>
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
      <AdultGlowLevelModal 
        visible={showAdultGlowModal}
        onClose={() => setShowAdultGlowModal(false)}
        currentLevel={data.ballLevel}
      />
      <PillarDetailModal
        visible={showPillarModal}
        onClose={() => setShowPillarModal(false)}
        domain={selectedPillar}
        currentLevel={data?.ballLevel}
      />
      <CoachReviewModal
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        coach={assignedCoach}
        onSuccess={() => setShowReviewModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
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
  guestContainer: {
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
  },
  guestAvatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "60",
    backgroundColor: Colors.dark.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  guestBrand: {
    ...Typography.caption,
    color: Colors.dark.primary,
    textAlign: "center",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: Spacing.xs,
  },
  guestTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
  },
  guestSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  guestFeatureList: {
    width: "100%",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  guestFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  guestFeatureText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  guestCta: {
    width: "100%",
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  guestCtaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  guestCtaText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#000",
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
  sportTabsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  sportTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginRight: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  sportTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  sportContextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  sportContextLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  ballLevelSection: {
    alignItems: "center",
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  ballLevelGradientBorder: {
    borderRadius: BorderRadius.xl,
    padding: 2,
    width: "100%",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  ballLevelInner: {
    backgroundColor: "rgba(11, 13, 16, 0.95)",
    borderRadius: BorderRadius.xl - 2,
    paddingVertical: Spacing.xl + 8,
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
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  statCardGlow: {
    borderColor: "rgba(0, 229, 255, 0.4)",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  statCardLevel: {
    borderColor: "rgba(255, 215, 0, 0.4)",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  statCardXp: {
    borderColor: "rgba(200, 255, 61, 0.4)",
    shadowColor: "#C8FF3D",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  statHint: {
    fontSize: 9,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  glowCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(0, 229, 255, 0.2)",
    borderWidth: 2.5,
    borderColor: "#00E5FF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  glowValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#00E5FF",
    textShadowColor: "#00E5FF",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  levelCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    borderWidth: 2.5,
    borderColor: Colors.dark.gold,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  xpCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(200, 255, 61, 0.2)",
    borderWidth: 2.5,
    borderColor: "#C8FF3D",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#C8FF3D",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
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
    height: 12,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.3)",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 5,
    shadowColor: "#C8FF3D",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
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
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
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
    backgroundColor: "rgba(11, 13, 16, 0.9)",
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginHorizontal: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.2)",
    shadowColor: "#C8FF3D",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
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
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  feedbackCenterLink: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    gap: Spacing.sm,
  },
  feedbackCenterIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GlowColors.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  feedbackCenterInfo: {
    flex: 1,
    gap: 2,
  },
  feedbackCenterTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  feedbackCenterSubtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
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
  sectionIconSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  noteCard: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    gap: Spacing.xs,
  },
  noteCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  noteDateText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  noteTypeBadge: {
    backgroundColor: Colors.dark.orange + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  noteTypeText: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  noteMessage: {
    ...Typography.body,
    color: Colors.dark.text,
    lineHeight: 20,
  },
  noteCoach: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    paddingVertical: Spacing.xs,
  },
  seeAllText: {
    ...Typography.small,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  emptyFeedbackCard: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
  },
  emptyFeedbackText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: FunctionColors.planning + "20",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xs,
  },
  countBadgeText: {
    ...Typography.caption,
    color: FunctionColors.planning,
    fontWeight: "700",
  },
  videoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: FunctionColors.planning + "25",
  },
  videoCardIcon: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    backgroundColor: FunctionColors.planning + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  videoCardTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  videoCardSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  rateCoachCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "25",
  },
  rateCoachAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.gold + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  rateCoachAvatarText: {
    ...Typography.h3,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  rateCoachTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  rateCoachSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  rateCoachButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  rateCoachButtonText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  strokeFeedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  strokeLabelCol: {
    flex: 1,
    gap: 4,
  },
  strokeName: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  strokeRatingBadge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  strokeRatingText: {
    fontSize: 10,
    fontWeight: "700",
  },
  strokeDotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: Spacing.md,
  },
  strokeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  strokeLegend: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  strokeLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  strokeLegendText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
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
    backgroundColor: Backgrounds.card,
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
  milestoneContent: {
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
