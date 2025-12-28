import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import Svg, { Polygon, Circle, Text as SvgText, Line } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";

interface SkillDomain {
  name: string;
  value: number;
  maxValue: number;
  icon: string;
  color: string;
  lastUpdated?: string;
  updatedBy?: string;
}

interface PlayerProgress {
  level: number;
  xp: number;
  glowScore: number;
  totalSessions: number;
  domains: SkillDomain[];
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

function SkillBar({ domain }: { domain: SkillDomain }) {
  const progress = domain.value / domain.maxValue;
  
  return (
    <View style={styles.skillCard}>
      <View style={styles.skillHeader}>
        <View style={[styles.skillIcon, { backgroundColor: `${domain.color}20` }]}>
          <Ionicons name={domain.icon as any} size={18} color={domain.color} />
        </View>
        <View style={styles.skillInfo}>
          <Text style={styles.skillName}>{domain.name}</Text>
          {domain.updatedBy ? (
            <Text style={styles.skillUpdated}>Updated by {domain.updatedBy}</Text>
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
    </View>
  );
}

export default function PlayerProgressScreen() {
  const insets = useSafeAreaInsets();

  const { data: progress } = useQuery<PlayerProgress>({
    queryKey: ["/api/player/progress"],
    enabled: false,
  });

  const mockProgress: PlayerProgress = {
    level: 12,
    xp: 2450,
    glowScore: 78,
    totalSessions: 45,
    domains: [
      { name: "Technical", value: 72, maxValue: 100, icon: "tennisball", color: Colors.dark.primary, updatedBy: "Coach Mike" },
      { name: "Tactical", value: 58, maxValue: 100, icon: "bulb", color: Colors.dark.gold, updatedBy: "Coach Mike" },
      { name: "Physical", value: 85, maxValue: 100, icon: "fitness", color: Colors.dark.orange, updatedBy: "Coach Sarah" },
      { name: "Mental", value: 65, maxValue: 100, icon: "brain", color: Colors.dark.xpCyan, updatedBy: "Coach Mike" },
      { name: "Social", value: 70, maxValue: 100, icon: "people", color: "#E040FB", updatedBy: "Coach Mike" },
    ],
  };

  const data = progress || mockProgress;
  const xpForNextLevel = (data.level + 1) * 500;
  const currentLevelXp = data.xp % 500;

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
              <Text style={styles.sessionsValue}>{data.totalSessions}</Text>
            </View>
            <Text style={styles.statLabel}>Sessions</Text>
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

        <View style={styles.radarSection}>
          <Text style={styles.sectionTitle}>Skill Domains</Text>
          <SkillRadar domains={data.domains} />
        </View>

        <View style={styles.skillsSection}>
          <Text style={styles.sectionTitle}>Skill Breakdown</Text>
          <View style={styles.skillsList}>
            {data.domains.map((domain) => (
              <SkillBar key={domain.name} domain={domain} />
            ))}
          </View>
        </View>

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
});
