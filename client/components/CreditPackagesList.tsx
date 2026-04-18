import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type CreditType = "group" | "semi_private" | "private";

interface Lot {
  id: string;
  type: CreditType | string;
  qty_total: string | number;
  qty_remaining: string | number;
  price_per_credit: string | number | null;
  expires_at: string | null;
  status: "active" | "depleted" | "expired" | "cancelled" | string;
  created_at: string;
  // Legacy package UUID — required to call DELETE /api/packages/:id.
  // Lots created from "Add credits" carry this; pure V2-native grants do not.
  source_package_id?: string | null;
  // Linked invoice (LEFT JOIN; nullable for non-package lots or unbilled).
  invoice_id?: string | null;
  invoice_number?: string | null;
  invoice_status?: string | null;
  payment_method?: string | null;
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  stripe: "Card",
  already_paid: "Paid",
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  paid: "Paid",
  void: "Void",
  uncollectible: "Uncollectible",
};

interface Props {
  playerId: string;
  currency?: string;
  // Task #696: only billing-authorized roles (coach/academy_owner/admin/platform_owner)
  // see the destructive Delete affordance. Defaults to false so callers must opt in.
  canDelete?: boolean;
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

const STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: "ACTIVE", color: Colors.dark.successNeon },
  depleted: { label: "DEPLETED", color: Colors.dark.textMuted },
  expired: { label: "EXPIRED", color: "#F59E0B" },
  cancelled: { label: "CANCELLED", color: Colors.dark.error },
};

function fmtNumber(n: string | number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
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

function statusOf(lot: Lot): keyof typeof STATUS_META {
  const s = String(lot.status || "").toLowerCase();
  if (s === "active" || s === "depleted" || s === "expired" || s === "cancelled") {
    return s;
  }
  // Fallback: derive from qty_remaining + expiry
  const remaining = Number(lot.qty_remaining);
  if (remaining <= 0) return "depleted";
  if (lot.expires_at && new Date(lot.expires_at).getTime() < Date.now()) return "expired";
  return "active";
}

interface PendingDelete {
  packageId: string;
  force: boolean;
  used: number;
  remaining: number;
  total: number;
  typeLabel: string;
  invoiceNumber: string | null;
}

export function CreditPackagesList({ playerId, currency = "AED", canDelete = false }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Lot | null>(null);
  // Nested confirmation + inline feedback banner state — render the
  // confirmation Modal as a JSX child of the Package details Modal so it
  // stacks correctly on top (per replit.md modal stacking rule). Avoid
  // Alert.alert from inside a presented Modal — the alert renders behind
  // the parent on web (WebAlert overlay) and mis-stacks on iOS pageSheet.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "error" | "info"; message: string } | null>(null);

  const lotsQuery = useQuery<{ playerId: string; lots: Lot[] }>({
    queryKey: [`/api/v2/credits/lots/${playerId}`],
    enabled: !!playerId,
  });

  const lots = lotsQuery.data?.lots ?? [];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/v2/credits/wallet/${playerId}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/v2/credits/lots/${playerId}`] });
    // Broad prefix invalidation so all ledger views refresh regardless of limit.
    queryClient.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && k.startsWith(`/api/v2/credits/ledger/${playerId}`);
      },
    });
    queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
    queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credits-summary`] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/players", playerId, "stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
    queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
  };

  const deleteMutation = useMutation({
    mutationFn: async ({ packageId, force }: { packageId: string; force: boolean }) => {
      const url = force ? `/api/packages/${packageId}?force=true` : `/api/packages/${packageId}`;
      const res = await apiRequest("DELETE", url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete package");
      }
      return data;
    },
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      invalidateAll();
      setPendingDelete(null);
      setFeedback(null);
      setSelected(null);
    },
    onError: (err: Error) => {
      setPendingDelete(null);
      // Inline banner inside the details sheet so the message renders above
      // the parent modal (Alert.alert would land behind it on web).
      setFeedback({ kind: "error", message: err.message || "Could not delete package" });
    },
  });

  const confirmDelete = (lot: Lot) => {
    const pkgId = lot.source_package_id;
    if (!pkgId) {
      setFeedback({
        kind: "info",
        message:
          "This entry was not created from a purchasable package (e.g. a manual adjustment or refund) and can only be reversed via an adjustment.",
      });
      return;
    }
    const total = Number(lot.qty_total);
    const remaining = Number(lot.qty_remaining);
    const used = Math.max(0, total - remaining);
    const typeLabel = TYPE_LABEL[lot.type as string] || String(lot.type);
    // force=true is only required when there are still unused credits the
    // server needs to debit. Depleted/expired/cancelled lots delete cleanly.
    const force = remaining > 0;
    setFeedback(null);
    setPendingDelete({
      packageId: pkgId,
      force,
      used,
      remaining,
      total,
      typeLabel,
      invoiceNumber: lot.invoice_number ?? null,
    });
  };

  const sortedLots = useMemo(() => {
    const order: Record<string, number> = { active: 0, depleted: 1, expired: 2, cancelled: 3 };
    return [...lots].sort((a, b) => {
      const sa = order[statusOf(a)] ?? 9;
      const sb = order[statusOf(b)] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [lots]);

  return (
    <View style={{ marginBottom: Spacing.sm }}>
      <Text
        style={{
          ...Typography.small,
          color: Colors.dark.textMuted,
          marginBottom: 6,
        }}
      >
        Packages ({sortedLots.length})
      </Text>

      {lotsQuery.isLoading ? (
        <View style={{ paddingVertical: Spacing.sm, alignItems: "center" }}>
          <ActivityIndicator color={Colors.dark.primary} />
        </View>
      ) : sortedLots.length === 0 ? (
        <Text
          style={{
            fontSize: 11,
            color: Colors.dark.textMuted,
            paddingVertical: Spacing.sm,
          }}
        >
          No packages yet.
        </Text>
      ) : (
        sortedLots.map((lot) => {
          const total = Number(lot.qty_total);
          const remaining = Number(lot.qty_remaining);
          const used = Math.max(0, total - remaining);
          const status = statusOf(lot);
          const meta = STATUS_META[status];
          const typeColor = TYPE_COLOR[lot.type as string] || Colors.dark.text;
          const ppc = Number(lot.price_per_credit ?? 0);
          const totalPrice = total * ppc;
          const payLabel = lot.payment_method ? PAYMENT_LABEL[lot.payment_method] || lot.payment_method : null;
          return (
            <Pressable
              key={lot.id}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                setSelected(lot);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 8,
                borderRadius: 8,
                marginBottom: 4,
                backgroundColor: `${Colors.dark.text}06`,
                borderLeftWidth: 3,
                borderLeftColor: meta.color,
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Text style={{ fontSize: 13, color: typeColor, fontWeight: "700" }}>
                    {TYPE_LABEL[lot.type as string] || String(lot.type)}
                  </Text>
                  <View
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      borderRadius: 4,
                      backgroundColor: `${meta.color}20`,
                    }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: "800", color: meta.color }}>
                      {meta.label}
                    </Text>
                  </View>
                  {payLabel ? (
                    <View
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        borderRadius: 4,
                        backgroundColor: `${Colors.dark.text}12`,
                      }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: "700", color: Colors.dark.textMuted }}>
                        {payLabel.toUpperCase()}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ fontSize: 11, color: Colors.dark.textMuted, marginTop: 2 }}>
                  {fmtNumber(remaining)}/{fmtNumber(total)} left · {currency} {totalPrice.toFixed(2)}
                </Text>
                <Text style={{ fontSize: 10, color: Colors.dark.textMuted, marginTop: 1 }}>
                  Bought {fmtDate(lot.created_at)}
                  {lot.expires_at ? ` · Exp ${fmtDate(lot.expires_at)}` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          );
        })
      )}

      {/* Package detail sheet — rendered as JSX child so it stacks on top of any
          parent modal it lives inside (per replit.md modal stacking rule). */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setSelected(null);
          setPendingDelete(null);
          setFeedback(null);
        }}
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
            <Text style={{ ...Typography.h2, color: Colors.dark.text }}>Package details</Text>
            <Pressable
              onPress={() => {
                setSelected(null);
                setPendingDelete(null);
                setFeedback(null);
              }}
              hitSlop={10}
            >
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          {selected ? (
            <ScrollView style={{ flex: 1 }}>
              {(() => {
                const total = Number(selected.qty_total);
                const remaining = Number(selected.qty_remaining);
                const used = Math.max(0, total - remaining);
                const status = statusOf(selected);
                const meta = STATUS_META[status];
                const ppc = Number(selected.price_per_credit ?? 0);
                const totalPrice = total * ppc;
                const typeLabel =
                  TYPE_LABEL[selected.type as string] || String(selected.type);
                const payLabel = selected.payment_method
                  ? PAYMENT_LABEL[selected.payment_method] || selected.payment_method
                  : "—";
                const invStatus = selected.invoice_status
                  ? INVOICE_STATUS_LABEL[selected.invoice_status] || selected.invoice_status
                  : null;
                const invoiceVal = selected.invoice_number
                  ? `${selected.invoice_number}${invStatus ? ` (${invStatus})` : ""}`
                  : "No invoice";
                const rows: { label: string; value: string; color?: string }[] = [
                  { label: "Type", value: typeLabel, color: TYPE_COLOR[selected.type as string] },
                  { label: "Status", value: meta.label, color: meta.color },
                  { label: "Credits", value: `${fmtNumber(used)} used / ${fmtNumber(total)} total` },
                  { label: "Remaining", value: fmtNumber(remaining) },
                  {
                    label: "Price",
                    value: `${currency} ${totalPrice.toFixed(2)} (${currency} ${ppc.toFixed(2)}/credit)`,
                  },
                  { label: "Payment", value: payLabel },
                  { label: "Invoice", value: invoiceVal },
                  { label: "Purchased", value: fmtDate(selected.created_at) },
                  { label: "Expires", value: selected.expires_at ? fmtDate(selected.expires_at) : "No expiry" },
                ];
                return (
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
                        <Text style={{ fontSize: 13, color: Colors.dark.textMuted }}>
                          {r.label}
                        </Text>
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

                    {used > 0 ? (
                      <View
                        style={{
                          marginTop: Spacing.md,
                          padding: Spacing.sm,
                          borderRadius: 8,
                          backgroundColor: `${Colors.dark.error}15`,
                          borderWidth: 1,
                          borderColor: `${Colors.dark.error}30`,
                        }}
                      >
                        <Text style={{ fontSize: 12, color: Colors.dark.error, fontWeight: "700" }}>
                          Heads up
                        </Text>
                        <Text style={{ fontSize: 12, color: Colors.dark.text, marginTop: 4 }}>
                          {fmtNumber(used)} credit{used === 1 ? "" : "s"} from this package have already been used.
                          Deleting will reverse the {fmtNumber(remaining)} remaining credit{remaining === 1 ? "" : "s"} from the wallet.
                        </Text>
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
                        <Pressable onPress={() => setFeedback(null)} hitSlop={8}>
                          <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
                        </Pressable>
                      </View>
                    ) : null}

                    {canDelete ? (
                      <Pressable
                        onPress={() => confirmDelete(selected)}
                        disabled={deleteMutation.isPending}
                        style={{
                          marginTop: Spacing.lg,
                          paddingVertical: 14,
                          borderRadius: 10,
                          backgroundColor: Colors.dark.error,
                          alignItems: "center",
                          flexDirection: "row",
                          justifyContent: "center",
                          gap: 8,
                          opacity: deleteMutation.isPending ? 0.6 : 1,
                        }}
                      >
                        {deleteMutation.isPending ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="trash-outline" size={18} color="#fff" />
                            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
                              Delete package
                            </Text>
                          </>
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                );
              })()}
            </ScrollView>
          ) : null}

          {/* Nested confirmation — rendered as a JSX child of the Package
              details Modal so it stacks on top of the details sheet on iOS,
              Android, and web. Mirrors the convention used by PackagesCard. */}
          <Modal
            visible={!!pendingDelete}
            animationType="fade"
            transparent
            onRequestClose={() => setPendingDelete(null)}
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
                  {pendingDelete && pendingDelete.used > 0 ? "Delete used package?" : "Delete package?"}
                </Text>
                {pendingDelete ? (
                  <Text style={{ fontSize: 13, color: Colors.dark.textMuted, lineHeight: 19 }}>
                    {`This will remove the ${pendingDelete.typeLabel} package (${fmtNumber(
                      pendingDelete.total,
                    )} credits).${
                      pendingDelete.invoiceNumber
                        ? ` Invoice ${pendingDelete.invoiceNumber} will be detached.`
                        : ""
                    } This cannot be undone.`}
                    {pendingDelete.used > 0
                      ? `\n\n${fmtNumber(pendingDelete.used)} of ${fmtNumber(pendingDelete.total)} credit${
                          pendingDelete.used === 1 ? "" : "s"
                        } were already used. Deleting will reverse the remaining ${fmtNumber(
                          pendingDelete.remaining,
                        )} from the wallet too.`
                      : ""}
                  </Text>
                ) : null}
                <View
                  style={{
                    flexDirection: "row",
                    gap: Spacing.sm,
                    marginTop: Spacing.lg,
                    justifyContent: "flex-end",
                  }}
                >
                  <Pressable
                    onPress={() => setPendingDelete(null)}
                    disabled={deleteMutation.isPending}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      backgroundColor: `${Colors.dark.text}12`,
                    }}
                  >
                    <Text style={{ color: Colors.dark.text, fontWeight: "700", fontSize: 13 }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!pendingDelete) return;
                      deleteMutation.mutate({
                        packageId: pendingDelete.packageId,
                        force: pendingDelete.force,
                      });
                    }}
                    disabled={deleteMutation.isPending}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      backgroundColor: Colors.dark.error,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      opacity: deleteMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    {deleteMutation.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons name="trash-outline" size={14} color="#fff" />
                    )}
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </Modal>
    </View>
  );
}

export default CreditPackagesList;
