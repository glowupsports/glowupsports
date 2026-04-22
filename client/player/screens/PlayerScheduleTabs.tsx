import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { Image as ExpoImage } from "expo-image";
import { buildPhotoUrl } from "@/lib/query-client";
import { useTranslation } from "react-i18next";

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];
import {
  Backgrounds,
  Spacing,
  BorderRadius,
  Typography,
  TextColors,
  GlowColors,
  Colors,
} from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { appendImageToFormData } from "@/lib/uploads";

// =============================================================================
// Types
// =============================================================================
export interface PlayerPayment {
  id: string;
  amount: string;
  currency: string;
  status: string; // pending | confirmed | rejected
  paymentMethod: string | null;
  paymentDate: string;
  notes: string | null;
  proofUrl: string | null;
  createdAt: string;
}

export interface AcademyPaymentInfo {
  acceptsCash: boolean;
  acceptsBankTransfer: boolean;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIban?: string | null;
  bankAccountHolder?: string | null;
  bankSwiftCode?: string | null;
  paymentInstructions?: string | null;
  currency: string;
  defaultLessonPrice?: number;
  /**
   * Task #933 — per-(sessionType) pricing matrix. Keys are the
   * server-normalized session types (`private`, `group`, `semi_private`,
   * etc.). Used by the debt sheet to price each overdrawing session by
   * its real type instead of a flat fallback.
   */
  pricing?: Record<string, { amount: number; currency: string }>;
}

export interface HistoryItem {
  key: string;
  date: Date;
  kind: "session" | "payment";
  title: string;
  subtitle: string;
  status: string;
  accentColor: string;
  sessionType?: "match" | "court" | "training";
  sessionId?: string;
  payment?: PlayerPayment;
}

// =============================================================================
// TabBar
// =============================================================================
export type ScheduleTab = "sessions" | "payments" | "history";

export function ScheduleTabBar({
  active,
  onChange,
  paymentsBadge,
}: {
  active: ScheduleTab;
  onChange: (t: ScheduleTab) => void;
  paymentsBadge?: number;
}) {
  const tabs: Array<{ key: ScheduleTab; label: string; icon: FeatherIconName }> = [
    { key: "sessions", label: "Sessions", icon: "calendar" },
    { key: "payments", label: "Payments", icon: "credit-card" },
    { key: "history", label: "History", icon: "clock" },
  ];
  return (
    <View style={tabStyles.bar}>
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <Pressable
            key={t.key}
            style={[tabStyles.tab, isActive && tabStyles.tabActive]}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(t.key);
            }}
          >
            <Feather
              name={t.icon}
              size={14}
              color={isActive ? Colors.dark.buttonText : TextColors.muted}
            />
            <Text style={[tabStyles.tabText, isActive && tabStyles.tabTextActive]}>
              {t.label}
            </Text>
            {t.key === "payments" && paymentsBadge && paymentsBadge > 0 ? (
              <View style={tabStyles.badge}>
                <Text style={tabStyles.badgeText}>{paymentsBadge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// =============================================================================
// StatsBand
// =============================================================================
export function StatsBand({
  lessonsThisMonth,
  hoursThisMonth,
  walletBalance,
  currency,
  debt,
  amountDue,
  onWalletPress,
  onDebtPress,
}: {
  lessonsThisMonth: number;
  hoursThisMonth: number;
  walletBalance: number;
  currency: string;
  debt: number; // positive number means player owes academy
  amountDue: number; // currency-denominated debt
  onWalletPress: () => void;
  onDebtPress: () => void;
}) {
  const walletColor =
    walletBalance <= 0
      ? Colors.dark.error
      : walletBalance < 5
        ? Colors.dark.warning
        : Colors.dark.primary;
  return (
    <View style={statsStyles.row}>
      <View style={statsStyles.cell}>
        <Text style={statsStyles.value}>{lessonsThisMonth}</Text>
        <Text style={statsStyles.label}>lessons</Text>
        <Text style={statsStyles.sub}>this month</Text>
      </View>
      <View style={statsStyles.divider} />
      <View style={statsStyles.cell}>
        <Text style={statsStyles.value}>{hoursThisMonth.toFixed(1)}</Text>
        <Text style={statsStyles.label}>hours</Text>
        <Text style={statsStyles.sub}>on court</Text>
      </View>
      <View style={statsStyles.divider} />
      <Pressable style={statsStyles.cell} onPress={onWalletPress}>
        <Text style={[statsStyles.value, { color: walletColor }]}>
          {walletBalance}
        </Text>
        <Text style={statsStyles.label}>wallet</Text>
        <Text style={statsStyles.sub}>credits</Text>
      </Pressable>
      {debt > 0 ? (
        <>
          <View style={statsStyles.divider} />
          <Pressable style={statsStyles.cell} onPress={onDebtPress}>
            <Text style={[statsStyles.value, { color: Colors.dark.error, fontSize: 14 }]}>
              {currency} {amountDue.toFixed(0)}
            </Text>
            <Text style={statsStyles.label}>due</Text>
            <Text style={[statsStyles.sub, { color: Colors.dark.error }]}>
              {debt} lesson{debt === 1 ? "" : "s"}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

// =============================================================================
// PaymentsTab
// =============================================================================
export function PaymentsTab({
  playerId,
  onLogPayment,
  onShowBankDetails,
  totals,
}: {
  playerId: string | null;
  onLogPayment: () => void;
  onShowBankDetails: () => void;
  totals: { confirmed: number; pending: number; currency: string };
}) {
  const { data, isLoading } = useQuery<{ payments: PlayerPayment[] }>({
    queryKey: [`/api/parent/payments/${playerId ?? ""}`],
    enabled: !!playerId,
    refetchInterval: (query) => {
      const list = query.state.data?.payments || [];
      return list.some((p) => p.status === "pending") ? 15_000 : false;
    },
  });
  const payments = data?.payments || [];
  const [detailPayment, setDetailPayment] = useState<PlayerPayment | null>(null);

  return (
    <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md }}>
      <View style={paymentStyles.summaryRow}>
        <View style={paymentStyles.summaryCard}>
          <Text style={paymentStyles.summaryLabel}>Paid</Text>
          <Text style={paymentStyles.summaryValue}>
            {totals.currency} {totals.confirmed.toFixed(2)}
          </Text>
        </View>
        <View style={paymentStyles.summaryCard}>
          <Text style={paymentStyles.summaryLabel}>Pending review</Text>
          <Text style={[paymentStyles.summaryValue, { color: Colors.dark.warning }]}>
            {totals.currency} {totals.pending.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.md }}>
        <Pressable style={paymentStyles.primaryBtn} onPress={onLogPayment}>
          <Feather name="plus-circle" size={16} color={Colors.dark.buttonText} />
          <Text style={paymentStyles.primaryBtnText}>Log a payment</Text>
        </Pressable>
        <Pressable style={paymentStyles.secondaryBtn} onPress={onShowBankDetails}>
          <Feather name="info" size={16} color={TextColors.primary} />
          <Text style={paymentStyles.secondaryBtnText}>Bank details</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ padding: Spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={Colors.dark.primary} />
        </View>
      ) : payments.length === 0 ? (
        <View style={paymentStyles.empty}>
          <Feather name="inbox" size={32} color={TextColors.muted} />
          <Text style={paymentStyles.emptyTitle}>No payments yet</Text>
          <Text style={paymentStyles.emptySub}>
            Submit a payment after paying in cash or by bank transfer.
          </Text>
        </View>
      ) : (
        payments.map((p) => (
          <PaymentRow
            key={p.id}
            payment={p}
            onPress={() => setDetailPayment(p)}
          />
        ))
      )}

      <PaymentDetailModal
        payment={detailPayment}
        onClose={() => setDetailPayment(null)}
      />
    </View>
  );
}

function paymentStatusColor(status: string): string {
  if (status === "confirmed") return Colors.dark.successNeon;
  if (status === "pending") return Colors.dark.warning;
  if (status === "rejected") return Colors.dark.error;
  return TextColors.muted;
}

function paymentStatusIcon(status: string): FeatherIconName {
  if (status === "confirmed") return "check-circle";
  if (status === "pending") return "clock";
  if (status === "rejected") return "x-circle";
  return "circle";
}

function paymentMethodLabel(method: string | null): string {
  if (method === "bank_transfer") return "Bank transfer";
  if (method === "cash") return "Cash";
  return method || "—";
}

function PaymentRow({
  payment,
  onPress,
}: {
  payment: PlayerPayment;
  onPress: () => void;
}) {
  const statusColor = paymentStatusColor(payment.status);
  const statusIcon = paymentStatusIcon(payment.status);
  const methodLabel = paymentMethodLabel(payment.paymentMethod);
  const date = new Date(payment.paymentDate || payment.createdAt);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Pressable style={paymentStyles.row} onPress={onPress}>
      <View style={paymentStyles.rowTop}>
        <View style={{ flex: 1 }}>
          <Text style={paymentStyles.amount}>
            {payment.currency} {parseFloat(payment.amount).toFixed(2)}
          </Text>
          <Text style={paymentStyles.method}>
            {methodLabel} · {dateStr}
          </Text>
        </View>
        <View style={[paymentStyles.statusPill, { backgroundColor: statusColor + "22" }]}>
          <Feather name={statusIcon} size={12} color={statusColor} />
          <Text style={[paymentStyles.statusText, { color: statusColor }]}>
            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
          </Text>
        </View>
      </View>
      {payment.proofUrl ? (
        <ExpoImage
          source={{ uri: buildPhotoUrl(payment.proofUrl) || payment.proofUrl }}
          style={paymentStyles.proofImg}
          contentFit="cover"
        />
      ) : null}
      {payment.notes ? (
        <Text style={paymentStyles.notes}>{payment.notes}</Text>
      ) : null}
    </Pressable>
  );
}

export function PaymentDetailModal({
  payment,
  onClose,
}: {
  payment: PlayerPayment | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!payment) return null;
  const statusColor = paymentStatusColor(payment.status);
  const statusIcon = paymentStatusIcon(payment.status);
  const date = new Date(payment.paymentDate || payment.createdAt);
  return (
    <SwipeableBottomSheet
      visible
      onClose={onClose}
      bottomInset={insets.bottom + Spacing.lg}
      sheetStyle={sheetStyles.sheet}
    >
      {(scrollProps) => (
          <ScrollView keyboardShouldPersistTaps="handled" {...scrollProps}>
            <View style={paymentStyles.detailHeader}>
              <Text style={sheetStyles.title}>
                {payment.currency} {parseFloat(payment.amount).toFixed(2)}
              </Text>
              <View
                style={[
                  paymentStyles.statusPill,
                  { backgroundColor: statusColor + "22" },
                ]}
              >
                <Feather name={statusIcon} size={12} color={statusColor} />
                <Text style={[paymentStyles.statusText, { color: statusColor }]}>
                  {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                </Text>
              </View>
            </View>

            <DetailRow label="Method" value={paymentMethodLabel(payment.paymentMethod)} />
            <DetailRow
              label="Date paid"
              value={date.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            />
            <DetailRow
              label="Submitted"
              value={new Date(payment.createdAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            />
            {payment.notes ? (
              <DetailRow label="Note" value={payment.notes} />
            ) : null}

            {payment.proofUrl ? (
              <>
                <Text style={sheetStyles.fieldLabel}>Proof</Text>
                <ExpoImage
                  source={{
                    uri: buildPhotoUrl(payment.proofUrl) || payment.proofUrl,
                  }}
                  style={paymentStyles.detailProof}
                  contentFit="contain"
                />
              </>
            ) : null}

            <Pressable style={sheetStyles.cancelBtn} onPress={onClose}>
              <Text style={sheetStyles.cancelText}>Close</Text>
            </Pressable>
          </ScrollView>
      )}
    </SwipeableBottomSheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={paymentStyles.detailRow}>
      <Text style={paymentStyles.detailLabel}>{label}</Text>
      <Text style={paymentStyles.detailValue}>{value}</Text>
    </View>
  );
}

// =============================================================================
// HistoryTab
// =============================================================================
type HistoryFilter = "all" | "sessions" | "payments" | "this_month" | "last_3";

export function HistoryTab({
  items,
  onSelectItem,
}: {
  items: HistoryItem[];
  onSelectItem?: (item: HistoryItem) => void;
}) {
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const filtered = useMemo(() => {
    const now = new Date();
    return items.filter((item) => {
      if (filter === "sessions" && item.kind !== "session") return false;
      if (filter === "payments" && item.kind !== "payment") return false;
      if (filter === "this_month") {
        if (
          item.date.getFullYear() !== now.getFullYear() ||
          item.date.getMonth() !== now.getMonth()
        ) {
          return false;
        }
      }
      if (filter === "last_3") {
        const cutoff = new Date(
          now.getFullYear(),
          now.getMonth() - 3,
          now.getDate(),
        );
        if (item.date < cutoff) return false;
      }
      return true;
    });
  }, [items, filter]);

  const chips: Array<{ key: HistoryFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "sessions", label: "Sessions" },
    { key: "payments", label: "Payments" },
    { key: "this_month", label: "This month" },
    { key: "last_3", label: "Last 3 months" },
  ];

  return (
    <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: Spacing.sm }}
      >
        {chips.map((chip) => {
          const isActive = filter === chip.key;
          return (
            <Pressable
              key={chip.key}
              onPress={() => {
                Haptics.selectionAsync();
                setFilter(chip.key);
              }}
              style={[
                historyStyles.chip,
                isActive && historyStyles.chipActive,
              ]}
            >
              <Text
                style={[
                  historyStyles.chipText,
                  isActive && historyStyles.chipTextActive,
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={paymentStyles.empty}>
          <Feather name="clock" size={32} color={TextColors.muted} />
          <Text style={paymentStyles.emptyTitle}>Nothing here yet</Text>
          <Text style={paymentStyles.emptySub}>
            Past sessions and payments will appear here.
          </Text>
        </View>
      ) : (
        filtered.map((item) => (
          <Pressable
            key={item.key}
            style={historyStyles.row}
            onPress={() => onSelectItem?.(item)}
          >
            <View style={[historyStyles.dot, { backgroundColor: item.accentColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={historyStyles.title}>{item.title}</Text>
              <Text style={historyStyles.subtitle}>{item.subtitle}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={historyStyles.date}>
                {item.date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
              <Text style={[historyStyles.statusText, { color: item.accentColor }]}>
                {item.status}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

// =============================================================================
// LogPaymentSheet
// =============================================================================
export function LogPaymentSheet({
  visible,
  onClose,
  playerId,
  paymentInfo,
  suggestedAmount,
}: {
  visible: boolean;
  onClose: () => void;
  playerId: string | null;
  paymentInfo: AcademyPaymentInfo | null;
  /**
   * Task #938 — when the player has outstanding debt, pre-fill the amount
   * with the per-(sessionType)-priced total computed by the parent screen
   * from the academy pricing matrix. Falls back to an empty input when
   * absent so the player can still type a custom amount.
   */
  suggestedAmount?: number;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const initialAmount =
    suggestedAmount !== undefined && suggestedAmount > 0
      ? suggestedAmount.toFixed(2)
      : "";
  const [amount, setAmount] = useState(initialAmount);
  const [method, setMethod] = useState<"cash" | "bank_transfer">("cash");
  const [notes, setNotes] = useState("");
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const copyToastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const showCopyToast = React.useCallback((label: string) => {
    if (copyToastTimer.current) clearTimeout(copyToastTimer.current);
    setCopyToast(t("player.payments.copied", { label }));
    copyToastTimer.current = setTimeout(() => setCopyToast(null), 1800);
  }, [t]);
  React.useEffect(() => () => {
    if (copyToastTimer.current) clearTimeout(copyToastTimer.current);
  }, []);

  // Re-seed the amount input every time the sheet (re-)opens so the player
  // sees the latest debt total without stale state across sessions.
  React.useEffect(() => {
    if (!visible) return;
    setAmount(
      suggestedAmount !== undefined && suggestedAmount > 0
        ? suggestedAmount.toFixed(2)
        : "",
    );
  }, [visible, suggestedAmount]);

  // Per-(sessionType) rates from the academy_pricing matrix returned by
  // /api/parent/academy-payment-info. Drives the "Quick fill" chips below.
  const pricingChips = React.useMemo(() => {
    const pricing = paymentInfo?.pricing;
    if (!pricing) return [];
    const order: Array<{ key: string; label: string }> = [
      { key: "private", label: "Private" },
      { key: "semi_private", label: "Semi-private" },
      { key: "group", label: "Group" },
    ];
    return order
      .map(({ key, label }) => {
        const row = pricing[key];
        if (!row || !Number.isFinite(row.amount) || row.amount <= 0) return null;
        return {
          key,
          label,
          amount: row.amount,
          currency: row.currency || paymentInfo?.currency || "AED",
        };
      })
      .filter((x): x is { key: string; label: string; amount: number; currency: string } => x !== null);
  }, [paymentInfo]);

  const reset = () => {
    setAmount("");
    setMethod("cash");
    setNotes("");
    setProofUri(null);
    setPaymentDate(new Date());
    setShowDatePicker(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permission needed", "Allow photo access to attach a receipt.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setProofUri(result.assets[0].uri);
    }
  };

  const captureWithCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access to capture a receipt.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setProofUri(result.assets[0].uri);
    }
  };

  const submit = async () => {
    if (!playerId) return;
    const num = parseFloat(amount);
    if (!amount || Number.isNaN(num) || num <= 0) {
      Alert.alert("Invalid amount", "Enter a positive payment amount.");
      return;
    }
    if (!proofUri) {
      Alert.alert(
        "Proof required",
        "Please attach a photo of the receipt or transfer screenshot.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("amount", String(num));
      form.append("paymentMethod", method);
      form.append("paymentDate", paymentDate.toISOString());
      form.append("currency", paymentInfo?.currency || "AED");
      if (notes.trim()) form.append("notes", notes.trim());
      await appendImageToFormData(form, "proof", proofUri);

      const url = new URL(
        `/api/parent/payments/${playerId}`,
        getApiUrl(),
      ).toString();
      const headers: Record<string, string> = { ...getAuthHeaders() };
      // Do NOT set Content-Type — let fetch/RN set the multipart boundary.
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: form as unknown as BodyInit,
        credentials: "include",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(err?.error || `Request failed (${res.status})`);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.invalidateQueries({
        queryKey: [`/api/parent/payments/${playerId}`],
      });
      reset();
      onClose();
      Alert.alert(
        "Payment submitted",
        "Your academy will review and confirm shortly.",
      );
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = e instanceof Error ? e.message : "Please try again.";
      Alert.alert("Could not submit", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SwipeableBottomSheet
      visible={visible}
      onClose={handleClose}
      bottomInset={insets.bottom + Spacing.lg}
      sheetStyle={sheetStyles.sheet}
    >
      {(scrollProps) => (
        <>
          {copyToast ? (
            <View pointerEvents="none" style={sheetStyles.copyToastWrap}>
              <View style={sheetStyles.copyToast}>
                <Feather name="check" size={14} color={Colors.dark.buttonText} />
                <Text style={sheetStyles.copyToastText}>{copyToast}</Text>
              </View>
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" {...scrollProps}>
            <Text style={sheetStyles.title}>Log a payment</Text>
            <Text style={sheetStyles.sub}>
              Already paid the academy? Submit it here so they can confirm.
            </Text>

            <Text style={sheetStyles.fieldLabel}>Amount ({paymentInfo?.currency || "AED"})</Text>
            <TextInput
              style={sheetStyles.input}
              placeholder="0.00"
              placeholderTextColor={TextColors.muted}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              editable={!submitting}
            />

            {pricingChips.length > 0 ? (
              <View style={sheetStyles.quickFillRow}>
                <Text style={sheetStyles.quickFillLabel}>Quick fill</Text>
                <View style={sheetStyles.quickFillChips}>
                  {pricingChips.map((chip) => (
                    <Pressable
                      key={chip.key}
                      style={sheetStyles.quickFillChip}
                      onPress={() => {
                        if (submitting) return;
                        Haptics.selectionAsync();
                        setAmount(chip.amount.toFixed(2));
                      }}
                    >
                      <Text style={sheetStyles.quickFillChipLabel}>
                        1 {chip.label}
                      </Text>
                      <Text style={sheetStyles.quickFillChipPrice}>
                        {chip.currency} {chip.amount.toFixed(2)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <Text style={sheetStyles.fieldLabel}>Date paid</Text>
            <Pressable
              style={sheetStyles.input}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ color: TextColors.primary, fontSize: 16 }}>
                {paymentDate.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={paymentDate}
                mode="date"
                maximumDate={new Date()}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_event, selected) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (selected) setPaymentDate(selected);
                }}
                themeVariant="dark"
              />
            )}

            <Text style={sheetStyles.fieldLabel}>Method</Text>
            <View style={{ flexDirection: "row", gap: Spacing.sm }}>
              {paymentInfo?.acceptsCash !== false ? (
                <MethodChip
                  active={method === "cash"}
                  label="Cash"
                  icon="dollar-sign"
                  onPress={() => setMethod("cash")}
                />
              ) : null}
              {paymentInfo?.acceptsBankTransfer !== false ? (
                <MethodChip
                  active={method === "bank_transfer"}
                  label="Bank transfer"
                  icon="repeat"
                  onPress={() => setMethod("bank_transfer")}
                />
              ) : null}
            </View>

            {method === "bank_transfer" && paymentInfo ? (
              <View style={sheetStyles.bankBox}>
                <Text style={sheetStyles.bankTitle}>Send to</Text>
                {paymentInfo.bankAccountHolder ? (
                  <BankRow
                    label={t("player.payments.bankRow.holder")}
                    value={paymentInfo.bankAccountHolder}
                    copy
                    onCopied={showCopyToast}
                  />
                ) : null}
                {paymentInfo.bankName ? (
                  <BankRow
                    label={t("player.payments.bankRow.bank")}
                    value={paymentInfo.bankName}
                  />
                ) : null}
                {paymentInfo.bankIban ? (
                  <BankRow
                    label={t("player.payments.bankRow.iban")}
                    value={paymentInfo.bankIban}
                    copy
                    onCopied={showCopyToast}
                  />
                ) : null}
                {paymentInfo.bankAccountNumber ? (
                  <BankRow
                    label={t("player.payments.bankRow.account")}
                    value={paymentInfo.bankAccountNumber}
                    copy
                    onCopied={showCopyToast}
                  />
                ) : null}
                {paymentInfo.bankSwiftCode ? (
                  <BankRow
                    label={t("player.payments.bankRow.swift")}
                    value={paymentInfo.bankSwiftCode}
                    copy
                    onCopied={showCopyToast}
                  />
                ) : null}
                {paymentInfo.paymentInstructions ? (
                  <Text style={sheetStyles.bankNote}>
                    {paymentInfo.paymentInstructions}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <Text style={sheetStyles.fieldLabel}>Proof of payment (required)</Text>
            {proofUri ? (
              <View>
                <ExpoImage
                  source={{ uri: proofUri }}
                  style={sheetStyles.proofPreview}
                  contentFit="cover"
                />
                <Pressable
                  style={sheetStyles.removeImg}
                  onPress={() => setProofUri(null)}
                >
                  <Feather name="x" size={14} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                <Pressable
                  style={[sheetStyles.uploadBtn, { flex: 1 }]}
                  onPress={captureWithCamera}
                >
                  <Feather name="camera" size={18} color={TextColors.primary} />
                  <Text style={sheetStyles.uploadText}>Take photo</Text>
                </Pressable>
                <Pressable
                  style={[sheetStyles.uploadBtn, { flex: 1 }]}
                  onPress={pickFromLibrary}
                >
                  <Feather name="image" size={18} color={TextColors.primary} />
                  <Text style={sheetStyles.uploadText}>From library</Text>
                </Pressable>
              </View>
            )}

            <Text style={sheetStyles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={[sheetStyles.input, { height: 70, textAlignVertical: "top" }]}
              placeholder="Reference number, what it covers, etc."
              placeholderTextColor={TextColors.muted}
              multiline
              value={notes}
              onChangeText={setNotes}
              editable={!submitting}
            />

            <Pressable
              style={[sheetStyles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={submit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.dark.buttonText} />
              ) : (
                <Text style={sheetStyles.submitText}>Submit for review</Text>
              )}
            </Pressable>

            <Pressable style={sheetStyles.cancelBtn} onPress={handleClose}>
              <Text style={sheetStyles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </>
      )}
    </SwipeableBottomSheet>
  );
}

function MethodChip({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: FeatherIconName;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        sheetStyles.methodChip,
        active && {
          borderColor: GlowColors.primary,
          backgroundColor: GlowColors.primary + "22",
        },
      ]}
      onPress={onPress}
    >
      <Feather
        name={icon}
        size={14}
        color={active ? GlowColors.primary : TextColors.muted}
      />
      <Text
        style={[
          sheetStyles.methodText,
          active && { color: GlowColors.primary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function BankRow({
  label,
  value,
  copy,
  onCopied,
}: {
  label: string;
  value: string;
  copy?: boolean;
  onCopied?: (label: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    await Clipboard.setStringAsync(value);
    setCopied(true);
    onCopied?.(label);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!copy) {
    return (
      <View style={sheetStyles.bankRow}>
        <Text style={sheetStyles.bankLabel}>{label}</Text>
        <Text style={sheetStyles.bankValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onCopy}
      hitSlop={8}
      style={({ pressed }) => [
        sheetStyles.bankRow,
        sheetStyles.bankRowCopyable,
        pressed && { opacity: 0.6 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
    >
      <Text style={sheetStyles.bankLabel}>{label}</Text>
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text style={sheetStyles.bankValue} numberOfLines={1}>
          {value}
        </Text>
        <Feather
          name={copied ? "check" : "copy"}
          size={16}
          color={copied ? Colors.dark.primary : TextColors.secondary}
        />
      </View>
    </Pressable>
  );
}

// =============================================================================
// DebtExplainerSheet
// =============================================================================
export interface OverdrawingSession {
  id: string;
  title: string;
  date: Date;
  price: number;
  /** Optional per-row currency from the academy_pricing matrix.
   * Falls back to the sheet's top-level `currency` prop when absent. */
  currency?: string;
}

export function DebtExplainerSheet({
  visible,
  onClose,
  onLogPayment,
  debt,
  currency,
  overdrawingSessions,
  amountDue,
}: {
  visible: boolean;
  onClose: () => void;
  onLogPayment: () => void;
  debt: number;
  currency: string;
  overdrawingSessions: OverdrawingSession[];
  amountDue: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <SwipeableBottomSheet
      visible={visible}
      onClose={onClose}
      bottomInset={insets.bottom + Spacing.lg}
      sheetStyle={sheetStyles.sheet}
    >
      {(scrollProps) => (
          <ScrollView keyboardShouldPersistTaps="handled" {...scrollProps}>
            <View style={debtStyles.iconWrap}>
              <Feather name="alert-circle" size={32} color={Colors.dark.error} />
            </View>
            <Text style={sheetStyles.title}>
              {currency} {amountDue.toFixed(2)} due
            </Text>
            <Text style={sheetStyles.sub}>
              You attended {debt} lesson{debt === 1 ? "" : "s"} on credit. Pay
              your academy and log it below — they will confirm and clear your
              balance.
            </Text>

            {overdrawingSessions.length > 0 ? (
              <>
                <Text style={sheetStyles.fieldLabel}>Sessions on credit</Text>
                <View style={debtStyles.sessionList}>
                  {overdrawingSessions.map((s) => (
                    <View key={s.id} style={debtStyles.sessionRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={debtStyles.sessionTitle}>{s.title}</Text>
                        <Text style={debtStyles.sessionDate}>
                          {s.date.toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </Text>
                      </View>
                      <Text style={debtStyles.sessionPrice}>
                        {s.currency || currency} {s.price.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                  <View style={debtStyles.totalRow}>
                    <Text style={debtStyles.totalLabel}>Total due</Text>
                    <Text style={debtStyles.totalValue}>
                      {currency} {amountDue.toFixed(2)}
                    </Text>
                  </View>
                </View>
              </>
            ) : null}

            <View style={debtStyles.stepsBox}>
              <DebtStep n={1} text="Pay your academy in cash or by bank transfer." />
              <DebtStep n={2} text='Tap "Log a payment" and attach a receipt.' />
              <DebtStep n={3} text="Your academy reviews and confirms it." />
              <DebtStep n={4} text="Your wallet updates and the debt clears." />
            </View>

            <Pressable
              style={sheetStyles.submitBtn}
              onPress={() => {
                onClose();
                onLogPayment();
              }}
            >
              <Text style={sheetStyles.submitText}>Log a payment</Text>
            </Pressable>
            <Pressable style={sheetStyles.cancelBtn} onPress={onClose}>
              <Text style={sheetStyles.cancelText}>Got it</Text>
            </Pressable>
          </ScrollView>
      )}
    </SwipeableBottomSheet>
  );
}

function DebtStep({ n, text }: { n: number; text: string }) {
  return (
    <View style={debtStyles.step}>
      <View style={debtStyles.stepNum}>
        <Text style={debtStyles.stepNumText}>{n}</Text>
      </View>
      <Text style={debtStyles.stepText}>{text}</Text>
    </View>
  );
}

// =============================================================================
// Styles
// =============================================================================
const tabStyles = makeReactiveStyles(() => StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.full,
    padding: 4,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  tabActive: {
    backgroundColor: Colors.dark.primary,
  },
  tabText: {
    ...Typography.caption,
    fontWeight: "600",
    color: TextColors.muted,
  },
  tabTextActive: {
    color: Colors.dark.buttonText,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
}));

const statsStyles = makeReactiveStyles(() => StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  cell: {
    flex: 1,
    alignItems: "center",
  },
  divider: {
    width: 1,
    backgroundColor: Backgrounds.surface,
    marginVertical: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: "700",
    color: TextColors.primary,
  },
  label: {
    ...Typography.caption,
    color: TextColors.secondary,
    marginTop: 2,
  },
  sub: {
    fontSize: 10,
    color: TextColors.muted,
    marginTop: 1,
  },
}));

const paymentStyles = makeReactiveStyles(() => StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  summaryLabel: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "700",
    color: TextColors.primary,
    marginTop: 4,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.dark.primary,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
  },
  primaryBtnText: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Backgrounds.elevated,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.lg,
  },
  secondaryBtnText: {
    color: TextColors.primary,
    fontWeight: "600",
  },
  empty: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.subtitle,
    color: TextColors.primary,
    marginTop: Spacing.sm,
  },
  emptySub: {
    ...Typography.caption,
    color: TextColors.muted,
    textAlign: "center",
    marginTop: 4,
  },
  row: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  amount: {
    fontSize: 16,
    fontWeight: "700",
    color: TextColors.primary,
  },
  method: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  proofImg: {
    width: "100%",
    height: 140,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    backgroundColor: Backgrounds.surface,
  },
  notes: {
    ...Typography.caption,
    color: TextColors.secondary,
    marginTop: Spacing.sm,
    fontStyle: "italic",
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Backgrounds.surface,
  },
  detailLabel: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  detailValue: {
    ...Typography.caption,
    color: TextColors.primary,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: Spacing.md,
  },
  detailProof: {
    width: "100%",
    height: 320,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.surface,
    marginTop: Spacing.xs,
  },
}));

const historyStyles = makeReactiveStyles(() => StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    ...Typography.body,
    color: TextColors.primary,
    fontWeight: "600",
  },
  subtitle: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  date: {
    ...Typography.caption,
    color: TextColors.secondary,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Backgrounds.elevated,
  },
  chipActive: {
    backgroundColor: Colors.dark.primary,
  },
  chipText: {
    ...Typography.caption,
    color: TextColors.muted,
    fontWeight: "600",
  },
  chipTextActive: {
    color: Colors.dark.buttonText,
  },
}));

const sheetStyles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    maxHeight: "92%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Backgrounds.surface,
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.h3,
    color: TextColors.primary,
  },
  sub: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    ...Typography.caption,
    color: TextColors.secondary,
    marginTop: Spacing.md,
    marginBottom: 6,
    fontWeight: "600",
  },
  input: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: TextColors.primary,
    fontSize: 16,
  },
  methodChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
    backgroundColor: Backgrounds.elevated,
  },
  methodText: {
    ...Typography.caption,
    fontWeight: "600",
    color: TextColors.muted,
  },
  bankBox: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  bankTitle: {
    ...Typography.caption,
    fontWeight: "700",
    color: TextColors.secondary,
    marginBottom: 6,
  },
  bankRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  bankRowCopyable: {
    paddingVertical: Spacing.sm,
    marginHorizontal: -Spacing.xs,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  copyToastWrap: {
    position: "absolute",
    top: Spacing.md,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 50,
  },
  copyToast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  copyToastText: {
    ...Typography.caption,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  bankLabel: {
    ...Typography.caption,
    color: TextColors.muted,
    marginRight: Spacing.sm,
  },
  bankValue: {
    ...Typography.caption,
    color: TextColors.primary,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  bankNote: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 6,
    fontStyle: "italic",
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
    borderStyle: "dashed",
    backgroundColor: Backgrounds.elevated,
  },
  uploadText: {
    ...Typography.caption,
    color: TextColors.primary,
    fontWeight: "600",
  },
  proofPreview: {
    width: "100%",
    height: 160,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.elevated,
  },
  removeImg: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtn: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  submitText: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
    fontSize: 16,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  cancelText: {
    color: TextColors.muted,
    fontWeight: "600",
  },
  quickFillRow: {
    marginTop: Spacing.sm,
  },
  quickFillLabel: {
    ...Typography.caption,
    color: TextColors.muted,
    marginBottom: 6,
  },
  quickFillChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  quickFillChip: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
    backgroundColor: Backgrounds.elevated,
  },
  quickFillChipLabel: {
    ...Typography.caption,
    color: TextColors.secondary,
    fontWeight: "600",
  },
  quickFillChipPrice: {
    ...Typography.caption,
    color: TextColors.primary,
    fontWeight: "700",
  },
}));

const debtStyles = makeReactiveStyles(() => StyleSheet.create({
  iconWrap: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.error + "22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  stepsBox: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: {
    color: Colors.dark.buttonText,
    fontSize: 12,
    fontWeight: "700",
  },
  stepText: {
    flex: 1,
    ...Typography.caption,
    color: TextColors.primary,
  },
  sessionList: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: Backgrounds.surface,
  },
  sessionTitle: {
    ...Typography.caption,
    color: TextColors.primary,
    fontWeight: "600",
  },
  sessionDate: {
    fontSize: 11,
    color: TextColors.muted,
    marginTop: 2,
  },
  sessionPrice: {
    ...Typography.caption,
    color: Colors.dark.error,
    fontWeight: "700",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginTop: 4,
  },
  totalLabel: {
    ...Typography.caption,
    color: TextColors.secondary,
    fontWeight: "700",
  },
  totalValue: {
    fontSize: 16,
    color: Colors.dark.error,
    fontWeight: "700",
  },
}));
