import React, { useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Modal, TextInput, Platform, Alert, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useTranslation, type TFunction } from "react-i18next";
import { apiRequest } from "@/lib/query-client";
import { invalidatePlayersList } from "@/lib/credit-cache";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing, Typography } from "@/constants/theme";
import { CreditPackagesList } from "@/components/CreditPackagesList";
import { InvoiceViewerModal, type ViewableInvoice } from "@/components/billing/InvoiceViewerModal";
import { SuccessToast } from "@/components/SuccessToast";

type CreditType = "group" | "semi_private" | "private";

interface Lot {
  id: string;
  type: CreditType;
  qty_total: string | number;
  qty_remaining: string | number;
  expires_at: string | null;
  status: string;
}

interface LedgerEntry {
  id: string;
  type: string;
  delta: string | number;
  reason: string;
  balance_after: string | number;
  occurred_at: string;
  metadata?: Record<string, unknown> | null;
  actor_role?: string | null;
  session_id?: string | null;
  session_player_id?: string | null;
  lot_id?: string | null;
  invoice_id?: string | null;
}

interface LotSummary {
  id: string;
  type: string;
  qty_total: string | number;
  qty_remaining: string | number;
  status: string;
  source_package_id?: string | null;
  invoice_number?: string | null;
}

interface WalletData {
  playerId: string;
  academyId: string;
  v2Enabled: boolean;
  balance: { group: number; semi_private: number; private: number };
  moneyWallet: { balance: number; currency: string } | null;
  activeLots: Lot[];
  recentLedger: LedgerEntry[];
}

const TYPE_LABEL: Record<string, string> = {
  group: "Group",
  semi_private: "Semi-Private",
  private: "Private",
};

const TYPE_COLOR: Record<string, string> = {
  group: Colors.dark.xpCyan,
  semi_private: Colors.dark.primary,
  private: Colors.dark.orange,
};

const EXPIRING_SOON_MS = 14 * 24 * 60 * 60 * 1000;

function fmtNumber(n: string | number | null | undefined): string {
  const v = Number(n ?? 0);
  if (Number.isNaN(v)) return "0";
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(1);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    })} ${d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`;
  } catch {
    return iso;
  }
}

function ledgerLabel(type: string): string {
  switch (type) {
    case "package_purchase":
      return "Package added";
    case "consume":
      return "Session attended";
    case "refund":
      return "Refund";
    case "makeup":
      return "Make-up credit";
    case "manual_adjustment":
      return "Manual adjustment";
    case "lot_expired":
      return "Lot expired";
    default:
      return type.replace(/_/g, " ");
  }
}

// Friendly label for the ledger `reason` (event type) column. The `type`
// column actually stores the credit type (group / semi_private / private)
// so the action sheet uses `reason` to decide which undo affordance to show.
function reasonLabel(reason: string, t: TFunction): string {
  switch (reason) {
    case "purchase":
      return t("coachCredit.history.reason.purchase", "Package purchase");
    case "consume":
      return t("coachCredit.history.reason.consume", "Session consumed");
    case "refund":
      return t("coachCredit.history.reason.refund", "Session refund");
    case "makeup":
      return t("coachCredit.history.reason.makeup", "Make-up credit");
    case "manual":
      return t("coachCredit.history.reason.manual", "Manual adjustment");
    case "expiry":
      return t("coachCredit.history.reason.expiry", "Lot expired");
    case "money_charge":
      return t("coachCredit.history.reason.moneyCharge", "Money charge");
    case "money_topup":
      return t("coachCredit.history.reason.moneyTopup", "Money top-up");
    default:
      return reason.replace(/_/g, " ");
  }
}

// Human reason text — manual adjustments stash the coach's note in
// metadata.reason; purchases set the column reason to "purchase".
function ledgerNote(e: LedgerEntry): string | null {
  const meta = (e.metadata || {}) as Record<string, unknown>;
  const metaReason = typeof meta.reason === "string" ? meta.reason : null;
  if (metaReason && metaReason.trim()) return metaReason.trim();
  return null;
}

export function useV2Enabled(playerId: string | undefined): boolean {
  const q = useQuery<WalletData>({
    queryKey: [`/api/v2/credits/wallet/${playerId}`],
    enabled: !!playerId,
  });
  return q.data?.v2Enabled === true;
}

interface PurchasedInvoiceResponse {
  id: string;
  invoiceNumber: string;
  amount: number | string;
  currency?: string | null;
  status?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
  notes?: string | null;
}

interface PurchaseCreditsResponse {
  success: boolean;
  package?: { id: string } | null;
  invoice?: PurchasedInvoiceResponse | null;
}

interface Props {
  playerId: string;
}

export function CoachCreditV2Panel({ playerId }: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const isBillingAuthorized = !!user && ["academy_owner", "admin", "platform_owner"].includes(user.role);
  // Task #696: deletion is allowed for coaches too (separate from price/payment gating above).
  const canDeletePackages = !!user && ["coach", "academy_owner", "admin", "platform_owner"].includes(user.role);
  // Task #1089 — toast for undo success (matches PlayerPaymentsSection pattern).
  const [undoToast, setUndoToast] = useState<{ visible: boolean; message: string }>({ visible: false, message: "" });

  const [showLedger, setShowLedger] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<CreditType>("group");
  const [addQty, setAddQty] = useState("4");
  const [addPrice, setAddPrice] = useState("");
  const [addPayment, setAddPayment] = useState<"cash" | "bank_transfer" | "already_paid">("cash");
  const [addError, setAddError] = useState<string | null>(null);
  // Task #1060 — coach can remove credits (negative manual adjustment).
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeType, setRemoveType] = useState<CreditType>("group");
  const [removeQty, setRemoveQty] = useState("1");
  const [removeReason, setRemoveReason] = useState("");
  const [removeError, setRemoveError] = useState<string | null>(null);
  // Task #700: invoice returned by purchase-credits, opened via "View invoice" CTA.
  const [purchasedInvoice, setPurchasedInvoice] = useState<ViewableInvoice | null>(null);
  // Task #1089 — tappable credit history rows: open a detail sheet on tap with
  // an undo affordance that fits the entry type (purchase / manual / consume).
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [entryFeedback, setEntryFeedback] = useState<{ kind: "error" | "info"; message: string } | null>(null);
  const [pendingUndo, setPendingUndo] = useState<
    | { kind: "purchase"; packageId: string; force: boolean; used: number; remaining: number; total: number; typeLabel: string }
    | { kind: "reverse_manual"; entry: LedgerEntry }
    | null
  >(null);
  const queryClient = useQueryClient();

  const walletQuery = useQuery<WalletData>({
    queryKey: [`/api/v2/credits/wallet/${playerId}`],
    enabled: !!playerId,
  });

  // Pull academy pricing to prefill price-per-credit. Coach app already has
  // this endpoint mounted at /api/owner/academy/pricing.
  const pricingQuery = useQuery<Array<{ sessionType: string; pricePerSession: string; currency: string }>>({
    queryKey: ["/api/owner/academy/pricing"],
    enabled: showAddModal,
  });

  const addCreditsMutation = useMutation({
    mutationFn: async () => {
      const qty = parseInt(addQty, 10);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Enter a valid number of credits");
      const body: Record<string, unknown> = {
        creditType: addType,
        credits: qty,
        paymentMethod: addPayment,
      };
      // Only billing-authorized roles can override price; coaches must let
      // the server resolve from academy pricing to avoid 403s.
      if (isBillingAuthorized && addPrice.trim()) {
        const p = parseFloat(addPrice);
        if (!Number.isFinite(p) || p < 0) throw new Error("Enter a valid price");
        body.pricePerCredit = p;
      }
      const res = await apiRequest("POST", `/api/coach/players/${playerId}/purchase-credits`, body);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j?.error || "Failed to add credits");
      }
      return (await res.json()) as PurchaseCreditsResponse;
    },
    onSuccess: (data: PurchaseCreditsResponse) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/v2/credits/wallet/${playerId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/v2/credits/ledger/${playerId}`, { limit: 20 }] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credits-summary`] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/players", playerId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      // Task #930 — refresh the coach Players list pill instantly so the
      // new balance is visible the moment the coach taps back, instead of
      // waiting for the 60s staleTime to elapse.
      invalidatePlayersList(queryClient);
      setShowAddModal(false);
      setAddError(null);
      // Surface the auto-generated invoice so coaches can view/share the PDF.
      // Use an explicit "View invoice" CTA in the success confirmation rather
      // than auto-opening the viewer — gives the coach control.
      const inv = data?.invoice;
      if (inv?.id && inv?.invoiceNumber) {
        const viewable: ViewableInvoice = {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amount: inv.amount,
          currency: inv.currency || "AED",
          status: inv.status || (addPayment === "already_paid" ? "paid" : "pending"),
          dueDate: inv.dueDate || null,
          paidAt: inv.paidAt || null,
          createdAt: inv.createdAt || new Date().toISOString(),
          notes: inv.notes || null,
        };
        Alert.alert(
          "Credits added",
          `Invoice #${inv.invoiceNumber} was created.`,
          [
            { text: "Done", style: "cancel" },
            { text: "View invoice", onPress: () => setPurchasedInvoice(viewable) },
          ],
        );
      } else {
        Alert.alert("Credits added", "The credit lot has been created.");
      }
    },
    onError: (err: Error) => {
      setAddError(err.message);
    },
  });

  // Task #1060 — remove credits via the existing manual-adjustment endpoint
  // with a negative delta. Server allows negative balances (debt) so we warn
  // in the UI rather than block.
  const removeCreditsMutation = useMutation({
    mutationFn: async () => {
      const qty = parseInt(removeQty, 10);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error("Enter a valid number of credits to remove");
      }
      const reason = removeReason.trim() || "Coach removed credits";
      const res = await apiRequest("POST", "/api/v2/credits/manual-adjustment", {
        playerId,
        type: removeType,
        delta: -qty,
        reason,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j?.error || "Failed to remove credits");
      }
      return res.json();
    },
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/v2/credits/wallet/${playerId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/v2/credits/ledger/${playerId}`, { limit: 20 }] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credits-summary`] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/players", playerId, "stats"] });
      invalidatePlayersList(queryClient);
      setShowRemoveModal(false);
      setRemoveError(null);
      Alert.alert("Credits removed", "The wallet has been updated.");
    },
    onError: (err: Error) => {
      setRemoveError(err.message);
    },
  });

  // Task #1089 — central invalidation so the wallet, ledger, packages and
  // invoices all refresh after an undo from the row detail sheet.
  const invalidateAfterUndo = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/v2/credits/wallet/${playerId}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/v2/credits/lots/${playerId}`] });
    queryClient.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && k.startsWith(`/api/v2/credits/ledger/${playerId}`);
      },
    });
    queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credits-summary`] });
    queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/players", playerId, "stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
    invalidatePlayersList(queryClient);
  };

  // Task #1089 — pull the lots list so a purchase row's detail sheet can show
  // remaining vs used and warn before reversing a partly-consumed package.
  const lotsQuery = useQuery<{ lots: LotSummary[] }>({
    queryKey: [`/api/v2/credits/lots/${playerId}`],
    enabled: !!playerId && !!selectedEntry && selectedEntry.reason === "purchase",
  });

  // Task #1089 — package delete (used to cancel a purchase from the row).
  const cancelPurchaseMutation = useMutation({
    mutationFn: async ({ packageId, force }: { packageId: string; force: boolean }) => {
      const url = force ? `/api/packages/${packageId}?force=true` : `/api/packages/${packageId}`;
      const res = await apiRequest("DELETE", url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to cancel purchase");
      return data;
    },
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      invalidateAfterUndo();
      setPendingUndo(null);
      setSelectedEntry(null);
      setEntryFeedback(null);
      setUndoToast({
        visible: true,
        message: t("coachCredit.history.toast.purchaseCancelled", "Purchase cancelled · credits reversed"),
      });
    },
    onError: (err: Error) => {
      setPendingUndo(null);
      setEntryFeedback({ kind: "error", message: err.message || "Could not cancel purchase" });
    },
  });

  // Task #1089 — manual adjustment reversal: post the opposite delta with a
  // "Reversal of …" reason so the audit trail makes the link obvious.
  const reverseAdjustmentMutation = useMutation({
    mutationFn: async (entry: LedgerEntry) => {
      const origDelta = Number(entry.delta);
      if (!Number.isFinite(origDelta) || origDelta === 0) {
        throw new Error("Cannot reverse this adjustment");
      }
      const origNote = ledgerNote(entry) || "manual adjustment";
      const dateLabel = fmtDateTime(entry.occurred_at);
      const body: Record<string, unknown> = {
        playerId,
        type: entry.type,
        delta: -origDelta,
        reason: `Reversal of "${origNote}" (${dateLabel})`,
      };
      // Server requires recordPayment to be explicit on positive deltas.
      // Reversing a negative manual adjustment yields a positive delta but
      // is not a real cash payment, so flag it as a goodwill grant.
      if (-origDelta > 0) {
        body.recordPayment = false;
      }
      const res = await apiRequest("POST", "/api/v2/credits/manual-adjustment", body);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to reverse adjustment");
      return data;
    },
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      invalidateAfterUndo();
      setPendingUndo(null);
      setSelectedEntry(null);
      setEntryFeedback(null);
      setUndoToast({
        visible: true,
        message: t("coachCredit.history.toast.adjustmentReversed", "Adjustment reversed · wallet restored"),
      });
    },
    onError: (err: Error) => {
      setPendingUndo(null);
      setEntryFeedback({ kind: "error", message: err.message || "Could not reverse adjustment" });
    },
  });

  const openEntry = (entry: LedgerEntry) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setEntryFeedback(null);
    setPendingUndo(null);
    setSelectedEntry(entry);
  };

  const openRemoveModal = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setRemoveError(null);
    setRemoveType("group");
    setRemoveQty("1");
    setRemoveReason("");
    setShowRemoveModal(true);
  };

  // Tracks the credit type for which the price field was last auto-filled.
  // Lets us preserve manual edits within the same type, while still
  // overwriting the price when the coach switches to a different type.
  const lastAutoFilledTypeRef = useRef<CreditType | null>(null);

  const openAddModal = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setAddError(null);
    setAddQty("4");
    setAddPrice("");
    setAddPayment("cash");
    setAddType("group");
    lastAutoFilledTypeRef.current = null;
    setShowAddModal(true);
  };

  // Auto-fill price when type changes (or pricing loads).
  // - On type change: always overwrite with the academy price for the new
  //   type (or clear if not configured) — auto-fill wins on type switches.
  // - Within the same type: preserve any manual edit the coach has made.
  React.useEffect(() => {
    if (!showAddModal) return;
    const sameType = lastAutoFilledTypeRef.current === addType;
    if (sameType && addPrice.trim()) return;
    const lookup = addType === "semi_private" ? "semi" : addType;
    const row = pricingQuery.data?.find((p) => p.sessionType === lookup);
    if (row && parseFloat(row.pricePerSession) > 0) {
      setAddPrice(parseFloat(row.pricePerSession).toFixed(2));
    } else if (!sameType) {
      setAddPrice("");
    }
    lastAutoFilledTypeRef.current = addType;
  }, [addType, pricingQuery.data, showAddModal]); // eslint-disable-line react-hooks/exhaustive-deps

  const enabled = walletQuery.data?.v2Enabled === true;

  const ledgerQuery = useQuery<{ entries: LedgerEntry[] }>({
    queryKey: [`/api/v2/credits/ledger/${playerId}`, { limit: 20 }],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/v2/credits/ledger/${playerId}?limit=20`,
      );
      return res.json();
    },
    enabled: enabled && showLedger && !!playerId,
  });

  const totalActive = useMemo(() => {
    const b = walletQuery.data?.balance;
    if (!b) return 0;
    return (b.group || 0) + (b.semi_private || 0) + (b.private || 0);
  }, [walletQuery.data]);

  if (walletQuery.isLoading) {
    return (
      <View style={{ paddingVertical: Spacing.md, alignItems: "center" }}>
        <ActivityIndicator color={Colors.dark.primary} />
      </View>
    );
  }

  if (!enabled) return null;

  const wallet = walletQuery.data!;

  return (
    <View
      style={{
        marginBottom: Spacing.md,
        padding: Spacing.md,
        borderRadius: 14,
        backgroundColor: `${Colors.dark.primary}08`,
        borderWidth: 1,
        borderColor: `${Colors.dark.primary}30`,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: Spacing.sm,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="flash" size={14} color={Colors.dark.primary} />
          <Text
            style={{
              ...Typography.h3,
              color: Colors.dark.primary,
              fontSize: 13,
              letterSpacing: 0.5,
            }}
          >
            CREDIT WALLET
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 6,
            backgroundColor: `${Colors.dark.successNeon}20`,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: Colors.dark.successNeon,
            }}
          >
            V2
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          gap: Spacing.sm,
          marginBottom: Spacing.sm,
        }}
      >
        {(["group", "semi_private", "private"] as CreditType[]).map((t) => {
          // Task #817: surface debt clearly. Negative balances were previously
          // rendered in the same colour as positives, so users assumed nothing
          // was charged. Show negative values in red and add a "Debt" pill.
          const rawBal = Number(wallet.balance[t] ?? 0);
          const inDebt = rawBal < 0;
          return (
            <View
              key={t}
              style={{
                flex: 1,
                padding: Spacing.sm,
                borderRadius: 10,
                backgroundColor: inDebt
                  ? `${Colors.dark.error}18`
                  : `${TYPE_COLOR[t]}15`,
                borderWidth: inDebt ? 1 : 0,
                borderColor: inDebt ? Colors.dark.error : "transparent",
                alignItems: "center",
              }}
              accessible
              accessibilityLabel={
                inDebt
                  ? `${TYPE_LABEL[t]}: ${Math.abs(rawBal)} credits in debt`
                  : `${TYPE_LABEL[t]}: ${rawBal} credits available`
              }
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: inDebt ? Colors.dark.error : TYPE_COLOR[t],
                }}
              >
                {fmtNumber(rawBal)}
              </Text>
              <Text style={{ fontSize: 10, color: Colors.dark.textMuted }}>
                {TYPE_LABEL[t]}
              </Text>
              {inDebt ? (
                <View
                  style={{
                    marginTop: 4,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 4,
                    backgroundColor: Colors.dark.error,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "800",
                      color: "#fff",
                      letterSpacing: 0.4,
                    }}
                  >
                    DEBT
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {wallet.moneyWallet ? (
        <Text
          style={{
            fontSize: 11,
            color: Colors.dark.textMuted,
            marginBottom: Spacing.sm,
          }}
        >
          Money wallet: {wallet.moneyWallet.currency}{" "}
          {wallet.moneyWallet.balance.toFixed(2)}
        </Text>
      ) : null}

      {/* Task #688 — full Packages list (all statuses) with tap-to-detail + delete */}
      <CreditPackagesList
        playerId={playerId}
        currency={wallet.moneyWallet?.currency}
        canDelete={canDeletePackages}
      />

      <View style={{ flexDirection: "row", gap: Spacing.sm }}>
        <Pressable
          onPress={openAddModal}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            paddingVertical: Spacing.sm,
            borderRadius: 8,
            backgroundColor: Colors.dark.primary,
          }}
        >
          <Ionicons name="add-circle-outline" size={14} color="#000" />
          <Text style={{ color: "#000", fontWeight: "800", fontSize: 12 }}>
            Add credits
          </Text>
        </Pressable>
        {/* Task #1060 — Remove credits entry point */}
        <Pressable
          onPress={openRemoveModal}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            paddingVertical: Spacing.sm,
            borderRadius: 8,
            backgroundColor: `${Colors.dark.error}20`,
            borderWidth: 1,
            borderColor: `${Colors.dark.error}50`,
          }}
        >
          <Ionicons name="remove-circle-outline" size={14} color={Colors.dark.error} />
          <Text style={{ color: Colors.dark.error, fontWeight: "800", fontSize: 12 }}>
            Remove credits
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setShowLedger((v) => !v)}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            paddingVertical: Spacing.sm,
            borderRadius: 8,
            backgroundColor: `${Colors.dark.text}10`,
            borderWidth: 1,
            borderColor: `${Colors.dark.text}20`,
          }}
        >
          <Ionicons
            name={showLedger ? "chevron-up" : "list-outline"}
            size={13}
            color={Colors.dark.text}
          />
          <Text
            style={{
              color: Colors.dark.text,
              fontWeight: "700",
              fontSize: 12,
            }}
          >
            {showLedger ? "Hide history" : "View history"}
          </Text>
        </Pressable>
      </View>

      <AddCreditsModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        addType={addType}
        setAddType={setAddType}
        addQty={addQty}
        setAddQty={setAddQty}
        addPrice={addPrice}
        setAddPrice={setAddPrice}
        addPayment={addPayment}
        setAddPayment={setAddPayment}
        onSubmit={() => addCreditsMutation.mutate()}
        isPending={addCreditsMutation.isPending}
        error={addError}
        isBillingAuthorized={isBillingAuthorized}
      />

      <RemoveCreditsModal
        visible={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        removeType={removeType}
        setRemoveType={setRemoveType}
        removeQty={removeQty}
        setRemoveQty={setRemoveQty}
        removeReason={removeReason}
        setRemoveReason={setRemoveReason}
        currentBalance={Number(wallet.balance[removeType] ?? 0)}
        onSubmit={() => removeCreditsMutation.mutate()}
        isPending={removeCreditsMutation.isPending}
        error={removeError}
      />

      <InvoiceViewerModal
        invoice={purchasedInvoice}
        visible={!!purchasedInvoice}
        onClose={() => setPurchasedInvoice(null)}
        onPaid={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/players", playerId, "stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
          // Task #930 — paying an invoice can flip the player out of
          // "pending payment" status; refresh the lists so the row moves.
          invalidatePlayersList(queryClient);
        }}
      />

      {showLedger ? (
        <View style={{ marginTop: Spacing.sm }}>
          {ledgerQuery.isLoading ? (
            <ActivityIndicator color={Colors.dark.primary} />
          ) : !ledgerQuery.data?.entries?.length ? (
            <Text style={{ fontSize: 11, color: Colors.dark.textMuted }}>
              No history yet.
            </Text>
          ) : (
            ledgerQuery.data.entries.map((e) => {
              const delta = Number(e.delta);
              const isNegative = delta < 0;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => openEntry(e)}
                  accessibilityRole="button"
                  accessibilityLabel={t("coachCredit.history.row.openA11y", {
                    defaultValue: "Open {{label}} details",
                    label: reasonLabel(e.reason, t),
                  })}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    paddingVertical: 6,
                    paddingHorizontal: 4,
                    borderRadius: 6,
                    borderBottomWidth: 1,
                    borderBottomColor: `${Colors.dark.text}08`,
                    backgroundColor: pressed ? `${Colors.dark.text}10` : "transparent",
                  })}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        color: Colors.dark.text,
                        fontWeight: "600",
                      }}
                    >
                      {ledgerLabel(e.type)}
                    </Text>
                    {e.reason ? (
                      <Text
                        style={{
                          fontSize: 10,
                          color: Colors.dark.textMuted,
                          marginTop: 1,
                        }}
                        numberOfLines={2}
                      >
                        {e.reason}
                        {e.metadata?.backfill ? (
                          <Text
                            style={{
                              color: Colors.dark.warning ?? "#F59E0B",
                              fontWeight: "700",
                            }}
                          >
                            {"  "}· Backfilled
                          </Text>
                        ) : null}
                      </Text>
                    ) : null}
                    <Text
                      style={{
                        fontSize: 10,
                        color: Colors.dark.textMuted,
                        marginTop: 1,
                      }}
                    >
                      {fmtDateTime(e.occurred_at)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: isNegative
                        ? Colors.dark.error
                        : Colors.dark.successNeon,
                    }}
                  >
                    {isNegative ? "" : "+"}
                    {fmtNumber(delta)}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}

      <LedgerEntryDetailSheet
        entry={selectedEntry}
        onClose={() => {
          setSelectedEntry(null);
          setPendingUndo(null);
          setEntryFeedback(null);
        }}
        currentBalances={wallet.balance}
        lots={lotsQuery.data?.lots ?? []}
        canUndoPurchase={canDeletePackages}
        canReverseAdjustment={canDeletePackages}
        feedback={entryFeedback}
        clearFeedback={() => setEntryFeedback(null)}
        onRequestCancelPurchase={(packageId, lot) => {
          const total = lot ? Number(lot.qty_total) : Math.abs(Number(selectedEntry?.delta ?? 0));
          const remaining = lot ? Number(lot.qty_remaining) : total;
          const used = Math.max(0, total - remaining);
          // Match CreditPackagesList: force=true is only required when there
          // are still un-consumed credits the server has to debit on delete.
          const force = remaining > 0;
          setEntryFeedback(null);
          setPendingUndo({
            kind: "purchase",
            packageId,
            force,
            used,
            remaining,
            total,
            typeLabel: TYPE_LABEL[selectedEntry?.type ?? "group"] ?? "credits",
          });
        }}
        onRequestReverseAdjustment={(entry) => {
          setEntryFeedback(null);
          setPendingUndo({ kind: "reverse_manual", entry });
        }}
        pendingUndo={pendingUndo}
        cancelPending={() => setPendingUndo(null)}
        confirmPending={() => {
          if (!pendingUndo) return;
          if (pendingUndo.kind === "purchase") {
            cancelPurchaseMutation.mutate({ packageId: pendingUndo.packageId, force: pendingUndo.force });
          } else {
            reverseAdjustmentMutation.mutate(pendingUndo.entry);
          }
        }}
        isPending={cancelPurchaseMutation.isPending || reverseAdjustmentMutation.isPending}
        onOpenSession={(sessionId) => {
          setSelectedEntry(null);
          try {
            navigation.navigate("ActiveSession", { sessionId });
          } catch {
            /* navigation target unavailable in this stack — silently no-op */
          }
        }}
      />

      <SuccessToast
        visible={undoToast.visible}
        message={undoToast.message}
        variant="success"
        duration={2200}
        icon="arrow-undo-outline"
        onHide={() => setUndoToast({ visible: false, message: "" })}
      />
    </View>
  );
}

interface AddCreditsModalProps {
  visible: boolean;
  onClose: () => void;
  addType: CreditType;
  setAddType: (t: CreditType) => void;
  addQty: string;
  setAddQty: (s: string) => void;
  addPrice: string;
  setAddPrice: (s: string) => void;
  addPayment: "cash" | "bank_transfer" | "already_paid";
  setAddPayment: (p: "cash" | "bank_transfer" | "already_paid") => void;
  onSubmit: () => void;
  isPending: boolean;
  error: string | null;
  isBillingAuthorized: boolean;
}

function AddCreditsModal({
  visible, onClose, addType, setAddType, addQty, setAddQty,
  addPrice, setAddPrice, addPayment, setAddPayment, onSubmit, isPending, error,
  isBillingAuthorized,
}: AddCreditsModalProps) {
  const totalNum = (() => {
    const q = parseFloat(addQty);
    const p = parseFloat(addPrice);
    if (!Number.isFinite(q) || !Number.isFinite(p)) return null;
    return q * p;
  })();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.dark.backgroundRoot, padding: Spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.lg }}>
          <Text style={{ ...Typography.h2, color: Colors.dark.text }}>Add credits</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>

        <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginBottom: 6 }}>Credit type</Text>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.md }}>
          {(["group", "semi_private", "private"] as CreditType[]).map((t) => {
            const active = addType === t;
            return (
              <Pressable
                key={t}
                onPress={() => setAddType(t)}
                style={{
                  flex: 1,
                  paddingVertical: Spacing.sm,
                  borderRadius: 8,
                  alignItems: "center",
                  backgroundColor: active ? `${TYPE_COLOR[t]}30` : `${Colors.dark.text}10`,
                  borderWidth: 1,
                  borderColor: active ? TYPE_COLOR[t] : "transparent",
                }}
              >
                <Text style={{ color: active ? TYPE_COLOR[t] : Colors.dark.text, fontWeight: "700", fontSize: 12 }}>
                  {TYPE_LABEL[t]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginBottom: 6 }}>Number of credits</Text>
        <TextInput
          value={addQty}
          onChangeText={setAddQty}
          keyboardType="number-pad"
          placeholder="4"
          placeholderTextColor={Colors.dark.textMuted}
          style={{
            backgroundColor: `${Colors.dark.text}10`,
            color: Colors.dark.text,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 12,
            fontSize: 16,
            marginBottom: Spacing.md,
          }}
        />

        <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginBottom: 6 }}>
          Price per credit{!isBillingAuthorized ? " (set by academy)" : ""}
        </Text>
        <TextInput
          value={addPrice}
          onChangeText={isBillingAuthorized ? setAddPrice : undefined}
          editable={isBillingAuthorized}
          keyboardType="decimal-pad"
          placeholder={isBillingAuthorized ? "Auto from academy pricing" : "Locked to academy pricing"}
          placeholderTextColor={Colors.dark.textMuted}
          style={{
            backgroundColor: `${Colors.dark.text}10`,
            color: isBillingAuthorized ? Colors.dark.text : Colors.dark.textMuted,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 12,
            fontSize: 16,
            marginBottom: Spacing.md,
            opacity: isBillingAuthorized ? 1 : 0.6,
          }}
        />

        <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginBottom: 6 }}>Payment</Text>
        <View style={{ gap: 8, marginBottom: Spacing.md }}>
          {([
            { key: "cash" as const, label: "Cash (mark paid later)" },
            { key: "bank_transfer" as const, label: "Bank transfer (mark paid later)" },
            ...(isBillingAuthorized
              ? [{ key: "already_paid" as const, label: "Already paid — deposit now" }]
              : []),
          ]).map((opt) => {
            const active = addPayment === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setAddPayment(opt.key)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: Spacing.sm,
                  paddingHorizontal: Spacing.sm,
                  borderRadius: 8,
                  backgroundColor: active ? `${Colors.dark.primary}20` : `${Colors.dark.text}08`,
                  borderWidth: 1,
                  borderColor: active ? Colors.dark.primary : "transparent",
                }}
              >
                <Ionicons
                  name={active ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={active ? Colors.dark.primary : Colors.dark.textMuted}
                />
                <Text style={{ color: Colors.dark.text, fontSize: 13 }}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {totalNum !== null ? (
          <Text style={{ color: Colors.dark.textMuted, fontSize: 12, marginBottom: Spacing.md }}>
            Total: {totalNum.toFixed(2)}
          </Text>
        ) : null}

        {error ? (
          <Text style={{ color: Colors.dark.error, fontSize: 12, marginBottom: Spacing.sm }}>{error}</Text>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={isPending}
          style={{
            paddingVertical: 14,
            borderRadius: 10,
            backgroundColor: Colors.dark.primary,
            alignItems: "center",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={{ color: "#000", fontWeight: "800", fontSize: 14 }}>
              {addPayment === "already_paid" ? "Add credits now" : "Create invoice"}
            </Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

interface RemoveCreditsModalProps {
  visible: boolean;
  onClose: () => void;
  removeType: CreditType;
  setRemoveType: (t: CreditType) => void;
  removeQty: string;
  setRemoveQty: (s: string) => void;
  removeReason: string;
  setRemoveReason: (s: string) => void;
  currentBalance: number;
  onSubmit: () => void;
  isPending: boolean;
  error: string | null;
}

function RemoveCreditsModal({
  visible, onClose, removeType, setRemoveType, removeQty, setRemoveQty,
  removeReason, setRemoveReason, currentBalance, onSubmit, isPending, error,
}: RemoveCreditsModalProps) {
  const qtyNum = parseInt(removeQty, 10);
  const validQty = Number.isFinite(qtyNum) && qtyNum > 0;
  const projected = validQty ? currentBalance - qtyNum : currentBalance;
  const willCreateDebt = validQty && projected < 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.dark.backgroundRoot, padding: Spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.lg }}>
          <Text style={{ ...Typography.h2, color: Colors.dark.text }}>Remove credits</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>

        <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginBottom: 6 }}>Credit type</Text>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.md }}>
          {(["group", "semi_private", "private"] as CreditType[]).map((t) => {
            const active = removeType === t;
            return (
              <Pressable
                key={t}
                onPress={() => setRemoveType(t)}
                style={{
                  flex: 1,
                  paddingVertical: Spacing.sm,
                  borderRadius: 8,
                  alignItems: "center",
                  backgroundColor: active ? `${TYPE_COLOR[t]}30` : `${Colors.dark.text}10`,
                  borderWidth: 1,
                  borderColor: active ? TYPE_COLOR[t] : "transparent",
                }}
              >
                <Text style={{ color: active ? TYPE_COLOR[t] : Colors.dark.text, fontWeight: "700", fontSize: 12 }}>
                  {TYPE_LABEL[t]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginBottom: 6 }}>
          Current balance: {fmtNumber(currentBalance)} {TYPE_LABEL[removeType]}
        </Text>

        <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginBottom: 6, marginTop: Spacing.sm }}>
          Number of credits to remove
        </Text>
        <TextInput
          value={removeQty}
          onChangeText={setRemoveQty}
          keyboardType="number-pad"
          placeholder="1"
          placeholderTextColor={Colors.dark.textMuted}
          style={{
            backgroundColor: `${Colors.dark.text}10`,
            color: Colors.dark.text,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 12,
            fontSize: 16,
            marginBottom: Spacing.md,
          }}
        />

        <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginBottom: 6 }}>
          Reason (optional, shown in history)
        </Text>
        <TextInput
          value={removeReason}
          onChangeText={setRemoveReason}
          placeholder="e.g. Granted to wrong player"
          placeholderTextColor={Colors.dark.textMuted}
          multiline
          style={{
            backgroundColor: `${Colors.dark.text}10`,
            color: Colors.dark.text,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 12,
            fontSize: 14,
            minHeight: 60,
            marginBottom: Spacing.md,
          }}
        />

        {validQty ? (
          <Text
            style={{
              fontSize: 12,
              color: willCreateDebt ? Colors.dark.error : Colors.dark.textMuted,
              marginBottom: Spacing.sm,
              fontWeight: willCreateDebt ? "700" : "400",
            }}
          >
            New balance: {fmtNumber(projected)} {TYPE_LABEL[removeType]}
            {willCreateDebt ? "  ·  This will put the player into debt." : ""}
          </Text>
        ) : null}

        {error ? (
          <Text style={{ color: Colors.dark.error, fontSize: 12, marginBottom: Spacing.sm }}>{error}</Text>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={isPending || !validQty}
          style={{
            paddingVertical: 14,
            borderRadius: 10,
            backgroundColor: Colors.dark.error,
            alignItems: "center",
            opacity: isPending || !validQty ? 0.6 : 1,
          }}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
              Remove credits
            </Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

// Task #1089 — Detail sheet for a single ledger row with an undo affordance
// adapted to the entry type. Confirmation is rendered as a JSX child Modal so
// it stacks correctly on top of the sheet on iOS, Android, and web (per the
// modal stacking convention used by CreditPackagesList / PackagesCard).
interface LedgerEntryDetailSheetProps {
  entry: LedgerEntry | null;
  onClose: () => void;
  currentBalances: { group: number; semi_private: number; private: number };
  lots: LotSummary[];
  canUndoPurchase: boolean;
  canReverseAdjustment: boolean;
  feedback: { kind: "error" | "info"; message: string } | null;
  clearFeedback: () => void;
  onRequestCancelPurchase: (packageId: string, lot: LotSummary | null) => void;
  onRequestReverseAdjustment: (entry: LedgerEntry) => void;
  pendingUndo:
    | { kind: "purchase"; packageId: string; force: boolean; used: number; remaining: number; total: number; typeLabel: string }
    | { kind: "reverse_manual"; entry: LedgerEntry }
    | null;
  cancelPending: () => void;
  confirmPending: () => void;
  isPending: boolean;
  onOpenSession: (sessionId: string) => void;
}

function LedgerEntryDetailSheet({
  entry,
  onClose,
  currentBalances,
  lots,
  canUndoPurchase,
  canReverseAdjustment,
  feedback,
  clearFeedback,
  onRequestCancelPurchase,
  onRequestReverseAdjustment,
  pendingUndo,
  cancelPending,
  confirmPending,
  isPending,
  onOpenSession,
}: LedgerEntryDetailSheetProps) {
  const { t } = useTranslation();
  const visible = !!entry;
  const e = entry;
  const delta = e ? Number(e.delta) : 0;
  const isNegative = delta < 0;
  const note = e ? ledgerNote(e) : null;
  const meta = (e?.metadata || {}) as Record<string, unknown>;
  const sourcePackageId =
    typeof meta.sourcePackageId === "string" ? meta.sourcePackageId : null;

  // Find the lot that this purchase row created so we can show used/remaining.
  const matchedLot = useMemo<LotSummary | null>(() => {
    if (!e || e.reason !== "purchase" || !sourcePackageId) return null;
    return lots.find((l) => l.source_package_id === sourcePackageId) || null;
  }, [e, lots, sourcePackageId]);

  const usedCount = matchedLot
    ? Math.max(0, Number(matchedLot.qty_total) - Number(matchedLot.qty_remaining))
    : 0;
  const remainingCount = matchedLot ? Number(matchedLot.qty_remaining) : Math.abs(delta);

  const creditTypeLabel = e ? (TYPE_LABEL[e.type] || e.type) : "";
  const reasonLabelText = e ? reasonLabel(e.reason, t) : "";

  // Projected balance for a reversal: current ± reversal delta.
  const currentBalForType = e
    ? Number(currentBalances[e.type as CreditType] ?? 0)
    : 0;
  const reversalDelta = e
    ? e.reason === "purchase"
      ? -remainingCount
      : -delta
    : 0;
  const projected = currentBalForType + reversalDelta;
  const willGoNegative = e && reversalDelta !== 0 && projected < 0;

  const rows: { label: string; value: string; color?: string }[] = e
    ? [
        { label: t("coachCredit.history.field.action", "Action"), value: reasonLabelText },
        { label: t("coachCredit.history.field.creditType", "Credit type"), value: creditTypeLabel, color: TYPE_COLOR[e.type] },
        {
          label: t("coachCredit.history.field.amount", "Amount"),
          value: `${isNegative ? "" : "+"}${fmtNumber(delta)}`,
          color: isNegative ? Colors.dark.error : Colors.dark.successNeon,
        },
        { label: t("coachCredit.history.field.when", "When"), value: fmtDateTime(e.occurred_at) },
        {
          label: t("coachCredit.history.field.by", "By"),
          value: e.actor_role ? String(e.actor_role) : t("coachCredit.history.field.bySystem", "system"),
        },
        ...(note ? [{ label: t("coachCredit.history.field.note", "Note"), value: note }] : []),
        ...(e.session_id ? [{ label: t("coachCredit.history.field.linkedSession", "Linked session"), value: e.session_id.slice(0, 8) }] : []),
        ...(sourcePackageId ? [{ label: t("coachCredit.history.field.linkedPackage", "Linked package"), value: sourcePackageId.slice(0, 8) }] : []),
        ...(e.invoice_id ? [{ label: t("coachCredit.history.field.linkedInvoice", "Linked invoice"), value: e.invoice_id.slice(0, 8) }] : []),
      ]
    : [];

  // Adaptive confirmation copy.
  const confirmTitle = (() => {
    if (!pendingUndo) return "";
    if (pendingUndo.kind === "purchase") {
      return pendingUndo.used > 0
        ? t("coachCredit.history.confirm.purchase.titleUsed", "Cancel a partly-used purchase?")
        : t("coachCredit.history.confirm.purchase.title", "Cancel this purchase?");
    }
    return t("coachCredit.history.confirm.manual.title", "Reverse this adjustment?");
  })();

  const confirmBody = (() => {
    if (!pendingUndo || !e) return "";
    if (pendingUndo.kind === "purchase") {
      const base = t("coachCredit.history.confirm.purchase.body", {
        defaultValue:
          "This will delete the {{typeLabel}} package ({{total}} credits) and reverse the {{remaining}} remaining credits from the wallet.",
        typeLabel: pendingUndo.typeLabel,
        total: fmtNumber(pendingUndo.total),
        remaining: fmtNumber(pendingUndo.remaining),
        count: pendingUndo.remaining,
      });
      const usedWarn = pendingUndo.used > 0
        ? "\n\n" + t("coachCredit.history.confirm.purchase.usedWarn", {
            defaultValue:
              "{{used}} of {{total}} credits have already been used. Reversing the unused remainder may push the balance negative.",
            used: fmtNumber(pendingUndo.used),
            total: fmtNumber(pendingUndo.total),
            count: pendingUndo.used,
          })
        : "";
      const negWarn = projected < 0
        ? "\n\n" + t("coachCredit.history.confirm.negativeWarn", {
            defaultValue:
              "New balance will be {{projected}} {{typeLabel}} — the player will be in debt.",
            projected: fmtNumber(projected),
            typeLabel: creditTypeLabel,
          })
        : "";
      const tail = "\n\n" + t("coachCredit.history.confirm.cannotUndo", "This cannot be undone.");
      return `${base}${usedWarn}${negWarn}${tail}`;
    }
    // reverse_manual
    const amt = fmtNumber(Math.abs(delta));
    const base = delta > 0
      ? t("coachCredit.history.confirm.manual.bodyRemove", {
          defaultValue: "This will remove {{amt}} {{typeLabel}} credits as a reversal of the original adjustment.",
          amt, typeLabel: creditTypeLabel, count: Math.abs(delta),
        })
      : t("coachCredit.history.confirm.manual.bodyAdd", {
          defaultValue: "This will add back {{amt}} {{typeLabel}} credits as a reversal of the original adjustment.",
          amt, typeLabel: creditTypeLabel, count: Math.abs(delta),
        });
    const negWarn = projected < 0
      ? "\n\n" + t("coachCredit.history.confirm.negativeWarn", {
          defaultValue: "New balance will be {{projected}} {{typeLabel}} — the player will be in debt.",
          projected: fmtNumber(projected),
          typeLabel: creditTypeLabel,
        })
      : "";
    return `${base}${negWarn}`;
  })();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: Colors.dark.backgroundRoot, padding: Spacing.lg }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: Spacing.lg,
          }}
        >
          <Text style={{ ...Typography.h2, color: Colors.dark.text }}>{t("coachCredit.history.sheetTitle", "History entry")}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>

        {e ? (
          <ScrollView style={{ flex: 1 }}>
            <View>
              {rows.map((r) => (
                <View
                  key={r.label}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: `${Colors.dark.text}10`,
                  }}
                >
                  <Text style={{ fontSize: 13, color: Colors.dark.textMuted }}>{r.label}</Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: r.color || Colors.dark.text,
                      fontWeight: "700",
                      textAlign: "right",
                      flex: 1,
                      marginLeft: Spacing.md,
                    }}
                  >
                    {r.value}
                  </Text>
                </View>
              ))}

              {e.reason === "purchase" && matchedLot ? (
                <View
                  style={{
                    marginTop: Spacing.md,
                    padding: Spacing.sm,
                    borderRadius: 8,
                    backgroundColor: `${Colors.dark.text}08`,
                  }}
                >
                  <Text style={{ fontSize: 12, color: Colors.dark.textMuted }}>
                    {t("coachCredit.history.lotSummary", {
                      defaultValue: "{{used}} used / {{total}} total · {{remaining}} remaining",
                      used: fmtNumber(usedCount),
                      total: fmtNumber(matchedLot.qty_total),
                      remaining: fmtNumber(matchedLot.qty_remaining),
                    })}
                    {matchedLot.invoice_number
                      ? " · " + t("coachCredit.history.invoiceLabel", { defaultValue: "Invoice {{n}}", n: matchedLot.invoice_number })
                      : ""}
                  </Text>
                </View>
              ) : null}

              {e.reason === "consume" ? (
                <View
                  style={{
                    marginTop: Spacing.md,
                    padding: Spacing.sm,
                    borderRadius: 8,
                    backgroundColor: `${Colors.dark.text}08`,
                    borderWidth: 1,
                    borderColor: `${Colors.dark.text}15`,
                  }}
                >
                  <Text style={{ fontSize: 12, color: Colors.dark.text, fontWeight: "700" }}>
                    {t("coachCredit.history.consume.title", "Linked to a session")}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginTop: 4 }}>
                    {t(
                      "coachCredit.history.consume.body",
                      "Consume entries are tied to attendance. To restore these credits, cancel or refund the underlying session — the credit will return through the existing session refund flow.",
                    )}
                  </Text>
                  {e.session_id ? (
                    <Pressable
                      onPress={() => onOpenSession(e.session_id as string)}
                      accessibilityRole="link"
                      accessibilityLabel={t("coachCredit.history.consume.openSessionA11y", "Open the linked session")}
                      style={{
                        marginTop: Spacing.sm,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        alignSelf: "flex-start",
                      }}
                    >
                      <Ionicons name="open-outline" size={14} color={Colors.dark.tint} />
                      <Text style={{ color: Colors.dark.tint, fontSize: 12, fontWeight: "700" }}>
                        {t("coachCredit.history.consume.openSession", "Open session")}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {feedback ? (
                <View
                  style={{
                    marginTop: Spacing.md,
                    padding: Spacing.sm,
                    borderRadius: 8,
                    backgroundColor:
                      feedback.kind === "error"
                        ? `${Colors.dark.error}15`
                        : `${Colors.dark.text}10`,
                    borderWidth: 1,
                    borderColor:
                      feedback.kind === "error"
                        ? `${Colors.dark.error}40`
                        : `${Colors.dark.text}20`,
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <Ionicons
                    name={feedback.kind === "error" ? "alert-circle" : "information-circle"}
                    size={16}
                    color={feedback.kind === "error" ? Colors.dark.error : Colors.dark.textMuted}
                    style={{ marginTop: 1 }}
                  />
                  <Text style={{ flex: 1, fontSize: 12, color: Colors.dark.text }}>
                    {feedback.message}
                  </Text>
                  <Pressable onPress={clearFeedback} hitSlop={8}>
                    <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
                  </Pressable>
                </View>
              ) : null}

              {/* Primary action — purchase */}
              {e.reason === "purchase" && canUndoPurchase ? (
                <Pressable
                  onPress={() => {
                    if (!sourcePackageId) return;
                    onRequestCancelPurchase(sourcePackageId, matchedLot);
                  }}
                  disabled={isPending || !sourcePackageId}
                  style={{
                    marginTop: Spacing.lg,
                    paddingVertical: 14,
                    borderRadius: 10,
                    backgroundColor: Colors.dark.error,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                    opacity: isPending || !sourcePackageId ? 0.6 : 1,
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
                    {t("coachCredit.history.action.cancelPurchase", "Cancel this purchase")}
                  </Text>
                </Pressable>
              ) : null}
              {e.reason === "purchase" && !sourcePackageId ? (
                <Text style={{ marginTop: Spacing.sm, fontSize: 11, color: Colors.dark.textMuted }}>
                  {t(
                    "coachCredit.history.action.noPackageNote",
                    "This purchase has no linked package on file and cannot be cancelled from here.",
                  )}
                </Text>
              ) : null}

              {/* Primary action — manual reversal */}
              {e.reason === "manual" && canReverseAdjustment ? (
                <Pressable
                  onPress={() => onRequestReverseAdjustment(e)}
                  disabled={isPending}
                  style={{
                    marginTop: Spacing.lg,
                    paddingVertical: 14,
                    borderRadius: 10,
                    backgroundColor: Colors.dark.error,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                    opacity: isPending ? 0.6 : 1,
                  }}
                >
                  <Ionicons name="arrow-undo-outline" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
                    {t("coachCredit.history.action.reverseAdjustment", "Reverse this adjustment")}
                  </Text>
                </Pressable>
              ) : null}

              {willGoNegative && (e.reason === "purchase" || e.reason === "manual") ? (
                <Text
                  style={{
                    marginTop: Spacing.sm,
                    fontSize: 12,
                    color: Colors.dark.error,
                    fontWeight: "700",
                  }}
                >
                  {t("coachCredit.history.willGoNegative", {
                    defaultValue: "Reversing will put the {{typeLabel}} balance at {{projected}} (debt).",
                    typeLabel: creditTypeLabel,
                    projected: fmtNumber(projected),
                  })}
                </Text>
              ) : null}

              {!["purchase", "manual", "consume"].includes(e.reason) ? (
                <Text style={{ marginTop: Spacing.lg, fontSize: 12, color: Colors.dark.textMuted }}>
                  {t(
                    "coachCredit.history.informationalOnly",
                    "This entry type is informational and cannot be undone from here.",
                  )}
                </Text>
              ) : null}
            </View>
          </ScrollView>
        ) : null}

        {/* Nested confirmation — JSX child so it stacks above the sheet. */}
        <Modal
          visible={!!pendingUndo}
          animationType="fade"
          transparent
          onRequestClose={cancelPending}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.6)",
              justifyContent: "center",
              alignItems: "center",
              padding: Spacing.lg,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 420,
                backgroundColor: Colors.dark.backgroundSecondary,
                borderRadius: 14,
                padding: Spacing.lg,
              }}
            >
              <Text style={{ ...Typography.h3, color: Colors.dark.text, marginBottom: Spacing.sm }}>
                {confirmTitle}
              </Text>
              <Text style={{ fontSize: 13, color: Colors.dark.textMuted, lineHeight: 19 }}>
                {confirmBody}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: Spacing.sm,
                  marginTop: Spacing.lg,
                  justifyContent: "flex-end",
                }}
              >
                <Pressable
                  onPress={cancelPending}
                  disabled={isPending}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    backgroundColor: `${Colors.dark.text}12`,
                  }}
                >
                  <Text style={{ color: Colors.dark.text, fontWeight: "700", fontSize: 13 }}>{t("common.cancel", "Cancel")}</Text>
                </Pressable>
                <Pressable
                  onPress={confirmPending}
                  disabled={isPending}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    backgroundColor: Colors.dark.error,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    opacity: isPending ? 0.6 : 1,
                  }}
                >
                  {isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{t("common.confirm", "Confirm")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}
