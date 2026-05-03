import React, { useEffect, useRef, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Switch,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import { apiRequest, getApiUrl } from "@/lib/query-client";

type RouteParams = { analysisId: string; strokeType?: string };

interface CheckpointResult {
  name: string;
  rating: "Good" | "Needs Work" | "Focus Area";
  explanation: string;
}

interface TechniqueAnalysis {
  id: string;
  stroke_type: string;
  status: "processing" | "completed" | "failed";
  overall_score: number | null;
  checkpoints: CheckpointResult[] | null;
  tips: string[] | null;
  key_frame_timestamp: number | null;
  thumbnail_url: string | null;
  video_url: string | null;
  share_with_coach: boolean;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const RATING_CONFIG: Record<string, { color: string; icon: IoniconName; bg: string }> = {
  Good: { color: "#22C55E", icon: "checkmark-circle", bg: "#22C55E18" },
  "Needs Work": { color: "#F59E0B", icon: "time", bg: "#F59E0B18" },
  "Focus Area": { color: "#EF4444", icon: "alert-circle", bg: "#EF444418" },
};

const STROKE_FOCUS_DRILLS: Record<string, { title: string; description: string }> = {
  Serve: { title: "Serve Consistency Drill", description: "Trophy pose holds + toss accuracy practice" },
  Forehand: { title: "Forehand Unit Turn Drill", description: "Shadow swings focusing on shoulder rotation and follow-through" },
  Backhand: { title: "Backhand Cross-Court Drill", description: "Rally from baseline targeting cross-court placement" },
  Volley: { title: "Volley Punch Drill", description: "Net approach volleys — short punch, no backswing" },
  Return: { title: "Return Split-Step Drill", description: "Practice split step timing against a ball machine or feeder" },
  Overhead: { title: "Overhead Shadow Drill", description: "Trophy position + overhead contact rehearsal against lob tosses" },
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#22C55E" : score >= 60 ? "#F59E0B" : "#EF4444";
  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          borderWidth: 6,
          borderColor: color,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: color + "14",
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: "900", color }}>{score}</Text>
      </View>
      <Text style={{ fontSize: 11, fontWeight: "700", color, letterSpacing: 0.5 }}>
        {score >= 80 ? "EXCELLENT" : score >= 60 ? "DEVELOPING" : "NEEDS WORK"}
      </Text>
    </View>
  );
}

function KeyFrameCard({ thumbnailUrl, keyFrameTimestamp, strokeType, authToken }: {
  thumbnailUrl: string | null;
  keyFrameTimestamp: number | null;
  strokeType: string;
  authToken: string | null;
}) {
  if (!thumbnailUrl) return null;

  const base = getApiUrl();
  const fullUrl = thumbnailUrl.startsWith("http")
    ? thumbnailUrl
    : new URL(thumbnailUrl, base).toString();

  const timeStr = keyFrameTimestamp != null
    ? `Key moment at ${keyFrameTimestamp.toFixed(1)}s`
    : "Key moment";

  const imageSource = authToken
    ? { uri: fullUrl, headers: { Authorization: `Bearer ${authToken}` } }
    : { uri: fullUrl };

  return (
    <View style={kfStyles.card}>
      <Text style={kfStyles.label}>Key Moment</Text>
      <View style={kfStyles.imageWrap}>
        <Image
          source={imageSource}
          style={kfStyles.image}
          resizeMode="cover"
        />
        <View style={kfStyles.overlay}>
          <View style={kfStyles.overlayBadge}>
            <Ionicons name="play-circle" size={14} color="#fff" />
            <Text style={kfStyles.overlayText}>{timeStr}</Text>
          </View>
          <View style={kfStyles.improveArrow}>
            <Ionicons name="arrow-up-circle" size={22} color="#22C55E" />
            <Text style={kfStyles.improveArrowText}>Focus here</Text>
          </View>
        </View>
      </View>
      <Text style={kfStyles.caption}>
        AI identified this frame as the most critical point in your {strokeType.toLowerCase()}.
      </Text>
    </View>
  );
}

const kfStyles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  imageWrap: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    height: 180,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  overlayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  overlayText: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "600",
  },
  improveArrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(34,197,94,0.25)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#22C55E60",
  },
  improveArrowText: {
    fontSize: 11,
    color: "#22C55E",
    fontWeight: "700",
  },
  caption: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 18,
  },
});

export default function TechniqueAnalysisResultScreen() {
  const route = useRoute<RouteProp<{ p: RouteParams }, "p">>();
  const { analysisId, strokeType } = route.params ?? {};
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("auth_token").then(setAuthToken).catch(() => {});
  }, []);

  const { data, isLoading, error, refetch } = useQuery<{ analysis: TechniqueAnalysis }>({
    queryKey: ["/api/player/me/technique-analyses", analysisId],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/player/me/technique-analyses/${analysisId}`, base).toString();
      const token = await AsyncStorage.getItem("auth_token");
      const res = await fetch(url, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch analysis");
      return res.json();
    },
    enabled: !!analysisId,
    staleTime: 0,
    retry: 3,
  });

  const analysis = data?.analysis;
  const isProcessing = !analysis || analysis.status === "processing";

  useEffect(() => {
    if (!isProcessing) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => {
      refetch();
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isProcessing, refetch]);

  const shareMutation = useMutation({
    mutationFn: (shareWithCoach: boolean) =>
      apiRequest("PATCH", `/api/player/me/technique-analyses/${analysisId}/share`, { shareWithCoach }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/technique-analyses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/technique-analyses", analysisId] });
    },
  });

  const handleShareToggle = useCallback(
    (val: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      shareMutation.mutate(val);
    },
    [shareMutation]
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { paddingTop: headerHeight + 60 }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading your analysis...</Text>
      </View>
    );
  }

  if (error || !analysis) {
    return (
      <View style={[styles.centered, { paddingTop: headerHeight + 60 }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={Colors.dark.textMuted} />
        <Text style={styles.errorText}>Could not load this analysis.</Text>
        <Pressable style={styles.retryBtn} onPress={() => refetch()}>
          <Text style={styles.retryBtnText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  if (analysis.status === "processing") {
    return (
      <View style={[styles.centered, { paddingTop: headerHeight + 60 }]}>
        <Animated.View entering={FadeInDown.duration(600)} style={styles.processingCard}>
          <ActivityIndicator size="large" color={Colors.dark.primary} style={{ marginBottom: Spacing.md }} />
          <Text style={styles.processingTitle}>Analyzing your {strokeType ?? analysis.stroke_type}</Text>
          <Text style={styles.processingBody}>
            Our AI coach is reviewing your video frame by frame. This takes 30 – 90 seconds.
            You will get a push notification when it is ready.
          </Text>
          <View style={styles.processingDotsRow}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.processingDot} />
            ))}
          </View>
        </Animated.View>
        <Pressable style={styles.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.retryBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (analysis.status === "failed") {
    return (
      <View style={[styles.centered, { paddingTop: headerHeight + 60 }]}>
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        <Text style={styles.errorText}>Analysis could not be completed.</Text>
        <Text style={styles.errorSub}>{analysis.error_message ?? "Please try uploading again."}</Text>
        <Pressable style={styles.retryBtn} onPress={() => navigation.replace("TechniqueUploadFlow")}>
          <Text style={styles.retryBtnText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  const checkpoints = analysis.checkpoints ?? [];
  const tips = analysis.tips ?? [];
  const score = analysis.overall_score ?? 0;
  const dateStr = analysis.completed_at
    ? new Date(analysis.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";

  const drill = STROKE_FOCUS_DRILLS[analysis.stroke_type];
  const focusCheckpoints = checkpoints.filter((cp) => cp.rating === "Focus Area");
  const focusDrillTitle = focusCheckpoints.length > 0
    ? `Work on: ${focusCheckpoints[0].name}`
    : drill?.title ?? "Stroke Improvement Drills";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl, gap: Spacing.lg }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInUp.delay(50).duration(500)} style={styles.scoreHeader}>
        <Text style={styles.strokeLabel}>{analysis.stroke_type}</Text>
        <ScoreRing score={score} />
        <Text style={styles.dateText}>{dateStr}</Text>
      </Animated.View>

      {analysis.thumbnail_url ? (
        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <KeyFrameCard
            thumbnailUrl={analysis.thumbnail_url}
            keyFrameTimestamp={analysis.key_frame_timestamp}
            strokeType={analysis.stroke_type}
            authToken={authToken}
          />
        </Animated.View>
      ) : null}

      {checkpoints.length > 0 ? (
        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.section}>
          <Text style={styles.sectionTitle}>Checkpoints</Text>
          <View style={styles.checkpointList}>
            {checkpoints.map((cp, i) => {
              const cfg = RATING_CONFIG[cp.rating] ?? RATING_CONFIG["Needs Work"];
              return (
                <View key={i} style={[styles.checkpointCard, { backgroundColor: cfg.bg }]}>
                  <View style={styles.checkpointHeader}>
                    <Ionicons name={cfg.icon} size={18} color={cfg.color} />
                    <Text style={[styles.checkpointName, { color: cfg.color }]}>{cp.name}</Text>
                    <View style={[styles.ratingPill, { backgroundColor: cfg.color + "25" }]}>
                      <Text style={[styles.ratingPillText, { color: cfg.color }]}>{cp.rating}</Text>
                    </View>
                  </View>
                  <Text style={styles.checkpointExplanation}>{cp.explanation}</Text>
                </View>
              );
            })}
          </View>
        </Animated.View>
      ) : null}

      {tips.length > 0 ? (
        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.section}>
          <Text style={styles.sectionTitle}>Coach Tips</Text>
          <View style={styles.tipList}>
            {tips.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={styles.tipNumber}>
                  <Text style={styles.tipNumberText}>{i + 1}</Text>
                </View>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      ) : null}

      {drill ? (
        <Animated.View entering={FadeInDown.delay(260).duration(500)} style={styles.section}>
          <Text style={styles.sectionTitle}>Recommended Drill</Text>
          <Pressable
            style={({ pressed }) => [styles.drillCard, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("Training");
            }}
          >
            <View style={styles.drillIconWrap}>
              <Ionicons name="barbell-outline" size={22} color="#6366F1" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.drillTitle}>{focusDrillTitle}</Text>
              <Text style={styles.drillSub}>{drill.description}</Text>
              <Text style={[styles.drillSub, { color: "#6366F1", marginTop: 2, fontWeight: "600" }]}>
                Open in Drill Library
              </Text>
            </View>
            <View style={styles.drillChevron}>
              <Ionicons name="arrow-forward" size={14} color="#6366F1" />
            </View>
          </Pressable>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.section}>
        <Text style={styles.sectionTitle}>Share with Coach</Text>
        <View style={styles.shareRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.shareLabel}>Share this analysis</Text>
            <Text style={styles.shareSub}>Your coach will be able to see this feedback in your player profile.</Text>
          </View>
          <Switch
            value={analysis.share_with_coach}
            onValueChange={handleShareToggle}
            trackColor={{ false: Colors.dark.chipBackgroundStrong, true: Colors.dark.primary + "88" }}
            thumbColor={analysis.share_with_coach ? Colors.dark.primary : Colors.dark.textMuted}
          />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.section}>
        <Pressable
          style={({ pressed }) => [styles.newAnalysisBtn, pressed && { opacity: 0.8 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.replace("TechniqueUploadFlow");
          }}
        >
          <Ionicons name="videocam-outline" size={18} color={Colors.dark.primary} />
          <Text style={styles.newAnalysisBtnText}>Analyze Another Clip</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.historyBtn, pressed && { opacity: 0.8 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <Ionicons name="time-outline" size={18} color={Colors.dark.textMuted} />
          <Text style={styles.historyBtnText}>View All Analyses</Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

const styles = makeReactiveStyles(() =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: Spacing.xl,
      gap: Spacing.md,
      backgroundColor: Colors.dark.backgroundRoot,
    },
    loadingText: { ...Typography.body, color: Colors.dark.textMuted },
    errorText: { ...Typography.heading3, color: Colors.dark.text, textAlign: "center" },
    errorSub: { ...Typography.body, color: Colors.dark.textMuted, textAlign: "center" },
    retryBtn: {
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.xl,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.dark.chipBackgroundStrong,
    },
    retryBtnText: { color: Colors.dark.text, fontWeight: "700" },
    processingCard: {
      backgroundColor: Colors.dark.backgroundDefault,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      marginHorizontal: Spacing.lg,
      alignItems: "center",
      gap: Spacing.sm,
      marginBottom: Spacing.lg,
    },
    processingTitle: { ...Typography.heading3, color: Colors.dark.text, textAlign: "center", fontWeight: "700" },
    processingBody: { ...Typography.body, color: Colors.dark.textMuted, textAlign: "center", lineHeight: 22 },
    processingDotsRow: { flexDirection: "row", gap: 6, marginTop: Spacing.sm },
    processingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: Colors.dark.primary,
    },
    scoreHeader: {
      alignItems: "center",
      gap: Spacing.md,
      paddingVertical: Spacing.lg,
    },
    strokeLabel: {
      ...Typography.heading2,
      color: Colors.dark.text,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    dateText: { ...Typography.caption, color: Colors.dark.textMuted },
    section: {
      marginHorizontal: Spacing.lg,
      gap: Spacing.sm,
    },
    sectionTitle: {
      ...Typography.heading3,
      color: Colors.dark.text,
      fontWeight: "700",
    },
    checkpointList: { gap: Spacing.sm },
    checkpointCard: {
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      gap: Spacing.xs,
    },
    checkpointHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
    },
    checkpointName: { fontWeight: "700", fontSize: 14, flex: 1 },
    ratingPill: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
    },
    ratingPillText: { fontSize: 11, fontWeight: "700" },
    checkpointExplanation: { ...Typography.body, color: Colors.dark.textSecondary, lineHeight: 20 },
    tipList: { gap: Spacing.sm },
    tipRow: {
      flexDirection: "row",
      gap: Spacing.md,
      alignItems: "flex-start",
      backgroundColor: Colors.dark.chipBackgroundStrong,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
    },
    tipNumber: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: Colors.dark.primary + "25",
      alignItems: "center",
      justifyContent: "center",
    },
    tipNumberText: { fontSize: 12, fontWeight: "800", color: Colors.dark.primary },
    tipText: { ...Typography.body, color: Colors.dark.text, flex: 1, lineHeight: 22 },
    drillCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      backgroundColor: "#6366F112",
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      borderWidth: 1.5,
      borderColor: "#6366F130",
    },
    drillIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: "#6366F120",
      alignItems: "center",
      justifyContent: "center",
    },
    drillTitle: { fontSize: 14, fontWeight: "700", color: Colors.dark.text, marginBottom: 2 },
    drillSub: { fontSize: 12, color: Colors.dark.textMuted, lineHeight: 16 },
    drillChevron: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: "#6366F120",
      alignItems: "center",
      justifyContent: "center",
    },
    shareRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      backgroundColor: Colors.dark.chipBackgroundStrong,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
    },
    shareLabel: { ...Typography.body, color: Colors.dark.text, fontWeight: "700" },
    shareSub: { ...Typography.caption, color: Colors.dark.textMuted, marginTop: 2, lineHeight: 18 },
    newAnalysisBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.xs,
      borderRadius: BorderRadius.full,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
      borderWidth: 2,
      borderColor: Colors.dark.primary,
    },
    newAnalysisBtnText: { color: Colors.dark.primary, fontWeight: "700", fontSize: 15 },
    historyBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.xs,
      borderRadius: BorderRadius.full,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
      backgroundColor: Colors.dark.chipBackgroundStrong,
    },
    historyBtnText: { color: Colors.dark.textMuted, fontWeight: "600", fontSize: 15 },
  })
);
