import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

export type PlayStyleKey =
  | "baseline_warrior"
  | "net_ninja"
  | "serve_machine"
  | "all_court_ace"
  | "counter_puncher"
  | "tactical_mastermind";

export const PLAY_STYLE_META: Record<PlayStyleKey, { name: string; color: string; icon: IoniconsName; desc: string }> = {
  baseline_warrior:     { name: "Baseline Warrior",     color: "#39FF14", icon: "tennisball",  desc: "Strong & consistent from the back" },
  net_ninja:            { name: "Net Ninja",             color: "#00E5FF", icon: "flash",       desc: "Quick and deadly at the net" },
  serve_machine:        { name: "Serve Machine",         color: "#FF8C00", icon: "rocket",      desc: "Big serve is your greatest weapon" },
  all_court_ace:        { name: "All-Court Ace",         color: "#FFFFFF", icon: "star",        desc: "Adapt to any situation on court" },
  counter_puncher:      { name: "Counter-Puncher",       color: "#9B59B6", icon: "shield",      desc: "Patient, waiting for opponent errors" },
  tactical_mastermind:  { name: "Tactical Mastermind",   color: "#FFD700", icon: "bulb",        desc: "Smart placement wins you points" },
};

const HAND_LABELS: Record<string, { label: string; icon: IoniconsName }> = {
  right: { label: "Right-handed",  icon: "hand-right" },
  left:  { label: "Left-handed",   icon: "hand-left" },
};

const BACKHAND_LABELS: Record<string, string> = {
  single: "1H Backhand",
  double: "2H Backhand",
};

const FAVORITE_SHOT_LABELS: Record<string, { label: string; icon: IoniconsName }> = {
  forehand: { label: "Forehand",  icon: "arrow-forward" },
  backhand: { label: "Backhand",  icon: "arrow-back" },
  serve:    { label: "Serve",     icon: "arrow-up" },
  volley:   { label: "Volley",    icon: "flash" },
  dropshot: { label: "Drop Shot", icon: "arrow-down" },
};

export interface PlayerDNAData {
  playStyle?: string | null;
  dominantHand?: string | null;
  backhandType?: string | null;
  favoriteShot?: string | null;
  tennisIdol?: string | null;
  bio?: string | null;
}

interface Props {
  data: PlayerDNAData;
  isOwnProfile?: boolean;
  onEditPress?: () => void;
}

function DNARow({
  icon,
  iconColor,
  label,
  value,
  isOwnProfile,
  onEditPress,
}: {
  icon: IoniconsName;
  iconColor: string;
  label: string;
  value: string | null;
  isOwnProfile: boolean;
  onEditPress?: () => void;
}) {
  const isEmpty = !value;

  const handleEmptyPress = () => {
    if (isEmpty && isOwnProfile && onEditPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onEditPress();
    }
  };

  return (
    <Pressable
      style={styles.row}
      onPress={isEmpty ? handleEmptyPress : undefined}
      disabled={!isEmpty || !isOwnProfile}
    >
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={16} color={isEmpty ? Colors.dark.textMuted + "60" : iconColor} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      {isEmpty ? (
        <View style={styles.rowPlaceholderWrap}>
          <Text style={styles.rowPlaceholder}>
            {isOwnProfile ? "Tap to add" : "Not set"}
          </Text>
          {isOwnProfile ? (
            <Ionicons name="chevron-forward" size={12} color={Colors.dark.textMuted + "60"} />
          ) : null}
        </View>
      ) : (
        <Text style={styles.rowValue}>{value}</Text>
      )}
    </Pressable>
  );
}

export default function PlayerDNACard({ data, isOwnProfile = false, onEditPress }: Props) {
  const playStyleMeta = data.playStyle ? PLAY_STYLE_META[data.playStyle as PlayStyleKey] : null;
  const handInfo = data.dominantHand ? HAND_LABELS[data.dominantHand] : null;
  const backhandLabel = data.backhandType ? BACKHAND_LABELS[data.backhandType] ?? null : null;
  const shotInfo = data.favoriteShot ? FAVORITE_SHOT_LABELS[data.favoriteShot] : null;

  const hasAnyData = !!(
    data.playStyle || data.dominantHand || data.backhandType ||
    data.favoriteShot || data.tennisIdol || data.bio
  );

  const hasMissingFields =
    !data.dominantHand || !data.backhandType || !data.favoriteShot ||
    !data.tennisIdol || !data.playStyle;

  return (
    <View style={styles.card}>
      {/* Play Style banner */}
      {playStyleMeta ? (
        <View style={[styles.playStyleBanner, { borderColor: playStyleMeta.color + "40", backgroundColor: playStyleMeta.color + "12" }]}>
          <View style={[styles.playStyleIconCircle, { backgroundColor: playStyleMeta.color + "20" }]}>
            <Ionicons name={playStyleMeta.icon} size={22} color={playStyleMeta.color} />
          </View>
          <View style={styles.playStyleTextWrap}>
            <Text style={[styles.playStyleName, { color: playStyleMeta.color }]}>{playStyleMeta.name}</Text>
            <Text style={styles.playStyleDesc}>{playStyleMeta.desc}</Text>
          </View>
          {isOwnProfile && onEditPress ? (
            <Pressable
              style={styles.editBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onEditPress();
              }}
            >
              <Ionicons name="create-outline" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable
          style={[
            styles.playStyleEmptyBanner,
            isOwnProfile ? styles.playStyleEmptyBannerOwn : null,
          ]}
          onPress={
            isOwnProfile && onEditPress
              ? () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onEditPress();
                }
              : undefined
          }
          disabled={!isOwnProfile}
        >
          <Ionicons name="analytics-outline" size={18} color={Colors.dark.textMuted + "70"} />
          <Text style={styles.playStyleEmptyText}>
            {isOwnProfile ? "Choose your play style" : "No play style set"}
          </Text>
          {isOwnProfile ? (
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted + "60"} style={{ marginLeft: "auto" }} />
          ) : null}
        </Pressable>
      )}

      {/* Detail rows — always rendered */}
      <View style={styles.rows}>
        <DNARow
          icon={handInfo?.icon ?? "hand-right-outline"}
          iconColor={Colors.dark.primary}
          label="Dominant Hand"
          value={handInfo?.label ?? null}
          isOwnProfile={isOwnProfile}
          onEditPress={onEditPress}
        />
        <DNARow
          icon="tennisball-outline"
          iconColor={Colors.dark.primary}
          label="Backhand"
          value={backhandLabel}
          isOwnProfile={isOwnProfile}
          onEditPress={onEditPress}
        />
        <DNARow
          icon={shotInfo?.icon ?? "flash-outline"}
          iconColor="#FF8C00"
          label="Favourite Shot"
          value={shotInfo?.label ?? null}
          isOwnProfile={isOwnProfile}
          onEditPress={onEditPress}
        />
        <DNARow
          icon="star"
          iconColor="#FFD700"
          label="Tennis Idol"
          value={data.tennisIdol ?? null}
          isOwnProfile={isOwnProfile}
          onEditPress={onEditPress}
        />
      </View>

      {/* Bio */}
      {data.bio ? (
        <View style={styles.bioWrap}>
          <Text style={styles.bioText}>{data.bio}</Text>
        </View>
      ) : isOwnProfile && onEditPress ? (
        <Pressable
          style={styles.bioEmptyRow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onEditPress();
          }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={Colors.dark.textMuted + "60"} />
          <Text style={styles.bioEmptyText}>Add a short bio about yourself</Text>
        </Pressable>
      ) : null}

      {/* "Fill in missing fields" CTA — own profile only, when some fields are empty but not all */}
      {isOwnProfile && onEditPress && hasAnyData && hasMissingFields ? (
        <Pressable
          style={styles.ctaRow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onEditPress();
          }}
        >
          <Ionicons name="pencil-outline" size={13} color={Colors.dark.primary} />
          <Text style={styles.ctaText}>Fill in missing DNA fields</Text>
        </Pressable>
      ) : null}

      {/* Full empty-state CTA — own profile, no data at all */}
      {isOwnProfile && onEditPress && !hasAnyData ? (
        <Pressable
          style={styles.fullEmptyCta}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onEditPress();
          }}
        >
          <Ionicons name="add-circle" size={14} color={Colors.dark.primary} />
          <Text style={styles.fullEmptyCtaText}>Build Your DNA Profile</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  playStyleBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  playStyleIconCircle: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  playStyleTextWrap: {
    flex: 1,
  },
  playStyleName: {
    fontSize: 15,
    fontWeight: "700",
  },
  playStyleDesc: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  editBtn: {
    padding: 6,
  },
  playStyleEmptyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.dark.border,
  },
  playStyleEmptyBannerOwn: {
    borderColor: Colors.dark.primary + "40",
    backgroundColor: Colors.dark.primary + "08",
  },
  playStyleEmptyText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  rows: {
    gap: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border + "60",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rowLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  rowValue: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
    maxWidth: "55%",
    textAlign: "right",
  },
  rowPlaceholderWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  rowPlaceholder: {
    ...Typography.caption,
    color: Colors.dark.textMuted + "70",
    fontStyle: "italic",
  },
  bioWrap: {
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border + "60",
  },
  bioText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    lineHeight: 20,
  },
  bioEmptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border + "60",
  },
  bioEmptyText: {
    ...Typography.caption,
    color: Colors.dark.textMuted + "60",
    fontStyle: "italic",
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: Spacing.xs,
    alignSelf: "flex-start",
  },
  ctaText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  fullEmptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "60",
    backgroundColor: Colors.dark.primary + "12",
    alignSelf: "center",
    marginTop: Spacing.xs,
  },
  fullEmptyCtaText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "700",
  },
});
