import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

export type CourtBookingStatus = "academy_court" | "external_booked" | "external_pending";

export interface CourtBookingValue {
  status: CourtBookingStatus | null;
  note?: string;
  url?: string;
}

interface PickerProps {
  value: CourtBookingValue;
  onChange: (value: CourtBookingValue) => void;
  isAcademyCourt?: boolean;
  /**
   * When true, the chosen court does NOT belong to the academy's managed inventory
   * (e.g. a community court like Maple that requires Playtomic) and the picker
   * must always show the external_booked / external_pending options. Defaults to
   * false for backward compatibility.
   */
  requiresExternalBooking?: boolean;
}

export function CourtBookingPicker({
  value,
  onChange,
  isAcademyCourt = false,
  requiresExternalBooking = false,
}: PickerProps) {
  const setStatus = (status: CourtBookingStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange({ ...value, status });
  };

  const treatAsAcademyCourt = isAcademyCourt && !requiresExternalBooking;
  const externalOnly = requiresExternalBooking;

  const academyOption = {
    key: "academy_court" as CourtBookingStatus,
    icon: "school" as const,
    label: "Academy court — handled for you",
    desc: "Use the court selected from the academy",
    color: Colors.dark.primary,
  };
  const externalBookedOption = {
    key: "external_booked" as CourtBookingStatus,
    icon: "checkmark-circle" as const,
    label: "Yes, I've booked it",
    desc: "Add a note or confirmation link",
    color: Colors.dark.successNeon,
  };
  const externalPendingOption = {
    key: "external_pending" as CourtBookingStatus,
    icon: "time" as const,
    label: "Not yet — I'll book it",
    desc: "Optionally add a note for the other player",
    color: Colors.dark.gold,
  };

  const options: Array<{ key: CourtBookingStatus; icon: any; label: string; desc: string; color: string }> = treatAsAcademyCourt
    ? [academyOption]
    : externalOnly
      ? [externalBookedOption, externalPendingOption]
      : [academyOption, externalBookedOption, externalPendingOption];

  React.useEffect(() => {
    if (treatAsAcademyCourt && value.status !== "academy_court") {
      onChange({ ...value, status: "academy_court" });
    } else if (externalOnly && value.status === "academy_court") {
      onChange({ ...value, status: "external_pending" });
    } else if (externalOnly && value.status == null) {
      onChange({ ...value, status: "external_pending" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treatAsAcademyCourt, externalOnly]);

  return (
    <View style={styles.pickerContainer}>
      <View style={styles.questionRow}>
        <Ionicons name="help-circle-outline" size={20} color={Colors.dark.primary} />
        <Text style={styles.questionText}>Heb je de baan al geboekt?</Text>
      </View>

      <View style={styles.optionList}>
        {options.map((opt) => {
          const selected = value.status === opt.key;
          return (
            <Pressable
              key={opt.key}
              style={[styles.option, selected && { borderColor: opt.color, backgroundColor: opt.color + "15" }]}
              onPress={() => setStatus(opt.key)}
            >
              <Ionicons
                name={opt.icon}
                size={22}
                color={selected ? opt.color : Colors.dark.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, selected && { color: opt.color }]}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.desc}</Text>
              </View>
              {selected ? (
                <Ionicons name="checkmark" size={18} color={opt.color} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {value.status === "external_booked" || value.status === "external_pending" ? (
        <View style={styles.detailFields}>
          <Text style={styles.fieldLabel}>Note (optional)</Text>
          <TextInput
            style={styles.input}
            value={value.note || ""}
            onChangeText={(text) => onChange({ ...value, note: text })}
            placeholder={
              value.status === "external_booked"
                ? "e.g. Court 3 at TC Centraal, 18:00"
                : "e.g. Will book at TC Centraal tonight"
            }
            placeholderTextColor={Colors.dark.textMuted}
            multiline
          />
          {value.status === "external_booked" ? (
            <>
              <Text style={[styles.fieldLabel, { marginTop: Spacing.sm }]}>Booking link (optional)</Text>
              <TextInput
                style={styles.input}
                value={value.url || ""}
                onChangeText={(text) => onChange({ ...value, url: text })}
                placeholder="https://..."
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                keyboardType="url"
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

interface PanelProps {
  status?: CourtBookingStatus | string | null;
  note?: string | null;
  url?: string | null;
  compact?: boolean;
}

export function CourtBookingPanel({ status, note, url, compact = false }: PanelProps) {
  if (!status || status === "academy_court") return null;

  const isBooked = status === "external_booked";
  const color = isBooked ? Colors.dark.successNeon : Colors.dark.gold;
  const icon = isBooked ? "checkmark-circle" : "warning";
  const title = isBooked ? "Court is booked" : "Court not yet booked";

  const handleOpen = () => {
    if (!url) return;
    const target = url.startsWith("http") ? url : `https://${url}`;
    Linking.openURL(target).catch(() => {});
  };

  return (
    <View style={[styles.panel, { borderColor: color + "60", backgroundColor: color + "12" }, compact && styles.panelCompact]}>
      <View style={styles.panelHeader}>
        <Ionicons name={icon} size={compact ? 16 : 20} color={color} />
        <Text style={[styles.panelTitle, { color }]}>{title}</Text>
      </View>
      {note ? (
        <Text style={styles.panelNote} numberOfLines={compact ? 2 : undefined}>
          {note}
        </Text>
      ) : null}
      {url && isBooked ? (
        <Pressable onPress={handleOpen} style={styles.panelLinkRow}>
          <Ionicons name="link" size={14} color={Colors.dark.primary} />
          <Text style={styles.panelLink} numberOfLines={1}>
            {url}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pickerContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  questionText: {
    ...Typography.bodySmall,
    color: Colors.dark.text,
    fontWeight: "600",
    flex: 1,
  },
  optionList: {
    gap: Spacing.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  optionLabel: {
    ...Typography.bodySmall,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  optionDesc: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  detailFields: {
    marginTop: Spacing.md,
  },
  fieldLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? Spacing.sm : Spacing.xs,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minHeight: 40,
  },
  panel: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  panelCompact: {
    padding: Spacing.sm,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  panelTitle: {
    ...Typography.bodySmall,
    fontWeight: "700",
  },
  panelNote: {
    ...Typography.caption,
    color: Colors.dark.text,
  },
  panelLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  panelLink: {
    ...Typography.caption,
    color: Colors.dark.primary,
    textDecorationLine: "underline",
    flex: 1,
  },
});
