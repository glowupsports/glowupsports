// Task #1271 — Player card used by the new Match Finder home.
// Tinder-style large card surfacing photo, level, academy/city, last-active,
// match-fit score + "why we suggested" chip, and three action buttons:
// Challenge / Invite to my open match / View profile.
//
// Pure presentational component — its actions are wired by the parent.

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, FontSizes } from "@/constants/theme";
import { buildPhotoUrl } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

export interface MatchCandidate {
  id: string;
  name: string | null;
  profilePhotoUrl: string | null;
  ballLevel: string | null;
  skillLevel: number | null;
  glowMmr: number | null;
  city: string | null;
  country: string | null;
  academyId: string | null;
  lastActiveAt: string | null;
  matchFitScore?: number | null;
  whyChip?: string | null;
}

interface Props {
  player: MatchCandidate;
  academyName?: string | null;
  hasOpenMatch?: boolean;
  onChallenge: (p: MatchCandidate) => void;
  onInviteToOpenMatch?: (p: MatchCandidate) => void;
  onViewProfile: (p: MatchCandidate) => void;
}

function getBallColor(ball: string | null): string {
  switch ((ball || "").toLowerCase()) {
    case "green":
      return "#2ECC40";
    case "yellow":
      return "#FFDC00";
    case "orange":
      return "#FF851B";
    case "red":
      return "#FF4136";
    case "glow":
      return Colors.dark.primary;
    default:
      return Colors.dark.textMuted;
  }
}

function formatLastActive(iso: string | null): string {
  if (!iso) return "New player";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "New player";
  const min = Math.floor(ms / 60_000);
  if (min < 5) return "Active now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function PlayerMatchCard({
  player,
  academyName,
  hasOpenMatch,
  onChallenge,
  onInviteToOpenMatch,
  onViewProfile,
}: Props) {
  const photo = buildPhotoUrl(player.profilePhotoUrl);
  const ballColor = getBallColor(player.ballLevel);
  const lastActive = formatLastActive(player.lastActiveAt);
  const fit = typeof player.matchFitScore === "number" ? player.matchFitScore : null;

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.headerArea}
        onPress={() => {
          Haptics.selectionAsync();
          onViewProfile(player);
        }}
      >
        <View style={styles.avatarWrap}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons
                name="person"
                size={42}
                color={Colors.dark.textMuted}
              />
            </View>
          )}
          {fit !== null ? (
            <View style={styles.fitBadge}>
              <Text style={styles.fitBadgeText}>{fit}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.identityCol}>
          <Text style={styles.name} numberOfLines={1}>
            {player.name || "Player"}
          </Text>
          <View style={styles.metaRow}>
            {player.ballLevel ? (
              <View
                style={[
                  styles.ballChip,
                  {
                    backgroundColor: ballColor + "1F",
                    borderColor: ballColor + "55",
                  },
                ]}
              >
                <Ionicons name="tennisball" size={10} color={ballColor} />
                <Text style={[styles.ballChipText, { color: ballColor }]}>
                  {String(player.ballLevel).toUpperCase()}
                </Text>
              </View>
            ) : null}
            {typeof player.glowMmr === "number" ? (
              <View style={styles.mmrChip}>
                <Ionicons name="flash" size={10} color={Colors.dark.primary} />
                <Text style={styles.mmrChipText}>{player.glowMmr}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.locationLine} numberOfLines={1}>
            {[academyName, player.city || player.country].filter(Boolean).join(" · ") ||
              "Glow Up Sports"}
          </Text>
          <Text style={styles.activeLine}>{lastActive}</Text>
        </View>
      </Pressable>

      {player.whyChip ? (
        <View style={styles.whyChip}>
          <Ionicons
            name="sparkles"
            size={11}
            color={Colors.dark.primary}
          />
          <Text style={styles.whyChipText} numberOfLines={1}>
            {player.whyChip}
          </Text>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onChallenge(player);
          }}
        >
          <Ionicons name="flame" size={16} color="#0B0D10" />
          <Text style={styles.btnPrimaryText}>Challenge</Text>
        </Pressable>
        {hasOpenMatch && onInviteToOpenMatch ? (
          <Pressable
            style={[styles.btn, styles.btnSecondary]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onInviteToOpenMatch(player);
            }}
          >
            <Ionicons
              name="paper-plane"
              size={14}
              color={Colors.dark.text}
            />
            <Text style={styles.btnSecondaryText}>Invite</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={() => {
            Haptics.selectionAsync();
            onViewProfile(player);
          }}
        >
          <Ionicons
            name="person"
            size={14}
            color={Colors.dark.textSecondary}
          />
          <Text style={styles.btnGhostText}>Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  headerArea: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  fitBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: Colors.dark.primary,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 30,
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundDefault,
  },
  fitBadgeText: {
    color: "#0B0D10",
    fontSize: FontSizes.xs,
    fontWeight: "800",
  },
  identityCol: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
  },
  name: {
    color: Colors.dark.text,
    fontSize: FontSizes.xl,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
    marginTop: 2,
  },
  ballChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  ballChipText: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  mmrChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary + "1F",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "55",
  },
  mmrChipText: {
    color: Colors.dark.primary,
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  locationLine: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  activeLine: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  whyChip: {
    marginTop: Spacing.md,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary + "12",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "33",
  },
  whyChipText: {
    color: Colors.dark.primary,
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
  },
  btnPrimary: {
    backgroundColor: Colors.dark.primary,
  },
  btnPrimaryText: {
    color: "#0B0D10",
    fontSize: FontSizes.sm,
    fontWeight: "700",
  },
  btnSecondary: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  btnSecondaryText: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  btnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  btnGhostText: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
});
