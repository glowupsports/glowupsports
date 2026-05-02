import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Share,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { Colors, Spacing } from "@/constants/theme";
import ChampionCard from "@/player/components/arena/ChampionCard";

interface CardData {
  card: {
    rarityTier: string;
    rarityLabel: string;
    rarityMarker: string;
    statPower: number;
    statTechnique: number;
    statMental: number;
    statTactics: number;
    arenaMmr: number;
    arenaWins: number;
    arenaLosses: number;
    streakSnapshot: number;
    ballLevelSnapshot?: string;
    skillLevelSnapshot?: number;
    glowRankSnapshot?: number;
  };
  player: {
    name: string;
    profilePhotoUrl?: string | null;
    level?: number;
    ballLevel?: string;
    skillLevel?: number;
    glowRank?: number;
    glowMmr?: number;
    streak?: number;
  };
}

// ── Ball level milestone timeline ─────────────────────────────────────────────
const BALL_MILESTONES = [
  { key: "blue",   label: "Blue",   color: "#4FC3F7" },
  { key: "red",    label: "Red",    color: "#FF4D4D" },
  { key: "orange", label: "Orange", color: "#FF851B" },
  { key: "green",  label: "Green",  color: "#C8FF3D" },
  { key: "yellow", label: "Yellow", color: "#FFD700" },
  { key: "glow",   label: "Glow",   color: "#E040FB" },
];

function TierTimeline({ currentBallLevel }: { currentBallLevel?: string }) {
  const currentIdx = BALL_MILESTONES.findIndex(
    (m) => m.key === (currentBallLevel ?? "blue").toLowerCase(),
  );

  return (
    <View style={styles.timeline}>
      <Text style={styles.timelineTitle}>Tier Journey</Text>
      <View style={styles.timelineRow}>
        {BALL_MILESTONES.map((m, idx) => {
          const reached = idx <= currentIdx;
          const current = idx === currentIdx;
          return (
            <React.Fragment key={m.key}>
              {idx > 0 && (
                <View
                  style={[
                    styles.timelineConnector,
                    { backgroundColor: reached ? m.color : Colors.dark.borderSubtle },
                  ]}
                />
              )}
              <View style={styles.timelineDotWrap}>
                <View
                  style={[
                    styles.timelineDot,
                    {
                      backgroundColor: reached ? m.color : Colors.dark.backgroundDefault,
                      borderColor: m.color,
                      borderWidth: current ? 2.5 : 1.5,
                      transform: [{ scale: current ? 1.2 : 1 }],
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.timelineDotLabel,
                    { color: reached ? m.color : Colors.dark.disabled, fontSize: current ? 10 : 8 },
                  ]}
                >
                  {m.label}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

// ── Full stat row ─────────────────────────────────────────────────────────────
function FullStatRow({ label, value, color, description }: {
  label: string; value: number; color: string; description: string;
}) {
  return (
    <View style={styles.fullStatRow}>
      <View style={styles.fullStatLeft}>
        <Text style={[styles.fullStatLabel, { color }]}>{label}</Text>
        <Text style={styles.fullStatDesc}>{description}</Text>
      </View>
      <View style={styles.fullStatRight}>
        <View style={styles.fullStatBarBg}>
          <View
            style={[
              styles.fullStatBarFill,
              { backgroundColor: color, width: `${Math.round((value / 99) * 100)}%` },
            ]}
          />
        </View>
        <Text style={[styles.fullStatValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function MyCardScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);

  const { data, isLoading } = useQuery<CardData>({
    queryKey: ["/api/arena/my-card"],
  });

  const handleShare = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      if (Platform.OS === "web") {
        await Share.share({ message: `My Glow Arena card — ${data?.card?.rarityLabel ?? ""}` });
        return;
      }
      const uri = await captureRef(cardRef, { format: "png", quality: 0.95 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
    } catch {}
  }, [data]);

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={Colors.dark.primary} size="large" />
      </View>
    );
  }

  const card = data?.card;
  const player = data?.player;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 64,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        alignItems: "center",
      }}
    >
      {/* Full-screen card (screenshot target) */}
      <View ref={cardRef} collapsable={false}>
        {card && player ? (
          <ChampionCard
            card={card}
            player={player}
            size="fullscreen"
          />
        ) : (
          <View style={styles.noCardBox}>
            <Feather name="credit-card" size={48} color={Colors.dark.disabled} />
            <Text style={styles.noCardText}>Card not available</Text>
          </View>
        )}
      </View>

      {/* Rarity tier name */}
      {card && (
        <View style={styles.tierBadge}>
          <Text style={styles.tierMarker}>{card.rarityMarker}</Text>
          <Text style={styles.tierLabel}>{card.rarityLabel}</Text>
        </View>
      )}

      {/* Full stats */}
      {card && (
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Card Stats</Text>
          <FullStatRow label="Power"     value={card.statPower}     color="#FF4D4D" description="MMR + Physical training" />
          <FullStatRow label="Technique" value={card.statTechnique} color="#4DA3FF" description="Technical skill level" />
          <FullStatRow label="Mental"    value={card.statMental}    color="#C8FF3D" description="Mental fortitude" />
          <FullStatRow label="Tactics"   value={card.statTactics}   color="#FFD700" description="Tactical reading of game" />
        </View>
      )}

      {/* Tier journey timeline */}
      {card && (
        <TierTimeline currentBallLevel={card.ballLevelSnapshot ?? player?.ballLevel} />
      )}

      {/* Arena record */}
      {card && (
        <View style={styles.recordCard}>
          <Text style={styles.statsTitle}>Arena Record</Text>
          <View style={styles.recordRow}>
            <View style={styles.recordStat}>
              <Text style={[styles.recordValue, { color: Colors.dark.success }]}>{card.arenaWins}</Text>
              <Text style={styles.recordStatLabel}>Wins</Text>
            </View>
            <View style={styles.recordDivider} />
            <View style={styles.recordStat}>
              <Text style={[styles.recordValue, { color: Colors.dark.error }]}>{card.arenaLosses}</Text>
              <Text style={styles.recordStatLabel}>Losses</Text>
            </View>
            <View style={styles.recordDivider} />
            <View style={styles.recordStat}>
              <Text style={[styles.recordValue, { color: Colors.dark.primary }]}>{card.arenaMmr}</Text>
              <Text style={styles.recordStatLabel}>MMR</Text>
            </View>
          </View>
        </View>
      )}

      {/* Share button */}
      <Pressable style={styles.shareButton} onPress={handleShare}>
        <Feather name="share-2" size={15} color="#000" />
        <Text style={styles.shareButtonText}>Share My Card</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  noCardBox: {
    width: 320,
    height: 448,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  noCardText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  tierMarker: {
    fontSize: 22,
    color: Colors.dark.primary,
  },
  tierLabel: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  statsCard: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    gap: 12,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  fullStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fullStatLeft: {
    width: 90,
  },
  fullStatLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  fullStatDesc: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  fullStatRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fullStatBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  fullStatBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  fullStatValue: {
    fontSize: 14,
    fontWeight: "800",
    width: 28,
    textAlign: "right",
  },
  timeline: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  timelineConnector: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  timelineDotWrap: {
    alignItems: "center",
    gap: 4,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  timelineDotLabel: {
    fontWeight: "700",
  },
  recordCard: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  recordRow: {
    flexDirection: "row",
    marginTop: Spacing.md,
  },
  recordStat: {
    flex: 1,
    alignItems: "center",
  },
  recordValue: {
    fontSize: 26,
    fontWeight: "800",
  },
  recordStatLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  recordDivider: {
    width: 1,
    backgroundColor: Colors.dark.divider,
    marginVertical: 4,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: Spacing.xl,
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
});
