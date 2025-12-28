import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import Svg, { Polygon, Circle, Text as SvgText, Line } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";

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
  const size = 200;
  const center = size / 2;
  const radius = 80;
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
          fill="rgba(46, 204, 64, 0.2)"
          stroke={Colors.dark.primary}
          strokeWidth={2}
        />

        {points.map((point, i) => (
          <Circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={4}
            fill={Colors.dark.primary}
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
            { backgroundColor: isReady ? "rgba(46, 204, 64, 0.2)" : "rgba(255, 149, 0, 0.2)" }
          ]}>
            <Ionicons 
              name={isReady ? "checkmark-circle" : "time"} 
              size={24} 
              color={isReady ? Colors.dark.primary : Colors.dark.orange} 
            />
          </View>
          <View style={styles.readinessInfo}>
            <Text style={[
              styles.readinessStatus,
              { color: isReady ? Colors.dark.primary : Colors.dark.orange }
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
                color={sessionsReady ? Colors.dark.primary : Colors.dark.textMuted} 
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
                  backgroundColor: sessionsReady ? Colors.dark.primary : Colors.dark.textMuted
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
                  color={req.met ? Colors.dark.primary : Colors.dark.textMuted} 
                />
                <Text style={styles.requirementDomain}>{req.domainName}</Text>
                <Text style={[
                  styles.requirementStatus,
                  { color: req.met ? Colors.dark.primary : Colors.dark.textMuted }
                ]}>
                  {getStatusDisplay(req.current)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        
        {isReady ? (
          <View style={styles.approvalNote}>
            <Ionicons name="person-circle" size={18} color={Colors.dark.xpCyan} />
            <Text style={styles.approvalText}>
              Coach approval required to level up
            </Text>
          </View>
        ) : null}
      </View>
    </View>
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
    if (domain.trend === "rising") return Colors.dark.primary;
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

export default function PlayerProgressScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const handleDomainPress = (domainId: string) => {
    navigation.navigate("SkillDetail", { domain: domainId });
  };

  const { data, isLoading, error } = useQuery<ProgressData>({
    queryKey: ["/api/player/me/progress"],
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>My Progress</Text>
          <Text style={styles.subtitle}>Coach-validated skill development</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.glowCircle}>
              <Text style={styles.glowValue}>{data.glowScore}</Text>
            </View>
            <Text style={styles.statLabel}>Glow Score</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.levelCircle}>
              <Text style={styles.levelValue}>{data.level}</Text>
            </View>
            <Text style={styles.statLabel}>Level</Text>
          </View>
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
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
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
                  <Ionicons name="checkmark-circle" size={16} color={Colors.dark.primary} />
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

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={Colors.dark.xpCyan} />
          <Text style={styles.infoText}>
            Progress is updated by your coach after each training session. 
            Keep training to unlock new levels!
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
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
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    ...CardStyles.elevated,
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
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sessionsValue: {
    ...Typography.numberMedium,
    color: Colors.dark.primary,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 5,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 5,
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
    ...CardStyles.elevated,
    padding: Spacing.lg,
  },
  skillsSection: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  skillsList: {
    gap: Spacing.md,
  },
  skillCard: {
    ...CardStyles.elevated,
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
    backgroundColor: Colors.dark.backgroundSecondary,
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
    ...CardStyles.statusCard,
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
    ...CardStyles.elevated,
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
    ...CardStyles.elevated,
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
    backgroundColor: Colors.dark.backgroundSecondary,
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
});
