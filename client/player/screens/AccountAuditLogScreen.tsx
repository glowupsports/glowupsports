import React, { useMemo } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRoute, useNavigation, type RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, FontSizes, BorderRadius } from "@/constants/theme";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

type AuditEntry = {
  id: string;
  playerId: string;
  actorPlayerId: string | null;
  actorName: string | null;
  action: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

type AuditResponse = {
  entries: AuditEntry[];
  windowDays: number;
};

const ACTION_LABEL: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string; tint: string }> = {
  login: { icon: "log-in-outline", label: "Logged in", tint: "#2ECC40" },
  profile_switch_in: { icon: "swap-horizontal", label: "Profile switched into", tint: "#00BCD4" },
  pin_change: { icon: "key-outline", label: "PIN changed", tint: "#FF851B" },
  pin_recover: { icon: "mail-open-outline", label: "PIN recovered via email", tint: "#FF851B" },
  account_locked: { icon: "lock-closed", label: "Account locked", tint: "#FF4136" },
  account_unlocked: { icon: "lock-open", label: "Account unlocked", tint: "#2ECC40" },
  account_auto_unlocked: { icon: "time-outline", label: "Lock expired", tint: "#9E9E9E" },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today ${t}`;
  if (isYesterday) return `Yesterday ${t}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${t}`;
}

function describeMetadata(action: string, metadata: Record<string, unknown>): string | null {
  if (action === "login") {
    const method = (metadata?.method as string) ?? "password";
    return method === "apple" ? "via Apple sign-in" : "via password";
  }
  if (action === "profile_switch_in") {
    const fromName = (metadata?.fromName as string) ?? null;
    const usedGrace = Boolean(metadata?.usedGrace);
    const requiredPin = Boolean(metadata?.requiredPin);
    const parts: string[] = [];
    if (fromName) parts.push(`from ${fromName}`);
    if (requiredPin) parts.push("PIN entered");
    else if (usedGrace) parts.push("grace window");
    return parts.length ? parts.join(" · ") : null;
  }
  if (action === "pin_change") {
    return metadata?.firstTime ? "first PIN set" : "PIN updated";
  }
  if (action === "account_locked") {
    const until = metadata?.lockedUntil as string | undefined;
    const reason = metadata?.reason as string | undefined;
    const parts: string[] = [];
    if (reason) parts.push(reason);
    if (until) parts.push(`until ${new Date(until).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`);
    return parts.length ? parts.join(" · ") : null;
  }
  if (action === "account_unlocked") {
    return metadata?.byTarget ? "unlocked from this account" : "unlocked by family member";
  }
  return null;
}

export default function AccountAuditLogScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PlayerStackParamList, "AccountAuditLog">>();
  const playerId = route.params?.playerId;
  const playerName = route.params?.playerName ?? "this account";

  const query = useQuery<AuditResponse>({
    queryKey: ["/api/account/audit-log", playerId],
    queryFn: async () => {
      const { apiRequest } = await import("@/lib/query-client");
      const res = await apiRequest(
        "GET",
        playerId ? `/api/account/audit-log?playerId=${encodeURIComponent(playerId)}` : "/api/account/audit-log",
      );
      return res.json();
    },
  });

  const entries = useMemo(() => query.data?.entries ?? [], [query.data]);

  return (
    <View style={[styles.container, { paddingTop: headerHeight + Spacing.md }]}>
      <View style={styles.subtitleWrap}>
        <Text style={styles.subtitle}>
          Last {query.data?.windowDays ?? 90} days for {playerName}. Visible to every member of the family.
        </Text>
      </View>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.dark.primary} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>No activity in the last 90 days.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing.xl },
          ]}
          renderItem={({ item }) => {
            const meta = ACTION_LABEL[item.action] ?? {
              icon: "ellipse-outline" as keyof typeof Ionicons.glyphMap,
              label: item.action,
              tint: Colors.dark.textMuted,
            };
            const detail = describeMetadata(item.action, item.metadata);
            const actor =
              item.actorPlayerId && item.actorPlayerId !== item.playerId
                ? item.actorName ?? "Family member"
                : null;
            return (
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: `${meta.tint}22` }]}>
                  <Ionicons name={meta.icon} size={20} color={meta.tint} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{meta.label}</Text>
                  {actor ? <Text style={styles.rowSub}>by {actor}</Text> : null}
                  {detail ? <Text style={styles.rowSub}>{detail}</Text> : null}
                  <Text style={styles.rowTime}>{formatTime(item.occurredAt)}</Text>
                </View>
              </View>
            );
          }}
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  subtitleWrap: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  subtitle: { color: Colors.dark.textMuted, fontSize: FontSizes.sm, lineHeight: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  emptyText: { color: Colors.dark.textMuted, marginTop: Spacing.md },
  listContent: { paddingHorizontal: Spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  rowBody: { flex: 1 },
  rowTitle: { color: Colors.dark.text, fontSize: FontSizes.md, fontWeight: "600" },
  rowSub: { color: Colors.dark.textMuted, fontSize: FontSizes.sm, marginTop: 2 },
  rowTime: { color: Colors.dark.textMuted, fontSize: FontSizes.xs, marginTop: 4 },
});
