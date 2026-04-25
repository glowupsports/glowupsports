import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Switch,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";

import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { apiRequest } from "@/lib/query-client";

interface RecapDraft {
  id: string;
  caption: string;
  sessionId: string | null;
  sessionStart: string | null;
  sessionType: string | null;
  createdAt: string;
}

interface ToggleResponse {
  enabled: boolean;
}

/**
 * Phase 3 — Lesson recap drafts queue.
 * Coaches who opted into auto-recap get a private draft per present player
 * after each completed session. This screen lets them review, edit caption,
 * and send the recap (private to the player + parents) or skip it.
 */
export default function LessonRecapDraftsScreen() {
  const navigation = useNavigation<any>();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const { data: drafts = [], isLoading, refetch, isRefetching } = useQuery<RecapDraft[]>({
    queryKey: ["/api/social/coach/recap-drafts"],
  });
  const { data: toggleData } = useQuery<ToggleResponse>({
    queryKey: ["/api/social/coach/lesson-recap-enabled"],
  });
  const enabled = !!toggleData?.enabled;

  const toggleMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await apiRequest("PATCH", "/api/social/coach/lesson-recap-enabled", {
        enabled: next,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/coach/lesson-recap-enabled"] });
    },
  });

  React.useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: "Lesson Recaps" });
  }, [navigation]);

  return (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={{ paddingTop: headerHeight + Spacing.md, paddingBottom: Spacing.xxl }}
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.primary} />}
    >
      <View style={styles.toggleCard}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.toggleTitle}>Auto-create recap drafts</ThemedText>
          <Text style={styles.toggleHint}>
            After every completed lesson, we&apos;ll create a private draft per present
            player. You can edit and send each one — or skip it.
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={(next) => toggleMutation.mutate(next)}
          trackColor={{ true: Colors.dark.primary, false: Colors.dark.backgroundSecondary }}
        />
      </View>

      <ThemedText style={styles.sectionLabel}>Pending drafts</ThemedText>

      {isLoading ? (
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: Spacing.xl }} />
      ) : drafts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="clipboard-outline" size={36} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>No recap drafts yet.</Text>
          <Text style={styles.emptySubtle}>
            Drafts appear here after you complete a lesson.
          </Text>
        </View>
      ) : (
        drafts.map((d) => <DraftRow key={d.id} draft={d} />)
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

function DraftRow({ draft }: { draft: RecapDraft }) {
  const queryClient = useQueryClient();
  const [caption, setCaption] = useState(draft.caption || "");
  const [busy, setBusy] = useState(false);

  async function handleSend() {
    try {
      setBusy(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await apiRequest("POST", `/api/social/coach/recap-drafts/${draft.id}/send`, {
        caption: caption.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/social/coach/recap-drafts"] });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Send failed", String((err && err.message) || "Try again."));
    } finally {
      setBusy(false);
    }
  }

  function handleSkip() {
    Alert.alert("Skip recap?", "This draft will be deleted and not sent.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Skip",
        style: "destructive",
        onPress: async () => {
          try {
            setBusy(true);
            await apiRequest("DELETE", `/api/social/coach/recap-drafts/${draft.id}`);
            queryClient.invalidateQueries({ queryKey: ["/api/social/coach/recap-drafts"] });
          } catch (err: any) {
            Alert.alert("Skip failed", String((err && err.message) || "Try again."));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  const sessionLabel = draft.sessionStart
    ? new Date(draft.sessionStart).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <View style={styles.draftCard}>
      <View style={styles.draftHeader}>
        <Ionicons name="clipboard" size={14} color={"#9AE66E"} />
        <Text style={styles.draftHeaderText}>Lesson Recap</Text>
        {sessionLabel ? <Text style={styles.draftDate}>{sessionLabel}</Text> : null}
      </View>
      <TextInput
        value={caption}
        onChangeText={setCaption}
        placeholder="One highlight + one focus area for next time…"
        placeholderTextColor={Colors.dark.textMuted}
        multiline
        maxLength={280}
        style={styles.draftInput}
      />
      <Text style={styles.charCount}>{caption.length}/280</Text>
      <View style={styles.actionRow}>
        <Pressable disabled={busy} onPress={handleSkip} style={[styles.btn, styles.btnGhost]}>
          <Text style={styles.btnGhostText}>Skip</Text>
        </Pressable>
        <Pressable
          disabled={busy || !caption.trim()}
          onPress={handleSend}
          style={[styles.btn, styles.btnPrimary, (busy || !caption.trim()) && styles.btnDisabled]}
        >
          {busy ? (
            <ActivityIndicator color={Colors.dark.buttonText} size="small" />
          ) : (
            <Text style={styles.btnPrimaryText}>Send recap</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.lg,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  toggleHint: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptyCard: {
    alignItems: "center",
    padding: Spacing.xl,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    gap: 8,
  },
  emptyText: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "600",
  },
  emptySubtle: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
  draftCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  draftHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  draftHeaderText: {
    color: "#9AE66E",
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.4,
  },
  draftDate: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginLeft: "auto",
  },
  draftInput: {
    color: Colors.dark.text,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    textAlign: "right",
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  btnGhostText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  btnPrimary: {
    backgroundColor: Colors.dark.primary,
  },
  btnPrimaryText: {
    color: Colors.dark.buttonText,
    fontSize: 14,
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
