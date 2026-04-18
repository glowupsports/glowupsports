import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image as RNImage,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import {
  Spacing,
  BorderRadius,
  FontSizes,
  Typography,
  GlowColors,
  FunctionColors,
  Backgrounds,
  TextColors,
} from "@/constants/theme";
import { buildPhotoUrl } from "@/lib/query-client";
import {
  getSportLabel,
  getSportIcon,
  getSportColor,
} from "@/player/context/SportContext";

export const COMPETE_ACCENT = FunctionColors.info;

export interface MatchSummaryHost {
  id?: string;
  name?: string;
  photoUrl?: string | null;
  ballLevel?: string | null;
  skillLevel?: number;
}

export interface MatchSummaryCardProps {
  matchId: string;
  matchType: string;
  sport?: string;
  scheduledTime?: string | null;
  courtName?: string | null;
  locationName?: string | null;
  host?: MatchSummaryHost;
  ballLevel?: string | null;
  skillLevel?: number;
  currentPlayers: number;
  maxPlayers: number;
  costPerPlayer?: string | null;
  currency?: string;
  xpBonus?: number;
  levelMatch?: "exact" | "adjacent";
  levelDirection?: "higher" | "lower" | null;
  isHost?: boolean;

  // CTA wiring — card chooses Manage / Join / Full based on isHost + spotsLeft.
  onJoin?: () => void;
  onManage?: () => void;
  joining?: boolean;

  // Whole-card press (e.g. open detail). Distinct from CTA so taps on the
  // big primary button don't double-fire.
  onPress?: () => void;

  // Layout: when embedded inside LensShell (HeroCarousel), pass `embedded`
  // so we skip the outer card chrome and just render the body.
  embedded?: boolean;
  accent?: string;
}

function getBallLevelColor(level?: string | null): string {
  const l = (level || "").toLowerCase();
  if (l.includes("blue")) return "#3B82F6";
  if (l.includes("red")) return "#EF4444";
  if (l.includes("orange")) return "#F97316";
  if (l.includes("green")) return "#22C55E";
  if (l.includes("yellow")) return "#EAB308";
  if (l.includes("glow")) return "#E040FB";
  return GlowColors.primary;
}

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function isDoubles(matchType?: string): boolean {
  return (matchType || "").toLowerCase().includes("doubles");
}

function formatTimeLeft(target: Date): string {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "Now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Tomorrow";
  if (days < 7) return `in ${days}d`;
  const weeks = Math.floor(days / 7);
  return `in ${weeks}w`;
}

function formatWhen(target: Date | null): string {
  if (!target) return "Soon";
  return target.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Chip({
  color,
  icon,
  text,
  dot,
}: {
  color: string;
  icon?: any;
  text: string;
  dot?: boolean;
}) {
  return (
    <View
      style={[
        styles.chip,
        { borderColor: `${color}66`, backgroundColor: `${color}1F` },
      ]}
    >
      {dot ? (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
            marginRight: 4,
          }}
        />
      ) : icon ? (
        <Ionicons name={icon} size={10} color={color} />
      ) : null}
      <Text style={[styles.chipText, { color }]}>{text}</Text>
    </View>
  );
}

export function MatchSummaryCard(props: MatchSummaryCardProps) {
  const {
    matchType,
    sport,
    scheduledTime,
    courtName,
    locationName,
    host,
    ballLevel: ballLevelProp,
    skillLevel: skillLevelProp,
    currentPlayers,
    maxPlayers,
    costPerPlayer,
    currency,
    xpBonus = 0,
    levelMatch,
    levelDirection,
    isHost = false,
    onJoin,
    onManage,
    joining = false,
    onPress,
    embedded = false,
    accent = COMPETE_ACCENT,
  } = props;

  const target = scheduledTime ? new Date(scheduledTime) : null;
  const validTarget = target && !Number.isNaN(target.getTime()) ? target : null;
  const spotsLeft = Math.max(0, (maxPlayers || 0) - (currentPlayers || 0));
  const isFull = spotsLeft === 0;

  const ballLevel = (host?.ballLevel || ballLevelProp || "").toString();
  const ballColor = getBallLevelColor(ballLevel);
  const skillLevel = skillLevelProp ?? host?.skillLevel;

  const photoUrl = host?.photoUrl ? buildPhotoUrl(host.photoUrl) : null;
  const hostName = host?.name || "A player";
  const sportKey = (sport || "tennis").toLowerCase();
  const sportColor = getSportColor(sportKey);

  const isAdjacent = levelMatch === "adjacent";
  const adjacentLabel =
    levelDirection === "higher"
      ? "Higher level"
      : levelDirection === "lower"
      ? "Lower level"
      : "Adjacent level";

  // CTA derivation — single source of truth.
  let ctaLabel = "Join Match";
  let ctaIcon: any = "arrow-forward";
  let ctaDisabled = false;
  let ctaHandler: (() => void) | undefined = onJoin;
  let ctaBg = accent;

  if (isHost) {
    ctaLabel = "Manage Match";
    ctaIcon = "settings-outline";
    ctaHandler = onManage;
    ctaBg = COMPETE_ACCENT;
  } else if (isFull) {
    ctaLabel = "Match full";
    ctaIcon = "close-circle";
    ctaDisabled = true;
    ctaBg = "rgba(255,255,255,0.1)";
  } else if (joining) {
    ctaLabel = "Joining...";
    ctaDisabled = true;
  }

  const handleCta = () => {
    if (ctaDisabled || !ctaHandler) return;
    Haptics.selectionAsync().catch(() => {});
    ctaHandler();
  };

  const body = (
    <>
      {/* Chip row — match type, time, ball level, sport, level-match hint */}
      <View style={styles.chipRow}>
        <Chip
          color={accent}
          icon={isDoubles(matchType) ? "people" : "person"}
          text={isDoubles(matchType) ? "DOUBLES" : "SINGLES"}
        />
        {validTarget ? (
          <Chip color={accent} icon="time-outline" text={formatTimeLeft(validTarget)} />
        ) : null}
        {ballLevel ? (
          <Chip color={ballColor} dot text={`${ballLevel.toUpperCase()}${skillLevel ? ` ${skillLevel}` : ""}`} />
        ) : null}
        {sportKey && sportKey !== "tennis" ? (
          <Chip
            color={sportColor}
            icon={getSportIcon(sportKey) as any}
            text={getSportLabel(sportKey).toUpperCase()}
          />
        ) : null}
        {xpBonus > 0 ? <Chip color={accent} icon="flash" text={`+${xpBonus} XP`} /> : null}
        {isAdjacent ? (
          <View
            style={[
              styles.chip,
              {
                borderColor: "rgba(255,255,255,0.25)",
                backgroundColor: "rgba(255,255,255,0.08)",
              },
            ]}
          >
            <Ionicons name="swap-vertical" size={10} color={TextColors.secondary} />
            <Text style={[styles.chipText, { color: TextColors.secondary }]}>
              {adjacentLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Host row */}
      <View style={styles.hostRow}>
        <View style={[styles.avatarRing, { borderColor: ballColor }]}>
          {photoUrl ? (
            <RNImage source={{ uri: photoUrl }} style={styles.avatarImage} />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                { backgroundColor: `${ballColor}33` },
              ]}
            >
              <Text style={[styles.avatarInitials, { color: ballColor }]}>
                {getInitials(hostName)}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {isHost ? "Your open match" : `${hostName} is looking for a match`}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {formatWhen(validTarget)}
            {courtName || locationName ? ` · ${courtName || locationName}` : ""}
            {spotsLeft > 0
              ? ` · ${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`
              : " · Full"}
            {costPerPlayer && parseFloat(costPerPlayer) > 0
              ? ` · ${currency || ""} ${costPerPlayer}`
              : ""}
          </Text>
        </View>
      </View>

      {/* CTA */}
      <Pressable
        style={[
          styles.cta,
          { backgroundColor: ctaBg, opacity: ctaDisabled ? 0.6 : 1 },
        ]}
        disabled={ctaDisabled || !ctaHandler}
        onPress={handleCta}
      >
        {joining ? (
          <ActivityIndicator size="small" color={Backgrounds.root} />
        ) : (
          <>
            <Text style={styles.ctaText}>{ctaLabel}</Text>
            <Ionicons name={ctaIcon} size={14} color={Backgrounds.root} />
          </>
        )}
      </Pressable>
    </>
  );

  if (embedded) {
    // Inside HeroCarousel LensShell — no extra chrome.
    return <View style={styles.embeddedBody}>{body}</View>;
  }

  // Standalone card (OpenMatchesRow, OpenMatchFeedScreen) — wrap in surface.
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={[styles.cardOuter, { borderColor: `${accent}40` }]}
    >
      <LinearGradient
        colors={[`${accent}14`, "rgba(17,20,26,0.0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardInner}
      >
        {body}
      </LinearGradient>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    backgroundColor: Backgrounds.card,
    overflow: "hidden",
  },
  cardInner: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  embeddedBody: {
    gap: Spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  hostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 2,
  },
  avatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: TextColors.primary,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: TextColors.secondary,
    lineHeight: 18,
    marginTop: 2,
  },
  cta: {
    marginTop: Spacing.sm,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
  },
  ctaText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Backgrounds.root,
  },
});
