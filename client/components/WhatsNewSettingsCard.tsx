import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Switch } from "react-native";
import { useTranslation } from "react-i18next";
import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  Colors,
  Spacing,
  Typography,
  BorderRadius,
  GlowColors,
  Backgrounds,
} from "@/constants/theme";
import {
  getWhatsNewDisabled,
  setWhatsNewDisabled,
} from "@/hooks/useWhatsNew";
import { useAuth } from "@/coach/context/AuthContext";
import { WhatsNewLatestLauncher } from "@/components/WhatsNewModal";

/**
 * Drop-in settings section: toggle for "show on updates" + button to open
 * the latest "What's New" carousel on demand. Self-contained — owns its
 * own AsyncStorage state and modal visibility.
 *
 * Renders nothing visual on its own beyond a card-shaped section that
 * matches the existing settings-screen styling (Backgrounds.elevated card,
 * sectionTitle uppercase header, settingItem rows).
 */
export function WhatsNewSettingsCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [disabled, setDisabled] = useState<boolean>(false);
  const [showLatest, setShowLatest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWhatsNewDisabled(user?.id || null)
      .then((v) => {
        if (!cancelled) setDisabled(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleToggle = useCallback(
    async (next: boolean) => {
      // The toggle in settings represents "show on updates"; the storage flag
      // we keep is the inverse ("disabled"), so flip it.
      setDisabled(!next);
      try {
        await setWhatsNewDisabled(user?.id || null, !next);
      } catch {
        // best-effort
      }
    },
    [user?.id],
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {t("whatsNew.settings.sectionTitle")}
      </Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Feather name="bell" size={20} color={GlowColors.primary} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>
              {t("whatsNew.settings.autoShowLabel")}
            </Text>
            <Text style={styles.rowHelp}>
              {t("whatsNew.settings.autoShowHelp")}
            </Text>
          </View>
          <Switch
            value={!disabled}
            onValueChange={handleToggle}
            trackColor={{
              false: Backgrounds.surface,
              true: GlowColors.primary,
            }}
            thumbColor={Colors.dark.text}
            accessibilityRole="switch"
            accessibilityLabel={t("whatsNew.settings.autoShowLabel")}
          />
        </View>

        <View style={styles.divider} />

        <Pressable
          style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
          onPress={() => setShowLatest(true)}
          accessibilityRole="button"
          accessibilityLabel={t("whatsNew.settings.viewLatest")}
        >
          <View style={styles.iconWrap}>
            <Feather name="zap" size={20} color={GlowColors.primary} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>
              {t("whatsNew.settings.viewLatest")}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={Colors.dark.textMuted}
          />
        </Pressable>
      </View>

      <WhatsNewLatestLauncher
        visible={showLatest}
        onClose={() => setShowLatest(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  card: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  rowPressed: {
    backgroundColor: Backgrounds.surface,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GlowColors.shadow,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  rowHelp: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Backgrounds.surface,
    marginLeft: Spacing.md + 36 + Spacing.md,
  },
});
