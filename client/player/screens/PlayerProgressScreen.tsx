import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, CardStyles, Backgrounds, GlowColors } from "@/constants/theme";
import Svg, { Polygon, Circle, Text as SvgText, Line } from "react-native-svg";
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
  const size = 260;
  const center = size / 2;
  const radius = 100;
  const levels = 5;

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
        {[1, 2, 3, 4, 5].map((level) => {
          const levelPoints = domains.map((_, i) => getPoint(i, level * 20));
          return (
            <Polygon
              key={level}
              points={levelPoints.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={Colors.dark.backgroundTertiary}
              strokeWidth={1}
            />
          );
        })}
        
        {domains.map((_, i) => {
          const endPoint = getPoint(i, 100);
          return (
            <Line
              key={i}
              x1={center}
              y1={center}
              x2={endPoint.x}
              y2={endPoint.y}
              stroke={Colors.dark.backgroundTertiary}
              strokeWidth={1}
            />
          );
        })}

        <Polygon
          points={polygonPoints}
          fill="rgba(200, 255, 61, 0.2)"
          stroke={GlowColors.primary}
          strokeWidth={2}
        />

        {points.map((point, i) => (
          <Circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={4}
            fill={GlowColors.primary}
          />
        ))}

        {domains.map((domain, i) => {
          const labelPoint = getPoint(i, 130);
          return (
            <SvgText
              key={i}
              x={labelPoint.x}
              y={labelPoint.y}
              fill={Colors.dark.textMuted}
              fontSize={10}
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {domain.name.slice(0, 3).toUpperCase()}
            </SvgText>
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
  if (level.startsWith("red")) return "#FF4444";
  if (level.startsWith("orange")) return "#FF9500";
  if (level.startsWith("green")) return "#2ECC40";
  if (level.startsWith("yellow")) return "#FFD700";
  if (level === "glow") return Colors.dark.xpCyan;
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
                      currentLevel >= milestone.level && { color: "#fff" }
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

  const handleDomainPress = (domainId: string) => {
    navigation.navigate("SkillDetail", { domain: domainId });
  };

  const { data, isLoading, error } = useQuery<ProgressData>({
    queryKey: ["/api/player/me/progress"],
  });

  const { data: attendanceData } = useQuery<AttendanceData>({
    queryKey: ["/api/player/me/attendance"],
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

  if (totalObservations === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ 
            paddingHorizontal: Spacing.xl,
            paddingVertical: Spacing.xl,
            paddingBottom: insets.bottom + 200,
            justifyContent: "center",
            minHeight: "100%"
          }}
          showsVerticalScrollIndicator={false}
        >
          <EmptyStateCard
            icon="trending-up"
            title="No progress tracked yet"
            description="Complete sessions to start tracking your development"
            ctaText="View Schedule"
            onPress={() => navigation.navigate("Schedule")}
            style={{ marginTop: Spacing.xl }}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>My Progress</Text>
          <Text style={styles.subtitle}>Coach-validated skill development</Text>
        </View>

        {/* Ball Level Badge - Prominent Display */}
        {data.ballLevel ? (
          <View style={styles.ballLevelSection}>
            <BallLevelBadge 
              levelId={data.ballLevel} 
              size="large" 
              showLabel={true}
            />
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.glowCircle}>
              <Text style={styles.glowValue}>{data.glowScore}</Text>
            </View>
            <Text style={styles.statLabel}>Glow Score</Text>
          </View>
          <Pressable 
            style={styles.statCard}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowLevelModal(true);
            }}
          >
            <View style={styles.levelCircle}>
              <Text style={styles.levelValue}>{data.level}</Text>
            </View>
            <View style={styles.levelLabelRow}>
              <Text style={styles.statLabel}>Level</Text>
              <Ionicons name="information-circle-outline" size={12} color={Colors.dark.textMuted} />
            </View>
          </Pressable>
          <View style={styles.statCard}>
            <View style={styles.sessionsCircle}>
              <Text style={styles.sessionsValue}>{totalObservations}</Text>
            </View>
            <Text style={styles.statLabel}>Observations</Text>
          </View>
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

        {data.levelReadiness ? (
          <LevelReadinessSection 
            readiness={data.levelReadiness} 
            currentLevel={data.ballLevel}
            nextLevel={data.nextBallLevel}
          />
        ) : null}

        {/* Pillar Progress Rings - 6 Core Pillars */}
        {data.ballLevel ? (
          <View style={styles.pillarRingsSection}>
            <Text style={styles.sectionTitle}>Core Pillars</Text>
            <PillarProgressRings 
              pillars={Object.fromEntries(
                domains.map(d => [
                  d.id.toUpperCase(), 
                  { 
                    pillar: d.id.toUpperCase(), 
                    currentScore: d.value, 
                    trend: d.trend === "rising" ? "up" : d.trend === "falling" ? "down" : "stable" 
                  }
                ])
              )}
              stage={getStageFromLevel(data.ballLevel)}
              role="player"
              onPillarPress={(pillar) => handleDomainPress(pillar.toLowerCase())}
            />
          </View>
        ) : null}

        <View style={styles.radarSection}>
          <Text style={styles.sectionTitle}>Skill Domains</Text>
          <SkillRadar domains={domains} />
        </View>

        <View style={styles.skillsSection}>
          <Text style={styles.sectionTitle}>Skill Breakdown</Text>
          <View style={styles.skillsList}>
            {domains.map((domain) => (
              <SkillBar 
                key={domain.name} 
                domain={domain} 
                onPress={() => handleDomainPress(domain.id)}
              />
            ))}
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

        {attendanceData && attendanceData.classes.length > 0 ? (
          <View style={styles.attendanceSection}>
            <Text style={styles.sectionTitle}>My Classes</Text>
            
            <View style={styles.attendanceSummary}>
              <View style={styles.attendanceSummaryItem}>
                <Text style={styles.attendanceSummaryValue}>{attendanceData.summary.totalPresent}</Text>
                <Text style={styles.attendanceSummaryLabel}>Attended</Text>
              </View>
              <View style={styles.attendanceSummaryDivider} />
              <View style={styles.attendanceSummaryItem}>
                <Text style={styles.attendanceSummaryValue}>{attendanceData.summary.totalSessions}</Text>
                <Text style={styles.attendanceSummaryLabel}>Total</Text>
              </View>
              <View style={styles.attendanceSummaryDivider} />
              <View style={styles.attendanceSummaryItem}>
                <Text style={[styles.attendanceSummaryValue, { color: GlowColors.primary }]}>
                  {attendanceData.summary.attendanceRate}%
                </Text>
                <Text style={styles.attendanceSummaryLabel}>Rate</Text>
              </View>
            </View>

            {attendanceData.classes.map((cls) => (
              <View key={cls.id} style={styles.attendanceCard}>
                <View style={styles.attendanceCardHeader}>
                  <View style={[styles.attendanceTypeIcon, { backgroundColor: getSessionTypeColor(cls.sessionType) + "20" }]}>
                    <Ionicons 
                      name={getSessionTypeIcon(cls.sessionType) as any} 
                      size={18} 
                      color={getSessionTypeColor(cls.sessionType)} 
                    />
                  </View>
                  <View style={styles.attendanceCardInfo}>
                    <Text style={styles.attendanceCardTitle}>{cls.title}</Text>
                    <Text style={styles.attendanceCardTime}>{cls.dayOfWeek} at {cls.time}</Text>
                  </View>
                  {cls.status === "left" ? (
                    <View style={styles.formerBadge}>
                      <Text style={styles.formerBadgeText}>Former</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.attendanceStats}>
                  <View style={styles.attendanceStat}>
                    <Ionicons name="checkmark-circle" size={14} color={GlowColors.primary} />
                    <Text style={styles.attendanceStatText}>{cls.attendance.present} present</Text>
                  </View>
                  <View style={styles.attendanceStat}>
                    <Ionicons name="airplane" size={14} color={Colors.dark.gold} />
                    <Text style={styles.attendanceStatText}>{cls.attendance.vacation} vacation</Text>
                  </View>
                  <View style={styles.attendanceStat}>
                    <Ionicons name="close-circle" size={14} color={Colors.dark.error} />
                    <Text style={styles.attendanceStatText}>{cls.attendance.absent} absent</Text>
                  </View>
                </View>
                <View style={styles.attendanceRateBar}>
                  <View style={[styles.attendanceRateFill, { width: `${cls.attendance.rate}%` }]} />
                </View>
                <Text style={styles.attendanceRateText}>{cls.attendance.rate}% attendance rate</Text>
              </View>
            ))}
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
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  subtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  ballLevelSection: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
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
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  glowCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    borderWidth: 2,
    borderColor: Colors.dark.xpCyan,
    justifyContent: "center",
    alignItems: "center",
  },
  glowValue: {
    ...Typography.numberMedium,
    color: Colors.dark.xpCyan,
  },
  levelCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderWidth: 2,
    borderColor: Colors.dark.gold,
    justifyContent: "center",
    alignItems: "center",
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
  radarSection: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  radarContainer: {
    alignItems: "center",
    ...CardStyles.base,
    padding: Spacing.lg,
    marginHorizontal: Spacing.xl,
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
