import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { SuccessToast } from "@/components/SuccessToast";

const FEATURE_INTEREST_QUERY_KEY = ["/api/players/me/feature-interest"] as const;

type Variant = "row" | "banner";

interface Props {
  /** Stable feature key, e.g. "online_card_payments". */
  featureKey: string;
  /**
   * Visual style:
   *   - "row" — disabled radio-style row used inside the booking wizard's
   *             payment-method picker and on the credit packages screen.
   *   - "banner" — single-line banner used at the top of the player Payments tab.
   */
  variant?: Variant;
  /** Optional override copy. Defaults to the EN/NL "online card" strings. */
  title?: string;
  subtitle?: string;
}

/**
 * Reusable "Coming soon" teaser used in three places (booking wizard Confirm
 * step, player Payments tab, optional credit packages screen). Renders a
 * disabled row with a "Notify me" link that, on tap, records the player's
 * interest server-side and hides the link afterwards.
 *
 * The interest list is shared via React Query so the link automatically
 * disappears on every surface once the player has tapped Notify-me anywhere.
 */
export function ComingSoonPaymentRow({
  featureKey,
  variant = "row",
  title,
  subtitle,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [toastVisible, setToastVisible] = useState(false);

  const { data, isLoading } = useQuery<{ featureKeys: string[] }>({
    queryKey: FEATURE_INTEREST_QUERY_KEY,
    staleTime: 5 * 60_000,
  });

  const alreadyNotified = useMemo(
    () => (data?.featureKeys ?? []).includes(featureKey),
    [data, featureKey],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/players/me/feature-interest", {
        featureKey,
      });
      return res.json();
    },
    onSuccess: () => {
      // Optimistically add the feature_key so every surface hides instantly.
      queryClient.setQueryData<{ featureKeys: string[] }>(
        FEATURE_INTEREST_QUERY_KEY,
        (prev) => ({
          featureKeys: Array.from(
            new Set([...(prev?.featureKeys ?? []), featureKey]),
          ),
        }),
      );
      setToastVisible(true);
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    },
  });

  const onNotifyPress = useCallback(() => {
    if (mutation.isPending || alreadyNotified) return;
    mutation.mutate();
  }, [alreadyNotified, mutation]);

  // While we don't yet know whether the player tapped, render nothing for the
  // banner (avoids a flash of "Coming soon" then "Recorded"). For the row
  // variant we still render the disabled row so the picker height stays stable.
  if (variant === "banner" && (isLoading || alreadyNotified)) {
    return null;
  }

  const titleText =
    title ?? t("comingSoon.onlineCard.title", "Pay online with card");
  const comingSoonText = t("comingSoon.label", "Coming soon");
  const notifyText = mutation.isPending
    ? t("comingSoon.savingNotify", "Saving…")
    : t("comingSoon.notifyMe", "Notify me");
  const subtitleText =
    subtitle ?? t("comingSoon.onlineCard.subtitle", "Credit / debit card");

  if (variant === "banner") {
    return (
      <View style={styles.bannerWrap}>
        <View style={styles.bannerInner}>
          <Feather name="credit-card" size={16} color={Colors.dark.primary} />
          <Text style={styles.bannerText} numberOfLines={2}>
            {t(
              "comingSoon.onlineCard.bannerText",
              "Online card payments coming soon.",
            )}
          </Text>
          <Pressable
            onPress={onNotifyPress}
            disabled={mutation.isPending}
            hitSlop={8}
            style={styles.bannerLinkPressable}
          >
            <Text style={styles.bannerLink}>{notifyText} →</Text>
          </Pressable>
        </View>
        <SuccessToast
          visible={toastVisible}
          message={t(
            "comingSoon.onlineCard.toast",
            "We'll let you know — thanks!",
          )}
          onHide={() => setToastVisible(false)}
        />
      </View>
    );
  }

  // "row" variant
  return (
    <View style={styles.row}>
      <View style={styles.radioOuterDisabled}>
        <View style={styles.radioInnerDisabled} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{titleText}</Text>
          <View style={styles.comingSoonPill}>
            <Text style={styles.comingSoonPillText}>{comingSoonText}</Text>
          </View>
        </View>
        <Text style={styles.rowSubtitle}>{subtitleText}</Text>
      </View>
      {!alreadyNotified ? (
        <Pressable
          onPress={onNotifyPress}
          disabled={mutation.isPending}
          hitSlop={8}
          style={styles.notifyPressable}
        >
          {mutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.dark.primary} />
          ) : (
            <Text style={styles.notifyLink}>{notifyText}</Text>
          )}
        </Pressable>
      ) : null}
      <SuccessToast
        visible={toastVisible}
        message={t(
          "comingSoon.onlineCard.toast",
          "We'll let you know — thanks!",
        )}
        onHide={() => setToastVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    opacity: 0.85,
  },
  radioOuterDisabled: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.dark.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInnerDisabled: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "transparent",
  },
  rowBody: {
    flex: 1,
  },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  comingSoonPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  comingSoonPillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: Colors.dark.textMuted,
    textTransform: "uppercase" as const,
  },
  rowSubtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  notifyPressable: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  notifyLink: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  bannerWrap: {
    marginBottom: Spacing.md,
  },
  bannerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.text,
  },
  bannerLinkPressable: {
    paddingVertical: 2,
  },
  bannerLink: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
});
