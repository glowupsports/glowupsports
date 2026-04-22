import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";

import { ThemedText as Text } from "@/components/ThemedText";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface CoachReminder {
  id: string;
  body: string;
  createdAt: string;
  coachName: string;
  coachPhotoUrl: string | null;
}

interface SessionRemindersResponse {
  conversationId: string | null;
  seriesId: string | null;
  reminders: CoachReminder[];
}

const REMINDER_ACCENT = "#FFA94D";

function reminderTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function CoachRemindersCard({ sessionId }: { sessionId: string }) {
  const navigation = useNavigation<any>();
  const { data, isLoading } = useQuery<SessionRemindersResponse>({
    queryKey: [`/api/player/sessions/${sessionId}/reminders`],
    enabled: !!sessionId,
    refetchInterval: 60000,
  });

  if (isLoading || !data || data.reminders.length === 0) return null;

  const openChat = () => {
    if (!data.conversationId) return;
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate("PlayerBookingChat", { conversationId: data.conversationId });
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconBg}>
          <Ionicons name="notifications" size={16} color={REMINDER_ACCENT} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Recent reminders</Text>
          <Text style={styles.subtitle}>From your coach for this class</Text>
        </View>
        {data.conversationId ? (
          <Pressable
            onPress={openChat}
            style={styles.openChatBtn}
            hitSlop={8}
            accessibilityLabel="Open class chat"
          >
            <Text style={styles.openChatText}>Chat</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.primary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.list}>
        {data.reminders.map((r) => (
          <Pressable
            key={r.id}
            onPress={openChat}
            disabled={!data.conversationId}
            style={({ pressed }) => [
              styles.row,
              pressed && data.conversationId ? styles.rowPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Reminder from ${r.coachName}: ${r.body}`}
          >
            <Text style={styles.rowBody} numberOfLines={3}>{r.body}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="person-circle-outline" size={12} color={Colors.dark.textMuted} />
              <Text style={styles.metaText}>{r.coachName}</Text>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>{reminderTimeAgo(r.createdAt)}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  card: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: REMINDER_ACCENT,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 169, 77, 0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  openChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "55",
    backgroundColor: Colors.dark.primary + "12",
  },
  openChatText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  list: { gap: Spacing.sm },
  row: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
  },
  rowPressed: { opacity: 0.7 },
  rowBody: {
    ...Typography.small,
    color: Colors.dark.text,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.dark.textMuted,
    marginHorizontal: 2,
  },
}));
