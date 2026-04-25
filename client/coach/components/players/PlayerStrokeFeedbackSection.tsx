import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, GlowColors, Spacing, BorderRadius } from "@/constants/theme";
import { styles , strokeTimelineStyles } from "./playersStyles";

interface StrokeFeedbackEntry {
  id: string;
  sessionId: string;
  strokeFeedback: { stroke: string; rating: number; note?: string }[] | null;
  lessonIntensity: string | null;
  playerNote: string | null;
  overall: string;
  effort: number;
  createdAt: string;
}

interface Props {
  playerId: string;
}

export function PlayerStrokeFeedbackSection({ playerId }: Props) {
  const [expanded, setExpanded] = useState(false);

  const { data: strokeFeedbackData = [] } = useQuery<StrokeFeedbackEntry[]>({
    queryKey: [`/api/glow/players/${playerId}/stroke-feedback`],
  });

  if (strokeFeedbackData.length === 0) return null;

  return (
    <View style={styles.infoSection}>
      <Pressable
        style={styles.attendanceHistoryTitleRow}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded(v => !v);
        }}
      >
        <Ionicons name="tennisball-outline" size={18} color={GlowColors.primary} />
        <Text style={styles.sectionLabel}>VOORTGANG PER SLAG</Text>
        <View style={{ flex: 1 }} />
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={Colors.dark.tabIconDefault}
        />
      </Pressable>

      {expanded ? (
        <View style={{ marginTop: Spacing.md }}>
          {(() => {
            const strokeMap: Record<string, { date: string; rating: number; note?: string }[]> = {};
            for (const entry of strokeFeedbackData) {
              if (!entry.strokeFeedback) continue;
              for (const sf of entry.strokeFeedback) {
                if (!strokeMap[sf.stroke]) strokeMap[sf.stroke] = [];
                strokeMap[sf.stroke].push({ date: entry.createdAt, rating: sf.rating, note: sf.note });
              }
            }
            const strokes = Object.keys(strokeMap);
            if (strokes.length === 0) {
              return (
                <Text style={{ color: Colors.dark.textMuted, fontSize: 13, textAlign: "center", paddingVertical: Spacing.md }}>
                  Nog geen slag-feedback beschikbaar
                </Text>
              );
            }
            return strokes.map((strokeId) => {
              const strokeLabel = strokeId.charAt(0).toUpperCase() + strokeId.slice(1);
              const records = strokeMap[strokeId].slice(0, 6);
              const latest = records[0];
              const latestColor = latest.rating === 2 ? GlowColors.primary : latest.rating === 1 ? Colors.dark.orange : Colors.dark.error;
              const latestLabel = latest.rating === 2 ? "Goed" : latest.rating === 1 ? "In ontwikkeling" : "Aandachtspunt";
              const latestIcon: keyof typeof Ionicons.glyphMap = latest.rating === 2 ? "checkmark-circle" : latest.rating === 1 ? "ellipse-outline" : "alert-circle";
              return (
                <View key={strokeId} style={strokeTimelineStyles.strokeRow}>
                  <View style={strokeTimelineStyles.strokeHeader}>
                    <Text style={strokeTimelineStyles.strokeName}>{strokeLabel}</Text>
                    <View style={[strokeTimelineStyles.latestBadge, { borderColor: latestColor, backgroundColor: latestColor + "18" }]}>
                      <Ionicons name={latestIcon} size={12} color={latestColor} />
                      <Text style={[strokeTimelineStyles.latestBadgeText, { color: latestColor }]}>{latestLabel}</Text>
                    </View>
                  </View>
                  <View style={strokeTimelineStyles.miniTimeline}>
                    {records.slice(0).reverse().map((r, i) => {
                      const rColor = r.rating === 2 ? GlowColors.primary : r.rating === 1 ? Colors.dark.orange : Colors.dark.error;
                      return (
                        <View key={i} style={[strokeTimelineStyles.timelineDot, { backgroundColor: rColor }]} />
                      );
                    })}
                  </View>
                  {latest.note ? (
                    <Text style={strokeTimelineStyles.strokeNote}>{latest.note}</Text>
                  ) : null}
                </View>
              );
            });
          })()}

          {strokeFeedbackData[0]?.playerNote ? (
            <View style={strokeTimelineStyles.playerNoteCard}>
              <Ionicons name="chatbubble-outline" size={14} color={Colors.dark.xpCyan} />
              <Text style={strokeTimelineStyles.playerNoteText}>{strokeFeedbackData[0].playerNote}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
