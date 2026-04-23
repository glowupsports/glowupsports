import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Backgrounds, Spacing, BorderRadius, FontSizes } from "@/constants/theme";

export type PaymentMethod = "credits" | "card" | "pay_later";

interface PaymentMethodPickerProps {
  selected: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  creditsAvailable: number;
  creditsRequired?: number;
  cardEnabled: boolean;
  cardPriceLabel?: string | null;
  onBuyCredits?: () => void;
}

export default function PaymentMethodPicker({
  selected,
  onChange,
  creditsAvailable,
  creditsRequired = 1,
  cardEnabled,
  cardPriceLabel,
  onBuyCredits,
}: PaymentMethodPickerProps) {
  const { t } = useTranslation();
  const hasEnoughCredits = creditsAvailable >= creditsRequired;

  const handleSelect = (m: PaymentMethod, disabled: boolean) => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(m);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>
        {t("booking.payment.howToPay", "How would you like to pay?")}
      </Text>

      <Option
        icon="ticket-outline"
        label={t("booking.payment.credits", "Pay with credits")}
        sub={
          hasEnoughCredits
            ? t("booking.payment.creditsLeft", "{{count}} left", { count: creditsAvailable })
            : t("booking.payment.notEnoughCredits", "Not enough credits")
        }
        selected={selected === "credits"}
        disabled={!hasEnoughCredits}
        onPress={() => handleSelect("credits", !hasEnoughCredits)}
        accent={Colors.dark.primary}
      />

      {!hasEnoughCredits && onBuyCredits ? (
        <Pressable
          style={styles.buyCreditsBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBuyCredits();
          }}
        >
          <Ionicons name="add-circle-outline" size={16} color={Colors.dark.primary} />
          <Text style={styles.buyCreditsText}>
            {t("booking.payment.buyCredits", "Buy credits")}
          </Text>
        </Pressable>
      ) : null}

      <Option
        icon="card-outline"
        label={t("booking.payment.card", "Pay online with card")}
        sub={
          cardEnabled && cardPriceLabel
            ? cardPriceLabel
            : t("booking.payment.cardUnavailable", "Online card payments not enabled by your academy yet")
        }
        selected={selected === "card"}
        disabled={!cardEnabled}
        onPress={() => handleSelect("card", !cardEnabled)}
        accent={Colors.dark.successNeon || "#00E676"}
        hidden={!cardEnabled}
      />

      <Option
        icon="cash-outline"
        label={t("booking.payment.payLater", "Pay later (cash / bank)")}
        sub={t("booking.payment.payLaterSub", "Coach marks paid when you settle")}
        selected={selected === "pay_later"}
        onPress={() => handleSelect("pay_later", false)}
        accent={Colors.dark.orange || "#FF9800"}
      />
    </View>
  );
}

interface OptionProps {
  icon: any;
  label: string;
  sub: string;
  selected: boolean;
  disabled?: boolean;
  hidden?: boolean;
  onPress: () => void;
  accent: string;
}

function Option({ icon, label, sub, selected, disabled, hidden, onPress, accent }: OptionProps) {
  if (hidden) {
    return (
      <View style={[styles.row, styles.rowDisabled]}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={20} color={Colors.dark.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: Colors.dark.textMuted }]}>{label}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        selected ? { borderColor: accent, backgroundColor: accent + "11" } : null,
        disabled ? styles.rowDisabled : null,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: accent + "22" }]}>
        <Ionicons name={icon} size={20} color={disabled ? Colors.dark.textMuted : accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, disabled ? { color: Colors.dark.textMuted } : null]}>{label}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <View
        style={[
          styles.radio,
          selected ? { borderColor: accent, backgroundColor: accent } : null,
        ]}
      >
        {selected ? <Ionicons name="checkmark" size={14} color="#0A0A0A" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border || "#22222A",
    padding: Spacing.md,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Backgrounds.elevated,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  sub: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.dark.border || "#33333A",
    alignItems: "center",
    justifyContent: "center",
  },
  buyCreditsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.primary + "22",
    marginTop: -Spacing.xs,
    marginBottom: Spacing.xs,
  },
  buyCreditsText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
});
