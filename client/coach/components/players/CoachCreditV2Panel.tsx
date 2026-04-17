import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, Typography } from "@/constants/theme";

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
  const [showLedger, setShowLedger] = useState(false);

  const walletQuery = useQuery<WalletData>({
    queryKey: [`/api/v2/credits/wallet/${playerId}`],
    enabled: !!playerId,
  });

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

      {wallet.activeLots.length > 0 ? (
        <View style={{ marginBottom: Spacing.sm }}>
          <Text
            style={{
              ...Typography.small,
              color: Colors.dark.textMuted,
              marginBottom: 4,
            }}
          >
            Active packages ({wallet.activeLots.length})
          </Text>
          {wallet.activeLots.slice(0, 6).map((lot) => {
            const expiringSoon =
              !!lot.expires_at &&
              new Date(lot.expires_at).getTime() - Date.now() < EXPIRING_SOON_MS;
            return (
              <View
                key={lot.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: `${Colors.dark.text}10`,
                }}
              >
                <Text
                  style={{ fontSize: 12, color: Colors.dark.text, flex: 1 }}
                >
                  {fmtNumber(lot.qty_remaining)}/{fmtNumber(lot.qty_total)}{" "}
                  {TYPE_LABEL[lot.type] || lot.type}
                </Text>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  {expiringSoon ? (
                    <View
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                        backgroundColor: `${Colors.dark.gold}25`,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 9,
                          fontWeight: "800",
                          color: Colors.dark.gold,
                        }}
                      >
                        EXPIRING SOON
                      </Text>
                    </View>
                  ) : null}
                  <Text
                    style={{
                      fontSize: 11,
                      color: expiringSoon
                        ? Colors.dark.gold
                        : Colors.dark.textMuted,
                    }}
                  >
                    {lot.expires_at
                      ? `Exp ${fmtDate(lot.expires_at)}`
                      : "No expiry"}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text
          style={{
            fontSize: 11,
            color: Colors.dark.textMuted,
            marginBottom: Spacing.sm,
          }}
        >
          No active packages. Total balance: {fmtNumber(totalActive)}
        </Text>
      )}

      <Pressable
        onPress={() => setShowLedger((v) => !v)}
        style={{
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
                        ? Colors.dark.dangerRed
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
