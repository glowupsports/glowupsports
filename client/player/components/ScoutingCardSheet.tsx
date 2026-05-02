import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  Colors,
  Spacing,
  BorderRadius,
  GlowColors,
  FunctionColors,
  TextColors,
  Backgrounds,
} from "@/constants/theme";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";
import { buildPhotoUrl, getApiUrl, getAuthHeaders } from "@/lib/query-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoutData {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  glowScore: number | null;
  glowMmr: number | null;
  glowRank: number | null;
  rankLabel: string | null;
  ballLevel: string | null;
  archetype: string | null;
  wins30: number;
  losses30: number;
  recent5: ("W" | "L")[];
  skillTags: string[];
  h2h: { myWins: number; myLosses: number; total: number } | null;
  privacyMasked: { glowScore: boolean; level: boolean };
}

interface ScoutingCardSheetProps {
  visible: boolean;
  opponentId: string | null;
  onClose: () => void;
  onPrepare?: (skillTags: string[]) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBallLevelColor(level: string | null): string {
  if (!level) return Colors.dark.primary;
  const l = level.toLowerCase();
  if (l.includes("blue")) return "#3B82F6";
  if (l.includes("red")) return "#EF4444";
  if (l.includes("orange")) return "#F97316";
  if (l.includes("green")) return "#22C55E";
  if (l.includes("yellow")) return "#EAB308";
  if (l.includes("glow")) return "#E040FB";
  return Colors.dark.primary;
}

function getBallLevelLabel(level: string | null): string {
  if (!level) return "";
  const l = level.toLowerCase();
  const match = l.match(/^(blue|red|orange|green|yellow|glow)\s*(\d+)?$/i);
  if (match) {
    const base = match[1].toUpperCase();
    return match[2] ? `${base} ${match[2]}` : base;
  }
  if (l.includes("blue")) return "BLUE";
  if (l.includes("red")) return "RED";
  if (l.includes("orange")) return "ORANGE";
  if (l.includes("green")) return "GREEN";
  if (l.includes("yellow")) return "YELLOW";
  if (l.includes("glow")) return "GLOW";
  return level.toUpperCase();
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ResultDot({ result }: { result: "W" | "L" }) {
  const isWin = result === "W";
  return (
    <View
      style={[
        styles.resultDot,
        { backgroundColor: isWin ? "#22C55E" : "#EF4444" },
      ]}
    >
      <Text style={styles.resultDotText}>{result}</Text>
    </View>
  );
}

function PrivateBadge() {
  return (
    <View style={styles.privateBadge}>
      <Ionicons name="lock-closed" size={10} color={TextColors.muted} />
      <Text style={styles.privateText}>Private</Text>
    </View>
  );
}

function StatBox({
  label,
  value,
  color,
  private: isPrivate,
}: {
  label: string;
  value: string;
  color?: string;
  private?: boolean;
}) {
  return (
    <View style={styles.statBox}>
      {isPrivate ? (
        <PrivateBadge />
      ) : (
        <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScoutingCardSheet({
  visible,
  opponentId,
  onClose,
  onPrepare,
}: ScoutingCardSheetProps) {
  const { data, isLoading, isError } = useQuery<ScoutData>({
    queryKey: ["/api/players", opponentId, "scout"],
    queryFn: async () => {
      const url = new URL(`/api/players/${opponentId}/scout`, getApiUrl());
      const res = await fetch(url.toString(), {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch scout data");
      return res.json();
    },
    enabled: visible && !!opponentId,
    staleTime: 60 * 1000,
  });

  const ballColor = getBallLevelColor(data?.ballLevel ?? null);
  const ballLabel = getBallLevelLabel(data?.ballLevel ?? null);

  const handlePrepare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onClose();
    if (onPrepare && data?.skillTags) {
      onPrepare(data.skillTags);
    }
  };

  return (
    <SwipeableBottomSheet visible={visible} onClose={onClose} maxHeightFraction={0.88}>
      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={GlowColors.primary} />
            <Text style={styles.loadingText}>Loading scouting data...</Text>
          </View>
        ) : isError || !data ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="alert-circle-outline" size={40} color={FunctionColors.error} />
            <Text style={styles.errorText}>Could not load scouting data</Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header — drag handle */}
            <View style={styles.handleBar} />

            {/* Label */}
            <View style={styles.scoutLabelRow}>
              <Ionicons name="binoculars-outline" size={13} color={GlowColors.primary} />
              <Text style={styles.scoutLabel}>SCOUTING REPORT</Text>
            </View>

            {/* Avatar + Name */}
            <View style={styles.heroSection}>
              <View style={[styles.avatarRing, { borderColor: ballColor }]}>
                {data.avatarUrl ? (
                  <ExpoImage
                    source={{ uri: buildPhotoUrl(data.avatarUrl) ?? undefined }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: ballColor + "30" }]}>
                    <Text style={[styles.avatarInitials, { color: ballColor }]}>
                      {getInitials(data.displayName)}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.playerName}>{data.displayName}</Text>

              {/* Rank badge */}
              {data.rankLabel ? (
                <View style={styles.rankBadge}>
                  <Ionicons name="trophy-outline" size={11} color={GlowColors.primary} />
                  <Text style={styles.rankBadgeText}>{data.rankLabel}</Text>
                </View>
              ) : null}

              {/* Archetype chip */}
              {data.archetype ? (
                <View style={styles.archetypeChip}>
                  <Text style={styles.archetypeText}>{data.archetype}</Text>
                </View>
              ) : null}
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <StatBox
                label="Glow Score"
                value={String(data.glowScore ?? 0)}
                color={GlowColors.primary}
                private={data.privacyMasked.glowScore}
              />
              <View style={styles.statDivider} />
              <StatBox
                label="Last 30 Days"
                value={`${data.wins30}W – ${data.losses30}L`}
              />
              <View style={styles.statDivider} />
              <StatBox
                label="Ball Level"
                value={ballLabel || "—"}
                color={ballColor}
                private={data.privacyMasked.level}
              />
            </View>

            {/* Recent results */}
            {data.recent5.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recent Results</Text>
                <View style={styles.resultDotsRow}>
                  {data.recent5.map((r, i) => (
                    <ResultDot key={i} result={r} />
                  ))}
                </View>
              </View>
            ) : null}

            {/* Skill strengths */}
            {data.skillTags.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Strengths</Text>
                <View style={styles.tagsRow}>
                  {data.skillTags.map((tag) => (
                    <View key={tag} style={styles.strengthTag}>
                      <Ionicons name="flash" size={11} color={GlowColors.primary} />
                      <Text style={styles.strengthTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Head to Head */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Head to Head</Text>
              {data.h2h ? (
                <View style={styles.h2hRow}>
                  <View style={styles.h2hSide}>
                    <Text style={styles.h2hScore}>{data.h2h.myWins}</Text>
                    <Text style={styles.h2hSideLabel}>You</Text>
                  </View>
                  <View style={styles.h2hCenter}>
                    <Text style={styles.h2hVs}>vs</Text>
                    <Text style={styles.h2hTotal}>{data.h2h.total} matches</Text>
                  </View>
                  <View style={styles.h2hSide}>
                    <Text style={[styles.h2hScore, { color: "#EF4444" }]}>
                      {data.h2h.myLosses}
                    </Text>
                    <Text style={styles.h2hSideLabel}>{data.displayName.split(" ")[0]}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.firstTimeRow}>
                  <Ionicons name="star-outline" size={16} color={TextColors.muted} />
                  <Text style={styles.firstTimeText}>First time facing each other</Text>
                </View>
              )}
            </View>

            {/* Prepare CTA */}
            <Pressable style={styles.prepareBtn} onPress={handlePrepare}>
              <Ionicons name="barbell-outline" size={16} color={Backgrounds.root} />
              <Text style={styles.prepareBtnText}>Prepare for Match</Text>
            </Pressable>

            <View style={{ height: Spacing.xl }} />
          </ScrollView>
        )}
      </View>
    </SwipeableBottomSheet>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    minHeight: 500,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingTop: Spacing.xxl,
  },
  loadingText: {
    color: TextColors.secondary,
    fontSize: 14,
  },
  errorText: {
    color: TextColors.secondary,
    fontSize: 14,
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: Colors.dark.chipBorder,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  scoutLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  scoutLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 1.2,
  },
  heroSection: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    overflow: "hidden",
    marginBottom: Spacing.xs,
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: "700",
  },
  playerName: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  rankBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary + "18",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: GlowColors.primary + "40",
  },
  rankBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  archetypeChip: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
  },
  archetypeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: 10,
    color: TextColors.muted,
    fontWeight: "500",
    textAlign: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.dark.chipBorder,
    marginVertical: 2,
  },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.chipBorder + "80",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  privateText: {
    fontSize: 10,
    color: TextColors.muted,
    fontWeight: "500",
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: TextColors.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: Spacing.sm,
  },
  resultDotsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  resultDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  resultDotText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  strengthTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary + "18",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: GlowColors.primary + "40",
  },
  strengthTagText: {
    fontSize: 12,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  h2hRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
  },
  h2hSide: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  h2hScore: {
    fontSize: 28,
    fontWeight: "800",
    color: "#22C55E",
  },
  h2hSideLabel: {
    fontSize: 11,
    color: TextColors.muted,
    fontWeight: "500",
  },
  h2hCenter: {
    alignItems: "center",
    gap: 2,
  },
  h2hVs: {
    fontSize: 14,
    color: TextColors.muted,
    fontWeight: "600",
  },
  h2hTotal: {
    fontSize: 10,
    color: TextColors.muted,
  },
  firstTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
  },
  firstTimeText: {
    fontSize: 13,
    color: TextColors.muted,
    fontWeight: "500",
  },
  prepareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  prepareBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Backgrounds.root,
  },
});
