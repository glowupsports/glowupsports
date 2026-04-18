import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Modal, TextInput, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing, Typography } from "@/constants/theme";
import { CreditPackagesList } from "@/components/CreditPackagesList";

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

export function useV2Enabled(playerId: string | undefined): boolean {
  const q = useQuery<WalletData>({
    queryKey: [`/api/v2/credits/wallet/${playerId}`],
    enabled: !!playerId,
  });
  return q.data?.v2Enabled === true;
}

interface Props {
  playerId: string;
}

export function CoachCreditV2Panel({ playerId }: Props) {
  const { user } = useAuth();
  const isBillingAuthorized = !!user && ["academy_owner", "admin", "platform_owner"].includes(user.role);

  const [showLedger, setShowLedger] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<CreditType>("group");
  const [addQty, setAddQty] = useState("4");
  const [addPrice, setAddPrice] = useState("");
  const [addPayment, setAddPayment] = useState<"cash" | "bank_transfer" | "already_paid">("cash");
  const [addError, setAddError] = useState<string | null>(null);
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
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Failed to add credits");
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
      setShowAddModal(false);
      setAddError(null);
    },
    onError: (err: Error) => {
      setAddError(err.message);
    },
  });

  const openAddModal = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setAddError(null);
    setAddQty("4");
    setAddPrice("");
    setAddPayment("cash");
    setAddType("group");
    setShowAddModal(true);
  };

  // Auto-fill price when type changes (or pricing loads).
  React.useEffect(() => {
    if (!showAddModal) return;
    if (addPrice.trim()) return;
    const lookup = addType === "semi_private" ? "semi" : addType;
    const row = pricingQuery.data?.find((p) => p.sessionType === lookup);
    if (row && parseFloat(row.pricePerSession) > 0) {
      setAddPrice(parseFloat(row.pricePerSession).toFixed(2));
    }
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
        {(["group", "semi_private", "private"] as CreditType[]).map((t) => (
          <View
            key={t}
            style={{
              flex: 1,
              padding: Spacing.sm,
              borderRadius: 10,
              backgroundColor: `${TYPE_COLOR[t]}15`,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: TYPE_COLOR[t],
              }}
            >
              {fmtNumber(wallet.balance[t])}
            </Text>
            <Text style={{ fontSize: 10, color: Colors.dark.textMuted }}>
              {TYPE_LABEL[t]}
            </Text>
          </View>
        ))}
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
      <CreditPackagesList playerId={playerId} />

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
                <View
                  key={e.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    paddingVertical: 6,
                    borderBottomWidth: 1,
                    borderBottomColor: `${Colors.dark.text}08`,
                  }}
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
                </View>
              );
            })
          )}
        </View>
      ) : null}
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
