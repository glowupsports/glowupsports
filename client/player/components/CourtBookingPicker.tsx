import React from "react";
import { View, Text, Pressable, TextInput, StyleSheet, Linking, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Colors, Spacing, BorderRadius, FontSizes, ProTennisColors, TextColors } from "@/constants/theme";

export type CourtBookingStatus =
  | "academy_court"
  | "external_booked"
  | "external_pending";

interface PickerProps {
  isAcademyCourt: boolean;
  status: CourtBookingStatus | null;
  note: string;
  url: string;
  onStatusChange: (status: CourtBookingStatus) => void;
  onNoteChange: (note: string) => void;
  onUrlChange: (url: string) => void;
}

export function CourtBookingPicker({
  isAcademyCourt,
  status,
  note,
  url,
  onStatusChange,
  onNoteChange,
  onUrlChange,
}: PickerProps) {
  const { t } = useTranslation();

  const effectiveStatus: CourtBookingStatus = isAcademyCourt
    ? "academy_court"
    : status ?? "external_pending";

  React.useEffect(() => {
    if (isAcademyCourt && status !== "academy_court") {
      onStatusChange("academy_court");
    }
  }, [isAcademyCourt]);

  const renderOption = (
    value: CourtBookingStatus,
    label: string,
    hint: string,
    icon: keyof typeof Feather.glyphMap,
    color: string,
    disabled = false,
  ) => {
    const selected = effectiveStatus === value;
    return (
      <Pressable
        key={value}
        onPress={() => !disabled && onStatusChange(value)}
        disabled={disabled}
        style={[
          styles.option,
          selected && { borderColor: color, borderWidth: 2 },
          disabled && { opacity: 0.5 },
        ]}
      >
        <View style={[styles.optionIcon, { backgroundColor: color + "22" }]}>
          <Feather name={icon} size={18} color={color} />
        </View>
        <View style={styles.optionTextWrap}>
          <Text style={styles.optionLabel}>{label}</Text>
          <Text style={styles.optionHint}>{hint}</Text>
        </View>
        {selected ? (
          <Feather name="check-circle" size={18} color={color} />
        ) : (
          <View style={styles.optionRadio} />
        )}
      </Pressable>
    );
  };

  const showNoteAndUrl =
    effectiveStatus === "external_booked" || effectiveStatus === "external_pending";

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>
        {t("player.booking.courtBooking.stepSubtitle")}
      </Text>

      <View style={styles.optionsList}>
        {isAcademyCourt
          ? renderOption(
              "academy_court",
              t("player.booking.courtBooking.academyCourt"),
              t("player.booking.courtBooking.academyCourtHint"),
              "home",
              Colors.dark.primary,
            )
          : (
            <>
              {renderOption(
                "external_booked",
                t("player.booking.courtBooking.externalBooked"),
                t("player.booking.courtBooking.externalBookedHint"),
                "check-circle",
                ProTennisColors.success,
              )}
              {renderOption(
                "external_pending",
                t("player.booking.courtBooking.externalPending"),
                t("player.booking.courtBooking.externalPendingHint"),
                "clock",
                ProTennisColors.warning,
              )}
            </>
          )}
      </View>

      {showNoteAndUrl ? (
        <View style={styles.inputs}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              {t("player.booking.courtBooking.noteLabel")}
            </Text>
            <TextInput
              value={note}
              onChangeText={onNoteChange}
              placeholder={t("player.booking.courtBooking.notePlaceholder")}
              placeholderTextColor={TextColors.muted}
              style={styles.input}
              multiline
              numberOfLines={2}
              maxLength={500}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              {t("player.booking.courtBooking.urlLabel")}
            </Text>
            <TextInput
              value={url}
              onChangeText={onUrlChange}
              placeholder={t("player.booking.courtBooking.urlPlaceholder")}
              placeholderTextColor={TextColors.muted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              maxLength={500}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

interface PanelProps {
  status: CourtBookingStatus | string | null | undefined;
  note?: string | null;
  url?: string | null;
}

export function CourtBookingPanel({ status, note, url }: PanelProps) {
  const { t } = useTranslation();
  if (!status) return null;

  let label = "";
  let icon: keyof typeof Feather.glyphMap = "home";
  let color = Colors.dark.primary;

  if (status === "academy_court") {
    label = t("player.booking.courtBooking.panelStatusAcademy");
    icon = "home";
    color = Colors.dark.primary;
  } else if (status === "external_booked") {
    label = t("player.booking.courtBooking.panelStatusBooked");
    icon = "check-circle";
    color = ProTennisColors.success;
  } else if (status === "external_pending") {
    label = t("player.booking.courtBooking.panelStatusPending");
    icon = "clock";
    color = ProTennisColors.warning;
  } else {
    return null;
  }

  const handleOpenUrl = () => {
    if (!url) return;
    const target = url.startsWith("http") ? url : `https://${url}`;
    Linking.openURL(target).catch(() => {});
  };

  return (
    <View style={[panelStyles.panel, { borderLeftColor: color }]}>
      <View style={panelStyles.headerRow}>
        <Feather name={icon} size={14} color={color} />
        <Text style={panelStyles.title}>
          {t("player.booking.courtBooking.panelTitle")}
        </Text>
      </View>
      <Text style={[panelStyles.statusText, { color }]}>{label}</Text>
      {note ? <Text style={panelStyles.note}>{note}</Text> : null}
      {url ? (
        <Pressable onPress={handleOpenUrl} style={panelStyles.linkRow} hitSlop={8}>
          <Feather name="external-link" size={12} color={Colors.dark.accentText} />
          <Text style={panelStyles.linkText} numberOfLines={1}>
            {t("player.booking.courtBooking.panelOpenLink")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: TextColors.secondary,
    marginBottom: Spacing.lg,
  },
  optionsList: {
    gap: Spacing.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTextWrap: {
    flex: 1,
  },
  optionLabel: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  optionHint: {
    fontSize: FontSizes.sm,
    color: TextColors.secondary,
    marginTop: 2,
  },
  optionRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Colors.dark.borderSubtle,
  },
  inputs: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  inputLabel: {
    fontSize: FontSizes.sm,
    color: TextColors.secondary,
    fontWeight: "500",
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    minHeight: 44,
    textAlignVertical: "top",
  },
});

const panelStyles = StyleSheet.create({
  panel: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: FontSizes.xs,
    color: TextColors.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  statusText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  note: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  linkText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.accentText,
    textDecorationLine: "underline",
  },
});
