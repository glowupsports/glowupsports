import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, FontSizes } from "@/constants/theme";

interface SkillChallenge {
  id: string;
  weekStart: string;
  title: string;
  description: string;
  hashtag: string;
  isActive: boolean;
}

interface CurrentResponse {
  challenge: SkillChallenge | null;
  submissionCount: number;
}

interface SkillChallengeRailProps {
  onPress?: () => void;
}

function formatWeekRange(weekStart: string): string {
  try {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(start)} – ${fmt(end)}`;
  } catch {
    return "";
  }
}

export default function SkillChallengeRail({ onPress }: SkillChallengeRailProps) {
  const navigation = useNavigation<any>();
  const { data, isLoading } = useQuery<CurrentResponse>({
    queryKey: ["/api/leaderboards/skill-challenge/current"],
    staleTime: 60_000,
  });

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    navigation.navigate("SkillChallengeSubmissions");
  };

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="small" color={Colors.dark.tint} />
      </View>
    );
  }

  if (!data?.challenge) return null;
  const c = data.challenge;
  const range = formatWeekRange(c.weekStart);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        { opacity: pressed ? 0.85 : 1 },
      ]}
      testID="card-skill-challenge"
    >
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="ribbon" size={18} color="#FFD700" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>WEEKLY SKILL CHALLENGE</Text>
          <Text style={styles.title} numberOfLines={1}>
            {c.title}
          </Text>
        </View>
        <View style={styles.countPill}>
          <Ionicons name="people" size={11} color={Colors.dark.text} />
          <Text style={styles.countText}>{data.submissionCount}</Text>
        </View>
      </View>
      <Text style={styles.description} numberOfLines={2}>
        {c.description}
      </Text>
      <View style={styles.footerRow}>
        {range ? <Text style={styles.range}>{range}</Text> : <View />}
        <View style={styles.hashtagPill}>
          <Text style={styles.hashtag}>#{c.hashtag}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loader: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  card: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(255, 215, 0, 0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 215, 0, 0.25)",
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 215, 0, 0.18)",
  },
  eyebrow: {
    color: "#FFD700",
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  title: {
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    fontWeight: "700",
    marginTop: 2,
  },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  countText: {
    color: Colors.dark.text,
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  description: {
    color: Colors.dark.text,
    opacity: 0.8,
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  range: {
    color: Colors.dark.accentText,
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  hashtagPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  hashtag: {
    color: Colors.dark.text,
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
});
