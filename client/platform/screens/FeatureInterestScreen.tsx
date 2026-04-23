// Task #1097 — Platform owner drill-down for "Notify me" interest signals.
// Today the only feature_key is "online_card_payments"; the screen is built
// to work for any future coming-soon teaser captured in `feature_interest`.

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";

const PLATFORM_COLOR = "#9B59B6";

const FEATURE_LABELS: Record<string, string> = {
  online_card_payments: "Online card payments",
};

interface InterestRow {
  id: string;
  featureKey: string;
  createdAt: string;
  playerId: string;
  playerName: string;
  academyId: string | null;
  academyName: string;
}

interface ListResponse {
  items: InterestRow[];
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function FeatureInterestScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [featureKey, setFeatureKey] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const queryKey = useMemo(
    () => ["/api/platform/feature-interest", featureKey ?? "all"],
    [featureKey],
  );

  const { data, isLoading, refetch } = useQuery<ListResponse>({
    queryKey,
    queryFn: async () => {
      const url = new URL("/api/platform/feature-interest", getApiUrl());
      if (featureKey) url.searchParams.set("featureKey", featureKey);
      const res = await fetch(url.toString(), {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load feature interest");
      return res.json();
    },
    staleTime: 30_000,
  });

  const items = data?.items ?? [];

  const availableKeys = useMemo(() => {
    const keys = new Set<string>(["online_card_payments"]);
    for (const it of items) keys.add(it.featureKey);
    return Array.from(keys);
  }, [items]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExportStatus(null);
    try {
      const url = new URL("/api/platform/feature-interest", getApiUrl());
      url.searchParams.set("format", "csv");
      if (featureKey) url.searchParams.set("featureKey", featureKey);
      const res = await fetch(url.toString(), {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Export failed");
      const csv = await res.text();

      if (Platform.OS === "web") {
        try {
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = objectUrl;
          a.download = "feature-interest.csv";
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(objectUrl);
          setExportStatus("Downloaded feature-interest.csv");
        } catch {
          await Clipboard.setStringAsync(csv);
          setExportStatus("Copied CSV to clipboard");
        }
      } else {
        await Clipboard.setStringAsync(csv);
        setExportStatus(`Copied ${items.length} rows to clipboard`);
      }
    } catch (e) {
      setExportStatus("Export failed");
    }
  };

  const filterChips: { key: string | null; label: string }[] = [
    { key: null, label: "All features" },
    ...availableKeys.map((k) => ({
      key: k,
      label: FEATURE_LABELS[k] ?? k,
    })),
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Coming-soon Interest</Text>
        <Pressable
          style={styles.exportButton}
          onPress={handleExport}
          hitSlop={8}
        >
          <Ionicons name="download-outline" size={20} color={PLATFORM_COLOR} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filtersContainer}
      >
        {filterChips.map((chip) => {
          const active = featureKey === chip.key;
          return (
            <Pressable
              key={chip.key ?? "__all"}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFeatureKey(chip.key);
              }}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {exportStatus ? (
        <View style={styles.exportBanner}>
          <Ionicons
            name="checkmark-circle"
            size={14}
            color={PLATFORM_COLOR}
          />
          <Text style={styles.exportBannerText}>{exportStatus}</Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PLATFORM_COLOR}
          />
        }
      >
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {isLoading
              ? "Loading…"
              : items.length === 1
                ? "1 interested player"
                : `${items.length} interested players`}
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={PLATFORM_COLOR} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="notifications-off-outline"
              size={48}
              color={Colors.dark.textMuted}
            />
            <Text style={styles.emptyText}>No interest recorded yet</Text>
            <Text style={styles.emptySubText}>
              Players who tap "Notify me" on a coming-soon feature will show up
              here.
            </Text>
          </View>
        ) : (
          items.map((row) => (
            <View key={row.id} style={styles.rowCard}>
              <View style={styles.rowHeader}>
                <View style={styles.rowIcon}>
                  <Ionicons
                    name="card"
                    size={16}
                    color={PLATFORM_COLOR}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {row.playerName || "Unknown player"}
                  </Text>
                  <Text style={styles.rowAcademy} numberOfLines={1}>
                    {row.academyName || "No academy"}
                  </Text>
                </View>
                <Text style={styles.rowTime}>
                  {formatTimestamp(row.createdAt)}
                </Text>
              </View>
              <Text style={styles.rowFeature}>
                {FEATURE_LABELS[row.featureKey] ?? row.featureKey}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  topBarTitle: {
    ...Typography.h2,
    color: PLATFORM_COLOR,
    flex: 1,
    textAlign: "center",
  },
  exportButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: `${PLATFORM_COLOR}20`,
  },
  filtersScroll: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    maxHeight: 40,
  },
  filtersContainer: {
    gap: Spacing.sm,
  },
  filterChip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterChipActive: {
    backgroundColor: `${PLATFORM_COLOR}25`,
    borderColor: PLATFORM_COLOR,
  },
  filterChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  filterChipTextActive: {
    color: PLATFORM_COLOR,
    fontWeight: "600",
  },
  exportBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: `${PLATFORM_COLOR}15`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${PLATFORM_COLOR}33`,
  },
  exportBannerText: {
    ...Typography.small,
    color: PLATFORM_COLOR,
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingTop: 0,
    gap: Spacing.sm,
  },
  summaryRow: {
    paddingVertical: Spacing.sm,
  },
  summaryText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  loadingContainer: {
    paddingVertical: Spacing["2xl"],
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptySubText: {
    ...Typography.small,
    color: Colors.dark.textSubtle,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  rowCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${PLATFORM_COLOR}18`,
    justifyContent: "center",
    alignItems: "center",
  },
  rowName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    fontSize: 14,
  },
  rowAcademy: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  rowTime: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  rowFeature: {
    ...Typography.small,
    color: Colors.dark.textSubtle,
    fontSize: 11,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
});
